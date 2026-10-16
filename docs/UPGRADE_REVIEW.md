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
| Leaving a photo review lost the unfinished work | The review fields, notes, writer, scan ID and selected photo now autosave locally. Native photos are copied into app documents; browser drafts use IndexedDB. The screen restores a draft before enabling editing and offers Discard. Storage failures are visible; an unreadable stored draft can be kept while continuing without recovery. |
| A saved scan recipe did not retain its card photo | `POST /recipes/?source_scan_id=...` copies the retained source into recipe photos. A missing scan/photo or copy failure keeps the draft and does not create a partial recipe. No additional AI read or phone upload is needed. |
| Retrying a recovered save could create duplicate recipes | A scan-to-recipe link makes repeated/concurrent identical saves return the same recipe. Changed data after a previous save receives 409 and leaves the draft intact so the saved recipe can be edited deliberately. Startup creates the link table for new imports. |
| A late save could clear a newer review | Draft operations are queued, and completion cleanup only clears the exact snapshot that was saved. New photos, rescans, or edits survive a previous screen's late completion. A completion marker helps reopen a known saved recipe when local cleanup fails. |
| The growing recipe list had no search controls | Literal, case/accent-insensitive search covers names, descriptions and ingredients. Newest, oldest and A–Z sorting works on a copy of the list. Clear search and an empty-results message are included. |

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
npm test
CI=1 npx expo export --platform all --output-dir /tmp/kitchain-export
```

API coverage uses actual FastAPI startup, SQLite sessions with foreign-key enforcement, image decoding/resizing, scan persistence, corrections, and CRUD. Only the model HTTP boundary is mocked. All media/databases are synthetic and temporary. The API suite has 16 methods, including source attachment, rollback on copy failure, sequential retries, and a forced overlap of two saves for one scan. No personal recipe photos are used.

Ten frontend pure-module tests exercise actual TypeScript draft serialization/queueing/completion and search code with a memory storage adapter. They include corrupt drafts, failed writes, new screen/store recovery, server isolation, late cleanup versus newer edits/photos/rescans, completion markers, literal search and sorting. Native AsyncStorage/FileSystem and browser IndexedDB adapters still need device/browser interaction checks.

The earlier standard-library parser checks are retained for the historical text helper; the removed OCR engines are not runtime dependencies.

Executed in Python 3.12.14 / Node 24.19.0 with a fresh virtual environment and `npm ci` using the existing lockfile:

| Check | Actual result |
| --- | --- |
| `python -m unittest discover -s tests -v` | PASS: 16 test methods plus error subcases; real API/SQLite/images with foreign keys, mocked model HTTP |
| `python scripts/validate_local.py` | PASS: backend syntax (28 Python files) and 3 historical parser cases |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS: no ESLint errors or warnings |
| `npm test` | PASS: 10 draft/search tests using the real pure modules and a memory storage adapter |
| `CI=1 npx expo export --platform all` | PASS: iOS/Android Hermes bundles plus web/static export; this is not an installed native build |
| Resolved public Expo configuration | PASS: icon and splash-plugin settings from `app.json` retained |
| Comparison with base commit `66ec9d6` | PASS: model, URL, prompt, and generation payload AST values unchanged |
| Browser interaction/visual smoke check | Not run: Playwright had no browser executable and its browser download failed; export compilation is the only web verification |
| Real Ollama recognition, phone UI, and physical haptics | Not run in this environment; use the device checklist below |

Existing Python deprecation notices and toolchain browser-database/npm-environment notices were emitted; they did not fail these checks. No recognition accuracy or on-device feedback claim is made.

## Follow-ups now included

| Upgrade | Why it would help | Boundary |
| --- | --- | --- |
| Recover an unfinished scan review | Restore reviewed text and its card after reopening | One current local draft per device/browser and API server; storage status is shown |
| Attach the scanned source image to the saved recipe | Reopen the original card beside the typed recipe | An independent copy of the retained, orientation-normalized source is attached on save |
| Search and sort the recipe list | Find recipes as the collection grows | Local list controls; server data and AI behavior are preserved |

Camera capture and manual crop/rotate remain optional future work. They were outside the three requested follow-ups.

## Before calling the art-integrated version final

- [ ] Scan several real handwritten and printed recipe photos on the existing local model; compare ingredient amounts and cooking times with the originals.
- [ ] Test JPEG/PNG and the intended iPhone photo formats. Install optional HEIC support if those files are required.
- [ ] Check scan errors, retry, Stop waiting, and returning to the app after a long read. The local model may finish in the background.
- [ ] Replace a photo after editing a review; confirm only the matching photo's fields can be saved.
- [ ] Save with and without a writer profile; verify the recipe and correction record and try rapid repeated taps.
- [ ] Edit an unfinished review, leave the screen, then fully close/reopen the app; verify the recovered text, notes, writer and photo.
- [ ] Discard a review, reopen the screen, and verify it stays discarded. Save a recovered review and verify its original photo appears on the recipe card/detail.
- [ ] Search by name/ingredient/description, clear the search, and compare newest/oldest/A–Z orders.
- [ ] Save and edit a manual recipe; verify ingredients/steps, photo upload, Cancel, and delete confirmation.
- [ ] Feel button, selection, success, and error feedback on physical iOS/Android devices; check system-disabled haptics too.
- [ ] Integrate Daniel's art and check image sharpness, animation timing, touch targets, screen-reader labels, and reduced-motion behavior on the target device.

These changes prepare the existing app for the artwork pass. They do not establish model accuracy, an installed native build, or production-release readiness.
