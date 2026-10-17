"""Isolated real SQLite/API fixture shared by scanner and discovery checks."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlmodel import SQLModel, create_engine


class LocalApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.storage = tempfile.TemporaryDirectory(prefix="kitchain-tests-")
        cls.old_cwd = Path.cwd()
        cls.old_db = os.environ.get("DB_URL")
        os.environ["DB_URL"] = f"sqlite:///{cls.storage.name}/test.db"
        os.chdir(cls.storage.name)
        from backend.app.main import app
        from backend.app.db import session as database
        from backend.app.api.v1 import recipes, handwriting_profiles, scans, discovery
        cls.engine = create_engine(os.environ["DB_URL"], connect_args={"check_same_thread": False})
        event.listen(cls.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        cls.routes = recipes
        cls.patches = [patch.object(module, "engine", cls.engine) for module in (database, recipes, handwriting_profiles, scans, discovery)]
        for item in cls.patches:
            item.start()
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        for item in reversed(cls.patches):
            item.stop()
        cls.engine.dispose()
        os.chdir(cls.old_cwd)
        if cls.old_db is None:
            os.environ.pop("DB_URL", None)
        else:
            os.environ["DB_URL"] = cls.old_db
        cls.storage.cleanup()

    def setUp(self):
        SQLModel.metadata.drop_all(self.engine)
        SQLModel.metadata.create_all(self.engine)
