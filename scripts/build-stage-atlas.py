#!/usr/bin/env python3
"""
VN-Sutra Semantic Background Processor & Stage Atlas Packager.
Powered by Deep Learning Computer Vision:
  - SegFormer (ADE20K) for true semantic scene understanding
  - Depth-Anything-V2 for continuous metric relative depth estimation

Pipeline:
  1. Semantic Scene Classification (Interior vs Exterior)
  2. Exterior: Underlay (Sky), Base Stage (Ground/Props/Midground), Overlay (Near Trees/Canopy)
  3. Interior: Single Solid Unbroken Room Stage (z = 1.00, zero overlays on character)
  4. Infilling on Base Plate behind foreground occluders (no ghost duplicates)
  5. Tight Bounding-Box Texture Atlas Packager & Binary Encoder (.vnstage)
  6. Edge-Safe Interactive Parallax Preview (zero edge cutting)

Usage:
  python scripts/build-stage-atlas.py <image_path>
  python scripts/build-stage-atlas.py --all [--preview]
"""

import os
import sys
import glob
import json
import base64
import struct
import argparse
import io
import cv2
import numpy as np
from PIL import Image

# Global Model Pipelines (lazy-loaded once)
_SEG_PIPE = None
_DEPTH_PIPE = None

def get_pipelines():
    global _SEG_PIPE, _DEPTH_PIPE
    if _SEG_PIPE is None:
        from transformers import pipeline
        print("  ✓ Loading SegFormer (ADE20K) semantic segmenter...")
        _SEG_PIPE = pipeline("image-segmentation", model="nvidia/segformer-b0-finetuned-ade-512-512")
    if _DEPTH_PIPE is None:
        from transformers import pipeline
        print("  ✓ Loading Depth-Anything-V2 depth estimator...")
        _DEPTH_PIPE = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
    return _SEG_PIPE, _DEPTH_PIPE

def crop_alpha_bbox(rgba_img):
    """
    Finds the minimal non-transparent bounding box and crops the image.
    Returns (cropped_image, screenRect).
    """
    arr = np.array(rgba_img)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0 or len(ys) == 0:
        return rgba_img, {"x": 0, "y": 0, "w": rgba_img.width, "h": rgba_img.height}

    min_x, max_x = int(xs.min()), int(xs.max())
    min_y, max_y = int(ys.min()), int(ys.max())
    w = max_x - min_x + 1
    h = max_y - min_y + 1

    cropped = rgba_img.crop((min_x, min_y, max_x + 1, max_y + 1))
    screen_rect = {"x": min_x, "y": min_y, "w": w, "h": h}
    return cropped, screen_rect

def push_pull_inpaint(img_bgr, known_mask_u8, target_mask_u8, levels=6):
    """
    Source-Only Normalized Convolution (Push-Pull Hierarchical Inpainting).
    Extrapolates strictly from pixels where known_mask_u8 > 0.
    Mathematically guarantees that outside interior colors (walls, curtains, desks)
    or foreground objects (props, tree trunks) NEVER bleed into the synthesized region.
    """
    weights = (known_mask_u8 > 0).astype(np.float32)
    colors = (img_bgr.astype(np.float32)) * weights[:, :, None]

    pyr_colors = [colors]
    pyr_weights = [weights]
    for _ in range(levels):
        c_down = cv2.pyrDown(pyr_colors[-1])
        w_down = cv2.pyrDown(pyr_weights[-1])
        pyr_colors.append(c_down)
        pyr_weights.append(w_down)

    filled = pyr_colors[-1] / np.maximum(pyr_weights[-1][:, :, None], 1e-5)
    for i in range(len(pyr_colors) - 2, -1, -1):
        filled_up = cv2.pyrUp(filled, dstsize=(pyr_colors[i].shape[1], pyr_colors[i].shape[0]))
        curr_w = pyr_weights[i][:, :, None]
        curr_c = pyr_colors[i]
        valid = (curr_w > 0.01)
        filled = np.where(valid, curr_c / np.maximum(curr_w, 1e-5), filled_up)

    result = np.clip(filled, 0, 255).astype(np.uint8)
    out = img_bgr.copy()
    fill_zone = (target_mask_u8 > 0) & (known_mask_u8 == 0)
    out[fill_zone] = result[fill_zone]
    return out

def error_correct_prop_mask(img_bgr, prop_mask):
    """
    Semantic & Geometric Error Correction for Physical Props:
    1. Morphological hole closing: solid physical props cannot have random pinhole cavities.
    2. Enclosed contour filling: guarantees continuous solid prop silhouettes.
    3. High-luminance / bulb recovery: lighting fixtures (streetlights, lamps) have glowing
       bulbs/lantern glass that semantic segmenters often misclassify as sky due to luminance.
       Within the bounding box of a lighting fixture, recovers all connected glowing/high-contrast pixels.
    """
    if prop_mask.sum() == 0:
        return prop_mask

    h, w = prop_mask.shape
    u8 = (prop_mask.astype(np.uint8) * 255)

    # 1. Morphological close to bridge small segments and frame wires
    closed = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    # 2. Enclosed contour filling: fills internal holes inside solid prop silhouettes
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(closed)
    cv2.drawContours(filled, contours, -1, 255, -1)

    # 3. Bulb / Lantern recovery for lighting props
    ys, xs = np.where(filled > 0)
    y1, y2 = max(0, ys.min() - 10), min(h, ys.max() + 10)
    x1, x2 = max(0, xs.min() - 10), min(w, xs.max() + 10)

    crop = img_bgr[y1:y2, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    # Glowing bulb/filament: high value (brightness) and warm/saturated hue or white/yellow
    is_bulb = (hsv[:, :, 2] > 170) & (hsv[:, :, 1] > 35)

    bulb_full = np.zeros((h, w), dtype=bool)
    bulb_full[y1:y2, x1:x2] = is_bulb

    corrected = (filled > 0) | bulb_full
    corrected_u8 = cv2.morphologyEx(corrected.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return corrected_u8 > 0

def decompose_scene_semantic(img_path, base_name):
    """
    Deep-Learning Semantic Scene Decomposition.
    Uses SegFormer semantic classes and Depth-Anything-V2 relative depth.
    No hardcoded hues, no geometric coordinate knives, no per-image xyz rules.
    """
    seg_pipe, depth_pipe = get_pipelines()
    pil_img = Image.open(img_path).convert("RGB")
    w, h = pil_img.size
    img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    # 1. Compute Semantic Segments
    segments = seg_pipe(pil_img)
    label_masks = {}
    for s in segments:
        label = s["label"]
        mask = np.array(s["mask"]) > 0
        if label not in label_masks:
            label_masks[label] = mask
        else:
            label_masks[label] = label_masks[label] | mask

    # 2. Compute Metric Relative Depth Map
    depth_out = depth_pipe(pil_img)
    depth_arr = np.array(depth_out["depth"]).astype(float)
    # Normalize depth: 0.0 = infinitely far, 1.0 = near camera
    depth_norm = (depth_arr - depth_arr.min()) / (depth_arr.max() - depth_arr.min() + 1e-6)

    # 3. Semantic Scene Classification
    interior_labels = ["wall", "floor", "ceiling", "bed", "cushion", "door", "wardrobe", "curtain", "table", "carpet"]
    exterior_labels = ["sky", "grass", "earth", "mountain", "sand", "sea", "tree", "plant", "path", "road"]

    interior_area = sum(label_masks[lbl].sum() for lbl in interior_labels if lbl in label_masks)
    exterior_area = sum(label_masks[lbl].sum() for lbl in exterior_labels if lbl in label_masks)

    has_sky = "sky" in label_masks and (label_masks["sky"].sum() > (w * h * 0.02))
    scene_type = "interior" if (interior_area > exterior_area and not has_sky) else "exterior"

    print(f"  ✓ Semantic Scene Type: {scene_type.upper()} (Interior Area: {interior_area}, Exterior Area: {exterior_area})")

    # ==========================================
    # INTERIOR LOGIC: Base Stage + Window Exterior Underlay (if windowpane exists)
    # ==========================================
    if scene_type == "interior":
        has_window = "windowpane" in label_masks and (label_masks["windowpane"].sum() > (w * h * 0.02))
        layers = []

        if has_window:
            window_mask = label_masks["windowpane"].copy()
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
            grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
            grad_mag = cv2.magnitude(grad_x, grad_y)

            # Window frames & mullions are structural dividers: dark bars or sharp edge contours
            is_frame = ((gray < 155) | (grad_mag > 40)) & window_mask
            if "curtain" in label_masks:
                is_frame |= label_masks["curtain"]
            if "wall" in label_masks:
                is_frame |= (label_masks["wall"] & window_mask)

            # Error Correction: ensure continuous frame dividers without dropped holes
            is_frame_u8 = cv2.morphologyEx(is_frame.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
            is_frame = is_frame_u8 > 0

            # Glass openings (apertures) through which exterior vista is visible
            glass_openings = window_mask & (~is_frame)
            glass_u8 = cv2.morphologyEx(glass_openings.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

            # Underlay: Synthesize exterior vista using Source-Only Push-Pull Inpainting.
            # Only pixels from glass_u8 contribute colors; room walls, curtains, and desks
            # are mathematically ignored, guaranteeing clean outdoor sky & trees without smearing.
            window_dilated = cv2.dilate(glass_u8, np.ones((45, 45), np.uint8), iterations=2)
            window_inpainted_bgr = push_pull_inpaint(img_bgr, glass_u8, window_dilated)

            window_rgba = cv2.cvtColor(window_inpainted_bgr, cv2.COLOR_BGR2RGBA)
            window_alpha = cv2.GaussianBlur(window_dilated, (5, 5), 1.0)
            window_rgba[:, :, 3] = window_alpha
            img_window = Image.fromarray(window_rgba)
            layers.append({
                "id": f"{base_name.lower()}_underlay",
                "role": "underlay",
                "name": "Window Exterior Vista",
                "depth": 0.20,
                "image": img_window
            })

            # Base Plate: ONLY cut out the glass apertures; window frames, mullions, sill, and curtains remain 100% solid
            base_rgba = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGBA)
            glass_feather = cv2.GaussianBlur(glass_u8, (5, 5), 1.0)
            base_rgba[:, :, 3] = np.clip(255 - glass_feather, 0, 255).astype(np.uint8)
        else:
            base_rgba = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGBA)
            base_rgba[:, :, 3] = 255

        img_base = Image.fromarray(base_rgba)
        layers.append({
            "id": f"{base_name.lower()}_base",
            "role": "base",
            "name": "Room Interior Stage",
            "depth": 1.00,
            "image": img_base
        })

        return "interior", layers

    # ==========================================
    # EXTERIOR LOGIC: Semantic Three-Plane Stage
    # ==========================================
    # Collect all physical prop masks (streetlights, lamps, poles, railings, fences, buildings, furniture)
    raw_prop_mask = np.zeros((h, w), dtype=bool)
    for prop_lbl in ["streetlight", "lamp", "pole", "column", "fence", "railing", "building", "signboard", "tower", "chair", "bench"]:
        if prop_lbl in label_masks:
            raw_prop_mask |= label_masks[prop_lbl]

    # Apply Prop Error Correction (hole closing, silhouette completion, bulb recovery)
    prop_mask = error_correct_prop_mask(img_bgr, raw_prop_mask)

    # A. Sky Underlay (z = 0.20)
    layers = []
    if has_sky:
        sky_mask = label_masks["sky"].copy()

        # Semantic Prop Protection:
        # Exclude physical solid props and their immediate boundaries from sky cutout
        if prop_mask.sum() > 0:
            prop_protected = cv2.dilate((prop_mask.astype(np.uint8) * 255), np.ones((7, 7), np.uint8), iterations=1) > 0
            sky_mask = sky_mask & (~prop_protected)

        # Also protect dark solid structures (gray < 90)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        is_dark_structure = (gray < 90)
        sky_mask = sky_mask & (~is_dark_structure)
        sky_mask_u8 = (sky_mask.astype(np.uint8) * 255)

        # Dilate sky downward & sideways by 60px behind midground trees, lampposts, and horizon
        sky_dilated = cv2.dilate(sky_mask_u8, np.ones((35, 55), np.uint8), iterations=2)

        # Source-Only Push-Pull Inpainting for Sky Underlay:
        # Behind the lamppost, bulb, and trees, fills strictly with smooth sky/horizon gradient.
        # Underlay NEVER contains ghost twins of bulbs or lamps!
        sky_inpainted_bgr = push_pull_inpaint(img_bgr, sky_mask_u8, sky_dilated)

        sky_rgba = cv2.cvtColor(sky_inpainted_bgr, cv2.COLOR_BGR2RGBA)
        sky_alpha = cv2.GaussianBlur(sky_dilated, (5, 5), 1.0)
        sky_rgba[:, :, 3] = sky_alpha
        img_sky = Image.fromarray(sky_rgba)
        layers.append({
            "id": f"{base_name.lower()}_underlay",
            "role": "underlay",
            "name": "Sky & Distant Horizon",
            "depth": 0.20,
            "image": img_sky
        })
    else:
        sky_mask_u8 = np.zeros((h, w), dtype=np.uint8)

    # B. Foreground Overlay (z = 1.45)
    # Tree/plant/column structures that are physically in the foreground (depth >= 0.55)
    # Exclude all ground plane elements (path, grass, earth, road, bench, chair)
    foreground_candidate = np.zeros((h, w), dtype=bool)
    for lbl in ["tree", "plant", "column", "awning"]:
        if lbl in label_masks:
            foreground_candidate |= (label_masks[lbl] & (depth_norm >= 0.55))

    # Never put streetlights, lamps, benches, or props in the foreground overlay canopy
    foreground_candidate &= (~prop_mask)

    # Keep only significant connected components
    fore_u8 = cv2.morphologyEx(foreground_candidate.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fore_u8)
    clean_fore = np.zeros((h, w), dtype=np.uint8)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] > 8000:
            clean_fore[labels == i] = 255

    # Also ensure clean_fore never touches or overlaps prop_mask
    clean_fore[prop_mask] = 0
    has_fore = bool(clean_fore.sum() > 8000)

    # C. Focal Base Stage (z = 1.00)
    # Unbroken walkway, lawn, bench, lamppost, and midground trees
    base_bgr = img_bgr.copy()
    if has_fore:
        # Inpaint behind the foreground tree on the base plate using push-pull
        fore_inpaint_mask = cv2.dilate(clean_fore, np.ones((15, 15), np.uint8), iterations=1)
        fore_inpaint_mask = (fore_inpaint_mask > 0) & (sky_mask_u8 == 0) & (~prop_mask)
        known_base = ((fore_inpaint_mask == 0) & (sky_mask_u8 == 0)).astype(np.uint8) * 255
        target_base = np.ones((h, w), dtype=np.uint8) * 255
        if fore_inpaint_mask.sum() > 0:
            base_bgr = push_pull_inpaint(base_bgr, known_base, target_base)

    base_rgba = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2RGBA)
    if has_sky:
        # Cutout refined sky on base plate so Underlay shows behind
        # Fine structures (lampposts, spires, branches) remain 100% opaque on the base!
        sky_feather = cv2.GaussianBlur(sky_mask_u8, (3, 3), 0.8)
        base_rgba[:, :, 3] = np.clip(255 - sky_feather, 0, 255).astype(np.uint8)
    else:
        base_rgba[:, :, 3] = 255

    # Guarantee all props (including complete bulb, lantern housing, and pole) are 100% solid on focal base plate
    if prop_mask.sum() > 0:
        base_rgba[prop_mask, 3] = 255

    img_base = Image.fromarray(base_rgba)
    layers.append({
        "id": f"{base_name.lower()}_base",
        "role": "base",
        "name": "Walkway & Focal Stage",
        "depth": 1.00,
        "image": img_base
    })

    if has_fore:
        fore_rgba = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGBA)
        fore_alpha = cv2.GaussianBlur(clean_fore, (7, 7), 1.5)
        fore_rgba[:, :, 3] = fore_alpha
        img_fore = Image.fromarray(fore_rgba)
        layers.append({
            "id": f"{base_name.lower()}_overlay",
            "role": "overlay",
            "name": "Foreground Framing & Canopy",
            "depth": 1.45,
            "image": img_fore
        })

    return "exterior", layers

def pack_stage_atlas(layers_meta, base_name, scene_type="interior"):
    """
    Packs the base plate and tightly-cropped overlay/underlay layers
    into a single power-of-two texture atlas (e.g. 2048x2048).
    """
    processed_layers = []
    base_item = None

    for item in layers_meta:
        if item["role"] == "base":
            base_item = item
            processed_layers.append({
                "id": item["id"],
                "role": item["role"],
                "name": item["name"],
                "depth": item["depth"],
                "image": item["image"],
                "screenRect": {"x": 0, "y": 0, "w": item["image"].width, "h": item["image"].height}
            })
        else:
            cropped_img, s_rect = crop_alpha_bbox(item["image"])
            processed_layers.append({
                "id": item["id"],
                "role": item["role"],
                "name": item["name"],
                "depth": item["depth"],
                "image": cropped_img,
                "screenRect": s_rect
            })

    base_w, base_h = base_item["image"].size
    atlas_w = 2048
    atlas_h = 2048
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    # Place base at (0, 0)
    atlas.paste(base_item["image"], (0, 0))
    for p in processed_layers:
        if p["role"] == "base":
            p["atlasRect"] = {"x": 0, "y": 0, "w": p["image"].width, "h": p["image"].height}

    # Shelf pack non-base layers
    shelf_x = 4
    shelf_y = base_h + 4
    shelf_h = 0
    padding = 4

    for p in processed_layers:
        if p["role"] == "base":
            continue

        c_w, c_h = p["image"].size
        if shelf_x + c_w + padding > atlas_w:
            shelf_y += shelf_h + padding
            shelf_x = 4
            shelf_h = 0

        if shelf_y + c_h > atlas_h:
            new_h = atlas_h * 2
            new_atlas = Image.new("RGBA", (atlas_w, new_h), (0, 0, 0, 0))
            new_atlas.paste(atlas, (0, 0))
            atlas = new_atlas
            atlas_h = new_h

        atlas.paste(p["image"], (shelf_x, shelf_y))
        p["atlasRect"] = {"x": shelf_x, "y": shelf_y, "w": c_w, "h": c_h}
        shelf_x += c_w + padding
        shelf_h = max(shelf_h, c_h)

    total_screen_pixels = sum(p["screenRect"]["w"] * p["screenRect"]["h"] for p in processed_layers)
    total_stored_pixels = sum(p["atlasRect"]["w"] * p["atlasRect"]["h"] for p in processed_layers)
    naive_pixels = len(processed_layers) * base_w * base_h
    savings_pct = 100.0 - (total_stored_pixels / naive_pixels) * 100.0 if naive_pixels > 0 else 0.0

    manifest = {
        "format": "VN-STAGE",
        "version": 1,
        "scene": base_name,
        "type": scene_type,
        "dimensions": {"width": base_w, "height": base_h},
        "atlas": {"width": atlas_w, "height": atlas_h},
        "stats": {
            "layerCount": len(processed_layers),
            "naivePixels": naive_pixels,
            "storedPixels": total_stored_pixels,
            "memorySavingsPercent": round(savings_pct, 1)
        },
        "layers": [
            {
                "id": p["id"],
                "role": p["role"],
                "name": p["name"],
                "depth": p["depth"],
                "screenRect": p["screenRect"],
                "atlasRect": p["atlasRect"]
            }
            for p in processed_layers
        ]
    }

    return atlas, manifest, processed_layers

def build_vnstage_package(img_path, out_dir=None):
    if not os.path.exists(img_path):
        raise FileNotFoundError(f"Input image not found: {img_path}")

    base_name = os.path.splitext(os.path.basename(img_path))[0]
    if not out_dir:
        out_dir = os.path.join("assets", "game-assets", "backgrounds")
    os.makedirs(out_dir, exist_ok=True)

    print(f"\nProcessing Scene: {img_path}")
    scene_type, layers_meta = decompose_scene_semantic(img_path, base_name)

    print(f"  ✓ Extracted {len(layers_meta)} semantic layers:")
    for l in layers_meta:
        print(f"      - [{l['role'].upper()}] {l['name']} (depth={l['depth']:.2f})")

    atlas_img, manifest, processed = pack_stage_atlas(layers_meta, base_name, scene_type)
    savings = manifest["stats"]["memorySavingsPercent"]
    print(f"  ✓ Packed into {atlas_img.width}x{atlas_img.height} Atlas Texture (Savings: {savings}%)")

    # Encode PNG bytes
    png_buf = io.BytesIO()
    atlas_img.save(png_buf, format="PNG", optimize=True)
    atlas_bytes = png_buf.getvalue()

    # Encode .vnstage binary package
    json_bytes = json.dumps(manifest, separators=(",", ":")).encode("utf-8")
    header = struct.pack("<4sII", b"VNBG", 1, len(json_bytes))
    vnstage_data = header + json_bytes + atlas_bytes

    out_vnstage = os.path.join(out_dir, f"{base_name.lower()}.vnstage")
    with open(out_vnstage, "wb") as f:
        f.write(vnstage_data)
    print(f"  ✓ Generated .vnstage Package -> {out_vnstage} ({len(vnstage_data)/1024:.1f} KB)")

    snippet = f"bg stage: \"{base_name.lower()}\"\n"
    snippet_path = os.path.join(out_dir, f"{base_name.lower()}_stage.vn")
    with open(snippet_path, "w") as f:
        f.write(snippet)

    return {
        "name": base_name,
        "type": scene_type,
        "manifest": manifest,
        "directive": snippet.strip(),
        "vnstage_path": out_vnstage,
        "atlas_img": atlas_img,
        "layers": processed
    }

def generate_inspector_html(stage_packages, preview_out="dist/stage-parallax-preview/preview.html"):
    os.makedirs(os.path.dirname(preview_out), exist_ok=True)

    def read_b64(path):
        if not os.path.exists(path):
            return ""
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")

    nanami_path = "assets/game-assets/characters/Nanami/Casual/Smiling.png"
    mary_path = "assets/game-assets/characters/Rin/Casual/Rin_Casual_Smile.png"
    nanami_b64 = read_b64(nanami_path)
    mary_b64 = read_b64(mary_path)

    scenes_data = {}
    for sp in stage_packages:
        buf = io.BytesIO()
        sp["atlas_img"].save(buf, format="PNG")
        atlas_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        key = sp["name"].lower().replace("-", "_")
        scenes_data[key] = {
            "name": sp["name"].replace("_", " "),
            "type": sp["type"],
            "directive": sp["directive"],
            "manifest": sp["manifest"],
            "atlas_b64": atlas_b64
        }

    scenes_json = json.dumps(scenes_data)

    template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>.vnstage 2.5D Parallax Stage & Atlas Inspector — VN-Sutra</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #070b14; color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; height: 100vh; overflow: hidden;
  }
  #stage-wrap {
    flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; background: #020617; padding: 20px;
  }
  #canvas-container {
    position: relative; width: 1280px; height: 720px; max-width: 100%; max-height: 90vh;
    aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden;
    box-shadow: 0 25px 60px -15px rgba(0,0,0,0.9);
    border: 1px solid #1e293b; background: #000; cursor: crosshair;
  }
  canvas {
    width: 100%; height: 100%; display: block;
  }
  #hud {
    position: absolute; top: 16px; left: 16px;
    background: rgba(15, 23, 42, 0.90); backdrop-filter: blur(8px);
    border: 1px solid #334155; padding: 10px 14px; border-radius: 8px;
    font-size: 0.74rem; font-family: ui-monospace, monospace; color: #cbd5e1; pointer-events: none;
    line-height: 1.5; z-index: 10;
  }
  #hud strong { color: #38bdf8; }
  #sidebar {
    width: 380px; background: #0f172a; border-left: 1px solid #1e293b;
    display: flex; flex-direction: column; padding: 18px; gap: 14px; overflow-y: auto;
  }
  h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #f8fafc; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem;
    font-weight: 600; text-transform: uppercase; margin-left: 6px;
  }
  .badge-exterior { background: #065f46; color: #6ee7b7; border: 1px solid #047857; }
  .badge-interior { background: #1e3a8a; color: #93c5fd; border: 1px solid #1d4ed8; }
  .card {
    background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px;
  }
  .card h3 {
    margin: 0 0 8px 0; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;
  }
  .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.82rem; }
  select, button {
    background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px;
    padding: 6px 10px; font-size: 0.82rem; cursor: pointer;
  }
  button:hover { background: #1e293b; border-color: #475569; }
  .layer-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px; background: #0f172a; border-radius: 6px; margin-bottom: 6px; font-size: 0.78rem;
  }
  .layer-role {
    font-size: 0.65rem; padding: 2px 5px; border-radius: 4px; font-weight: 600;
  }
  .role-underlay { background: #1e3a8a; color: #93c5fd; }
  .role-base { background: #065f46; color: #6ee7b7; }
  .role-overlay { background: #831843; color: #f472b6; }
  .stat-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.76rem;
  }
  .stat-box {
    background: #0f172a; padding: 8px; border-radius: 6px; border: 1px solid #334155;
  }
  .stat-val { font-size: 1.05rem; font-weight: 700; color: #38bdf8; }
  .tab-bar {
    display: flex; gap: 6px; margin-bottom: 4px;
  }
  .tab-btn {
    flex: 1; padding: 6px 10px; text-align: center; border-radius: 6px; border: 1px solid #334155;
    background: #0f172a; color: #94a3b8; font-size: 0.75rem; font-weight: 600; cursor: pointer;
  }
  .tab-btn.active {
    background: #2563eb; color: #fff; border-color: #3b82f6;
  }
  #atlas-view {
    display: none; width: 100%; height: 100%; overflow: auto; background: #020617; position: relative;
  }
  #atlas-img-canvas {
    max-width: 100%; height: auto; display: block; margin: 0 auto;
  }
</style>
</head>
<body>

<div id="stage-wrap">
  <div id="canvas-container">
    <canvas id="stage-canvas" width="1280" height="720"></canvas>
    <div id="atlas-view">
      <canvas id="atlas-img-canvas"></canvas>
    </div>
    <div id="hud">
      <div><strong>Scene:</strong> <span id="hud-scene">-</span></div>
      <div><strong>Type:</strong> <span id="hud-type">-</span></div>
      <div><strong>Camera Pan:</strong> <span id="hud-pan">X: 0.00, Y: 0.00</span></div>
      <div><strong>Actor:</strong> <span id="hud-actor">Moving (Midground)</span></div>
      <div><strong>Atlas Memory:</strong> <span id="hud-savings">0% Saved</span></div>
    </div>
  </div>
</div>

<div id="sidebar">
  <div>
    <h2>.vnstage Inspector <span id="scene-badge" class="badge badge-exterior">EXTERIOR</span></h2>
    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">VN-Sutra 2.5D Parallax Stage & Atlas Packager</div>
  </div>

  <div class="card">
    <div class="tab-bar">
      <button class="tab-btn active" id="tab-stage" onclick="switchView('stage')">2.5D Parallax Stage</button>
      <button class="tab-btn" id="tab-atlas" onclick="switchView('atlas')">Packed Texture Atlas</button>
    </div>
  </div>

  <div class="card">
    <h3>Active Scene</h3>
    <select id="scene-select" style="width:100%;" onchange="onSceneChange(this.value)"></select>
  </div>

  <div class="card">
    <h3>Stage Parallax & Actor</h3>
    <div class="row">
      <span>Character Actor:</span>
      <select id="actor-select" onchange="onActorChange(this.value)">
        <option value="nanami">Nanami (Casual)</option>
        <option value="mary">Mary (Rin Casual)</option>
        <option value="none">None (Empty Stage)</option>
      </select>
    </div>
    <div class="row">
      <span>Tilt Intensity:</span>
      <input type="range" id="intensity" min="0.2" max="2.0" step="0.1" value="1.0" oninput="tiltIntensity = parseFloat(this.value);" />
    </div>
    <div class="row">
      <span>Camera Zoom:</span>
      <input type="range" id="zoom" min="1.05" max="1.35" step="0.01" value="1.15" oninput="stageZoom = parseFloat(this.value);" />
    </div>
    <div class="row">
      <span>Auto-Drift:</span>
      <input type="checkbox" id="auto-drift" checked onchange="autoDrift = this.checked;" />
    </div>
  </div>

  <div class="card">
    <h3>Semantic Stage Layers</h3>
    <div id="layers-list"></div>
  </div>

  <div class="card">
    <h3>Texture Atlas Optimization</h3>
    <div class="stat-grid">
      <div class="stat-box">
        <div style="color:#94a3b8;">Atlas Size</div>
        <div class="stat-val" id="stat-atlas-res">2048x2048</div>
      </div>
      <div class="stat-box">
        <div style="color:#94a3b8;">VRAM Savings</div>
        <div class="stat-val" id="stat-savings">55.2%</div>
      </div>
    </div>
    <div style="margin-top:8px; font-size:0.72rem; color:#94a3b8;">
      Binary Directive: <code id="stat-directive" style="color:#38bdf8;">bg stage: "scene"</code>
    </div>
  </div>
</div>

<script>
const scenes = __SCENES_JSON__;
const nanamiB64 = "data:image/png;base64,__NANAMI_B64__";
const maryB64 = "data:image/png;base64,__MARY_B64__";

let currentSceneKey = Object.keys(scenes)[0];
let currentActor = "nanami";
let activeView = "stage";
let tiltIntensity = 1.0;
let stageZoom = 1.15;
let autoDrift = true;
let mouseX = 0, mouseY = 0;
let smoothX = 0, smoothY = 0;
let layerVisibility = {};

const canvas = document.getElementById("stage-canvas");
const ctx = canvas.getContext("2d");
const atlasCanvas = document.getElementById("atlas-img-canvas");
const atlasCtx = atlasCanvas.getContext("2d");

const actorImgs = {
  nanami: new Image(),
  mary: new Image()
};
if (nanamiB64.length > 50) actorImgs.nanami.src = nanamiB64;
if (maryB64.length > 50) actorImgs.mary.src = maryB64;

const atlasImgCache = {};
function getAtlasImage(key) {
  if (!atlasImgCache[key]) {
    const img = new Image();
    img.src = "data:image/png;base64," + scenes[key].atlas_b64;
    atlasImgCache[key] = img;
  }
  return atlasImgCache[key];
}

const sceneSelect = document.getElementById("scene-select");
Object.keys(scenes).forEach(k => {
  const opt = document.createElement("option");
  opt.value = k;
  opt.textContent = scenes[k].name + " (" + scenes[k].type.toUpperCase() + ")";
  sceneSelect.appendChild(opt);
});

function onSceneChange(key) {
  currentSceneKey = key;
  updateUI();
  if (activeView === "atlas") renderAtlasView();
}

function onActorChange(act) {
  currentActor = act;
}

function switchView(view) {
  activeView = view;
  document.getElementById("tab-stage").classList.toggle("active", view === "stage");
  document.getElementById("tab-atlas").classList.toggle("active", view === "atlas");
  document.getElementById("stage-canvas").style.display = view === "stage" ? "block" : "none";
  document.getElementById("atlas-view").style.display = view === "atlas" ? "block" : "none";
  if (view === "atlas") renderAtlasView();
}

function updateUI() {
  const sc = scenes[currentSceneKey];
  document.getElementById("hud-scene").textContent = sc.name;
  document.getElementById("hud-type").textContent = sc.type.toUpperCase();
  document.getElementById("hud-savings").textContent = sc.manifest.stats.memorySavingsPercent + "% VRAM Saved";
  document.getElementById("stat-atlas-res").textContent = sc.manifest.atlas.width + "x" + sc.manifest.atlas.height;
  document.getElementById("stat-savings").textContent = sc.manifest.stats.memorySavingsPercent + "%";
  document.getElementById("stat-directive").textContent = sc.directive;

  const badge = document.getElementById("scene-badge");
  badge.textContent = sc.type.toUpperCase();
  badge.className = "badge badge-" + sc.type;

  const list = document.getElementById("layers-list");
  list.innerHTML = "";
  sc.manifest.layers.forEach(l => {
    if (layerVisibility[l.id] === undefined) layerVisibility[l.id] = true;
    const item = document.createElement("div");
    item.className = "layer-item";
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" ${layerVisibility[l.id] ? "checked" : ""} onchange="layerVisibility['${l.id}'] = this.checked;" />
        <span class="layer-role role-${l.role}">${l.role.toUpperCase()}</span>
        <span>${l.name}</span>
      </div>
      <span style="color:#94a3b8; font-family:monospace;">z=${l.depth.toFixed(2)}</span>
    `;
    list.appendChild(item);
  });
}

function renderAtlasView() {
  const sc = scenes[currentSceneKey];
  const atlas = getAtlasImage(currentSceneKey);
  if (!atlas.complete || atlas.naturalWidth === 0) {
    atlas.onload = renderAtlasView;
    return;
  }
  atlasCanvas.width = atlas.naturalWidth;
  atlasCanvas.height = atlas.naturalHeight;
  atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  atlasCtx.drawImage(atlas, 0, 0);

  sc.manifest.layers.forEach(l => {
    const r = l.atlasRect;
    atlasCtx.lineWidth = 3;
    if (l.role === "underlay") atlasCtx.strokeStyle = "#38bdf8";
    else if (l.role === "base") atlasCtx.strokeStyle = "#4ade80";
    else atlasCtx.strokeStyle = "#f472b6";
    atlasCtx.strokeRect(r.x, r.y, r.w, r.h);

    atlasCtx.fillStyle = "rgba(0,0,0,0.75)";
    atlasCtx.fillRect(r.x + 4, r.y + 4, 180, 24);
    atlasCtx.fillStyle = "#fff";
    atlasCtx.font = "12px sans-serif";
    atlasCtx.fillText(`[${l.role.toUpperCase()}] ${l.name}`, r.x + 8, r.y + 20);
  });
}

const container = document.getElementById("canvas-container");
container.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
});

container.addEventListener("mouseleave", () => {
  mouseX = 0;
  mouseY = 0;
});

updateUI();

// Render Loop with Edge-Cutting Immunity
let lastTime = performance.now();
function render(now) {
  const dt = Math.min((now - lastTime) * 0.001, 0.1);
  lastTime = now;

  let targetX = mouseX;
  let targetY = mouseY;
  if (autoDrift) {
    const t = now * 0.0006;
    targetX += Math.sin(t) * 0.35;
    targetY += Math.cos(t * 0.8) * 0.18;
  }

  smoothX += (targetX - smoothX) * Math.min(dt * 8, 1);
  smoothY += (targetY - smoothY) * Math.min(dt * 8, 1);

  document.getElementById("hud-pan").textContent = `X: ${smoothX.toFixed(2)}, Y: ${smoothY.toFixed(2)}`;

  if (activeView === "stage") {
    const sc = scenes[currentSceneKey];
    const atlas = getAtlasImage(currentSceneKey);

    ctx.clearRect(0, 0, 1280, 720);

    ctx.save();

    // Mathematically Guarded Camera Pan:
    // Ensures background boundaries NEVER pull inward past the canvas edges (Zero Edge Cutting)
    const base_w = sc.manifest.dimensions.width;
    const base_h = sc.manifest.dimensions.height;
    const scale = Math.max(1280 / base_w, 720 / base_h);
    const stageW = base_w * scale;
    const stageH = base_h * scale;

    // Available overscan margin from zoom
    const maxSafePanX = Math.max(0, (stageZoom - 1.0) * (640 / stageZoom));
    const maxSafePanY = Math.max(0, (stageZoom - 1.0) * (360 / stageZoom));
    const camPanX = Math.max(-maxSafePanX, Math.min(maxSafePanX, smoothX * 42 * tiltIntensity));
    const camPanY = Math.max(-maxSafePanY, Math.min(maxSafePanY, smoothY * 26 * tiltIntensity));

    ctx.translate(640, 360);
    ctx.scale(stageZoom, stageZoom);
    ctx.translate(-640 + camPanX, -360 + camPanY);

    const baseX = (1280 - stageW) / 2;
    const baseY = (720 - stageH) / 2;

    if (atlas.complete && atlas.naturalWidth > 0) {
      // 1. Underlay Layers (depth < 1.0)
      sc.manifest.layers.filter(l => l.depth < 1.0).forEach(l => {
        if (!layerVisibility[l.id]) return;
        const ar = l.atlasRect;
        const sr = l.screenRect;
        const factor = (1.0 - l.depth) * 0.45;
        const shiftX = -camPanX * factor;
        const shiftY = -camPanY * factor;
        ctx.drawImage(atlas, ar.x, ar.y, ar.w, ar.h,
          baseX + sr.x * scale + shiftX,
          baseY + sr.y * scale + shiftY,
          sr.w * scale, sr.h * scale);
      });

      // 2. Base Stage (depth = 1.00)
      sc.manifest.layers.filter(l => l.depth === 1.0).forEach(l => {
        if (!layerVisibility[l.id]) return;
        const ar = l.atlasRect;
        const sr = l.screenRect;
        ctx.drawImage(atlas, ar.x, ar.y, ar.w, ar.h,
          baseX + sr.x * scale,
          baseY + sr.y * scale,
          sr.w * scale, sr.h * scale);
      });

      // 3. Actor Sprite
      if (currentActor !== "none" && actorImgs[currentActor] && actorImgs[currentActor].complete) {
        const actImg = actorImgs[currentActor];
        const breathBob = Math.sin(now * 0.0028) * 3.5;
        const actorW = currentActor === "nanami" ? 440 : 400;
        const actorH = (actImg.naturalHeight / actImg.naturalWidth) * actorW;
        const actorX = 640 - actorW * 0.48;
        const actorY = 720 - actorH * 0.88 + breathBob;
        ctx.drawImage(actImg, actorX, actorY, actorW, actorH);
      }

      // 4. Foreground Overlay Layers (depth > 1.0)
      sc.manifest.layers.filter(l => l.depth > 1.0).forEach(l => {
        if (!layerVisibility[l.id]) return;
        const ar = l.atlasRect;
        const sr = l.screenRect;
        const factor = (l.depth - 1.0) * 0.55;
        const shiftX = camPanX * factor;
        const shiftY = camPanY * factor;
        ctx.drawImage(atlas, ar.x, ar.y, ar.w, ar.h,
          baseX + sr.x * scale + shiftX,
          baseY + sr.y * scale + shiftY,
          sr.w * scale, sr.h * scale);
      });
    }

    ctx.restore();
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
</script>
</body>
</html>
"""

    html = template.replace("__SCENES_JSON__", scenes_json).replace("__NANAMI_B64__", nanami_b64).replace("__MARY_B64__", mary_b64)
    with open(preview_out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n✓ Generated .vnstage Inspector Preview -> {preview_out} ({len(html)/1024:.1f} KB)")
    return preview_out

def main():
    parser = argparse.ArgumentParser(description="VN-Sutra Semantic Background Processor & Stage Atlas Packager")
    parser.add_argument("input", nargs="?", default=None, help="Path to input 2D background image")
    parser.add_argument("--out", "-o", default=None, help="Output directory for .vnstage package")
    parser.add_argument("--all", action="store_true", help="Process all backgrounds in assets/game-assets/backgrounds")
    parser.add_argument("--preview", action="store_true", default=True, help="Generate interactive preview inspector")
    args = parser.parse_args()

    processed = []
    bg_dir = os.path.join("assets", "game-assets", "backgrounds", "Noraneko_Background_Pack_1")

    if args.all or (not args.input and os.path.exists(bg_dir)):
        targets = []
        bg_root = os.path.join("assets", "game-assets", "backgrounds")
        for ext in ["*.jpg", "*.jpeg", "*.png"]:
            targets.extend(glob.glob(os.path.join(bg_root, "**", ext), recursive=True))

        # Filter out intermediate layer PNGs, depth maps, or prototype test folders
        filtered_targets = []
        for t in targets:
            bn = os.path.basename(t).lower()
            dn = os.path.dirname(t).lower()
            if any(p in dn for p in ["_depth", "_parallax", "demo_"]):
                continue
            if any(bn.startswith(p) for p in ["01_", "02_", "03_", "depth_map"]):
                continue
            if any(p in bn for p in ["atlas", "_composite"]):
                continue
            filtered_targets.append(t)

        print(f"Discovered {len(filtered_targets)} background scenes to process:")
        for t in filtered_targets:
            print(f"  - {t}")

        for t in filtered_targets:
            processed.append(build_vnstage_package(t, args.out))
    elif args.input:
        processed.append(build_vnstage_package(args.input, args.out))

    if args.preview and processed:
        generate_inspector_html(processed)

if __name__ == "__main__":
    main()
