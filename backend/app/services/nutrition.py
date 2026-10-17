"""USDA-backed estimates. Unknown quantities never silently become zero calories."""
from fractions import Fraction
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

from sqlalchemy import or_
from sqlmodel import Session, select

from backend.app.models.discovery import NutritionFood

NUTRIENTS = ("calories", "protein", "carbs", "fat", "fiber")
SEED = Path(__file__).resolve().parents[2] / "data/nutrition/usda-sr-legacy.json.gz"
FRACTIONS = {"¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8"}
UNITS = {
    "grams": "g", "gram": "g", "kilograms": "kg", "kilogram": "kg",
    "ounces": "oz", "ounce": "oz", "pounds": "lb", "pound": "lb", "lbs": "lb",
    "cups": "cup", "tablespoons": "tbsp", "tablespoon": "tbsp", "tbs": "tbsp",
    "teaspoons": "tsp", "teaspoon": "tsp", "milliliters": "ml", "milliliter": "ml",
    "liters": "l", "liter": "l", "pieces": "piece", "cloves": "clove", "slices": "slice",
}
MASS = {"g": 1, "kg": 1000, "mg": .001, "oz": 28.349523125, "lb": 453.59237}
VOLUME = {"cup": 1, "tbsp": 1 / 16, "tsp": 1 / 48, "ml": 1 / 236.5882365, "l": 1000 / 236.5882365, "fl oz": 1 / 8}
# Editable defaults for explicitly cooked, otherwise unqualified staples.
# These FDC IDs and their descriptions come from the bundled USDA release.
DEFAULT_FOODS = {frozenset({"rice", "cooked"}): 168878, frozenset({"chicken", "breast", "cooked"}): 171477}
PRODUCT_FORMS = {"breaded", "battered", "tenders", "nuggets", "noodles", "pudding", "mix", "cereal", "flavored", "babyfood", "formula", "fried", "skin", "powder", "concentrate", "condensed", "sauce", "soup", "snack", "chips", "candy", "sweetened"}


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).lower()
    words = re.findall(r"[a-z0-9]+", text)
    return " ".join({"eggs": "egg", "tomatoes": "tomato", "potatoes": "potato", "onions": "onion", "mushrooms": "mushroom", "carrots": "carrot"}.get(w, w) for w in words)


def seed_nutrition(engine) -> int:
    with Session(engine) as session:
        if session.exec(select(NutritionFood.id).limit(1)).first() is not None or not SEED.is_file():
            return 0
        with gzip.open(SEED, "rt") as source:
            foods = json.load(source)
        session.add_all(NutritionFood(**food) for food in foods)
        session.commit()
        return len(foods)


def parse_ingredient(line: str) -> dict:
    value = line.strip().lstrip("•- ")
    for glyph, fraction in FRACTIONS.items():
        value = re.sub(rf"(?<=\d){glyph}", f" {fraction}", value)
        value = value.replace(glyph, fraction)
    value = value.replace("⁄", "/")
    match = re.match(r"^(\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)\s*(.*)$", value)
    amount, unit, name = None, "piece", value
    if match:
        raw, name = match.groups()
        try:
            amount = sum(float(Fraction(x)) for x in raw.split())
        except (ValueError, ZeroDivisionError):
            amount = None
        if amount is not None and (not math.isfinite(amount) or not 0 < amount <= 1000000):
            amount = None
        if re.match(r"^\s*(?:[-–]|to\s+\d|or\s+\d)", name):
            return {"amount": None, "unit": "", "name": line.strip(), "reason": "Choose a single quantity for this range."}
        unit_match = re.match(r"^(fl\s*oz|[a-zA-Z]+)\.?\b\s*(.*)$", name)
        if unit_match:
            candidate, rest = unit_match.groups()
            candidate = UNITS.get(candidate.lower(), candidate.lower())
            if candidate in set(MASS) | set(VOLUME) | {"piece", "clove", "slice", "large", "medium", "small"}:
                unit, name = candidate, rest
        name = re.sub(r"^of\s+", "", name, flags=re.I).strip()
    return {"amount": amount, "unit": unit, "name": name or line.strip(), "reason": None}


def food_candidates(session: Session, query: str, limit: int = 6) -> list[dict]:
    words = normalized(query).split()
    words = [w for w in words if w not in {"of", "and", "a", "an", "the", "finely", "roughly", "chopped", "diced", "sliced", "fresh", "to", "taste", "optional"}]
    if not words:
        return []
    clauses = [NutritionFood.search_text.contains(w, autoescape=True) for w in words[:8]]
    # Prefer all ingredient words; fall back to a candidate list for human review.
    foods = session.exec(select(NutritionFood).where(*clauses).limit(500)).all()
    if not foods:
        foods = session.exec(select(NutritionFood).where(or_(*clauses)).limit(500)).all()
    wanted = set(words)

    def score(food):
        tokens = normalized(food.description).split()
        present = set(tokens)
        overlap = len(wanted & present) / len(wanted)
        value = overlap * 10 - .09 * len(tokens)
        value += 1.5 if tokens and tokens[0] in wanted else 0
        value -= 3 * len((PRODUCT_FORMS & present) - wanted)
        value += 1.5 if DEFAULT_FOODS.get(frozenset(wanted)) == food.id else 0
        value -= 2 if {"babyfood", "formula", "restaurant", "fast", "flavored", "imitation"} & present - wanted else 0
        if "cooked" not in wanted and "raw" not in wanted:
            value += .6 if "raw" in present else 0
        if "cooked" in wanted and "raw" in present:
            value -= 4
        return value, overlap

    ranked = sorted(foods, key=lambda f: (-score(f)[0], f.id))[:limit]
    return [{"id": f.id, "description": f.description, "coverage": round(score(f)[1], 2), "portions": f.portions, **{n: getattr(f, n) for n in NUTRIENTS}} for f in ranked]


def portion_grams(food: NutritionFood, parsed: dict) -> float | None:
    amount, unit = parsed["amount"], parsed["unit"]
    if amount is None or amount <= 0:
        return None
    if unit in MASS:
        return amount * MASS[unit]
    if unit in {"large", "medium", "small", "piece", "clove", "slice"}:
        exact = [p for p in food.portions if normalized(p["unit"]) == unit]
        if exact:
            return exact[0]["grams"] * amount / exact[0].get("amount", 1)
    matches = []
    for portion in food.portions:
        desc = normalized(portion["unit"])
        for old, new in UNITS.items():
            desc = re.sub(rf"\b{old}\b", new, desc)
        base = portion["grams"] / portion.get("amount", 1)
        if unit in VOLUME:
            if re.search(r"\bcup\b", desc):
                matches.append(base * amount * VOLUME[unit])
            elif re.search(rf"\b{re.escape(unit)}\b", desc):
                matches.append(base * amount)
        elif re.search(rf"\b{re.escape(unit)}\b", desc):
            matches.append(base * amount)
        elif unit == "piece" and re.search(r"\b(large|medium|whole)\b", desc):
            matches.append(base * amount)
    # Different preparation forms can have different densities. Ask for grams.
    if not matches or max(matches) > min(matches) * 1.25:
        return None
    return matches[0]


def ingredient_hash(lines: list[str]) -> str:
    return hashlib.sha256(json.dumps(lines, ensure_ascii=False).encode()).hexdigest()


def calculate(session: Session, lines: list[str], servings: float | None = None, overrides: dict | None = None) -> dict:
    rows, known = [], {n: 0.0 for n in NUTRIENTS}
    overrides = overrides or {}
    for index, line in enumerate(lines):
        parsed = parse_ingredient(line)
        override = overrides.get(str(index), {})
        row = {"index": index, "line": line, "name": parsed["name"], "food_id": None, "food_name": None, "grams": None, "status": "unresolved", "reason": parsed["reason"], "candidates": [], "macros": None}
        if override.get("ignored"):
            row.update(status="excluded", reason="Excluded by you; totals omit this ingredient.")
            rows.append(row)
            continue
        food = session.get(NutritionFood, override["food_id"]) if override.get("food_id") else None
        if not food:
            candidates = food_candidates(session, parsed["name"])
            row["candidates"] = candidates
            if candidates and candidates[0]["coverage"] == 1:
                food = session.get(NutritionFood, candidates[0]["id"])
        if food:
            grams = override.get("grams") or portion_grams(food, parsed)
            if grams is not None and (not math.isfinite(grams) or not 0 < grams <= 1000000):
                grams = None
            row.update(food_id=food.id, food_name=food.description, grams=round(grams, 2) if grams else None)
            if grams and all(getattr(food, n) is not None for n in NUTRIENTS):
                macros = {n: (getattr(food, n) or 0) * grams / 100 for n in NUTRIENTS}
                known = {n: known[n] + macros[n] for n in NUTRIENTS}
                row.update(status="confirmed" if override.get("food_id") else "estimated", reason=None, macros={n: round(v, 2) for n, v in macros.items()})
            else:
                row["reason"] = "Enter grams for this ingredient." if not grams else "USDA record is missing a required nutrient; select another food."
        elif not row["reason"]:
            row["reason"] = "Select the matching USDA food and enter its weight."
        rows.append(row)
    complete = bool(rows) and all(r["status"] != "unresolved" for r in rows)
    totals = {n: round(v, 1) for n, v in known.items()}
    return {
        "ingredient_hash": ingredient_hash(lines), "servings": servings, "complete": complete,
        "reviewed": complete and all(r["status"] in {"confirmed", "excluded"} for r in rows),
        "totals": totals if complete else None, "known_totals": totals,
        "per_serving": {n: round(v / servings, 1) for n, v in known.items()} if complete and servings else None,
        "rows": rows, "excluded_count": sum(r["status"] == "excluded" for r in rows),
        "unresolved_count": sum(r["status"] == "unresolved" for r in rows),
        "source": "USDA FoodData Central · SR Legacy, April 2018 · CC0",
        "notice": "Estimates depend on the selected food, preparation, weight and serving count. Review suggested matches; excluded ingredients are omitted.",
    }
