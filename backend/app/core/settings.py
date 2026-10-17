from pydantic_settings import BaseSettings
from pathlib import Path
from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

class Settings(BaseSettings):
    # --- App Core ---
    APP_NAME: str = "KitChain"
    ENV: str = "dev"

    # --- Database ---
    DB_URL: str = "sqlite:///./kitchain.db"  # active routes use synchronous SQLModel sessions
    DATABASE_URL: str = DB_URL  # initialized below in __init__

    # --- JWT / Security ---
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"

    # Discovery runs locally. Keys never belong in EXPO_PUBLIC_* variables.
    TAVILY_API_KEY: str = ""
    SEARCH_MONTHLY_CREDITS: int = 1000
    SEARCH_DAILY_PER_MEMBER: int = 20
    SEARCH_MAX_PAGES: int = 3
    TEXT_AI_URL: str = "http://127.0.0.1:11434"
    TEXT_AI_MODEL: str = "qwen3:4b"
    TEXT_AI_ENABLED: bool = True
    TEXT_AI_TIMEOUT: int = 45
    # Operator-confirmed permissions; not an automatic scraping allowlist.
    RECIPE_REUSE_DOMAINS: str = ""

    # --- Frontend / Expo ---
    EXPO_PUBLIC_API_BASE: str = "http://127.0.0.1:8000"

    # --- Paths ---
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "allow"

    def __init__(self, **data):
        super().__init__(**data)
        # Use a synchronous driver when running Alembic (since Alembic can’t use async engines)
        if os.getenv("ALEMBIC_RUN", "0") == "1":
            self.DATABASE_URL = self.DB_URL.replace("+aiosqlite", "")
        else:
            self.DATABASE_URL = self.DB_URL


settings = Settings()

