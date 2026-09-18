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

    img = Image.open(src).convert("RGB")
    img.thumbnail((1200, 1200))
    img.save(out, quality=90)

    return str(out)


def extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def read_recipe_with_ollama(image_path: str) -> dict:
    small_path = make_small_image(image_path)

    with open(small_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

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
    response_text = data.get("response", "")
    parsed = extract_json(response_text)

    return {
        "title": parsed.get("title") or "Untitled Recipe",
        "ingredients": parsed.get("ingredients") or [],
        "steps": parsed.get("steps") or [],
        "notes": parsed.get("notes") or [],
        "uncertain_words": parsed.get("uncertain_words") or [],
        "raw_model_response": response_text,
    }
