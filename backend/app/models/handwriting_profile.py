from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field


class HandwritingProfile(SQLModel, table=True):
    """A person-specific handwriting memory profile."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    relationship: Optional[str] = None
    notes: Optional[str] = None

    # Words/phrases that commonly appear in this person's recipes.
    known_words: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    # Correction examples, e.g. [{"ocr": "flr", "corrected": "flour", "count": 3}]
    common_corrections: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
