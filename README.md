# KitChain — mobile recipe digitization prototype

A **TypeScript / Expo / React Native** client paired with a **FastAPI / SQLModel** API for organizing recipes, storing photos, and experimenting with handwritten-recipe extraction.

The engineering evidence includes structured API/data models, image-intake paths, a local-vision integration, error handling in mobile requests, and human review of uncertain extraction results. This is a development prototype.

**Current work:** [scanner polish and upgrade review](docs/UPGRADE_REVIEW.md), including validation and remaining device checks. The [earlier validation record](docs/VALIDATION.md) is retained as historical evidence.

## Architecture and current status

| Component | Responsibility | Status / source |
| --- | --- | --- |
| Mobile screens | Recipe list/detail, manual creation, photo selection and extraction review | [app/app/(recipes)](app/app/%28recipes%29); implemented in source |
| API client | API-base configuration, JSON requests, response-status checks | [app/lib/api.ts](app/lib/api.ts); device integration not tested here |
| Recipe API | CRUD records, photo upload/resize, scan intake | [backend/app/api/v1/recipes.py](backend/app/api/v1/recipes.py); source inspection |
| Data models | Recipes, users, scan records and handwriting profiles | [backend/app/models](backend/app/models); database integration not tested here |
| Historical text helper | Split extracted text into title, ingredients and steps | [ocr_parser.py](backend/app/services/ocr_parser.py); synthetic checks retained, no active OCR engine |
| Recognition | One local Ollama/Qwen recipe reader; legacy Tesseract and PaddleOCR paths removed | [vision service](backend/app/services/ollama_recipe_vision.py); no accuracy benchmark |
| UI feedback and art | Shared button haptics and named slots for final pixel art | [art handoff](docs/PIXEL_ART.md); physical-device verification pending |
| API health | `GET /api/v1/health` | [main.py](backend/app/main.py); fixed liveness response |

The client calls the API for recipe records and image intake. The API stores structured records in SQLite and images in local directories. The photo scanner asks the local `qwen2.5vl:3b` model for recipe fields and uncertain words; the UI lets a user review them. Successful AI responses now persist a scan ID, raw output, review hints, and parsed fields before returning. Reviewed corrections are stored separately; they do not automatically train or change the model.

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

The requirements now include Pillow, `requests`, and multipart uploads. API startup and CRUD do not require an OCR engine or a running model. Photo scanning requires Ollama on `localhost:11434` with the existing `qwen2.5vl:3b` model installed. Optional HEIC decoding uses `pillow-heif`; without that extra package, export unsupported HEIC photos as JPEG or PNG.

The default database URL now uses the synchronous SQLite driver expected by the routes. If an existing `.env` overrides **`DB_URL`**, it must also use a synchronous driver:

```bash
export DB_URL='sqlite:///./kitchain.db'
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for interactive routes. API integration tests exercise startup and SQLite using synthetic data; see the current review for the boundary between those checks and actual device/model testing.

In a separate terminal, start the mobile project:

```bash
cd app
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_API_BASE to the API origin reachable by the device
npx expo start
```

For a physical phone, `127.0.0.1` refers to the phone itself. Use the development machine's reachable LAN address and bind the API to that interface in the trusted lab. The client now normalizes trailing slashes and uses one API helper, including the health route. Browser/CORS access to a live API still needs separate configuration if a browser client is intended.

## Check the changes

```bash
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python scripts/validate_local.py
cd app
npx tsc --noEmit
npm run lint
```

The API tests use temporary SQLite/media storage and synthetic images, mocking only the model HTTP response. They check persistence, corrections, errors, and responsiveness; they do not measure handwriting accuracy. Haptic feel requires a physical device.

## Operation and limitations

| Check | What it establishes |
| --- | --- |
| `GET /api/v1/health` | Fixed application liveness response; not database or OCR readiness |
| `GET /api/v1/recipes/` | Recipe-list route after startup; inspect actual responses locally |
| Scan/extraction review | Experimental output requires human review; no quantified accuracy claim |

Registered recipe/scan routes do not currently enforce user authentication. Security helper files and user models are scaffolding, not proof of access control. Local startup creates tables with `create_all`; migration directories exist, but migration execution was not validated.

The tree currently includes local media under `backend/data`; those files are not a validated test dataset. Database and photo recovery have not been exercised. See the [validation record](docs/VALIDATION.md) for a small future API/device checklist.

## Next improvements

Integrate Daniel's completed art using [the asset map](docs/PIXEL_ART.md), then perform the [device checklist](docs/UPGRADE_REVIEW.md). Small optional follow-ups include draft recovery, attaching the scanned source photo to the saved recipe, and recipe-list search. Auth enforcement, migration/recovery validation, and CI remain separate future work.
