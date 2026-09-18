from fastapi import APIRouter, HTTPException, UploadFile, File
from sqlmodel import Session, select
from backend.app.db.session import engine
from backend.app.models.recipe import Recipe
from backend.app.models.scan import RecipeScan
from backend.app.services.handwriting_ocr import paddle_ocr_image_to_lines
from backend.app.services.ollama_recipe_vision import read_recipe_with_ollama
from fastapi import Query
from io import BytesIO
from PIL import Image, ImageOps, ImageFilter
from pathlib import Path
import uuid
import pytesseract

# If you use iPhone HEIC/HEIF, this makes Pillow able to open those files.
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass

from backend.app.services.ocr_parser import parse_ocr_to_recipe

router = APIRouter()


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
    mode: str = Query("printed", pattern="^(printed|handwritten)$"),
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

    try:
        # 1) Read uploaded file
        raw = await file.read()

        # 2) Open image
        img = Image.open(BytesIO(raw))

        img = ImageOps.exif_transpose(img).convert("RGB")

        scale = 2
        img2 = img.resize((img.width * scale, img.height * scale), Image.Resampling.LANCZOS)

        # save this version for handwriting mode

        UPLOAD_DIR = Path("backend/data/uploads")
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        saved_path = UPLOAD_DIR / f"scan_{uuid.uuid4().hex}.jpg"
        img.save(saved_path)

        # 3) Parse OCR text
        # Save: handwritten gets the cleaned image, printed gets original RGB
        if mode == "handwritten":
            img.save(saved_path)
        else:
            img.save(saved_path)

        if mode == "handwritten":
            try:
                vision_result = read_recipe_with_ollama(str(saved_path))

                return {
                    "scan_id": None,
                    "title": vision_result["title"],
                    "ingredients": vision_result["ingredients"],
                    "steps": vision_result["steps"],
                    "notes": vision_result["notes"],
                    "raw_text": vision_result["raw_model_response"],
                    "mode": mode,
                    "handwriting_profile_id": handwriting_profile_id,
                    "confidence": "medium",
                    "uncertain_lines": vision_result["uncertain_words"],
                }

            except Exception as vision_error:
                print("OLLAMA_VISION_FAILED:", vision_error)

                lines = paddle_ocr_image_to_lines(str(saved_path))
                text = "\n".join(lines)

        else:
            config = "--oem 1 --psm 4"
            text = pytesseract.image_to_string(img, lang="eng", config=config)

        title, ingredients, steps = parse_ocr_to_recipe(text)

        parsed_recipe = {
            "title": title,
            "ingredients": ingredients,
            "steps": steps,
        }

        uncertain_lines = []
        if not ingredients:
            uncertain_lines.append("No ingredients detected")
        if not steps:
            uncertain_lines.append("No steps detected")
        if len(text.strip()) < 20:
            uncertain_lines.append("Very little OCR text detected")

        confidence = "high"
        if uncertain_lines:
            confidence = "low" if len(uncertain_lines) >= 2 else "medium"
        if mode == "handwritten" and text.count("\n") < 2:
            confidence = "low"

        scan = RecipeScan(
            image_path=str(saved_path),
            mode=mode,
            handwriting_profile_id=handwriting_profile_id,
            raw_text=text,
            parsed_recipe=parsed_recipe,
            uncertain_lines=uncertain_lines,
            confidence=confidence,
        )
        with Session(engine) as session:
            session.add(scan)
            session.commit()
            session.refresh(scan)

        return {
            "scan_id": scan.id,
            "title": title,
            "ingredients": ingredients,
            "steps": steps,
            "raw_text": text,
            "mode": mode,
            "handwriting_profile_id": handwriting_profile_id,
            "confidence": confidence,
            "uncertain_lines": uncertain_lines,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR scan failed: {e}")
