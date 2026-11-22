# Changelog

All notable changes to **VN-Sutra** are documented in this file.

## [3.0.0] - 2026-11-22

### Added
- **2.5D Depth Parallax Stages (`.vnstage`):**
  - Standalone binary container specification (`VNST`) bundling high-efficiency packed WebP texture atlases with JSON metadata in a single network payload.
  - Automated deep-learning background processor (`scripts/build-stage-atlas.py`) utilizing SegFormer (ADE20K) for semantic scene understanding and Depth-Anything-V2 for continuous metric relative depth estimation.
  - Push-pull normalized background inpainting behind occluding foreground geometry (zero texture tearing, zero holes, zero ghost duplicates).
  - Runtime `ParallaxStage` module with dynamic camera counter-shifting, mouse tilt tracking, overscan management, and continuous depth displacement.
  - Added `@stage` directive to `.vn` story scripts and smooth stage-to-stage crossfade transitions (`transition: crossfade <duration>`).
- **Character Evolution & Sakura Integration:**
  - Integrated `Sakura` as the flagship intro rigged character with `Casual.vnsprite` bundle, secondary spring physics, eyelid blinks, lip-sync, and quintic mood crossfades.
- **Model Downloader & Production Asset Tooling:**
  - Added official CLI executable (`bin/vnsutra.js`) supporting `npm create vnsutra <project>` and `npx vnsutra create <project>`.
  - Added `scripts/download_stage_models.py` (`npm run models:download:stages`) for pre-caching and verifying SegFormer B0 ADE20K and Depth-Anything-V2 models.
  - Standardized pipeline scripts in `package.json`: `assets:stages`, `assets:rig`, `models:download`, and `assets:backgrounds`.
- **Modernized UI & Dark Amethyst Theme:**
  - Upgraded theme styling with Dark Amethyst palette (`#17152F`, `#B88AEF`, `#F2A9D5`).
  - Redesigned Alert Window, Disclaimer Window, and Chapter selection.

### Changed
- Replaced demo character `Nanami` with `Sakura` across all story scripts (`start.vn`), game definitions (`assets.js`, `story.js`), compiled scenes, and preview tools.
- Moved experimental exploration and prototype scripts into `research/`, keeping `scripts/` dedicated to production builders and packagers.
- Fixed button shift jump in input proceed dialogs during form submissions.

### Removed
- Retired legacy uncompressed `Nanami` character assets and intermediate PSD extraction test artifacts.
- Removed unused and dummy asset files across the repository, keeping the manifest minimal and production-focused.

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
