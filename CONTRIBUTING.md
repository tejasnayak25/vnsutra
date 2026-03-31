# Contributing to VN-Sutra

Thank you for your interest in contributing to VN-Sutra! This file explains the recommended workflow, code style, testing and PR checklist to make contributions smooth.

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/vnsutra.git
   cd vnsutra
   ```
3. Install dependencies:
   ```bash
   npm ci
   ```
4. Create a feature branch (use clear branch names):
   ```bash
   git checkout -b feat/short-description
   ```

## Recommended NPM scripts

Use these convenience scripts (defined in `package.json`) during development:

- `npm run dev` — start the development server and CSS watcher together
- `npm run dev:server` — start the Node.js/Express dev server
- `npm run dev:css` — start Tailwind/CSS watcher
- `npm run build` — produce a production build
- `npm test` — run tests once
- `npm run test:watch` — run tests in watch mode
- `npm run test:coverage` — generate coverage report
- `npm run lint` — run ESLint
- `npm run lint:fix` — auto-fix lintable issues
- `npm run format` — run Prettier

Run the dev server (Windows/Unix-compatible):
```bash
npm run dev
```

## Code Style and Formatting

We use ESLint and Prettier to keep the codebase consistent. Follow these conventions:

- Indentation: 4 spaces
- Strings: double quotes
- Semicolons: required
- Use modern ES6+ features when appropriate

Before opening a PR, run:
```bash
npm run format
npm run lint
```

If linting fails, try:
```bash
npm run lint:fix
```

## Tests and CI

- Add tests for all new features and bug fixes.
- Unit/integration tests live under `tests/`.
- We aim for a minimum of 80% coverage for new features; CI enforces project-wide rules.

Run tests and coverage locally:
```bash
npm test
npm run test:coverage
```

Writing tests — example structure:
```javascript
describe("Feature X", () => {
    it("should do something", () => {
        // arrange
        const input = ...;

        // act
        const result = ...;

        // assert
        expect(result).toBe(...);
    });
});
```

## JSDoc and Documentation

Document public functions with JSDoc. Include parameter types and return values for clarity.

Example:
```javascript
/**
 * Display a character dialog
 * @param {Character} speaker - The character speaking
 * @param {string} text - The dialog text
 * @param {boolean} [wait=true] - Wait for user input
 * @returns {Promise<void>}
 */
function dialog(speaker, text, wait = true) {
    // ...
}
```

## Security & Performance Guidelines

- Never use `innerHTML` with untrusted input — prefer `textContent` or proper escaping.
- Validate file paths to prevent directory traversal.
- Check request origins and follow CSRF best practices for APIs.
- Prefer async file/IO operations to avoid blocking the event loop.
- Lazy-load large assets and minimize bundle sizes.

## Commit messages

Use conventional, short, descriptive commit messages. Examples:

```
feat: Add auto-save functionality
fix: Resolve storage error handling issue
docs: Update API documentation
test: Add tests for path validation
refactor: Simplify dialog system
```

## Pull Request Checklist

Before opening a PR, ensure the following:

- [ ] Branch name is descriptive (e.g., `feat/save-system`).
- [ ] All new code is covered by tests.
- [ ] `npm run lint` passes and `npm run format` has been applied.
- [ ] CI passes (tests + lint + build) on your branch.
- [ ] Include a clear PR description and link related issues (use `closes #123`).
- [ ] Provide screenshots or short recordings for UI changes.
- [ ] Update `IMPROVEMENTS.md` if the change affects roadmap/incidents.

Suggested PR description template:

```
Summary: Short description of change

Motivation: Why this change is needed

Changes: Bullet list of key changes

Tests: What tests were added/updated

Closes: #issue-number
```

## Creating Issues

- Provide a clear title and steps to reproduce.
- Include environment details (browser, Node version) and screenshots when applicable.

## Setting Up Environment Variables

Create your `.env` from the example and fill required values. On Unix/macOS:
```bash
cp .env.example .env
```
On Windows (PowerShell/CMD):
```powershell
copy .env.example .env
```

## Key Files and Locations

- `api/index.js` — Express server and API routes
- `vnsutra_modules/` — Core engine modules
- `game/` — Game configuration, story, scenes
- `css/` — Tailwind CSS input/output
- `tests/` — Test suites

## Code of Conduct & License

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Include a `LICENSE` file at the repo root (MIT or your chosen license).

## Need Help?

- See [IMPROVEMENTS.md](IMPROVEMENTS.md) for planned work.
- Read the API reference: [docs/API.md](docs/API.md).
- Open an issue for bugs or questions.

---

**Thank you for contributing to VN-Sutra!** 🎮
