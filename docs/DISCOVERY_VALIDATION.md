# Discovery validation · 2026-10-17 UTC

| Check | Result |
| --- | --- |
| Python API/data suite | 50 passed, including the existing 16 scanner cases |
| Frontend regression suite | 19 passed |
| TypeScript / ESLint | Passed without errors or lint warnings |
| iOS export | Hermes bundle generated |
| Android export | Hermes bundle generated |
| Web export | Static routes and client bundle generated |
| Existing kitchen browser flows | Passed at 320/390/768/1280 px; no browser exceptions or horizontal overflow |
| Discovery browser flows | Passed against a disposable real SQLite/USDA API at the same widths; no browser exceptions or horizontal overflow |
| USDA catalog | 7,793 records; normalized checksum and known source records verified |
| Existing-data upgrade | Original recipe schema, text and photo references retained while adding tables |

The backend suite covers quantity/portion arithmetic, incomplete totals, corrections and stale-edit rejection, exact-source deduplication, credit and license retention, public/family separation, rating validation/uniqueness/updates, public removal, hard filters, local-model failures, invalid model IDs, robots rules, URL/IP restrictions, DNS socket pinning and concurrent search limits. It also checks legacy SQLite without foreign-key cascades and reuse of old family recipe IDs.

The discovery browser harness checks a saved match without search, a missing match with one search credit, source-card vs permitted full-text behavior, cooking confirmation and rating updates, permitted copies retaining their source/license, actual USDA food/grams/serving corrections, share Cancel/confirm, public removal and sorting, and a direct public-only recommendation URL. Source sites and Tavily are synthetic; the text model is disabled for those browser checks. The existing browser harness separately checks scanning, review, drafts, recipe creation/editing/search and dialogs with synthetic API replies.

These results do not establish live Tavily recipe coverage, a recipe-page success rate, text-model cooking judgment, handwriting accuracy or native-phone behavior. No live Tavily key was used, no paid service was enabled and no personal database was used for validation. The next checks are real-phone flows plus live source/model requests after local setup.

## Rendered examples

Screenshots show synthetic recipes with the actual kitchen components and USDA calculator:

- [Recommendation results](discovery/recommendations.png)
- [Nutrition corrections saved](discovery/nutrition.png)
- [Public recipe rating](discovery/public-recipe-rating.png)
- [Public collection](discovery/public-collection.png)

Use [DISCOVERY.md](DISCOVERY.md) for local setup, the feature scope and repeatable checks.
