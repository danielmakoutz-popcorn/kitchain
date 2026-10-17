"""Disposable API for browser checks: real USDA/SQLite, synthetic web sources.

Run from the repository root. No API keys, paid calls, or personal database used.
"""
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def create_app():
    from fastapi.middleware.cors import CORSMiddleware
    from sqlmodel import Session
    from backend.app.main import app
    from backend.app.core.settings import settings
    from backend.app.db.session import engine
    from backend.app.models.recipe import Recipe
    from backend.app.services.recipe_reader import extract_recipe, PageReadError
    from backend.app.services import discovery
    from backend.app.api.v1 import discovery as routes

    settings.TAVILY_API_KEY = "synthetic-ui-key"
    settings.TEXT_AI_ENABLED = False
    settings.RECIPE_REUSE_DOMAINS = ""
    app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:8028"], allow_methods=["*"], allow_headers=["*"])

    def source_recipe(url):
        if not url.startswith("https://recipes.example/"):
            raise ValueError("Only synthetic source pages are available in this fixture")
        if "/blocked" in url:
            raise PageReadError("This website blocked automatic importing (HTTP 403). Open the original recipe in your browser, or try another publisher.")
        licensed = "/licensed" in url
        data = {"@type": "Recipe", "name": "Published rice bowl" if licensed else "Published chicken and rice",
            "author": {"@type": "Person", "name": "Recipe Author"}, "publisher": {"name": "Synthetic Test Kitchen"},
            "recipeYield": "2 servings", "totalTime": "PT25M", "recipeIngredient": ["100 g chicken breast cooked", "100 g rice cooked"],
            "recipeInstructions": [{"@type": "HowToStep", "text": "Warm the cooked rice and chicken."}]}
        if licensed:
            data["license"] = "https://creativecommons.org/licenses/by/4.0/"
        return extract_recipe('<script type="application/ld+json">' + json.dumps(data) + '</script>', url)

    class SearchReply:
        def __init__(self, body=None):
            self.body = body or {"results": [{"url": "https://recipes.example/chicken"}]}

        def raise_for_status(self):
            pass

        def json(self):
            return self.body

    def search(url, **_kwargs):
        if url == "http://localhost:11434/api/generate":
            return SearchReply({"response": json.dumps({"ingredients": ["Rice", "Bell pepper"], "uncertain_items": ["Green herb"]})})
        if url != "https://api.tavily.com/search":
            raise AssertionError("Browser fixture cannot make other external requests")
        if "blocked" in _kwargs.get("json", {}).get("query", ""):
            return SearchReply({"results": [{"url": "https://recipes.example/blocked", "title": "Blocked published recipe"}]})
        return SearchReply()

    discovery.read_recipe = routes.read_recipe = source_recipe
    discovery.requests.post = search

    @app.on_event("startup")
    def seed_family():
        with Session(engine) as session:
            session.add(Recipe(title="Grandma's rice", ingredients=["some rice"], steps=["Warm the cooked rice."]))
            session.commit()

    return app


if __name__ == "__main__":
    import uvicorn
    with tempfile.TemporaryDirectory(prefix="kitchain-discovery-ui-") as directory:
        os.environ["DB_URL"] = f"sqlite:///{directory}/ui.db"
        os.chdir(directory)
        uvicorn.run(create_app(), host="127.0.0.1", port=8017)
