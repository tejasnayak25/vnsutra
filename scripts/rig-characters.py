import argparse
import base64
import gc
import glob
import hashlib
import inspect
import json
import math
import os
import struct
import sys
import time
from concurrent.futures import ProcessPoolExecutor
import cv2
import numpy as np
from PIL import Image
import onnxruntime as ort
from scipy.ndimage import binary_fill_holes
from skimage.color import rgb2lab
from skimage.segmentation import watershed

from semantic_block_preview_tpl import build_semantic_block_preview_html


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE_DIR = os.path.join(PROJECT_ROOT, "dist", ".cache")


def resolve_dwpose_path():
    candidates = [
        os.environ.get("DWPOSE_MODEL", ""),
        os.path.join(CACHE_DIR, "dwpose", "dw-ll_ucoco_384.onnx"),
        os.path.join("dist", ".cache", "dwpose", "dw-ll_ucoco_384.onnx"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    # If not found, attempt automatic download via download_rig_models
    try:
        from download_rig_models import ensure_all_models
        ensure_all_models(raise_on_error=True)
        default_path = os.path.join(CACHE_DIR, "dwpose", "dw-ll_ucoco_384.onnx")
        if os.path.exists(default_path):
            return default_path
    except Exception as e:
        print(f"[rig-characters] Automatic model download failed: {e}")

    raise FileNotFoundError("Could not find dw-ll_ucoco_384.onnx; run 'npm run models:download' or cache in dist/.cache/dwpose/")


DWPOSE_PATH = None
SEGF_DIR = os.path.join(CACHE_DIR, "segformer-clothes")
SLIMSAM_DIR = os.path.join(CACHE_DIR, "slimsam-77")

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


_SESSIONS = None
_INTRA_THREADS = None
FRAME_CACHE_DIR = os.path.join(CACHE_DIR, "frame-decomp")


def make_session(path, intra_threads=None):
    opts = ort.SessionOptions()
    opts.enable_mem_pattern = False
    opts.enable_cpu_mem_arena = False
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    if intra_threads is not None and int(intra_threads) > 0:
        opts.intra_op_num_threads = int(intra_threads)
        opts.inter_op_num_threads = 1
    return ort.InferenceSession(path, sess_options=opts)


def get_sessions():
    """Lazily initialize ONNX sessions so pack-only CLI stays instant and worker threads can be pinned."""
    global _SESSIONS, DWPOSE_PATH
    if _SESSIONS is None:
        if DWPOSE_PATH is None:
            DWPOSE_PATH = resolve_dwpose_path()
        segf_path = os.path.join(SEGF_DIR, "model_quantized.onnx")
        sam_vis_path = os.path.join(SLIMSAM_DIR, "vision_encoder.onnx")
        sam_dec_path = os.path.join(SLIMSAM_DIR, "prompt_encoder_mask_decoder.onnx")

        # Ensure all required models are present
        if not (os.path.exists(segf_path) and os.path.exists(sam_vis_path) and os.path.exists(sam_dec_path)):
            try:
                from download_rig_models import ensure_all_models
                ensure_all_models(raise_on_error=True)
            except Exception as e:
                print(f"[rig-characters] Could not download missing models: {e}")

        _SESSIONS = {
            "dwpose": make_session(DWPOSE_PATH, _INTRA_THREADS),
            "segf": make_session(segf_path, _INTRA_THREADS),
            "sam_vis": make_session(sam_vis_path, _INTRA_THREADS),
            "sam_dec": make_session(sam_dec_path, _INTRA_THREADS),
        }
    return _SESSIONS


def _init_worker(intra_threads):
    global _INTRA_THREADS
    _INTRA_THREADS = intra_threads
    get_sessions()

BODY_LAYERS = ("back_hair", "lower_body", "skin_canvas", "upper_clothes", "front_hair")


def detect_all_keypoints(img_pil):
    rgb = img_pil.convert("RGB")
    ow, oh = rgb.size
    mh, mw = 384, 288
    sc = min(mh / oh, mw / ow)
    nw, nh = int(ow * sc), int(oh * sc)
    pw, ph = mw - nw, mh - nh
    pad = Image.new("RGB", (mw, mh), (128, 128, 128))
    pad.paste(rgb.resize((nw, nh), Image.LANCZOS), (pw // 2, ph // 2))
    arr = np.transpose(np.array(pad, dtype=np.float32) / 255.0, (2, 0, 1))[None, ...]
    sx, sy = get_sessions()["dwpose"].run(None, {"input": arr})
    sx, sy = sx[0], sy[0]
    nxb, nyb = sx.shape[1], sy.shape[1]

    def ref(b, scores):
        if b <= 0 or b >= len(scores) - 1:
            return float(b)
        d = float(scores[b - 1]) + float(scores[b + 1]) - 2 * float(scores[b])
        if abs(d) < 1e-8:
            return float(b)
        return float(b) + max(-0.5, min(0.5, 0.5 * (float(scores[b - 1]) - float(scores[b + 1])) / d))

    return [(((ref(int(sx[i].argmax()), sx[i]) / nxb) * mw - pw / 2) / sc,
             ((ref(int(sy[i].argmax()), sy[i]) / nyb) * mh - ph / 2) / sc) for i in range(len(sx))]


def run_segformer_clothes(white_bg_pil, alpha):
    W, H = white_bg_pil.size
    res = white_bg_pil.resize((512, 512), Image.BILINEAR)
    arr = (np.array(res, dtype=np.float32) / 255.0 - MEAN[None, None, :]) / STD[None, None, :]
    arr = np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)
    segf_sess = get_sessions()["segf"]
    logits = segf_sess.run(None, {segf_sess.get_inputs()[0].name: arr})[0][0]
    up = np.stack([cv2.resize(logits[c], (W, H), interpolation=cv2.INTER_LINEAR) for c in range(logits.shape[0])], axis=0)
    pred = np.argmax(up, axis=0)
    pred[alpha <= 40] = 0
    return pred


def encode_sam_image(pil_rgb):
    W, H = pil_rgb.size
    sc = 1024.0 / max(W, H)
    nw, nh = int(round(W * sc)), int(round(H * sc))
    res = np.array(pil_rgb.resize((nw, nh), Image.BILINEAR), dtype=np.float32)
    norm = (res - MEAN[None, None, :] * 255.0) / (STD[None, None, :] * 255.0)
    canvas = np.zeros((1024, 1024, 3), dtype=np.float32)
    canvas[:nh, :nw] = norm
    x = np.transpose(canvas, (2, 0, 1))[None, ...]
    img_emb, pos_emb = get_sessions()["sam_vis"].run(None, {"pixel_values": x})
    return (img_emb, pos_emb, sc, nw, nh, W, H)


def decode_sam_mask(sam_ctx, pts_xy, labels, pick="smallest"):
    img_emb, pos_emb, sc, nw, nh, W, H = sam_ctx
    in_pts = np.array([[[x * sc, y * sc] for (x, y) in pts_xy]], dtype=np.float32)[None, ...]
    in_lbls = np.array([[labels]], dtype=np.int64)
    iou_scores, pred_masks = get_sessions()["sam_dec"].run(None, {
        "input_points": in_pts, "input_labels": in_lbls,
        "image_embeddings": img_emb, "image_positional_embeddings": pos_emb,
    })
    scores, masks = iou_scores[0, 0], pred_masks[0, 0]
    if pick == "smallest":
        areas = [int(np.sum(masks[k] > 0)) for k in range(3)]
        valid = [k for k in range(3) if scores[k] > 0.60 and areas[k] > 5]
        idx = min(valid, key=lambda k: areas[k]) if valid else int(np.argmax(scores))
    else:
        idx = int(np.argmax(scores))
    m_1024 = cv2.resize(masks[idx], (1024, 1024), interpolation=cv2.INTER_LINEAR)
    m_src = cv2.resize(m_1024[:nh, :nw], (W, H), interpolation=cv2.INTER_LINEAR)
    return m_src > 0.0, float(scores[idx])


def extract_anime_eyes_lab(solid, face, m_hair, lab):
    """Segment open OR closed anime eyes via Lab skin-anomaly & sclera aperture gating."""
    H, W = solid.shape
    cheek_samples = []
    for pt in (face[29], face[30], face[31], face[35],
               ((face[1][0] + face[36][0]) * 0.5, (face[1][1] + face[41][1]) * 0.5 + 12),
               ((face[15][0] + face[45][0]) * 0.5, (face[15][1] + face[46][1]) * 0.5 + 12)):
        cx_s, cy_s = int(round(pt[0])), int(round(pt[1]))
        patch = lab[max(0, cy_s - 6):min(H, cy_s + 6), max(0, cx_s - 8):min(W, cx_s + 8)]
        if patch.size:
            cheek_samples.append(patch.reshape(-1, 3))
    skin_lab = np.median(np.vstack(cheek_samples), axis=0)
    skin_chroma = float(np.hypot(skin_lab[1], skin_lab[2]))
    chroma = np.hypot(lab[:, :, 1], lab[:, :, 2])

    d_L = np.abs(lab[:, :, 0] - skin_lab[0]) * 0.60
    d_a = np.abs(lab[:, :, 1] - skin_lab[1]) * 1.25
    d_b = np.abs(lab[:, :, 2] - skin_lab[2]) * 1.35
    skin_dist = np.sqrt(d_L ** 2 + d_a ** 2 + d_b ** 2)

    d_ab_skin = np.hypot(lab[:, :, 1] - skin_lab[1], lab[:, :, 2] - skin_lab[2])
    is_warm_skin = (d_ab_skin < 6.5) & (chroma >= max(4.5, skin_chroma * 0.62)) & (lab[:, :, 0] > skin_lab[0] - 14.0)
    is_sclera = (
        (lab[:, :, 0] > 48.0)
        & (lab[:, :, 2] < min(8.2, skin_lab[2] * 0.80))
        & (chroma < max(8.5, skin_chroma * 0.76))
        & (d_ab_skin > 4.5)
        & (~is_warm_skin)
    )

    ew_l = max(12.0, max(face[i][0] for i in range(36, 42)) - min(face[i][0] for i in range(36, 42)))
    ew_r = max(12.0, max(face[i][0] for i in range(42, 48)) - min(face[i][0] for i in range(42, 48)))
    face_w = max(40.0, abs(face[14][0] - face[2][0]))
    eye_scale = max(ew_l, ew_r, face_w * 0.24)
    ey = (face[36][1] + face[45][1]) * 0.5

    hair_above = m_hair & (np.arange(H)[:, None] < ey)
    hair_pts = lab[hair_above] if np.any(hair_above) else lab[m_hair]
    hair_edge_2px = cv2.dilate(m_hair.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    # Geodesically extend m_hair into thin sharp bang needles above the eye aperture (stops before eye top!)
    min_eye_y = min(face[i][1] for i in range(36, 48))
    if len(hair_pts) > 0:
        hair_lab = np.median(hair_pts, axis=0)
        hair_d_ab = np.hypot(lab[:, :, 1] - hair_lab[1], lab[:, :, 2] - hair_lab[2])
        hair_d_L = np.abs(lab[:, :, 0] - hair_lab[0])
        is_black_lash = (lab[:, :, 0] < 24.0) & (chroma < 12.0)
        needle_band = (np.arange(H)[:, None] < ey - eye_scale * 0.08) & (~is_sclera) & solid & (lab[:, :, 0] > 16.0)
        hair_cand = m_hair | (needle_band & (hair_d_ab < 20.0) & (hair_d_L < 24.0))
        num_h, comp_h = cv2.connectedComponents(hair_cand.astype(np.uint8) * 255, connectivity=8)
        m_hair_ext = m_hair.copy()
        for cid in range(1, num_h):
            if np.any((comp_h == cid) & m_hair):
                m_hair_ext |= (comp_h == cid)
        # Keep tight top threshold on m_hair_ext needles without spilling down onto black lashes
        bang_dil = (cv2.dilate(m_hair_ext.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0) & (np.arange(H)[:, None] < min_eye_y + 4)
        likely_bang = m_hair_ext | (bang_dil & (~is_sclera) & (~is_black_lash)) | (
            hair_edge_2px & (~is_black_lash) & (~is_sclera) & (hair_d_ab < 22.0) & (hair_d_L < 38.0)
        )
    else:
        likely_bang = m_hair

    def isolate_one(eye_indices, brow_indices):
        xs = [face[i][0] for i in eye_indices]
        ys = [face[i][1] for i in eye_indices]
        cx = (min(xs) + max(xs)) * 0.5
        cy = (min(ys) + max(ys)) * 0.5
        brow_mid_y = float(np.mean([face[i][1] for i in brow_indices]))

        top_lim = max(0, int(round(brow_mid_y - eye_scale * 0.25)))
        bot_lim = min(H, int(round(cy + eye_scale * 1.15)))
        x0 = max(0, int(round(cx - eye_scale * 1.48)))
        x1 = min(W, int(round(cx + eye_scale * 1.48)))

        yy, xx = np.mgrid[top_lim:bot_lim, x0:x1]
        roi_L = lab[top_lim:bot_lim, x0:x1, 0]
        roi_dist = skin_dist[top_lim:bot_lim, x0:x1]
        roi_sclera = is_sclera[top_lim:bot_lim, x0:x1]
        roi_skin = is_warm_skin[top_lim:bot_lim, x0:x1]
        roi_bang = likely_bang[top_lim:bot_lim, x0:x1]
        roi_solid = solid[top_lim:bot_lim, x0:x1]

        rx = eye_scale * 1.35
        ry = eye_scale * 0.85
        ell_gate = (((xx - cx) / rx) ** 2 + ((yy - (cy + eye_scale * 0.14)) / ry) ** 2) <= 1.0

        cand = ((roi_dist > 17.5) | roi_sclera | (roi_L < skin_lab[0] - 22.0)) & (~roi_skin) & roi_solid & (~roi_bang) & ell_gate

        brow_poly = np.array([(int(round(face[i][0])) - x0, int(round(face[i][1])) - top_lim) for i in brow_indices])
        brow_mask = np.zeros_like(cand, dtype=np.uint8)
        cv2.polylines(brow_mask, [brow_poly], False, 255, thickness=max(5, int(eye_scale * 0.18)))
        cand &= (brow_mask == 0)

        poly = np.array([(int(round(face[i][0])) - x0, int(round(face[i][1])) - top_lim) for i in eye_indices])
        poly_seed = np.zeros_like(cand, dtype=np.uint8)
        cv2.fillConvexPoly(poly_seed, poly, 255)
        poly_seed = cv2.dilate(poly_seed, np.ones((int(eye_scale * 0.45) | 1, int(eye_scale * 0.25) | 1), np.uint8))

        temple_hair_guard = (np.abs(xx - cx) > eye_scale * 0.78) & (yy > cy + eye_scale * 0.14) & (roi_L < 55.0) & (~roi_sclera)
        cand &= (~temple_hair_guard)

        poly_inner = np.zeros_like(cand, dtype=np.uint8)
        cv2.fillConvexPoly(poly_inner, poly, 255)
        inner_core_band = (poly_inner > 0) & (~m_hair[top_lim:bot_lim, x0:x1]) & (~roi_skin) & roi_solid
        cand |= (inner_core_band & ((roi_sclera) | ((roi_L > 42.0) & (roi_dist > 14.0))))

        opened = cv2.morphologyEx(cand.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        num, comp = cv2.connectedComponents(opened, connectivity=8)
        core = np.zeros_like(cand)
        for cid in range(1, num):
            c_mask = comp == cid
            if np.any(c_mask & (poly_seed > 0)):
                core |= c_mask

        # Closed-eye fallback (e.g. EyesClosed/Happy thin curved lashes): anchor strictly near tight eye landmarks
        if np.sum(core) < 40:
            closed_seed = cv2.dilate(poly_inner, np.ones((9, 9), np.uint8)) > 0
            closed_cand = (roi_L < skin_lab[0] - 18.0) & (~roi_skin) & roi_solid & (~roi_bang) & ell_gate & (brow_mask == 0)
            num_c, comp_c = cv2.connectedComponents(closed_cand.astype(np.uint8) * 255, connectivity=8)
            closed_mask = np.zeros_like(cand)
            for cid in range(1, num_c):
                c_mask = comp_c == cid
                if np.sum(c_mask) >= 12 and np.any(c_mask & closed_seed):
                    closed_mask |= c_mask
            closed_mask = cv2.dilate(closed_mask.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)) > 0
            full = np.zeros((H, W), dtype=bool)
            full[top_lim:bot_lim, x0:x1] = closed_mask & (~roi_bang) & ell_gate & roi_solid
            return full

        core_filled = core | (binary_fill_holes(core) & (~roi_skin) & (~roi_bang))

        rh, rw = cand.shape
        y_indices = np.arange(rh)[:, None]
        core_upper = np.full(rw, rh, dtype=np.int32)
        for col in range(rw):
            ys_c = np.where(core_filled[:, col])[0]
            if ys_c.size > 0:
                core_upper[col] = int(ys_c[0])
        valid_cols = np.where(core_upper < rh)[0]
        sclera_allowed = np.zeros_like(cand)
        top_y_med = int(cy - eye_scale * 0.25 - top_lim)
        roi_chroma = chroma[top_lim:bot_lim, x0:x1]
        roi_d_ab = d_ab_skin[top_lim:bot_lim, x0:x1]
        roi_warm_sclera = (roi_L > 52.0) & (roi_chroma < max(9.5, skin_chroma * 0.85)) & (roi_d_ab > 3.8)
        if valid_cols.size > 0:
            top_y_med = int(np.percentile(core_upper[valid_cols], 20))
            sclera_ell = (((xx - cx) / rx) ** 2 + ((yy - (cy + eye_scale * 0.14)) / (eye_scale * 0.64)) ** 2) <= 1.0
            sclera_allowed = (roi_sclera | roi_warm_sclera) & sclera_ell & (y_indices >= max(0, top_y_med - 4)) & (~roi_bang)

        # Outer winged lashes sit laterally beyond mid-eye corners; keep central top cleanly under bang needles
        core_halo_lash = cv2.dilate(core_filled.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 11))) > 0
        wing_y_lo = max(0, top_y_med - 4)
        wing_y_hi = int(round(cy + eye_scale * 0.22 - top_lim))
        lateral_wing_zone = (np.abs(xx - cx) > eye_scale * 0.52) | (yy >= min(ys) - 1)
        dark_wing_lash = (roi_L < 38.0) & (~roi_bang) & (~roi_skin) & (roi_dist > 17.5) & ell_gate & core_halo_lash & lateral_wing_zone & (y_indices >= wing_y_lo) & (y_indices <= wing_y_hi)
        attach_pool = core_filled | sclera_allowed | dark_wing_lash

        num2, comp2 = cv2.connectedComponents(attach_pool.astype(np.uint8) * 255, connectivity=8)
        selected = np.zeros_like(cand)
        for cid in range(1, num2):
            c_mask = comp2 == cid
            if np.any(c_mask & core_filled):
                selected |= c_mask

        selected = selected | (binary_fill_holes(selected) & (~roi_skin) & (~roi_bang))
        selected = cv2.morphologyEx(selected.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
        selected = selected | (binary_fill_holes(selected) & (~roi_skin) & (~roi_bang))

        num3, comp3 = cv2.connectedComponents(selected.astype(np.uint8) * 255, connectivity=8)
        clean = np.zeros_like(selected)
        for cid in range(1, num3):
            c_mask = comp3 == cid
            if np.sum(c_mask) >= 80 and np.any(c_mask & (poly_seed > 0)):
                clean |= c_mask

        full = np.zeros((H, W), dtype=bool)
        full[top_lim:bot_lim, x0:x1] = clean & (~roi_bang) & (~roi_skin) & ell_gate & roi_solid
        return full

    return isolate_one(range(36, 42), range(17, 22)), isolate_one(range(42, 48), range(22, 27)), skin_lab


def normalize_by_semantic_masks(rgb, solid, masks_dict, cur_meds, ref_meds):
    """Smooth luminance-scaled RBF color normalization restricted strictly per SegFormer material mask."""
    H, W = solid.shape
    out_rgb = rgb.astype(np.float32).copy()
    px_luma = np.mean(out_rgb, axis=2)

    for key in ("hair", "skin", "cloth", "skirt"):
        msk = masks_dict[key] & solid
        c_mu = cur_meds.get(key)
        r_mu = ref_meds.get(key)
        if c_mu is None or r_mu is None or not np.any(msk):
            continue
        shift = r_mu - c_mu
        if float(np.linalg.norm(shift)) < 0.75:
            continue
        diff = out_rgb[msk] - c_mu[None, :]
        dist_sq = np.sum(diff * diff, axis=1)
        w = np.exp(-dist_sq / (2.0 * 48.0 * 48.0))
        luma_sc = np.clip(px_luma[msk] / max(10.0, float(np.mean(c_mu))), 0.0, 1.25)
        out_rgb[msk] = np.clip(out_rgb[msk] + shift[None, :] * (w * luma_sc)[:, None], 0.0, 255.0)

    return np.round(out_rgb).astype(np.uint8)


def extend_layer_into(src_rgb, src_alpha, base_mask, allow_under_mask, radius_px=10, peel_seam=True):
    """Extend a semantic layer up to `radius_px` underneath an occluding mask via crop-local Voronoi fill."""
    H, W = base_mask.shape
    out = np.zeros((H, W, 4), dtype=np.uint8)
    valid_base = base_mask & (src_alpha > 40)
    if not np.any(valid_base):
        return out
    out[valid_base, :3] = src_rgb[valid_base]
    out[valid_base, 3] = src_alpha[valid_base]

    target = allow_under_mask & (~valid_base)
    if not np.any(target):
        return out

    # Crop distanceTransform + GaussianBlur tightly around target + margin for 4-6x speedup
    tys, txs = np.where(target)
    pad = int(radius_px) + 10
    cy0, cy1 = max(0, int(tys.min()) - pad), min(H, int(tys.max()) + 1 + pad)
    cx0, cx1 = max(0, int(txs.min()) - pad), min(W, int(txs.max()) + 1 + pad)

    loc_valid = valid_base[cy0:cy1, cx0:cx1]
    if not np.any(loc_valid):
        return out
    loc_target = target[cy0:cy1, cx0:cx1]
    loc_rgb = src_rgb[cy0:cy1, cx0:cx1]

    dist = cv2.distanceTransform((~loc_valid).astype(np.uint8), cv2.DIST_L2, 5)
    ext_zone = loc_target & (dist > 0) & (dist <= float(radius_px))
    if not np.any(ext_zone):
        return out

    eroded = cv2.erode(loc_valid.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    color_seed = eroded if np.any(eroded) else loc_valid
    _, labels = cv2.distanceTransformWithLabels((~color_seed).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.where(color_seed)

    if peel_seam:
        seam_peel = loc_valid & (cv2.dilate(ext_zone.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
        fill_zone = ext_zone | seam_peel
    else:
        fill_zone = ext_zone

    voronoi_rgb = loc_rgb[ys[labels - 1], xs[labels - 1]]
    blurred_vor = cv2.GaussianBlur(voronoi_rgb, (5, 5), 1.4)
    loc_out = out[cy0:cy1, cx0:cx1]
    loc_out[fill_zone, :3] = blurred_vor[fill_zone]
    loc_out[ext_zone, 3] = 255
    return out


def decompose_frame(pil_im, target_w, target_h, body_donor=None):
    """Run DWPose + SegFormer-Clothes Crop Watershed + Lab Eyes + SlimSAM Mouth for a single mood frame."""
    if pil_im.size != (target_w, target_h):
        pil_im = pil_im.resize((target_w, target_h), Image.LANCZOS)
    W, H = target_w, target_h
    rgba = np.array(pil_im)
    rgb, alpha = rgba[:, :, :3], rgba[:, :, 3]
    solid = alpha > 40
    area_sc = max(0.25, (H / 1500.0) ** 2)

    white_bg = Image.new("RGB", (W, H), (245, 245, 245))
    white_bg.paste(pil_im, mask=pil_im.split()[3])

    pts = detect_all_keypoints(pil_im)
    body, face = pts[:17], pts[23:91]
    seg = run_segformer_clothes(white_bg, alpha)

    ey = (face[36][1] + face[45][1]) * 0.5
    face_h = max(30.0, face[8][1] - ey)
    sh_y = (body[5][1] + body[6][1]) * 0.5
    hip_y = (body[11][1] + body[12][1]) * 0.5
    torso_h = max(60.0, hip_y - sh_y)
    waist_split_y = int(round(sh_y + torso_h * 0.56))
    collar_y = min(H, int(round(sh_y + torso_h * 0.14)))

    m_hair_raw = (seg == 2) & solid
    m_skin_raw = np.isin(seg, [11, 12, 13, 14, 15, 3]) & solid
    nx, ny = int(round(face[30][0])), int(round(face[30][1]))
    face_skin_ref = np.median(rgb[max(0, ny - 10):min(H, ny + 10), max(0, nx - 12):min(W, nx + 12)].reshape(-1, 3), axis=0)
    leg_cand = np.isin(seg, [9, 10, 6]) & solid
    false_leg_skin = np.zeros_like(solid)
    if np.any(leg_cand):
        leg_diff = np.linalg.norm(rgb[leg_cand].astype(np.float32) - face_skin_ref[None, :], axis=1)
        false_leg_skin[leg_cand] = (leg_diff < 58.0)
    m_skin_raw |= false_leg_skin

    # Generalized garment routing: handles skirts, pants, dresses, scarves, belts, bags, shoes, & hats
    pants_shoes = np.isin(seg, [6, 9, 10]) & solid & (~false_leg_skin)
    yy_all = np.arange(H)[:, None]
    bag_upper = (seg == 16) & solid & (yy_all < waist_split_y)
    bag_lower = (seg == 16) & solid & (yy_all >= waist_split_y)
    hat_hair = (seg == 1) & solid & (yy_all < ey)
    m_hair_raw |= hat_hair

    skirt_px, dress_px = int(np.sum(seg == 5)), int(np.sum(seg == 7))
    if skirt_px > max(dress_px * 2, int(15000 * area_sc)):
        m_cloth_raw = (np.isin(seg, [4, 17]) & solid) | bag_upper
        m_skirt_raw = (np.isin(seg, [5, 8]) & solid) | pants_shoes | bag_lower
    elif dress_px > int(5000 * area_sc):
        m_cloth_raw = (np.isin(seg, [4, 17]) & solid) | bag_upper
        m_skirt_raw = (np.isin(seg, [5, 7, 8]) & solid & (yy_all >= waist_split_y - int(torso_h * 0.08))) | pants_shoes | bag_lower
    else:
        garments = np.isin(seg, [4, 5, 7, 8]) & solid
        xx = np.arange(W)[None, :]
        hip_w = max(40.0, abs(body[12][0] - body[11][0]))
        waist_cx = (body[11][0] + body[12][0]) * 0.5
        m_skirt_raw = (garments & (yy_all >= waist_split_y) & (np.abs(xx - waist_cx) < hip_w * 1.3)) | pants_shoes | bag_lower
        m_cloth_raw = (garments & (~m_skirt_raw)) | bag_upper

    def clean_islands(mask, min_area):
        num, comp, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
        out = np.zeros_like(mask)
        for cid in range(1, num):
            if stats[cid, cv2.CC_STAT_AREA] >= min_area:
                out[comp == cid] = True
        return binary_fill_holes(out)

    k2 = np.ones((3, 3), np.uint8)
    seeds = np.zeros((H, W), dtype=np.int32)
    seeds[~solid] = 1
    for lbl, m_src, base_a in ((2, m_hair_raw, 150), (3, m_skin_raw, 100), (7, m_cloth_raw, 150), (8, m_skirt_raw, 150)):
        er = cv2.erode(clean_islands(m_src, max(35, int(base_a * area_sc))).astype(np.uint8), k2) > 0
        seeds[er] = lbl
    seeds[~solid] = 1

    # Run Lab + Watershed strictly inside tight non-empty ROI (or upper head ROI when sharing body_donor)
    sys_solid, sxs_solid = np.where(solid)
    rx0, rx1 = max(0, int(sxs_solid.min()) - 8), min(W, int(sxs_solid.max()) + 9)
    ry0 = max(0, int(sys_solid.min()) - 8)
    if body_donor is not None:
        ry1 = min(H, max(ry0 + 16, collar_y + 24))
    else:
        ry1 = min(H, int(sys_solid.max()) + 9)

    lab_x0 = min(rx0, max(0, int(face[0][0] - face_h * 0.55)))
    lab_x1 = max(rx1, min(W, int(face[16][0] + face_h * 0.55)))
    lab_y0 = min(ry0, max(0, int(ey - face_h * 0.90)))
    lab_y1 = max(ry1, min(H, int(face[8][1] + face_h * 0.45)))
    lab = np.zeros((H, W, 3), dtype=np.float32)
    lab[lab_y0:lab_y1, lab_x0:lab_x1] = rgb2lab(rgb[lab_y0:lab_y1, lab_x0:lab_x1]).astype(np.float32)
    roi_lab = lab[ry0:ry1, rx0:rx1]
    grad_sq = np.zeros(roi_lab.shape[:2], dtype=np.float32)
    for ch, wt in ((0, 1.0), (1, 2.0), (2, 2.0)):
        gx = cv2.Sobel(roi_lab[:, :, ch], cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(roi_lab[:, :, ch], cv2.CV_32F, 0, 1, ksize=3)
        grad_sq += wt * (gx * gx + gy * gy)
    gray_roi = cv2.cvtColor(rgb[ry0:ry1, rx0:rx1], cv2.COLOR_RGB2GRAY).astype(np.float32)
    elevation = np.sqrt(grad_sq) + np.clip((90.0 - gray_roi) / 90.0, 0.0, 1.0) * 160.0

    snapped_roi = watershed(elevation, seeds[ry0:ry1, rx0:rx1], mask=solid[ry0:ry1, rx0:rx1])
    if body_donor is not None:
        d_m = body_donor["masks"]
        m_hair = d_m["hair"].copy()
        m_skin = d_m["skin"].copy()
        m_cloth = d_m["cloth"].copy()
        m_skirt = d_m["skirt"].copy()
        cut = collar_y - ry0
        for dst, lbl in ((m_hair, 2), (m_skin, 3), (m_cloth, 7), (m_skirt, 8)):
            dst[:collar_y, :] = False
            dst[ry0:collar_y, rx0:rx1] = (snapped_roi[:cut, :] == lbl)
    else:
        m_hair = np.zeros((H, W), dtype=bool)
        m_skin = np.zeros((H, W), dtype=bool)
        m_cloth = np.zeros((H, W), dtype=bool)
        m_skirt = np.zeros((H, W), dtype=bool)
        m_hair[ry0:ry1, rx0:rx1] = (snapped_roi == 2)
        m_skin[ry0:ry1, rx0:rx1] = (snapped_roi == 3)
        m_cloth[ry0:ry1, rx0:rx1] = (snapped_roi == 7)
        m_skirt[ry0:ry1, rx0:rx1] = (snapped_roi == 8)

    # Eye + Mouth cuts
    le_full, re_full, skin_lab = extract_anime_eyes_lab(solid, face, m_hair, lab)

    # Sample character's dark upper eyelash RGB for procedural blink creases
    eye_union = (le_full | re_full) & solid
    lash_hex = "#3a2220"
    if np.any(eye_union):
        eye_px = rgb[eye_union]
        eye_lum = np.mean(eye_px, axis=1)
        dark_px = eye_px[eye_lum <= np.percentile(eye_lum, 20)]
        if len(dark_px) > 0:
            med_l = np.median(dark_px, axis=0).astype(int)
            lash_hex = f"#{med_l[0]:02x}{med_l[1]:02x}{med_l[2]:02x}"

    fx0 = max(0, int(face[0][0] - face_h * 0.45))
    fx1 = min(W, int(face[16][0] + face_h * 0.45))
    fy0 = max(0, int(ey - face_h * 0.75))
    fy1 = min(H, int(face[8][1] + face_h * 0.25))
    sam_face = encode_sam_image(white_bg.crop((fx0, fy0, fx1, fy1)))
    m_c = (sum(face[i][0] for i in range(48, 68)) / 20.0, sum(face[i][1] for i in range(48, 68)) / 20.0)
    to_face = lambda pt: (pt[0] - fx0, pt[1] - fy0)
    m_crop, _ = decode_sam_mask(
        sam_face,
        [to_face(m_c), to_face(face[48]), to_face(face[54]),
         to_face(face[30]), to_face(face[8]), to_face((m_c[0] - face_h * 0.28, m_c[1])), to_face((m_c[0] + face_h * 0.28, m_c[1]))],
        [1, 1, 1, 0, 0, 0, 0], pick="smallest"
    )
    m_full = np.zeros((H, W), dtype=bool)
    m_full[fy0:fy1, fx0:fx1] = m_crop
    face_w = abs(face[14][0] - face[2][0])

    # Guard against SlimSAM grabbing a wide/chin-skin oval around tiny closed line mouths
    roi_d_skin = np.linalg.norm(lab[fy0:fy1, fx0:fx1] - skin_lab[None, None, :], axis=2)
    m_crop_clean = m_crop & solid[fy0:fy1, fx0:fx1] & (~m_hair[fy0:fy1, fx0:fx1])
    non_skin_ratio = float(np.mean(roi_d_skin[m_crop_clean] > 11.5)) if np.any(m_crop_clean) else 0.0
    m_xs = np.where(m_crop_clean)[1]
    too_wide = (len(m_xs) > 0 and (m_xs.max() - m_xs.min()) > face_w * 0.42)
    if (not np.any(m_crop_clean)) or non_skin_ratio < 0.40 or too_wide:
        m_poly = np.array([(int(round(face[i][0] - fx0)), int(round(face[i][1] - fy0))) for i in range(48, 60)])
        tmp_m = np.zeros((fy1 - fy0, fx1 - fx0), dtype=np.uint8)
        cv2.fillConvexPoly(tmp_m, m_poly, 255)
        band = cv2.dilate(tmp_m, np.ones((17, 17), np.uint8)) > 0
        line_mouth = band & (roi_d_skin > 11.5) & solid[fy0:fy1, fx0:fx1] & (~m_hair[fy0:fy1, fx0:fx1])
        m_full = np.zeros((H, W), dtype=bool)
        if np.sum(line_mouth) >= 12:
            m_full[fy0:fy1, fx0:fx1] = cv2.dilate(line_mouth.astype(np.uint8) * 255, np.ones((7, 7), np.uint8)) > 0
        else:
            m_full[fy0:fy1, fx0:fx1] = cv2.dilate(tmp_m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 7))) > 0
    m_full &= solid & (~m_hair)
    # Strip exterior peri-oral chin skin so mouth cutouts only carry lips, teeth, tongue, and interior
    # (flood-fill exterior skin touching the padded crop border across a Lab lip-outline barrier).
    if np.any(m_full):
        ys_m, xs_m = np.where(m_full)
        mx0, my0 = max(0, int(xs_m.min()) - 4), max(0, int(ys_m.min()) - 4)
        mx1, my1 = min(W, int(xs_m.max()) + 5), min(H, int(ys_m.max()) + 5)
        crop_lab = lab[my0:my1, mx0:mx1]
        ring = np.zeros(crop_lab.shape[:2], dtype=bool)
        ring[:2, :] = True
        ring[-2:, :] = True
        ring[:, :2] = True
        ring[:, -2:] = True
        ring_lab = np.median(crop_lab[ring], axis=0)
        lip_barrier = cv2.dilate((np.linalg.norm(crop_lab - ring_lab[None, None, :], axis=2) > 8.5).astype(np.uint8) * 255, np.ones((3, 3), np.uint8)) > 0
        _, comp_ext = cv2.connectedComponents((~lip_barrier).astype(np.uint8), connectivity=8)
        border_cids = list(set(np.unique(comp_ext[ring])) - {0})
        interior = ~np.isin(comp_ext, border_cids)
        interior &= ~ring
        if np.any(interior):
            num_m, comp_m, stats_m, _ = cv2.connectedComponentsWithStats(cv2.dilate(interior.astype(np.uint8), np.ones((5, 5), np.uint8)), connectivity=8)
            ch_m, cw_m = interior.shape
            if num_m > 1:
                best_cid = max(
                    range(1, num_m),
                    key=lambda c: stats_m[c, cv2.CC_STAT_AREA] - 20.0 * (((stats_m[c, 0] + stats_m[c, 2] * 0.5) - cw_m * 0.5) ** 2 + ((stats_m[c, 1] + stats_m[c, 3] * 0.5) - ch_m * 0.5) ** 2) ** 0.5,
                )
                interior &= (comp_m == best_cid)
            if np.any(interior):
                clean_full = np.zeros_like(m_full)
                clean_full[my0:my1, mx0:mx1] = interior
                m_full = clean_full & solid & (~m_hair)

    # Material medians: sample neutral un-shadowed lower-face/jaw/neck skin so forehead gloom
    # and intense cheek blush do not bleach/darken un-blushed chin skin during normalization.
    yy_skin = np.arange(H)[:, None]
    head_zone = m_skin & (yy_skin < waist_split_y) & (~le_full) & (~re_full) & (~m_full)
    neutral_skin = head_zone & (yy_skin >= ey) & (lab[:, :, 0] >= 72.0) & (lab[:, :, 1] <= 12.0)
    skin_sample_mask = neutral_skin if np.sum(neutral_skin) >= 120 else (head_zone if np.any(head_zone) else m_skin)
    masks_dict = {"hair": m_hair, "skin": m_skin, "cloth": m_cloth, "skirt": m_skirt}
    meds = {}
    for k, m in (("hair", m_hair), ("skin", skin_sample_mask), ("cloth", m_cloth), ("skirt", m_skirt)):
        if np.any(m):
            meds[k] = np.median(rgb[m], axis=0).astype(np.float32)

    # Skull/face interior mask so forehead skin underfill stays strictly inside the head contour
    face_pts = np.array([(int(round(face[i][0])), int(round(face[i][1]))) for i in range(27)], dtype=np.int32)
    skull_u8 = np.zeros((H, W), dtype=np.uint8)
    hull = cv2.convexHull(face_pts)
    cv2.fillConvexPoly(skull_u8, hull, 255)
    ex = (face[36][0] + face[45][0]) * 0.5
    skull_cx, skull_cy = int(round(ex)), int(round(ey - face_h * 0.18))
    cv2.ellipse(skull_u8, (skull_cx, skull_cy), (int(round(face_w * 0.52)), int(round(face_h * 0.62))), 0, 0, 360, 255, -1)
    skull_mask = (skull_u8 > 0) & solid

    # Leg skin separation (thigh components below waist not touching left/right wrist keypoints)
    wrist_pts = [body[9], body[10]]
    hand_r = max(18.0, torso_h * 0.14)
    m_legs = np.zeros_like(m_skin)
    num_s, comp_s, stats_s, _ = cv2.connectedComponentsWithStats(m_skin.astype(np.uint8), connectivity=8)
    for cid in range(1, num_s):
        top_y = stats_s[cid, cv2.CC_STAT_TOP]
        if top_y <= waist_split_y + int(torso_h * 0.15):
            continue
        c_mask = (comp_s == cid)
        has_wrist = False
        for wx_w, wy_w in wrist_pts:
            if wx_w > 0 and wy_w > 0:
                yi, xi = np.where(c_mask)
                if np.min((xi - wx_w) ** 2 + (yi - wy_w) ** 2) <= hand_r * hand_r:
                    has_wrist = True
                    break
        if not has_wrist:
            m_legs |= c_mask

    # Isolate Head+Neck skin component (moves with neck pivot) vs Torso skin (bare shoulders/arms/hands, locked to upper_clothes)
    nx_f, ny_f = int(np.clip(round(face[30][0]), 0, W - 1)), int(np.clip(round(face[30][1]), 0, H - 1))
    head_cid = int(comp_s[ny_f, nx_f])
    m_head_skin = np.zeros_like(m_skin)
    if head_cid > 0:
        m_head_skin = (comp_s == head_cid)
    else:
        for cid in range(1, num_s):
            if stats_s[cid, cv2.CC_STAT_TOP] < sh_y:
                m_head_skin |= (comp_s == cid)
    # If sleeveless/V-neck blends head skin straight into bare chest, cut cleanly at lower neck below chin
    collar_cut = int(round(face[8][1] + face_h * 0.48))
    if np.any(m_head_skin & (np.arange(H)[:, None] > collar_cut + int(face_h * 0.25))):
        m_head_skin &= (np.arange(H)[:, None] <= collar_cut)

    sh_cx = (body[5][0] + body[6][0]) * 0.5
    waist_cx = (body[11][0] + body[12][0]) * 0.5
    hair_split_y = int(round(sh_y + torso_h * 0.06))
    ys_hair_all = np.where(m_hair)[0]
    hair_bottom_y = int(np.max(ys_hair_all)) if len(ys_hair_all) else hair_split_y
    pivots = {
        "waist": [round(float(waist_cx), 1), round(float(waist_split_y), 1)],
        "neck": [round(float((face[8][0] + sh_cx) * 0.5), 1), round(float((face[8][1] + sh_y) * 0.5), 1)],
        "head": [round(float(ex), 1), round(float(max(12.0, ey - face_h * 0.82)), 1)],
        "hairSplit": float(hair_split_y),
        "hairBottom": float(hair_bottom_y),
    }

    return {
        "rgba": rgba, "solid": solid, "face": face,
        "masks": masks_dict, "meds": meds, "skull_mask": skull_mask, "m_legs": m_legs, "m_head_skin": m_head_skin,
        "sh_y": sh_y, "hair_split_y": hair_split_y, "torso_h": torso_h, "waist_split_y": waist_split_y, "pivots": pivots,
        "le_full": le_full, "re_full": re_full, "m_full": m_full, "lash_hex": lash_hex,
    }


class LayerQuadtreeStore:
    """RDO 64->32->16 quadtree deduplicator with 2px gradient skirt for a single semantic layer."""
    def __init__(self, layer_id, W, H, max_block=64, min_block=16, overlap=2):
        self.layer_id = layer_id
        self.W, self.H = W, H
        self.max_block = max_block
        self.min_block = min_block
        self.overlap = overlap
        self.gw = ((W + max_block - 1) // max_block) * max_block
        self.gh = ((H + max_block - 1) // max_block) * max_block
        self.unique_tiles = []
        self.exact_map = {64: {}, 32: {}, 16: {}}
        self.slot_cands = {64: {}, 32: {}, 16: {}}
        self.ref_subs = {32: {}, 16: {}}

    def _pad_layer(self, arr):
        ov = self.overlap
        return np.pad(arr, ((ov, self.gh - self.H + ov), (ov, self.gw - self.W + ov), (0, 0)), mode="constant", constant_values=0)

    def _get_patch(self, padded, x, y, sz):
        return padded[y:y + sz + self.overlap * 2, x:x + sz + self.overlap * 2]

    def _core_alpha_max(self, padded, x, y, sz):
        ov = self.overlap
        return int(np.max(padded[y + ov:y + ov + sz, x + ov:x + ov + sz, 3]))

    def _register_tile(self, sz, x, y, tile):
        h_key = hashlib.md5(tile.tobytes()).digest()
        if h_key in self.exact_map[sz]:
            return self.exact_map[sz][h_key]
        tid = len(self.unique_tiles)
        self.unique_tiles.append({"layer": self.layer_id, "stride": sz, "tile": tile})
        self.exact_map[sz][h_key] = tid
        self.slot_cands[sz].setdefault((x, y), []).append(tid)
        return tid

    def _match_existing(self, sz, x, y, tile):
        h_key = hashlib.md5(tile.tobytes()).digest()
        if h_key in self.exact_map[sz]:
            return self.exact_map[sz][h_key], "stored"
        for tid in self.slot_cands[sz].get((x, y), []):
            cand = self.unique_tiles[tid]["tile"]
            diff = np.abs(tile.astype(np.int16) - cand.astype(np.int16))
            if np.mean(diff) <= 4.5 and np.percentile(diff, 98) <= 22 and np.mean(diff[:, :, 3]) <= 5.0:
                return tid, "stored"
        if sz in self.ref_subs and (x, y) in self.ref_subs[sz]:
            rt = self.ref_subs[sz][(x, y)]
            diff = np.abs(tile.astype(np.int16) - rt.astype(np.int16))
            if np.mean(diff) <= 4.5 and np.percentile(diff, 98) <= 22 and np.mean(diff[:, :, 3]) <= 5.0:
                return (sz, x, y), "ref_virtual"
        return None, None

    def _resolve_subtree(self, padded, x, y, sz, is_ref):
        if self._core_alpha_max(padded, x, y, sz) < 5:
            return [], 0, 0
        tile = self._get_patch(padded, x, y, sz)
        if is_ref:
            return [{"x": x, "y": y, "size": sz, "reused": 0, "tile": tile}], 0, sz * sz

        matched, mtype = self._match_existing(sz, x, y, tile)
        if matched is not None:
            if mtype == "ref_virtual":
                msz, rx, ry = matched
                tid = self._register_tile(msz, rx, ry, self.ref_subs[msz].pop((rx, ry)))
                return [{"x": x, "y": y, "size": sz, "reused": 1, "tid": tid}], sz * sz, sz * sz
            return [{"x": x, "y": y, "size": sz, "reused": 1, "tid": matched}], sz * sz, sz * sz

        if sz > self.min_block:
            half = sz // 2
            c_leaves, c_reused, c_total = [], 0, 0
            for qx, qy in ((x, y), (x + half, y), (x, y + half), (x + half, y + half)):
                lvs, rpx, tpx = self._resolve_subtree(padded, qx, qy, half, False)
                c_leaves.extend(lvs)
                c_reused += rpx
                c_total += tpx
            if c_total == 0 or (c_reused / c_total) < 0.25:
                return [{"x": x, "y": y, "size": sz, "reused": 0, "tile": tile}], 0, sz * sz
            return c_leaves, c_reused, c_total

        return [{"x": x, "y": y, "size": sz, "reused": 0, "tile": tile}], 0, sz * sz

    def add_frame(self, layer_rgba, is_ref):
        padded = self._pad_layer(layer_rgba)
        if is_ref:
            for sz in (32, 16):
                for ry in range(0, self.gh, sz):
                    for rx in range(0, self.gw, sz):
                        if self._core_alpha_max(padded, rx, ry, sz) >= 5:
                            self.ref_subs[sz][(rx, ry)] = self._get_patch(padded, rx, ry, sz)

        committed = []
        reused_px, total_px = 0, 0
        for y in range(0, self.gh, self.max_block):
            for x in range(0, self.gw, self.max_block):
                lvs, rpx, tpx = self._resolve_subtree(padded, x, y, self.max_block, is_ref)
                for lf in lvs:
                    tid = lf["tid"] if "tid" in lf else self._register_tile(lf["size"], lf["x"], lf["y"], lf["tile"])
                    committed.append((lf["x"], lf["y"], lf["size"], tid, lf["reused"]))
                    total_px += lf["size"] * lf["size"]
                    if lf["reused"]:
                        reused_px += lf["size"] * lf["size"]
        return committed, reused_px, total_px


def cluster_outfit_frames(pngs, W, H):
    """Group frames sharing body poses below neck so largest cluster anchors the quadtree and shares body masks."""
    ycut = int(H * 0.32)
    cache = {}
    for p in pngs:
        im = Image.open(p).convert("RGBA")
        if im.size != (W, H):
            im = im.resize((W, H), Image.LANCZOS)
        arr = np.array(im)[ycut:]
        cache[p] = (arr[:, :, :3].astype(np.int16), arr[:, :, 3] > 128)

    clusters = []
    assigned = set()
    # Prefer neutral/smiling/open-eye frames as cluster seeds
    seed_order = sorted(
        pngs,
        key=lambda p: (
            "eyesclosed" in os.path.basename(p).lower(),
            "neutral" not in os.path.basename(p).lower(),
            "smiling" not in os.path.basename(p).lower(),
            p,
        ),
    )
    for p1 in seed_order:
        if p1 in assigned:
            continue
        rgb1, a1 = cache[p1]
        group = [p1]
        assigned.add(p1)
        for p2 in pngs:
            if p2 in assigned:
                continue
            rgb2, a2 = cache[p2]
            inter = int(np.sum(a1 & a2))
            union = int(np.sum(a1 | a2))
            if union == 0 or (inter / union) < 0.994:
                continue
            diff = np.abs(rgb1[a1 & a2] - rgb2[a1 & a2])
            if np.mean(diff) <= 4.8 and np.percentile(diff, 95) <= 18.0:
                group.append(p2)
                assigned.add(p2)
        clusters.append(group)

    # Sort largest cluster first so quadtree Root Reference captures the majority pose
    clusters.sort(key=lambda g: -len(g))
    ordered = []
    donor_map = {}  # frame_path -> leader_path (or None if leader)
    for g in clusters:
        leader = g[0]
        for idx_g, p in enumerate(g):
            ordered.append(p)
            donor_map[p] = None if idx_g == 0 else leader
    return ordered, donor_map, clusters


_PIPELINE_SIG = None


def _pipeline_signature():
    global _PIPELINE_SIG
    if _PIPELINE_SIG is None:
        src = inspect.getsource(extract_anime_eyes_lab) + inspect.getsource(decompose_frame)
        _PIPELINE_SIG = hashlib.sha256(src.encode("utf-8")).hexdigest()[:16]
    return _PIPELINE_SIG


def _file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _frame_cache_path(png_path, W, H, donor_path=None):
    key_parts = [_file_sha256(png_path), str(W), str(H), _pipeline_signature()]
    if donor_path:
        key_parts.append(_file_sha256(donor_path))
    key = hashlib.sha256("|".join(key_parts).encode("utf-8")).hexdigest()[:24]
    os.makedirs(FRAME_CACHE_DIR, exist_ok=True)
    return os.path.join(FRAME_CACHE_DIR, f"{key}.npz")


def _save_frame_cache(cache_path, dec):
    meta = {
        "face": [[float(pt[0]), float(pt[1])] for pt in dec["face"]],
        "meds": {k: [float(v[0]), float(v[1]), float(v[2])] for k, v in dec["meds"].items()},
        "sh_y": float(dec["sh_y"]),
        "hair_split_y": int(dec["hair_split_y"]),
        "torso_h": float(dec["torso_h"]),
        "waist_split_y": int(dec["waist_split_y"]),
        "pivots": dec["pivots"],
        "lash_hex": dec["lash_hex"],
    }
    tmp = f"{cache_path}.{os.getpid()}.tmp.npz"
    np.savez_compressed(
        tmp,
        meta_json=np.array(json.dumps(meta, separators=(",", ":"))),
        m_hair=np.packbits(dec["masks"]["hair"].astype(np.uint8)),
        m_skin=np.packbits(dec["masks"]["skin"].astype(np.uint8)),
        m_cloth=np.packbits(dec["masks"]["cloth"].astype(np.uint8)),
        m_skirt=np.packbits(dec["masks"]["skirt"].astype(np.uint8)),
        skull_mask=np.packbits(dec["skull_mask"].astype(np.uint8)),
        m_legs=np.packbits(dec["m_legs"].astype(np.uint8)),
        m_head_skin=np.packbits(dec["m_head_skin"].astype(np.uint8)),
        le_full=np.packbits(dec["le_full"].astype(np.uint8)),
        re_full=np.packbits(dec["re_full"].astype(np.uint8)),
        m_full=np.packbits(dec["m_full"].astype(np.uint8)),
    )
    os.replace(tmp, cache_path)


def _unpack_bool(packed, H, W):
    return np.unpackbits(packed)[: H * W].reshape((H, W)).astype(bool)


def _load_donor_masks_from_cache(cache_path, H, W):
    with np.load(cache_path, allow_pickle=False) as d:
        return {
            "hair": _unpack_bool(d["m_hair"], H, W),
            "skin": _unpack_bool(d["m_skin"], H, W),
            "cloth": _unpack_bool(d["m_cloth"], H, W),
            "skirt": _unpack_bool(d["m_skirt"], H, W),
        }


def _load_frame_cache(cache_path, png_path, W, H):
    im = Image.open(png_path).convert("RGBA")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    rgba = np.array(im)
    solid = rgba[:, :, 3] > 40
    with np.load(cache_path, allow_pickle=False) as d:
        meta = json.loads(str(d["meta_json"]))
        masks = {
            "hair": _unpack_bool(d["m_hair"], H, W),
            "skin": _unpack_bool(d["m_skin"], H, W),
            "cloth": _unpack_bool(d["m_cloth"], H, W),
            "skirt": _unpack_bool(d["m_skirt"], H, W),
        }
        return {
            "rgba": rgba,
            "solid": solid,
            "face": [tuple(pt) for pt in meta["face"]],
            "masks": masks,
            "meds": {k: np.array(v, dtype=np.float32) for k, v in meta["meds"].items()},
            "skull_mask": _unpack_bool(d["skull_mask"], H, W),
            "m_legs": _unpack_bool(d["m_legs"], H, W),
            "m_head_skin": _unpack_bool(d["m_head_skin"], H, W),
            "sh_y": meta["sh_y"],
            "hair_split_y": meta["hair_split_y"],
            "torso_h": meta["torso_h"],
            "waist_split_y": meta["waist_split_y"],
            "pivots": meta["pivots"],
            "le_full": _unpack_bool(d["le_full"], H, W),
            "re_full": _unpack_bool(d["re_full"], H, W),
            "m_full": _unpack_bool(d["m_full"], H, W),
            "lash_hex": meta["lash_hex"],
        }


def _decompose_worker(task):
    png_path, W, H, donor_cache_path, donor_masks, cache_path, use_cache = task
    if use_cache and cache_path and os.path.isfile(cache_path):
        return (png_path, cache_path, True, None)
    donor_arg = None
    if donor_masks is not None:
        donor_arg = {"masks": donor_masks}
    elif donor_cache_path and os.path.isfile(donor_cache_path):
        donor_arg = {"masks": _load_donor_masks_from_cache(donor_cache_path, H, W)}

    im = Image.open(png_path).convert("RGBA")
    dec = decompose_frame(im, W, H, body_donor=donor_arg)
    if use_cache and cache_path:
        _save_frame_cache(cache_path, dec)
        return (png_path, cache_path, False, None)
    return (png_path, None, False, dec)


def build_semantic_block_atlas(char_name, char_dir, out_dir, install_vnsprite=False, pool=None, use_cache=True):
    t_build_start = time.perf_counter()
    os.makedirs(out_dir, exist_ok=True)
    pngs = sorted([
        p for p in glob.glob(os.path.join(char_dir, "*.png"))
        if not os.path.basename(p).startswith(("base_", "expressions_", "blocks_"))
    ])
    if not pngs:
        raise FileNotFoundError(f"No mood PNGs found in {char_dir}")

    neutral_list = [p for p in pngs if "neutral" in os.path.basename(p).lower()]
    if not neutral_list:
        neutral_list = [p for p in pngs if "eyesclosed" not in os.path.basename(p).lower()]
    palette_ref_path = neutral_list[0] if neutral_list else pngs[0]

    ref_im = Image.open(palette_ref_path).convert("RGBA")
    W, H = ref_im.size
    sc_len = max(0.65, H / 1500.0)
    ordered, donor_map, clusters = cluster_outfit_frames(pngs, W, H)
    print(f"[{char_name}] {len(pngs)} frames -> {len(clusters)} pose clusters (largest={len(clusters[0])}, base={os.path.basename(ordered[0])})")

    stores = {lid: LayerQuadtreeStore(lid, W, H, max_block=64, min_block=16, overlap=2) for lid in BODY_LAYERS}

    # Phase 1 & 2: Decompose leaders then followers (cached & parallelized across workers)
    frame_cache_paths = {p: _frame_cache_path(p, W, H, donor_map.get(p)) if use_cache else None for p in ordered}
    dec_mem = {}
    dec_donor_masks = {}
    cache_hits = 0

    def run_tasks(tasks):
        nonlocal cache_hits
        if not tasks:
            return
        pending = []
        for t in tasks:
            p_t, _, _, _, _, c_t, uc_t = t
            if uc_t and c_t and os.path.isfile(c_t):
                cache_hits += 1
                frame_cache_paths[p_t] = c_t
            else:
                pending.append(t)
        if not pending:
            return
        active_pool = pool() if callable(pool) else pool
        results = list(active_pool.map(_decompose_worker, pending)) if (active_pool is not None and len(pending) > 1) else [_decompose_worker(t) for t in pending]
        for p_res, c_res, hit, dec_res in results:
            if hit:
                cache_hits += 1
            if c_res:
                frame_cache_paths[p_res] = c_res
            if dec_res is not None:
                dec_mem[p_res] = dec_res

    leaders = [p for p in ordered if donor_map.get(p) is None]
    leader_tasks = [(p, W, H, None, None, frame_cache_paths[p], use_cache) for p in leaders]
    run_tasks(leader_tasks)

    if not use_cache:
        for lp in leaders:
            if lp in dec_mem:
                dec_donor_masks[lp] = dec_mem[lp]["masks"]

    followers = [p for p in ordered if donor_map.get(p) is not None]
    follower_tasks = [
        (
            p,
            W,
            H,
            frame_cache_paths.get(donor_map[p]),
            None if use_cache else dec_donor_masks.get(donor_map[p]),
            frame_cache_paths[p],
            use_cache,
        )
        for p in followers
    ]
    run_tasks(follower_tasks)

    def get_dec(p):
        if p in dec_mem:
            return dec_mem[p]
        return _load_frame_cache(frame_cache_paths[p], p, W, H)

    organ_bank = {}  # hash -> {"img": rgba, "w": w, "h": h}
    organ_list = []
    frame_records = {}
    palette_dec = get_dec(palette_ref_path)
    ref_meds = palette_dec["meds"]
    lash_color = palette_dec["lash_hex"]

    def extract_organ(mask_bool, src_rgba, solid):
        ys, xs = np.where(mask_bool & solid)
        if len(xs) == 0:
            return None
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
        loc = mask_bool[y0:y1, x0:x1]
        soft = cv2.GaussianBlur(loc.astype(np.uint8) * 255, (3, 3), 0.85)
        cut = src_rgba[y0:y1, x0:x1].copy()
        cut[:, :, 3] = np.minimum(cut[:, :, 3], soft)
        h_key = hashlib.md5(cut.tobytes()).digest()
        if h_key not in organ_bank:
            oid = len(organ_list)
            organ_bank[h_key] = oid
            organ_list.append(cut)
        else:
            oid = organ_bank[h_key]
        return {"oid": oid, "stage": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "cx": (x0 + x1) * 0.5, "cy": (y0 + y1) * 0.5}}

    for idx_f, p in enumerate(ordered):
        mood = os.path.splitext(os.path.basename(p))[0]
        dec = palette_dec if p == palette_ref_path else get_dec(p)

        if p == palette_ref_path:
            norm_rgb = dec["rgba"][:, :, :3]
        else:
            norm_rgb = normalize_by_semantic_masks(dec["rgba"][:, :, :3], dec["solid"], dec["masks"], dec["meds"], ref_meds)

        alpha = dec["rgba"][:, :, 3]
        solid = dec["solid"]
        norm_rgba = np.dstack([norm_rgb, alpha])

        le_full, re_full, m_full = dec["le_full"], dec["re_full"], dec["m_full"]
        socket_union = (le_full | re_full | m_full) & solid
        skin_inpainted = norm_rgb.copy()
        if np.any(socket_union):
            sys_s, sxs_s = np.where(socket_union)
            iy0, iy1 = max(0, int(sys_s.min()) - 20), min(H, int(sys_s.max()) + 21)
            ix0, ix1 = max(0, int(sxs_s.min()) - 20), min(W, int(sxs_s.max()) + 21)
            inpaint_roi = cv2.dilate(socket_union[iy0:iy1, ix0:ix1].astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
            skin_inpainted[iy0:iy1, ix0:ix1] = cv2.inpaint(norm_rgb[iy0:iy1, ix0:ix1], inpaint_roi, inpaintRadius=6, flags=cv2.INPAINT_TELEA)

        m_hair = dec["masks"]["hair"]
        m_cloth = dec["masks"]["cloth"]
        m_skirt = dec["masks"]["skirt"]
        m_legs = dec["m_legs"]
        m_head_skin = dec["m_head_skin"] | socket_union
        m_body_skin = dec["masks"]["skin"] & (~m_legs) & (~dec["m_head_skin"])
        m_torso_upper = m_cloth | m_body_skin
        m_lower_core = m_skirt | m_legs

        yy_grid = np.arange(H)[:, None]
        hair_split_y = dec.get("hair_split_y") or int(round(dec["sh_y"] + dec["torso_h"] * 0.06))
        m_front_hair = m_hair & (yy_grid <= hair_split_y)
        m_back_core = m_hair & (~m_front_hair)

        # Constrained Voronoi seam underfills scaled proportionally by image height
        r_skirt = max(6, int(round(10 * sc_len)))
        r_skin = max(7, int(round(12 * sc_len)))
        r_cloth = max(6, int(round(10 * sc_len)))
        r_bhair = max(8, int(round(14 * sc_len)))

        skirt_allow = solid & m_torso_upper & (yy_grid >= dec["waist_split_y"] - int(round(20 * sc_len))) & (cv2.dilate(m_skirt.astype(np.uint8), np.ones((21, 21), np.uint8)) > 0)
        skin_contact_hair = solid & m_front_hair & (cv2.dilate(m_head_skin.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0)
        skin_allow = solid & ((m_hair & dec["skull_mask"]) | skin_contact_hair | m_torso_upper)
        # Strict foreground underfill rule: upper_clothes sits BEHIND front_hair, ON TOP of back_hair.
        # Only extend upper_clothes under front_hair, never outward on top of back_hair.
        cloth_allow = solid & m_front_hair

        if np.any(m_back_core):
            back_allow = m_hair | (solid & (m_torso_upper | m_head_skin))
            back_hair_rgba = extend_layer_into(norm_rgb, alpha, m_back_core, back_allow, radius_px=r_bhair)
        else:
            back_hair_rgba = np.zeros((H, W, 4), dtype=np.uint8)

        front_hair_rgba = np.zeros((H, W, 4), dtype=np.uint8)
        fh_loc = m_front_hair & solid
        front_hair_rgba[fh_loc] = norm_rgba[fh_loc]

        layer_canvases = {
            "back_hair": back_hair_rgba,
            "lower_body": extend_layer_into(norm_rgb, alpha, m_lower_core, skirt_allow, radius_px=r_skirt),
            "skin_canvas": extend_layer_into(skin_inpainted, alpha, m_head_skin, skin_allow, radius_px=r_skin),
            "upper_clothes": extend_layer_into(norm_rgb, alpha, m_torso_upper, cloth_allow, radius_px=r_cloth),
            "front_hair": front_hair_rgba,
        }

        is_ref = (idx_f == 0)
        layer_commits = {}
        f_reused_px, f_total_px = 0, 0
        c64 = c32 = c16 = 0
        for lid in BODY_LAYERS:
            comm, rpx, tpx = stores[lid].add_frame(layer_canvases[lid], is_ref)
            layer_commits[lid] = comm
            f_reused_px += rpx
            f_total_px += tpx
            for _, _, sz, _, _ in comm:
                if sz == 64: c64 += 1
                elif sz == 32: c32 += 1
                else: c16 += 1

        le_spec = extract_organ(le_full, norm_rgba, solid)
        re_spec = extract_organ(re_full, norm_rgba, solid)
        m_spec = extract_organ(m_full, norm_rgba, solid)
        eye_ang = 0.0
        if le_spec and re_spec:
            eye_ang = round(math.degrees(math.atan2(re_spec["stage"]["cy"] - le_spec["stage"]["cy"], re_spec["stage"]["cx"] - le_spec["stage"]["cx"])), 2)

        rpct = round(f_reused_px / f_total_px * 100.0, 1) if f_total_px else 0.0
        print(f"  [{char_name}] {mood:34s} | 64:{c64:3d} 32:{c32:3d} 16:{c16:3d} | reuse={rpct:5.1f}%")
        frame_records[mood] = {
            "eyeAngleDeg": eye_ang,
            "pivots": dec["pivots"],
            "layerCommits": layer_commits,
            "organs": {"left_eye": le_spec, "right_eye": re_spec, "mouth": m_spec},
            "stats": {"c64": c64, "c32": c32, "c16": c16, "reusedPct": rpct, "reusedPx": f_reused_px, "totalPx": f_total_px},
        }
        gc.collect()

    # Pack all Quadtree Tiles across all 4 layers + Tight Facial Organs into a single WebP atlas
    overlap = 2
    all_tiles = []
    for lid in BODY_LAYERS:
        for i, t in enumerate(stores[lid].unique_tiles):
            all_tiles.append((lid, i, t["stride"], t["tile"]))

    tile_area = sum(t[3].shape[0] * t[3].shape[1] for t in all_tiles)
    organ_area = sum(o.shape[0] * o.shape[1] for o in organ_list)
    atlas_W = max(1024, int(math.ceil(math.sqrt((tile_area + organ_area) * 1.15) / 64.0) * 64))

    tile_coords = {}
    cx, cy, shelf_h = 0, 0, 0
    for lid, local_id, sz, tile_arr in sorted(all_tiles, key=lambda item: -item[2]):
        dim = sz + overlap * 2
        if cx + dim > atlas_W:
            cx = 0; cy += shelf_h; shelf_h = 0
        tile_coords[(lid, local_id)] = (cx, cy)
        cx += dim; shelf_h = max(shelf_h, dim)

    if cx > 0:
        cx = 0; cy += shelf_h + 4; shelf_h = 0
    organ_coords = {}
    for oid, o_arr in sorted(enumerate(organ_list), key=lambda it: -it[1].shape[0]):
        oh, ow = o_arr.shape[:2]
        if cx + ow + 2 > atlas_W:
            cx = 0; cy += shelf_h + 2; shelf_h = 0
        organ_coords[oid] = (cx, cy, ow, oh)
        cx += ow + 2; shelf_h = max(shelf_h, oh)

    atlas_H = cy + shelf_h + 2
    atlas_arr = np.zeros((atlas_H, atlas_W, 4), dtype=np.uint8)
    for lid, local_id, sz, tile_arr in all_tiles:
        ax, ay = tile_coords[(lid, local_id)]
        dim = sz + overlap * 2
        atlas_arr[ay:ay + dim, ax:ax + dim] = tile_arr
    for oid, o_arr in enumerate(organ_list):
        ax, ay, ow, oh = organ_coords[oid]
        atlas_arr[ay:ay + oh, ax:ax + ow] = o_arr

    atlas_path = os.path.join(out_dir, "blocks_atlas.webp")
    Image.fromarray(atlas_arr).save(atlas_path, "WEBP", quality=92, method=4)
    atlas_kb = round(os.path.getsize(atlas_path) / 1024.0, 1)

    frames_out = {}
    total_reused_px, total_all_px = 0, 0
    for mood, rec in sorted(frame_records.items()):
        total_reused_px += rec["stats"]["reusedPx"]
        total_all_px += rec["stats"]["totalPx"]
        layer_blocks = {}
        for lid in BODY_LAYERS:
            layer_blocks[lid] = [
                [dx, dy, sz, tile_coords[(lid, tid)][0], tile_coords[(lid, tid)][1], rflag]
                for (dx, dy, sz, tid, rflag) in rec["layerCommits"][lid]
            ]
        organs_out = {}
        for ok, spec in rec["organs"].items():
            if spec is None:
                organs_out[ok] = None
            else:
                ax, ay, ow, oh = organ_coords[spec["oid"]]
                organs_out[ok] = {"atlas": {"x": ax, "y": ay, "w": ow, "h": oh}, "stage": spec["stage"]}
        frames_out[mood] = {
            "eyeAngleDeg": rec["eyeAngleDeg"],
            "pivots": rec["pivots"],
            "layerBlocks": layer_blocks,
            "organs": organs_out,
            "stats": rec["stats"],
        }

    overall_reuse = round(total_reused_px / total_all_px * 100.0, 1) if total_all_px else 0.0
    manifest = {
        "character": char_name,
        "format": "semantic-quadtree-atlas-v2",
        "width": W, "height": H, "overlap": overlap,
        "lashColor": lash_color,
        "atlas": {
            "file": "blocks_atlas.webp",
            "width": atlas_W, "height": atlas_H, "kb": atlas_kb,
            "uniqueTiles": len(all_tiles), "uniqueOrgans": len(organ_list),
        },
        "stats": {"reusedPxPct": overall_reuse, "frameCount": len(frames_out)},
        "frames": frames_out,
    }
    with open(os.path.join(out_dir, "character.manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"))

    with open(atlas_path, "rb") as f:
        atlas_b64 = base64.b64encode(f.read()).decode("ascii")
    html = build_semantic_block_preview_html(char_name, manifest, atlas_b64)
    preview_path = os.path.join(out_dir, "preview.html")
    with open(preview_path, "w", encoding="utf-8") as f:
        f.write(html)

    inferred_outfit = os.path.basename(os.path.normpath(char_dir)) or "Casual"
    vnsprite_path = pack_vnsprite(out_dir, outfit_name=inferred_outfit)
    if install_vnsprite:
        install_target = os.path.join(os.path.dirname(os.path.normpath(char_dir)), f"{inferred_outfit}.vnsprite")
        pack_vnsprite(out_dir, outfit_name=inferred_outfit, output_path=install_target)
        print(f"Installed bundle -> {install_target}")

    t_total = time.perf_counter() - t_build_start
    raw_total_kb = sum(os.path.getsize(p) for p in ordered) / 1024.0
    vnsprite_kb = os.path.getsize(vnsprite_path) / 1024.0
    print(f"\n=== {char_name} Unified Semantic Quadtree Atlas Summary ({t_total:.1f}s | cache hits: {cache_hits}/{len(ordered)}) ===")
    print(f"Frames: {len(ordered)} | Raw PNGs: {raw_total_kb:,.1f} KB -> Unified WebP Atlas: {atlas_kb:,.1f} KB ({atlas_W}x{atlas_H})")
    print(f"Unique Tiles: {len(all_tiles)} | Unique Facial Organs: {len(organ_list)} | Overall Pixel Reuse: {overall_reuse:.1f}%")
    print(f"Bundle: {vnsprite_path} ({vnsprite_kb:,.1f} KB) | Preview: {preview_path}\n")
    gc.collect()
    return manifest


VNSPRITE_MAGIC = b"VNSR"
VNSPRITE_VERSION = 1


def pack_vnsprite(out_dir: str, outfit_name: str = "Casual", output_path: str | None = None) -> str:
    """Pack character.manifest.json + blocks_atlas.webp into a single binary .vnsprite container.

    Binary layout (little-endian):
      [0..3]   4B   Magic "VNSR"
      [4..5]   u16  Format version (1)
      [6..7]   u16  Flags (0 = WebP embedded atlas)
      [8..11]  u32  Byte length of UTF-8 JSON manifest
      [12..]        UTF-8 manifest JSON bytes
      [..]          Raw WebP atlas bytes
    """
    manifest_path = os.path.join(out_dir, "character.manifest.json")
    atlas_path = os.path.join(out_dir, "blocks_atlas.webp")
    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(f"Missing manifest: {manifest_path}")
    if not os.path.isfile(atlas_path):
        raise FileNotFoundError(f"Missing atlas: {atlas_path}")

    with open(manifest_path, "rb") as f:
        json_bytes = f.read()
    with open(atlas_path, "rb") as f:
        atlas_bytes = f.read()

    # Validate JSON parses cleanly before packing
    manifest = json.loads(json_bytes.decode("utf-8"))
    if "outfit" not in manifest and outfit_name:
        manifest["outfit"] = outfit_name
        json_bytes = json.dumps(manifest, separators=(",", ":")).encode("utf-8")

    safe_name = outfit_name or manifest.get("outfit") or "Casual"
    target = output_path or os.path.join(out_dir, f"{safe_name}.vnsprite")
    header = VNSPRITE_MAGIC + struct.pack("<HHI", VNSPRITE_VERSION, 0, len(json_bytes))
    with open(target, "wb") as f:
        f.write(header)
        f.write(json_bytes)
        f.write(atlas_bytes)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Semantic Quadtree Block Atlas for one or more character outfits.")
    parser.add_argument("chars", nargs="*", help="Preset character names (akane, rin, sakura) or omit with --all")
    parser.add_argument("--dir", help="Custom input outfit folder containing mood PNGs")
    parser.add_argument("--out", help="Custom output directory")
    parser.add_argument("--name", help="Custom character name for manifest/preview")
    parser.add_argument("--outfit", default="Casual", help="Outfit name for .vnsprite output (default: Casual)")
    parser.add_argument("--pack-only", action="store_true", help="Pack existing manifest+atlas outputs into .vnsprite without rebuilding")
    parser.add_argument("--install", action="store_true", help="Also copy generated <Outfit>.vnsprite alongside the input outfit folder")
    parser.add_argument("--workers", type=int, default=0, help="Parallel ONNX worker processes (0=auto up to 4)")
    parser.add_argument("--no-cache", action="store_true", help="Disable per-frame decomposition cache")
    parser.add_argument("--all", action="store_true", help="Discover and build every <Char>/<Outfit> under assets/game-assets/characters/")
    args = parser.parse_args()

    targets = {
        "akane": ("Akane", r"assets/game-assets/characters/Akane/Casual", r"dist/sprite-experiment/unified_akane"),
        "rin": ("Rin", r"assets/game-assets/characters/Rin/Casual", r"dist/sprite-experiment/unified_rin"),
        "sakura": ("Sakura", r"assets/game-assets/characters/Sakura/Casual", r"dist/sprite-experiment/unified_sakura"),
    }

    if args.pack_only:
        if args.out:
            p = pack_vnsprite(args.out, outfit_name=args.outfit)
            print(f"Packed {p} ({os.path.getsize(p) / 1024.0:,.1f} KB)")
            if args.install and args.dir:
                install_target = os.path.join(os.path.dirname(os.path.normpath(args.dir)), f"{args.outfit}.vnsprite")
                pack_vnsprite(args.out, outfit_name=args.outfit, output_path=install_target)
                print(f"Installed -> {install_target}")
        else:
            req = [a.lower() for a in args.chars] or list(targets.keys())
            for key in req:
                if key in targets:
                    _, src_d, out_d = targets[key]
                    outfit = os.path.basename(os.path.normpath(src_d)) or args.outfit
                    p = pack_vnsprite(out_d, outfit_name=outfit)
                    print(f"Packed {key}: {p} ({os.path.getsize(p) / 1024.0:,.1f} KB)")
                    if args.install:
                        install_target = os.path.join(os.path.dirname(os.path.normpath(src_d)), f"{outfit}.vnsprite")
                        pack_vnsprite(out_d, outfit_name=outfit, output_path=install_target)
                        print(f"Installed {key} -> {install_target}")
    else:
        cpu_cnt = os.cpu_count() or 4
        workers = args.workers if args.workers > 0 else min(4, max(1, cpu_cnt // 3))
        intra_threads = max(1, cpu_cnt // workers)
        use_cache = not args.no_cache
        print(f"[Pipeline] workers={workers} (intra_op_threads={intra_threads}) | cache={'on' if use_cache else 'off'}")

        def run_jobs(job_list):
            lazy_pool = None

            def get_pool():
                nonlocal lazy_pool
                if workers <= 1:
                    _init_worker(intra_threads)
                    return None
                if lazy_pool is None:
                    lazy_pool = ProcessPoolExecutor(max_workers=workers, initializer=_init_worker, initargs=(intra_threads,))
                return lazy_pool

            try:
                for cname, cdir, out_d in job_list:
                    build_semantic_block_atlas(cname, cdir, out_d, install_vnsprite=args.install, pool=get_pool, use_cache=use_cache)
            finally:
                if lazy_pool is not None:
                    lazy_pool.shutdown(wait=True)

        if args.dir and args.out:
            cname = args.name or os.path.basename(os.path.dirname(os.path.abspath(args.dir)))
            run_jobs([(cname, args.dir, args.out)])
        elif args.all:
            root = r"assets/game-assets/characters"
            jobs = []
            for cdir in sorted(glob.glob(os.path.join(root, "*", "*"))):
                if os.path.isdir(cdir) and glob.glob(os.path.join(cdir, "*.png")):
                    parts = os.path.normpath(cdir).split(os.sep)
                    cname, outfit = parts[-2], parts[-1]
                    jobs.append((cname, cdir, rf"dist/sprite-experiment/unified_{cname.lower()}_{outfit.lower()}"))
            run_jobs(jobs)
        else:
            req = [a.lower() for a in args.chars] or list(targets.keys())
            jobs = [targets[key] for key in req if key in targets]
            run_jobs(jobs)
