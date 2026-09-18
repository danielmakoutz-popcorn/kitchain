from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field, Relationship


class RecipeBase(SQLModel):
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    ingredients: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    steps: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    handwriting_profile_id: Optional[int] = Field(default=None, foreign_key="handwritingprofile.id")
    image_path: Optional[str] = None

class Recipe(RecipeBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    user: Optional["User"] = Relationship(back_populates="recipes")
