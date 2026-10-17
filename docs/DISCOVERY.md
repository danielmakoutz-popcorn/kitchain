# Nutrition, recommendations and the public recipe table

This branch builds on the kitchen design in PR #2. It adds the five approved discovery requirements while retaining the existing local photo model, prompt, uploads, draft recovery and art slots. It does not deploy KitChain to the internet.

## Try this branch

From your existing repository:

```bash
git fetch origin
git switch codex/kitchain-discovery-public
git pull --ff-only
```

Keep your database and photos. Startup adds new tables and imports the bundled nutrition records once; it does not rebuild the original recipe, scan or writer tables. Do not delete the database or run the historical baseline-rebuild Alembic revision to install these features. The upgrade is covered by a test that starts with the older schema and checks that its columns and recipe/photo references survive.

In your backend terminal, activate the existing virtual environment and install the locked dependencies:

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Create a [Tavily account](https://app.tavily.com/) on the free plan and create a dedicated KitChain API key. Add the following to **backend/.env**, preserving any settings already there:

```dotenv
TAVILY_API_KEY=your_key_here
SEARCH_MONTHLY_CREDITS=1000
SEARCH_DAILY_PER_MEMBER=20
SEARCH_MAX_PAGES=3
TEXT_AI_MODEL=qwen3:4b
TEXT_AI_ENABLED=true
```

Never put the Tavily key in `app/.env` or an `EXPO_PUBLIC_*` variable. The app only receives the provider's configured status and the remaining allowance.

Install the separate text model once:

```bash
ollama pull qwen3:4b
```

Keep Ollama running, with the photo scanner's existing `qwen2.5vl:3b` model installed too. The text model is configurable; it still needs to be benchmarked on your laptop with real cooking requests. If it is unavailable, KitChain reports that it is using keyword/ingredient matching. Nutrition arithmetic and saved recipes work without either text AI or web search. To explicitly disable text inference, set `TEXT_AI_ENABLED=false` on the backend.

Restart the backend:

```bash
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

In the frontend terminal:

```bash
cd app
npm ci
npx expo start --clear
```

Keep `EXPO_PUBLIC_API_BASE` in `app/.env` pointed at the laptop's reachable LAN address. Open the new QR code in Expo Go on the same Wi-Fi. Node 24 LTS and the existing Expo SDK 57 setup remain the same.

## What was added

| Requirement | Implemented behavior |
| --- | --- |
| Search account and limits | Backend-only Tavily key; basic search explicitly costs one credit; monthly global reservation, daily per-cook limit, bounded source reads and repeat-search cache |
| Separate text AI | Ollama schema-based request interpretation and comparison of existing candidate IDs; malformed output and invented IDs are rejected; keyword fallback is disclosed |
| Recipe-page reader | Recipe JSON-LD ingredients, directions, author, servings, source and duration; robots checks, bounded downloads/redirects and public-IP socket pinning |
| Nutrition data and corrections | 7,793 self-hosted USDA foods, food-specific portions, weight conversions, whole-recipe and per-serving estimates; editable food matches and grams |
| First-version experience | Typed request, ingredients on hand, exclusions, optional time/protein/calorie limits; up to three sourced choices with reasons, missing ingredients and available nutrition |
| Public mode and cook ratings | Separate public collection, title search, newest/highest-rated ordering, paste-link import, explicit sharing, copy where permitted, cooked confirmation and 1–5 star ratings |

The ingredients-on-hand field is a device-saved list for matching. Quantity/freshness inventory, pantry-photo intake, expiration reminders, grocery lists, persistent dietary profiles, meal plans and coaching are not part of this change.

## Nutrition data

The committed compressed catalog is a normalized copy of USDA FoodData Central **SR Legacy, April 2018**, not AI-generated values. Its source archive, original checksum, normalized checksum, nutrient basis and record count are recorded in [manifest.json](../backend/data/nutrition/manifest.json). The archive is approximately 344 KB compressed after retaining food IDs, descriptions, five nutrients and household portions. The records are imported into the backend database on first startup, rather than shipped as a large phone database.

The source is public domain/CC0. Links: [USDA downloads](https://fdc.nal.usda.gov/download-datasets/), [USDA licensing](https://fdc.nal.usda.gov/api-guide/).

To reproduce the bundled data, download the exact SR Legacy JSON ZIP linked in the manifest, then run:

```bash
python scripts/import_usda.py /path/to/FoodData_Central_sr_legacy_food_json_2018-04.zip
```

The startup seed runs only for an empty nutrition table. Rebuilding the bundled archive does not silently replace an existing database catalog. Updating to another release needs an explicit import/migration review, including how old FDC IDs and saved corrections are preserved.

The calculator:

- Parses metric/US weights, fractions and food-specific household portions. It does not apply a universal grams-per-cup conversion.
- Prefers ordinary food records over unrequested product forms such as breaded tenders or rice noodles. Generic cooked rice/chicken breast use editable USDA defaults rather than silently choosing those processed alternatives.
- Flags missing quantities, ambiguous density, missing nutrient records and uncertain matches. The user can select a USDA food and enter grams.
- Separates complete totals from **resolved ingredients only** partial totals. Per-serving values require both a complete calculation and a serving count.
- Makes exclusions explicit. An ingredient excluded by the user is omitted from the calculation and counted in the notice.
- Invalidates ingredient corrections when the underlying ingredient list changes; stale saves return a conflict instead of attaching a correction to another ingredient.

These are nutrition estimates. Raw/cooked choices, edible weights, preparation losses and actual servings affect accuracy. Suggested matches need review; an automatic match is not presented as a user-confirmed record.

## Search and recommendation behavior

Saved family and public recipes are checked first, or public recipes only when selected. A best score of at least 0.55 is treated as a good saved match. If no candidate reaches that threshold and web search is enabled, KitChain makes one basic Tavily request and attempts up to three recipe source pages by default. It then compares the updated catalog. It returns fewer than three choices when fewer qualify, including an empty list when needed.

Tavily's generated answer and snippets are never treated as a finished recipe. The reader needs an actual source page with structured ingredients and directions. Unsupported/blocked pages are skipped with a notice. Pasted recipe links use the same reader without spending a Tavily search credit.

Time and macro limits are enforced by code. Unknown time or unavailable per-serving nutrition cannot satisfy a requested limit. The text model can order existing candidates but cannot add unvalidated IDs, source URLs, ingredients, stars or nutrition numbers to the response. Exclusions use recorded ingredient text and common ingredient groups; they cannot certify that a recipe or a packaged ingredient is free from an allergen or cross-contamination. The app tells cooks to check the source and labels.

The current catalog comparison is bounded to 1,000 public and 500 family records and calculates nutrition for up to 20 relevant family candidates. Larger collections should move retrieval into indexed search before those bounds are raised.

Recorded cook ratings provide a small, vote-count-weighted preference between relevant recipes and are included in the text model's bounded comparison previews. They never override ingredient, time or nutrition restrictions; unrated recipes do not acquire invented stars.

The Tavily adapter is isolated in `backend/app/services/discovery.py`; switching the search provider later does not require rewriting the app screens.

## Free-tier limits

The global cap defaults to **1,000 basic Tavily searches per UTC calendar month**, shared across every cook on this server. It cannot be raised above 1,000 by configuration in this version. A second cap defaults to 20 per local cook profile per UTC day. Reservations use conditional database updates and are committed **before** an external request, including across concurrent workers. A failed or ambiguous request conservatively keeps its reserved credit.

Repeated searches reuse a recent result for 12 hours, or a no-results attempt for one hour. Cached references, public recipe metadata, derived nutrition and permitted recipe text are retained; raw Tavily content and entire HTML pages are not stored.

Keep paid overages disabled in Tavily and use a dedicated key/account allowance for this app. KitChain's counter covers calls made by this database, not unrelated tools using the same Tavily account. A database restore can also restore older counters. Provider-side limits remain the final billing boundary. Missing keys, quota exhaustion and provider failures leave saved recipe matching available.

Reference: [Tavily credits](https://docs.tavily.com/documentation/api-credits), [search endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/search).

## Public recipe content and attribution

Every successfully read web find becomes one deduplicated public entry with its canonical source link, publisher, available author, ingredient-name search metadata and available derived nutrition. Reimporting that URL keeps the same recipe ID and its cook ratings. Tracking query parameters are removed; functional query parameters are preserved.

Full ingredients and instructions are kept when the Recipe metadata explicitly supplies a supported commercial-use Creative Commons license, or when the operator has separately verified and configured permission for the source's exact hostname. Otherwise the entry is a **source card** that opens the original publisher's page. Source cards can be discovered and rated but cannot be copied into the family collection as full recipes. Attribution alone does not cause unknown sources to be marked reusable.

The initial supported license URLs are CC BY and CC BY-SA 3.0/4.0, CC0 and Public Domain Mark 1.0. CC BY-NC is not treated as public-app permission. The source/author/license remains visible on public entries and on permitted family copies; modifications still need to follow the applicable source license. Permissioned hostnames are an explicit operator assertion, not an automatic permission detector.

A family recipe is only published after the cook explicitly confirms that they own the recipe or have the right to share it. Sharing copies title, ingredients and directions; the photo, handwriting profile, raw scan and correction history remain in the family collection. Imported recipes cannot be republished through that action as someone's own. A contributor can remove their public snapshot without deleting their family original. Public copies are snapshots, so editing/deleting a family original does not silently rewrite/remove an already shared public version.

## Local cook profiles and the hosting boundary

The app creates one persistent local cook profile when a search, import, contribution or rating first needs it. The backend stores a hash of its random bearer token; the token stays in device storage and is scoped to the API address. Public responses do not expose tokens or member identifiers. One public-recipe rating per profile is enforced by the database, and updates replace that profile's previous vote. A cook must affirm that they made the recipe before submitting stars.

These are **local-beta profiles**, not authenticated internet accounts or proof of a unique person. Clearing device storage or using another device creates another profile. The existing family routes still form the same trusted-LAN family collection; they have not acquired per-user authorization in this change. The public table is a separate catalog on that server, not an internet deployment.

Before the cloud/public launch, the deferred hosting/account work must provide real account/household authorization, account-linked ratings, public-write controls and deployment configuration. Nothing here publishes the laptop server to the internet or starts a paid hosted AI service.

## Validation

The [validation record and rendered examples](DISCOVERY_VALIDATION.md) record the completed checks and their limits.

Run the automated checks from the repository root:

```bash
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python scripts/validate_local.py
cd app
npm test
npx tsc --noEmit
npm run lint
```

The API tests use actual temporary SQLite databases, including foreign keys and concurrent quota requests, with synthetic publisher/model/provider responses. They also verify the committed USDA catalog checksum and a real USDA record. The scanner regression tests continue to assert the original photo model, prompt options, upload behavior, drafts and photo attachment. No paid API is called by the tests.

Optional browser flow check, with Playwright installed for development:

```bash
cd app
EXPO_PUBLIC_API_BASE=http://127.0.0.1:8017 npx expo export --platform web
cd ..
node scripts/check_discovery_ui.cjs
```

The harness starts its own disposable API/database and uses actual USDA matching/arithmetic, while simulating recipe sites and Tavily. Set `KITCHAIN_TEST_PYTHON`, `PLAYWRIGHT_MODULE_PATH`, `CHROMIUM_EXECUTABLE` or `KITCHAIN_WEB_EXPORT` when those tools/builds are in other locations.

Phone checks before merging: scan/save an existing recipe; correct an ingredient weight and serving count; request a recommendation; import a real supported recipe URL; rate/update a recipe after cooking; share a recipe and verify that its original photo/writer profile are absent from the public entry. Check large text, keyboard behavior and haptics. Actual Tavily quality, the selected text model's cooking judgment and native-phone behavior require live testing; the automated checks do not establish those.
