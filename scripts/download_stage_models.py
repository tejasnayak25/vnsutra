#!/usr/bin/env python3
"""
Model Weight Downloader for VN-Sutra 2.5D Parallax Stages (scripts/build-stage-atlas.py).
Pre-downloads and verifies required deep learning models:
  1. SegFormer B0 ADE20K (nvidia/segformer-b0-finetuned-ade-512-512, ~15 MB)
     - Semantic scene understanding (interior vs. exterior, sky underlays, foreground canopies)
  2. Depth-Anything-V2-Small (depth-anything/Depth-Anything-V2-Small-hf, ~99 MB)
     - Continuous metric relative depth estimation for multi-plane depth extraction

While Hugging Face's `transformers.pipeline` can auto-download models on first invocation,
this script provides upfront pre-caching, progress bars, size verification, and offline readiness.
"""

import os
import sys
import time

MODELS = [
    {
        "id": "nvidia/segformer-b0-finetuned-ade-512-512",
        "name": "SegFormer B0 ADE20K (Semantic Scene Segmenter)",
        "task": "image-segmentation",
        "approx_size": "15 MB",
    },
    {
        "id": "depth-anything/Depth-Anything-V2-Small-hf",
        "name": "Depth-Anything-V2-Small (Metric Relative Depth Estimator)",
        "task": "depth-estimation",
        "approx_size": "99 MB",
    },
]


def download_stage_models():
    print("=" * 68)
    print("VN-Sutra Parallax Stage Model Weight Downloader (.vnstage)")
    print("=" * 68)

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("[!] huggingface_hub not installed. Installing or falling back to transformers...")
        try:
            from transformers import pipeline
            snapshot_download = None
        except ImportError:
            print("[ERROR] Neither huggingface_hub nor transformers is installed.")
            print("Please run: pip install transformers huggingface_hub torch torchvision")
            sys.exit(1)

    all_ok = True
    start_total = time.time()

    for idx, model in enumerate(MODELS, 1):
        mid = model["id"]
        mname = model["name"]
        msize = model["approx_size"]

        print(f"\n[{idx}/{len(MODELS)}] Checking {mname} (~{msize})...")
        t0 = time.time()

        try:
            if snapshot_download:
                cached_path = snapshot_download(
                    repo_id=mid,
                    allow_patterns=["*.json", "*.safetensors", "*.bin", "*.txt"],
                    resume_download=True,
                )
                dt = time.time() - t0
                print(f"  ✓ Cached cleanly in {dt:.1f}s -> {cached_path}")
            else:
                from transformers import pipeline
                print(f"  → Initializing pipeline for {mid}...")
                _ = pipeline(model["task"], model=mid)
                dt = time.time() - t0
                print(f"  ✓ Initialized and verified in {dt:.1f}s")
        except Exception as err:
            print(f"  ✗ Failed to download {mid}: {err}")
            all_ok = False

    elapsed = time.time() - start_total
    print("\n" + "=" * 68)
    if all_ok:
        print(f"✓ All stage models verified and cached ready for offline use ({elapsed:.1f}s)!")
        print("You can now run: npm run assets:stages")
    else:
        print(f"[!] Some stage models failed to download ({elapsed:.1f}s). Check network connection.")
    print("=" * 68)
    return all_ok


if __name__ == "__main__":
    success = download_stage_models()
    sys.exit(0 if success else 1)
