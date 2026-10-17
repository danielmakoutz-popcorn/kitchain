# KitChain pixel-art handoff

The approved warm-kitchen interface is implemented in `app/components/kitchen/`, with the palette in `app/constants/kitchen.ts`. Its scalable pixel frames, parchment grain, buttons, inputs, search, scanner brackets, sparkles, and confirmation panels are code-native SVG/React Native pieces. Text stays live and accessible rather than being baked into pictures.

Daniel's finished food sprites and onion-cutting animation belong in `app/assets/pixel/`. All entries in `app/constants/art.ts` remain null until his actual files arrive. The interface uses decorative fallbacks in those spaces and does not generate replacement food sprites.

## Asset map

| Registry key | Where it appears | Current fallback |
| --- | --- | --- |
| `homeHero` | Above the home wordmark | Small herb sprig |
| `scanButton` | Beside Scan with AI / in the empty photo frame | Scanner symbol |
| `scanWorking` | While the local AI reads | Spinner in a 96×64 space; ready for the onion animation |
| `scanReady` | Above the editable review | Success check |
| `scanError` | Beside a scan failure/retry message | Error text remains visible |
| `recipePlaceholder` | A recipe card without a photo | Recipe-book symbol |
| `collectionEmpty` | An empty recipe collection | Recipe-book symbol |
| `saveSuccess` | Saved-recipe popup | Check and sparkles |

Add literal Metro `require(...)` sources in `app/constants/art.ts` after the file exists:

```tsx
scanButton: {
  source: require("../assets/pixel/scan-button.png"),
  width: 32,
  height: 32,
},
```

## Animation handoff

Export same-canvas transparent frames with a stable anchor. A frame sequence can use:

```tsx
scanWorking: {
  source: require("../assets/pixel/onion-01.png"), // still poster for reduced motion
  frames: [
    require("../assets/pixel/onion-01.png"),
    require("../assets/pixel/onion-02.png"),
    require("../assets/pixel/onion-03.png"),
  ],
  frameDurationMs: 120,
  width: 32,
  height: 32,
},
```

Timing is configurable (minimum 40 ms). Playback stops when the slot unmounts or the system requests reduced motion; reduced motion uses `source`. The scan-working slot is mounted only while scanning. A sprite sheet will need its frame geometry mapped when that actual export arrives; no sheet dimensions or timing are guessed here.

## Palette and exports

| Anchor | Hex |
| --- | --- |
| Warm ivory | `#FFF7E6` |
| Parchment | `#EFD5A3` |
| Terracotta | `#E1845F` |
| Garden herb | `#9CBB78` |
| Espresso | `#543A31` |
| Golden butter | `#F7D66D` |
| Ripe tomato | `#E56F56` |

- Continue using the 32×32 working canvas and this small palette where appropriate. Rectangular assets can have their own dimensions.
- Use transparent PNG for static assets and frame exports, with meaningful lowercase filenames.
- `ArtSlot` preserves aspect ratio, uses integer layout multiples and disables image crossfades. The scan-button slot is 1×; other slots default to 2×. Base width/height specify layout size.
- Nearest-neighbor source exports should be prepared for intended display sizes/device densities. Integer layout alone does not guarantee the native renderer will keep every source pixel sharp; check actual exports on the phone.
- Actions, errors, progress labels and touch handling remain outside the art. No artwork is required to understand or operate the controls.

Launcher and splash art are separate existing assets in `app/app.json`; they will be replaced only when final exports are provided. See [the design review](KITCHEN_DESIGN.md) for implementation and device checks.
