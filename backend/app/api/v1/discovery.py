"""Local beta discovery and explicitly public recipe catalog.

Family routes remain on the existing trusted-LAN server. Community tokens identify
beta cooks for contributions/ratings; they are not internet user accounts.
"""
from datetime import datetime, timezone
import hashlib
import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.app.core.settings import settings
from backend.app.db.session import engine
from backend.app.discovery_schemas import MemberCreate, RatingInput, NutritionInput, RecommendInput, ImportInput, PublishInput
from backend.app.models.recipe import Recipe
from backend.app.models.discovery import CommunityMember, NutritionFood, PublicRecipe, RecipeInfo, RecipeRating, SearchUsage
from backend.app.services import text_ai
from backend.app.services.discovery import catalog_candidates, nutrition_summary, save_web_recipe, web_search
from backend.app.services.nutrition import calculate, food_candidates, ingredient_hash, normalized, parse_ingredient
from backend.app.services.recipe_reader import canonical_url, read_recipe, PageReadError

router = APIRouter()


def member_from_header(authorization: str | None) -> CommunityMember | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    with Session(engine) as session:
        return session.exec(select(CommunityMember).where(CommunityMember.token_hash == digest)).first()


def current_member(authorization: str | None = Header(default=None)) -> CommunityMember:
    member = member_from_header(authorization)
    if member is None:
        raise HTTPException(401, "Create a local cook profile before searching, sharing or rating.")
    return member


def public_view(session: Session, recipe: PublicRecipe, member: CommunityMember | None = None):
    average, count = session.exec(select(func.avg(RecipeRating.stars), func.count()).where(RecipeRating.recipe_id == recipe.id)).one()
    own = session.get(RecipeRating, (recipe.id, member.id)) if member else None
    return {key: getattr(recipe, key) for key in ("id", "title", "source_url", "source_name", "source_author", "license_url", "reuse_status", "ingredients", "ingredient_names", "steps", "servings", "total_minutes", "nutrition", "created_at")} | {
        "rating_average": round(average, 2) if count else None, "rating_count": count,
        "my_rating": own.stars if own else None,
        "can_remove": bool(member and recipe.contributor_id == member.id),
        "can_copy": recipe.reuse_status in {"licensed", "contributed"},
    }


@router.post("/community/members", status_code=201)
def create_member(payload: MemberCreate):
    token = secrets.token_urlsafe(40)
    member = CommunityMember(id=uuid.uuid4().hex, token_hash=hashlib.sha256(token.encode()).hexdigest(), name=payload.name.strip() or "Home cook")
    with Session(engine) as session:
        session.add(member)
        session.commit()
        return {"id": member.id, "name": member.name, "token": token}


@router.get("/community/me")
def get_member(member: CommunityMember = Depends(current_member)):
    return {"id": member.id, "name": member.name}


@router.get("/nutrition/status")
def nutrition_status():
    with Session(engine) as session:
        return {"foods": session.exec(select(func.count()).select_from(NutritionFood)).one(), "source": "USDA FoodData Central", "release": "SR Legacy, April 2018", "license": "CC0-1.0"}


@router.get("/nutrition/foods")
def find_foods(q: str = Query(min_length=1, max_length=120), limit: int = Query(default=6, ge=1, le=20)):
    with Session(engine) as session:
        return food_candidates(session, q, limit)


def get_family_recipe(session, recipe_id):
    recipe = session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(404, "Recipe not found")
    return recipe


def recipe_nutrition(session, recipe, info):
    current_hash = ingredient_hash(recipe.ingredients)
    valid = bool(info and info.ingredient_hash == current_hash)
    data = calculate(session, recipe.ingredients, info.servings if info else None, info.overrides if valid else {})
    data["saved_overrides"] = info.overrides if valid else {}
    data["matches_reset"] = bool(info and info.ingredient_hash and not valid)
    data["provenance"] = {key: getattr(info, key) for key in ("source_url", "source_name", "source_author", "license_url", "public_id")} if info else None
    return data


@router.get("/nutrition/recipes/{recipe_id}")
def get_nutrition(recipe_id: int):
    with Session(engine) as session:
        recipe = get_family_recipe(session, recipe_id)
        return recipe_nutrition(session, recipe, session.get(RecipeInfo, recipe_id))


@router.get("/nutrition/recipes/{recipe_id}/source")
def get_recipe_source(recipe_id: int):
    with Session(engine) as session:
        get_family_recipe(session, recipe_id)
        info = session.get(RecipeInfo, recipe_id)
        return {key: getattr(info, key) for key in ("source_url", "source_name", "source_author", "license_url", "public_id")} if info else None


@router.put("/nutrition/recipes/{recipe_id}")
def save_nutrition(recipe_id: int, payload: NutritionInput):
    with Session(engine) as session:
        recipe = get_family_recipe(session, recipe_id)
        if payload.ingredient_hash != ingredient_hash(recipe.ingredients):
            raise HTTPException(409, "The ingredient list changed. Reopen nutrition and review the new matches before saving.")
        for key, value in payload.overrides.items():
            if not key.isdecimal() or not 0 <= int(key) < len(recipe.ingredients) or str(int(key)) != key:
                raise HTTPException(422, "An ingredient correction does not match this recipe.")
            if value.food_id and not session.get(NutritionFood, value.food_id):
                raise HTTPException(422, "The selected USDA food was not found.")
        info = session.get(RecipeInfo, recipe_id) or RecipeInfo(recipe_id=recipe_id)
        info.servings, info.ingredient_hash = payload.servings, payload.ingredient_hash
        info.overrides = {key: value.model_dump(exclude_none=True) for key, value in payload.overrides.items()}
        session.add(info)
        session.commit()
        return recipe_nutrition(session, recipe, info)


@router.get("/public/recipes")
def list_public(q: str = Query(default="", max_length=120), order: str = Query(default="newest", pattern="^(newest|rating)$"), limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0), authorization: str | None = Header(default=None)):
    member = member_from_header(authorization)
    with Session(engine) as session:
        statement = select(PublicRecipe)
        if q.strip():
            statement = statement.where(PublicRecipe.title.contains(q.strip(), autoescape=True))
        if order == "rating":
            averages = select(RecipeRating.recipe_id, func.avg(RecipeRating.stars).label("average"), func.count().label("votes")).group_by(RecipeRating.recipe_id).subquery()
            statement = statement.outerjoin(averages, averages.c.recipe_id == PublicRecipe.id).order_by(averages.c.average.desc(), averages.c.votes.desc(), PublicRecipe.id.desc())
        else:
            statement = statement.order_by(PublicRecipe.id.desc())
        return [public_view(session, item, member) for item in session.exec(statement.offset(offset).limit(limit)).all()]


@router.get("/public/recipes/{recipe_id}")
def get_public(recipe_id: int, authorization: str | None = Header(default=None)):
    member = member_from_header(authorization)
    with Session(engine) as session:
        recipe = session.get(PublicRecipe, recipe_id)
        if not recipe:
            raise HTTPException(404, "Public recipe not found")
        return public_view(session, recipe, member)


@router.put("/public/recipes/{recipe_id}/rating")
def rate_recipe(recipe_id: int, payload: RatingInput, member: CommunityMember = Depends(current_member)):
    with Session(engine) as session:
        if not session.get(PublicRecipe, recipe_id):
            raise HTTPException(404, "Public recipe not found")
        rating = session.get(RecipeRating, (recipe_id, member.id)) or RecipeRating(recipe_id=recipe_id, member_id=member.id, stars=payload.stars)
        rating.stars, rating.updated_at = payload.stars, datetime.utcnow()
        session.add(rating)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            rating = session.get(RecipeRating, (recipe_id, member.id))
            if not rating:
                raise HTTPException(409, "The recipe changed while you were rating it. Try again.")
            rating.stars = payload.stars
            session.add(rating)
            session.commit()
        return public_view(session, session.get(PublicRecipe, recipe_id), member)


@router.delete("/public/recipes/{recipe_id}/rating")
def remove_rating(recipe_id: int, member: CommunityMember = Depends(current_member)):
    with Session(engine) as session:
        rating = session.get(RecipeRating, (recipe_id, member.id))
        if rating:
            session.delete(rating)
            session.commit()
        return {"ok": True}


@router.post("/public/from-family/{recipe_id}")
def publish_family(recipe_id: int, payload: PublishInput, member: CommunityMember = Depends(current_member)):
    with Session(engine) as session:
        recipe = get_family_recipe(session, recipe_id)
        info = session.get(RecipeInfo, recipe_id)
        if info and (info.source_url or info.public_id):
            raise HTTPException(409, "This is an imported recipe. Its existing public source card keeps the original credit; it cannot be published as your own.")
        # A legacy SQLite recipe ID can be reused after deleting the last card.
        # Include its creation time so a new card cannot inherit an old public snapshot.
        key = "contribution:" + hashlib.sha256(f"{recipe.id}:{recipe.created_at.isoformat()}".encode()).hexdigest()
        public = session.exec(select(PublicRecipe).where(PublicRecipe.source_key == key)).first()
        if public and public.contributor_id != member.id:
            raise HTTPException(409, "This family recipe has already been shared by another cook.")
        if not recipe.ingredients or not recipe.steps:
            raise HTTPException(422, "Add ingredients and directions before sharing this recipe.")
        public = public or PublicRecipe(source_key=key, title=recipe.title, source_name=member.name, contributor_id=member.id)
        public.title, public.ingredients, public.steps = recipe.title, recipe.ingredients, recipe.steps
        public.ingredient_names = [normalized(parse_ingredient(line)["name"]) for line in recipe.ingredients]
        public.reuse_status = "contributed"
        public.servings = payload.servings or (info.servings if info else None)
        overrides = info.overrides if info and info.ingredient_hash == ingredient_hash(recipe.ingredients) else {}
        public.nutrition = nutrition_summary(calculate(session, recipe.ingredients, public.servings, overrides))
        session.add(public)
        session.commit()
        session.refresh(public)
        return public_view(session, public, member)


@router.delete("/public/recipes/{recipe_id}")
def unpublish(recipe_id: int, member: CommunityMember = Depends(current_member)):
    with Session(engine) as session:
        recipe = session.get(PublicRecipe, recipe_id)
        if not recipe or recipe.contributor_id != member.id:
            raise HTTPException(404, "Your shared recipe was not found")
        for rating in session.exec(select(RecipeRating).where(RecipeRating.recipe_id == recipe_id)).all():
            session.delete(rating)
        session.flush()
        session.delete(recipe)
        session.commit()
        return {"ok": True}


@router.post("/public/recipes/{recipe_id}/copy", status_code=201)
def copy_public(recipe_id: int, member: CommunityMember = Depends(current_member)):
    with Session(engine) as session:
        public = session.get(PublicRecipe, recipe_id)
        if not public:
            raise HTTPException(404, "Public recipe not found")
        if public.reuse_status == "link_only":
            raise HTTPException(409, "This recipe is available at its source website. Full copying has not been permitted by the publisher.")
        recipe = Recipe(title=public.title, ingredients=public.ingredients, steps=public.steps, instructions="\n\n".join(public.steps))
        session.add(recipe)
        session.flush()
        session.add(RecipeInfo(recipe_id=recipe.id, servings=public.servings, source_url=public.source_url, source_name=public.source_name, source_author=public.source_author, license_url=public.license_url, public_id=public.id))
        session.commit()
        session.refresh(recipe)
        return recipe


@router.post("/discovery/import")
def import_link(payload: ImportInput, member: CommunityMember = Depends(current_member)):
    try:
        url = canonical_url(payload.url)
        with Session(engine) as session:
            existing = session.exec(select(PublicRecipe).where(PublicRecipe.source_key == hashlib.sha256(url.encode()).hexdigest())).first()
            if existing:
                return public_view(session, existing, member)
        data = read_recipe(url)
    except (PageReadError, ValueError, RecursionError) as error:
        raise HTTPException(422, str(error) if isinstance(error, PageReadError) else "Could not read this recipe page.")
    with Session(engine) as session:
        return public_view(session, save_web_recipe(session, data), member)


@router.get("/discovery/status")
def discovery_status():
    with Session(engine) as session:
        usage = session.get(SearchUsage, f"tavily:{datetime.now(timezone.utc):%Y-%m}")
        limit = max(0, min(settings.SEARCH_MONTHLY_CREDITS, 1000))
        return {"provider": "tavily", "configured": bool(settings.TAVILY_API_KEY), "monthly_limit": limit, "monthly_used": usage.used if usage else 0, "text_ai_enabled": settings.TEXT_AI_ENABLED, "text_ai_model": settings.TEXT_AI_MODEL}


@router.post("/discovery/recommendations")
def recommend(payload: RecommendInput, member: CommunityMember = Depends(current_member)):
    meaning = text_ai.understand(payload.query)
    warnings = [] if meaning else ["The text AI is unavailable or disabled. Using ingredient and keyword matching."]
    with Session(engine) as session:
        candidates = catalog_candidates(session, payload, meaning)
    searched = False
    if payload.allow_web and (not candidates or candidates[0]["score"] < .55):
        query = payload.query
        if payload.pantry:
            query += " using " + ", ".join(payload.pantry[:8])
        if payload.excluded:
            query += " without " + ", ".join(payload.excluded[:8])
        _, notices, searched = web_search(engine, query[:400], member.id)
        warnings.extend(notices)
        with Session(engine) as session:
            candidates = catalog_candidates(session, payload, meaning)
    ranked = text_ai.rerank(payload.query, candidates[:8]) if meaning and len(candidates) > 1 else []
    if ranked:
        order = {key: i for i, key in enumerate(ranked)}
        candidates.sort(key=lambda item: (order.get(item["key"], 99), -item["score"]))
    choices = candidates[:3]
    with Session(engine) as session:
        for choice in choices:
            if choice["kind"] == "public":
                public = session.get(PublicRecipe, choice["id"])
                view = public_view(session, public, member)
                choice["rating_average"], choice["rating_count"] = view["rating_average"], view["rating_count"]
            else:
                choice["rating_average"], choice["rating_count"] = None, 0
    return {"choices": choices, "searched_web": searched, "text_ai_used": meaning is not None, "warnings": warnings,
        "notice": "Recommendations use the recorded ingredients. Missing ingredients and macros are estimates; check the source and labels for allergies. Recipes with unknown time or nutrition are excluded when those limits are requested.", "usage": discovery_status()}
