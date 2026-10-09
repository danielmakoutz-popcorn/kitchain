# KitChain — mobile recipe digitization prototype

A **TypeScript / Expo / React Native** client paired with a **FastAPI / SQLModel** API for organizing recipes, storing photos, and experimenting with handwritten-recipe extraction.

The engineering evidence includes structured API/data models, image-intake paths, a local-vision integration, error handling in mobile requests, and human review of uncertain extraction results. This is a development prototype.

**Review the evidence:** [recorded validation and setup gaps](docs/VALIDATION.md). Backend syntax and three synthetic text-parser behaviors passed offline checks. Image OCR accuracy, API startup, database integration, and the mobile application were not exercised in that validation.

## Architecture and current status

| Component | Responsibility | Status / source |
| --- | --- | --- |
| Mobile screens | Recipe list/detail, manual creation, photo selection and extraction review | [app/app/(recipes)](app/app/%28recipes%29); implemented in source |
| API client | API-base configuration, JSON requests, response-status checks | [app/lib/api.ts](app/lib/api.ts); device integration not tested here |
| Recipe API | CRUD records, photo upload/resize, scan intake | [backend/app/api/v1/recipes.py](backend/app/api/v1/recipes.py); source inspection |
| Data models | Recipes, users, scan records and handwriting profiles | [backend/app/models](backend/app/models); database integration not tested here |
| Text parser | Split extracted text into title, ingredients and steps | [ocr_parser.py](backend/app/services/ocr_parser.py); synthetic checks passed |
| Recognition experiments | Printed Tesseract path, handwritten Ollama path with PaddleOCR fallback | [services](backend/app/services); no accuracy result captured |
| API health | `GET /api/v1/health` | [main.py](backend/app/main.py); fixed liveness response |

The client calls the API for recipe records and image intake. The API stores structured records in SQLite and images in local directories. The handwritten path asks the local `qwen2.5vl:3b` model for recipe fields and uncertain words; the UI lets a user review them. Successful Ollama responses currently return `scan_id: null`, so that path does not demonstrate a persisted scan/correction record.

## Run the verified offline checks

Python 3.12 is sufficient; no OCR engine, model, mobile device, or external account is required:

```bash
python3 scripts/validate_local.py
```

These checks exercise the actual text parser with synthetic input and parse backend Python source. They do not measure recognition accuracy or launch the API.

## Development setup

Run backend commands from the repository root, because imports and local media paths assume that working directory.

```bash
git clone https://github.com/danielmakoutz-popcorn/kitchain.git
cd kitchain
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

**The current requirements file is incomplete for API startup.** Imported runtime dependencies also include Pillow, `requests`, `python-multipart`, `pytesseract`, and `paddleocr` with a compatible PaddlePaddle runtime. The tested OCR package/version pair is not recorded. Tesseract requires its local executable; optional HEIC support uses `pillow-heif`. Install the compatible local recognition environment before expecting the API to start.

PaddleOCR is currently instantiated during module import. It is therefore a startup dependency even for non-OCR routes; lazy loading is proposed next work.

The API uses synchronous SQLModel sessions, while the settings default uses `sqlite+aiosqlite`. For the synchronous development path, override **`DB_URL`**, which the settings object uses to populate `DATABASE_URL`:

```bash
export DB_URL='sqlite:///./kitchain.db'
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

This is a source-derived entry point after resolving the dependency gaps, **not a recorded clean-install success**. Open `http://127.0.0.1:8000/docs` for interactive routes.

In a separate terminal, start the mobile project:

```bash
cd app
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_BASE to the API origin reachable by the device
npx expo start
```

For a physical phone, `127.0.0.1` refers to the phone itself. Use the development machine's reachable LAN address and bind the API to that interface in the trusted lab. Use an API base without a trailing slash for the recipe routes; the health helper has a separate missing-leading-slash issue noted in the validation record. Browser/CORS and device integration are not validated here.

## Operation and limitations

| Check | What it establishes |
| --- | --- |
| `GET /api/v1/health` | Fixed application liveness response; not database or OCR readiness |
| `GET /api/v1/recipes/` | Recipe-list route after startup; inspect actual responses locally |
| Scan/extraction review | Experimental output requires human review; no quantified accuracy claim |

Registered recipe/scan routes do not currently enforce user authentication. Security helper files and user models are scaffolding, not proof of access control. Local startup creates tables with `create_all`; migration directories exist, but migration execution was not validated.

The tree currently includes local media under `backend/data`; those files are not a validated test dataset. Database and photo recovery have not been exercised. See the [validation record](docs/VALIDATION.md) for a small future API/device checklist.

## Next improvements — not completed

Capture a complete pinned runtime/OCR environment, align database configuration with the synchronous session implementation, fix the mobile health URL, defer OCR initialization until requested, and record CRUD/photo/device checks. Auth enforcement, migration/recovery validation, and CI are also pending.
