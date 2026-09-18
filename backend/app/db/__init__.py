from .session import engine, SessionLocal, init_db
from sqlmodel import SQLModel
from typing import Generator
from sqlalchemy.orm import Session


def get_db() -> Generator[Session, None, None]:
    """Yields a database session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = ["engine", "SessionLocal", "init_db", "get_db"]

