# VN-Sutra Walkthrough

Welcome to the VN-Sutra walkthrough! This guide will help you get started, understand the core concepts, and master advanced features of the framework.

## Table of Contents
<details class="toc">
<summary><strong>Contents</strong> — click to expand</summary>

<ul>
  <li><a href="#introduction">🏁 Introduction</a></li>
  <li><a href="#getting-started">⚡ Getting Started</a></li>
  <li><a href="#project-structure">📁 Project Structure</a></li>
  <li>
    <a href="#core-concepts">🧭 Core Concepts</a>
    <ul>
      <li><a href="#scenes--chapters">Scenes &amp; Chapters</a></li>
      <li><a href="#assets--resources">Assets &amp; Resources</a></li>
      <li><a href="#ui-layout--customization">UI Layout &amp; Customization</a></li>
      <li><a href="#saveload-system">Save/Load System</a></li>
      <li><a href="#localization">Localization</a></li>
    </ul>
  </li>
  <li><a href="#examples">🔎 Examples</a></li>
  <li>
    <a href="#advanced-topics">🚀 Advanced Topics</a>
    <ul>
      <li><a href="#scripting--story-logic">Scripting &amp; Story Logic</a></li>
      <li><a href="#custom-modules">Custom Modules</a></li>
      <li><a href="#testing--validation">Testing &amp; Validation</a></li>
      <li><a href="#performance--debugging">Performance &amp; Debugging</a></li>
    </ul>
  </li>
  <li><a href="#developer-tools">🛠️ Developer Tools</a></li>
  <li><a href="#faq--troubleshooting">❓ FAQ &amp; Troubleshooting</a></li>
  <li><a href="#contributing">🤝 Contributing</a></li>
</ul>

<p style="margin-top:0.6rem;color:#6b7280;font-size:0.95rem">Tip: click any item to jump to that section. Use <kbd>Ctrl+F</kbd> to search.</p>

</details>

---

## Introduction
VN-Sutra is a modular visual novel SDK for the web, designed for flexibility, extensibility, and ease of use. Whether you're building a simple story or a complex interactive experience, this guide will walk you through every step.

## Getting Started

### Installation

VN-Sutra requires Node.js (v16+) and npm (v8+). To set up your project:

```sh
npm install
```

### Running the Dev Server

Start the development server and Tailwind CSS watcher:

```sh
npm start
npm run tailwindcss
```

Visit `http://localhost:10000` in your browser to view your project.

### First Project Walkthrough

- Place your assets (images, music, etc.) in the `assets/` directory.
- Edit story scripts in `game/story/` or `game/story.js`.
- Customize UI layouts in the `ui/` folder and run `npm run ui:build`.
- Use the dev server for hot reload and rapid iteration.

---

## Project Structure

A typical VN-Sutra project is organized as follows:

```text
api/                # Node.js (Express) server and developer helpers
assets/             # Game assets: images, music, fonts, backgrounds, characters
css/                # Tailwind CSS input and output
game/               # Game configuration, manifest, and story scripts
vnsutra_modules/    # Core SDK modules (game logic, UI, storage, etc.)
ui/                 # UI layouts and build inputs
locales/            # Translation JSON files
tests/              # Jest test suites
package.json        # Node.js dependencies and scripts
```

Refer to the repository root for additional files like `middleware.js`, `vercel.json`, and `.github` configuration.

---

## Core Concepts

### Scenes & Chapters

Scenes are declared as ordered action lists. Chapters group scenes and track progression. Simple example with a small choice:

```js
const scenes = {
  start: [
    { type: 'background', asset: 'futon_room', reset: true },
    { type: 'dialog', actor: 'mary', text: '@scene1.welcome' },
    { type: 'choice', var: 'path', choices: [
      { label: '@choice.left', next: 'leftPath' },
      { label: '@choice.right', next: 'rightPath' }
    ] }
  ],
  leftPath: [ { type: 'dialog', actor: 'mary', text: '@left.good' }, { type: 'end' } ],
  rightPath: [ { type: 'dialog', actor: 'mary', text: '@right.bad' }, { type: 'end' } ]
};
```

### Assets & Resources

Organize images, sprites, music and sfx under `assets/`. The asset loader supports multiple resolutions and lazy loading. Example import:

```js
import { Background } from '../vnsutra_modules/assets/index.js';
const bg = new Background('backgrounds/futon_room.png');
```

### UI Layout & Customization

UI layouts are authored in XML-like files inside `ui/`. Run `npm run ui:build` to compile them into runtime JSON. To tweak styles, edit `css/input.css` and rebuild Tailwind.

### Save/Load System

Persistent saves use IndexedDB with localStorage fallback. Use declarative storage actions in scenes (`storage.set`, `storage.get`). For quick manual saves, the runtime exposes `save()` and `load()` helpers on the global game object.

### Localization

Translation keys live in `locales/` as JSON. Use keys like `@scene1.greeting` in scripts. Add new locale files and the UI will expose a language selector if configured.

---

## Examples

Quick examples to get you started.

- Show an image and play music:

```js
[{ type: 'background', asset: 'park_day' }, { type: 'music', asset: 'theme_intro', loop: true }]
```

- Display inline code sample in dialog (translation key points to "Use `save()` to persist")

- Programmatic scene (function scene):

```js
function dynamicScene(state) {
  if (state.flags.metForTheFirstTime) {
    return [{ type: 'dialog', actor: 'npc', text: 'Welcome back' }];
  }
  return [{ type: 'dialog', actor: 'npc', text: 'Hello stranger' }];
}
```

---

## Advanced Topics

### Scripting & Story Logic

Use the declarative format for most content; switch to function scenes for dynamic behavior. See STORY_SCRIPTING.md for a complete action reference.

### Custom Modules

Create modules in `vnsutra_modules/` and import them where needed. Keep module APIs small and testable.

### Testing & Validation

Write Jest tests in `tests/` and run `npm test`. Tests in this repo demonstrate scene execution, i18n, and save/load behavior.

### Performance & Debugging

Enable verbose logging during development and use browser devtools to profile long-running tasks. The performance module exposes timing hooks to instrument heavy operations.

---

## Developer Tools

### Dev Server Usage

- Start the dev server: `npm start`
- Rebuild CSS: `npm run build:css` or `npm run tailwindcss` (watch mode)
- Rebuild UI layouts: `npm run ui:build`

The dev server exposes an index of markdown docs and renders them at `/md/<filename>` for quick documentation previews.

### Markdown Docs as Webpages

Place docs in `docs/`. The dev server route `/md/:file` renders markdown with Tailwind `prose` styling. Link to other docs using relative links to their generated routes (e.g., `/md/API.md`).

---

## FAQ & Troubleshooting

**Q: The dev server won’t start or shows errors.**
- Ensure Node.js and npm are installed and up to date.
- Run `npm install` to ensure all dependencies are present.

**Q: My assets aren’t loading.**
- Verify file paths in scripts and place assets in correct subfolders under `assets/`.

**Q: UI layout changes aren’t showing up.**
- Run `npm run ui:build` after editing files in `ui/` and rebuild CSS if needed.

**Q: How do I add a new language?**
- Add a JSON file in `locales/` and reference translation keys in your scripts.

---

## Contributing

We welcome contributions! To get started:

- Fork the repository and create a new branch.
- Follow the code style and linting rules (`npm run lint`).
- Add or update tests (`npm test`).
- Submit a pull request with a clear description.

See CONTRIBUTING.md for guidelines and branch policies.

---

Thank you for using VN-Sutra! For advanced reference, see API.md, STORY_SCRIPTING.md, and UI_LAYOUT_WORKFLOW.md.
