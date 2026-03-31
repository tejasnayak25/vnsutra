# VN-Sutra 2.0.0 — Release Notes

**Release Date:** 2026-03-29

**Summary**
- **Focus:** Reliability, save/load consistency, safe scene transitions, and developer experience improvements.
- **Scope:** Runtime hardening, abort/prompt lifecycle guarantees, autosave/save integrity, and targeted test expansions.

**Validation**
- **Lint:** `npm run lint` — clean (no errors or warnings) after targeted fixes.
- **Tests:** `npm test` — all tests passing (18 suites, 84 tests).
- **Coverage:** `npm run test:coverage` — overall statements ≈ 20.72% (local run).

**Key Improvements**
- **Scene flow:** Guarded scene starts, duplicate-load suppression, and safer transition orchestration.
- **Save/Autosave:** Shared save utilities, immutable snapshots, and separation of autosave/manual-save flows.
- **Abort & Prompt lifecycle:** Centralized one-shot abort helpers and deterministic cleanup for prompts and listeners.
- **Fullscreen & UI helpers:** Shared fullscreen restore helpers and accessibility improvements.
- **Developer experience:** Updated contributor guide and lint/test automation; reduced noisy lint findings.

**Files Added / Expanded**
- `vnsutra_modules/save-utils.js`
- `vnsutra_modules/scene-transition-utils.js`
- `vnsutra_modules/abort-utils.js`
- `vnsutra_modules/fullscreen-utils.js`
- `tests/scene-transition-utils.test.js`
- `tests/abort-utils.test.js`
- `tests/fullscreen-utils.test.js`

**Files Updated (notable)**
- [vnsutra_modules/init.js](vnsutra_modules/init.js)
- [vnsutra_modules/settings.js](vnsutra_modules/settings.js)
- [vnsutra_modules/chapters.js](vnsutra_modules/chapters.js)
- [vnsutra_modules/chapters-page.js](vnsutra_modules/chapters-page.js)
- [scripts/story-build.js](scripts/story-build.js)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [IMPROVEMENTS.md](IMPROVEMENTS.md)
- [RELEASE_NOTES_DRAFT.md](RELEASE_NOTES_DRAFT.md)

**Developer / Release Notes**
- Run the project's validation locally before tagging: `npm run lint && npm test && npm run test:coverage`.
- Consider increasing coverage targeting core runtime helpers and UI modules before public release.

**Notes**
- This release finalizes the draft and records the local validation baseline. For public release, update release notes with changelog highlights appropriate for end users and set the release tag.
