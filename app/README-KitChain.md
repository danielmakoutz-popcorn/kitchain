# KitChain Frontend (Expo)

These files drop into your Expo project to wire up:
- Recipe list → detail
- Add recipe (manual form)
- Add from Photo (image picker → `/recipes/scan`)
- Minimal API client + zod types

## Quick Start

1) Create project (once):

```bash
npx create-expo-app app
cd app
npx expo install expo-router expo-image-picker expo-constants
npm i zod
```

2) Enable router in `app.json`:
```json
{
  "expo": {
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true }
  }
}
```

3) Copy the files from this pack into your Expo project root so paths look like:

```
app/
  _layout.tsx
  index.tsx
  (recipes)/
    index.tsx
    [id].tsx
    AddRecipe.tsx
    AddFromPhoto.tsx
components/
  RecipeCard.tsx
lib/
  api.ts
  types.ts
app.config.js
.env
```

4) Create `.env` from example and set your FastAPI base:
```
EXPO_PUBLIC_API_BASE=http://<LAN_IP>:8000
```

5) Run:
```bash
npx expo start
```

Open on your phone via Expo Go (same Wi‑Fi as the backend).

## Backend endpoints expected

- `GET /api/v1/health` → `{ "status": "ok", "app": "KitChain API" }`
- `POST /api/v1/recipes/scan` → persisted AI scan with `scan_id`, `title`, `ingredients`, `steps`, `notes`, `raw_text`, `confidence`, and `uncertain_lines`
- `GET /api/v1/recipes/` → list of recipes
- `GET /api/v1/recipes/{id}` → single recipe
- `POST /api/v1/recipes/` → create recipe
- `PATCH /api/v1/scans/{scan_id}/correction` → store the reviewed correction record

The photo screen now uses only the existing local Qwen AI reader; printed/Tesseract scanning and the PaddleOCR fallback are removed. Haptic controls use the already installed `expo-haptics` dependency. See [current review and validation](../docs/UPGRADE_REVIEW.md) and [pixel-art integration](../docs/PIXEL_ART.md).

