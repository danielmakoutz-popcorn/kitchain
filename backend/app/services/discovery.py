from datetime import datetime, timedelta, timezone
import hashlib
import re
import logging
from urllib.parse import urlsplit

from fastapi import HTTPException
import requests
from sqlalchemy import update, func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.app.core.settings import settings
from backend.app.models.recipe import Recipe
from backend.app.models.discovery import PublicRecipe, RecipeInfo, RecipeRating, SearchCache, SearchUsage, SearchSourceReport
from backend.app.services.nutrition import calculate, ingredient_hash, normalized, parse_ingredient
from backend.app.services.recipe_reader import canonical_url, read_recipe, PageReadError, plain
from backend.app.services import text_ai

STOPWORDS = set("i me my we us a an the and or with without for to from of in on some something recipe recipes meal meals dinner lunch breakfast want would like please make cook find easy good quick high protein calorie calories low carb carbs gluten free dairy vegan vegetarian under minutes minute less than have using need can you that is it at most least".split())
EXCLUSION_GROUPS = {
    "dairy": {"milk", "butter", "cream", "cheese", "yogurt", "whey", "casein", "ghee"},
    "gluten": {"wheat", "barley", "rye", "flour", "bread", "pasta", "couscous", "semolina", "seitan", "malt"},
    "peanut": {"peanut", "peanuts"}, "tree nuts": {"almond", "walnut", "cashew", "pecan", "pistachio", "hazelnut", "macadamia"},
    "soy": {"soy", "soya", "tofu", "tempeh", "edamame", "miso"},
    "fish": {"fish", "salmon", "tuna", "cod", "tilapia", "anchovy", "sardine", "trout", "haddock"},
    "shellfish": {"shrimp", "prawn", "crab", "lobster", "clam", "mussel", "oyster", "scallop"},
    "meat": {"beef", "chicken", "pork", "bacon", "ham", "turkey", "lamb", "veal", "gelatin", "lard", "sausage", "duck"},
}


def requested_exclusions(values: list[str], query: str) -> set[str]:
    values = {normalized(v) for v in values}
    lower = query.lower()
    for label, terms in [("gluten", ("gluten-free", "gluten free")), ("dairy", ("dairy-free", "dairy free")), ("peanut", ("peanut-free", "peanut free"))]:
        if any(term in lower for term in terms):
            values.add(label)
    if re.search(r"\b(?:vegan|vegetarian)\b", lower):
        values.update({"meat", "fish", "shellfish"})
    if re.search(r"\bvegan\b", lower):
        values.update({"dairy", "egg", "honey"})
    for match in re.finditer(r"\b(?:without|avoid|exclude|no|allergic to)\s+([a-z][a-z ,'-]*)(?:[.!?]|$)", lower):
        phrase = re.split(r"\b(?:with|using|for|under|but|please|recipes?|dinner|meal)\b", match.group(1))[0]
        values.update(normalized(item.strip()) for item in re.split(r",|\band\b|\bor\b", phrase) if item.strip())
    return values


def exclusions(values: list[str], query: str) -> set[str]:
    values = requested_exclusions(values, query)
    expanded = set(values)
    for value in values:
        expanded.update(EXCLUSION_GROUPS.get(value, set()))
    return expanded


def ingredient_is_blocked(name: str, blocked: set[str], explicit: list[str]) -> bool:
    words = set(normalized(name).split())
    explicit_words = {normalized(term) for term in explicit}
    # A named plant alternative is not dairy; direct ingredient exclusions still win.
    alternatives = {
        "milk": r"\b(?:almond|oat|soy|rice|coconut|cashew|hemp|plant based) milk\b",
        "butter": r"\b(?:peanut|almond|cashew|sunflower|vegan|plant based) butter\b",
        "cream": r"\b(?:coconut|cashew|oat|soy) cream\b",
        "cheese": r"\b(?:vegan|plant based|dairy free) cheese\b",
        "flour": r"\b(?:rice|almond|coconut|chickpea|corn|tapioca|gluten free) flour\b",
        "gluten": r"\bgluten free\b",
    }
    text = normalized(name)
    for word, pattern in alternatives.items():
        if word not in explicit_words and re.search(pattern, text):
            words.discard(word)
    return bool(blocked & words) or any(" " in term and term in text for term in blocked)


def nutrition_summary(result: dict) -> dict:
    return {key: result[key] for key in ("complete", "reviewed", "servings", "totals", "known_totals", "per_serving", "unresolved_count", "excluded_count", "source", "notice")}


def save_web_recipe(session: Session, data: dict) -> PublicRecipe:
    url = canonical_url(data["source_url"])
    key = hashlib.sha256(url.encode()).hexdigest()
    existing = session.exec(select(PublicRecipe).where(PublicRecipe.source_key == key)).first()
    if existing:
        return existing
    nutrition = nutrition_summary(calculate(session, data["ingredients"], data.get("servings")))
    reusable = data["reuse_status"] == "licensed"
    record = PublicRecipe(
        source_key=key, title=data["title"], source_url=url, source_name=data["source_name"],
        source_author=data.get("source_author"), license_url=data.get("license_url"), reuse_status=data["reuse_status"],
        ingredients=data["ingredients"] if reusable else [], steps=data["steps"] if reusable else [],
        # Ingredient names are factual search metadata, not copied instructions.
        ingredient_names=list(dict.fromkeys(normalized(parse_ingredient(line)["name"])[:120] for line in data["ingredients"])),
        servings=data.get("servings"), total_minutes=data.get("total_minutes"), nutrition=nutrition,
    )
    session.add(record)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        record = session.exec(select(PublicRecipe).where(PublicRecipe.source_key == key)).one()
    session.refresh(record)
    return record


def reserve_search(engine, member_id: str, now: datetime | None = None):
    """Reserve before the network call, atomically across threads/processes.

    Ambiguous network failures still consume a local credit; never overspend by retrying.
    """
    now = now or datetime.now(timezone.utc)
    limits = [(f"tavily:{now:%Y-%m}", max(0, min(settings.SEARCH_MONTHLY_CREDITS, 1000))),
              (f"member:{member_id}:{now:%Y-%m-%d}", max(0, min(settings.SEARCH_DAILY_PER_MEMBER, 1000)))]
    for attempt in range(3):
        with Session(engine) as session:
            try:
                for key, _ in limits:
                    if session.get(SearchUsage, key) is None:
                        session.add(SearchUsage(key=key))
                session.flush()
                for key, limit in limits:
                    changed = session.execute(update(SearchUsage).where(SearchUsage.key == key, SearchUsage.used < limit).values(used=SearchUsage.used + 1)).rowcount
                    if changed != 1:
                        raise HTTPException(429, "The web-search allowance has been reached. Saved recipes still work; try again after the allowance resets.")
                session.commit()
                return
            except IntegrityError:
                session.rollback()
                if attempt == 2:
                    raise HTTPException(503, "Search is busy. Try again shortly.")


def source_warnings(sources: list[dict]) -> list[str]:
    return [f"{len(sources)} source page(s) could not be imported. You can open their original websites below or try another recipe source."] if sources else []


def web_search(engine, query: str, member_id: str) -> tuple[list[int], list[str], bool, list[dict]]:
    if not settings.TAVILY_API_KEY:
        return [], ["Web search is not set up yet. Saved recipe matching still works."], False, []
    fingerprint = hashlib.sha256(("reader-v2:" + query).encode()).hexdigest()
    with Session(engine) as session:
        cached = session.get(SearchCache, fingerprint)
        if cached and cached.expires_at > datetime.utcnow():
            report = session.get(SearchSourceReport, fingerprint)
            sources = report.sources if report else []
            notice = "Reused a recent search without spending a credit."
            if not cached.recipe_ids:
                notice += " This attempt found no importable recipes; try another query or retry after two minutes."
            return cached.recipe_ids, [notice] + source_warnings(sources), False, sources
    try:
        reserve_search(engine, member_id)
    except HTTPException as error:
        return [], [error.detail], False, []
    try:
        response = requests.post("https://api.tavily.com/search", headers={"Authorization": f"Bearer {settings.TAVILY_API_KEY}"}, json={
            "query": query + " recipe ingredients directions", "topic": "general", "search_depth": "basic",
            "max_results": max(1, min(settings.SEARCH_MAX_PAGES, 5)), "include_answer": False,
            "include_raw_content": False, "auto_parameters": False, "include_usage": True,
        }, timeout=(5, 20))
        response.raise_for_status()
        results = response.json()["results"]
        if not isinstance(results, list):
            raise ValueError("Invalid search response")
    except (requests.RequestException, KeyError, ValueError, TypeError):
        return [], ["The web search could not finish. Your collection is still available; a reserved search credit may have been used."], True, []
    ids, sources = [], []
    for result in results[:max(1, min(settings.SEARCH_MAX_PAGES, 5))]:
        url = ""
        try:
            if not isinstance(result, dict):
                raise PageReadError("Unreadable search result")
            url = canonical_url(result.get("url", ""))
            data = read_recipe(url)
            with Session(engine) as session:
                record = save_web_recipe(session, data)
                ids.append(record.id)
        except (PageReadError, ValueError, TypeError, RecursionError) as error:
            reason = str(error) if isinstance(error, PageReadError) else "This page did not provide a complete readable recipe."
            # Keep useful, attributable links without turning snippets into verified recipes.
            if url and "local or private network" not in reason:
                sources.append({"url": url, "title": plain(result.get("title") or urlsplit(url).hostname, 160), "reason": reason})
            logging.getLogger(__name__).info("Recipe source import failed for %s%s: %s", urlsplit(url).hostname, urlsplit(url).path, reason)
    with Session(engine) as session:
        cached = session.get(SearchCache, fingerprint) or SearchCache(key=fingerprint, expires_at=datetime.utcnow())
        cached.recipe_ids = list(dict.fromkeys(ids))
        cached.expires_at = datetime.utcnow() + (timedelta(hours=12) if ids else timedelta(minutes=2))
        session.add(cached)
        report = session.get(SearchSourceReport, fingerprint) or SearchSourceReport(key=fingerprint)
        report.sources = sources
        session.add(report)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()  # another simultaneous search already cached the same request
    return ids, source_warnings(sources), True, sources


def catalog_candidates(session: Session, payload, meaning=None) -> list[dict]:
    words = set(normalized(payload.query).split()) - STOPWORDS
    if meaning:
        words |= {word for term in meaning.keywords for word in normalized(term).split()} - STOPWORDS
    pantry = [normalized(parse_ingredient(item)["name"]) for item in payload.pantry]
    blocked = exclusions(payload.excluded + (meaning.excluded if meaning else []), payload.query)
    direct_exclusions = list(requested_exclusions(payload.excluded + (meaning.excluded if meaning else []), payload.query))
    words -= {word for term in blocked for word in term.split()}
    candidates = []
    public = session.exec(select(PublicRecipe).order_by(PublicRecipe.created_at.desc()).limit(1000)).all()
    ratings = {recipe_id: (float(average), count) for recipe_id, average, count in session.exec(select(RecipeRating.recipe_id, func.avg(RecipeRating.stars), func.count()).group_by(RecipeRating.recipe_id)).all()}
    for recipe in public:
        candidates.append({"key": f"public:{recipe.id}", "kind": "public", "id": recipe.id, "title": recipe.title,
            "ingredient_names": recipe.ingredient_names, "source_url": recipe.source_url, "source_name": recipe.source_name,
            "source_author": recipe.source_author, "reuse_status": recipe.reuse_status,
            "total_minutes": recipe.total_minutes, "servings": recipe.servings, "nutrition": recipe.nutrition,
            "rating_average": ratings.get(recipe.id, (None, 0))[0], "rating_count": ratings.get(recipe.id, (None, 0))[1]})
    if payload.mode == "family":
        for recipe in session.exec(select(Recipe).order_by(Recipe.created_at.desc()).limit(500)).all():
            info = session.get(RecipeInfo, recipe.id)
            overrides = info.overrides if info and info.ingredient_hash == ingredient_hash(recipe.ingredients) else {}
            candidates.append({"key": f"family:{recipe.id}", "kind": "family", "id": recipe.id, "title": recipe.title,
                "ingredient_names": [normalized(parse_ingredient(line)["name"]) for line in recipe.ingredients],
                "source_url": info.source_url if info else None, "source_name": info.source_name if info else "Family collection",
                "source_author": info.source_author if info else None, "reuse_status": "family", "total_minutes": None,
                "servings": info.servings if info else None, "nutrition": {}, "_recipe": recipe, "_overrides": overrides})
    viable = []
    for candidate in candidates:
        names = candidate["ingredient_names"]
        ingredient_words = set(normalized(" ".join(names)).split())
        all_words = ingredient_words | set(normalized(candidate["title"]).split())
        if any(ingredient_is_blocked(name, blocked, direct_exclusions) for name in names):
            continue
        relevance = len(words & all_words) / len(words) if words else 0
        if words and relevance == 0:
            continue
        available = [name for name in names if any(set(item.split()) <= set(name.split()) or set(name.split()) <= set(item.split()) for item in pantry)]
        pantry_fit = len(available) / len(names) if names and pantry else 0
        score = .7 * relevance + .3 * pantry_fit if words else pantry_fit
        count = candidate.get("rating_count", 0)
        if count:
            score += .05 * (candidate["rating_average"] / 5) * (count / (count + 5))
        if score < .18:
            continue
        max_minutes = payload.max_minutes if payload.max_minutes is not None else meaning.max_minutes if meaning else None
        if max_minutes is not None and (candidate["total_minutes"] is None or candidate["total_minutes"] > max_minutes):
            continue
        candidate.update(score=round(score, 3), missing_ingredients=[name for name in names if name not in available] if pantry else [],
                         reasons=[f"Matches {len(words & all_words)} of {len(words)} search terms."] if words else [])
        if pantry:
            candidate["reasons"].append(f"Your ingredient list covers {len(available)} of {len(names)} recipe ingredients; quantities still need checking.")
        viable.append(candidate)
    # Calculate only the most relevant family recipes, not every recipe in the database.
    viable.sort(key=lambda c: (-c["score"], c["key"]))
    final = []
    for candidate in viable[:20]:
        private = candidate.pop("_recipe", None)
        overrides = candidate.pop("_overrides", {})
        if private:
            candidate["nutrition"] = nutrition_summary(calculate(session, private.ingredients, candidate["servings"], overrides))
        macros = candidate["nutrition"].get("per_serving")
        minimum = payload.min_protein if payload.min_protein is not None else meaning.min_protein if meaning else None
        maximum = payload.max_calories if payload.max_calories is not None else meaning.max_calories if meaning else None
        if minimum is not None and (not macros or macros["protein"] < minimum):
            continue
        if maximum is not None and (not macros or macros["calories"] > maximum):
            continue
        if not macros:
            candidate["reasons"].append("Nutrition per serving is not available yet.")
        final.append(candidate)
    return final
