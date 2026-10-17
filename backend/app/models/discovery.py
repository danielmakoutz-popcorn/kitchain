"""Additive tables: existing recipe cards, scans and photos are never rebuilt."""
from datetime import datetime
from typing import Any

from sqlalchemy import Column, JSON, CheckConstraint
from sqlmodel import Field, SQLModel


class NutritionFood(SQLModel, table=True):
    id: int = Field(primary_key=True)  # USDA FDC identifier
    description: str
    search_text: str = Field(index=True)
    calories: float | None = None  # all nutrients per 100 grams
    protein: float | None = None
    carbs: float | None = None
    fat: float | None = None
    fiber: float | None = None
    portions: list[dict] = Field(default_factory=list, sa_column=Column(JSON))


class RecipeInfo(SQLModel, table=True):
    recipe_id: int = Field(primary_key=True, foreign_key="recipe.id", ondelete="CASCADE")
    servings: float | None = None
    ingredient_hash: str = ""
    overrides: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    source_url: str | None = None
    source_name: str | None = None
    source_author: str | None = None
    license_url: str | None = None
    public_id: int | None = None


class CommunityMember(SQLModel, table=True):
    id: str = Field(primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Pantry(SQLModel, table=True):
    member_id: str = Field(primary_key=True, foreign_key="communitymember.id", ondelete="CASCADE")
    items: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    revision: int = 1
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PublicRecipe(SQLModel, table=True):
    __table_args__ = {"sqlite_autoincrement": True}  # public links/ratings must never move to a new recipe
    id: int | None = Field(default=None, primary_key=True)
    source_key: str = Field(unique=True, index=True)
    title: str
    source_url: str | None = None
    source_name: str
    source_author: str | None = None
    license_url: str | None = None
    reuse_status: str = "link_only"
    contributor_id: str | None = Field(default=None, foreign_key="communitymember.id")
    ingredients: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    ingredient_names: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    steps: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    servings: float | None = None
    total_minutes: float | None = None
    nutrition: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RecipeRating(SQLModel, table=True):
    __table_args__ = (CheckConstraint("stars BETWEEN 1 AND 5", name="rating_range"),)
    recipe_id: int = Field(primary_key=True, foreign_key="publicrecipe.id", ondelete="CASCADE")
    member_id: str = Field(primary_key=True, foreign_key="communitymember.id", ondelete="CASCADE")
    stars: int
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SearchUsage(SQLModel, table=True):
    key: str = Field(primary_key=True)
    used: int = 0


class SearchCache(SQLModel, table=True):
    key: str = Field(primary_key=True)
    recipe_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    expires_at: datetime


class SearchSourceReport(SQLModel, table=True):
    # Additive companion table, so existing searchcache databases need no ALTER.
    key: str = Field(primary_key=True)
    sources: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
