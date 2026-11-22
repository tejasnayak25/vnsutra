#!/usr/bin/env python3
"""
Model Weight Downloader for VN-Sutra Live Character Rigging (scripts/rig-characters.py).
Downloads required ONNX models to dist/.cache/ with streaming progress and validation.

Models:
1. DWPose 133 Whole-Body Keypoint Estimator (dw-ll_ucoco_384.onnx, ~134 MB)
2. SegFormer Clothes Parsing Model (model_quantized.onnx, ~29 MB)
3. SlimSAM-77 Vision Encoder (vision_encoder.onnx, ~36 MB)
4. SlimSAM-77 Mask Decoder (prompt_encoder_mask_decoder.onnx, ~16 MB)
"""

import os
import sys
import time
import urllib.request
import urllib.error

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE_DIR = os.path.join(PROJECT_ROOT, "dist", ".cache")

MODELS = [
    {
        "name": "DWPose 133 Keypoints",
        "filename": "dw-ll_ucoco_384.onnx",
        "dest_dir": os.path.join(CACHE_DIR, "dwpose"),
        "min_bytes": 100 * 1024 * 1024,  # ~134 MB
        "urls": [
            "https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ll_ucoco_384.onnx",
            "https://huggingface.co/camenduru/unianimate/resolve/main/dw-ll_ucoco_384.onnx",
            "https://huggingface.co/fashn-ai/DWPose/resolve/main/dw-ll_ucoco_384.onnx",
        ],
    },
    {
        "name": "SegFormer Clothes Parser",
        "filename": "model_quantized.onnx",
        "dest_dir": os.path.join(CACHE_DIR, "segformer-clothes"),
        "min_bytes": 20 * 1024 * 1024,  # ~29 MB
        "urls": [
            "https://huggingface.co/Xenova/segformer_b2_clothes/resolve/main/onnx/model_quantized.onnx",
            "https://huggingface.co/faisal-shohag/fashn-human-parser-onnx/resolve/main/onnx/model_quantized.onnx",
        ],
    },
    {
        "name": "SlimSAM-77 Vision Encoder",
        "filename": "vision_encoder.onnx",
        "dest_dir": os.path.join(CACHE_DIR, "slimsam-77"),
        "min_bytes": 15 * 1024 * 1024,  # ~22.2 MB
        "urls": [
            "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder.onnx",
        ],
    },
    {
        "name": "SlimSAM-77 Mask Decoder",
        "filename": "prompt_encoder_mask_decoder.onnx",
        "dest_dir": os.path.join(CACHE_DIR, "slimsam-77"),
        "min_bytes": 10 * 1024 * 1024,  # ~16 MB
        "urls": [
            "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder.onnx",
        ],
    },
]


def format_bytes(n_bytes):
    if n_bytes is None:
        return "unknown size"
    for unit in ["B", "KB", "MB", "GB"]:
        if n_bytes < 1024.0:
            return f"{n_bytes:.1f} {unit}"
        n_bytes /= 1024.0
    return f"{n_bytes:.1f} TB"


def download_file(urls, dest_path, min_bytes=1024 * 1024, description="File"):
    if os.path.exists(dest_path):
        size = os.path.getsize(dest_path)
        if size >= min_bytes:
            print(f"  ✓ {description} already cached ({format_bytes(size)}) at {os.path.relpath(dest_path, PROJECT_ROOT)}")
            return True
        else:
            print(f"  ! Existing file too small ({format_bytes(size)}), re-downloading...")
            try:
                os.remove(dest_path)
            except OSError:
                pass

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    temp_path = dest_path + ".tmp"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    last_error = None
    for url in urls:
        print(f"  → Downloading {description} from {url}...")
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                total_size = response.headers.get("Content-Length")
                total_size = int(total_size) if total_size and total_size.isdigit() else None

                downloaded = 0
                chunk_size = 128 * 1024  # 128 KB
                start_time = time.time()
                last_print = 0

                with open(temp_path, "wb") as f:
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)

                        now = time.time()
                        if now - last_print >= 0.5 or (total_size and downloaded >= total_size):
                            last_print = now
                            elapsed = max(0.001, now - start_time)
                            speed = downloaded / elapsed
                            if total_size:
                                pct = (downloaded / total_size) * 100.0
                                sys.stdout.write(
                                    f"\r    [{pct:5.1f}%] {format_bytes(downloaded)} / {format_bytes(total_size)} "
                                    f"({format_bytes(speed)}/s)   "
                                )
                            else:
                                sys.stdout.write(
                                    f"\r    {format_bytes(downloaded)} downloaded ({format_bytes(speed)}/s)   "
                                )
                            sys.stdout.flush()

                sys.stdout.write("\n")
                final_size = os.path.getsize(temp_path)
                if final_size < min_bytes:
                    raise IOError(f"Downloaded file too small: {final_size} bytes (expected >= {min_bytes} bytes)")

                if os.path.exists(dest_path):
                    os.remove(dest_path)
                os.rename(temp_path, dest_path)
                print(f"  ✓ Saved {description} ({format_bytes(final_size)}) -> {os.path.relpath(dest_path, PROJECT_ROOT)}")
                return True

        except Exception as e:
            last_error = e
            print(f"\n    Failed with {url}: {e}. Trying fallback if available...")
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    print(f"  ✗ Failed to download {description} after trying all mirror URLs. Last error: {last_error}")
    return False


def ensure_all_models(raise_on_error=False):
    print("==================================================================")
    print(" VN-Sutra Rigged Character ONNX Models Downloader")
    print("==================================================================")
    success = True
    for item in MODELS:
        dest_path = os.path.join(item["dest_dir"], item["filename"])
        ok = download_file(
            item["urls"],
            dest_path,
            min_bytes=item["min_bytes"],
            description=f"{item['name']} ({item['filename']})"
        )
        if not ok:
            success = False

    print("==================================================================")
    if success:
        print("✓ All 4 model weights are ready in dist/.cache/")
        return True
    else:
        msg = "Some model weights failed to download. Check network connection or proxy."
        print(f"✗ {msg}")
        if raise_on_error:
            raise RuntimeError(msg)
        return False


if __name__ == "__main__":
    ok = ensure_all_models(raise_on_error=False)
    sys.exit(0 if ok else 1)
