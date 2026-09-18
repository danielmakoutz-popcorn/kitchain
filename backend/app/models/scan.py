from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field


class RecipeScan(SQLModel, table=True):
    """Stores each scan attempt and the user's corrections.

    This is the raw training trail for the handwriting ecosystem.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    image_path: Optional[str] = None
    mode: str = Field(default="printed", index=True)
    status: str = Field(default="scanned", index=True)

    handwriting_profile_id: Optional[int] = Field(default=None, foreign_key="handwritingprofile.id")

    raw_text: str = ""
    parsed_recipe: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    corrected_recipe: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    uncertain_lines: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    confidence: str = "medium"

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
