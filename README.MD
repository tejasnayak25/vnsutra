# VN-Sutra

<p align="center">
  <b>Modular Visual Novel SDK for the Web</b><br>
  <i>Build beautiful, interactive visual novels with JavaScript and Node.js</i>
</p>

---

## ✨ Features

- **Modular JavaScript SDK** for game logic, UI, storage, and asset management ([`vnsutra_modules/`](./vnsutra_modules))
- **Customizable UI** with [Konva.js](https://konvajs.org/)
- **Asset management** for images, music, fonts, and game assets
- **Save/load system** for game state
- **Cross-platform**: works in modern browsers, supports mobile and desktop
- **Node.js (Express) server** for asset delivery and packaging
- **Tailwind CSS** for rapid UI styling
- **Vercel-ready** with middleware and deployment config

---

## 📁 Project Structure

```text
api/                # Node.js (Express) server
assets/             # Game assets: images, music, fonts, backgrounds, characters
css/                # Tailwind CSS input and output
game/               # Game configuration, manifest, and story scripts
vnsutra_modules/    # Core SDK modules (game logic, UI, storage, etc.)
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
import { Background, Character, Music, IMG, Sfx } from "../vnsutra_modules/asset-utils.js";
let futon_room = new Background("backgrounds/Noraneko_Background_Pack_1/Futon_Room.png");
let mary = new Character({ name: "Mary", folder: "characters/Rin", scale: 1.5 });
let music = new Music("../assets/music/bgm.mp3");
let logo = new IMG({ src: "../assets/images/logo.png", scale: 0.5 });
let clickSound = new Sfx("../assets/sfx/click.mp3");
export { futon_room, mary, music, logo, clickSound };
```

### Writing the Story ([`game/story.js`](./game/story.js))

```js
import { futon_room, mary, music } from "./assets.js";
import { dialog, next, input, choice, storage, end, wait, loading } from "../vnsutra_modules/game-utils.js";

export const story = {
  start: async function () {
    game.background = futon_room;
    await dialog(mary, "Hello! Welcome to my story.");
    let name = await input("What's your name?", "Player");
    storage.setItem("name", name);
    await dialog(mary, `Nice to meet you, ${name}!`);
    let answer = await choice("Do you like visual novels?", ["Yes", "No"]);
    if(answer === "Yes") {
      await dialog(mary, "That's great!");
    } else {
      await dialog(mary, "Give it a try, you might like it!");
    }
    end();
  }
};
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
- `end()` — End the story or scene
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
<summary><b>Utilities</b></summary>

- `load(path)` — Fetch a file (Promise)
- `loadJSON(path)` — Fetch and parse a JSON file
- `loadFonts(fonts, root)` — Load custom fonts
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

## 📸 Screenshots

<div align="center" style="overflow-x:auto; white-space:nowrap;">
  <img src="./assets/screenshots/screenshot1.png" width="200" style="display:inline-block; margin-right:8px;"/>
  <img src="./assets/screenshots/screenshot2.png" width="200" style="display:inline-block; margin-right:8px;"/>
  <img src="./assets/screenshots/screenshot3.png" width="200" style="display:inline-block; margin-right:8px;"/>
  <img src="./assets/screenshots/screenshot4.png" width="200" style="display:inline-block;"/>
</div>

---

## 📄 License

ISC

