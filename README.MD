## VN-Sutra

VN-Sutra is a modular Visual Novel Game SDK for building browser-based visual novels using JavaScript and Node.js. It provides a flexible architecture, asset management, and a customizable UI for rapid game development.

### Features

- Modular JavaScript SDK for game logic, UI, storage, and asset management (`vnsutra_modules/`)
- Customizable UI with [Konva.js](https://konvajs.org/)
- Asset management for images, music, fonts, and game assets
- Save/load system for game state
- Cross-platform: works in modern browsers, supports mobile and desktop
- Node.js (Express) server for asset delivery and packaging
- Tailwind CSS for rapid UI styling
- Vercel-ready with middleware and deployment config

### Project Structure

```
api/                # Node.js (Express) server
assets/             # Game assets: images, music, fonts, backgrounds, characters
css/                # Tailwind CSS input and output
game/               # Game configuration, manifest, and story scripts
vnsutra_modules/    # Core SDK modules (game logic, UI, storage, etc.)
middleware.js       # Vercel Edge middleware
package.json        # Node.js dependencies and scripts
vercel.json         # Vercel deployment config
```

### Getting Started

#### Install Dependencies

```sh
npm install
```

#### Development

- Start the Node.js server:
  ```sh
  npm start
  ```
- Build Tailwind CSS:
  ```sh
  npm run tailwindcss
  ```

### Implementation Overview

#### Defining Assets (`game/assets.js`)

```js
import { Background, Character, Music, IMG, Sfx } from "../vnsutra_modules/asset-utils.js";
let futon_room = new Background("backgrounds/Noraneko_Background_Pack_1/Futon_Room.png");
let mary = new Character({ name: "Mary", folder: "characters/Rin", scale: 1.5 });
let music = new Music("../assets/music/bgm.mp3");
let logo = new IMG({ src: "../assets/images/logo.png", scale: 0.5 });
let clickSound = new Sfx("../assets/sfx/click.mp3");
export { futon_room, mary, music, logo, clickSound };
```

- `Background(path)`: Add a background image
- `Character({ name, folder, scale })`: Add a character and their folder of images
- `Music(path)`: Add background music
- `IMG({ src, scale })`: Add a generic image
- `Sfx(path)`: Add a sound effect

#### Writing the Story (`game/story.js`)

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

- `dialog(character, text)`: Show dialog from a character
- `input(question, default)`: Ask the player for input
- `choice(question, options)`: Present choices to the player
- `next(sceneFunction)`: Move to the next scene
- `wait(seconds)`: Wait before continuing
- `end()`: End the story or scene
- `loading.start()` / `loading.stop()`: Show/hide loading animation
- `storage.setItem(key, value)`, `storage.getItem(key)`: Save/load data

#### More Character & Game APIs

- `character.fadeIn(duration)`, `character.fadeOut(duration)`: Fade character in/out with animation.
- `character.slideIn(x, duration)`, `character.slideOut(x, duration)`: Slide character in/out to a position.
- `character.to({ x, y, scale, opacity, blurRadius, noise, pixelSize, brightness, contrast, hue, saturation, luminance, mood, duration })`: Animate multiple properties at once.
- `character.reset([except])`: Reset character properties to default, except those listed.
- `game.background = bgObj`: Set the background image.
- `game.background.grayscale = true/false`: Toggle grayscale effect on background.

#### Utility Functions

- `load(path)`: Fetch a file (returns a Promise).
- `loadJSON(path)`: Fetch and parse a JSON file.
- `loadFonts(fonts, root)`: Load custom fonts from a config object.

### Game Folder Files

- `assets.js`: Define and export your backgrounds, characters, music, images, and sound effects for use in your story.
- `story.js`: Write your story logic, scenes, and dialog using the SDK APIs.
- `config.json`: Main configuration for your game. Set project name, title, subtitle, icons, background music, author info, fonts, GUI icons, and UI options. This file controls the look and metadata of your VN.
- `manifest.json`: Web app manifest for PWA support. Defines app name, icons, start URL, display mode, and protocol handlers for installability and integration.

---

Add your backgrounds, characters, and music in `assets.js`. Write your story and dialog in `story.js` using the APIs above. Place your images, music, and fonts in the `assets/` folder.

### License

ISC

