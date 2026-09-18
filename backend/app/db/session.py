from sqlmodel import SQLModel, create_engine, Session
from backend.app.core.settings import settings

engine = create_engine(settings.DATABASE_URL, echo=False)

SessionLocal = Session


def init_db() -> None:
    """Creates all database tables."""
    SQLModel.metadata.create_all(bind=engine)

