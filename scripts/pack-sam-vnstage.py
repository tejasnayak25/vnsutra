#!/usr/bin/env python3
"""
VN-Sutra SAM 2.5D Parallax Stage Packager (.vnstage).
Packs the infilled base plate, sky, and discrete SAM prop sprites
into a single production binary .vnstage bundle.

Format:
  [4B magic "VNST" | u16 version=1 | u16 flags=0 | u32 jsonLength | UTF-8 manifest JSON | raw WebP atlas]
"""

import os
import sys
import json
import base64
import struct
import io
import argparse
from PIL import Image

def b64_to_img(b64_str: str) -> Image.Image:
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    raw = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(raw)).convert("RGBA")

def pack_scene_to_vnstage(scene_data: dict, out_path: str, quality: int = 88):
    sid = scene_data["id"]
    sname = scene_data["name"]
    sw = scene_data["width"]
    sh = scene_data["height"]
    has_sky = scene_data.get("hasSky", False)

    # 1. Gather all layer images
    layers_to_pack = []

    # Infilled Base Plate
    bg_img = b64_to_img(scene_data["cleanBgB64"])
    layers_to_pack.append({
        "id": f"{sid}_base",
        "role": "base",
        "name": "Infilled Base Scenery",
        "depth": 0.55,
        "image": bg_img,
        "screenRect": {"x": 0, "y": 0, "w": sw, "h": sh}
    })

    # Sky Plate (if present)
    if has_sky and scene_data.get("skyB64"):
        sky_img = b64_to_img(scene_data["skyB64"])
        layers_to_pack.append({
            "id": f"{sid}_sky",
            "role": "underlay",
            "name": "Sky & Distant Horizon",
            "depth": 0.20,
            "image": sky_img,
            "screenRect": {"x": 0, "y": 0, "w": sw, "h": sh}
        })

    # SAM Props
    props = scene_data.get("props", [])
    # Sort props by depth
    props = sorted(props, key=lambda p: p["depth"])

    for p in props:
        p_img = b64_to_img(p["b64"])
        p_depth = float(p["depth"])
        p_bbox = p["bbox"]
        role = "overlay" if p_depth > 0.85 else "midground"
        layers_to_pack.append({
            "id": f"{sid}_{p['id']}",
            "role": role,
            "name": f"Prop {p['id']} (z={p_depth:.2f})",
            "depth": p_depth,
            "image": p_img,
            "screenRect": {"x": p_bbox["x"], "y": p_bbox["y"], "w": p_bbox["w"], "h": p_bbox["h"]}
        })

    # 2. Pack into single Texture Atlas (power of two or shelf-packed)
    atlas_w = 2048
    atlas_h = 2048
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))

    # Place base at top-left (0, 0)
    atlas.paste(bg_img, (0, 0))
    layers_to_pack[0]["atlasRect"] = {"x": 0, "y": 0, "w": bg_img.width, "h": bg_img.height}

    shelf_x = 4
    shelf_y = bg_img.height + 4
    shelf_h = 0
    padding = 4

    for item in layers_to_pack[1:]:
        img = item["image"]
        cw, ch = img.size

        if shelf_x + cw + padding > atlas_w:
            shelf_y += shelf_h + padding
            shelf_x = 4
            shelf_h = 0

        if shelf_y + ch > atlas_h:
            new_h = atlas_h * 2
            new_atlas = Image.new("RGBA", (atlas_w, new_h), (0, 0, 0, 0))
            new_atlas.paste(atlas, (0, 0))
            atlas = new_atlas
            atlas_h = new_h

        atlas.paste(img, (shelf_x, shelf_y))
        item["atlasRect"] = {"x": shelf_x, "y": shelf_y, "w": cw, "h": ch}
        shelf_x += cw + padding
        shelf_h = max(shelf_h, ch)

    # Crop atlas to actual used height rounded up to multiple of 64
    used_h = min(atlas_h, ((shelf_y + shelf_h + 63) // 64) * 64)
    atlas = atlas.crop((0, 0, atlas_w, used_h))

    # 3. Encode WebP Atlas
    atlas_buf = io.BytesIO()
    atlas.save(atlas_buf, format="WEBP", quality=quality, method=5)
    atlas_bytes = atlas_buf.getvalue()

    # 4. Build Stage Manifest (sorted strictly back-to-front by draw order)
    # 1: Underlay (sky), 2: Base (infilled scenery), 3: Midground props, 4: Overlay props
    def layer_draw_order(item):
        if item["role"] == "underlay":
            return 10
        if item["role"] == "base":
            return 50
        if item["role"] == "overlay" or item["depth"] > 0.85:
            return 1000 + item["depth"] * 100
        return 100 + item["depth"] * 100

    manifest_layers = []
    for item in sorted(layers_to_pack, key=layer_draw_order):
        manifest_layers.append({
            "id": item["id"],
            "role": item["role"],
            "name": item["name"],
            "depth": item["depth"],
            "screenRect": item["screenRect"],
            "atlasRect": item["atlasRect"]
        })

    manifest = {
        "format": "VN-STAGE",
        "version": 1,
        "engine": "sam-instance-parallax",
        "scene": sid,
        "name": sname,
        "dimensions": {"width": sw, "height": sh},
        "atlas": {"width": atlas.width, "height": atlas.height},
        "overscan": 0.06,
        "camera": {
            "skyFactor": 0.22,
            "baseFactor": 0.55,
            "characterFactor": 0.85,
            "foregroundFactor": 1.05
        },
        "layers": manifest_layers
    }

    json_bytes = json.dumps(manifest, separators=(",", ":")).encode("utf-8")

    # 5. Build .vnstage Binary Container:
    # 4 bytes magic "VNST", uint16 version=1, uint16 flags=0, uint32 jsonLen
    header = b"VNST" + struct.pack("<HHI", 1, 0, len(json_bytes))
    vnstage_data = header + json_bytes + atlas_bytes

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(vnstage_data)

    kb = len(vnstage_data) / 1024.0
    print(f"  ✓ Packed {sid}.vnstage -> {out_path} ({kb:,.1f} KB, {len(manifest_layers)} layers, atlas {atlas.width}x{atlas.height})")
    return out_path

def pack_all_scenes():
    html_path = "dist/stage-parallax-preview/preview-sam-props.html"
    if not os.path.exists(html_path):
        print(f"[ERROR] {html_path} not found.")
        sys.exit(1)

    with open(html_path, "r", encoding="utf-8") as f:
        text = f.read()

    idx1 = text.find("const scenes = ") + len("const scenes = ")
    idx2 = text.find(";\nlet currentSceneKey =", idx1)
    scenes = json.loads(text[idx1:idx2])

    bg_dir = os.path.join("assets", "game-assets", "backgrounds")
    os.makedirs(bg_dir, exist_ok=True)

    print(f"\n========================================================")
    print(f"Packing SAM 2.5D Parallax Stages (.vnstage)")
    print(f"========================================================")

    for sid, sc in scenes.items():
        out_file = os.path.join(bg_dir, f"{sid}.vnstage")
        pack_scene_to_vnstage(sc, out_file)

    print(f"\n✓ Successfully packed all {len(scenes)} scenes into production .vnstage bundles!\n")

if __name__ == "__main__":
    pack_all_scenes()
