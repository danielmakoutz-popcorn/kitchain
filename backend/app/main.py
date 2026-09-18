from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# Import models before init_db so SQLModel sees every table.
from backend.app.models.recipe import Recipe  # noqa: F401
from backend.app.models.user import User  # noqa: F401
from backend.app.models.handwriting_profile import HandwritingProfile  # noqa: F401
from backend.app.models.scan import RecipeScan  # noqa: F401

from backend.app.db.session import init_db
from backend.app.api.v1 import recipes, handwriting_profiles, scans

app = FastAPI(title="KitChain API", version="1.0.0")
Path("backend/data/recipe_photos").mkdir(parents=True, exist_ok=True)
app.mount("/recipe_photos", StaticFiles(directory="backend/data/recipe_photos"), name="recipe_photos")

@app.on_event("startup")
def on_startup() -> None:
    """
    Runs once at app startup and ensures database tables are created.
    In production, Alembic should handle migrations; this keeps dev fast.
    """
    init_db()


@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "app": "KitChain API"}


app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["Recipes"])
app.include_router(handwriting_profiles.router, prefix="/api/v1/handwriting-profiles", tags=["Handwriting Profiles"])
app.include_router(scans.router, prefix="/api/v1/scans", tags=["Scans"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
