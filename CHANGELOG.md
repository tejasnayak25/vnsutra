# Changelog

All notable changes to **VN-Sutra** are documented in this file.

## [2.1.0] - 2026-11-12

### Added
- **Live Rigged Characters (`.vnsprite` & WebGL2):**
  - Added `RiggedCharacter`, `RiggedOutfit`, and `WebGLRigRenderer` (`24×32` GPU mesh + Canvas2D fallback) with 2.5D head/iris gaze tracking (`lookAt`, `clearLookAt`), speaker attention, secondary springs (`hop`, `shake`, `wind`, `breathe`), closed-eye blink swaps, and Web Audio / text-cadenced lip-sync.
  - Added $C^2$ quintic mood crossfading (`evalMorphCurve`), single-pass `uTexPrev`/`uMorphMix` shader mixing for eyebrow/blush/cloth diffs, `10%` eyelid cushion, rapid-interrupt continuity, idle background layer pre-warming, and mood-matched micro-spring impulses.
- **Zero-Backend Static Export (`assets.manifest.json`):**
  - Added `scripts/assets-manifest.js` (`npm run assets:manifest`) and updated `Character.loadOutfit` to load directly from `./assets/assets.manifest.json` without `JSZip`, `archiver`, or `/folder`.
- **Cinematic Stage 2.0:**
  - Added `CameraController` (`game.camera`: bounded 2D `pan`, `focus`, `reset`, and `setLighting` presets `day`, `sunset`, `night`, `dramatic`, `noir` with stage multiply overlay + `uTint` character grading).
  - Added procedural wipe transitions (`wipe-left`, `wipe-right`, `wipe-up`, `wipe-down`, `iris`, `blinds`) in `visual-effects-utils.js`.
  - Added multi-plane procedural `WeatherSystem` (`rain` with ground ripples, `snow` bokeh, 3D-tumbling `cherry_blossoms`, additive `embers`, `off`).
- **Instant Rollback & Audio Engine 2.0:**
  - Added `RollbackManager` (`game.rollback`) with step snapshots, mouse-wheel / `PageUp` / `PageDown` bindings, and smooth mood/camera restoration.
  - Added `crossfadeMusic`, `playAmbient`, `stopAmbient`, `duckMusic`, `restoreMusic`, and rate-throttled `playBlip` in `audio-effects-utils.js`.
- **Dev Tooling & SDK Packaging:**
  - Added dev-server-only `?studio=true` overlay (`api/config.js`), in-place `.vn` scene HMR (`dev-server.js` + `init.js`), `build:release` (`scripts/build.js --release` stripping dev studio and `.cache`), `pack:check`, and `.github/workflows/release.yml`.

### Fixed
- **Clean Game Session Isolation:** Added monotonic `gameSessionId` (`runtime-state.js`) and full audio/camera/lighting/weather/rollback teardown on exit and scene start so aborted games can never overlap with new runs.
- **`.vn` Compiler:** Updated `scripts/story-build.js` to support hyphenated transitions (`wipe-left`, etc.), `music crossfade:`, `ambient play/stop`, and `weather:` shorthands.

### Removed
- Removed `vnsutra_modules/jszip.min.js`, `archiver`, and the `/folder` ZIP endpoint.
