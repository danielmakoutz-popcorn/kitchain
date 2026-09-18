from typing import List, Tuple, Dict, Any, Optional
import re

_STEP_LINE_RE = re.compile(r'^\s*\d+\s+')

_STEP_PREFIX_RE = re.compile(r'^\s*(\d+)\s+(.+)$', re.IGNORECASE)

COMMON_UNITS = {
    "cup","cups","tbsp","tbsps","tablespoon","tablespoons",
    "tsp","tsps","teaspoon","teaspoons",
    "oz","ounce","ounces",
    "lb","lbs","pound","pounds",
    "g","gram","grams","kg",
    "ml","l",
    "package","packages","pkg",
    "can","cans","jar","jars",
    "clove","cloves","slice","slices",
}

COMMON_STEP_VERBS = {
    "cook","whisk","heat","add","stir","mix","combine","bake","broil",
    "preheat","drain","rinse","cover","uncover","transfer","bring","reduce",
    "simmer","boil","fold","top","serve","let","run","set",
}

def _looks_like_numbered_step(line: str) -> bool:
    """
    True for '2 Cook noodles...' but False for '8 eggs' or '1 cup sugar'.
    """
    m = _STEP_PREFIX_RE.match(line.strip())
    if not m:
        return False

    rest = m.group(2).strip()
    if not rest:
        return False

    first_word = re.split(r'\s+', rest, maxsplit=1)[0].strip("().,:;").lower()

    # Ingredient quantity lines usually have a unit right after the number.
    if first_word in COMMON_UNITS:
        return False

    # If it starts with a cooking verb, it's almost certainly a step.
    if first_word in COMMON_STEP_VERBS:
        return True

    # Otherwise, assume it's NOT a step (safer).
    return False

def _looks_like_ingredient(line: str) -> bool:
    """
    Heuristic: ingredient lines often start with a quantity or fraction, e.g.
    '1 cup sugar', '1/2 tsp salt', '2-3 cloves garlic', 'one onion'
    """
    s = line.strip().lower()
    if not s:
        return False

    # Common quantity patterns
    if re.match(r'^\d+(\.\d+)?\s+', s):           # 1, 2, 1.5
        return True
    if re.match(r'^\d+\s*/\s*\d+\s+', s):         # 1/2
        return True
    if re.match(r'^\d+\s*-\s*\d+\s+', s):         # 2-3
        return True

    # Word numbers (basic)
    if re.match(r'^(one|two|three|four|five|six|seven|eight|nine|ten)\b', s):
        return True

    return False

def _clean(text: str) -> str:
    # normalize whitespace, strip weird artifacts
    lines = [re.sub(r'\s+', ' ', ln).strip(" -•\t") for ln in text.splitlines()]
    return "\n".join([ln for ln in lines if ln])

def _norm_header(s: str) -> str:
    return re.sub(r'[^a-z ]+', '', s.lower()).strip()

def _looks_like_step(line: str) -> bool:
    return bool(re.match(r'^\s*(step\s*)?\d+[\).\:-]\s+', line.lower()))

def parse_ocr_to_recipe(text: str) -> Tuple[str, List[str], List[str]]:
    """
    Returns (title, ingredients, steps)
    Heuristics:
      - First non-empty line is the title (often works for phone photos)
      - Split into ingredients vs steps by simple pattern
    """
    cleaned = _clean(text)
    lines = [ln for ln in cleaned.split("\n") if ln]

    if not lines:
        return ("Untitled Recipe", [], [])

    title = lines[0]
    body = lines[1:]

    ingredients, steps, step_buf = [], [], []

    # detect a divider section names
    ING_HEADERS = {"ingredients", "ingredient", "what you need"}
    STEP_HEADERS = {"instructions", "directions", "method", "steps"}

    mode = None

    for ln in body:
        # Fix cookbook quirk
        if ln.lower().startswith(("t ", "i ")):
            ln = "1 " + ln[2:]

        lower = _norm_header(ln)

        # Explicit headers
        if lower in ING_HEADERS:
            mode = "ING"
            continue
        if lower in STEP_HEADERS:
            mode = "STEP"
            continue

        # Implicit ingredient section
        if mode is None and _looks_like_ingredient(ln):
            mode = "ING"
            ingredients.append(ln)
            continue

        # Numbered steps always win
        if _looks_like_numbered_step(ln):
            step_buf.append(ln)
            mode = "STEP"
            continue

        # Mode-based routing
        if mode == "ING":
            ingredients.append(ln)
        elif mode == "STEP":
            step_buf.append(ln)
        else:
            # fallback (usually description like "Makes 4 servings")
            step_buf.append(ln)

    # Convert the free text into numbered steps (split on sentences or blank lines)
    # Simple split: group by blank lines
    steps = []
    cur = []

    for ln in step_buf:
        if _looks_like_numbered_step(ln):
            # start a new step
            if cur:
                steps.append(" ".join(cur).strip())
            cur = [re.sub(r'^\s*\d+\s+', '', ln).strip()]
        else:
            if ln.strip():
                cur.append(ln.strip())

    if cur:
        steps.append(" ".join(cur).strip())

    # If steps look empty but we have text, just put body as one step
    if not steps and step_buf:
        steps = [" ".join(step_buf)]

    return (title, ingredients, steps)
