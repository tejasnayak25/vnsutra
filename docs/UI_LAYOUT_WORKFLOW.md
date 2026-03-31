# VN-Sutra UI Layout Compiler Workflow

Status: Phase 1 complete for the Home shell (sidebar + main shell via compiled layout + runtime fallback) and ready for game UI migration.

<details class="toc">
<summary><strong>Contents</strong> — click to expand</summary>

<ul>
  <li><a href="#scope">📚 Scope</a></li>
  <li><a href="#goals">🎯 Goals</a></li>
  <li><a href="#proposed-source-and-output-layout">🗂️ Source &amp; Output</a></li>
  <li><a href="#build-workflow">🔨 Build Workflow</a></li>
  <li><a href="#runtime-workflow">▶️ Runtime Workflow</a></li>
  <li><a href="#artifact-schema-example">🧾 Artifact Schema</a></li>
  <li><a href="#incremental-adoption-plan">📈 Adoption Plan</a></li>
</ul>

</details>

## Scope

This workflow applies to:

- `vnsutra_modules/home.js`
- `vnsutra_modules/gameui.js`

This workflow does not apply to:

- `game/story.js`
- `vnsutra_modules/story-script-runner.js`
- Declarative story action content

## Goals

- Author UI in XML + CSS-like files instead of imperative Konva coordinate code.
- Support responsive units (`px`, `%`, `vw`, `vh`) and runtime-safe `calc()` expressions.
- Compile at build time so XML/CSS parsing is not required on every runtime start.
- Map approved CSS properties directly to Konva attributes.
- Keep resize/fullscreen reflow deterministic and fast.

## Non-Goals

- Full browser CSS compatibility.
- A generic DOM engine.
- Runtime evaluation of arbitrary JavaScript from style files.

## Proposed Source and Output Layout

```text
ui/
  home/
    layout.xml
    styles.css
  game/
    overlays.xml
    styles.css

game/.ui-cache/
  home.ui.json
  game-overlays.ui.json
  manifest.json
```

## Build Workflow

Implemented build commands:

- `npm run ui:build` -> one-time compile of all UI XML/CSS
- `npm run ui:watch` -> watch `ui/**` and regenerate changed artifacts
- `npm run build` -> now runs `ui:build` before production packaging

Compiler pipeline per screen:

1. Parse XML into a normalized node tree.
2. Parse CSS and compute selector matches (tag, `.class`, `#id`, simple descendant support).
3. Resolve cascade and specificity into computed style declarations.
4. Validate style properties against a Konva-safe whitelist.
5. Compile numeric expressions (`%`, `vw`, `vh`, `calc`) into expression AST metadata.
6. Emit a render-plan artifact (`*.ui.json`) with:
   - static attrs (direct Konva attrs)
   - dynamic attrs (compiled expressions)
   - node hierarchy
   - event binding keys (string IDs only)
7. Update `manifest.json` with hashes and compiler version for cache invalidation.

## Runtime Workflow

At runtime (`home.js`, `gameui.js`):

1. Load compiled render plan JSON.
2. Create Konva nodes from plan node types:
   - `view` -> `Konva.Group`
   - `rect` -> `Konva.Rect`
   - `text` -> `Konva.Text`
   - `image` -> `Konva.Image`
3. Apply static attrs immediately.
4. Resolve dynamic attrs with current layout context:
   - stage width/height
   - parent content width/height
5. Attach events from a local handler map (by key, not serialized function code).
6. On resize/fullscreen change, re-run dynamic evaluation and patch attrs without reparsing XML/CSS.

## CSS-to-Konva Property Mapping (Initial Set)

- `x`, `left` -> `x`
- `y`, `top` -> `y`
- `width` -> `width`
- `height` -> `height`
- `background-color` -> `fill`
- `border-color` -> `stroke`
- `border-width` -> `strokeWidth`
- `border-radius` -> `cornerRadius`
- `opacity` -> `opacity`
- `font-size` -> `fontSize`
- `font-family` -> `fontFamily`
- `font-weight` -> `fontStyle` mapping (`normal`, `bold`, `italic`, `bold italic`)
- `text-align` -> `align`
- `visible` -> `visible`
- `z-index` -> rendering order within parent

Properties outside the whitelist should fail compilation with clear diagnostics.

## Unit and Expression Rules

Supported units:

- `px`: absolute pixels
- `%`: percentage of parent content box for position and size attrs
- `vw`: percentage of stage width
- `vh`: percentage of stage height

Supported expression grammar (initial):

- `calc(A + B)`
- `calc(A - B)`
- optional future: multiplication/division when needed

Examples:

- `width: 50%`
- `x: 10%`
- `font-size: calc(14px + 1vw)`

## Artifact Schema (Example)

```json
{
  "engineVersion": "0.1.0",
  "screen": "home",
  "hash": "sha256:...",
  "nodes": [
    {
      "id": "homeRoot",
      "type": "view",
      "parentId": null,
      "classes": ["root"],
      "attrs": { "visible": true },
      "dynamic": {
        "width": { "kind": "percent", "value": 100, "base": "parentWidth" },
        "height": { "kind": "percent", "value": 100, "base": "parentHeight" }
      },
      "events": {
        "onClick": "openMenu"
      }
    }
  ]
}
```

## Caching and Invalidation

Use manifest-based cache invalidation:

- Artifact key includes XML hash + CSS hash + compiler version.
- Rebuild only changed screens.
- Runtime can optionally memoize parsed JSON by `screen + hash`.

## About `toObject()` and `toJSON()`

`Konva.Node#toObject()` and `toJSON()` are useful for debugging snapshots and static export checks, but should not be the primary source artifact for this workflow.

Reasons:

- They flatten responsive intent (`%`, `calc`) unless extra metadata is stored separately.
- Function handlers are not serialized.
- Runtime references are not portable across remount cycles.

Recommended policy:

- Primary artifact: custom render-plan JSON (source of truth).
- Optional: use `toJSON()` only for static subtree debugging or diagnostics.

## Incremental Adoption Plan

1. Phase 1: compile and render the Home shell (sidebar + main shell). ✅ Completed
2. Phase 2: migrate game overlays in `gameui.js`.
3. Phase 3: optimize with watch mode and strict schema validation.
4. Keep imperative fallback path until parity is confirmed per screen.

## Acceptance Criteria

- UI can be rebuilt without reparsing XML/CSS at runtime.
- Resize/fullscreen updates happen through dynamic reflow only.
- Home and game overlays render pixel-equivalent (or approved deltas) to current UI.
- No behavior regression in scene flow or story runtime.
