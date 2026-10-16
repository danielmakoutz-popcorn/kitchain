from fastapi import APIRouter, HTTPException, UploadFile, File
from sqlmodel import Session, select
from backend.app.db.session import engine
from backend.app.models.recipe import Recipe
from backend.app.models.scan import RecipeScan
from backend.app.models.handwriting_profile import HandwritingProfile
from backend.app.services.ollama_recipe_vision import read_recipe_with_ollama
from fastapi import Query
from starlette.concurrency import run_in_threadpool
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError
from pathlib import Path
from typing import Literal
import logging
import uuid
import requests

# If you use iPhone HEIC/HEIF, this makes Pillow able to open those files.
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_SCAN_BYTES = 20 * 1024 * 1024


@router.post("/", response_model=Recipe)
def create_recipe(recipe: Recipe):
    with Session(engine) as session:
        session.add(recipe)
        session.commit()
        session.refresh(recipe)
        return recipe


@router.get("/", response_model=list[Recipe])
def list_recipes():
    with Session(engine) as session:
        return session.exec(select(Recipe)).all()

@router.post("/{recipe_id}/photo")
async def upload_recipe_photo(recipe_id: int, file: UploadFile = File(...)):
    allowed = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }

    if file.content_type not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")

    with Session(engine) as session:
        recipe = session.get(Recipe, recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        raw = await file.read()

        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")

        photo_dir = Path("backend/data/recipe_photos")
        photo_dir.mkdir(parents=True, exist_ok=True)

        filename = f"recipe_{recipe_id}_{uuid.uuid4().hex}.jpg"
        saved_path = photo_dir / filename

        img.thumbnail((1600, 1600))
        img.save(saved_path, quality=90)

        recipe.image_path = f"/recipe_photos/{filename}"

        session.add(recipe)
        session.commit()
        session.refresh(recipe)

        return recipe

@router.get("/{recipe_id}", response_model=Recipe)
def get_recipe(recipe_id: int):
    with Session(engine) as session:
        recipe = session.get(Recipe, recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return recipe

@router.patch("/{recipe_id}", response_model=Recipe)
def update_recipe(recipe_id: int, updated_recipe: Recipe):
    with Session(engine) as session:
        recipe = session.get(Recipe, recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        recipe.title = updated_recipe.title
        recipe.description = updated_recipe.description
        recipe.instructions = updated_recipe.instructions
        recipe.ingredients = updated_recipe.ingredients
        recipe.steps = updated_recipe.steps
        recipe.handwriting_profile_id = updated_recipe.handwriting_profile_id

        session.add(recipe)
        session.commit()
        session.refresh(recipe)
        return recipe


@router.delete("/{recipe_id}")
def delete_recipe(recipe_id: int):
    with Session(engine) as session:
        recipe = session.get(Recipe, recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        session.delete(recipe)
        session.commit()
        return {"ok": True, "deleted_id": recipe_id}

@router.post("/scan")
async def scan_recipe_photo(
    file: UploadFile = File(...),
    mode: Literal["handwritten"] = Query("handwritten"),
    handwriting_profile_id: int | None = Query(default=None),
):
    allowed = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }
    if file.content_type not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")

    if handwriting_profile_id is not None:
        with Session(engine) as session:
            if not session.get(HandwritingProfile, handwriting_profile_id):
                raise HTTPException(status_code=404, detail="Handwriting profile not found")

    raw = await file.read(MAX_SCAN_BYTES + 1)
    if len(raw) > MAX_SCAN_BYTES:
        raise HTTPException(status_code=413, detail="Choose a recipe photo smaller than 20 MB.")
    if not raw:
        raise HTTPException(status_code=400, detail="The photo is empty. Choose another image.")
    try:
        with Image.open(BytesIO(raw)) as original:
            img = ImageOps.exif_transpose(original).convert("RGB")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="The image dimensions are too large. Choose a smaller photo.")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Could not read this photo. Try exporting it as JPEG or PNG.")

    upload_dir = Path("backend/data/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved_path = upload_dir / f"scan_{uuid.uuid4().hex}.jpg"
    persisted = False
    try:
        img.save(saved_path)
        try:
            # The same local model, prompt and image preparation; keep other routes responsive.
            vision_result = await run_in_threadpool(read_recipe_with_ollama, str(saved_path))
        except requests.Timeout:
            raise HTTPException(status_code=504, detail="The local AI took too long. Try scanning again.")
        except requests.ConnectionError:
            raise HTTPException(status_code=503, detail="The local AI is unavailable. Start Ollama and try again.")
        except requests.RequestException:
            raise HTTPException(status_code=502, detail="The local AI could not finish. Check that qwen2.5vl:3b is installed and try again.")
        except (ValueError, TypeError, KeyError):
            raise HTTPException(status_code=502, detail="The AI returned an unreadable recipe. Try a clearer photo or scan again.")

        parsed_recipe = {key: vision_result[key] for key in ("title", "ingredients", "steps", "notes")}
        uncertain_lines = list(vision_result["uncertain_words"])
        if not parsed_recipe["ingredients"]:
            uncertain_lines.append("No ingredients detected")
        if not parsed_recipe["steps"]:
            uncertain_lines.append("No steps detected")
        # A review hint, not an accuracy score. Keep the AI path's conservative default.
        confidence = "low" if not parsed_recipe["ingredients"] or not parsed_recipe["steps"] else "medium"

        scan = RecipeScan(
            image_path=str(saved_path),
            mode=mode,
            handwriting_profile_id=handwriting_profile_id,
            raw_text=vision_result["raw_model_response"],
            parsed_recipe=parsed_recipe,
            uncertain_lines=uncertain_lines,
            confidence=confidence,
        )
        with Session(engine) as session:
            session.add(scan)
            session.commit()
            session.refresh(scan)
            scan_id = scan.id
        persisted = True

        return {
            "scan_id": scan_id,
            **parsed_recipe,
            "raw_text": vision_result["raw_model_response"],
            "mode": mode,
            "handwriting_profile_id": handwriting_profile_id,
            "confidence": confidence,
            "uncertain_lines": uncertain_lines,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Could not save recipe scan")
        raise HTTPException(status_code=500, detail="Could not save this scan. Please try again.")
    finally:
        img.close()
        if not persisted:
            saved_path.unlink(missing_ok=True)
