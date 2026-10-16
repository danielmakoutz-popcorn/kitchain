# Try and merge KitChain PR #1

[PR #1](https://github.com/danielmakoutz-popcorn/kitchain/pull/1) is a review page for the changes on `codex/kitchain-scanner-polish`. GitHub's main project branch is named `master`. Merging brings this branch into `master`; checking out the branch lets you test it first.

## 1. Get the test branch

Run from your existing KitChain repository folder:

```bash
git fetch origin
git switch codex/kitchain-scanner-polish
git pull --ff-only
```

Git keeps your existing local changes protected when switching. If it reports conflicting local changes, resolve or commit them before switching.

## 2. Restart the backend

From the repository root, in one terminal:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Keep your existing database and `.env` configuration. The active routes use synchronous SQLModel sessions, so `DB_URL` should use `sqlite:///...`, not `sqlite+aiosqlite:///...`. Normal startup creates the scan-to-recipe link table needed to reuse saved scans on retries.

Keep Ollama running with the existing `qwen2.5vl:3b` model. The model and extraction prompt have not changed.

## 3. Restart the app

In another terminal, enter this repository's `app` folder:

```bash
npm ci
npx expo start
```

Use your usual Expo phone workflow. Keep `EXPO_PUBLIC_API_BASE` in `app/.env` pointed at the backend's reachable LAN address. Run `npm ci` because this update adds the SDK-compatible AsyncStorage dependency and makes FileSystem explicit. A custom native development build needs to include those native modules; the installed build/device workflow has not been verified here.

## 4. Try the new behavior

1. Scan a recipe, edit an ingredient and note, and return to the recipe list without saving. Reopen Add from Photo: the unfinished review should return.
2. Fully close and reopen the app, then reopen Add from Photo. Check the text, writer and original photo. Wait for the draft-saved status before closing.
3. Save the recovered recipe. Its original card photo should appear in the recipe list/detail, and the local draft should clear.
4. Discard a different unfinished review; reopening the screen should not restore it.
5. Search by a recipe name, description or ingredient. Try Newest, Oldest and A–Z, then Clear search.
6. Feel the button/selection/result haptics and compare the real AI output with the original card.

Draft recovery is local to this device/browser and API server. It does not resume an interrupted model job or synchronize unfinished drafts across devices. A stored draft can only attach its scan photo while that server still retains the source scan.

## 5. Merge after testing

Open [PR #1](https://github.com/danielmakoutz-popcorn/kitchain/pull/1), scroll to the draft notice, and click **Ready for review**. When the changes are ready, use **Merge pull request**, then **Confirm merge**. GitHub may display a different merge method if you choose it from the dropdown.

This updates GitHub. To use the merged version locally, run from the repository:

```bash
git switch master
git pull --ff-only
```

Restart the backend and Expo using the steps above. The same PR contains the scanner polish, haptics, all three follow-ups, and the [pixel-art handoff](PIXEL_ART.md).

GitHub references: [marking a draft ready](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-stage-of-a-pull-request) and [merging a pull request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request).
