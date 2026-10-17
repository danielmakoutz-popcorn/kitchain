# Pantry and keyboard validation · 2026-10-17 UTC

| Check | Result |
| --- | --- |
| Backend API/data suite | 60 passed, including all 16 existing scanner checks |
| Frontend regression suite | 23 passed |
| TypeScript and ESLint | Passed |
| iOS / Android / web exports | Generated both Hermes bundles and static web routes |
| Pantry and discovery browser flows | Passed against a disposable real SQLite/USDA backend |
| Existing kitchen browser flows | Passed scanning/review/save, recipe creation/editing/search and confirmation dialogs |
| Responsive browser layouts | No horizontal overflow at 320, 390, 768 or 1280 pixels; no browser exceptions |

New backend checks exercise owner-derived authorization, separate cook pantries, persistence, normalization, empty-list clearing, invalid submissions, optimistic version conflicts, actual multipart/Pillow/JPEG preparation, bounded image size, model failure handling and photo suggestions that do not save a pantry or create recipe scans. Source checks cover gzip/deflate handling, bounded decompression, cached failure links and a later usable publisher after earlier imports fail. The original scanner model/prompt/service remains unchanged.

Frontend checks cover manual/photo-name merging and limits, authenticated pantry requests, reuse of the same profile for concurrent calls and preservation of profile identity during transient server failures. A profile is recreated only after a server 401, rather than a generic network error.

The browser harness verifies legacy search-list adoption, manual pantry editing/save, an actual browser photo picker/multipart upload through the ingredient-photo route, editable suggestions, duplicate merging, reuse and saving of the same pantry in recommendations, stale-save conflict/reload confirmation, an empty pantry for another cook, source-failure links and manual-entry fallback. It also reruns existing discovery, attribution, nutrition-correction and cook-rating flows.

Commands are documented in [DISCOVERY.md](DISCOVERY.md). The pantry extension is called by `scripts/check_discovery_ui.cjs`; its synthetic backend fixture replaces Tavily, publisher HTML and the vision HTTP response. No live API key, model inference, personal database or phone camera was used for these checks. Native keyboard gestures/insets, camera permissions and real ingredient recognition still need the [phone checks](PANTRY.md#quick-phone-check). The specific Food Network URL/error was not supplied or reproduced.
