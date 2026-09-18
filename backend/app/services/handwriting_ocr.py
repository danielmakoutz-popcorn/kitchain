from __future__ import annotations
from typing import List
from paddleocr import PaddleOCR

_OCR = PaddleOCR(
    use_angle_cls=True,
    lang="en",
)

def _get_ocr() -> PaddleOCR:
    global _OCR
    if _OCR is None:
        # Angle classifier enabled here (don’t pass cls=... later)
        _OCR = PaddleOCR(use_angle_cls=True, lang="en")
    return _OCR

def paddle_ocr_image_to_lines(image_path: str) -> List[str]:
    ocr = _get_ocr()

    # PaddleOCR v3+ may not accept cls= at call time, so just call ocr(...)
    result = ocr.ocr(image_path)

    print("PADDLE_RESULT_PAGES:", len(result or []))
    if result:
        print("PADDLE_FIRST_PAGE_ITEMS:", len(result[0] or []))

    lines: List[str] = []
    # Typical structure: result = [ [ [box, (text, score)], ... ] ]
    for page in result or []:
        for item in page or []:
            try:
                text = item[1][0]
            except Exception:
                continue
            if text:
                lines.append(text.strip())

    return [ln for ln in lines if ln]
