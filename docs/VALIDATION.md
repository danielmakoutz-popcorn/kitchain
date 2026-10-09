# KitChain — validation evidence

Recorded **2026-10-09 UTC / 2026-10-08 Pacific**. Application source inspected at [`ecff65a`](https://github.com/danielmakoutz-popcorn/kitchain/commit/ecff65ae6585cfd09c615ae4bc33d159d29f6b5c). The validator was added with this documentation update; application code was unchanged.

## Executed: synthetic text parsing

Environment: Python **3.12.14**, standard library only. The script imports the text parser without importing the API, SQLModel, OCR engine, or model client. No personal recipe photos or device data were used.

```bash
python3 scripts/validate_local.py
```

Actual result: exit code **0**.

```text
PASS backend syntax: 29 Python files
PASS explicit headings separate title, two ingredients, and two numbered steps
PASS empty text returns an untitled recipe without inventing content
PASS quantity lines remain ingredients while numbered cooking verbs become steps
COMPLETE synthetic text checks; image recognition, API, and mobile app were not exercised
```

This is evidence for three deterministic parser behaviors. It is not a handwriting benchmark, image-processing test, model evaluation, API test, TypeScript build, or device test. No GitHub Actions workflow or run was present at inspection.

## Inspected: setup and integration gaps

| Finding | Source evidence | Consequence / next step |
| --- | --- | --- |
| Runtime dependencies omitted | Recipe routes and OCR services import packages absent from root `requirements.txt` | Record a complete compatible environment before claiming clean installation |
| OCR initializes at import time | `handwriting_ocr.py` constructs `PaddleOCR` at module scope | Even health/CRUD startup depends on the OCR environment; defer initialization |
| Database driver mismatch | Settings default to `sqlite+aiosqlite`; active routes use synchronous SQLModel sessions | Use a synchronous `DB_URL` for local development and validate integration |
| Mobile health URL | `api.health()` uses `api/v1/health` without the leading slash used by other helpers | Fix URL joining before claiming client health verification |
| Scan persistence differs by path | Ollama success returns `scan_id: null`; fallback/printed path creates a `RecipeScan` | Do not claim all extraction paths persist correction records |
| Auth scaffolding is not enforced | Registered recipe/scan routes lack user-auth dependencies | Authenticated application behavior remains planned |

These are source-review findings, not observed runtime exceptions. The review environment lacked the full API/OCR dependencies, and no fresh install or device run was attempted.

## Local verification to capture next

After resolving the README's dependency and database setup requirements, use an isolated database and synthetic recipe/photo fixtures:

1. Start the API and capture `GET /api/v1/health` and `/docs`. Expected health response from source, **not captured here**: `{"status":"ok","app":"KitChain API"}`.
2. Create one synthetic recipe, read it, edit it, and delete it; retain actual status codes and responses. Restart the API before deletion to check persistence.
3. Upload a synthetic supported image and an unsupported file; record resizing/storage and the actual rejection response.
4. Try printed and handwritten extraction separately, retain uncertain fields, and record whether a scan ID/correction record is created. Do not infer accuracy from a single successful response.
5. Run the client on an emulator or phone, record its reachable API origin and CRUD/photo behavior, then separately check any browser/CORS path used.

This is a proposed checklist, not completed validation. Model availability, OCR accuracy, enforced authentication, migrations, backup recovery, and CI remain pending.
