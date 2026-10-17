from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class MemberCreate(StrictInput):
    name: str = Field(default="Home cook", min_length=1, max_length=40)


class RatingInput(StrictInput):
    stars: int = Field(ge=1, le=5, strict=True)
    cooked: Literal[True]


class IngredientOverride(StrictInput):
    food_id: int | None = Field(default=None, gt=0)
    grams: float | None = Field(default=None, gt=0, le=1000000)
    ignored: bool = False


class NutritionInput(StrictInput):
    servings: float | None = Field(default=None, ge=.01, le=10000)
    ingredient_hash: str = Field(default="", max_length=64)
    overrides: dict[str, IngredientOverride] = Field(default_factory=dict, max_length=200)


class RecommendInput(StrictInput):
    query: str = Field(min_length=2, max_length=500)
    pantry: list[str] = Field(default_factory=list, max_length=80)
    excluded: list[str] = Field(default_factory=list, max_length=30)
    max_minutes: float | None = Field(default=None, gt=0, le=2880)
    min_protein: float | None = Field(default=None, ge=0, le=500)
    max_calories: float | None = Field(default=None, gt=0, le=20000)
    mode: Literal["family", "public"] = "family"
    allow_web: bool = True

    @field_validator("pantry", "excluded")
    @classmethod
    def short_items(cls, value):
        if any(not x.strip() or len(x) > 100 for x in value):
            raise ValueError("Use short ingredient names, one per item.")
        return list(dict.fromkeys(x.strip().lower() for x in value))


class ImportInput(StrictInput):
    url: str = Field(min_length=8, max_length=2048)


class PublishInput(StrictInput):
    own_recipe: Literal[True]
    servings: float | None = Field(default=None, ge=.01, le=10000)
