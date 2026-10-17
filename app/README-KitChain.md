# KitChain Frontend (Expo)

These files drop into your Expo project to wire up:
- Recipe list → detail
- Add recipe (manual form)
- Add from Photo (image picker → `/recipes/scan`)
- Minimal API client + zod types

## Quick Start

Use the existing project and its lockfile. The app targets **Expo SDK 57**, matching the SDK 57 Expo Go client, with Node.js 24 LTS (at least 24.3).

From this `app` folder:

```bash
npm ci
cp .env.example .env
```

Keep an existing `.env` instead of overwriting it. Set its API address to your computer's reachable LAN address:

```dotenv
EXPO_PUBLIC_API_BASE=http://<LAN_IP>:8000
```

Start the backend as described in the [repository README](../README.md), then stop any old Expo server and run:

```bash
npx expo start --clear
```

Scan the new QR code using the iPhone camera and open in Expo Go. Keep both devices on the same Wi-Fi and allow local-network access. The [PR walkthrough](../docs/TRY_PR.md) explains fetching the updated branch and troubleshooting an SDK mismatch.

## Backend endpoints expected

- `GET /api/v1/health` → `{ "status": "ok", "app": "KitChain API" }`
- `POST /api/v1/recipes/scan` → persisted AI scan with `scan_id`, `title`, `ingredients`, `steps`, `notes`, `raw_text`, `confidence`, and `uncertain_lines`
- `GET /api/v1/recipes/` → list of recipes
- `GET /api/v1/recipes/{id}` → single recipe
- `POST /api/v1/recipes/` → create recipe
- `POST /api/v1/recipes/?source_scan_id={scan_id}` → create with retained source photo; retry the same import without creating another recipe
- `PATCH /api/v1/scans/{scan_id}/correction` → store the reviewed correction record

The photo screen now uses only the existing local Qwen AI reader; printed/Tesseract scanning and the PaddleOCR fallback are removed. Haptic controls use the already installed `expo-haptics` dependency. See [current review and validation](../docs/UPGRADE_REVIEW.md) and [pixel-art integration](../docs/PIXEL_ART.md).

Photo review fields and the selected image autosave locally for recovery. The recipe list searches names, descriptions and ingredients and supports Newest/Oldest/A–Z sorting. Run `npm ci` after checking out this branch to install its locked AsyncStorage/FileSystem dependencies, then use `npm test` for the draft/search module checks. See [the PR walkthrough](../docs/TRY_PR.md) for the complete checkout/run/merge steps.

