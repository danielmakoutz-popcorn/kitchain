from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.app.db.session import engine
from backend.app.models.handwriting_profile import HandwritingProfile

router = APIRouter()


class HandwritingProfileCreate(BaseModel):
    name: str
    relationship: Optional[str] = None
    notes: Optional[str] = None


class HandwritingProfileUpdate(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    notes: Optional[str] = None
    known_words: Optional[List[str]] = None


@router.post("/", response_model=HandwritingProfile)
def create_profile(payload: HandwritingProfileCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Profile name is required")

    profile = HandwritingProfile(
        name=name,
        relationship=payload.relationship,
        notes=payload.notes,
    )
    with Session(engine) as session:
        session.add(profile)
        session.commit()
        session.refresh(profile)
        return profile


@router.get("/", response_model=list[HandwritingProfile])
def list_profiles():
    with Session(engine) as session:
        return session.exec(select(HandwritingProfile).order_by(HandwritingProfile.name)).all()


@router.patch("/{profile_id}", response_model=HandwritingProfile)
def update_profile(profile_id: int, payload: HandwritingProfileUpdate):
    with Session(engine) as session:
        profile = session.get(HandwritingProfile, profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Handwriting profile not found")

        updates = payload.model_dump(exclude_unset=True)
        for key, value in updates.items():
            setattr(profile, key, value)
        profile.updated_at = datetime.utcnow()

        session.add(profile)
        session.commit()
        session.refresh(profile)
        return profile
