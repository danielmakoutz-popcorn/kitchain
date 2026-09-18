from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


class UserBase(SQLModel):
    email: str = Field(index=True, unique=True)
    hashed_password: str


class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    recipes: List["Recipe"] = Relationship(back_populates="user")

