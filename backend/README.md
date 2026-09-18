# KitChain Backend
Run:
  source .venv/bin/activate
  uvicorn backend.app.main:app --reload

Docs:
  http://127.0.0.1:8000/docs
Health:
  GET /api/v1/health
