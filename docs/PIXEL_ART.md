# KitChain pixel-art handoff

Daniel's finished art belongs in `app/assets/pixel/`. This pass leaves that art to Daniel and supplies the integration points; all entries are currently null and the existing UI remains usable.

## Asset map

| Registry key | Where it appears | Current fallback |
| --- | --- | --- |
| `scanButton` | Beside Scan with AI / Scan again | Button text |
| `scanWorking` | While the local AI reads | Native activity indicator and status text |
| `scanReady` | Above the editable review | Review heading and fields |
| `scanError` | Beside a scan failure/retry message | Error text |
| `recipePlaceholder` | A recipe card without a photo | No Image label |

Add literal Metro `require(...)` sources in `app/constants/art.ts`. For example, once the file exists:

```tsx
scanButton: {
  source: require("../assets/pixel/scan-button.png"),
  width: 32,
  height: 32,
},
```

The shared `ArtSlot` component selects the named asset, preserves its aspect ratio, uses integer layout multiples, and disables image crossfades. The scan-button slot uses 1× layout; other slots default to 2×. Asset width/height specify the intended base layout size. Labels and touch handling remain outside the artwork, so changing art does not change scanning or button behavior.

## Export conventions

- Start from the existing 32×32 working canvas and cohesive small palette where appropriate; rectangular cards can use their own dimensions.
- Use transparent PNG for static UI art. Give files meaningful lowercase names such as `scan-button.png` and `recipe-placeholder.png`.
- Prepare nearest-neighbor exports for the actual display sizes/device densities. Integer layout alone does not guarantee native image sampling will keep source pixels sharp; verify after the files arrive.
- Keep a consistent anchor and canvas across an animation. Full sprite-sheet playback, frame timing, button bounce, and success sparkles belong to the final artwork pass; they are not implemented by these empty slots.
- Keep visible action/error labels. Artwork is decorative and should not be the only indication of status.

App launcher/splash artwork uses the existing paths in `app/app.json`. `app/app.config.js` now extends that configuration instead of replacing it. Change those assets separately when the final exports are ready.

Before release, inspect real artwork on the target phones for crispness, clipping, palette consistency, animation/reduced-motion behavior, and contrast. This setup does not invent replacement sprites or final animation timing.
