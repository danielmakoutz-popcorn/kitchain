"""Private pantry ownership, stale edits, and the actual ingredient-photo pipeline."""
from io import BytesIO
import json
from pathlib import Path
from unittest.mock import Mock, patch
import unittest

from PIL import Image
import requests
from sqlmodel import Session, select

from support import LocalApiTests

PHOTO = Path(__file__).resolve().parent / "fixtures/recipe.png"


class PantryTests(LocalApiTests):
    def setUp(self):
        super().setUp()
        self.cook = self.client.post("/api/v1/community/members", json={"name": "Pantry cook"}).json()
        self.auth = {"Authorization": "Bearer " + self.cook["token"]}

    def test_pantry_requires_a_cook_and_never_accepts_an_owner_from_the_body(self):
        self.assertEqual(self.client.get("/api/v1/pantry").status_code, 401)
        self.assertEqual(self.client.put("/api/v1/pantry", json={"items": [], "revision": 0}).status_code, 401)
        self.assertEqual(self.client.put("/api/v1/pantry", json={"items": [], "revision": 0, "member_id": "other"}, headers=self.auth).status_code, 422)

    def test_saved_items_survive_new_requests_and_are_private_to_each_cook(self):
        path = "/api/v1/pantry"
        self.assertEqual(self.client.get(path, headers=self.auth).json(), {"items": [], "revision": 0})
        saved = self.client.put(path, json={"items": ["Rice", " rice ", "  Greek   yogurt "], "revision": 0}, headers=self.auth)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json(), {"items": ["rice", "Greek yogurt"], "revision": 1})
        other = self.client.post("/api/v1/community/members", json={"name": "Other cook"}).json()
        other_auth = {"Authorization": "Bearer " + other["token"]}
        self.assertEqual(self.client.get(path, headers=other_auth).json()["items"], [])
        self.client.put(path, json={"items": ["Eggs"], "revision": 0}, headers=other_auth)
        self.assertEqual(self.client.get(path, headers=self.auth).json()["items"], ["rice", "Greek yogurt"])
        self.assertEqual(self.client.get(path, headers=other_auth).json()["items"], ["Eggs"])

    def test_a_stale_screen_cannot_overwrite_or_resurrect_a_cleared_pantry(self):
        path = "/api/v1/pantry"
        self.client.put(path, json={"items": ["Rice"], "revision": 0}, headers=self.auth)
        self.assertEqual(self.client.put(path, json={"items": ["Old draft"], "revision": 0}, headers=self.auth).status_code, 409)
        cleared = self.client.put(path, json={"items": [], "revision": 1}, headers=self.auth)
        self.assertEqual(cleared.json(), {"items": [], "revision": 2})
        stale = self.client.put(path, json={"items": ["Old draft"], "revision": 1}, headers=self.auth)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.client.get(path, headers=self.auth).json(), cleared.json())

    def test_invalid_pantry_values_are_rejected_without_replacing_saved_items(self):
        for items in [[""], [" "], ["a" * 101], [f"food {i}" for i in range(81)], [123]]:
            self.assertEqual(self.client.put("/api/v1/pantry", json={"items": items, "revision": 0}, headers=self.auth).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/pantry", headers=self.auth).json()["items"], [])

    def test_photo_suggestions_require_review_and_do_not_create_scans_or_learn_writers(self):
        from backend.app.services import pantry_vision, ollama_recipe_vision
        from backend.app.models.scan import RecipeScan
        from backend.app.models.discovery import Pantry
        reply = Mock()
        reply.json.return_value = {"response": json.dumps({"ingredients": ["Rice", " rice ", "Bell pepper"], "uncertain_items": ["Cilantro?"]})}
        with patch.object(pantry_vision.requests, "post", return_value=reply) as model:
            response = self.client.post("/api/v1/pantry/photo", files={"file": ("groceries.png", PHOTO.read_bytes(), "image/png")}, headers=self.auth)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["ingredients"], ["rice", "Bell pepper"])
        self.assertEqual(response.json()["uncertain_items"], ["Cilantro?"])
        payload = model.call_args.kwargs["json"]
        self.assertEqual(payload["model"], ollama_recipe_vision.MODEL)
        self.assertEqual(payload["keep_alive"], 0)
        import base64
        with Image.open(BytesIO(base64.b64decode(payload["images"][0]))) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertLessEqual(max(image.size), 1200)
        with Session(self.engine) as session:
            self.assertIsNone(session.get(Pantry, self.cook["id"]))
            self.assertEqual(session.exec(select(RecipeScan)).all(), [])
        self.assertFalse(Path("backend/data/uploads").exists())

    def test_photo_does_not_require_an_extra_model_or_accept_invented_fields(self):
        from backend.app.services import pantry_vision
        reply = Mock()
        reply.json.return_value = {"response": '{"ingredients": ["Rice"], "uncertain_items": [], "fresh_until": "tomorrow"}'}
        with patch.object(pantry_vision.requests, "post", return_value=reply):
            response = self.client.post("/api/v1/pantry/photo", files={"file": ("food.png", PHOTO.read_bytes(), "image/png")}, headers=self.auth)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(self.client.get("/api/v1/pantry", headers=self.auth).json()["items"], [])

    def test_bad_uploads_and_model_failures_leave_the_pantry_intact(self):
        from backend.app.services import pantry_vision
        self.client.put("/api/v1/pantry", json={"items": ["Eggs"], "revision": 0}, headers=self.auth)
        for content, mime, status in [(b"", "image/jpeg", 400), (b"bad image", "image/jpeg", 400), (b"hello", "text/plain", 415), (b"0" * (20 * 1024 * 1024 + 1), "image/png", 413)]:
            self.assertEqual(self.client.post("/api/v1/pantry/photo", files={"file": ("photo", content, mime)}, headers=self.auth).status_code, status)
        for failure, status in [(requests.Timeout(), 504), (requests.ConnectionError(), 503)]:
            with patch.object(pantry_vision.requests, "post", side_effect=failure):
                self.assertEqual(self.client.post("/api/v1/pantry/photo", files={"file": ("food.png", PHOTO.read_bytes(), "image/png")}, headers=self.auth).status_code, status)
        self.assertEqual(self.client.get("/api/v1/pantry", headers=self.auth).json()["items"], ["Eggs"])


class CompressedReaderTests(unittest.TestCase):
    def fetch(self, body, encoding, limit=2048):
        from backend.app.services import recipe_reader as reader
        connection = Mock()
        response = connection.getresponse.return_value
        response.status = 200
        response.getheader.side_effect = lambda key, default=None: {"Content-Type": "text/html; charset=utf-8", "Content-Encoding": encoding}.get(key, default)
        response.read.return_value = body
        with patch.object(reader, "public_address", return_value="93.184.216.34"), patch.object(reader.http.client, "HTTPSConnection", return_value=connection):
            return reader.fetch_page("https://recipes.example/rice", max_bytes=limit)

    def test_gzip_and_deflate_pages_can_be_read_with_the_same_download_bound(self):
        import gzip
        import zlib
        body = b"<html>Published recipe</html>"
        for encoding, compressed in [("gzip", gzip.compress(body)), ("deflate", zlib.compress(body))]:
            self.assertEqual(self.fetch(compressed, encoding)[1], body.decode())

    def test_large_or_invalid_compressed_pages_are_rejected(self):
        import gzip
        import zlib
        from backend.app.services.recipe_reader import PageReadError
        for encoding, compressed in [("gzip", gzip.compress(b"x" * 10000)), ("deflate", zlib.compress(b"x" * 10000))]:
            with self.assertRaisesRegex(PageReadError, "too large"):
                self.fetch(compressed, encoding, limit=512)
        with self.assertRaises(PageReadError):
            self.fetch(b"bad gzip", "gzip")
