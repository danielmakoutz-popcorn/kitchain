# KitChain

**Recipe organization and handwritten recipe digitization prototype**, built as a mobile application with a Python API.

KitChain combines an **Expo / React Native / TypeScript** frontend with a **FastAPI / SQLModel** backend. It supports browsing and editing recipes, attaching recipe photos, and experimenting with extracting handwritten recipes into structured fields.

## Implemented components

- Mobile recipe list, recipe detail, manual creation, and photo-import flows using Expo Router.
- REST API for recipe records, photo upload, scan records, and handwriting profiles.
- SQLModel-backed data models and database initialization, with an Alembic migrations directory.
- Image intake, resizing, and optional HEIC/HEIF handling.
- Experimental text/recipe extraction paths using PaddleOCR, Tesseract, and a local Ollama vision model. The Ollama path asks the model to return title, ingredients, steps, notes, and uncertain words as JSON.
- API health route at `GET /api/v1/health`.

## Architecture

```text
app/                   Expo / React Native client (TypeScript)
  app/                 Mobile routes and screens
  components/          UI components
  lib/                 API client and types
backend/               FastAPI service (Python)
  app/api/v1/          API endpoints
  app/models/          SQLModel entities
  app/services/        OCR, parsing, and Ollama integration
  app/migrations/      Migration scaffolding
```

## Local development

### API

From the repository root, create and activate a Python virtual environment with the project's backend dependencies installed. Then run:

```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

Visit `http://127.0.0.1:8000/docs` for interactive API documentation. OCR features require their respective local libraries, model runtimes, and system dependencies.

### Mobile app

```bash
cd app
npm install
cp .env.example .env
# Edit EXPO_PUBLIC_API_BASE in .env to point to the reachable API
npx expo start
```

An emulator and a physical device may require different API host addresses. See [mobile frontend notes](app/README-KitChain.md) and [backend notes](backend/README.md).

## Engineering considerations

- Image recognition may produce mistakes; uncertain words are tracked for user review.
- The backend currently includes development-oriented startup initialization and local media storage; production deployment requires further hardening.
- Uploads, personal recipe photographs, and local databases should be kept out of public repositories.
- This is an actively developed portfolio prototype, not a production-hosted consumer service.

## Skills demonstrated

**Full-stack development, TypeScript, React Native, Python, REST API design, database models, image processing, local AI integration, and debugging across mobile/backend boundaries.**
