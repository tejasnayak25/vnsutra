# VN-Sutra Improvement Roadmap

**Last Updated:** March 29, 2026  
> **Version:** 2.0.0  
> **Purpose:** Comprehensive guide for enhancing VN-Sutra SDK

---

## 🎯 Progress Tracker

### Progress summary
**50+ items completed** across security, performance, code quality, documentation, developer experience, accessibility, monitoring, and CI/CD. See [COMPLETED.md](COMPLETED.md) for the full per-session breakdown and validation commands.

### In progress
- None

### Next up
- **3.4** TypeScript migration (40+ hours, optional)

---

## Table of Contents

📄 **Completed sections:** See [COMPLETED.md](COMPLETED.md) for finished work

1. [Critical Security Issues](#1-critical-security-issues) - ✅ Complete
2. [Performance Optimizations](#2-performance-optimizations) - ✅ Complete
3. [Code Quality](#3-code-quality) - ✅ 75% complete (3.4 TypeScript optional)
4. [Documentation](#4-documentation) - ✅ Complete
5. [Dependency Management](#5-dependency-management) - ✅ Complete
6. [Configuration](#6-configuration) - ✅ Complete
7. [Feature Additions](#7-feature-additions) - ✅ Complete
8. [Developer Experience](#8-developer-experience) - ✅ Complete
9. [Service Worker](#9-service-worker) - ✅ Complete
10. [Mobile Optimization](#10-mobile-optimization) - ✅ Complete
11. [Accessibility](#11-accessibility) - ✅ Complete
12. [Code Structure](#12-code-structure) - ✅ Complete
13. [Monitoring & Analytics](#13-monitoring--analytics) - ✅ Complete
14. [CI/CD Pipeline](#14-cicd-pipeline) - ✅ Complete
15. [Stability & Bug Audit](#15-stability--bug-audit) - ✅ Complete
16. [Code Quality Audit - February 2026](#16-code-quality-audit---february-2026) - ✅ Complete
17. [Upgrade Tracking - March 2026](#17-upgrade-tracking---march-2026) - ✅ Complete (6 sessions shipped)

---

## 17. Upgrade Tracking - March 2026

### Tracking Workflow

- **Use `IMPROVEMENTS.md` for active and upcoming work** (status, priority, and acceptance criteria).
- **Use `COMPLETED.md` for shipped sessions** (what changed, validation commands, impact).
- **Update both files in every upgrade/fix session** to keep planning and execution synchronized.

### 17.1 Coverage & Test Harness Alignment

**Status:** ✅ Completed (March 8, 2026)  
**Priority:** 🔴 High

**Issue:** `npm run test:coverage` currently reports `0%` across runtime files because current tests execute source via string-eval patterns instead of import-based module instrumentation.

**Upgrade Plan:**
- Migrate utility tests to native import-based patterns compatible with current ESM setup.
- Preserve existing assertions while enabling accurate Istanbul coverage instrumentation.
- Keep tests deterministic (`--runInBand`) for runtime-flow helpers.

**Validation Results:**
- Tests and lint pass locally (`npm test -- --runInBand`, `npm run lint`).
- Coverage reporting now measures runtime helpers; notable gains in `save-utils`, `abort-utils`, `fullscreen-utils`, `scene-transition-utils`, and `playback-settings-utils`.

**Outcome:**
- Utility tests were migrated away from string-eval to import-based patterns and now report accurate Istanbul/V8 coverage.
### 7.x Feature additions (summary)

All 7.x feature work is implemented or planned — concise summaries below. See [COMPLETED.md](COMPLETED.md#-completed-issues) for full details and code references.

- Auto-save: background save loop implemented and resilient to errors (autosave persistence).
- Playback controls: skip/auto-play with persisted settings and dialog integration (global `window.playback`).
- i18n: 4-language support, key-based translations, interpolation, and fallback.
- Achievements: definition, tracking, unlock notifications, and persistence.
- Dynamic sprites: state-based sprite mapping, preloading and smooth transitions.
- Story script hooks: extensibility surface (`actionHandlers`, `beforeScene`, `afterScene`, `getScene`, etc.) and integration tests.
- Writer tooling: planned DSL/Markdown parser (future work).

All items include tests and CI validation; refer to `COMPLETED.md` for per-item validation commands and coverage statistics.

### 6.1 Improve Vercel Configuration

**File:** `vercel.json`

**Current Configuration:**
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

**Problem:** Routes everything to API, even static files

**Improved Configuration:**
```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "src": "/(css|assets|game|vnsutra_modules)/(.*)", "dest": "/$1/$2" },
    { "src": "/service-worker.js", "dest": "/service-worker.js" },
    { "src": "/", "dest": "/api/index.js" },
    { "src": "/(.*)", "dest": "/api/index.js" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

**Estimated Time:** 30 minutes  
**Impact:** Low

---

## 7. Feature Additions

### 🟢 Priority: LOW (Future Enhancements)

### 7.1 Auto-Save System

**Status:** ✅ Completed (February 20, 2026)

**File:** Create `vnsutra_modules/autosave.js`

```javascript
class AutoSave {
    constructor(interval = 30000) { // 30 seconds
        this.interval = interval;
        this.timer = null;
    }

    start() {
        this.stop();
        this.timer = setInterval(() => {
            this.save();
        }, this.interval);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async save() {
        try {
            const gameState = {
                scene: activeScene,
                state: state,
                timestamp: Date.now()
            };
            await storage.setItem('__autosave__', JSON.stringify(gameState));
            console.log('Auto-saved');
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }
}
```

**Estimated Time:** 2 hours  
**Impact:** Medium

---

### 7.2 Skip/Auto-Play Controls

**Status:** ✅ Completed (February 20, 2026)

**Files Created:**
1. `vnsutra_modules/playback-controls.js` - Core playback controls module (220 lines)

**Files Modified:**
1. `vnsutra_modules/game-utils.js` - Enhanced dialog() and input() functions with playback support
2. `api/home.html` - Added playback-controls.js script loading

**Implementation Details:**
- **PlaybackControls class** with skip and auto-play modes
- **Skip mode:** Instantly advances dialogs, auto-submits inputs with placeholder values
- **Auto-play mode:** Configurable delay (1000-10000ms, default 3000ms) between dialog advances
- **localStorage persistence:** All settings (skip, auto-play, delay) saved across sessions
- **Global instance:** `window.playback` for browser access
- **Integration:** dialog() checks `playback.shouldSkip()` and `playback.isAutoPlayActive()`; input() auto-submits in skip mode

**Test Results:** ✅ All 5 tests passing

---

### 7.3 Localization/i18n Support

**Status:** ✅ Completed (February 20, 2026)

**Files Created:**
1. `vnsutra_modules/i18n.js` - Core i18n module
2. `locales/en.json`, `ja.json`, `es.json`, `fr.json` - Translation files
3. Updated `vnsutra_modules/game-utils.js` - Enhanced dialog/input/choice functions
4. Updated `vnsutra_modules/init.js` - Initialize i18n on app startup
5. Updated `vnsutra_modules/settings.js` - Language selector UI in settings

**Implementation Highlights:**
- @-prefix system for translation keys (e.g., `@scene1.hello`)
- Supports plain English alongside translation keys
- Parameter interpolation: `@key` with `{name: "Alice"}` → "Hello, {{name}}!"
- Auto-fallback to English for missing translations
- Language persistence in localStorage
- 4-language support: English, 日本語, Español, Français

**Usage Example:**
```javascript
// In story.js - mix and match
await dialog(mary, "@scene1.hello");  // Translates
await dialog(mary, "Some plain text with periods.");  // Plain
await dialog(mary, "@scene1.goodbye", { name: playerName });  // With params
```

**Features:**
- Multi-language support across all dialogue
- JSON-based translation files (easy to expand)
- Parameter interpolation
- Seamless language switching
- No performance impact

**Validation:** ✅ All 5 tests passing  
**Impact:** High (enables international audience)  
**Estimated Time:** ~4 hours  
**Status:** Production Ready

---

### 7.4 Achievement System

**Status:** ✅ Completed (February 20, 2026)

**File:** `vnsutra_modules/achievements.js`

**Features Implemented:**
- Achievement definition and tracking (`define`, `defineMany`, `increment`, `unlock`)
- Unlock notifications via in-game toast messages
- Persistent storage via localStorage
- Progress reporting via `getProgressReport()`
- Event-driven progression from gameplay interactions (`vnsutra:dialog`, `vnsutra:input`, `vnsutra:choice`)

**Integration:**
- `api/home.html` - Added script loading for achievements module
- `vnsutra_modules/init.js` - Registered default achievement definitions
- `game/story.js` - Added chapter completion achievement trigger

**Estimated Time:** 4 hours  
**Impact:** Medium

---

### 7.5 Dynamic Character Sprites

**Status:** ✅ Completed (February 20, 2026)

**File:** `vnsutra_modules/dynamic-sprites.js`

**Features Implemented:**
- State-based sprite mapping (state → outfit + mood)
- Runtime sprite switching with smooth mood transitions
- Outfit preloading to reduce transition lag
- Per-character sprite controller (`window.DynamicSprites`)

**Integration:**
- `api/home.html` - Added dynamic-sprites module loading
- `game/assets.js` - Added Mary sprite state definitions and preloading
- `game/story.js` - Updated story flow to use dynamic sprite states

**Estimated Time:** 3 hours  
**Impact:** Medium

---

### 7.6 Story Script Extensibility Hooks

**Status:** ✅ Completed (March 19, 2026)  
**Priority:** 🟢 Low

**Why This Matters:**
- Keeps the declarative story runner extensible without forking core gameplay modules.
- Gives custom games a stable hook surface for content, diagnostics, and live ops.

**Use Cases:**
- `actionHandlers`: add custom actions like camera zoom, HUD changes, minigames, or game-specific logic.
- `onUnknownAction`: log unknown action names, support compatibility shims, or fail gracefully on typos.
- `getScene`: load remote scenes, episodic DLC, or CMS-driven content at runtime.
- `beforeScene` / `afterScene`: run guards, analytics, achievement hooks, setup, or cleanup around scene execution.
- `context`: pass feature flags, story metadata, player profile data, or debug state into the runner.
- `getActor` / `getAsset`: resolve content from alternate registries, lazy-load assets, or substitute test doubles.
- `story.setScene` / `story.extendScenes` / `story.invalidateScene` / `story.listScenes`: hot-swap scenes for live patches, mods, or tooling.

**Recommended Rollout Order:**
1. Lock `actionHandlers` and `onUnknownAction` behavior first so custom actions are safe to introduce.
2. Add `getScene` coverage for remote or delayed scene loading.
3. Add `beforeScene` / `afterScene` hooks for lifecycle work and observability.
4. Standardize `context` usage for story-specific data and feature flags.
5. Document scene override helpers for runtime patching and tooling.

**Acceptance Criteria:**
- A custom action can be added without editing the core runner switch statement.
- Unknown actions are reported in a controlled way and do not crash the story.
- Remote scenes can be resolved, cached, overridden, and invalidated predictably.
- Scene lifecycle hooks run exactly once per scene execution path.
- The extension surface is documented with examples that match the shipped implementation.

**Implementation Note:**
- These hooks already exist in `vnsutra_modules/story-script-runner.js`; this roadmap note keeps the extension surface visible and stable for future work.

**Validation Results:**
- ✅ Added declarative `loading.start` / `loading.stop` story actions.
- ✅ Added integration coverage for `actionHandlers`, `onUnknownAction`, `beforeScene`, `afterScene`, `getScene`, `setScene`, `invalidateScene`, `listScenes`, `getActor`, and `getAsset`.
- ✅ `npm test -- --runInBand tests/story-script-runner.integration.test.js` passes.
- ✅ `npm run lint` remains clean for the touched files.

---

### 7.7 Tooling for Writers (Writer DSL / Markdown Parser)

**Status:** ⚪ Planned (Future Enhancement)

**Objective:**
Provide a simplified text-based DSL (Domain Specific Language) for scene writers, similar to Ren'Py scripts or simply Markdown.

**Features Planned:**
- A build-time parser that converts plain text scripts (e.g., `.vn` or `.md` files) into the declarative JSON action format.
- Greatly lowers the barrier to entry for non-programmers to write stories by avoiding bracket-heavy JSON/JS structures.

**Estimated Time:** 12+ hours  
**Impact:** High (DX for Writers)

---

## 8. Developer Experience

### ✅ COMPLETED (3/3 implemented)

### 8. Developer experience (summary)

Developer experience improvements include a unified `npm run dev` workflow (server + CSS watcher), a WebSocket-based hot-reload utility (`dev-server.js`), and a tested production build pipeline (`scripts/build.js`). These changes are validated in CI and documented in `COMPLETED.md` with commands to reproduce build and dev flows.


## 9. Service Worker

### 🟢 Priority: LOW

### 9.1 Improve Caching Strategy

**Status:** ✅ Completed (February 20, 2026)

**Current Issue (Resolved):** Service worker previously cached all requests with a single strategy and no size limits.

**Implemented Multi-tier Caching Strategy:**
- **Precache:** Essential assets on install (`/`, `/index.html`, config/manifest/core CSS)
- **Network-first:** API and dynamic endpoints (`/api`, `/folder`)
- **Cache-first:** Static media assets (`/assets/*`, images, fonts, audio)
- **Stale-while-revalidate:** Scripts and styles
- **Cache limits:** Runtime cache entry cap and stale entry cleanup

**Files Updated:**
- `service-worker.js` - Complete strategy rewrite
- `api/home.html` - Service worker registration enabled

**Estimated Time:** 2 hours  
**Impact:** Medium

---

## 10. Mobile Optimization

### 🟢 Priority: LOW

### ✅ COMPLETED (1/1 implemented)

### 10.1 Touch Gesture Support

**Status:** ✅ Completed (February 20, 2026)

**File Created:** `vnsutra_modules/gestures.js`

**Features Implemented:**
- Swipe detection (left, right, up, down)
- Configurable gesture handlers (`on`, `off`, `clearHandlers`)
- Touch event optimization with passive listeners and axis thresholds
- Global gesture event dispatch (`vnsutra:gesture`)

**Integration:**
- `api/home.html` - gestures module loaded
- `vnsutra_modules/init.js` - gestures bound to stage container and default handlers attached

**Estimated Time:** 3 hours  
**Impact:** Medium

---

## 11. Accessibility

### 🟢 Priority: MEDIUM

### ✅ COMPLETED (3/3 implemented)

### 11.1 Add ARIA Support

**Status:** ✅ Completed (February 20, 2026)

**Files Updated:**
- `api/home.html`
- `vnsutra_modules/alert-window.js`
- `vnsutra_modules/init.js`

**Implemented:**
- Added ARIA semantics to core dialog/loading/app containers (`role`, `aria-live`, `aria-modal`, `aria-hidden`)
- Added dialog labeling (`aria-label`, `aria-labelledby`) and focus fallback on modal open
- Added runtime ARIA initialization for key interactive regions

**Estimated Time:** 2 hours  
**Impact:** High (Accessibility)

---

### 11.2 Keyboard Navigation

**Status:** ✅ Completed (February 20, 2026)

**File Created:** `vnsutra_modules/keyboard.js`

**Shortcuts:**
- Enter/Space: Advance dialog
- Escape: Open/close menu  
- H: Show history
- Ctrl+S: Quick save
- Ctrl+L: Quick load
- Ctrl+F: Toggle fullscreen

**Integration:**
- `api/home.html` - keyboard module script loaded
- `vnsutra_modules/init.js` - keyboard controls bound at startup
- `vnsutra_modules/gameui.js` - exposed keyboard action handlers (menu/history/save/load)
- `vnsutra_modules/game-utils.js` - spacebar support for dialog progression

**Estimated Time:** 3 hours  
**Impact:** High (Accessibility)

---

### 11.3 High Contrast Mode

**Status:** ✅ Completed (February 20, 2026)

**File Created:** `vnsutra_modules/accessibility.js`

**Features Implemented:**
- High contrast toggle
- Font size scaling controls
- Reduce motion option
- Persistent settings in localStorage

**Integration:**
- `api/home.html` - accessibility module loaded
- `vnsutra_modules/settings.js` - added high contrast/reduce motion/font scale controls
- `vnsutra_modules/ui/utils.js` - motion-sensitive animations now respect reduce-motion setting
- `vnsutra_modules/init.js` - startup synchronization of accessibility settings

**Estimated Time:** 4 hours  
**Impact:** High (Accessibility)

---

## 12. Code Structure

### 🟢 Priority: LOW

### ✅ COMPLETED (1/1 implemented)

### 12.1 Split Large Files

**Status:** ✅ Completed (February 20, 2026)

**Example:** `asset-utils.js` (1166 lines)

**Split into:**
- `vnsutra_modules/assets/background.js`
- `vnsutra_modules/assets/character.js`
- `vnsutra_modules/assets/outfit.js`
- `vnsutra_modules/assets/music.js`
- `vnsutra_modules/assets/sfx.js`
- `vnsutra_modules/assets/index.js` (barrel export)

**Implemented:**
- Added modular asset files under `vnsutra_modules/assets/`
- Split background, outfit, character/image, music, and sfx logic into dedicated modules
- Added `vnsutra_modules/assets/index.js` barrel export for cleaner imports
- Converted `vnsutra_modules/asset-utils.js` into a compatibility re-export layer
- Updated `game/assets.js` to consume the new modular barrel

**Estimated Time:** 4 hours  
**Impact:** Medium (Maintainability)

---

## 13. Monitoring & Analytics

### 🟢 Priority: LOW

### ✅ COMPLETED (2/2 implemented)

### 13.1 Performance Monitoring

**Status:** ✅ Completed (February 20, 2026)

**Create:** `vnsutra_modules/performance.js`

**Files Updated:**
1. `vnsutra_modules/performance.js` - New monitoring module
2. `vnsutra_modules/init.js` - Runtime configuration wiring
3. `api/home.html` - Script loading
4. `game/config.json` - Monitoring configuration options

**Metrics:**
- Load time
- Frame rate (FPS)
- Memory usage
- Operation timing

**Implementation Highlights:**
- Added `PerformanceMonitoring` class with global instance `window.performanceMonitor`
- Added FPS sampling via `requestAnimationFrame` loop
- Added memory usage sampling via `performance.memory` (when supported)
- Added operation timing APIs: `startOperation`, `endOperation`, and `measure`
- Added bounded metric persistence in localStorage with configurable entry limits
- Added runtime config support via `monitoring.performance` in `game/config.json`

**Estimated Time:** 2 hours  
**Impact:** Low

---

### 13.2 Error Tracking

**Status:** ✅ Completed (February 20, 2026)

**Create:** `vnsutra_modules/error-tracking.js`

**Features Implemented:**
- Automatic capture for `window.error` and `unhandledrejection`
- Local error log storage with max-entry trimming
- Console warnings with structured error payloads
- Optional server-side reporting via configurable endpoint
- Runtime config integration via `game/config.json` and startup wiring

**Estimated Time:** 2 hours  
**Impact:** Medium

---

## 14. CI/CD Pipeline

### 🟢 Priority: LOW

### ✅ COMPLETED (2/2 implemented)

### 14.1 GitHub Actions Workflow

**Status:** ✅ Completed (February 20, 2026)

**File Created:** `.github/workflows/ci.yml`

**Features Implemented:**
- Runs tests on push/PR
- Runs lint checks
- Generates coverage reports
- Tests on multiple Node versions (18.x, 20.x)
- Uploads coverage artifacts per Node version

**Estimated Time:** 2 hours  
**Impact:** Medium

---

### 14.2 Pre-commit Hooks

**Status:** ✅ Completed (February 20, 2026)

**Setup:** Husky + lint-staged

**Implemented:**
- Added `.husky/pre-commit` hook to run `lint-staged`
- Added staged JS pipeline: ESLint fix, Prettier format, and Jest related tests (`--findRelatedTests`)
- Added staged JSON/MD formatting via Prettier
- Blocks commit on lint/test failures

**Estimated Time:** 30 minutes  
**Impact:** Medium

---

## 15. Stability & Bug Audit

### ✅ COMPLETED (Session 15)

### ✅ Session 15 - Stabilization Fixes Implemented

**High Severity (Fixed):**
1. **Playback module loading mismatch**
  - Updated `vnsutra_modules/playback-controls.js` to classic-script compatible global export
  - Result: playback module loads reliably in browser script context

2. **Auto-play strict-mode incompatibility and timer behavior**
  - Removed `arguments.callee` usage in `vnsutra_modules/game-utils.js`
  - Added deterministic timer cleanup and `isWaitingForInput` reset on manual/auto resolve
  - Result: no strict-mode exception path and no unintended double-advance

3. **Font loading initialization hang risk**
  - Hardened `vnsutra_modules/utils.js` `loadFonts()` to always resolve (including empty/failed loads)
  - Result: startup flow no longer stalls on font load failures

**Medium Severity (Fixed):**
4. **Wake Lock startup behavior gap**
  - Updated `vnsutra_modules/init.js` to request wake lock at startup with guarded re-acquire and error handling
  - Result: expected wake-lock behavior on startup/visibility/fullscreen transitions

5. **Production CSS minification reliability**
  - Updated `scripts/build.js` to use `npm run build:css` minification path
  - Added missing Tailwind CLI dependency (`@tailwindcss/cli`) in `package.json`
  - Result: production build minifies CSS without fallback failure

**Validation:**
- ✅ `npm run build` passes
- ✅ `npm test` passes (5/5)

**Status:** Completed and validated

---

## 16. Code Quality Audit - February 2026

### Comprehensive Audit Summary

**🔴 Status:** Critical Issues Identified - IN PROGRESS
**📊 Audit Date:** February 21, 2026  
**✅ Tests:** All 6 tests passing  
**🔧 Linter:** 842 problems remaining (356 auto-fixed, 30% reduction achieved)
  - From: 1198 problems (1083 errors, 115 warnings)
  - Current: 842 problems (658 errors, 184 warnings)
**📈 Issue Categories:** 14 identified (3 critical, 3 high, 5 medium, 3 low)  
**📦 ES Modules:** 5 core converted; 6 consumer modules remain for full impact

### Critical Issues (Must Fix)
1. **16.1** Global Variable Dependencies - ✅ COMPLETED
2. **16.2** Missing Error Handling - Promise chains incomplete [✅ COMPLETED]
3. **16.3** XSS Vulnerability - innerHTML without escaping [✅ COMPLETED]
4. **16.4** Keyboard Listener Cleanup - unbind() method missing [✅ COMPLETED in last session]
5. **16.5** Touch Gesture Cleanup - detach() not called properly [✅ COMPLETED in last session]

---

### 16.1 Global Variable Dependencies Missing (Updated)

**Severity:** 🔴 CRITICAL  
**Status:** ✅ COMPLETED (February 22, 2026)  
**Impact:** Runtime `ReferenceError` risk reduced with explicit guards and fallbacks

**Completion Notes:**
- Added Konva availability guards and fallback/stub behavior in stage, UI utilities, actionbar, settings, loadgame, and game UI modules.
- Added init-time DOM/config guards to prevent startup failures when required elements are missing.
- Earlier fixes ensured autosave, achievements, and accessibility no longer rely on undeclared globals.

**Time Spent:** 8+ hours  
**Priority:** 🔴 High

---

#### 16.2 Storage Race Condition

**Severity:** 🔴 CRITICAL  
**Status:** ✅ COMPLETED (February 21, 2026)  
**File:** `vnsutra_modules/autosave.js`

**Problem:**
- `dataStore` may be `undefined` when `save()` is called
- `waitForStorage()` has 5s timeout but no error handling if storage never initializes
- Could result in silent data loss

**Current Code:**
```javascript
async save() {
    try {
        const storageReady = await this.waitForStorage();
        if (!storageReady || activeLayer !== "game" || !activeScene) {
            return; // Silent failure - no user feedback
        }
        await dataStore.setItem(this.key, JSON.stringify(gameState));
    } catch (error) {
        console.error("Auto-save failed:", error);
    }
}
```

**Recommended Fix:**
```javascript
async save() {
    try {
        const storageReady = await this.waitForStorage();
        if (!storageReady) {
            throw new Error('Storage not available after 5s timeout');
        }
        if (activeLayer !== "game" || !activeScene) {
            console.debug('[AutoSave] Skipping - not in game');
            return;
        }
        // ... rest of save logic
    } catch (error) {
        console.error("Auto-save failed:", error);
        // Notify user via UI toast/alert
        window.dispatchEvent(new CustomEvent('vnsutra:autosave-failed', { 
            detail: { error: error.message } 
        }));
    }
}
```

**Estimated Time:** 2 hours  
**Priority:** 🔴 High

---

#### 16. Quality & maintainability — summary

This project had an extensive quality push covering lint fixes, dead-code removal, async anti-pattern remediation, storage unification, input validation, and JSDoc coverage. Key outcomes:

- ESLint: all reported issues fixed and `npm run lint` now passes.
- Dead code and unused variables removed to reduce bundle size and cognitive load.
- Async executor anti-patterns were replaced with safe `async` functions returning explicit Promises.
- Storage access standardized to async `dataStore` with safe fallbacks to `localStorage`.
- Input validation added for critical APIs (autosave intervals, achievement increments).
- Centralized constants module added for storage keys and event names.
- JSDoc coverage improved across core modules for better IDE support.

See `COMPLETED.md` for per-issue details, commands to reproduce validations, and before/after statistics.
- Added class/method JSDoc coverage to `vnsutra_modules/accessibility.js`
- Re-verified with `npm run lint` and `npm test`

---

#### 16.12 Inconsistent Error Handling

**Severity:** 🟢 LOW  
**Status:** ✅ Completed (February 22, 2026)  
**Files:** Multiple modules

**Completion Notes:**
- Standardized error handling on `errorTracking.captureError()` with contextual metadata.
- Updated init, autosave, achievements, accessibility, performance, playback, i18n, UI utilities, assets pipeline, storage utilities, and game runtime modules.

---

#### 16.13 ES Module Conversion Opportunities

**Severity:** 🟠 MEDIUM  
**Status:** ✅ COMPLETED (February 22, 2026)  
**Completed:** 5 core modules + 6 consumer modules converted with explicit dependencies  
**Remaining:** 0 consumer modules pending  
**Impact Achieved:** explicit import chains in all targeted consumer modules + lint remains clean  
**Remaining Impact:** none for this conversion batch

**Analysis Date:** February 21, 2026  
**Completion Date:** February 22, 2026 (Core + consumer modules)

**Final Consumer Modules Converted (February 22, 2026):**
- `vnsutra_modules/settings.js`
- `vnsutra_modules/loadgame.js`
- `vnsutra_modules/ui/actionbar.js`
- `vnsutra_modules/home.js`
- `vnsutra_modules/game.js`
- `vnsutra_modules/gameui.js`

---

### ✅ Completed Conversions:

**🟢 Core Modules (Providers):**

1. **`vnsutra_modules/stage.js`** ✅ **COMPLETED**
   - Converted to ES module with exports
   - Exports: `konvaStage`, `tr_layer`
   - Maintains backward compatibility via `window.*`
   - Added JSDoc documentation header

2. **`vnsutra_modules/ui/utils.js`** ✅ **COMPLETED**
   - Converted to ES module with 14 exports
   - Functions: `escapeHtml`, `escapeAttribute`, `loadImg`, `deepEqual`, `openBar`, `isBarOpen`, `closeBar`, `animateBtn`, `animateMenu`, `getMonth`, `getRadioOptions`
   - Classes: `Switch`, `HTMLNode`, `ChoiceMenu`
   - Maintains backward compatibility via `window.*`

3. **`vnsutra_modules/keyboard.js`** ✅ **COMPLETED**
   - Converted to ES module with singleton pattern
   - Exports: `keyboardControls`, `KeyboardControls`
   - Maintains backward compatibility via `window.keyboardControls`

4. **`vnsutra_modules/playback-controls.js`** ✅ **COMPLETED**
   - Converted to ES module with singleton pattern
   - Exports: `playback`, `PlaybackControls`
   - Maintains backward compatibility via `window.playback`

5. **`vnsutra_modules/init.js`** ✅ **UPDATED**
   - Added ES module imports for stage and ui/utils
   - Now explicitly imports dependencies instead of relying on globals

6. **`api/home.html`** ✅ **UPDATED**
   - Updated 4 script tags to `type="module"`
   - Maintains proper load order

---

### 📋 Consumer Module Conversion Results:

**Impact:** Consumer module dependency paths are now explicit and module loading is less order-dependent.

**Recommended Modules for Conversion:**
   - **Current Issue:** Creates global `konvaStage` and `tr_layer` accessed throughout codebase
   - **Lint Impact:** ~200 no-undef errors across multiple modules
   - **Benefits:** 
     - Explicit imports instead of undefined globals
     - Controlled initialization timing
     - Can initialize stage after DOM ready
   - **Conversion Pattern:**
     ```javascript
     // Convert from:
     const konvaStage = new Konva.Stage({...});
     
     // To:
     import Konva from './konva.js';
### 📋 Remaining Work (Consumer Modules):

**Impact:** Converting these would eliminate ~300 additional no-undef errors

1. **`vnsutra_modules/settings.js`** - Settings UI builder
   - **Uses:** `Switch`, `openBar`, `animateBtn`, `konvaStage`, `Konva`
   - **Lint Impact:** ~80 no-undef errors
   - **Conversion:** Add imports for stage and ui/utils, convert to module
   
2. **`vnsutra_modules/loadgame.js`** - Load game UI
   - **Uses:** `animateBtn`, `getMonth`, `dataStore`, `Konva`
   - **Lint Impact:** ~40 no-undef errors
   - **Conversion:** Add imports for ui/utils and storage
   
3. **`vnsutra_modules/ui/actionbar.js`** - Action bar UI
   - **Uses:** `openBar`, `closeBar`, `animateBtn`, `konvaStage`, `Konva`
   - **Lint Impact:** ~60 no-undef errors
   - **Conversion:** Add imports for stage and ui/utils

4. **`vnsutra_modules/home.js`** - Home screen
   - **Uses:** `konvaStage`, `Konva`
   - **Lint Impact:** ~40 no-undef errors
   - **Conversion:** Add imports for stage

5. **`vnsutra_modules/game.js`** - Main game logic
   - **Uses:** `konvaStage`, `Konva`
   - **Lint Impact:** ~50 no-undef errors
   - **Conversion:** Add imports for stage (complex, large file)

6. **`vnsutra_modules/gameui.js`** - Game UI management
   - **Uses:** `konvaStage`, `Konva`
   - **Lint Impact:** ~30 no-undef errors
   - **Conversion:** Add imports for stage

**Total Potential Impact:** Delivered in this batch as explicit side-effect imports for Konva-dependent consumers.

**Estimated Time:** 6-8 hours
- Simple conversions (home.js, gameui.js): 1 hour each
- Medium complexity (loadgame.js, settings.js, actionbar.js): 1.5 hours each
- Complex (game.js): 2 hours

**Priority:** 🟠 Medium (Completed)

---

### ❌ Modules That Should NOT Convert:

- **`vnsutra_modules/init.js`** ✅ Already updated with imports (keeps entry point role)
- **`vnsutra_modules/global.js`** - Intentionally provides globals for backward compatibility
- **Third-party libraries** - konva.js, jszip.min.js (already UMD/external)

---

### Impact Summary

**What Was Achieved:**
- ✅ 5 core modules converted to ES modules
- ✅ Established singleton export pattern for stateful modules
- ✅ Established named exports pattern for utilities
- ✅ Backward compatibility maintained via `window.*` exposure
- ✅ Foundation laid for future module conversions
- ✅ 4 lint problems fixed (819 from 823)
- ✅ 0 breaking changes, all tests passing

**Remaining Opportunity:**
- 📋 Continue with dead code pruning and constants extraction
- 📋 Continue with API documentation and error-handling normalization

**Architecture Benefits Achieved:**
- ✅ Explicit dependency management in init.js
- ✅ Clear module boundaries with export contracts
- ✅ Better IDE support (autocomplete, go-to-definition)
- ✅ Easier testing (can mock imports)
- ✅ Enables tree-shaking for production builds
- ✅ Gradual migration path demonstrated

---

### Patterns Established

**Singleton Pattern (for stateful modules):**
```javascript
class ModuleClass { /* ... */ }
const instance = new ModuleClass();

// Backward compatibility
if (typeof window !== "undefined") {
    window.instance = instance;
}

// ES module exports
export { instance, ModuleClass };
export default instance;
```

**Named Exports Pattern (for utilities):**
```javascript
function utilityFn() { /* ... */ }
class UtilityClass { /* ... */ }

// Multiple exports
export { utilityFn, anotherFn, UtilityClass };

// Backward compatibility
if (typeof window !== "undefined") {
    window.utilityFn = utilityFn;
    window.UtilityClass = UtilityClass;
}
```

**Import Pattern (for consumers):**
```javascript
// At top of file
import { konvaStage } from './stage.js';
import { animateBtn, openBar } from './ui/utils.js';

// Use normally in code
konvaStage.width(100);
animateBtn(button, () => console.log('done'));
```

**Estimated Time:** 2 hours completed (core modules) + 6-8 hours remaining (consumer modules) = 8-10 hours total  
**Priority:** 🟠 Medium (High architectural value, moderate effort)

---

### ✅ Positive Findings

**What's Working Well:**
- ✅ All 6 tests passing (security, API, localization)
- ✅ Security headers validated, path traversal blocked
- ✅ Service worker handles updates gracefully
- ✅ Achievement system is well-structured with proper encapsulation
- ✅ Error tracking module has good configuration API
- ✅ Performance monitoring is opt-in and configurable
- ✅ Accessibility features properly implemented
- ✅ Build pipeline generates production-ready output

---

---

## Phase-Based Action Plan (From Comprehensive Audit)

### 🔴 Phase 1: Critical Fixes (Immediate - DO BEFORE RELEASE)
**Estimated: 12-17 hours | Must complete for stability**

1. **16.1 - Fix Global Variable Dependencies** (8-12 hours)
    - Add existence checks for remaining modules
    - Prevent ReferenceError crashes from undefined globals
    - ✅ COMPLETED

2. **16.2 - Storage Race Conditions** (2 hours) ✅ COMPLETED
   - Error handling for storage initialization failures
   
3. **16.3 - Configuration Race Condition** (2 hours) ✅ COMPLETED
   - Wait for config before theme initialization
   
4. **16.7 - Event Handler Error Boundaries** (30 minutes) ✅ COMPLETED
   - Wrap achievement event listeners in try-catch

### 🟠 Phase 2: Quality Improvements (Short-term - 3-5 days)
**Estimated: 20-26 hours | Recommended for next sprint**

5. **16.13 - ES Module Consumer Conversions** (6-8 hours) ✅ COMPLETED
    - Converted all planned consumer modules to explicit dependency imports
    - Established clearer dependency management for Konva consumers
   
6. **16.4 - Fix Remaining ESLint Violations** (4-6 hours) ✅ COMPLETED
    - `npm run lint` now passes with 0 issues
    - no-undef and syntax-level cleanup completed
   
7. **16.5 - Remove Dead Code & Unused Variables** (4-6 hours) ✅ COMPLETED
    - Removed stale generated lint/test artifacts and added ignore rules
    - Reduced repository maintenance churn
   
8. **16.6 - Fix Async Promise Executor Anti-pattern** (1 hour) ✅ COMPLETED
    - Refactored storage-utils.js promise patterns
   
9. **16.8 - Standardize Storage Strategy** (2 hours) ✅ COMPLETED
    - Achievements persistence now uses async storage with local fallback
   
10. **16.9 - Add Input Validation** (3 hours) ✅ COMPLETED
    - Added parameter bounds checking and type validation in target modules

### 🟡 Phase 3: Polish & Documentation (Optional - 1-2 weeks)
**Estimated: 55-59 hours | Nice to have, improves maintainability**

11. **16.10 - Create Constants Module** (4 hours) ✅ COMPLETED
    - Extracted repeated storage/event keys into centralized constants
    
12. **16.11 - Add JSDoc Types** (8-12 hours)
    - Document all public APIs
    - Improve IDE autocomplete
    - ✅ COMPLETED
    
13. **16.12 - Standardize Error Handling** (3 hours)
    - Integrate error-tracking everywhere
    - Consistent logging strategy
    - ✅ COMPLETED
    
14. **3.4 - TypeScript Migration** (40+ hours)
    - Full type safety and better tooling

### Summary Statistics
- **Total Critical Issues:** 5 (5 fixed ✅, 0 remaining)
- **Total High Priority Issues:** 3 (3 fixed ✅, 0 remaining)
- **Total Medium Priority Issues:** 5+ (3 fixed ✅, remaining prioritized)
- **Audit Coverage:** 14 categories analyzed
- **Automation Opportunity:** ~509 issues auto-fixable via `npm run lint:fix`
- **Remaining Manual Work:** ~333 issues require refactoring

---

## Recommended Next Steps

1. **START HERE:** Re-evaluate optional `3.4` TypeScript migration scope
2. **THEN:** Review any remaining polish items from the audit backlog

---

## Notes

- **Completed Work:** See [COMPLETED.md](COMPLETED.md) for detailed documentation
- **Backward Compatibility:** Current changes maintain compatibility
- **Performance:** All async operations improve server responsiveness
- **Testing:** Initial test structure is ready for expansion
- **Security:** All critical vulnerabilities are fixed

---

**Last Updated:** February 22, 2026 (Session 28 - 16.1 Global Dependency Guards Complete) ✅
**Document Version:** 3.3  
**Maintainer:** Tejas Nayak  
**Issues Completed:** 39 + Audit + Phase 1 Fixes = 81% complete  
**Session 16A (Audit):** Identified 14 issue categories and created 3-phase roadmap  
**Session 16B (Phase 1 Fixes):** ✅ COMPLETED - 974 issues fixed, 81% lint reduction
**Audit Findings:** 14 categories (3 critical, 3 high, 5 medium, 3 low)  
**Current Status:** **0 lint problems remaining (100% reduction: 1198 → 0)**  
- Errors: 1083 → 0 (100% reduction) ✅
- Warnings: 115 → 0 (100% reduction) ✅
- no-undef: 151 → 0 (100% eliminated) ✅
**Tests:** ✅ All 6 passing  
**Security:** ✅ All critical vulnerabilities fixed  
**Next:** Optional `3.4` TypeScript migration scope review  
