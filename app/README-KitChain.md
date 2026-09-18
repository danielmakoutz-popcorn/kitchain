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

- `GET /health` → `{ "status": "ok" }`
- `POST /recipes/scan` → `{ "text": "..." }`
- `GET /recipes` → list of recipes
- `GET /recipes/{id}` → single recipe
- `POST /recipes` → create recipe
```

