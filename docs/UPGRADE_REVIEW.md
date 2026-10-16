# KitChain — scanner polish and final-art preparation

Reviewed October 15, 2026 Pacific. Scope: quality-of-life changes to the existing app, remove the obsolete scanner, add button haptics, and prepare for Daniel's final pixel art.

## Changes

| Finding | Result |
| --- | --- |
| The photo screen defaulted to printed/Tesseract scanning; AI failure silently invoked PaddleOCR | Only the existing Qwen AI reader remains. The printed selector and legacy engine/fallback imports are removed. Old `mode=printed` requests receive 422; omitting mode selects AI. Historical scans remain readable. |
| Successful AI scans returned `scan_id: null` | Each successful scan now stores raw output, parsed fields, notes, review hints, and the source image. Corrections use that scan ID. This is a stored review trail, not automatic model training. |
| Network/model errors could look like a generic failure or an unexpected fallback | Unavailable AI, timeout, unreadable output, unsupported/empty/corrupt photos, and photos over 20 MB have clear errors. No alternate scanner runs. Failed scans clean up their generated image files. |
| The synchronous model request blocked the async route | The same call runs in a worker thread so health and other requests can continue. |
| Unexpected model shapes could break the review UI | Existing ingredient strings and `{name, quantity}` objects become editable lines without doubled quantities. Single-line text fields are accepted; invalid or empty output is rejected. Missing ingredients/steps remain visible review hints. |
| The review screen could keep old text after switching images or accept repeated saves | Replacing a photo clears its old review after confirmation. Rescanning asks before replacing edits. Controls lock during work; the scan/save/profile mutations also have immediate duplicate-tap guards. |
| Long scans had no recovery control | Visible working state, a client timeout, and Stop waiting are available. Stopping or leaving the screen ignores a late response; it does not cancel an already running Ollama job. |
| Correction saves ignored HTTP errors and always claimed success | The app distinguishes a saved recipe from a correction-record failure and opens the saved recipe rather than offering to create another copy. |
| Haptics existed only on template tabs | Shared feedback covers app buttons, recipe cards, navigation links, writer selection, and mutation outcomes. Android uses its haptics API; iOS uses selection/impact/notification feedback. Web is a no-op, disabled controls do not trigger feedback, and unavailable haptics cannot block an action. |
| Manual recipes stored ingredients/steps only inside instruction text | The manual form now sends structured arrays as well, so the existing recipe detail/editor can show them. Edit/photo mutations guard repeated taps, and Cancel restores the saved fields. |
| API addresses and error handling were duplicated | A shared helper normalizes URL joining, fixes the health path, preserves server error details, and leaves multipart content boundaries to the runtime. Photo uploads retain the picker's MIME type. |
| Dynamic Expo config discarded the static artwork configuration | Dynamic config now extends `app.json`, preserving its icons, splash settings, platform settings, and plugins. |
| Final art had no stable integration points | A typed registry and named render slots cover scan controls/states and recipe placeholders. No substitute artwork was added. See [the art handoff](PIXEL_ART.md). |

## AI behavior preserved

The model remains `qwen2.5vl:3b`, the endpoint remains local `/api/generate`, and the extraction prompt is unchanged. The payload still uses `stream: false`, temperature `0.1`, context `4096`, and the 300-second model request timeout. Image handling retains EXIF orientation, RGB conversion, and the existing 1200×1200 maximum/quality-90 model thumbnail. An unused doubled-size image allocation was removed; it was never passed to the AI.

The returned confidence remains a conservative review hint, with low used for missing ingredients/steps. It is not a measured recognition score. No new prompt, model, vision provider, deskewing, sharpening, or automated recipe rewriting was introduced.

## Reproduce validation

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python scripts/validate_local.py
cd app
npm ci
npx tsc --noEmit
npm run lint
CI=1 npx expo export --platform all --output-dir /tmp/kitchain-export
```

API coverage uses actual FastAPI startup, SQLite sessions, image decoding/resizing, scan persistence, corrections, and CRUD. Only the model HTTP boundary is mocked. All media/databases are synthetic and temporary. The API test suite has 11 test methods, including subcases for legacy-mode rejection, invalid uploads, malformed model output, AI failure, and keeping health requests responsive during a blocked model call. No personal recipe photos are used.

The earlier standard-library parser checks are retained for the historical text helper; the removed OCR engines are not runtime dependencies.

Executed in Python 3.12.14 / Node 24.19.0 with a fresh virtual environment and `npm ci` using the existing lockfile:

| Check | Actual result |
| --- | --- |
| `python -m unittest discover -s tests -v` | PASS: 11 test methods plus error subcases; real API/SQLite/images, mocked model HTTP |
| `python scripts/validate_local.py` | PASS: backend syntax (28 Python files) and 3 historical parser cases |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS: no ESLint errors or warnings |
| `CI=1 npx expo export --platform all` | PASS: iOS/Android Hermes bundles plus web/static export; this is not an installed native build |
| Resolved public Expo configuration | PASS: icon and splash-plugin settings from `app.json` retained |
| Comparison with base commit `66ec9d6` | PASS: model, URL, prompt, and generation payload AST values unchanged |
| Browser interaction/visual smoke check | Not run: Playwright had no browser executable and its browser download failed; export compilation is the only web verification |
| Real Ollama recognition, phone UI, and physical haptics | Not run in this environment; use the device checklist below |

Existing Python deprecation notices and toolchain browser-database/npm-environment notices were emitted; they did not fail these checks. No recognition accuracy or on-device feedback claim is made.

## Small optional follow-ups

| Upgrade | Why it would help | Boundary |
| --- | --- | --- |
| Recover an unfinished scan review | Keep edits after an app restart or accidental navigation | Save a local draft; no AI change |
| Attach the scanned source image to the saved recipe | Reopen the original card beside the typed recipe | The source is retained on its scan record now; recipe photo attachment remains a separate action |
| Search and sort the recipe list | Find recipes as the collection grows | Local list controls; no backend redesign |
| Camera capture and manual crop/rotate | Save a trip through the photo library and improve framing | Opt-in user edits; benchmark before changing the AI's default image preprocessing |

## Before calling the art-integrated version final

- [ ] Scan several real handwritten and printed recipe photos on the existing local model; compare ingredient amounts and cooking times with the originals.
- [ ] Test JPEG/PNG and the intended iPhone photo formats. Install optional HEIC support if those files are required.
- [ ] Check scan errors, retry, Stop waiting, and returning to the app after a long read. The local model may finish in the background.
- [ ] Replace a photo after editing a review; confirm only the matching photo's fields can be saved.
- [ ] Save with and without a writer profile; verify the recipe and correction record and try rapid repeated taps.
- [ ] Save and edit a manual recipe; verify ingredients/steps, photo upload, Cancel, and delete confirmation.
- [ ] Feel button, selection, success, and error feedback on physical iOS/Android devices; check system-disabled haptics too.
- [ ] Integrate Daniel's art and check image sharpness, animation timing, touch targets, screen-reader labels, and reduced-motion behavior on the target device.

These changes prepare the existing app for the artwork pass. They do not establish model accuracy, an installed native build, or production-release readiness.
