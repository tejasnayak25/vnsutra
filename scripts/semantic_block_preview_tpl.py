import json


def build_semantic_block_preview_html(char_name, manifest, atlas_b64):
    """Build standalone interactive HTML preview for Semantic Layer + RDO Quadtree Block Atlas + Live Rig."""
    manifest_json = json.dumps(manifest, separators=(",", ":"))
    atlas_data_url = f"data:image/webp;base64,{atlas_b64}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{char_name} — Semantic Quadtree Block Atlas + Live Rig</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; background: #090d16; color: #f1f5f9;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex; height: 100vh; overflow: hidden;
  }}
  #stage-container {{
    flex: 1; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at center, #1e293b 0%, #050811 100%);
    position: relative; padding: 18px;
  }}
  canvas {{
    max-height: 95vh; max-width: 100%; border-radius: 12px;
    box-shadow: 0 25px 60px -15px rgba(0,0,0,0.85); cursor: grab;
  }}
  canvas:active {{ cursor: grabbing; }}
  #hud {{
    position: absolute; top: 16px; left: 16px;
    background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px);
    border: 1px solid #334155; padding: 10px 14px; border-radius: 8px;
    font-size: 0.74rem; font-family: monospace; color: #cbd5e1; pointer-events: none;
    line-height: 1.5;
  }}
  .sv {{ color: #38bdf8; font-weight: 700; }}
  #panel {{
    width: 410px; background: #111827; border-left: 1px solid #1f2937;
    padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
  }}
  h2 {{ margin: 0; font-size: 1.1rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; }}
  .tag {{ font-size: 0.68rem; background: #0284c7; color: #fff; padding: 2px 8px; border-radius: 999px; }}
  p {{ margin: 4px 0 0; font-size: 0.78rem; color: #94a3b8; line-height: 1.38; }}
  .sec {{ background: #182234; padding: 12px; border-radius: 10px; border: 1px solid #24334c; }}
  .st {{ font-size: 0.7rem; text-transform: uppercase; letter-spacing: .06em; color: #7dd3fc; margin-bottom: 8px; font-weight: 700; }}
  .grid3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }}
  .grid2 {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }}
  button {{
    background: #233148; color: #f1f5f9; border: 1px solid #334461;
    padding: 6px 6px; border-radius: 6px; font-size: 0.74rem; cursor: pointer;
    word-break: break-word; transition: background 0.12s;
  }}
  button:hover {{ background: #324463; }}
  button.active {{ background: #0284c7; border-color: #38bdf8; font-weight: 600; }}
  .row {{ display: flex; align-items: center; justify-content: space-between; font-size: 0.79rem; margin: 6px 0; }}
  input[type="checkbox"] {{ width: 15px; height: 15px; accent-color: #38bdf8; cursor: pointer; }}
  input[type="range"] {{ flex: 1; accent-color: #38bdf8; }}
  .stats {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.73rem; font-family: monospace; color: #94a3b8; }}
  .legend {{ display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.7rem; color: #94a3b8; margin-top: 6px; }}
  .dot {{ display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }}
</style>
</head>
<body>
<div id="stage-container">
  <canvas id="stage"></canvas>
  <div id="hud">
    <div>Mood: <span class="sv" id="h-mood">-</span></div>
    <div>Leaves: <span class="sv" id="h-leaves">-</span></div>
    <div>Frame Reuse: <span class="sv" id="h-reuse">-</span></div>
    <div>Renderer: <span class="sv" id="h-renderer">Canvas2D</span></div>
  </div>
</div>

<div id="panel">
  <div>
    <h2>{char_name} <span class="tag">Trinity + Quadtree</span></h2>
    <p>Semantic layers (Hair, Skin, Upper Clothes, Lower Body) compressed via RBF-normalized 64/32/16 WOLA quadtree tiles + crisp Eye/Mouth expression cuts.</p>
  </div>

  <div class="sec">
    <div class="st">Moods (<span id="m-count">0</span>)</div>
    <div class="grid3" id="mood-grid"></div>
  </div>

  <div class="sec">
    <div class="st">Live Puppet &amp; Spring Physics</div>
    <div class="row"><label>Auto-Blink</label><input type="checkbox" id="chk-blink" checked></div>
    <div class="row"><label>Use Closed-Eye Swap Patch (if available)</label><input type="checkbox" id="chk-blink-swap" checked></div>
    <div class="row"><label>Lip-Sync Talk</label><input type="checkbox" id="chk-talk"></div>
    <div class="row" style="gap:8px;"><label>Talk Mouth</label><select id="sel-talk-mouth" style="flex:1;background:#233148;color:#f1f5f9;border:1px solid #334461;border-radius:6px;padding:4px 6px;font-size:0.74rem;"></select></div>
    <div class="row" style="gap:8px;"><label>Talk Speed</label><input type="range" id="rng-talk-spd" min="1.5" max="8" step="0.2" value="3.8"><span class="sv" id="talk-spd-val">3.8/s</span></div>
    <div class="row"><label>Idle Breathing &amp; Spring Sway</label><input type="checkbox" id="chk-breathe" checked></div>
    <div class="row"><label>WebGL2 Mesh Deformation</label><input type="checkbox" id="chk-webgl" checked></div>
    <div class="row"><label>Cursor Gaze (2.5D)</label><input type="checkbox" id="chk-gaze" checked></div>
    <div class="row"><label>Mood Crossfade</label><input type="checkbox" id="chk-crossfade" checked></div>
    <div class="row" style="gap:8px;"><label>Crossfade Time</label><input type="range" id="rng-morph-dur" min="0.15" max="0.90" step="0.05" value="0.45"><span class="sv" id="morph-dur-val">0.45s</span></div>
    <div class="row" style="gap:8px;"><label>Wind Gust</label><input type="range" id="rng-wind" min="0" max="1" step="0.05" value="0.25"><span class="sv" id="wind-val">25%</span></div>
    <div class="grid2" style="margin-top:8px;">
      <button id="btn-hop">Stage Hop</button>
      <button id="btn-shake">Shock Shake</button>
    </div>
    <div style="margin-top:8px;font-size:0.72rem;color:#94a3b8;font-weight:600;">Expression FX</div>
    <div class="row" style="gap:8px;"><label>FX Intensity</label><input type="range" id="rng-fx-int" min="0.2" max="1.2" step="0.05" value="0.85"><span class="sv" id="fx-int-val">85%</span></div>
    <div class="grid2" id="fx-toggles" style="margin-top:4px;">
      <button data-fx="blush">Blush</button>
      <button data-fx="sweat">Sweat</button>
      <button data-fx="sparkles">Sparkles</button>
      <button data-fx="anger_vein">Anger Vein</button>
      <button data-fx="gloom_lines">Gloom Lines</button>
      <button data-fx="heart_pop">Heart Pop</button>
      <button data-fx="shock_burst">Shock Burst</button>
    </div>
  </div>

  <div class="sec">
    <div class="st">Semantic Layers</div>
    <div class="grid2" id="layer-toggles"></div>
  </div>

  <div class="sec">
    <div class="st">Zoom &amp; Quadtree Seam Inspector</div>
    <div class="grid3" id="zoom-grid" style="margin-bottom:8px;">
      <button data-zoom="1" class="active">1x Full</button>
      <button data-zoom="2.5">2.5x Face</button>
      <button data-zoom="4">4x Pixel</button>
    </div>
    <div class="row"><label>Show Quadtree Blocks</label><input type="checkbox" id="chk-grid"></div>
    <div class="row"><label>Split Compare (Hard vs 4px WOLA)</label><input type="checkbox" id="chk-split"></div>
    <div class="row" id="split-row" style="display:none;gap:8px;"><label>Split X</label><input type="range" id="rng-split" min="0" max="1" step="0.01" value="0.5"></div>
    <div class="legend">
      <span><i class="dot" style="background:#38bdf8"></i>64x64</span>
      <span><i class="dot" style="background:#34d399"></i>32x32</span>
      <span><i class="dot" style="background:#fbbf24"></i>16x16</span>
      <span>Dashed = Reused</span>
    </div>
  </div>

  <div class="sec">
    <div class="st">Pivot &amp; .vnsprite Studio</div>
    <div class="row"><label>Edit Pivots on Canvas</label><input type="checkbox" id="chk-pivots"></div>
    <div id="pivot-readout" style="font-size:0.70rem;color:#94a3b8;margin-top:4px;font-variant-numeric:tabular-nums;">Check "Edit Pivots" to drag Head, Neck, Waist, or HairSplit directly.</div>
    <div class="grid2" style="margin-top:8px;">
      <button id="btn-lock-mouth">Lock Talk Mouth</button>
      <button id="btn-reset-pivots">Reset Pivots</button>
    </div>
    <div class="grid2" style="margin-top:6px;">
      <button id="btn-export-json">Export JSON</button>
      <button id="btn-export-vns">Export .vnsprite</button>
    </div>
  </div>

  <div class="sec">
    <div class="st">Unified Atlas Stats</div>
    <div class="stats">
      <div>Atlas Size: <span class="sv" id="s-atlas">-</span></div>
      <div>File KB: <span class="sv" id="s-kb">-</span></div>
      <div>Block Reuse: <span class="sv" id="s-reuse">-</span></div>
      <div>Unique Tiles: <span class="sv" id="s-tiles">-</span></div>
      <div>Organ Cuts: <span class="sv" id="s-organs">-</span></div>
      <div>Body Layers: <span class="sv">5 semantic</span></div>
    </div>
  </div>
</div>

<script>
const EMBEDDED_MANIFEST = {manifest_json};
const EMBEDDED_ATLAS = "{atlas_data_url}";

const BODY_ORDER = ["back_hair", "lower_body", "skin_canvas", "upper_clothes", "front_hair"];
const LAYER_LABELS = {{
  back_hair: "Back Hair (Behind Body)",
  lower_body: "Lower Body (Skirt + Legs)",
  skin_canvas: "Head & Neck Skin",
  left_eye: "Left Eye",
  right_eye: "Right Eye",
  mouth: "Mouth",
  upper_clothes: "Upper Body (Clothes + Arms)",
  front_hair: "Front Hair & Bangs"
}};

let manifest = EMBEDDED_MANIFEST;
const atlasImg = new Image();
let atlasPixels = null, atlasW = 0;

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

let curMood = null;
let zoom = 1.0, panX = 0, panY = 0, dragging = false, dsx = 0, dsy = 0;
const layerVis = {{ back_hair: true, lower_body: true, skin_canvas: true, left_eye: true, right_eye: true, mouth: true, upper_clothes: true, front_hair: true }};
const rampCache = new Map();
const layerBufGrad = new Map();
const layerBufHard = new Map();

function getRamp(dim, overlap) {{
  if (rampCache.has(dim)) return rampCache.get(dim);
  const edge = overlap * 2;
  const w = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {{
    if (i < edge) w[i] = (i + 0.5) / edge;
    else if (i >= dim - edge) w[i] = (dim - 1 - i + 0.5) / edge;
    else w[i] = 1.0;
  }}
  rampCache.set(dim, w);
  return w;
}}

let scratchLen = 0;
let accR = null, accG = null, accB = null, accA = null, accW = null;
function ensureScratch(len) {{
  if (scratchLen < len) {{
    accR = new Float32Array(len);
    accG = new Float32Array(len);
    accB = new Float32Array(len);
    accA = new Float32Array(len);
    accW = new Float32Array(len);
    scratchLen = len;
  }} else {{
    accR.fill(0); accG.fill(0); accB.fill(0); accA.fill(0); accW.fill(0);
  }}
}}

function reconstructLayer(mood, layerId, useGrad) {{
  const cache = useGrad ? layerBufGrad : layerBufHard;
  const key = mood + "::" + layerId;
  if (cache.has(key)) return cache.get(key);

  const W = manifest.width, H = manifest.height, overlap = manifest.overlap;
  const placements = (manifest.frames[mood].layerBlocks[layerId]) || [];
  const outC = document.createElement("canvas");
  outC.width = W; outC.height = H;
  const octx = outC.getContext("2d");

  if (!useGrad) {{
    for (let i = 0; i < placements.length; i++) {{
      const [dx, dy, sz, ax, ay] = placements[i];
      octx.drawImage(atlasImg, ax + overlap, ay + overlap, sz, sz, dx, dy, sz, sz);
    }}
    cache.set(key, outC);
    return outC;
  }}

  const len = W * H;
  ensureScratch(len);
  for (let i = 0; i < placements.length; i++) {{
    const [dx, dy, sz, ax, ay] = placements[i];
    const dim = sz + overlap * 2;
    const w1d = getRamp(dim, overlap);
    const dy0 = dy - overlap, dx0 = dx - overlap;
    for (let ly = 0; ly < dim; ly++) {{
      const gy = dy0 + ly;
      if (gy < 0 || gy >= H) continue;
      const wy = w1d[ly], sRow = (ay + ly) * atlasW, dRow = gy * W;
      for (let lx = 0; lx < dim; lx++) {{
        const gx = dx0 + lx;
        if (gx < 0 || gx >= W) continue;
        const w = wy * w1d[lx], sIdx = (sRow + ax + lx) * 4, dIdx = dRow + gx;
        accR[dIdx] += atlasPixels[sIdx] * w;
        accG[dIdx] += atlasPixels[sIdx + 1] * w;
        accB[dIdx] += atlasPixels[sIdx + 2] * w;
        accA[dIdx] += atlasPixels[sIdx + 3] * w;
        accW[dIdx] += w;
      }}
    }}
  }}
  const imgData = octx.createImageData(W, H);
  const out = imgData.data;
  for (let p = 0; p < len; p++) {{
    const w = accW[p];
    if (w > 1e-4) {{
      const o = p * 4;
      out[o] = Math.round(accR[p] / w);
      out[o + 1] = Math.round(accG[p] / w);
      out[o + 2] = Math.round(accB[p] / w);
      out[o + 3] = Math.round(accA[p] / w);
    }}
  }}
  octx.putImageData(imgData, 0, 0);
  cache.set(key, outC);
  return outC;
}}

function drawOrgan(targetCtx, organSpec, sx, sy, angDeg, anchorStage) {{
  if (!organSpec) return;
  const {{ atlas: a, stage: st }} = organSpec;
  const cx = anchorStage ? anchorStage.cx : st.cx;
  const cy = anchorStage ? (anchorStage.cy + (st.h - anchorStage.h) * 0.26) : st.cy;
  targetCtx.save();
  targetCtx.translate(cx, cy);
  if (angDeg) targetCtx.rotate(angDeg * Math.PI / 180);
  targetCtx.scale(sx, sy);
  if (angDeg) targetCtx.rotate(-angDeg * Math.PI / 180);
  targetCtx.drawImage(atlasImg, a.x, a.y, a.w, a.h, -st.w * 0.5, -st.h * 0.5, st.w, st.h);
  targetCtx.restore();
}}

const visemeBank = {{ mid: null, roundO: null, wideA: null, byMood: {{}} }};
function buildVisemeBank() {{
  const all = Object.entries(manifest.frames)
    .filter(([, fd]) => fd.organs && fd.organs.mouth)
    .map(([m, fd]) => ({{ mood: m, spec: fd.organs.mouth, w: fd.organs.mouth.stage.w, h: fd.organs.mouth.stage.h }}));
  if (!all.length) return;
  all.forEach(x => {{ visemeBank.byMood[x.mood] = x.spec; }});
  const ws = all.map(x => x.w).sort((a, b) => a - b);
  const medW = ws[Math.floor(ws.length / 2)];
  const clean = all.filter(x => x.w <= medW * 1.85 && x.h <= medW * 1.45 && x.h >= 16);
  const sortedH = [...clean].sort((a, b) => a.h - b.h);
  if (sortedH.length) {{
    const openOnly = sortedH.filter(x => (x.h / Math.max(1, x.w)) >= 0.45);
    visemeBank.wideA = (openOnly.find(x => x.mood.toLowerCase().includes("happy")) || sortedH[sortedH.length - 1]).spec;
    visemeBank.roundO = ([...sortedH].sort((a, b) => (b.h / b.w) - (a.h / a.w))[0]).spec;
    const midPool = sortedH
      .filter(x => x.h < visemeBank.wideA.stage.h * 0.85 && (x.h / Math.max(1, x.w)) >= 0.48)
      .sort((a, b) => (b.h / b.w) - (a.h / a.w));
    visemeBank.mid = (midPool[0] || sortedH[0]).spec;
  }}

  const sel = document.getElementById("sel-talk-mouth");
  if (sel) {{
    sel.innerHTML = "";
    [
      ["__auto_single__", "Auto (Single Mood-Matched)"],
      ["__cycle__", "Cycle (Mid / Wide / Round)"],
      ["__current__", "Current Mood Only (Stretch)"],
    ].forEach(([val, label]) => {{
      const o = document.createElement("option"); o.value = val; o.textContent = label; sel.appendChild(o);
    }});
    [...all].sort((a, b) => b.h - a.h).forEach(x => {{
      const o = document.createElement("option");
      o.value = x.mood;
      o.textContent = `${{x.mood}} (${{x.w}}x${{x.h}})`;
      sel.appendChild(o);
    }});
  }}
}}

function pickSpeechMouth(fd, tSec) {{
  const baseMouth = fd.organs.mouth;
  if (!baseMouth) return {{ spec: null, sy: 1.0 }};
  const phrase = tSec % 2.35;
  if (phrase > 1.90) return {{ spec: baseMouth, sy: 1.0 }};

  const spd = parseFloat((document.getElementById("rng-talk-spd") || {{ value: "3.8" }}).value || "3.8");
  const mode = (document.getElementById("sel-talk-mouth") || {{ value: "__auto_single__" }}).value;
  if (mode === "__cycle__") {{
    const step = Math.floor(phrase * spd);
    const frac = (phrase * spd) - step;
    const seq = ["mid", "wideA", "roundO", "closed", "mid", "wideA", "mid", "closed"];
    const kind = seq[step % seq.length];
    let spec = baseMouth;
    if (kind !== "closed" && visemeBank[kind]) spec = visemeBank[kind];
    const sy = kind === "closed" ? 1.0 : (0.86 + 0.16 * Math.sin(frac * Math.PI));
    return {{ spec, sy }};
  }}

  let openSpec = baseMouth;
  if (mode === "__current__") {{
    openSpec = baseMouth;
  }} else if (mode === "__auto_single__") {{
    const mLow = (curMood || "").toLowerCase();
    const isCheer = ["happy", "smiling", "laugh", "embar"].some(k => mLow.includes(k));
    openSpec = (baseMouth.stage.h >= 20)
      ? baseMouth
      : (isCheer ? (visemeBank.wideA || visemeBank.mid || baseMouth) : (visemeBank.mid || visemeBank.roundO || visemeBank.wideA || baseMouth));
  }} else {{
    openSpec = visemeBank.byMood[mode] || baseMouth;
  }}

  // Uniform open-close syllable cycle (~3.8 syl/s) with subtle peak variation & sentence pause
  const step = Math.floor(phrase * spd);
  const frac = (phrase * spd) - step;
  const env = Math.sin(frac * Math.PI);
  const peaks = [1.0, 0.86, 0.96, 0.82, 1.0];
  const amp = peaks[step % peaks.length];
  if (env < 0.25) {{
    return {{ spec: baseMouth, sy: 1.0 }};
  }}
  const sy = (openSpec === baseMouth && baseMouth.stage.h < 18)
    ? (1.0 + 0.30 * amp * env)
    : (0.64 + 0.40 * amp * env);
  return {{ spec: openSpec, sy }};
}}

function findClosedEyesMood(cur) {{
  const frames = manifest.frames;
  if (cur + "_EyesClosed" in frames) return cur + "_EyesClosed";
  return Object.keys(frames).find(k => k.toLowerCase().includes("eyesclosed")) || null;
}}

class Spring1D {{
  constructor(stiffness, damping) {{
    this.k = stiffness; this.d = damping;
    this.x = 0; this.v = 0;
  }}
  step(target, dt) {{
    const f = (target - this.x) * this.k - this.v * this.d;
    this.v += f * dt;
    this.x += this.v * dt;
    return this.x;
  }}
  impulse(dv) {{ this.v += dv; }}
}}

const springs = {{
  bodyX: new Spring1D(130, 12),
  bodyY: new Spring1D(170, 13),
  chest: new Spring1D(65, 9),
  headRot: new Spring1D(90, 9),
  headY: new Spring1D(140, 12),
  fHair: new Spring1D(55, 6.2),
  bHair: new Spring1D(42, 5.2),
  lookX: new Spring1D(45, 9),
  lookY: new Spring1D(45, 9),
}};
const lookTarget = {{ x: 0, y: 0 }};
let windPhase = 0;
let lastTs = null;
let moodMorph = null;
const layerDiffCache = new Map();
const activeFx = new Set();
const fxAlphas = {{}};
const fxCanvasSkin = document.createElement("canvas");
const fxCanvasTop = document.createElement("canvas");

function renderPreviewFx(W, H, fd, eyeSrc, tSec, pass = "all") {{
  const keys = new Set([...activeFx, ...Object.keys(fxAlphas)]);
  if (!keys.size) return null;
  const wantsSkin = pass === "all" || pass === "skin";
  const wantsTop = pass === "all" || pass === "top";
  if (wantsSkin && pass === "skin" && !keys.has("blush") && !keys.has("gloom_lines")) return null;
  if (wantsTop && pass === "top" && ![...keys].some(k => k !== "blush" && k !== "gloom_lines")) return null;
  const targetC = pass === "top" ? fxCanvasTop : fxCanvasSkin;
  if (targetC.width !== W || targetC.height !== H) {{
    targetC.width = W; targetC.height = H;
  }}
  const fctx = targetC.getContext("2d");
  fctx.clearRect(0, 0, W, H);
  const le = eyeSrc && eyeSrc.left_eye ? eyeSrc.left_eye.stage : null;
  const re = eyeSrc && eyeSrc.right_eye ? eyeSrc.right_eye.stage : null;
  const fallbackSpan = Math.max(48, W * 0.14);
  const hp = (fd.pivots && fd.pivots.head) || [W * 0.5, H * 0.25];
  const L = le || {{ cx: hp[0] - fallbackSpan * 0.5, cy: hp[1] + fallbackSpan * 0.35 }};
  const R = re || {{ cx: hp[0] + fallbackSpan * 0.5, cy: hp[1] + fallbackSpan * 0.35 }};
  const eyeSpan = Math.max(40, Math.hypot(R.cx - L.cx, R.cy - L.cy));
  const u = eyeSpan * 0.42;
  const ang = ((fd.eyeAngleDeg || 0) * Math.PI) / 180;
  const midX = (L.cx + R.cx) * 0.5, midY = (L.cy + R.cy) * 0.5;
  const intEl = document.getElementById("rng-fx-int");
  const baseScale = intEl ? parseFloat(intEl.value || "0.85") : 0.85;
  const aOf = (k) => (typeof fxAlphas[k] === "number" ? fxAlphas[k] : (activeFx.has(k) ? 1 : 0)) * baseScale;

  const blushA = wantsSkin ? aOf("blush") : 0;
  if (blushA > 0.01) {{
    const pulse = 0.94 + 0.06 * Math.sin(tSec * 2.2);
    for (const eye of [L, R]) {{
      const rx = u * 0.62, ry = u * 0.30;
      fctx.save();
      fctx.translate(eye.cx, eye.cy + u * 0.64);
      fctx.rotate(ang);
      fctx.globalAlpha = Math.min(1, blushA * 0.54 * pulse);
      const g = fctx.createRadialGradient(0, 0, 1, 0, 0, rx);
      g.addColorStop(0, "rgba(255,110,140,0.88)");
      g.addColorStop(0.55, "rgba(255,138,165,0.44)");
      g.addColorStop(1, "rgba(255,138,165,0)");
      fctx.fillStyle = g;
      fctx.save(); fctx.scale(1, ry / rx); fctx.beginPath(); fctx.arc(0, 0, rx, 0, Math.PI * 2); fctx.fill(); fctx.restore();
      fctx.strokeStyle = "rgba(235,75,110,0.45)";
      fctx.lineWidth = Math.max(1.2, u * 0.032); fctx.lineCap = "round";
      for (let k = -1.5; k <= 1.5; k += 1) {{
        const ox = k * rx * 0.28;
        fctx.beginPath(); fctx.moveTo(ox - rx * 0.10, ry * 0.44); fctx.lineTo(ox + rx * 0.12, -ry * 0.44); fctx.stroke();
      }}
      fctx.restore();
    }}
  }}
  const gloomA = wantsSkin ? aOf("gloom_lines") : 0;
  if (gloomA > 0.01) {{
    const lines = 11, spanW = u * 3.2, lineH = u * 3.1;
    fctx.save();
    fctx.globalAlpha = Math.min(1, gloomA * 0.88);
    fctx.translate(midX, midY - u * 2.55); fctx.rotate(ang);
    const wash = fctx.createLinearGradient(0, 0, 0, lineH * 0.85);
    wash.addColorStop(0, "rgba(30,27,75,0.58)"); wash.addColorStop(0.65, "rgba(30,27,75,0.28)"); wash.addColorStop(1, "rgba(30,27,75,0)");
    fctx.fillStyle = wash; fctx.fillRect(-spanW * 0.55, 0, spanW * 1.1, lineH * 0.85);
    fctx.lineCap = "round";
    for (let i = 0; i < lines; i++) {{
      const lx = (i / (lines - 1) - 0.5) * spanW;
      const bob = Math.sin(tSec * 2.6 + i * 0.9) * u * 0.08;
      const lg = fctx.createLinearGradient(lx, 0, lx, lineH);
      lg.addColorStop(0, "rgba(15,23,42,0.95)"); lg.addColorStop(0.55, "rgba(49,46,129,0.65)"); lg.addColorStop(1, "rgba(49,46,129,0)");
      fctx.strokeStyle = lg; fctx.lineWidth = Math.max(2.2, u * (i % 2 === 0 ? 0.095 : 0.06));
      fctx.beginPath(); fctx.moveTo(lx, bob); fctx.lineTo(lx, lineH + bob); fctx.stroke();
    }}
    fctx.restore();
  }}
  const sweatA = wantsTop ? aOf("sweat") : 0;
  if (sweatA > 0.01) {{
    for (const d of [{{ ph: 0, s: 1.0, dx: 0 }}, {{ ph: 0.34, s: 0.55, dx: u * 0.24 }}]) {{
      const cyc = (tSec * 0.58 + d.ph) % 1;
      const hDrop = Math.max(11, u * 0.44 * d.s), wDrop = hDrop * 0.60, stretchY = 0.85 + 0.30 * cyc;
      fctx.save();
      fctx.globalAlpha = Math.min(1, Math.max(0.1, sweatA * Math.sin(cyc * Math.PI)));
      fctx.translate(R.cx + u * 1.12 + d.dx, R.cy - u * 0.72 + cyc * u * 0.86);
      fctx.scale(1 / Math.sqrt(stretchY), stretchY);
      const dg = fctx.createLinearGradient(0, -hDrop * 0.55, 0, hDrop * 0.55);
      dg.addColorStop(0, "#e0f2fe"); dg.addColorStop(0.55, "#38bdf8"); dg.addColorStop(1, "#0284c7");
      fctx.fillStyle = dg; fctx.strokeStyle = "rgba(15,45,80,0.8)"; fctx.lineWidth = Math.max(1.2, u * 0.03);
      fctx.beginPath();
      fctx.moveTo(0, -hDrop * 0.55); fctx.bezierCurveTo(wDrop * 0.85, 0, wDrop * 0.75, hDrop * 0.55, 0, hDrop * 0.55);
      fctx.bezierCurveTo(-wDrop * 0.75, hDrop * 0.55, -wDrop * 0.85, 0, 0, -hDrop * 0.55);
      fctx.closePath(); fctx.fill(); fctx.stroke();
      fctx.fillStyle = "rgba(255,255,255,0.92)";
      fctx.beginPath(); fctx.ellipse(-wDrop * 0.22, hDrop * 0.10, wDrop * 0.14, hDrop * 0.13, -0.4, 0, Math.PI * 2); fctx.fill();
      fctx.restore();
    }}
  }}
  const veinA = wantsTop ? aOf("anger_vein") : 0;
  if (veinA > 0.01) {{
    const r = Math.max(10, u * 0.25) * (1 + 0.08 * Math.sin(tSec * 8.5));
    fctx.save();
    fctx.globalAlpha = Math.min(1, veinA);
    fctx.translate(L.cx - u * 0.85, L.cy - u * 0.98);
    fctx.rotate(ang - 0.18);
    fctx.lineCap = "round";
    for (const [col, lw] of [["rgba(254,202,202,0.6)", r * 0.34], ["#dc2626", r * 0.18]]) {{
      fctx.strokeStyle = col; fctx.lineWidth = Math.max(1.5, lw);
      for (let q = 0; q < 4; q++) {{
        fctx.save(); fctx.rotate((q * Math.PI) / 2);
        fctx.beginPath(); fctx.moveTo(r * 0.20, -r * 0.88);
        fctx.quadraticCurveTo(r * 0.22, -r * 0.22, r * 0.88, -r * 0.20); fctx.stroke();
        fctx.restore();
      }}
    }}
    fctx.restore();
  }}
  const sparkA = wantsTop ? aOf("sparkles") : 0;
  if (sparkA > 0.01) {{
    const spots = [
      {{ x: L.cx - u * 1.15, y: L.cy - u * 0.78, s: u * 0.32, ph: 0 }},
      {{ x: R.cx + u * 1.12, y: R.cy - u * 0.65, s: u * 0.26, ph: 1.7 }},
      {{ x: midX, y: Math.min(L.cy, R.cy) - u * 1.35, s: u * 0.22, ph: 3.1 }}
    ];
    for (const sp of spots) {{
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(tSec * 3.2 + sp.ph));
      const r = sp.s * (0.72 + 0.38 * tw);
      fctx.save(); fctx.globalAlpha = Math.min(1, sparkA * tw); fctx.translate(sp.x, sp.y);
      const sg = fctx.createRadialGradient(0, 0, 0.5, 0, 0, r * 1.15);
      sg.addColorStop(0, "rgba(254,249,195,0.92)"); sg.addColorStop(0.5, "rgba(251,191,36,0.38)"); sg.addColorStop(1, "rgba(251,191,36,0)");
      fctx.fillStyle = sg; fctx.beginPath(); fctx.arc(0, 0, r * 1.15, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = "#fffbeb"; fctx.strokeStyle = "rgba(217,119,6,0.85)"; fctx.lineWidth = Math.max(1.1, r * 0.08);
      fctx.beginPath();
      for (let k = 0; k < 4; k++) {{
        const a0 = (k * Math.PI) / 2, a1 = a0 + Math.PI / 4;
        if (k === 0) fctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
        else fctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
        fctx.lineTo(Math.cos(a1) * r * 0.15, Math.sin(a1) * r * 0.15);
      }}
      fctx.closePath(); fctx.fill(); fctx.stroke(); fctx.restore();
    }}
  }}
  const heartA = wantsTop ? aOf("heart_pop") : 0;
  if (heartA > 0.01) {{
    for (const ht of [{{ x: R.cx + u * 1.25, y: R.cy - u * 0.55, s: u * 0.52, ph: 0 }}, {{ x: L.cx - u * 1.18, y: L.cy - u * 0.78, s: u * 0.36, ph: 0.45 }}]) {{
      const cyc = (tSec * 0.5 + ht.ph) % 1, s = ht.s;
      fctx.save();
      fctx.globalAlpha = Math.min(1, heartA * Math.sin(cyc * Math.PI));
      fctx.translate(ht.x + Math.sin(tSec * 3.0 + ht.ph * 6) * u * 0.10, ht.y - cyc * u * 0.85);
      fctx.rotate(ang + Math.sin(tSec * 2.4 + ht.ph) * 0.14);
      const hg = fctx.createLinearGradient(0, -s, 0, s);
      hg.addColorStop(0, "#fda4af"); hg.addColorStop(1, "#e11d48");
      fctx.fillStyle = hg; fctx.strokeStyle = "rgba(159,18,57,0.85)"; fctx.lineWidth = Math.max(1.4, s * 0.09);
      fctx.beginPath();
      fctx.moveTo(0, s * 0.48);
      fctx.bezierCurveTo(-s * 1.15, -s * 0.2, -s * 0.58, -s * 1.08, 0, -s * 0.38);
      fctx.bezierCurveTo(s * 0.58, -s * 1.08, s * 1.15, -s * 0.2, 0, s * 0.48);
      fctx.closePath(); fctx.fill(); fctx.stroke();
      fctx.fillStyle = "rgba(255,255,255,0.85)";
      fctx.beginPath(); fctx.ellipse(-s * 0.34, -s * 0.34, s * 0.16, s * 0.10, -0.5, 0, Math.PI * 2); fctx.fill();
      fctx.restore();
    }}
  }}
  const shockA = wantsTop ? aOf("shock_burst") : 0;
  if (shockA > 0.01) {{
    const pulse = 0.95 + 0.07 * Math.sin(tSec * 14);
    const clusters = [{{ cx: L.cx - u * 1.45, cy: L.cy - u * 0.55, dir: -1 }}, {{ cx: R.cx + u * 1.45, cy: R.cy - u * 0.55, dir: 1 }}];
    const angles = [-0.65, -0.22, 0.20, 0.62];
    fctx.save(); fctx.globalAlpha = Math.min(1, shockA * 0.95); fctx.lineCap = "round";
    for (const cl of clusters) {{
      for (let k = 0; k < angles.length; k++) {{
        const a = (cl.dir > 0 ? angles[k] : Math.PI - angles[k]) + ang;
        const r0 = u * 0.25 * pulse, r1 = u * (k % 2 === 0 ? 0.95 : 0.68) * pulse;
        const x0 = cl.cx + Math.cos(a) * r0, y0 = cl.cy + Math.sin(a) * r0;
        const x1 = cl.cx + Math.cos(a) * r1, y1 = cl.cy + Math.sin(a) * r1;
        fctx.strokeStyle = "rgba(15,23,42,0.85)"; fctx.lineWidth = Math.max(3.5, u * 0.11);
        fctx.beginPath(); fctx.moveTo(x0, y0); fctx.lineTo(x1, y1); fctx.stroke();
        fctx.strokeStyle = "#fef08a"; fctx.lineWidth = Math.max(1.8, u * 0.055);
        fctx.beginPath(); fctx.moveTo(x0, y0); fctx.lineTo(x1, y1); fctx.stroke();
      }}
    }}
    fctx.restore();
  }}
  return targetC;
}}

function layersDiffer(moodA, moodB, lid) {{
  if (!moodA || !moodB || moodA === moodB) return false;
  const k = moodA + "::" + moodB + "::" + lid;
  if (layerDiffCache.has(k)) return layerDiffCache.get(k);
  const a = (manifest.frames[moodA] && manifest.frames[moodA].layerBlocks[lid]) || [];
  const b = (manifest.frames[moodB] && manifest.frames[moodB].layerBlocks[lid]) || [];
  let diff = a.length !== b.length;
  if (!diff) {{
    for (let i = 0; i < a.length; i++) {{
      const pa = a[i], pb = b[i];
      if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2] || pa[3] !== pb[3] || pa[4] !== pb[4]) {{
        diff = true;
        break;
      }}
    }}
  }}
  layerDiffCache.set(k, diff);
  return diff;
}}

function evalMorph(m) {{
  if (!m) return {{ active: false, t: 1.0, s: 1.0, pAlpha: 0.0, nAlpha: 1.0, eyeCushion: 1.0 }};
  const t = Math.min(1.0, Math.max(0.0, m.elapsed / Math.max(0.01, m.duration)));
  // C2-continuous Perlin quintic smootherstep (zero velocity & zero acceleration at endpoints)
  const s = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  // Asymmetric dissolve keeps overlap solidity ~94% at midpoint (prevents 25% skin bleed-through)
  const pAlpha = 1.0 - s * s;
  const nAlpha = s * (2.0 - s);
  const eyeCushion = 1.0 - 0.10 * Math.sin(Math.PI * s);
  return {{ active: s < 0.999, t, s, pAlpha, nAlpha, eyeCushion }};
}}

function stepPhysics(tSec, dt) {{
  const fxStep = Math.min(1, Math.max(0.01, (dt || 0.016) / 0.25));
  for (const f of activeFx) fxAlphas[f] = Math.min(1, (fxAlphas[f] || 0) + fxStep);
  for (const k of Object.keys(fxAlphas)) {{
    if (!activeFx.has(k)) {{
      const na = fxAlphas[k] - fxStep;
      if (na <= 0.005) delete fxAlphas[k];
      else fxAlphas[k] = na;
    }}
  }}
  if (moodMorph) {{
    if (!moodMorph.started) {{
      moodMorph.started = true;
    }} else {{
      moodMorph.elapsed += Math.min(dt, 0.033);
    }}
    if (moodMorph.elapsed >= moodMorph.duration) moodMorph = null;
  }}
  const breatheOn = document.getElementById("chk-breathe").checked;
  const gazeOn = document.getElementById("chk-gaze").checked;
  const wind = parseFloat(document.getElementById("rng-wind").value || "0");
  const brTarget = breatheOn ? Math.sin(tSec * 2.1) : 0;
  const gust = wind * (0.55 + 0.35 * Math.sin(tSec * 1.65) + 0.28 * Math.cos(tSec * 3.15 + 0.7));
  windPhase += dt * (2.2 + Math.abs(wind) * 1.1);

  const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
  springs.lookX.step(gazeOn ? clamp(lookTarget.x, 1.0) : 0, dt);
  springs.lookY.step(gazeOn ? clamp(lookTarget.y, 1.0) : 0, dt);

  springs.bodyX.step(0, dt);
  springs.bodyY.step(0, dt);
  springs.chest.step(brTarget, dt);

  // Clamp subtle angular swings cleanly inside the 10-14px seam underfill budget so parts stay unified
  const gazeTilt = springs.lookX.x * 0.006;
  const headRotTarget = clamp((breatheOn ? Math.sin(tSec * 1.1) * 0.0020 : 0) + gazeTilt - springs.bodyX.v * 0.00004, 0.014);
  const headYTarget = clamp(-springs.chest.x * 1.25 + springs.lookY.x * 1.6 + springs.bodyY.v * 0.005, 4.5);
  springs.headRot.step(headRotTarget, dt);
  springs.headY.step(headYTarget, dt);

  const swayBase = breatheOn ? Math.sin(tSec * 1.45 - 0.55) * 0.0035 : 0;
  const hairTorque = gust * 0.008 - springs.bodyX.v * 0.00006 - springs.headRot.v * 0.015;
  springs.fHair.step(clamp(swayBase + hairTorque * 0.7, 0.010), dt);
  springs.bHair.step(clamp(swayBase * 1.3 + hairTorque * 1.3, 0.016), dt);
  springs.headRot.x = clamp(springs.headRot.x, 0.016);
  springs.fHair.x = clamp(springs.fHair.x, 0.011);
  springs.bHair.x = clamp(springs.bHair.x, 0.018);
}}

function computeFrameEval(mood, tSec) {{
  const W = manifest.width, H = manifest.height;
  const fd = manifest.frames[mood];
  const blinkOn = document.getElementById("chk-blink").checked;
  const blinkSwap = document.getElementById("chk-blink-swap").checked;
  const talkOn = document.getElementById("chk-talk").checked;
  const pivots = fd.pivots || {{ waist: [W * 0.5, H * 0.62], neck: [W * 0.5, H * 0.28], head: [W * 0.5, H * 0.2] }};
  const [nx, ny] = pivots.neck;
  const [hx, hy] = pivots.head;

  let blinkAmt = 0;
  if (blinkOn) {{
    const cyc = tSec % 3.8;
    if (cyc > 3.56) blinkAmt = Math.sin(((cyc - 3.56) / 0.24) * Math.PI);
  }}
  const eyeSy = Math.max(0.08, 1.0 - blinkAmt * 0.92);
  const closedMood = blinkSwap ? findClosedEyesMood(mood) : null;
  const useClosedSwap = blinkAmt > 0.55 && closedMood && closedMood !== mood;
  const eyeSrc = useClosedSwap ? manifest.frames[closedMood].organs : fd.organs;
  const syUse = useClosedSwap ? 1.0 : eyeSy;
  const mouthState = talkOn ? pickSpeechMouth(fd, tSec) : {{ spec: fd.organs.mouth, sy: 1.0 }};

  const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
  const faceRef = Math.max(H * 0.14, (ny - hy) * 1.4);
  const gX = clamp(springs.lookX.x * faceRef * 0.012, Math.max(2.0, W * 0.0028));
  const gY = clamp(springs.lookY.x * faceRef * 0.008, Math.max(1.5, H * 0.0015));
  const eyeW = (eyeSrc && eyeSrc.left_eye && eyeSrc.left_eye.stage ? eyeSrc.left_eye.stage.w : faceRef * 0.12);
  const eyeIrisX = clamp(springs.lookX.x * eyeW * 0.038, 3.5);
  return {{ W, H, fd, pivots, eyeSrc, syUse, mouthState, gX, gY, eyeIrisX }};
}}

function composeFrame(targetCtx, mood, useGrad, tSec) {{
  const {{ W, H, fd, pivots, eyeSrc, syUse, mouthState, gX, gY, eyeIrisX }} = computeFrameEval(mood, tSec);
  const [wx, wy] = pivots.waist;
  const [nx, ny] = pivots.neck;
  const [hx, hy] = pivots.head;
  const breath = springs.chest.x;
  const hRot = springs.headRot.x;
  const hDy = springs.headY.x;
  const fRot = springs.fHair.x;
  const mm = evalMorph(moodMorph && manifest.frames[moodMorph.fromMood] ? moodMorph : null);
  const eyeSyMorph = mm.active ? Math.max(0.08, syUse * mm.eyeCushion) : syUse;

  const drawLayerBlended = (lid) => {{
    if (mm.active && layersDiffer(moodMorph.fromMood, mood, lid)) {{
      if (mm.pAlpha > 0.002) {{
        targetCtx.save(); targetCtx.globalAlpha *= mm.pAlpha;
        targetCtx.drawImage(reconstructLayer(moodMorph.fromMood, lid, useGrad), 0, 0);
        targetCtx.restore();
      }}
      if (mm.nAlpha > 0.002) {{
        targetCtx.save(); targetCtx.globalAlpha *= mm.nAlpha;
        targetCtx.drawImage(reconstructLayer(mood, lid, useGrad), 0, 0);
        targetCtx.restore();
      }}
    }} else {{
      targetCtx.drawImage(reconstructLayer(mood, lid, useGrad), 0, 0);
    }}
  }};

  const drawEye = (spec, alpha = 1.0, customAng = fd.eyeAngleDeg, syVal = eyeSyMorph) => {{
    if (!spec || alpha <= 0.002) return;
    const shifted = {{ atlas: spec.atlas, stage: {{ ...spec.stage, cx: spec.stage.cx + eyeIrisX, cy: spec.stage.cy + gY * 0.5 }} }};
    targetCtx.save();
    targetCtx.globalAlpha *= alpha;
    drawOrgan(targetCtx, shifted, 1.0, syVal, customAng);
    targetCtx.restore();
    if (syVal < 0.72) {{
      const st = shifted.stage;
      targetCtx.save();
      targetCtx.globalAlpha *= alpha;
      targetCtx.translate(st.cx, st.cy);
      targetCtx.rotate((customAng || 0) * Math.PI / 180);
      targetCtx.strokeStyle = manifest.lashColor || "#3a2220";
      targetCtx.lineWidth = Math.max(2, st.h * 0.08);
      targetCtx.lineCap = "round";
      targetCtx.beginPath();
      targetCtx.moveTo(-st.w * 0.48, 0);
      targetCtx.quadraticCurveTo(0, st.h * 0.14 * (1 - syVal), st.w * 0.48, 0);
      targetCtx.stroke();
      targetCtx.restore();
    }}
  }};

  targetCtx.save();
  targetCtx.translate(springs.bodyX.x, springs.bodyY.x);

  // 1) Back hair (Canvas2D locks back_hair & front_hair together with zero seam shear)
  if (layerVis.back_hair) {{
    targetCtx.save();
    targetCtx.translate(nx, ny);
    targetCtx.rotate(hRot);
    targetCtx.translate(-nx, -ny + hDy);
    targetCtx.translate(hx, hy);
    targetCtx.rotate(fRot);
    targetCtx.translate(-hx, -hy);
    drawLayerBlended("back_hair");
    targetCtx.restore();
  }}

  // 2) Lower body (skirt + legs + waist underfill, grounded at base)
  if (layerVis.lower_body) {{
    targetCtx.save();
    targetCtx.translate(W * 0.5, H);
    targetCtx.scale(1.0 - breath * 0.0012, 1.0 + breath * 0.0018);
    targetCtx.translate(-W * 0.5, -H);
    drawLayerBlended("lower_body");
    targetCtx.restore();
  }}

  // 3) Skin canvas + eyes + mouth (neck spring bob/tilt + eye socket gaze shift)
  targetCtx.save();
  targetCtx.translate(nx, ny);
  targetCtx.rotate(hRot);
  targetCtx.translate(-nx, -ny + hDy);
  if (layerVis.skin_canvas) drawLayerBlended("skin_canvas");
  if (mm.active) {{
    const pFd = manifest.frames[moodMorph.fromMood];
    const pEv = computeFrameEval(moodMorph.fromMood, tSec);
    if (layerVis.left_eye) drawEye(pEv.eyeSrc.left_eye, mm.pAlpha, pFd.eyeAngleDeg, eyeSyMorph);
    if (layerVis.right_eye) drawEye(pEv.eyeSrc.right_eye, mm.pAlpha, pFd.eyeAngleDeg, eyeSyMorph);
    if (layerVis.mouth && pFd.organs.mouth && mm.pAlpha > 0.002) {{
      const prs = pFd.organs.mouth.stage;
      targetCtx.save(); targetCtx.globalAlpha *= mm.pAlpha;
      drawOrgan(targetCtx, pFd.organs.mouth, 1.0, 1.0, pFd.eyeAngleDeg, prs);
      targetCtx.restore();
    }}
  }}
  if (layerVis.left_eye) drawEye(eyeSrc.left_eye, mm.nAlpha, fd.eyeAngleDeg, eyeSyMorph);
  if (layerVis.right_eye) drawEye(eyeSrc.right_eye, mm.nAlpha, fd.eyeAngleDeg, eyeSyMorph);
  if (layerVis.mouth && mouthState.spec && mm.nAlpha > 0.002) {{
    const rs = fd.organs.mouth ? fd.organs.mouth.stage : mouthState.spec.stage;
    const msTarget = {{ cx: rs.cx, cy: rs.cy, w: rs.w, h: rs.h }};
    targetCtx.save(); targetCtx.globalAlpha *= mm.nAlpha;
    drawOrgan(targetCtx, mouthState.spec, 1.0, mouthState.sy, fd.eyeAngleDeg, msTarget);
    targetCtx.restore();
  }}
  const fxSkin = renderPreviewFx(W, H, fd, eyeSrc, tSec, "skin");
  if (fxSkin) targetCtx.drawImage(fxSkin, 0, 0);
  targetCtx.restore();

  // 4) Upper clothes (chest heave spring anchored at waist pivot)
  if (layerVis.upper_clothes) {{
    targetCtx.save();
    targetCtx.translate(wx, wy);
    targetCtx.scale(1.0 + breath * 0.0028, 1.0 + breath * 0.0055);
    targetCtx.translate(-wx, -wy);
    drawLayerBlended("upper_clothes");
    targetCtx.restore();
  }}

  // 5) Front hair & bangs (locked to head + crown)
  if (layerVis.front_hair) {{
    targetCtx.save();
    targetCtx.translate(nx, ny);
    targetCtx.rotate(hRot);
    targetCtx.translate(-nx, -ny + hDy);
    targetCtx.translate(hx, hy);
    targetCtx.rotate(fRot);
    targetCtx.translate(-hx, -hy);
    drawLayerBlended("front_hair");
    targetCtx.restore();
  }}
  const fxTop = renderPreviewFx(W, H, fd, eyeSrc, tSec, "top");
  if (fxTop) {{
    targetCtx.save();
    targetCtx.translate(nx, ny);
    targetCtx.rotate(hRot);
    targetCtx.translate(-nx, -ny + hDy);
    targetCtx.drawImage(fxTop, 0, 0);
    targetCtx.restore();
  }}
  targetCtx.restore();
}}

function createPreviewGlRig(glCanvas) {{
  const gl = glCanvas.getContext("webgl2", {{ alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true }});
  if (!gl) return null;
  const vsSrc = `#version 300 es
precision highp float;
in vec2 aPos;
uniform int uMode;
uniform vec2 uCanvasSize;
uniform vec4 uUvRect;
uniform vec4 uStageRect;
uniform vec2 uBodyDelta;
uniform vec2 uWaist;
uniform vec2 uNeck;
uniform vec2 uHead;
uniform vec4 uRigParams;
uniform vec4 uHairSpan;
uniform vec4 uGaze;
out vec2 vTexCoord;
out vec2 vLocalUv;
vec2 rotAround(vec2 p, vec2 pivot, float ang) {{
  float c = cos(ang), s = sin(ang);
  vec2 d = p - pivot;
  return pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}}
void main() {{
  vLocalUv = aPos;
  vTexCoord = mix(uUvRect.xy, uUvRect.zw, aPos);
  float W = uCanvasSize.x, H = uCanvasSize.y;
  float breath = uRigParams.x, hRot = uRigParams.y, hDy = uRigParams.z, fRot = uRigParams.w;
  float splitY = uHairSpan.x, hairBotY = max(splitY + 120.0, uHairSpan.y);
  float phase = uHairSpan.z, windAmp = uHairSpan.w;
  float gX = uGaze.x, gY = uGaze.y, eyeAng = uGaze.z, sy = uGaze.w;
  vec2 p;
  float headCrownY = mix(uHead.y, uNeck.y, 0.35);
  if (uMode == 0) {{
    vec2 local = (aPos - 0.5) * uStageRect.zw;
    local.y *= sy;
    p = uStageRect.xy + rotAround(local, vec2(0.0), eyeAng) + vec2(gX, gY);
    p.y += hDy;
    p = rotAround(p, uNeck, hRot);
  }} else {{
    p = aPos * uCanvasSize;
    if (uMode == 1) {{
      float hW = 1.0 - smoothstep(headCrownY, max(headCrownY + 20.0, splitY), p.y);
      p += vec2(-0.30 * gX, -0.20 * gY) * hW;
      p.y += hDy; p = rotAround(p, uNeck, hRot); p = rotAround(p, uHead, fRot);
      float tailU = clamp((p.y - splitY) / (hairBotY - splitY), 0.0, 1.0);
      float sCurve = sin(phase - tailU * 2.5) * 0.65 + sin(phase * 1.75 - tailU * 4.1) * 0.35;
      p.x += (tailU * tailU) * windAmp * (sCurve * 7.5 + sin(phase * 0.6) * 2.5);
    }} else if (uMode == 2) {{
      float skirtSpan = max(120.0, (H * 0.90) - uWaist.y);
      float uSkirt = clamp((p.y - uWaist.y) / skirtSpan, 0.0, 1.0);
      float groundLock = 1.0 - smoothstep(0.76, 0.95, aPos.y);
      p.x += (uSkirt * uSkirt * groundLock) * windAmp * sin(phase * 1.15 - uSkirt * 2.2) * 3.8;
    }} else if (uMode == 3) {{
      vec2 d = p - uWaist;
      float dyChest = (p.y - mix(uNeck.y, uWaist.y, 0.50)) / max(80.0, uWaist.y - uNeck.y);
      float waistPin = 1.0 - smoothstep(mix(uNeck.y, uWaist.y, 0.72), uWaist.y, p.y);
      float shoulderPin = smoothstep(uNeck.y - 10.0, mix(uNeck.y, uWaist.y, 0.35), p.y);
      float ribWeight = exp(-dyChest * dyChest * 2.4) * waistPin * shoulderPin;
      p.x += sign(d.x) * min(abs(d.x) / max(1.0, W * 0.25), 1.0) * breath * 1.3 * ribWeight;
      p.y -= breath * 0.65 * ribWeight;
    }} else if (uMode == 4) {{
      float skullGaze = 1.0 - smoothstep(headCrownY, max(headCrownY + 20.0, uNeck.y - 10.0), p.y);
      float neckBlend = 1.0 - smoothstep(uNeck.y - 10.0, uNeck.y + 35.0, p.y);
      p += vec2(gX, gY) * skullGaze;
      p.y += hDy * neckBlend; p = rotAround(p, uNeck, hRot * neckBlend);
    }} else if (uMode == 5) {{
      float hW = 1.0 - smoothstep(headCrownY, max(headCrownY + 20.0, splitY), p.y);
      p += vec2(0.45 * gX, 0.35 * gY) * hW;
      p.y += hDy; p = rotAround(p, uNeck, hRot); p = rotAround(p, uHead, fRot);
      float tipU = clamp((p.y - uHead.y) / max(140.0, splitY - uHead.y), 0.0, 1.0);
      float sideDist = abs(p.x - uHead.x) / max(80.0, W * 0.22);
      p.x += (tipU * tipU * clamp(sideDist, 0.2, 1.0)) * hW * windAmp * sin(phase + 0.4 - tipU * 1.6) * 2.2;
    }}
  }}
  p += uBodyDelta;
  gl_Position = vec4((p.x / W) * 2.0 - 1.0, 1.0 - (p.y / H) * 2.0, 0.0, 1.0);
}}`;
  const fsSrc = `#version 300 es
precision highp float;
in vec2 vTexCoord;
in vec2 vLocalUv;
uniform sampler2D uTex;
uniform sampler2D uTexPrev;
uniform int uLashMode;
uniform vec4 uLashColor;
uniform float uAlpha;
uniform float uMorphMix;
out vec4 outColor;
void main() {{
  if (uLashMode == 1) {{
    float nx = (vLocalUv.x - 0.5) * 2.0;
    float curveY = 0.50 + 0.14 * (1.0 - nx * nx);
    float edgeMask = 1.0 - smoothstep(0.08, 0.22, abs(vLocalUv.y - curveY));
    float taper = 1.0 - smoothstep(0.75, 1.0, abs(nx));
    float a = edgeMask * taper * uAlpha;
    if (a <= 0.002) discard;
    outColor = uLashColor * a;
    return;
  }}
  vec4 col = texture(uTex, vTexCoord);
  if (uMorphMix >= 0.0) {{
    col = mix(texture(uTexPrev, vTexCoord), col, uMorphMix);
  }}
  col *= uAlpha;
  if (col.a <= 0.002) discard;
  outColor = col;
}}`;
  const mkSh = (t, s) => {{ const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; }};
  const prog = gl.createProgram();
  gl.attachShader(prog, mkSh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, mkSh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  const aPosLoc = gl.getAttribLocation(prog, "aPos");

  const COLS = 24, ROWS = 32;
  const verts = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
  let vi = 0;
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) {{ verts[vi++] = c / COLS; verts[vi++] = r / ROWS; }}
  const idx = new Uint16Array(COLS * ROWS * 6);
  let ii = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {{
    const i0 = r * (COLS + 1) + c, i1 = i0 + 1, i2 = i0 + COLS + 1, i3 = i2 + 1;
    idx[ii++] = i0; idx[ii++] = i2; idx[ii++] = i1; idx[ii++] = i1; idx[ii++] = i2; idx[ii++] = i3;
  }}
  const meshVao = gl.createVertexArray();
  gl.bindVertexArray(meshVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPosLoc); gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPosLoc); gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const loc = {{}};
  ["uMode","uCanvasSize","uUvRect","uStageRect","uBodyDelta","uWaist","uNeck","uHead","uRigParams","uHairSpan","uGaze","uTex","uTexPrev","uLashMode","uLashColor","uAlpha","uMorphMix"].forEach(k => loc[k] = gl.getUniformLocation(prog, k));
  const texMap = new Map();
  let atlasTex = null;
  let fxTex = null;
  let fxTopTex = null;
  const uploadTex = (src) => {{
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    return t;
  }};
  const getOrUploadLayer = (mKey, lid) => {{
    const key = `${{mKey}}::${{lid}}`;
    let t = texMap.get(key);
    if (!t) {{ t = uploadTex(reconstructLayer(mKey, lid, true)); texMap.set(key, t); }}
    return t;
  }};
  const hex = (manifest.lashColor || "#3a2220").replace("#", "");
  const lr = (parseInt(hex.slice(0,2),16)||58)/255, lg = (parseInt(hex.slice(2,4),16)||34)/255, lb = (parseInt(hex.slice(4,6),16)||32)/255;

  return {{
    setAtlas(img) {{ atlasTex = uploadTex(img); }},
    warmLayer(mKey, lid) {{ if (atlasTex) getOrUploadLayer(mKey, lid); }},
    render(mood, tSec) {{
      if (!atlasTex) return;
      const {{ W, H, fd, pivots, eyeSrc, syUse, mouthState, gX, gY, eyeIrisX }} = computeFrameEval(mood, tSec);
      const mm = evalMorph(moodMorph && manifest.frames[moodMorph.fromMood] ? moodMorph : null);
      const eyeSyMorph = mm.active ? Math.max(0.08, syUse * mm.eyeCushion) : syUse;
      const windAmp = parseFloat(document.getElementById("rng-wind").value || "0");
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.uniform2f(loc.uCanvasSize, W, H);
      gl.uniform2f(loc.uBodyDelta, springs.bodyX.x, springs.bodyY.x);
      gl.uniform2f(loc.uWaist, pivots.waist[0], pivots.waist[1]);
      gl.uniform2f(loc.uNeck, pivots.neck[0], pivots.neck[1]);
      gl.uniform2f(loc.uHead, pivots.head[0], pivots.head[1]);
      gl.uniform4f(loc.uRigParams, springs.chest.x, springs.headRot.x, springs.headY.x, springs.fHair.x);
      const splitY = Number.isFinite(pivots.hairSplit) ? pivots.hairSplit : pivots.neck[1];
      const botY = Number.isFinite(pivots.hairBottom) ? pivots.hairBottom : H * 0.72;
      gl.uniform4f(loc.uHairSpan, splitY, botY, windPhase, windAmp);
      const ang = ((fd.eyeAngleDeg || 0) * Math.PI) / 180;
      gl.uniform4f(loc.uLashColor, lr, lg, lb, 1.0);
      gl.uniform1i(loc.uTex, 0);
      gl.uniform1i(loc.uTexPrev, 1);

      const drawLayer = (mode, lid) => {{
        if (!layerVis[lid]) return;
        const t = getOrUploadLayer(mood, lid);
        gl.bindVertexArray(meshVao);
        gl.uniform1i(loc.uMode, mode); gl.uniform1i(loc.uLashMode, 0);
        gl.uniform1f(loc.uAlpha, 1.0);
        gl.uniform4f(loc.uUvRect, 0, 0, 1, 1);
        gl.uniform4f(loc.uGaze, gX, gY, 0, 1);
        if (mm.active && layersDiffer(moodMorph.fromMood, mood, lid)) {{
          const pt = getOrUploadLayer(moodMorph.fromMood, lid);
          gl.uniform1f(loc.uMorphMix, mm.s);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pt);
        }} else {{
          gl.uniform1f(loc.uMorphMix, -1.0);
        }}
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }};
      const drawOrg = (spec, stageTarget, sy, gmX, gmY, ix, lash, alpha = 1.0, customAng = ang) => {{
        if (!spec || alpha <= 0.002) return;
        const a = spec.atlas, s = stageTarget || spec.stage;
        gl.bindVertexArray(quadVao);
        gl.uniform1i(loc.uMode, 0); gl.uniform1i(loc.uLashMode, 0);
        gl.uniform1f(loc.uMorphMix, -1.0);
        gl.uniform1f(loc.uAlpha, alpha);
        gl.uniform4f(loc.uUvRect, a.x / atlasImg.width, a.y / atlasImg.height, (a.x + a.w) / atlasImg.width, (a.y + a.h) / atlasImg.height);
        gl.uniform4f(loc.uStageRect, s.cx + ix, s.cy, s.w, s.h);
        gl.uniform4f(loc.uGaze, gX * gmX, gY * gmY, customAng, sy);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (lash && sy < 0.72) {{
          gl.uniform1i(loc.uLashMode, 1);
          gl.uniform1f(loc.uAlpha, alpha);
          gl.uniform4f(loc.uStageRect, s.cx + ix, s.cy, s.w, Math.max(8, s.h * 0.4));
          gl.uniform4f(loc.uGaze, gX * gmX, gY * gmY, customAng, 1.0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }}
      }};

      drawLayer(1, "back_hair");
      drawLayer(2, "lower_body");
      drawLayer(4, "skin_canvas");
      if (mm.active) {{
        const pFd = manifest.frames[moodMorph.fromMood];
        const pEv = computeFrameEval(moodMorph.fromMood, tSec);
        const pAng = ((pFd.eyeAngleDeg || 0) * Math.PI) / 180;
        if (layerVis.left_eye) drawOrg(pEv.eyeSrc.left_eye, pEv.eyeSrc.left_eye ? pEv.eyeSrc.left_eye.stage : null, eyeSyMorph, 1.15, 1.10, eyeIrisX, true, mm.pAlpha, pAng);
        if (layerVis.right_eye) drawOrg(pEv.eyeSrc.right_eye, pEv.eyeSrc.right_eye ? pEv.eyeSrc.right_eye.stage : null, eyeSyMorph, 1.15, 1.10, eyeIrisX, true, mm.pAlpha, pAng);
        if (layerVis.mouth && pFd.organs.mouth) {{
          const pms = pFd.organs.mouth.stage;
          drawOrg(pFd.organs.mouth, {{ cx: pms.cx, cy: pms.cy, w: pms.w, h: pms.h }}, 1.0, 1.0, 1.0, 0, false, mm.pAlpha, pAng);
        }}
      }}
      if (layerVis.left_eye) drawOrg(eyeSrc.left_eye, eyeSrc.left_eye ? eyeSrc.left_eye.stage : null, eyeSyMorph, 1.15, 1.10, eyeIrisX, true, mm.nAlpha, ang);
      if (layerVis.right_eye) drawOrg(eyeSrc.right_eye, eyeSrc.right_eye ? eyeSrc.right_eye.stage : null, eyeSyMorph, 1.15, 1.10, eyeIrisX, true, mm.nAlpha, ang);
      if (layerVis.mouth && mouthState.spec) {{
        const ms = mouthState.spec.stage, rs = fd.organs.mouth ? fd.organs.mouth.stage : ms;
        drawOrg(mouthState.spec, {{ cx: rs.cx, cy: rs.cy, w: ms.w, h: ms.h }}, mouthState.sy, 1.0, 1.0, 0, false, mm.nAlpha, ang);
      }}
      const drawHeadFx = (fxDrawn, isTop) => {{
        if (!fxDrawn) return;
        let t = isTop ? fxTopTex : fxTex;
        if (!t) {{
          t = uploadTex(fxDrawn);
          if (isTop) fxTopTex = t;
          else fxTex = t;
        }} else {{
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fxDrawn);
        }}
        gl.bindVertexArray(meshVao);
        gl.uniform1i(loc.uMode, 4); gl.uniform1i(loc.uLashMode, 0);
        gl.uniform1f(loc.uAlpha, 1.0); gl.uniform1f(loc.uMorphMix, -1.0);
        gl.uniform4f(loc.uUvRect, 0, 0, 1, 1); gl.uniform4f(loc.uGaze, gX, gY, 0, 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }};
      drawHeadFx(renderPreviewFx(W, H, fd, eyeSrc, tSec, "skin"), false);
      drawLayer(3, "upper_clothes");
      drawLayer(5, "front_hair");
      drawHeadFx(renderPreviewFx(W, H, fd, eyeSrc, tSec, "top"), true);
      gl.bindVertexArray(null);
    }}
  }};
}}

const offGrad = document.createElement("canvas");
const offGl = document.createElement("canvas");
const offHard = document.createElement("canvas");
let glRig = null;

function setMood(m) {{
  const prev = curMood;
  const cfOn = (document.getElementById("chk-crossfade") || {{ checked: false }}).checked;
  const durEl = document.getElementById("rng-morph-dur");
  const morphDur = durEl ? parseFloat(durEl.value || "0.45") : 0.45;
  if (cfOn && prev && prev !== m && manifest.frames[prev]) {{
    const effectiveFrom = (moodMorph && (moodMorph.elapsed / Math.max(0.01, moodMorph.duration)) < 0.45 && manifest.frames[moodMorph.fromMood])
      ? moodMorph.fromMood
      : prev;
    moodMorph = {{ fromMood: effectiveFrom, elapsed: 0, duration: morphDur, started: false }};
    if (document.getElementById("chk-breathe").checked) {{
      const k = m.toLowerCase();
      if (/shock|surpris|gasp/.test(k)) {{
        springs.headY.impulse(-2.2); springs.fHair.impulse(0.004); springs.chest.impulse(-0.22);
      }} else if (/happy|laugh|smil|excit/.test(k)) {{
        springs.headY.impulse(1.6); springs.chest.impulse(0.20); springs.fHair.impulse(-0.003);
      }} else if (/sad|cry|tire|worr|shy|embar/.test(k)) {{
        springs.headY.impulse(1.8); springs.headRot.impulse(0.0035);
      }} else if (/angry|determin|annoy/.test(k)) {{
        springs.headY.impulse(1.4); springs.headRot.impulse(-0.003);
      }} else {{
        springs.headY.impulse(1.0);
      }}
    }}
  }} else {{
    moodMorph = null;
  }}
  curMood = m;
  document.querySelectorAll("#mood-grid button").forEach(b => b.classList.toggle("active", b.dataset.mood === m));
  const fd = manifest.frames[m];
  const st = fd.stats;
  document.getElementById("h-mood").textContent = m;
  document.getElementById("h-leaves").textContent = `64:${{st.c64}} | 32:${{st.c32}} | 16:${{st.c16}}`;
  document.getElementById("h-reuse").textContent = `${{st.reusedPct}}%`;
  const selMouth = document.getElementById("sel-talk-mouth");
  if (selMouth) {{
    const locked = manifest.talkMouthMap && manifest.talkMouthMap[m];
    selMouth.value = locked || "__auto_single__";
  }}
}}

function renderLoop(ts) {{
  if (!curMood || !atlasPixels) {{ requestAnimationFrame(renderLoop); return; }}
  const tSec = ts * 0.001;
  const dt = lastTs === null ? 0.016 : Math.min(0.05, Math.max(0.001, (ts - lastTs) * 0.001));
  lastTs = ts;
  stepPhysics(tSec, dt);
  const W = manifest.width, H = manifest.height;
  const useWebGl = Boolean(glRig && document.getElementById("chk-webgl").checked);
  let activeSrc;
  if (useWebGl) {{
    glRig.render(curMood, tSec);
    activeSrc = offGl;
    document.getElementById("h-renderer").textContent = "WebGL2 24×32 + 2.5D";
  }} else {{
    offGrad.width = W; offGrad.height = H;
    const gctx = offGrad.getContext("2d");
    gctx.clearRect(0, 0, W, H);
    composeFrame(gctx, curMood, true, tSec);
    activeSrc = offGrad;
    document.getElementById("h-renderer").textContent = "Canvas2D + 2.5D";
  }}

  const splitOn = document.getElementById("chk-split").checked;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W * 0.5, H * 0.5);
  ctx.scale(zoom, zoom);
  ctx.translate(-W * 0.5 - panX, -H * 0.5 - panY);

  if (splitOn) {{
    offHard.width = W; offHard.height = H;
    const hctx = offHard.getContext("2d");
    hctx.clearRect(0, 0, W, H);
    composeFrame(hctx, curMood, false, tSec);
    const sx = parseFloat(document.getElementById("rng-split").value) * W;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, H); ctx.clip();
    ctx.drawImage(offHard, 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip();
    ctx.drawImage(activeSrc, 0, 0); ctx.restore();
    ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 2 / zoom;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
  }} else {{
    ctx.drawImage(activeSrc, 0, 0);
  }}

  if (document.getElementById("chk-grid").checked) {{
    const fd = manifest.frames[curMood];
    const colMap = {{ 64: "rgba(56,189,248,0.65)", 32: "rgba(52,211,153,0.75)", 16: "rgba(251,191,36,0.85)" }};
    BODY_ORDER.forEach(lid => {{
      if (!layerVis[lid]) return;
      const list = fd.layerBlocks[lid] || [];
      for (let i = 0; i < list.length; i++) {{
        const [dx, dy, sz, , , reused] = list[i];
        ctx.strokeStyle = colMap[sz] || "#fff";
        ctx.lineWidth = (sz === 16 ? 1.1 : 1.5) / zoom;
        ctx.setLineDash(reused ? [4 / zoom, 3 / zoom] : []);
        ctx.strokeRect(dx + 0.5, dy + 0.5, sz - 1, sz - 1);
      }}
    }});
    ctx.setLineDash([]);
  }}

  if (document.getElementById("chk-pivots").checked && curMood && manifest.frames[curMood]) {{
    const fd = manifest.frames[curMood];
    const pv = fd.pivots || {{ waist: [W * 0.5, H * 0.62], neck: [W * 0.5, H * 0.28], head: [W * 0.5, H * 0.2] }};
    const r = 10 / zoom;
    const lw = 2 / zoom;
    const hs = Number.isFinite(pv.hairSplit) ? pv.hairSplit : pv.neck[1];
    ctx.save();
    ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = lw; ctx.setLineDash([8 / zoom, 5 / zoom]);
    ctx.beginPath(); ctx.moveTo(0, hs); ctx.lineTo(W, hs); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${{Math.max(12, Math.round(14 / zoom))}}px system-ui`;
    ctx.fillStyle = "#a78bfa"; ctx.fillText(`hairSplit (${{Math.round(hs)}})`, 18, hs - 6 / zoom);
    [["head", "#38bdf8"], ["neck", "#34d399"], ["waist", "#f59e0b"]].forEach(([k, col]) => {{
      const [px, py] = pv[k];
      ctx.strokeStyle = col; ctx.fillStyle = "rgba(15,23,42,0.85)"; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - r * 1.4, py); ctx.lineTo(px + r * 1.4, py); ctx.moveTo(px, py - r * 1.4); ctx.lineTo(px, py + r * 1.4); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(k, px + r * 1.4, py + 4 / zoom);
    }});
    ctx.restore();
    document.getElementById("pivot-readout").textContent =
      `head=[${{Math.round(pv.head[0])}},${{Math.round(pv.head[1])}}] neck=[${{Math.round(pv.neck[0])}},${{Math.round(pv.neck[1])}}] waist=[${{Math.round(pv.waist[0])}},${{Math.round(pv.waist[1])}}] split=${{Math.round(hs)}}`;
  }}

  ctx.restore();
  requestAnimationFrame(renderLoop);
}}

async function init() {{
  canvas.width = manifest.width;
  canvas.height = manifest.height;
  atlasImg.src = EMBEDDED_ATLAS;
  await new Promise(r => atlasImg.onload = r);
  const ac = document.createElement("canvas");
  ac.width = atlasImg.width; ac.height = atlasImg.height;
  const actx = ac.getContext("2d", {{ willReadFrequently: true }});
  actx.drawImage(atlasImg, 0, 0);
  atlasPixels = actx.getImageData(0, 0, ac.width, ac.height).data;
  atlasW = ac.width;

  const moods = Object.keys(manifest.frames);
  document.getElementById("m-count").textContent = moods.length;
  document.getElementById("s-atlas").textContent = `${{manifest.atlas.width}}×${{manifest.atlas.height}}`;
  document.getElementById("s-kb").textContent = `${{manifest.atlas.kb}} KB`;
  document.getElementById("s-reuse").textContent = `${{manifest.stats.reusedPxPct}}%`;
  document.getElementById("s-tiles").textContent = manifest.atlas.uniqueTiles;
  document.getElementById("s-organs").textContent = manifest.atlas.uniqueOrgans;

  const grid = document.getElementById("mood-grid");
  moods.forEach(m => {{
    const b = document.createElement("button");
    b.textContent = m;
    b.dataset.mood = m;
    b.onclick = () => setMood(m);
    grid.appendChild(b);
  }});

  const lbox = document.getElementById("layer-toggles");
  Object.keys(LAYER_LABELS).forEach(lid => {{
    const row = document.createElement("div");
    row.className = "row"; row.style.margin = "2px 0";
    const lbl = document.createElement("label"); lbl.textContent = LAYER_LABELS[lid];
    const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = true;
    chk.onchange = () => {{ layerVis[lid] = chk.checked; }};
    row.appendChild(lbl); row.appendChild(chk);
    lbox.appendChild(row);
  }});

  document.querySelectorAll("#zoom-grid button").forEach(b => {{
    b.onclick = () => {{
      document.querySelectorAll("#zoom-grid button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      zoom = parseFloat(b.dataset.zoom);
      panX = 0; panY = zoom <= 1.0 ? 0 : -manifest.height * 0.25;
    }};
  }});
  document.getElementById("chk-split").onchange = (e) => {{
    document.getElementById("split-row").style.display = e.target.checked ? "flex" : "none";
  }};
  const origPivots = {{}};
  moods.forEach(m => {{
    origPivots[m] = JSON.parse(JSON.stringify(manifest.frames[m].pivots || {{ waist: [manifest.width * 0.5, manifest.height * 0.62], neck: [manifest.width * 0.5, manifest.height * 0.28], head: [manifest.width * 0.5, manifest.height * 0.2] }}));
  }});

  let activePivotKey = null;
  const toStageCoords = (e) => {{
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * manifest.width;
    const cy = ((e.clientY - rect.top) / Math.max(1, rect.height)) * manifest.height;
    return [
      (cx - manifest.width * 0.5) / zoom + manifest.width * 0.5 + panX,
      (cy - manifest.height * 0.5) / zoom + manifest.height * 0.5 + panY
    ];
  }};

  canvas.onmousedown = (e) => {{
    if (document.getElementById("chk-pivots").checked && curMood && manifest.frames[curMood]) {{
      const [sx, sy] = toStageCoords(e);
      const pv = manifest.frames[curMood].pivots;
      const hitR = 26 / zoom;
      for (const k of ["head", "neck", "waist"]) {{
        const dx = sx - pv[k][0], dy = sy - pv[k][1];
        if (dx * dx + dy * dy <= hitR * hitR) {{ activePivotKey = k; return; }}
      }}
      const hs = Number.isFinite(pv.hairSplit) ? pv.hairSplit : pv.neck[1];
      if (Math.abs(sy - hs) <= 18 / zoom) {{ activePivotKey = "hairSplit"; return; }}
    }}
    if (zoom > 1) {{ dragging = true; dsx = e.clientX; dsy = e.clientY; }}
  }};
  window.onmouseup = () => {{ dragging = false; activePivotKey = null; }};
  window.onmousemove = (e) => {{
    if (activePivotKey && curMood && manifest.frames[curMood]) {{
      const [sx, sy] = toStageCoords(e);
      const pv = manifest.frames[curMood].pivots;
      const cx = Math.round(Math.max(0, Math.min(manifest.width, sx)) * 10) / 10;
      const cy = Math.round(Math.max(0, Math.min(manifest.height, sy)) * 10) / 10;
      if (activePivotKey === "hairSplit") pv.hairSplit = cy;
      else pv[activePivotKey] = [cx, cy];
      return;
    }}
    if (dragging) {{
      panX -= (e.clientX - dsx) / zoom; panY -= (e.clientY - dsy) / zoom;
      dsx = e.clientX; dsy = e.clientY;
    }}
    if (curMood && manifest.frames[curMood]) {{
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {{
        const [stageX, stageY] = toStageCoords(e);
        const hp = (manifest.frames[curMood].pivots && manifest.frames[curMood].pivots.head) || [manifest.width * 0.5, manifest.height * 0.22];
        lookTarget.x = Math.max(-1, Math.min(1, (stageX - hp[0]) / Math.max(180, manifest.width * 0.40)));
        lookTarget.y = Math.max(-1, Math.min(1, (stageY - hp[1]) / Math.max(180, manifest.height * 0.35)));
      }}
    }}
  }};

  document.getElementById("btn-lock-mouth").onclick = () => {{
    if (!curMood) return;
    manifest.talkMouthMap = manifest.talkMouthMap || {{}};
    const val = document.getElementById("sel-talk-mouth").value;
    if (val === "__auto_single__" || val === "__cycle__") delete manifest.talkMouthMap[curMood];
    else if (val === "__current__") manifest.talkMouthMap[curMood] = curMood;
    else manifest.talkMouthMap[curMood] = val;
    document.getElementById("pivot-readout").textContent =
      manifest.talkMouthMap[curMood] ? `Locked talkMouth for ${{curMood}} -> ${{manifest.talkMouthMap[curMood]}}` : `Cleared talkMouth lock for ${{curMood}}`;
  }};

  document.getElementById("btn-reset-pivots").onclick = () => {{
    if (!curMood || !origPivots[curMood]) return;
    manifest.frames[curMood].pivots = JSON.parse(JSON.stringify(origPivots[curMood]));
  }};

  const triggerDownload = (blob, fileName) => {{
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }};

  document.getElementById("btn-export-json").onclick = () => {{
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {{ type: "application/json" }});
    triggerDownload(blob, `${{manifest.character || "character"}}.manifest.json`);
  }};

  document.getElementById("btn-export-vns").onclick = async () => {{
    const resp = await fetch(EMBEDDED_ATLAS);
    const webpBuf = new Uint8Array(await resp.arrayBuffer());
    const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const out = new Uint8Array(12 + jsonBytes.byteLength + webpBuf.byteLength);
    out.set([0x56, 0x4e, 0x53, 0x52], 0);
    const view = new DataView(out.buffer);
    view.setUint16(4, 1, true);
    view.setUint16(6, 0, true);
    view.setUint32(8, jsonBytes.byteLength, true);
    out.set(jsonBytes, 12);
    out.set(webpBuf, 12 + jsonBytes.byteLength);
    const outfitName = manifest.outfit || "Casual";
    triggerDownload(new Blob([out], {{ type: "application/octet-stream" }}), `${{outfitName}}.vnsprite`);
  }};
  document.addEventListener("mouseleave", () => {{ lookTarget.x = 0; lookTarget.y = 0; }});

  offGl.width = manifest.width;
  offGl.height = manifest.height;
  glRig = createPreviewGlRig(offGl);
  if (glRig) glRig.setAtlas(atlasImg);

  document.getElementById("rng-wind").oninput = (e) => {{
    document.getElementById("wind-val").textContent = Math.round(parseFloat(e.target.value) * 100) + "%";
  }};
  document.getElementById("rng-talk-spd").oninput = (e) => {{
    document.getElementById("talk-spd-val").textContent = parseFloat(e.target.value).toFixed(1) + "/s";
  }};
  document.getElementById("rng-morph-dur").oninput = (e) => {{
    document.getElementById("morph-dur-val").textContent = parseFloat(e.target.value).toFixed(2) + "s";
  }};
  document.getElementById("btn-hop").onclick = () => {{
    springs.bodyY.impulse(-200);
    springs.chest.impulse(-2.2);
    springs.headY.impulse(-8.0);
    springs.fHair.impulse(0.045);
    springs.bHair.impulse(0.075);
  }};
  document.getElementById("btn-shake").onclick = () => {{
    springs.bodyX.impulse(260);
    springs.headRot.impulse(-0.045);
    springs.fHair.impulse(-0.055);
    springs.bHair.impulse(-0.085);
  }};
  document.getElementById("rng-fx-int").oninput = (e) => {{
    document.getElementById("fx-int-val").textContent = Math.round(parseFloat(e.target.value) * 100) + "%";
  }};
  document.querySelectorAll("#fx-toggles button").forEach(b => {{
    b.onclick = () => {{
      const k = b.dataset.fx;
      if (activeFx.has(k)) activeFx.delete(k);
      else activeFx.add(k);
      b.classList.toggle("active", activeFx.has(k));
    }};
  }});

  buildVisemeBank();
  const initMood = moods.find(m => m.toLowerCase().includes("neutral")) || moods[0];
  setMood(initMood);
  requestAnimationFrame(renderLoop);

  const warmQueue = [];
  for (const m of moods) {{
    if (m === initMood) continue;
    for (const lid of BODY_ORDER) warmQueue.push([m, lid]);
  }}
  const stepWarm = () => {{
    if (!warmQueue.length || !atlasPixels) return;
    const [m, lid] = warmQueue.shift();
    if (glRig) glRig.warmLayer(m, lid);
    else reconstructLayer(m, lid, true);
    if (warmQueue.length) {{
      if (typeof requestIdleCallback === "function") requestIdleCallback(stepWarm, {{ timeout: 120 }});
      else setTimeout(stepWarm, 24);
    }}
  }};
  setTimeout(stepWarm, 180);
}}
init();
</script>
</body>
</html>"""

