"""Real routes, arithmetic and database constraints; no paid/live model calls."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
from unittest.mock import Mock, patch
import unittest

from fastapi import HTTPException
from sqlmodel import Session, select

from support import LocalApiTests


class DiscoveryTests(LocalApiTests):
    def setUp(self):
        super().setUp()
        from backend.app.core.settings import settings
        self.settings = settings
        self.config = patch.multiple(settings, TEXT_AI_ENABLED=False, TAVILY_API_KEY="", SEARCH_MONTHLY_CREDITS=1000, SEARCH_DAILY_PER_MEMBER=20, RECIPE_REUSE_DOMAINS="")
        self.config.start()
        self.addCleanup(self.config.stop)
        from backend.app.models.discovery import NutritionFood
        foods = [
            NutritionFood(id=1001, description="Rice, cooked", search_text="rice cooked", calories=130, protein=2.7, carbs=28, fat=.3, fiber=.4, portions=[{"unit": "cup", "grams": 158, "amount": 1}]),
            NutritionFood(id=1002, description="Chicken, breast, cooked", search_text="chicken breast cooked", calories=165, protein=31, carbs=0, fat=3.6, fiber=0),
            NutritionFood(id=1003, description="Oil, olive", search_text="oil olive", calories=884, protein=0, carbs=0, fat=100, fiber=0, portions=[{"unit": "tbsp", "grams": 13.5, "amount": 1}, {"unit": "cup", "grams": 216, "amount": 1}]),
            NutritionFood(id=1004, description="Egg, whole, raw", search_text="egg whole raw", calories=143, protein=12.6, carbs=.7, fat=9.5, fiber=0, portions=[{"unit": "large", "grams": 50, "amount": 1}, {"unit": "cup (4.86 large eggs)", "grams": 243, "amount": 1}]),
        ]
        with Session(self.engine) as session:
            session.add_all(foods)
            session.commit()
        self.member = self.client.post("/api/v1/community/members", json={"name": "Synthetic cook"}).json()
        self.auth = {"Authorization": f"Bearer {self.member['token']}"}

    def family_recipe(self, **changes):
        payload = {"title": "Chicken rice bowl", "ingredients": ["100 g chicken breast cooked", "100 g rice cooked"], "steps": ["Warm the cooked ingredients together."]}
        payload.update(changes)
        response = self.client.post("/api/v1/recipes/", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    @staticmethod
    def web_recipe(**changes):
        data = {"title": "Published chicken rice", "ingredients": ["100 g chicken breast cooked", "100 g rice cooked"], "steps": ["Warm the cooked ingredients together."], "source_url": "https://recipes.example/chicken-rice", "source_name": "Synthetic Recipe Kitchen", "source_author": "Test Author", "license_url": None, "reuse_status": "link_only", "servings": 2, "total_minutes": 20}
        data.update(changes)
        return data

    def saved_public(self, **changes):
        from backend.app.services.discovery import save_web_recipe
        with Session(self.engine) as session:
            return save_web_recipe(session, self.web_recipe(**changes)).id

    def recommend(self, **changes):
        data = {"query": "chicken rice", "allow_web": False}
        data.update(changes)
        response = self.client.post("/api/v1/discovery/recommendations", json=data, headers=self.auth)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_self_hosted_catalog_is_original_usda_and_reproducible(self):
        from backend.app.models.discovery import NutritionFood
        from backend.app.services.nutrition import SEED, seed_nutrition
        manifest = json.loads((SEED.parent / "manifest.json").read_text())
        content = gzip.decompress(SEED.read_bytes())
        self.assertEqual(hashlib.sha256(content).hexdigest(), manifest["normalized_json_sha256"])
        self.assertEqual(manifest["records"], 7793)
        self.assertEqual(manifest["license"], "CC0-1.0")
        with Session(self.engine) as session:
            for food in session.exec(select(NutritionFood)).all():
                session.delete(food)
            session.commit()
        self.assertEqual(seed_nutrition(self.engine), 7793)
        self.assertEqual(seed_nutrition(self.engine), 0)
        with Session(self.engine) as session:
            butter = session.get(NutritionFood, 173410)
            self.assertEqual(butter.description, "Butter, salted")
            self.assertEqual(butter.calories, 717)
            from backend.app.services.nutrition import food_candidates
            self.assertEqual(food_candidates(session, "rice cooked")[0]["id"], 168878)
            self.assertEqual(food_candidates(session, "chicken breast cooked")[0]["id"], 171477)

    def test_quantities_use_food_specific_portions_and_fraction_parsing(self):
        from backend.app.services.nutrition import calculate, parse_ingredient
        for line, quantity in [("1½ cups rice cooked", 1.5), ("1 1/2 cups rice cooked", 1.5), ("½ cup rice cooked", .5)]:
            self.assertEqual(parse_ingredient(line)["amount"], quantity)
        with Session(self.engine) as session:
            result = calculate(session, ["1/2 cup rice cooked", "2 large eggs"], servings=2)
        self.assertTrue(result["complete"])
        self.assertEqual(result["rows"][0]["grams"], 79)
        self.assertEqual(result["rows"][1]["grams"], 100)
        self.assertLessEqual(abs(result["per_serving"]["calories"] - 122.85), .051)

    def test_missing_foods_or_amounts_do_not_become_zero_calorie_totals(self):
        from backend.app.services.nutrition import calculate
        with Session(self.engine) as session:
            result = calculate(session, ["100 g rice cooked", "a pinch of mystery seasoning"], servings=2)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["totals"])
        self.assertIsNone(result["per_serving"])
        self.assertEqual(result["known_totals"]["calories"], 130)
        self.assertEqual(result["unresolved_count"], 1)

    def test_range_unknown_servings_and_incompatible_volume_remain_visible(self):
        from backend.app.services.nutrition import calculate
        with Session(self.engine) as session:
            ranged = calculate(session, ["1-2 cups rice cooked"], 2)
            no_density = calculate(session, ["1 cup chicken breast cooked"], 2)
            no_servings = calculate(session, ["100 g rice cooked"])
        self.assertFalse(ranged["complete"])
        self.assertFalse(no_density["complete"])
        self.assertIsNone(no_servings["per_serving"])
        self.assertEqual(no_servings["totals"]["calories"], 130)

    def test_corrections_persist_and_stale_edits_are_rejected(self):
        recipe = self.family_recipe(ingredients=["some rice"])
        path = f"/api/v1/nutrition/recipes/{recipe['id']}"
        info = self.client.get(path).json()
        payload = {"ingredient_hash": info["ingredient_hash"], "servings": 2, "overrides": {"0": {"food_id": 1001, "grams": 200}}}
        saved = self.client.put(path, json=payload)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["per_serving"]["calories"], 130)
        self.assertTrue(saved.json()["reviewed"])
        self.assertEqual(self.client.get(path).json()["saved_overrides"]["0"]["grams"], 200)
        changed = self.client.patch(f"/api/v1/recipes/{recipe['id']}", json={**recipe, "ingredients": ["100 g chicken breast cooked"]})
        self.assertEqual(changed.status_code, 200)
        self.assertTrue(self.client.get(path).json()["matches_reset"])
        self.assertEqual(self.client.put(path, json=payload).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/v1/recipes/{recipe['id']}").status_code, 200)

    def test_invalid_corrections_and_nonfinite_numbers_are_rejected(self):
        recipe = self.family_recipe()
        path = f"/api/v1/nutrition/recipes/{recipe['id']}"
        key = self.client.get(path).json()["ingredient_hash"]
        for data in [{"servings": 0}, {"overrides": {"8": {"grams": 10}}}, {"overrides": {"00": {"grams": 10}}}, {"overrides": {"0": {"food_id": 99999}}}, {"overrides": {"0": {"grams": -1}}}]:
            self.assertEqual(self.client.put(path, json={"ingredient_hash": key, **data}).status_code, 422)
        response = self.client.put(path, content=json.dumps({"ingredient_hash": key, "servings": float("nan")}), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 422)

    def test_unknown_source_is_public_link_card_without_copied_instructions(self):
        record_id = self.saved_public()
        data = self.client.get(f"/api/v1/public/recipes/{record_id}").json()
        self.assertEqual(data["source_author"], "Test Author")
        self.assertEqual(data["ingredients"], [])
        self.assertEqual(data["steps"], [])
        self.assertNotIn("rows", data["nutrition"])
        self.assertIn("chicken breast cooked", data["ingredient_names"])
        self.assertFalse(data["can_copy"])
        self.assertEqual(self.client.post(f"/api/v1/public/recipes/{record_id}/copy", headers=self.auth).status_code, 409)

    def test_permitted_copy_preserves_attribution_and_cannot_be_claimed_as_own(self):
        record_id = self.saved_public(reuse_status="licensed", license_url="https://creativecommons.org/licenses/by/4.0/")
        copied = self.client.post(f"/api/v1/public/recipes/{record_id}/copy", headers=self.auth)
        self.assertEqual(copied.status_code, 201, copied.text)
        recipe_id = copied.json()["id"]
        source = self.client.get(f"/api/v1/nutrition/recipes/{recipe_id}/source").json()
        self.assertEqual(source["source_author"], "Test Author")
        self.assertEqual(source["license_url"], "https://creativecommons.org/licenses/by/4.0/")
        self.assertEqual(self.client.post(f"/api/v1/public/from-family/{recipe_id}", json={"own_recipe": True}, headers=self.auth).status_code, 409)

    def test_family_recipes_and_photos_are_never_automatically_public(self):
        recipe = self.family_recipe(image_path="/recipe_photos/private.jpg")
        self.assertEqual(self.client.get("/api/v1/public/recipes").json(), [])
        self.assertEqual(self.recommend(mode="public")["choices"], [])
        shared = self.client.post(f"/api/v1/public/from-family/{recipe['id']}", json={"own_recipe": True}, headers=self.auth)
        self.assertEqual(shared.status_code, 200, shared.text)
        self.assertNotIn("image_path", shared.json())
        self.assertNotIn("handwriting_profile_id", shared.json())
        self.assertNotIn("token_hash", shared.text)
        self.assertEqual(len(self.recommend(mode="public")["choices"]), 1)

    def test_ratings_require_cooking_and_replace_one_cooks_previous_vote(self):
        recipe_id = self.saved_public()
        path = f"/api/v1/public/recipes/{recipe_id}/rating"
        self.assertEqual(self.client.put(path, json={"stars": 5, "cooked": True}).status_code, 401)
        self.assertEqual(self.client.put(path, json={"stars": 5, "cooked": False}, headers=self.auth).status_code, 422)
        for stars in [0, 6, 3.5, "5"]:
            self.assertEqual(self.client.put(path, json={"stars": stars, "cooked": True}, headers=self.auth).status_code, 422)
        first = self.client.put(path, json={"stars": 5, "cooked": True}, headers=self.auth)
        self.assertEqual(first.json()["rating_count"], 1)
        second = self.client.put(path, json={"stars": 3, "cooked": True}, headers=self.auth)
        self.assertEqual(second.json()["rating_count"], 1)
        self.assertEqual(second.json()["rating_average"], 3)
        member2 = self.client.post("/api/v1/community/members", json={"name": "Other cook"}).json()
        third = self.client.put(path, json={"stars": 5, "cooked": True}, headers={"Authorization": f"Bearer {member2['token']}"})
        self.assertEqual(third.json()["rating_average"], 4)
        self.assertEqual(third.json()["rating_count"], 2)
        self.client.delete(path, headers=self.auth)
        self.assertEqual(self.client.get(path.removesuffix("/rating")).json()["rating_count"], 1)

    def test_only_contributor_can_remove_public_copy_and_family_original_survives(self):
        recipe = self.family_recipe()
        shared = self.client.post(f"/api/v1/public/from-family/{recipe['id']}", json={"own_recipe": True}, headers=self.auth).json()
        path = f"/api/v1/public/recipes/{shared['id']}"
        other = self.client.post("/api/v1/community/members", json={"name": "Other"}).json()
        self.assertEqual(self.client.delete(path, headers={"Authorization": f"Bearer {other['token']}"}).status_code, 404)
        self.client.put(path + "/rating", json={"stars": 4, "cooked": True}, headers=self.auth)
        self.assertEqual(self.client.delete(path, headers=self.auth).status_code, 200)
        self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/recipes/{recipe['id']}").status_code, 200)

    def test_deleting_family_metadata_works_without_sqlite_cascades(self):
        from sqlmodel import SQLModel, create_engine
        from backend.app.models.recipe import Recipe
        from backend.app.models.discovery import RecipeInfo
        from backend.app.api.v1 import recipes
        local = create_engine(f"sqlite:///{self.storage.name}/no-cascades.db")
        SQLModel.metadata.create_all(local)
        with Session(local) as session:
            session.add(Recipe(id=1, title="Old imported card"))
            session.flush()
            session.add(RecipeInfo(recipe_id=1, source_url="https://recipes.example/old", servings=2))
            session.commit()
        with patch.object(recipes, "engine", local):
            self.assertEqual(self.client.delete("/api/v1/recipes/1").status_code, 200)
            created = self.family_recipe(title="New card")
        self.assertEqual(created["id"], 1)
        with Session(local) as session:
            self.assertIsNone(session.get(RecipeInfo, 1))
        local.dispose()

    def test_reused_family_ids_do_not_overwrite_an_older_public_recipe(self):
        first = self.family_recipe()
        path = f"/api/v1/public/from-family/{first['id']}"
        published = self.client.post(path, json={"own_recipe": True}, headers=self.auth).json()
        self.client.delete(f"/api/v1/recipes/{first['id']}")
        second = self.family_recipe(title="Different family recipe")
        self.assertEqual(first["id"], second["id"])
        newer = self.client.post(path, json={"own_recipe": True}, headers=self.auth).json()
        self.assertNotEqual(published["id"], newer["id"])
        self.assertEqual(self.client.get(f"/api/v1/public/recipes/{published['id']}").json()["title"], first["title"])

    def test_good_catalog_match_does_not_spend_a_search_credit(self):
        from backend.app.services import discovery
        self.family_recipe()
        with patch.object(discovery, "web_search", side_effect=AssertionError("Should not search")):
            result = self.recommend(allow_web=True, pantry=["rice", "chicken"])
        self.assertFalse(result["searched_web"])
        self.assertEqual(len(result["choices"]), 1)
        self.assertEqual(result["choices"][0]["missing_ingredients"], [])

    def test_hard_filters_exclude_unknown_macros_times_and_blocked_ingredients(self):
        recipe_id = self.saved_public()
        self.assertEqual(self.recommend(max_minutes=10)["choices"], [])
        self.assertEqual(self.recommend(min_protein=30)["choices"], [])
        self.assertEqual(self.recommend(excluded=["chicken"])["choices"], [])
        self.assertEqual(self.recommend(max_calories=100)["choices"], [])
        self.assertEqual(self.recommend(max_minutes=30, min_protein=10, max_calories=300)["choices"][0]["id"], recipe_id)
        self.family_recipe()
        self.assertTrue(all(c["kind"] == "public" for c in self.recommend(max_minutes=30)["choices"]))

    def test_pantry_coverage_does_not_make_an_unrelated_recipe_a_match(self):
        self.family_recipe(title="Plain rice", ingredients=["100 g rice cooked"])
        recipe_id = self.saved_public()
        choices = self.recommend(query="chicken", pantry=["rice"])["choices"]
        self.assertEqual([choice["id"] for choice in choices], [recipe_id])
        self.assertTrue(all(choice["kind"] == "public" for choice in choices))

    def test_diet_words_in_a_title_do_not_exclude_a_compatible_recipe(self):
        self.family_recipe(title="Dairy-free rice", ingredients=["100 g rice cooked"])
        self.assertEqual(len(self.recommend(query="dairy-free rice")["choices"]), 1)

    def test_explicit_query_exclusions_work_without_the_text_model(self):
        self.family_recipe(title="Chicken with peanuts", ingredients=["100 g chicken breast cooked", "20 g peanuts"])
        self.assertEqual(self.recommend(query="chicken without peanuts")["choices"], [])

    def test_named_alternatives_are_handled_without_overriding_explicit_exclusions(self):
        from backend.app.services.discovery import ingredient_is_blocked, exclusions
        blocked = exclusions(["dairy", "gluten"], "")
        self.assertFalse(ingredient_is_blocked("coconut milk", blocked, ["dairy", "gluten"]))
        self.assertFalse(ingredient_is_blocked("rice flour", blocked, ["dairy", "gluten"]))
        self.assertTrue(ingredient_is_blocked("wheat flour", blocked, ["dairy", "gluten"]))
        self.assertTrue(ingredient_is_blocked("coconut milk", blocked, ["milk"]))

    def test_cook_feedback_breaks_ties_between_relevant_public_recipes(self):
        self.saved_public()
        second = self.saved_public(source_url="https://recipes.example/chicken-rice-2")
        self.client.put(f"/api/v1/public/recipes/{second}/rating", json={"stars": 5, "cooked": True}, headers=self.auth)
        choices = self.recommend()["choices"]
        self.assertEqual(choices[0]["id"], second)
        self.assertEqual(choices[0]["rating_count"], 1)

    def test_missing_key_or_exhausted_quota_is_a_notice_not_a_broken_collection(self):
        result = self.recommend(allow_web=True)
        self.assertIn("not set up", " ".join(result["warnings"]))
        self.settings.TAVILY_API_KEY = "synthetic-key"
        self.settings.SEARCH_MONTHLY_CREDITS = 0
        result = self.recommend(allow_web=True)
        self.assertIn("allowance", " ".join(result["warnings"]))
        self.assertEqual(result["choices"], [])

    def test_basic_tavily_search_saves_sourced_card_and_uses_one_credit(self):
        from backend.app.services import discovery
        self.settings.TAVILY_API_KEY = "synthetic-key"
        response = Mock()
        response.json.return_value = {"results": [{"url": "https://recipes.example/chicken-rice", "content": "Never use snippets as recipes"}]}
        with patch.object(discovery.requests, "post", return_value=response) as search, patch.object(discovery, "read_recipe", return_value=self.web_recipe()):
            result = self.recommend(allow_web=True)
        self.assertTrue(result["searched_web"])
        self.assertEqual(result["usage"]["monthly_used"], 1)
        self.assertEqual(result["choices"][0]["source_author"], "Test Author")
        payload = search.call_args.kwargs["json"]
        self.assertEqual(payload["search_depth"], "basic")
        self.assertFalse(payload["auto_parameters"])
        self.assertFalse(payload["include_raw_content"])
        self.assertNotIn("synthetic-key", json.dumps(result))
        self.assertEqual(self.recommend(allow_web=True)["usage"]["monthly_used"], 1)

    def test_unreadable_sources_are_not_replaced_with_invented_recipe_text(self):
        from backend.app.services import discovery
        from backend.app.services.recipe_reader import PageReadError
        self.settings.TAVILY_API_KEY = "synthetic-key"
        response = Mock()
        response.json.return_value = {"results": [{"url": "https://recipes.example/broken", "content": "Invented recipe in snippet"}]}
        with patch.object(discovery.requests, "post", return_value=response) as search, patch.object(discovery, "read_recipe", side_effect=PageReadError("Unreadable")):
            first = self.recommend(allow_web=True)
            second = self.recommend(allow_web=True)
        self.assertEqual(first["choices"], [])
        self.assertNotIn("Invented recipe", json.dumps(first))
        self.assertEqual(search.call_count, 1)
        self.assertFalse(second["searched_web"])
        self.assertEqual(first["unread_sources"][0]["url"], "https://recipes.example/broken")
        self.assertEqual(second["unread_sources"], first["unread_sources"])
        self.assertIn("two minutes", " ".join(second["warnings"]))

    def test_search_can_use_a_later_publisher_when_earlier_pages_block_imports(self):
        from backend.app.services import discovery
        from backend.app.services.recipe_reader import PageReadError
        self.settings.TAVILY_API_KEY = "synthetic-key"
        response = Mock()
        response.json.return_value = {"results": [{"url": f"https://recipes.example/{i}", "title": f"Recipe source {i}"} for i in range(4)]}
        replies = [PageReadError("Website blocked automatic importing") for _ in range(3)] + [self.web_recipe()]
        with patch.object(discovery.requests, "post", return_value=response) as search, patch.object(discovery, "read_recipe", side_effect=replies) as reader:
            result = self.recommend(allow_web=True)
        self.assertEqual(search.call_count, 1)
        self.assertEqual(reader.call_count, 4)
        self.assertEqual(result["usage"]["monthly_used"], 1)
        self.assertEqual(len(result["unread_sources"]), 3)
        self.assertEqual(len(result["choices"]), 1)

    def test_repeated_url_import_keeps_one_public_entry_and_its_ratings(self):
        from backend.app.services import recipe_reader
        from backend.app.api.v1 import discovery
        with patch.object(discovery, "read_recipe", return_value=self.web_recipe()) as reader:
            first = self.client.post("/api/v1/discovery/import", json={"url": "https://recipes.example/chicken-rice?utm_source=example"}, headers=self.auth)
            second = self.client.post("/api/v1/discovery/import", json={"url": "https://recipes.example/chicken-rice"}, headers=self.auth)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(reader.call_count, 1)

    def test_monthly_limit_is_atomic_and_daily_rejection_rolls_back_monthly_reservation(self):
        from backend.app.services.discovery import reserve_search
        from backend.app.models.discovery import SearchUsage
        self.settings.SEARCH_MONTHLY_CREDITS = 3
        self.settings.SEARCH_DAILY_PER_MEMBER = 100
        now = datetime(2026, 10, 17, tzinfo=timezone.utc)
        def attempt(i):
            try:
                reserve_search(self.engine, f"cook{i}", now)
                return True
            except HTTPException as error:
                self.assertEqual(error.status_code, 429)
                return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            completed = list(pool.map(attempt, range(16)))
        self.assertEqual(sum(completed), 3)
        with Session(self.engine) as session:
            self.assertEqual(session.get(SearchUsage, "tavily:2026-10").used, 3)
        self.settings.SEARCH_DAILY_PER_MEMBER = 0
        with self.assertRaises(HTTPException):
            reserve_search(self.engine, "limited", datetime(2026, 11, 1, tzinfo=timezone.utc))
        with Session(self.engine) as session:
            self.assertIsNone(session.get(SearchUsage, "tavily:2026-11"))

    def test_configuration_cannot_raise_free_tier_cap_above_1000(self):
        self.settings.SEARCH_MONTHLY_CREDITS = 999999
        self.assertEqual(self.client.get("/api/v1/discovery/status").json()["monthly_limit"], 1000)

    def test_upgrade_adds_tables_without_rebuilding_existing_recipe_data(self):
        from sqlalchemy import inspect
        from sqlmodel import SQLModel, create_engine
        from backend.app.db import session as database
        from backend.app.models.recipe import Recipe
        old_engine = create_engine(f"sqlite:///{self.storage.name}/old-family.db")
        originals = [SQLModel.metadata.tables[name] for name in ("user", "handwritingprofile", "recipe", "recipescan", "scanrecipelink")]
        SQLModel.metadata.create_all(old_engine, tables=originals)
        with Session(old_engine) as session:
            session.add(Recipe(title="Kept family recipe", ingredients=["Handwritten amount"], steps=["Original direction"], image_path="/recipe_photos/kept.jpg"))
            session.commit()
        def schema_columns():
            return [{**column, "type": str(column["type"])} for column in inspect(old_engine).get_columns("recipe")]
        columns = schema_columns()
        with patch.object(database, "engine", old_engine):
            database.init_db()
        self.assertEqual(columns, schema_columns())
        with Session(old_engine) as session:
            kept = session.exec(select(Recipe)).one()
            self.assertEqual(kept.ingredients, ["Handwritten amount"])
            self.assertEqual(kept.image_path, "/recipe_photos/kept.jpg")
        self.assertIn("publicrecipe", inspect(old_engine).get_table_names())
        old_engine.dispose()


class ReaderAndTextTests(unittest.TestCase):
    @staticmethod
    def html(**changes):
        recipe = {"@type": "Recipe", "name": "Real source title", "author": {"@type": "Person", "name": "Source Author"}, "recipeYield": "4 servings", "totalTime": "PT1H15M", "recipeIngredient": ["100 g rice cooked"], "recipeInstructions": [{"@type": "HowToSection", "itemListElement": [{"@type": "HowToStep", "text": "<b>Warm</b> the rice."}]}]}
        recipe.update(changes)
        return '<script type="application/ld+json">' + json.dumps({"@graph": [recipe]}) + '</script>'

    def test_reader_uses_published_structure_and_conservative_license_detection(self):
        from backend.app.services.recipe_reader import extract_recipe
        data = extract_recipe(self.html(), "https://recipes.example/rice")
        self.assertEqual(data["steps"], ["Warm the rice."])
        self.assertEqual(data["total_minutes"], 75)
        self.assertEqual(data["servings"], 4)
        self.assertEqual(data["reuse_status"], "link_only")
        allowed = extract_recipe(self.html(license="https://creativecommons.org/licenses/by-sa/4.0/"), "https://recipes.example/rice")
        self.assertEqual(allowed["reuse_status"], "licensed")
        prohibited = extract_recipe(self.html(license="https://creativecommons.org/licenses/by-nc/4.0/", recipeYield="1 loaf"), "https://recipes.example/rice")
        self.assertEqual(prohibited["reuse_status"], "link_only")
        self.assertIsNone(prohibited["servings"])

    def test_reader_rejects_incomplete_recipes_and_local_network_destinations(self):
        from backend.app.services.recipe_reader import extract_recipe, canonical_url, public_address, PageReadError
        with self.assertRaises(PageReadError):
            extract_recipe(self.html(recipeInstructions=[]), "https://recipes.example/rice")
        for url in ["file:///etc/passwd", "https://user:pass@recipes.example/", "https://recipes.example:11434/"]:
            with self.assertRaises(PageReadError):
                canonical_url(url)
        for ip in ["127.0.0.1", "192.168.1.1", "169.254.169.254", "::1", "10.0.0.1"]:
            with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", (ip, 80))]), self.assertRaises(PageReadError):
                public_address("recipes.example", 80)

    def test_robots_disallow_prevents_recipe_page_fetch(self):
        from backend.app.services import recipe_reader as reader
        with patch.object(reader, "fetch_page", return_value=("https://recipes.example/robots.txt", "User-agent: *\nDisallow: /", 200)) as fetch, self.assertRaises(reader.PageReadError):
            reader.read_recipe("https://recipes.example/recipe")
        self.assertEqual(fetch.call_count, 1)

    def test_validated_dns_address_is_pinned_for_the_actual_connection(self):
        from backend.app.services import recipe_reader as reader
        connection = Mock()
        response = connection.getresponse.return_value
        response.status = 200
        response.getheader.side_effect = lambda key, default=None: {"Content-Type": "text/html"}.get(key, default)
        response.read.return_value = b"<html>recipe page</html>"
        with patch.object(reader, "public_address", return_value="93.184.216.34"), patch.object(reader.http.client, "HTTPSConnection", return_value=connection), patch.object(reader.socket, "create_connection") as connect:
            reader.fetch_page("https://recipes.example/rice")
            connection._create_connection(("unvalidated.example", 443))
            connect.assert_called_once_with(("93.184.216.34", 443), 8, None)

    def test_cross_origin_redirects_are_bounded(self):
        from backend.app.services import recipe_reader as reader
        replies = [("https://a.example/robots.txt", "", 404), ("https://b.example/recipe", "", 200), ("https://b.example/robots.txt", "", 404), ("https://a.example/recipe", "", 200)]
        with patch.object(reader, "fetch_page", side_effect=replies), self.assertRaises(reader.PageReadError):
            reader.read_recipe("https://a.example/recipe")

    def test_text_ai_accepts_only_existing_recipe_ids_and_explicit_numbers(self):
        from backend.app.services import text_ai
        from backend.app.core.settings import settings
        response = Mock()
        response.json.return_value = {"message": {"content": json.dumps({"keywords": ["rice"], "excluded": [], "max_minutes": 45, "min_protein": 30, "max_calories": None})}}
        with patch.object(settings, "TEXT_AI_ENABLED", True), patch.object(text_ai.requests, "post", return_value=response) as model:
            understood = text_ai.understand("Rice using 2 eggs")
            self.assertIsNone(understood.max_minutes)
            self.assertIsNone(understood.min_protein)
            self.assertEqual(model.call_args.kwargs["json"]["model"], settings.TEXT_AI_MODEL)
            response.json.return_value = {"message": {"content": json.dumps({"ids": ["public:999", "public:1", "public:1"]})}}
            candidate = {"key": "public:1", "title": "Rice", "ingredient_names": ["rice"], "total_minutes": None, "missing_ingredients": [], "nutrition": {}}
            self.assertEqual(text_ai.rerank("rice", [candidate]), ["public:1"])

    def test_invalid_model_output_fails_closed_to_keyword_matching(self):
        from backend.app.services import text_ai
        from backend.app.core.settings import settings
        response = Mock()
        response.json.return_value = {"message": {"content": '{"keywords":["rice"],"invented_recipe":"not allowed"}'}}
        with patch.object(settings, "TEXT_AI_ENABLED", True), patch.object(text_ai.requests, "post", return_value=response):
            self.assertIsNone(text_ai.understand("rice"))
