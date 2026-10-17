"""Real API/SQLite/image tests with only the local model's HTTP response mocked.

Run from the repository root: python -m unittest discover -s tests -v
Every database and image is synthetic and lives in a temporary directory.
"""
from concurrent.futures import ThreadPoolExecutor
import base64
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
from threading import Barrier, Event
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from PIL import Image
import requests

from backend.app.services import ollama_recipe_vision as vision
from support import LocalApiTests


class PhotoScanningTests(LocalApiTests):
    def setUp(self):
        from sqlmodel import SQLModel
        SQLModel.metadata.drop_all(self.engine)
        SQLModel.metadata.create_all(self.engine)
        for image in Path("backend/data").rglob("*.jpg"):
            image.unlink()

    @staticmethod
    def photo(size=(80, 50)):
        image = BytesIO()
        Image.new("RGB", size, "white").save(image, format="PNG")
        return image.getvalue()

    @staticmethod
    def model_response(**changes):
        recipe = {
            "title": "Synthetic Soup", "ingredients": ["1 cup water", "2 eggs"],
            "steps": ["Mix", "Heat gently"], "notes": ["Serve warm"], "uncertain_words": [],
        }
        recipe.update(changes)
        response = Mock()
        response.json.return_value = {"response": json.dumps(recipe)}
        return response

    def scan(self, query=""):
        return self.client.post(f"/api/v1/recipes/scan{query}", files={"file": ("card.png", self.photo(), "image/png")})

    def test_default_scan_uses_ai_and_persists_review(self):
        with patch.object(vision.requests, "post", return_value=self.model_response()) as model:
            response = self.scan()
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertIsInstance(data["scan_id"], int)
        self.assertEqual(data["mode"], "handwritten")
        self.assertEqual(data["notes"], ["Serve warm"])
        stored = self.client.get(f"/api/v1/scans/{data['scan_id']}").json()
        self.assertEqual(stored["parsed_recipe"]["ingredients"], ["1 cup water", "2 eggs"])
        self.assertTrue(Path(stored["image_path"]).exists())
        self.assertFalse(list(Path("backend/data/uploads").glob("*_ollama_small.jpg")))
        payload = model.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "qwen2.5vl:3b")
        self.assertEqual(payload["options"], {"temperature": 0.1, "num_ctx": 4096})
        encoded_image = base64.b64decode(payload["images"][0])
        with Image.open(BytesIO(encoded_image)) as image:
            self.assertEqual(image.size, (80, 50))

    def test_ingredient_objects_become_editable_lines_without_doubled_amounts(self):
        response = self.model_response(ingredients=[{"name": "eggs", "quantity": "2"}, {"name": "1 cup water", "quantity": "1 cup"}], steps="Mix gently")
        with patch.object(vision.requests, "post", return_value=response):
            data = self.scan().json()
        self.assertEqual(data["ingredients"], ["2 eggs", "1 cup water"])
        self.assertEqual(data["steps"], ["Mix gently"])

    def test_correction_record_and_repeated_writer_corrections_persist(self):
        profile = self.client.post("/api/v1/handwriting-profiles/", json={"name": "Synthetic writer"}).json()
        with patch.object(vision.requests, "post", return_value=self.model_response(title="Sop")):
            scan = self.scan(f"?handwriting_profile_id={profile['id']}").json()
        payload = {"title": "Soup", "ingredients": ["1 cup water", "2 eggs"], "steps": ["Mix", "Heat gently"], "handwriting_profile_id": profile["id"]}
        for _ in range(2):
            corrected = self.client.patch(f"/api/v1/scans/{scan['scan_id']}/correction", json=payload)
            self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertEqual(corrected.json()["corrected_recipe"]["title"], "Soup")
        stored_profile = self.client.get("/api/v1/handwriting-profiles/").json()[0]
        self.assertEqual(stored_profile["common_corrections"][0]["count"], 2)
        # Explicit Unknown must detach the writer rather than attributing corrections to them.
        payload["handwriting_profile_id"] = None
        corrected = self.client.patch(f"/api/v1/scans/{scan['scan_id']}/correction", json=payload)
        self.assertIsNone(corrected.json()["handwriting_profile_id"])

    def test_printed_scanner_is_rejected_without_calling_ai(self):
        with patch.object(vision.requests, "post") as model:
            self.assertEqual(self.scan("?mode=printed").status_code, 422)
        model.assert_not_called()

    def test_invalid_writer_is_rejected_before_ai(self):
        with patch.object(vision.requests, "post") as model:
            self.assertEqual(self.scan("?handwriting_profile_id=999").status_code, 404)
        model.assert_not_called()

    def test_ai_failures_are_actionable_and_clean_up_images(self):
        for error, status in [(requests.ConnectionError("private details"), 503), (requests.Timeout(), 504), (requests.HTTPError(), 502)]:
            with self.subTest(status=status), patch.object(vision.requests, "post", side_effect=error):
                response = self.scan()
                self.assertEqual(response.status_code, status, response.text)
                self.assertNotIn("private details", response.text)
                self.assertFalse(list(Path("backend/data/uploads").glob("*.jpg")))
                self.assertEqual(self.client.get("/api/v1/scans/").json(), [])

    def test_invalid_or_empty_model_output_is_not_saved_as_a_recipe(self):
        for output in ["not JSON", "[]", "{}", '{"title":"Soup","steps":[{}]}']:
            response = Mock()
            response.json.return_value = {"response": output}
            with self.subTest(output=output), patch.object(vision.requests, "post", return_value=response):
                self.assertEqual(self.scan().status_code, 502)
                self.assertFalse(list(Path("backend/data/uploads").glob("*.jpg")))

    def test_upload_errors_are_rejected_before_ai(self):
        with patch.object(vision.requests, "post") as model:
            for content, mime, status in [(b"", "image/png", 400), (b"not an image", "image/png", 400), (b"text", "text/plain", 415)]:
                with self.subTest(status=status):
                    response = self.client.post("/api/v1/recipes/scan", files={"file": ("test", content, mime)})
                    self.assertEqual(response.status_code, status)
            with patch.object(self.routes, "MAX_SCAN_BYTES", 16):
                self.assertEqual(self.scan().status_code, 413)
        model.assert_not_called()

    def test_missing_fields_are_visible_review_hints(self):
        with patch.object(vision.requests, "post", return_value=self.model_response(ingredients=[], steps=[], uncertain_words=["illegible amount"])):
            response = self.scan()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["confidence"], "low")
        self.assertEqual(response.json()["uncertain_lines"], ["illegible amount", "No ingredients detected", "No steps detected"])

    def test_api_health_remains_responsive_while_ai_reads(self):
        started, release = Event(), Event()
        def slow_model(*args, **kwargs):
            started.set()
            release.wait(5)
            return self.model_response()
        with patch.object(vision.requests, "post", side_effect=slow_model), ThreadPoolExecutor() as pool:
            scan = pool.submit(self.scan)
            try:
                self.assertTrue(started.wait(3))
                self.assertEqual(self.client.get("/api/v1/health").status_code, 200)
                self.assertFalse(scan.done(), "Health was blocked until the model finished")
            finally:
                release.set()
            self.assertEqual(scan.result(timeout=3).status_code, 200)

    def test_recipe_crud_and_photo_upload_with_actual_sqlite(self):
        created = self.client.post("/api/v1/recipes/", json={"title": "Test recipe", "ingredients": ["2 eggs"], "steps": ["Mix"]})
        self.assertEqual(created.status_code, 200, created.text)
        recipe = created.json()
        path = f"/api/v1/recipes/{recipe['id']}"
        self.assertEqual(self.client.get(path).json()["ingredients"], ["2 eggs"])
        recipe["title"] = "Updated recipe"
        self.assertEqual(self.client.patch(path, json=recipe).json()["title"], "Updated recipe")
        uploaded = self.client.post(f"{path}/photo", files={"file": ("photo.png", self.photo((2000, 1000)), "image/png")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        with Image.open(BytesIO(self.client.get(uploaded.json()["image_path"]).content)) as image:
            self.assertEqual(image.size, (1600, 800))
        self.assertEqual(self.client.delete(path).status_code, 200)
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_scanned_recipe_automatically_keeps_its_own_source_photo(self):
        with patch.object(vision.requests, "post", return_value=self.model_response()):
            scan = self.scan().json()
        source = self.client.get(f"/api/v1/scans/{scan['scan_id']}").json()
        source_path = Path(source["image_path"])
        source_bytes = source_path.read_bytes()
        created = self.client.post(f"/api/v1/recipes/?source_scan_id={scan['scan_id']}", json={
            "title": "Reviewed Soup", "ingredients": scan["ingredients"], "steps": scan["steps"],
        })
        self.assertEqual(created.status_code, 200, created.text)
        recipe = created.json()
        self.assertTrue(recipe["image_path"].startswith("/recipe_photos/"))
        self.assertEqual(self.client.get(recipe["image_path"]).content, source_bytes)
        # Recipe photo survives independently of the retained scan/draft source.
        source_path.unlink()
        self.assertEqual(self.client.get(recipe["image_path"]).content, source_bytes)
        self.assertEqual(self.client.get(f"/api/v1/recipes/{recipe['id']}").json()["title"], "Reviewed Soup")

    def test_missing_scan_or_source_photo_does_not_create_a_partial_recipe(self):
        missing = self.client.post("/api/v1/recipes/?source_scan_id=999", json={"title": "Draft"})
        self.assertEqual(missing.status_code, 404)
        with patch.object(vision.requests, "post", return_value=self.model_response()):
            scan = self.scan().json()
        source = self.client.get(f"/api/v1/scans/{scan['scan_id']}").json()
        Path(source["image_path"]).unlink()
        missing_photo = self.client.post(f"/api/v1/recipes/?source_scan_id={scan['scan_id']}", json={"title": "Draft"})
        self.assertEqual(missing_photo.status_code, 409)
        self.assertEqual(self.client.get("/api/v1/recipes/").json(), [])

    def test_photo_copy_failure_rolls_back_recipe_and_removes_partial_image(self):
        with patch.object(vision.requests, "post", return_value=self.model_response()):
            scan = self.scan().json()
        def failed_copy(source, destination):
            Path(destination).write_bytes(b"partial")
            raise OSError("Synthetic storage failure")
        with patch.object(self.routes.shutil, "copyfile", side_effect=failed_copy), self.assertLogs(self.routes.logger, level="ERROR"):
            response = self.client.post(f"/api/v1/recipes/?source_scan_id={scan['scan_id']}", json={"title": "Draft"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.client.get("/api/v1/recipes/").json(), [])
        self.assertFalse(list(Path("backend/data/recipe_photos").glob("*.jpg")))

    def test_recovered_scan_save_returns_the_same_recipe_after_a_retry(self):
        with patch.object(vision.requests, "post", return_value=self.model_response()):
            scan = self.scan().json()
        path = f"/api/v1/recipes/?source_scan_id={scan['scan_id']}"
        first = self.client.post(path, json={"title": "Already saved"})
        self.assertEqual(first.status_code, 200, first.text)
        source = self.client.get(f"/api/v1/scans/{scan['scan_id']}").json()
        Path(source["image_path"]).unlink()
        second = self.client.post(path, json={"title": "Already saved"})
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(second.json()["id"], first.json()["id"])
        self.assertEqual(second.json()["title"], "Already saved")
        self.assertEqual(len(self.client.get("/api/v1/recipes/").json()), 1)
        self.assertEqual(len(list(Path("backend/data/recipe_photos").glob("*.jpg"))), 1)
        changed_draft = self.client.post(path, json={"title": "Different unsaved edits"})
        self.assertEqual(changed_draft.status_code, 409)
        self.assertIn("draft has been kept", changed_draft.json()["detail"])
        self.assertEqual(self.client.get(f"/api/v1/recipes/{first.json()['id']}").json()["title"], "Already saved")
        self.assertEqual(self.client.delete(f"/api/v1/recipes/{first.json()['id']}").status_code, 200)

    def test_overlapping_scan_save_retries_create_one_recipe_and_photo(self):
        with patch.object(vision.requests, "post", return_value=self.model_response()):
            scan = self.scan().json()
        path = f"/api/v1/recipes/?source_scan_id={scan['scan_id']}"
        from sqlmodel import Session
        from backend.app.models.scan import ScanRecipeLink
        gate = Barrier(2)
        original_get = Session.get
        def overlapping_get(session, model, identity, *args, **kwargs):
            result = original_get(session, model, identity, *args, **kwargs)
            if model is ScanRecipeLink and result is None:
                gate.wait(timeout=3)  # Both requests must observe "not saved" before either inserts.
            return result
        with patch.object(Session, "get", new=overlapping_get), ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.client.post, path, json={"title": "Concurrent save"}) for _ in range(2)]
            results = [future.result(timeout=5) for future in futures]
        self.assertTrue(all(response.status_code == 200 for response in results), [r.text for r in results])
        self.assertEqual(results[0].json()["id"], results[1].json()["id"])
        self.assertEqual(len(self.client.get("/api/v1/recipes/").json()), 1)
        self.assertEqual(len(list(Path("backend/data/recipe_photos").glob("*.jpg"))), 1)


if __name__ == "__main__":
    unittest.main()
