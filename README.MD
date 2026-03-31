<p align="center">
  <b>Modular Visual Novel SDK for the Web</b><br>
  <i>Build beautiful, interactive visual novels with JavaScript and Node.js</i>
</p>

---

## ✨ Features

- **Modular JavaScript SDK** for game logic, UI, storage, and asset management ([`vnsutra_modules/`](./vnsutra_modules))
- **Modern ES module architecture** with singleton and named exports for maintainability and IDE support
- **Customizable UI** with [Konva.js](https://konvajs.org/)
- **Modular asset system**: backgrounds, characters, outfits, music, SFX ([`vnsutra_modules/assets/`](./vnsutra_modules/assets))
- **Save/load system** for game state (IndexedDB, localStorage fallback)
- **Accessibility features**: high contrast mode, font scaling, reduce motion ([`vnsutra_modules/accessibility.js`](./vnsutra_modules/accessibility.js))
- **Performance monitoring**: FPS, memory, operation timing ([`vnsutra_modules/performance.js`](./vnsutra_modules/performance.js))
- **Cross-platform**: works in modern browsers, supports mobile and desktop
- **Node.js (Express) server** for asset delivery and packaging
- **Tailwind CSS** for rapid UI styling
- **Vercel-ready** with middleware and deployment config
- **Centralized error handling** and JSDoc documentation for core APIs

---

## 📁 Project Structure

```text
api/                # Node.js (Express) server
assets/             # Game assets: images, music, fonts, backgrounds, characters
css/                # Tailwind CSS input and output
game/               # Game configuration, manifest, and story scripts
vnsutra_modules/    # Core SDK modules (game logic, UI, storage, etc.)
  assets/           # Modular asset system (background, character, outfit, music, sfx)
  accessibility.js  # Accessibility features
  performance.js    # Performance monitoring
  constants.js      # Centralized string constants
middleware.js       # Vercel Edge middleware
package.json        # Node.js dependencies and scripts
vercel.json         # Vercel deployment config
```

---

## 🚀 Quick Start

```sh
npm install
npm start
npm run tailwindcss
```

---

## 🛠️ Implementation Overview

### Defining Assets ([`game/assets.js`](./game/assets.js))

```js
import { Background, Character, Music, IMG, Sfx } from "../vnsutra_modules/assets/index.js";
let futon_room = new Background("backgrounds/Noraneko_Background_Pack_1/Futon_Room.png");
let mary = new Character({ name: "Mary", folder: "characters/Rin", scale: 1.5 });
let music = new Music("../assets/music/bgm.mp3");
let logo = new IMG({ src: "../assets/images/logo.png", scale: 0.5 });
let clickSound = new Sfx("../assets/sfx/click.mp3");
export { futon_room, mary, music, logo, clickSound };
```

### Writing the Story ([`game/story.js`](./game/story.js))

You can now write stories using a **declarative action format** (writer-friendly) instead of full async JavaScript control flow.  
See [`docs/STORY_SCRIPTING.md`](./docs/STORY_SCRIPTING.md) for all supported action types.
For planned XML/CSS-driven home/game shell UI compilation, see [`docs/UI_LAYOUT_WORKFLOW.md`](./docs/UI_LAYOUT_WORKFLOW.md).

```js
import { createStoryFromScript } from "../vnsutra_modules/story-script-runner.js";

const scenes = {
  start: [
    { type: "dialog", actor: "mary", text: "@scene1.hello" },
    { type: "input", var: "name", message: "@scene1.namePrompt", trim: true },
    { type: "storage-set", key: "name", value: { fromVar: "name" } },
    { type: "dialog", actor: "mary", text: "@scene1.greeting", params: { name: { fromVar: "name" } } },
    { type: "jump", scene: "scene2" }
  ],
  scene2: [
    { type: "dialog", actor: "mary", text: "@scene2.goodbye" },
    { type: "end" }
  ]
};

export const story = createStoryFromScript({ scenes, actors: { mary }, assets: { futon_room } });
```

---

## 🧩 Core APIs

<details>
<summary><b>Assets</b></summary>

- `Background(path)` — Add a background image
- `Character({ name, folder, scale })` — Add a character and their folder of images
- `Music(path)` — Add background music
- `IMG({ src, scale })` — Add a generic image
- `Sfx(path)` — Add a sound effect
</details>

<details>
<summary><b>Story</b></summary>

- `dialog(character, text)` — Show dialog from a character
- `input(question, default)` — Ask the player for input
- `choice(question, options)` — Present choices to the player
- `next(sceneFunction)` — Move to the next scene
- `wait(seconds)` — Wait before continuing
- `end()` — End the story
- `loading.start()` / `loading.stop()` — Show/hide loading animation
- `storage.setItem(key, value)`, `storage.getItem(key)` — Save/load data
</details>

<details>
<summary><b>Character & Game</b></summary>

- `character.fadeIn(duration)`, `character.fadeOut(duration)` — Fade character in/out
- `character.slideIn(x, duration)`, `character.slideOut(x, duration)` — Slide character in/out
- `character.to({...})` — Animate multiple properties at once
- `character.reset([except])` — Reset character properties
- `game.background = bgObj` — Set the background image
- `game.background.grayscale = true/false` — Grayscale background
</details>

<details>
<summary><b>Utilities & Patterns</b></summary>

- `load(path)` — Fetch a file (Promise)
- `loadJSON(path)` — Fetch and parse a JSON file
- `loadFonts(fonts, root)` — Load custom fonts
- **Singleton pattern** for stateful modules (see IMPROVEMENTS.md)
- **Named exports** for utilities (see IMPROVEMENTS.md)
- **Centralized error handling** via `errorTracking.captureError()`
- **JSDoc documentation** for all public APIs
</details>

---

## 🗂️ Game Folder Files

| File           | Purpose                                                                 |
|----------------|-------------------------------------------------------------------------|
| `assets.js`    | Define and export backgrounds, characters, music, images, sound effects |
| `story.js`     | Write your story logic, scenes, and dialog using the SDK APIs           |
| `config.json`  | Main configuration: title, icons, music, fonts, UI, author, etc.        |
| `manifest.json`| Web app manifest for PWA support and installability                     |

---

## 📸 Screenshots

<div align="center" style="overflow-x:auto; white-space:nowrap;">
  <img src="./assets/screenshots/screenshot1.png" width="200" style="display:inline-block; margin-right:8px;"/>
  <img src="./assets/screenshots/screenshot2.png" width="200" style="display:inline-block; margin-right:8px;"/>
  <img src="./assets/screenshots/screenshot3.png" width="200" style="display:inline-block; margin-right:8px;"/>
  <img src="./assets/screenshots/screenshot4.png" width="200" style="display:inline-block;"/>
</div>

---

## 📄 License

MIT
