# Pantry, keyboard handling and recipe-site imports

This update builds on discovery in PR #3. Switch to `codex/kitchain-pantry-keyboard`, restart the backend, and restart Expo with `npx expo start --clear`. Existing dependencies and installed models are sufficient. Startup adds pantry and source-report tables; existing recipes, scans, photos and nutrition records are retained.

## Your pantry

Open **My pantry** from the home page or **Open my pantry** from recommendations. Enter up to 80 ingredient names, separated by commas or lines, and tap **Save pantry**. Edit names or delete their lines as ingredients are used. Recommendations load the same saved list; changes there save when **Find three recipe ideas** is tapped. The previous device-saved search ingredient list is adopted once when the current cook has no pantry yet.

Saved lists belong to the current local cook profile and are stored on the backend. API requests identify the owner from its bearer token; clients cannot choose another owner. This beta's profile is tied to the device/API server. It is not yet a sign-in account that can be recovered on another phone. Local drafts are also scoped to that cook and server. A stale save returns a conflict and keeps edits on screen; **Reload saved pantry** loads the latest saved version after confirmation.

For photos, use **Take ingredient photo** or **Choose ingredient photo**, then **Read ingredient photo**. The existing `qwen2.5vl:3b` model suggests food names. Review/edit them, tap **Add reviewed ingredients**, then **Save pantry**. Names are merged without duplicates. Uncertain names are displayed separately for manual review; quantities, freshness and hidden packaged-food ingredients are not inferred. The photo and raw model response are not saved by this endpoint. It does not create recipe scans or change handwriting profiles. One pantry photo runs at a time, and its model is unloaded after that request completes.

## Keyboard

Shared form scroll views adjust their iOS content inset for the software keyboard, allow interactive drag-to-dismiss on iOS and drag dismissal on Android, and retain button taps. Single-line fields use a Done action unless a screen supplies its own action. Recipe review/editing uses the same shared behavior rather than an additional fixed-offset keyboard wrapper. Android builds request keyboard resize mode. Opening a confirmation dismisses the keyboard.

Physical-device verification is still required: focus the last ingredient or numeric field on recommendations, pantry, recipe writing, recipe editing, photo review, nutrition corrections and public URL import; scroll to the bottom; drag to dismiss; confirm the bottom action is reachable. Check iOS decimal keyboards as well as text/multiline keyboards. Android resize behavior should also be checked in a native build.

## When a recipe website cannot be imported

Searching and importing are separate operations: Tavily can find a URL while the publisher refuses a direct fetch, requires a browser/login, exceeds the download bound, or lacks complete Recipe JSON-LD. A pasted exact URL uses the same reader, without a Tavily search call.

The reader supports bounded gzip/deflate responses in addition to uncompressed pages. It preserves robots checks, public-IP validation, TLS hostname checks and redirect/download limits. HTTP rejections carry a useful status in the error. Food Network's exact failed page and error have not been reproduced; support for compressed responses does not guarantee a successful import there.

Recommendations attempt up to five source pages by default from one basic search. Failed sources keep their titles, URLs and reasons as **unverified original websites**, separate from verified recommendation choices and public recipes. Cooks can open these links themselves. Pasted-link failures also offer opening the original, searching another publisher, or manually entering ingredient facts and their own cooking notes in a family recipe. The app does not claim it verified a blocked recipe or replace it with invented instructions.

Successful searches cache for 12 hours; no-import results cache for two minutes with their failure links and an explicit retry notice. A reader-version prefix prevents old one-hour empty caches from hiding the new behavior. KitChain logs the failed hostname/path and reason without the Tavily key or URL query parameters. Set `SEARCH_MAX_PAGES=5` in `backend/.env` if an existing override still sets it to three; the maximum remains five.

## Quick phone check

1. Open My pantry and check that the previous recommendation ingredient list appears.
2. Save a few ingredients, leave the page, return, and check they remain.
3. Read an ingredient photo; edit the suggestions; check nothing is saved until you add/review/save it.
4. Open recommendations and check the pantry appears. Edit it, request ideas, then verify the changed list in My pantry.
5. Use a blocked/unsupported recipe URL and check that the message and original-site/manual-entry options appear.
6. Repeat the keyboard checks above. Real phone camera permissions and model-recognition quality need live testing.

All provider/model tests use synthetic responses. Cloud hosting and recoverable user accounts remain a separate next step.
