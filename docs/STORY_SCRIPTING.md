# VN-Sutra Story Scripting Reference

This guide documents the **declarative story format** powered by `createStoryFromScript` in `vnsutra_modules/story-script-runner.js`.

---

<details class="toc">
<summary><strong>Contents</strong> — click to expand</summary>

<ul>
	<li><a href="#quick-start">⚡ Quick Start</a></li>
	<li><a href="#core-concepts">🧭 Core Concepts</a></li>
	<li><a href="#runtime-object-for-function-scenes-run-custom-handlers">🔧 Runtime Object</a></li>
	<li><a href="#dialogue--player-input">💬 Dialogue &amp; Player Input</a></li>
	<li><a href="#createStoryFromScript-options">⚙️ createStoryFromScript Options</a></li>
	<li><a href="#examples">🔎 Examples</a></li>
</ul>

</details>

## Quick Start

```js
import { createStoryFromScript } from "../vnsutra_modules/story-script-runner.js";
import { futon_room, mary } from "./assets.js";

const scenes = {
	start: [
		{ type: "background", asset: "futon_room", reset: true },
		{ type: "dialog", actor: "mary", text: "@scene1.hello" },
		{ type: "input", var: "name", message: "@scene1.namePrompt", trim: true },
		{ type: "storage.set", key: "name", value: { fromVar: "name" } },
		{ type: "jump", scene: "scene2" }
	],
	scene2: [
		{ type: "dialog", actor: "mary", text: "@scene2.goodbye" },
		{ type: "end" }
	]
};

export const story = createStoryFromScript({
	scenes,
	actors: { mary },
	assets: { futon_room }
});
```

## Examples

Quick, runnable examples demonstrating common patterns.

1) Simple dialog, input, and save

```js
const scenes = {
	start: [
		{ type: 'dialog', actor: 'mary', text: 'Hello there!' },
		{ type: 'input', var: 'playerName', message: 'What is your name?', trim: true },
		{ type: 'storage.set', key: 'playerName', value: { fromVar: 'playerName' } },
		{ type: 'dialog', text: 'Nice to meet you, {{playerName}}!' },
		{ type: 'end' }
	]
};
```

2) Choice with branching

```js
const scenes = {
	start: [
		{ type: 'dialog', text: 'Which path will you take?' },
		{ type: 'choice', var: 'route', options: ['Left', 'Right'] },
		{ type: 'if', test: { left: { fromVar: 'route' }, op: '===', right: 'Left' }, then: [{ type: 'jump', scene: 'leftPath' }], else: [{ type: 'jump', scene: 'rightPath' }] }
	],
	leftPath: [ { type: 'dialog', text: 'You went left.' }, { type: 'end' } ],
	rightPath: [ { type: 'dialog', text: 'You went right.' }, { type: 'end' } ]
};
```

3) Background, music and actor actions

```js
const scenes = {
	intro: [
		{ type: 'background', asset: 'park_day' },
		{ type: 'music.play', track: 'theme_intro', loop: true, fadeIn: 300 },
		{ type: 'actor.show', actor: 'mary' },
		{ type: 'actor.to', actor: 'mary', props: { x: 0.2 }, duration: 800 },
		{ type: 'dialog', actor: 'mary', text: '@intro.welcome' }
	]
};
```

Cheatsheet — common actions

| Action | Short example | Notes |
|---|---|---|
| `dialog` | `{ type: 'dialog', actor: 'mary', text: 'Hi' }` | Waits by default; `wait:false` to continue |
| `input` | `{ type: 'input', var: 'name', message: 'Your name?' }` | Stores into `runtime.vars.name` |
| `choice` | `{ type: 'choice', var: 'pick', options: ['A','B'] }` | Use `optionsI18nKey` to load from locales |
| `jump` | `{ type: 'jump', scene: 'scene2' }` | Immediate scene change |
| `storage.set` | `{ type: 'storage.set', key: 'k', value: { fromVar: 'name' } }` | Persists to IndexedDB/localStorage |
| `run` | `{ type: 'run', run: async (rt)=>{ /* custom */ } }` | Escape hatch for custom logic |

---

## Core Concepts

### Scene definitions

Each scene can be:

- An **array of action objects** (declarative format), or
- A **function** `(runtime) => { ... }` (advanced/custom behavior)

### Runtime variables (`runtime.vars`)

- Variables are written by actions like `input`, `choice`, and `var.*`.
- By default, vars are scene-local per run.
- Set `sharedVars: true` in `createStoryFromScript` to persist vars across scenes.

### Variable references

Use `{ fromVar: "varName" }` where an action accepts dynamic values:

```js
{ type: "storage.set", key: "player-name", value: { fromVar: "name" } }
```

### Responsive values

Some actions resolve values by device state:

```js
{ portrait: 0.1, android: 0.2, default: 0.15 }
```

Resolution order:

1. `portrait` (if portrait mode)
2. `android` (if Android)
3. `default`
4. raw object value (if no key matched)

### i18n behavior

- `dialog.text`, `input.message`, `input.placeholder`, and `choice.message` support translation keys like `"@scene1.hello"`.
- `choice.optionsI18nKey` can load options from translations (must resolve to an array).

---

## `createStoryFromScript` Options

```js
createStoryFromScript({
	scenes,
	actors,
	assets,
	achievements,
	getGame,
	getIsPortrait,
	getIsAndroid,
	getScene,
	getActor,
	getAsset,
	actionHandlers,
	context,
	beforeScene,
	afterScene,
	sharedVars,
	onUnknownAction,
	onLog
});
```

Key options:

- `scenes`: object map or resolver function.
- `getScene(sceneName, context)`: fallback loader for remote/dynamic scenes.
- `actors` / `getActor`: actor source.
- `assets` / `getAsset`: asset source.
- `actionHandlers`: custom action type handlers.
- `beforeScene(sceneName, runtime)`: return `false` to stop scene execution.
- `afterScene(sceneName, runtime, result)`: post-scene hook.
- `sharedVars`: when `true`, shares `runtime.vars` across scene runs.
- `onUnknownAction(action, runtime)`: receives unsupported action types.
- `onLog(message, data, action, runtime)`: receives `log` action output.

---

## Runtime Object (for function scenes, `run`, custom handlers)

Runtime contains:

- `vars`
- `scenes`
- `story`
- `getActor(name)`
- `getAsset(name)`
- `achievements`
- `getGame()`
- `isPortrait`
- `isAndroid`
- `actionHandlers`
- `onUnknownAction`
- `onLog`
- `context`

---

### 1) Dialogue & Player Input

#### `dialog`

```js
{ type: "dialog", actor: "mary", text: "@scene1.hello", wait: true, params: { name: { fromVar: "name" } } }
```

- `actor` optional (if omitted or unresolved, narrator-style behavior)
- `wait` defaults to `true`
- `params` interpolates translation placeholders

#### `input`

```js
{ type: "input", var: "name", message: "@scene1.namePrompt", placeholder: "@scene1.defaultName", trim: true }
```

- Stores result in `runtime.vars[var]`
- `trim: true` applies `String.prototype.trim()`

#### `choice`

```js
{
	type: "choice",
	var: "answer",
	message: "Pick one",
	options: ["A", "B"],
	optionsI18nKey: "scene1.answerOptions",
	optionsVar: "availableOptions",
	firstOptionVar: "firstOption"
}
```

- Uses `optionsI18nKey` array when available
- Stores selected value in `runtime.vars[var]`

---

### 2) Variables (`var.*`)

#### `var.set`

```js
{ type: "var.set", var: "score", value: 10 }
{ type: "var.set", var: "lastName", value: { fromVar: "name" } }
```

#### `var.delete`

```js
{ type: "var.delete", var: "temp" }
```

#### `var.increment` / `var.decrement`

```js
{ type: "var.increment", var: "score", amount: 2 }
{ type: "var.decrement", var: "score", amount: 1 }
```

- Default amount: `1`
- Missing current value defaults to `0`

#### `var.push` / `var.pop` / `var.splice`

```js
{ type: "var.push", var: "inventory", value: "key" }
{ type: "var.pop", var: "inventory", result: "removedItem" }
{ type: "var.splice", var: "inventory", start: 0, deleteCount: 1, items: ["map"] }
```

---

### 3) Storage (`storage.*`)

#### `storage.set`

```js
{ type: "storage.set", key: "playerName", value: { fromVar: "name" } }
```

#### `storage.get`

```js
{ type: "storage.get", key: "playerName", var: "name" }
```

#### `storage.remove`

```js
{ type: "storage.remove", key: "playerName" }
```

---

### 4) Flow Control

#### `if`

```js
{
	type: "if",
	test: { left: { fromVar: "score" }, op: ">=", right: 10 },
	then: [{ type: "dialog", text: "You win" }],
	else: [{ type: "dialog", text: "Keep trying" }]
}
```

Supported operators:

- `===`, `!==`, `>`, `>=`, `<`, `<=`, `in`, `not-in`

#### `switch`

```js
{
	type: "switch",
	value: { fromVar: "route" },
	cases: [
		{ value: "A", actions: [{ type: "jump", scene: "routeA" }] },
		{ value: "B", actions: [{ type: "jump", scene: "routeB" }] }
	],
	default: [{ type: "jump", scene: "fallback" }]
}
```

#### `repeat`

```js
{ type: "repeat", count: 3, var: "i", actions: [{ type: "log", message: { fromVar: "i" } }] }
```

#### `wait`

```js
{ type: "wait", duration: 250 }
```

- Duration is in **milliseconds**

#### `parallel`

```js
{
	type: "parallel",
	sequences: [
		[{ type: "effect.screen-shake", intensity: 3, duration: 180 }],
		[{ type: "wait", duration: 100 }, { type: "actor.call", actor: "mary", method: "slideIn", args: [0.5, 0.2] }]
	]
}
```

---

### 5) Scene Navigation

#### `jump`

```js
{ type: "jump", scene: "scene2" }
```

#### `end`

```js
{ type: "end" }
```

#### `scene.transition`

```js
{ type: "scene.transition", transitionType: "fade", duration: 250, color: "#000000" }
```

---

### 6) Actor Actions

#### `actor.show` / `actor.hide`

```js
{ type: "actor.show", actor: "mary" }
{ type: "actor.hide", actor: "mary" }
```

#### `actor.reset`

```js
{ type: "actor.reset", actor: "mary", fields: ["scale", "x", "y"] }
```

#### `actor.set`

```js
{
	type: "actor.set",
	actor: "mary",
	props: {
		x: -0.25,
		y: { portrait: 0.1, android: 0.2, default: 0.1 }
	}
}
```

#### `actor.prop`

```js
{ type: "actor.prop", actor: "mary", prop: "grayscale", value: true }
```

#### `actor.call`

```js
{ type: "actor.call", actor: "mary", method: "slideIn", args: [0.5, 1] }
```

#### `actor.to` / `actor.tween`

```js
{ type: "actor.to", actor: "mary", props: { x: 0.5 }, duration: 800, easing: "linear", options: {} }
```

#### `actor.fade`

```js
{ type: "actor.fade", actor: "mary", direction: "in", duration: 400 }
```

#### `actor.move`

```js
{ type: "actor.move", actor: "mary", x: 0.4, y: 0.1, duration: 800 }
```

#### `actor.shake`

```js
{ type: "actor.shake", actor: "mary", intensity: 5, duration: 300 }
```

#### `sprite.apply`

```js
{
	type: "sprite.apply",
	actor: "mary",
	sprite: "casualSmile",
	options: { duration: 0 },
	fallback: { outfit: "Casual", mood: "Rin_Casual_Smile" }
}
```

---

### 7) Background Actions

#### `background`

```js
{ type: "background", asset: "futon_room", reset: true }
```

#### `background.prop`

```js
{ type: "background.prop", prop: "grayscale", value: true }
```

#### `background.to` / `background.tween`

```js
{ type: "background.to", props: { brightness: 0.2 }, duration: 700, easing: "linear", options: {} }
```

---

### 8) Effects & Audio

#### Effects

```js
{ type: "effect.screen-shake", intensity: 4, duration: 200 }
{ type: "effect.flash", color: "#ffffff", duration: 120 }
{ type: "effect.particles", x: 0.5, y: 0.5, particleType: "spark", options: { count: 20 } }
```

#### Loading

```js
{ type: "loading.start" }
{ type: "loading.stop" }
```

- Use these to show or hide the game's loading indicator from a declarative scene.

#### Music / SFX

```js
{ type: "music.play", track: "bgm-main", fadeIn: 300, loop: true, volume: 0.8 }
{ type: "music.fade", volume: 0.2, duration: 1200 }
{ type: "music.stop", fadeOut: 500 }
{ type: "sfx.play", track: "click", volume: 1 }
```

---

### 9) Logging, Events, Achievements

#### `log`

```js
{ type: "log", message: "Entered scene", data: { fromVar: "route" } }
```

Calls `onLog(message, data, action, runtime)` when provided.

#### `emit`

```js
{ type: "emit", event: "vnsutra:custom", data: { fromVar: "name" } }
```

Dispatches `CustomEvent` on `globalThis`.

#### `achievement`

```js
{ type: "achievement", id: "story.chapter-complete", amount: 1 }
```

---

### 10) Escape Hatch: `run`

Use `run` for custom code when declarative actions are not enough:

```js
{
	type: "run",
	run: async (runtime) => {
		const score = runtime.vars.score ?? 0;
		if (score > 10) {
			return "victory"; // auto-jump to scene if it exists
		}
	}
}
```

`run` may return:

- `{ jumped: true }` or `{ ended: true }`
- A scene name string (auto-jump)
- Nothing / other values (continue scene)

---

## Custom Action Types

Register custom action handlers in `createStoryFromScript`:

```js
const story = createStoryFromScript({
	scenes,
	actionHandlers: {
		"camera.zoom": async (action, runtime) => {
			const game = runtime.getGame();
			await game?.camera?.zoomTo?.(action.value ?? 1);
		}
	},
	onUnknownAction(action) {
		console.warn("Unknown action type:", action?.type);
	}
});
```

---

## Remote / Dynamic Scenes

You can keep local scenes and resolve missing scenes remotely with `getScene`:

```js
const story = createStoryFromScript({
	scenes: localScenes,
	getScene: async (sceneName) => {
		const response = await fetch(`/scenes/${sceneName}.json`);
		if (!response.ok) return null;
		return response.json();
	}
});
```

The story object also supports runtime scene management:

- `story.setScene(sceneName, definition)`
- `story.extendScenes(sceneMap)`
- `story.invalidateScene(sceneName)`
- `story.listScenes()`

---

## Migration Guide (Function Scenes → Declarative Scenes)

### Old function style

```js
async function start() {
	await dialog(mary, "Hello");
	const name = await input("Name?");
	await storage.setItem("name", name);
	next(scene2);
}
```

### Declarative style

```js
const start = [
	{ type: "dialog", actor: "mary", text: "Hello" },
	{ type: "input", var: "name", message: "Name?" },
	{ type: "storage.set", key: "name", value: { fromVar: "name" } },
	{ type: "jump", scene: "scene2" }
];
```

Recommended migration steps:

1. Convert straightforward flow (`dialog`, `input`, `choice`, `jump`) first.
2. Replace ad-hoc state with `var.*` actions and `{ fromVar }` references.
3. Move complex custom JS into `run` actions temporarily.
4. Later replace repeated `run` logic with custom `actionHandlers`.
5. Enable `sharedVars: true` only if cross-scene var persistence is required.

---

## Troubleshooting

- **Nothing happens for an action:** verify exact `type` string (`storage.set`, not `storage-set`).
- **`jump` does nothing:** target scene is missing/unresolved.
- **Choice options not translated:** ensure `optionsI18nKey` resolves to an array.
- **Unexpected wait length:** `wait.duration` is in milliseconds.
- **Unknown action types:** implement `actionHandlers` or `onUnknownAction`.

---

## Related Docs

- `README.MD` (project overview)
- `docs/API.md` (backend API)
- `game/story.js` and `game/scenes/*.scene.js` (real project examples)
