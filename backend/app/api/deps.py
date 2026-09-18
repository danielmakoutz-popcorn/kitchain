from typing import AsyncGenerator
from backend.app.db.session import AsyncSessionLocal

async def get_session() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session
