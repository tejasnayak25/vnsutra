# Parallax Stages (`.vnstage` & 2.5D Multi-Plane Stages)

VN-Sutra supports hardware-accelerated 2.5D multi-plane background stages via `ParallaxStage` alongside the classic single-image `Background` module.

Similar to how live character rigs are packaged as single `.vnsprite` bundles, complex multi-tier visual novel stages (infilled base plates, sky horizons, and discrete physical props) are packaged into standalone, production-ready `.vnstage` binary containers.

---

## 1. Binary Container Layout (`.vnstage`)

A `.vnstage` bundle packs the complete stage manifest metadata and a unified WebP texture atlas into a single compact binary file (typically 200 KB – 600 KB):

```
+--------------------------------------------------------------------------------+
| Offset (bytes) | Type        | Value                                           |
+----------------+-------------+-------------------------------------------------+
| 0..3           | ASCII [4B]  | "VNST" (also accepts "VNBG" or "VNSG")          |
| 4..5           | uint16 (LE) | Version = 1                                     |
| 6..7           | uint16 (LE) | Flags = 0                                       |
| 8..11          | uint32 (LE) | JSON Manifest length (N bytes)                  |
| 12..(12+N-1)   | UTF-8 JSON  | Stage Manifest (dimensions, camera, layers)     |
| (12+N)..EOF    | Binary WebP | High-efficiency packed WebP Texture Atlas       |
+--------------------------------------------------------------------------------+
```

### Manifest Schema:
```json
{
  "format": "VN-STAGE",
  "version": 1,
  "engine": "sam-instance-parallax",
  "scene": "cherry_park",
  "name": "Cherry Blossom Park",
  "dimensions": { "width": 1376, "height": 768 },
  "atlas": { "width": 2048, "height": 2368 },
  "overscan": 0.06,
  "camera": {
    "skyFactor": 0.22,
    "baseFactor": 0.55,
    "characterFactor": 0.85,
    "foregroundFactor": 1.05
  },
  "layers": [
    {
      "id": "cherry_park_base",
      "role": "base",
      "name": "Infilled Base Scenery",
      "depth": 0.55,
      "screenRect": { "x": 0, "y": 0, "w": 1376, "h": 768 },
      "atlasRect": { "x": 0, "y": 0, "w": 1376, "h": 768 }
    },
    {
      "id": "cherry_park_sky",
      "role": "underlay",
      "name": "Sky & Distant Horizon",
      "depth": 0.20,
      "screenRect": { "x": 0, "y": 0, "w": 1376, "h": 768 },
      "atlasRect": { "x": 4, "y": 772, "w": 1376, "h": 768 }
    },
    {
      "id": "cherry_park_prop_01",
      "role": "overlay",
      "name": "Prop prop_01 (z=0.92)",
      "depth": 0.92,
      "screenRect": { "x": 0, "y": 0, "w": 448, "h": 768 },
      "atlasRect": { "x": 1384, "y": 772, "w": 448, "h": 768 }
    }
  ]
}
```

---

## 2. Building `.vnstage` Bundles

Run the stage packager to compile segmented scenes into production `.vnstage` files:

```bash
python scripts/pack-sam-vnstage.py
```

This compiles all discovered physical props, infilled scenery plates, and sky layers into optimized binary bundles under `assets/game-assets/backgrounds/<scene>.vnstage`:
- `cherry_park.vnstage` (~600 KB, 8 layers)
- `classroom.vnstage` (~280 KB, 9 layers)
- `shrine.vnstage` (~500 KB, 11 layers)
- `rainy_cafe.vnstage` (~290 KB, 8 layers)
- `coastal_hill.vnstage` (~350 KB, 8 layers)
- `apartment_exterior.vnstage` (~250 KB, 5 layers)
- `futon_room.vnstage` (~200 KB, 12 layers)

---

## 3. Using `ParallaxStage` in Story Scripts & Code

### In Story Script Files (`.vn`):
```vn
# Load a production .vnstage background bundle:
stage: cherry_park.vnstage

# Or using background.stage action:
{ type: "stage", asset: "cherry_park.vnstage", options: { mouseTilt: true } }
```

### In JavaScript:
```javascript
import { ParallaxStage } from "../vnsutra_modules/assets/index.js";

// Load and mount via Game instance:
await game.loadStage("backgrounds/cherry_park.vnstage", {
    mouseTilt: true,
    overscan: 0.06
});

// Or instantiate standalone:
const stage = new ParallaxStage({ url: "backgrounds/cherry_park.vnstage" });
await stage.load();
stage.mount(game);
```

---

## 4. True 2.5D Depth Layering Architecture

`ParallaxStage` automatically splits layers into the proper visual novel z-sandwich:

1. **Underlay & Base Plate (`bgGroup`):**
   - Far Sky ($z=0.20$): shifts slowly at $0.22\times$.
   - Infilled Base Plate ($z=0.55$): shifts with ground scenery at $0.55\times$.
   - Midground Props ($z=0.60-0.75$): benches, desks, lampposts sit behind characters.
2. **Actor / Character Layer:**
   - Live characters (`RiggedCharacter` / `Character`) sit at $z=0.85$, naturally in front of the midground props.
3. **Foreground Hero Props (`foreGroup`):**
   - Framing tree canopies, foreground pillars, and tall grass ($z=0.95-1.05$) render in front of the character.
4. **Unified $6\%$ Camera Overscan:**
   - The stage world is uniformly buffered by $6\%$, allowing the base plate and foreground to glide freely with continuous camera pan and mouse-tilt without ever revealing black screen borders or severed crop seams.
