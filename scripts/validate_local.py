#!/usr/bin/env python3
"""Check recipe text parsing without a device, database, OCR engine, or model."""
import ast
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def check(condition, label):
    if not condition:
        raise RuntimeError(label)
    print(f"PASS {label}")


def main():
    files = sorted([*(ROOT / "backend").rglob("*.py"), *(ROOT / "migrations").rglob("*.py")])
    for path in files:
        ast.parse(path.read_text(), filename=str(path.relative_to(ROOT)))
    print(f"PASS backend syntax: {len(files)} Python files")

    from backend.app.services.ocr_parser import parse_ocr_to_recipe

    text = "Synthetic Soup\nIngredients\n1 cup water\n2 eggs\nDirections\n1 Mix ingredients\n2 Heat gently"
    check(parse_ocr_to_recipe(text) == ("Synthetic Soup", ["1 cup water", "2 eggs"],
                                       ["Mix ingredients", "Heat gently"]),
          "explicit headings separate title, two ingredients, and two numbered steps")
    check(parse_ocr_to_recipe(" \n ") == ("Untitled Recipe", [], []),
          "empty text returns an untitled recipe without inventing content")
    text = "Synthetic Stew\n8 eggs\n1 cup stock\n1 Cook slowly\n2 Serve warm"
    check(parse_ocr_to_recipe(text) == ("Synthetic Stew", ["8 eggs", "1 cup stock"],
                                       ["Cook slowly", "Serve warm"]),
          "quantity lines remain ingredients while numbered cooking verbs become steps")
    print("COMPLETE synthetic text checks; image recognition, API, and mobile app were not exercised")


if __name__ == "__main__":
    main()
