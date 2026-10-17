# KitChain — mobile recipe digitization prototype

A **TypeScript / Expo / React Native** client paired with a **FastAPI / SQLModel** API for organizing recipes, storing photos, and experimenting with handwritten-recipe extraction.

The engineering evidence includes structured API/data models, image-intake paths, a local-vision integration, error handling in mobile requests, and human review of uncertain extraction results. This is a development prototype.

**Visual pass:** [warm-kitchen design](docs/KITCHEN_DESIGN.md), with live parchment frames, themed controls/dialogs and open slots for Daniel’s artwork.

**Latest update:** [private pantry, keyboard handling and blocked-source guidance](docs/PANTRY.md).

**Discovery foundation:** [nutrition, recommendations and the public recipe table](docs/DISCOVERY.md): self-hosted USDA data, Tavily only when saved matches are weak, a separate local text model, source credit, cook ratings and nutrition corrections. This branch includes the kitchen design and keeps the photo scanner unchanged.

The [scanner review](docs/UPGRADE_REVIEW.md) and [earlier validation record](docs/VALIDATION.md) retain the previous implementation details and checks.

To try the branch and understand when to merge it, use [the PR #1 walkthrough](docs/TRY_PR.md).

## Architecture and current status

| Component | Responsibility | Status / source |
| --- | --- | --- |
| Mobile screens | Recipe list/detail, manual creation, photo selection and extraction review | [app/app/(recipes)](app/app/%28recipes%29); implemented in source |
| API client | API-base configuration, JSON requests, response-status checks | [app/lib/api.ts](app/lib/api.ts); device integration not tested here |
| Recipe API | CRUD, image intake and attaching scan photos | [recipe routes](backend/app/api/v1/recipes.py); synthetic API/SQLite/image tests passed |
| Data models | Recipes, users, scan records, profiles and scan-to-recipe links | [models](backend/app/models); temporary SQLite integration tested |
| Historical text helper | Split extracted text into title, ingredients and steps | [ocr_parser.py](backend/app/services/ocr_parser.py); synthetic checks retained, no active OCR engine |
| Recognition | One local Ollama/Qwen recipe reader; legacy Tesseract and PaddleOCR paths removed | [vision service](backend/app/services/ollama_recipe_vision.py); no accuracy benchmark |
| UI feedback and art | Shared button haptics and named slots for final pixel art | [art handoff](docs/PIXEL_ART.md); physical-device verification pending |
| Drafts and search | Local scan-review recovery, durable draft photos, search/sort | [draft store](app/lib/scan-draft-core.ts), [search](app/lib/recipe-search.ts); pure-module tests passed, device persistence pending |
| API health | `GET /api/v1/health` | [main.py](backend/app/main.py); fixed liveness response |
| Nutrition | Self-hosted USDA records, ingredient matching, portions, corrections and serving arithmetic | [nutrition service](backend/app/services/nutrition.py), [data provenance](backend/data/nutrition/manifest.json) |
| Recipe discovery | Saved recipes first, limited Tavily fallback, source-page reader and separate Ollama text model | [discovery guide](docs/DISCOVERY.md); local-beta feature |
| Public collection | Attributed source cards/full recipes where permitted, explicit family sharing and 1–5 cook ratings | [discovery routes](backend/app/api/v1/discovery.py); local profiles, not internet accounts |

The client calls the API for recipe records and image intake. The API stores structured records in SQLite and images in local directories. The photo scanner asks the local `qwen2.5vl:3b` model for recipe fields and uncertain words; the UI lets a user review them. Successful AI responses now persist a scan ID, raw output, review hints, and parsed fields before returning. Reviewed corrections are stored separately; they do not automatically train or change the model.

Unfinished photo reviews autosave on the device, scoped to the API server. Native photo drafts use a document-directory copy; the browser uses IndexedDB. Saving a scanned recipe attaches its retained source image, and retries for the same scan reuse the existing recipe. Search covers titles, descriptions and ingredients, with newest/oldest/A–Z sorting.

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

The mobile project targets **Expo SDK 57**, matching the SDK 57 Expo Go client. Use Node.js 24 LTS (at least 24.3). In a separate terminal, start the mobile project:

```bash
cd app
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_API_BASE to the API origin reachable by the device
npx expo start --clear
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
npm test
```

The API tests use temporary SQLite/media storage and synthetic images/provider replies. They cover scanning, nutrition arithmetic, corrections, attribution, public boundaries, ratings, additive schema upgrades, source-reader restrictions and concurrent search-credit limits. Nineteen frontend regression tests cover drafts, recipe search and SDK 57 photo uploads. An optional browser harness checks discovery against a disposable real API/USDA database. These checks do not measure live handwriting/recommendation quality or physical haptic feel. See the [discovery guide](docs/DISCOVERY.md) for setup and validation limits.

## Operation and limitations

| Check | What it establishes |
| --- | --- |
| `GET /api/v1/health` | Fixed application liveness response; not database or OCR readiness |
| `GET /api/v1/recipes/` | Recipe-list route after startup; inspect actual responses locally |
| Scan/extraction review | Experimental output requires human review; no quantified accuracy claim |

Registered recipe/scan routes do not currently enforce user authentication. Security helper files and user models are scaffolding, not proof of access control. Local startup creates tables with `create_all`; migration directories exist, but migration execution was not validated.

The tree currently includes local media under `backend/data`; those files are not a validated test dataset. Database backup/restore and disaster recovery have not been exercised. See the [current review](docs/UPGRADE_REVIEW.md) for device checks and validation limits.

## Next improvements

Integrate Daniel's completed art using [the asset map](docs/PIXEL_ART.md), then perform the [device checklist](docs/UPGRADE_REVIEW.md). Draft recovery, original-photo attachment and recipe search are included in this branch. Auth enforcement, migration/recovery validation, and CI remain separate future work.
