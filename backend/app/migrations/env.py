import os
import sys
from pathlib import Path

# 🔧 Ensure project root is in sys.path for absolute imports
BASE_DIR = Path(__file__).resolve().parents[3]
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

# ✅ Set Alembic sync mode
os.environ["ALEMBIC_RUN"] = "1"

from logging.config import fileConfig
from alembic import context
from backend.app.db.session import engine
from backend.app.models import SQLModel

# Alembic Config object
config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_online():
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()

