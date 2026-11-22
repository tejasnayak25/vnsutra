# Rigged Characters (`.vnsprite` & WebGL2 Live Rigging)

VN-Sutra supports optional hardware-accelerated live 2D characters via `RiggedCharacter` and `RiggedOutfit` alongside the classic `Character` and `Outfit` modules.

## 1. Building `.vnsprite` Bundles

Place your character mood PNGs under `assets/game-assets/characters/<Character>/<Outfit>/` and run:

```bash
npm run assets:rig
```

This runs [`scripts/rig-characters.py`](../scripts/rig-characters.py) across every outfit directory (`--all --install`), generating:

- `<Outfit>.vnsprite` next to the outfit folder (`[4B "VNSR" | u16 version=1 | u16 flags=0 | u32 jsonLen | UTF-8 manifest | raw WebP atlas]`)
- Cached intermediates in `dist/.cache/frame-decomp` and interactive previews at `dist/sprite-experiment/unified_<char>_<outfit>/preview.html`

Useful CLI flags:

- `python -u scripts/rig-characters.py sakura --install` — build one preset character cleanly with 4 parallel ORT workers (`--workers N`, `--no-cache` to bypass disk cache)
- `python scripts/rig-characters.py --pack-only --install` — repack existing `character.manifest.json` + `blocks_atlas.webp` into `.vnsprite` without re-running ML decomposition

## 2. Using `RiggedCharacter` in Story Scripts

Import `RiggedCharacter` from `vnsutra_modules/assets/index.js` just like `Character`:

```js
import { RiggedCharacter } from "../vnsutra_modules/assets/index.js";
import DynamicSprites from "../vnsutra_modules/dynamic-sprites.js";

const sakura = new RiggedCharacter({
    name: "Sakura",
    folder: "characters/Sakura",
});
await sakura.loadOutfit("Casual");

sakura.sprites = new DynamicSprites(sakura);
sakura.sprites.defineMany({
    smiling: { outfit: "Casual", mood: "Smiling" },
    happy: { outfit: "Casual", mood: "Happy" },
});
```

### Runtime Features & Controls

- **Konva Parity:** `show()`, `hide()`, `fadeIn()`, `fadeOut()`, `slideIn()`, `slideOut()`, `to({ x, y, scale, opacity, mood, duration, ...filters })`, `reset()`, and `dispose()`.
- **WebGL2 Mesh Deformation + Canvas2D Fallback:** Uses a `24x32` GPU triangle grid (`WebGLRigRenderer`) for smooth hair waves, skirt flutter, localized torso breathing, and seamless mood crossfades, falling back cleanly to Canvas2D where WebGL2 is unavailable.
- **Quintic Mood Crossfading & Shader Layer Mixing:** Mood transitions (`to({ mood, duration })`) use a $C^2$ quintic smootherstep curve (`evalMorphCurve`), non-dipping asymmetric organ blending, a subtle `10%` eyelid cushion, single-pass `uTexPrev`/`uMorphMix` GPU mixing for changed eyebrow/blush/cloth layers, rapid-interrupt continuity, and subtle expression-matched micro-spring impulses.
- **Idle Background Layer Pre-Warming:** `RiggedOutfit` pre-warms unvisited `(mood, layerId)` textures in idle background slices (`requestIdleCallback` / `setTimeout`) so the first mood switch has zero WOLA/GPU upload stutter.
- **Ambient Lighting Tint:** Call `setTint(color, strength)` / `clearTint()` (or drive all active actors together via `game.camera.setLighting("sunset" | "night" | "dramatic" | "noir" | "day")`) using the premultiplied-safe `uTint` shader uniform and Canvas2D fallback.
- **Cursor Gaze & Attention:** Tracks cursor movement (`gaze = true`), supports explicit `lookAt(x, y)` / `clearLookAt()`, and automatically glances toward other active speakers (`speakerAttention = true`).
- **Secondary Physics & Dialogue Reactions:** Call `hop(strength)`, `shake(strength)`, `setWind(level)`, or set `wind`, `breathe`, `blink`, `talkMouth`, and `autoReact` (triggers subtle bounce on `!` and curiosity tilt on `?`).
- **Voice Audio Lip-Sync:** Pass an `HTMLAudioElement`, `MediaStream`, `AudioNode`, or `{ analyser }` to `attachAudio(source)` (and release with `detachAudio()`), or rely on automatic text-cadenced `EVENTS.DIALOG` / `EVENTS.DIALOG_END` lip-sync when silent.
- **Accessibility:** Honors `accessibility-reduce-motion` (`vnsutra_modules/accessibility.js`) by stopping idle loops/springs and snapping mood/transform transitions.

## 3. Preview Studio (`preview.html`)

Open any generated `preview.html` in a browser to:

- Switch moods with **Mood Crossfade** and tune **Crossfade Time** (`0.15s–0.90s`, default `0.45s`), toggle `WebGL2 Mesh Deformation` or `Cursor Gaze (2.5D)`, inspect quadtree blocks (`64/32/16`) and split compare (`Hard` vs `4px WOLA`).
- Check **Edit Pivots on Canvas** to drag `head`, `neck`, `waist`, or `hairSplit` live, click **Lock Talk Mouth** to bind a preferred lip-sync mouth to the current mood (`manifest.talkMouthMap`), and export an updated `.vnsprite` directly from the browser.
