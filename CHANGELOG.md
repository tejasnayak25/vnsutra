# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- ESLint and Prettier configuration for code quality
- Jest testing framework with initial test suite
- Environment variable support via dotenv
- CONTRIBUTING.md for contributor guidelines
- API documentation
- Improved package.json metadata
- Save payload utilities for consistent save/autosave serialization
- Scene transition utilities for load-event and scene-start dedupe signatures
- Abort lifecycle utilities for one-shot, idempotent abort handler management
- Fullscreen utilities for shared fullscreen detection and restore behavior
- Regression test suites for save, transition, abort, and fullscreen utility contracts

### Changed
- Replaced synchronous file operations with async (fs.promises)
- Updated development scripts with concurrently
- Enhanced error handling in API routes
- Improved configuration management
- Refactored game flow scene start paths to use shared guarded start logic
- Refactored prompt flows (dialog/input/choice) to centralized abort cleanup patterns
- Refactored autosave shaping to use shared save builders and payload projection

### Fixed
- Fixed remaining fs.existsSync() calls to use async alternatives
- Enhanced zip file cleanup documentation
- Fixed autosave/manual-save list contamination during save management operations
- Fixed overlapping quick-load and duplicate load-game event handling under rapid input
- Fixed stale input/choice/dialog abort handlers and listener cleanup edge cases

---

## [2.0.0] - March 29, 2026

### Added
- Comprehensive error handling in `/folder` endpoint
- Path traversal vulnerability protection with multi-layer validation
- Automatic zip file cleanup (TTL + size-based)
- Storage error handling with graceful fallback
- XSS protection via HTML escaping
- DevTools blocking made optional via configuration

### Security
- **CRITICAL**: Fixed path traversal vulnerability in file path construction
- **HIGH**: Implemented comprehensive API error handling
- **HIGH**: Added storage error handling with IndexedDB fallback
- **HIGH**: Added XSS protection with HTML entity escaping
- **MEDIUM**: Made DevTools blocking optional and configuration-driven

### Performance
- Implemented asynchronous file operations for better server throughput
- Added automatic cleanup of temporary zip files

### Changed
- DevTools blocking is now opt-in via configuration
- Error messages no longer expose internal server details
- File operations now use async/await pattern

---

## [1.0.3] - Earlier releases

See git history for previous changes.

---

## Versioning

This project follows Semantic Versioning:
- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible new functionality
- **PATCH** version for backwards-compatible bug fixes

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

---
