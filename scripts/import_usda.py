#!/usr/bin/env python3
"""Build the bundled self-hosted nutrition catalog from USDA's original ZIP.

python scripts/import_usda.py /path/to/FoodData_Central_sr_legacy_food_json_2018-04.zip
No API key or network access is required at app runtime.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"


def build(archive: Path, destination: Path):
    with zipfile.ZipFile(archive) as source:
        names = [x for x in source.namelist() if x.endswith(".json")]
        if len(names) != 1:
            raise ValueError("Expected the original single-file USDA SR Legacy archive.")
        data = json.loads(source.read(names[0]))["SRLegacyFoods"]
    foods = []
    for food in data:
        nutrients = {n["nutrient"]["id"]: n.get("amount") for n in food.get("foodNutrients", [])}
        energy = nutrients.get(1008)
        if energy is None and nutrients.get(1062) is not None:
            energy = round(nutrients[1062] / 4.184, 3)
        foods.append({
            "id": food["fdcId"], "description": food["description"],
            "search_text": " ".join(re.findall(r"[a-z0-9]+", food["description"].lower())),
            "calories": energy, "protein": nutrients.get(1003), "carbs": nutrients.get(1005),
            "fat": nutrients.get(1004), "fiber": nutrients.get(1079),
            "portions": [{"unit": p.get("modifier") or p.get("portionDescription") or p.get("measureUnit", {}).get("name", ""), "grams": p["gramWeight"], "amount": p.get("amount", 1) or 1} for p in food.get("foodPortions", []) if p.get("gramWeight", 0) > 0],
        })
    destination.mkdir(parents=True, exist_ok=True)
    content = json.dumps(sorted(foods, key=lambda f: f["id"]), separators=(",", ":"), ensure_ascii=False).encode()
    (destination / "usda-sr-legacy.json.gz").write_bytes(gzip.compress(content, mtime=0))
    manifest = {"source": SOURCE, "publisher": "USDA Agricultural Research Service, FoodData Central", "release": "SR Legacy, April 2018", "license": "CC0-1.0", "license_reference": "https://fdc.nal.usda.gov/api-guide/#bkmk-9", "records": len(foods), "original_zip_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "normalized_json_sha256": hashlib.sha256(content).hexdigest(), "nutrient_basis": "per 100 g edible portion", "notes": "Original descriptions, FDC IDs, five nutrient amounts and household portions. Missing nutrients remain null. Energy uses kcal, or kJ / 4.184 when kcal is absent."}
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Built {len(foods)} USDA records in {destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    build(args.archive, ROOT / "backend/data/nutrition")
