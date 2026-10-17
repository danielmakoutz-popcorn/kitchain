import base64
import json
import re
import requests
from PIL import Image
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5vl:3b"


def make_small_image(image_path: str) -> str:
    src = Path(image_path)
    out = src.with_name(src.stem + "_ollama_small.jpg")

    with Image.open(src) as original:
        img = original.convert("RGB")
        img.thumbnail((1200, 1200))
        img.save(out, quality=90)

    return str(out)


def extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Recipe response must be a JSON object")
    return parsed


def _text_lines(value, field: str) -> list[str]:
    """Accept minor output-shape variations without inventing recipe content."""
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list) or any(not isinstance(line, str) for line in value):
        raise ValueError(f"Invalid {field} in recipe response")
    return [line.strip() for line in value if line.strip()]


def normalize_recipe(parsed: dict) -> dict:
    title = parsed.get("title") or ""
    if not isinstance(title, str):
        raise ValueError("Invalid title in recipe response")

    ingredients = parsed.get("ingredients") or []
    if isinstance(ingredients, str):
        ingredients = [ingredients]
    if not isinstance(ingredients, list):
        raise ValueError("Invalid ingredients in recipe response")
    lines = []
    for item in ingredients:
        if isinstance(item, dict):
            name = item.get("name") or ""
            quantity = item.get("quantity")
            quantity = "" if quantity is None else str(quantity).strip()
            if not isinstance(name, str):
                raise ValueError("Invalid ingredient name in recipe response")
            name = name.strip()
            # Preserve the existing client's protection against doubled amounts.
            item = name if re.match(r"^\s*[\d¼½¾⅓⅔⅛⅜⅝⅞]", name) else f"{quantity} {name}".strip()
        if not isinstance(item, str):
            raise ValueError("Invalid ingredient in recipe response")
        if item.strip():
            lines.append(item.strip())

    result = {
        "title": title.strip() or "Untitled Recipe",
        "ingredients": lines,
        "steps": _text_lines(parsed.get("steps"), "steps"),
        "notes": _text_lines(parsed.get("notes"), "notes"),
        "uncertain_words": _text_lines(parsed.get("uncertain_words"), "uncertain words"),
    }
    if not title.strip() and not any(result[key] for key in ("ingredients", "steps", "notes")):
        raise ValueError("No recipe text returned")
    return result


def read_recipe_with_ollama(image_path: str) -> dict:
    small_path = make_small_image(image_path)

    try:
        with open(small_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")
    finally:
        Path(small_path).unlink(missing_ok=True)

    prompt = """
You are extracting a handwritten recipe card.
Return ONLY compact valid JSON. No markdown. No explanation.

Schema:
{
  "title": "",
  "ingredients": [],
  "steps": [],
  "notes": [],
  "uncertain_words": []
}

Rules:
- Read the image as a recipe, not generic OCR.
- The title is usually at the top.
- Ingredients are usually separate handwritten lines.
- Include eggs and quantities if visible.
- Notes may start with stars or bullets.
- Do not invent ingredients.
- If unsure, preserve the closest visible text and add it to uncertain_words.
"""

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_ctx": 4096,
        },
    }

    res = requests.post(OLLAMA_URL, json=payload, timeout=300)
    res.raise_for_status()

    data = res.json()
    if not isinstance(data, dict) or not isinstance(data.get("response"), str):
        raise ValueError("Missing recipe response")
    response_text = data["response"]
    parsed = extract_json(response_text)

    return {
        **normalize_recipe(parsed),
        "raw_model_response": response_text,
    }
