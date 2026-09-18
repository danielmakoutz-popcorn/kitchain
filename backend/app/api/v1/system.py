from fastapi import APIRouter
from backend.app.core.settings import settings

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENV}
