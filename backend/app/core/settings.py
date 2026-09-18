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
    DB_URL: str = "sqlite+aiosqlite:///./kitchain.db"  # main runtime DB
    DATABASE_URL: str = DB_URL  # initialized below in __init__

    # --- JWT / Security ---
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"

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

