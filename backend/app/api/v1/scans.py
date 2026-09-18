from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.app.db.session import engine
from backend.app.models.scan import RecipeScan
from backend.app.models.handwriting_profile import HandwritingProfile

router = APIRouter()


class ScanCorrectionIn(BaseModel):
    title: str
    ingredients: List[str] = []
    steps: List[str] = []
    handwriting_profile_id: Optional[int] = None


def _upsert_correction(profile: HandwritingProfile, guessed: str, corrected: str) -> None:
    guessed = (guessed or "").strip()
    corrected = (corrected or "").strip()
    if not guessed or not corrected or guessed == corrected:
        return

    corrections = list(profile.common_corrections or [])
    for item in corrections:
        if item.get("ocr") == guessed and item.get("corrected") == corrected:
            item["count"] = int(item.get("count", 1)) + 1
            return

    corrections.append({"ocr": guessed, "corrected": corrected, "count": 1})
    profile.common_corrections = corrections[-100:]


def _learn_words(profile: HandwritingProfile, words: List[str]) -> None:
    existing = set(profile.known_words or [])
    for word in words:
        clean = word.strip().lower()
        if len(clean) >= 3:
            existing.add(clean)
    profile.known_words = sorted(existing)[:300]


@router.get("/", response_model=list[RecipeScan])
def list_scans(limit: int = 50):
    with Session(engine) as session:
        stmt = select(RecipeScan).order_by(RecipeScan.created_at.desc()).limit(limit)
        return session.exec(stmt).all()


@router.get("/{scan_id}", response_model=RecipeScan)
def get_scan(scan_id: int):
    with Session(engine) as session:
        scan = session.get(RecipeScan, scan_id)
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")
        return scan


@router.patch("/{scan_id}/correction", response_model=RecipeScan)
def save_scan_correction(scan_id: int, payload: ScanCorrectionIn):
    with Session(engine) as session:
        scan = session.get(RecipeScan, scan_id)
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")

        profile_id = payload.handwriting_profile_id or scan.handwriting_profile_id
        profile = session.get(HandwritingProfile, profile_id) if profile_id else None

        corrected: Dict[str, Any] = {
            "title": payload.title,
            "ingredients": payload.ingredients,
            "steps": payload.steps,
        }
        scan.corrected_recipe = corrected
        scan.status = "corrected"
        scan.updated_at = datetime.utcnow()
        if profile_id:
            scan.handwriting_profile_id = profile_id

        if profile:
            parsed = scan.parsed_recipe or {}
            _upsert_correction(profile, parsed.get("title", ""), payload.title)

            guessed_lines = list(parsed.get("ingredients", [])) + list(parsed.get("steps", []))
            corrected_lines = list(payload.ingredients) + list(payload.steps)
            for guessed, fixed in zip(guessed_lines, corrected_lines):
                _upsert_correction(profile, guessed, fixed)

            words = []
            for line in corrected_lines:
                words.extend(line.replace(",", " ").replace(".", " ").split())
            _learn_words(profile, words)
            profile.updated_at = datetime.utcnow()
            session.add(profile)

        session.add(scan)
        session.commit()
        session.refresh(scan)
        return scan
