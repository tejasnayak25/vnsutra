import os
import sys
import json
import base64
import struct

def build_parallax_preview():
    # Load Sakura .vnsprite
    vns_path = 'assets/game-assets/characters/Sakura/Casual.vnsprite'
    data = open(vns_path, 'rb').read()
    jlen = struct.unpack_from('<I', data, 8)[0]
    manifest = json.loads(data[12:12+jlen].decode('utf-8'))
    char_b64 = base64.b64encode(data[12+jlen:]).decode('ascii')

    # Load Backgrounds
    apt_path = 'assets/game-assets/backgrounds/Noraneko_Background_Pack_1/Apartment_Exterior.png'
    apt_b64 = base64.b64encode(open(apt_path, 'rb').read()).decode('ascii')

    futon_path = 'assets/game-assets/backgrounds/Noraneko_Background_Pack_1/Futon_Room.png'
    futon_b64 = base64.b64encode(open(futon_path, 'rb').read()).decode('ascii')

    manifest_json = json.dumps(manifest, separators=(',', ':'))

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>2.5D Depth Parallax Stage Preview — VN-Sutra</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; background: #070b14; color: #f1f5f9;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex; height: 100vh; overflow: hidden;
  }}
  #stage-wrap {{
    flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; background: #020617; padding: 20px;
  }}
  #canvas-container {{
    position: relative; width: 1280px; height: 720px; max-width: 100%; max-height: 90vh;
    aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden;
    box-shadow: 0 25px 60px -15px rgba(0,0,0,0.9);
    border: 1px solid #1e293b; background: #000;
  }}
  canvas {{
    width: 100%; height: 100%; display: block;
  }}
  #hud {{
    position: absolute; top: 16px; left: 16px;
    background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
    border: 1px solid #334155; padding: 10px 14px; border-radius: 8px;
    font-size: 0.74rem; font-family: monospace; color: #cbd5e1; pointer-events: none;
    line-height: 1.5;
  }}
  .sv {{ color: #38bdf8; font-weight: 700; }}
  #panel {{
    width: 390px; min-width: 390px; flex-shrink: 0; background: #0f172a; border-left: 1px solid #1e293b;
    padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;
  }}
  h2 {{ margin: 0; font-size: 1.15rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; }}
  p {{ margin: 4px 0 0; font-size: 0.78rem; color: #94a3b8; line-height: 1.4; }}
  .sec {{ background: #1e293b; padding: 14px; border-radius: 10px; border: 1px solid #334155; }}
  .st {{ font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: #7dd3fc; margin-bottom: 8px; font-weight: 700; }}
  .grid2 {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }}
  .grid3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }}
  button {{
    background: #0f172a; color: #f1f5f9; border: 1px solid #334155;
    padding: 7px 10px; border-radius: 6px; font-size: 0.76rem; cursor: pointer;
    transition: all 0.15s ease;
  }}
  button:hover {{ background: #1e293b; border-color: #0284c7; }}
  button.active {{ background: #0284c7; border-color: #38bdf8; font-weight: 600; }}
  .row {{ display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; margin: 8px 0; }}
  input[type="range"] {{ flex: 1; accent-color: #38bdf8; margin: 0 10px; }}
  input[type="checkbox"] {{ width: 16px; height: 16px; accent-color: #38bdf8; cursor: pointer; }}
  .snippet {{
    background: #090d16; padding: 10px; border-radius: 6px; font-family: monospace;
    font-size: 0.72rem; color: #38bdf8; border: 1px solid #1e293b; word-break: break-all;
    user-select: all; cursor: copy;
  }}
</style>
</head>
<body>

<div id="stage-wrap">
  <div id="canvas-container">
    <canvas id="view" width="1280" height="720"></canvas>
  </div>
  <div id="hud">
    <div>Scene: <span class="sv" id="hud-scene">Apartment Exterior</span></div>
    <div>Camera: <span class="sv" id="hud-cam">x=0 y=0 z=1.20</span></div>
    <div>Background Parallax: <span class="sv" id="hud-bg">shiftX=0 shiftY=0 (0.35x)</span></div>
    <div>Focal Actor: <span class="sv" id="hud-actor">Sakura (1.00x)</span></div>
  </div>
</div>

<div id="panel">
  <div>
    <h2>2.5D Parallax Stage <span style="font-size:0.65rem;background:#0284c7;color:#fff;padding:2px 6px;border-radius:999px;">Live Stage</span></h2>
    <p>Dynamic camera tilt where the entire stage and character move smoothly with mouse tracking while the background counter-shifts at <code>0.35x</code>.</p>
  </div>

  <div class="sec">
    <div class="st">Select Background Scene</div>
    <div class="grid2" id="bg-btns">
      <button data-bg="apt" class="active">Apartment</button>
      <button data-bg="futon">Futon Room</button>
    </div>
  </div>

  <div class="sec">
    <div class="st">Interactive Camera Control</div>
    <div class="row">
      <span>Pan X</span>
      <input type="range" id="rng-pan-x" min="-0.30" max="0.30" step="0.005" value="0">
      <span class="sv" id="val-pan-x">0%</span>
    </div>
    <div class="row">
      <span>Pan Y</span>
      <input type="range" id="rng-pan-y" min="-0.20" max="0.20" step="0.005" value="0">
      <span class="sv" id="val-pan-y">0%</span>
    </div>
    <div class="row">
      <span>Zoom</span>
      <input type="range" id="rng-zoom" min="1.0" max="2.2" step="0.02" value="1.2">
      <span class="sv" id="val-zoom">1.20x</span>
    </div>
    <div class="grid3" style="margin-top:8px;">
      <button id="btn-focus-face">Focus Face</button>
      <button id="btn-focus-stage">Wide Stage</button>
      <button id="btn-reset-cam">Reset</button>
    </div>
  </div>

  <div class="sec">
    <div class="st">Depth Parallax Layer Multipliers</div>
    <div class="row">
      <span>Enable Parallax</span>
      <input type="checkbox" id="chk-parallax" checked>
    </div>
    <div class="row">
      <span>Multiplier</span>
      <input type="range" id="rng-bg-mul" min="0.1" max="0.9" step="0.05" value="0.35">
      <span class="sv" id="val-bg-mul">0.35x</span>
    </div>
    <div class="row">
      <span>Mouse Tilt Parallax</span>
      <input type="checkbox" id="chk-mouse-tilt" checked>
    </div>
  </div>

  <div class="sec">
    <div class="st">Actor Framing &amp; Scale</div>
    <div class="row">
      <span>Framing Preset</span>
      <div style="display:flex;gap:4px;" id="framing-btns">
        <button data-framing="bust" class="active">VN Bust</button>
        <button data-framing="half">Half Body</button>
        <button data-framing="full">Full Body</button>
      </div>
    </div>
    <div class="row">
      <span>Scale Multiplier</span>
      <input type="range" id="rng-char-scale" min="0.30" max="0.75" step="0.01" value="0.52">
      <span class="sv" id="val-char-scale">0.52x</span>
    </div>
    <div class="row">
      <span>Vertical Offset Y</span>
      <input type="range" id="rng-char-y" min="-300" max="200" step="5" value="-15">
      <span class="sv" id="val-char-y">-15px</span>
    </div>
  </div>

  <div class="sec">
    <div class="st">Actor Expressions &amp; FX</div>
    <div class="row">
      <span>Mood</span>
      <div style="display:flex;gap:4px;" id="mood-btns"></div>
    </div>
    <div class="st" style="margin-top:10px;">Procedural Expression FX</div>
    <div class="grid2" id="fx-btns">
      <button data-fx="blush">Blush</button>
      <button data-fx="sweat">Sweat</button>
      <button data-fx="sparkles">Sparkles</button>
      <button data-fx="anger_vein">Anger Vein</button>
      <button data-fx="gloom_lines">Gloom Lines</button>
      <button data-fx="heart_pop">Heart Pop</button>
      <button data-fx="shock_burst">Shock Burst</button>
      <button data-fx="clear">Clear FX</button>
    </div>
  </div>

  <div class="sec">
    <div class="st">Generated .vn Story Script</div>
    <div class="snippet" id="code-snippet">@camera.pan x=0 y=0 zoom=1.20 duration=0.8</div>
    <p style="margin-top:6px;font-size:0.7rem;color:#64748b;">Click snippet to copy into your scene script.</p>
  </div>
</div>

<script>
const manifest = {manifest_json};
const atlasImg = new Image();
atlasImg.src = "data:image/webp;base64,{char_b64}";

const bgImgs = {{
  apt: new Image(),
  futon: new Image()
}};
bgImgs.apt.src = "data:image/png;base64,{apt_b64}";
bgImgs.futon.src = "data:image/png;base64,{futon_b64}";
let curBg = "apt";

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const W = 1280, H = 720;

let curMood = "Smiling";
const activeFx = new Set();
let camX = 0, camY = 0, camZoom = 1.20;
let mouseTiltX = 0, mouseTiltY = 0;
let mouseTargetX = 0, mouseTargetY = 0;
let bgMul = 0.35;
let parallaxEnabled = true;
let charScaleFactor = 0.52;
let charOffsetY = -15;

// Background Selector
document.getElementById("bg-btns").addEventListener("click", e => {{
  const bg = e.target.dataset.bg;
  if (!bg) return;
  curBg = bg;
  document.querySelectorAll("#bg-btns button").forEach(b => b.classList.toggle("active", b.dataset.bg === bg));
  document.getElementById("hud-scene").textContent = bg === "apt" ? "Apartment Exterior" : "Futon Room";
}});

// Framing Presets
document.getElementById("framing-btns").addEventListener("click", e => {{
  const f = e.target.dataset.framing;
  if (!f) return;
  document.querySelectorAll("#framing-btns button").forEach(b => b.classList.toggle("active", b.dataset.framing === f));
  if (f === "bust") {{
    charScaleFactor = 0.52; charOffsetY = -15;
  }} else if (f === "half") {{
    charScaleFactor = 0.42; charOffsetY = 60;
  }} else if (f === "full") {{
    charScaleFactor = 0.30; charOffsetY = 0;
  }}
  document.getElementById("rng-char-scale").value = charScaleFactor;
  document.getElementById("val-char-scale").textContent = `${{charScaleFactor.toFixed(2)}}x`;
  document.getElementById("rng-char-y").value = charOffsetY;
  document.getElementById("val-char-y").textContent = `${{charOffsetY}}px`;
}});

document.getElementById("rng-char-scale").oninput = e => {{
  charScaleFactor = parseFloat(e.target.value);
  document.getElementById("val-char-scale").textContent = `${{charScaleFactor.toFixed(2)}}x`;
}};
document.getElementById("rng-char-y").oninput = e => {{
  charOffsetY = parseFloat(e.target.value);
  document.getElementById("val-char-y").textContent = `${{charOffsetY}}px`;
}};

// Reconstructed Layer Cache
const layerCache = new Map();
function reconstructLayer(mood, layerId) {{
  const key = mood + "::" + layerId;
  if (layerCache.has(key)) return layerCache.get(key);

  const cW = manifest.width, cH = manifest.height, overlap = manifest.overlap;
  const placements = (manifest.frames[mood] && manifest.frames[mood].layerBlocks[layerId]) || [];
  const outC = document.createElement("canvas");
  outC.width = cW; outC.height = cH;
  const octx = outC.getContext("2d");

  for (let i = 0; i < placements.length; i++) {{
    const [dx, dy, sz, ax, ay] = placements[i];
    octx.drawImage(atlasImg, ax + overlap, ay + overlap, sz, sz, dx, dy, sz, sz);
  }}
  layerCache.set(key, outC);
  return outC;
}}

function drawOrgan(targetCtx, organSpec) {{
  if (!organSpec) return;
  const {{ atlas: a, stage: st }} = organSpec;
  targetCtx.drawImage(atlasImg, a.x, a.y, a.w, a.h, st.x, st.y, st.w, st.h);
}}

// Initialize Mood Buttons
const moodBox = document.getElementById("mood-btns");
Object.keys(manifest.frames).slice(0, 4).forEach(m => {{
  const b = document.createElement("button");
  b.textContent = m;
  if (m === curMood) b.classList.add("active");
  b.onclick = () => {{
    curMood = m;
    moodBox.querySelectorAll("button").forEach(btn => btn.classList.toggle("active", btn.textContent === m));
    updateSnippet();
  }};
  moodBox.appendChild(b);
}});

// FX Buttons
document.getElementById("fx-btns").addEventListener("click", e => {{
  const fx = e.target.dataset.fx;
  if (!fx) return;
  if (fx === "clear") activeFx.clear();
  else if (activeFx.has(fx)) activeFx.delete(fx);
  else activeFx.add(fx);
  document.querySelectorAll("#fx-btns button").forEach(b => {{
    if (b.dataset.fx === "clear") return;
    b.classList.toggle("active", activeFx.has(b.dataset.fx));
  }});
  updateSnippet();
}});

function updateSnippet() {{
  const px = Math.round(camX * W);
  const py = Math.round(camY * H);
  const z = camZoom.toFixed(2);
  let cmd = `@camera.pan x=${{px}} y=${{py}} zoom=${{z}} duration=0.8`;
  if (activeFx.size > 0) {{
    cmd += `\\n@actor.fx actor="sakura" fx=${{JSON.stringify([...activeFx])}}`;
  }}
  document.getElementById("code-snippet").textContent = cmd;
}}

// Sliders
document.getElementById("rng-pan-x").oninput = e => {{
  camX = parseFloat(e.target.value);
  document.getElementById("val-pan-x").textContent = `${{Math.round(camX * 100)}}%`;
  updateSnippet();
}};
document.getElementById("rng-pan-y").oninput = e => {{
  camY = parseFloat(e.target.value);
  document.getElementById("val-pan-y").textContent = `${{Math.round(camY * 100)}}%`;
  updateSnippet();
}};
document.getElementById("rng-zoom").oninput = e => {{
  camZoom = parseFloat(e.target.value);
  document.getElementById("val-zoom").textContent = `${{camZoom.toFixed(2)}}x`;
  updateSnippet();
}};
document.getElementById("rng-bg-mul").oninput = e => {{
  bgMul = parseFloat(e.target.value);
  document.getElementById("val-bg-mul").textContent = `${{bgMul.toFixed(2)}}x`;
}};
document.getElementById("chk-parallax").onchange = e => {{
  parallaxEnabled = e.target.checked;
}};

// Focus buttons
document.getElementById("btn-focus-face").onclick = () => {{
  camX = 0.05; camY = -0.12; camZoom = 1.75;
  syncControls();
}};
document.getElementById("btn-focus-stage").onclick = () => {{
  camX = 0; camY = 0; camZoom = 1.0;
  syncControls();
}};
document.getElementById("btn-reset-cam").onclick = () => {{
  camX = 0; camY = 0; camZoom = 1.20;
  syncControls();
}};
function syncControls() {{
  document.getElementById("rng-pan-x").value = camX;
  document.getElementById("rng-pan-y").value = camY;
  document.getElementById("rng-zoom").value = camZoom;
  document.getElementById("val-pan-x").textContent = `${{Math.round(camX * 100)}}%`;
  document.getElementById("val-pan-y").textContent = `${{Math.round(camY * 100)}}%`;
  document.getElementById("val-zoom").textContent = `${{camZoom.toFixed(2)}}x`;
  updateSnippet();
}}

// Mouse Tilt Parallax: Pointer movement moves the camera smoothly
window.addEventListener("mousemove", e => {{
  if (!document.getElementById("chk-mouse-tilt").checked) {{
    mouseTargetX = 0; mouseTargetY = 0;
    return;
  }}
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  mouseTargetX = nx * 0.035;
  mouseTargetY = ny * 0.025;
}});

// Render Loop
function render(now) {{
  requestAnimationFrame(render);
  const tSec = now * 0.001;

  // Smooth mouse tilt interpolation
  mouseTiltX += (mouseTargetX - mouseTiltX) * 0.08;
  mouseTiltY += (mouseTargetY - mouseTiltY) * 0.08;

  const totalPanX = camX + mouseTiltX;
  const totalPanY = camY + mouseTiltY;

  ctx.clearRect(0, 0, W, H);

  // 1. Compute Camera Transformations: The entire stage and character pivot!
  const px = totalPanX * W;
  const py = totalPanY * H;
  const zoom = camZoom;

  const destCamX = (W * 0.5) - px * zoom;
  const destCamY = (H * 0.5) - py * zoom;

  // 2. Compute Depth Parallax Background Shift (counter-shifts relative to camera)
  const bgShiftX = parallaxEnabled ? px * (1 - bgMul) : 0;
  const bgShiftY = parallaxEnabled ? py * (1 - bgMul) : 0;

  // Update HUD
  document.getElementById("hud-cam").textContent = `x=${{Math.round(px)}} y=${{Math.round(py)}} z=${{zoom.toFixed(2)}}`;
  document.getElementById("hud-bg").textContent = `shiftX=${{Math.round(bgShiftX)}} shiftY=${{Math.round(bgShiftY)}} (${{bgMul.toFixed(2)}}x)`;

  ctx.save();
  // Main Camera Pivot Group: MOVES THE ENTIRE STAGE AND CHARACTER
  ctx.translate(destCamX, destCamY);
  ctx.scale(zoom, zoom);
  ctx.translate(-W * 0.5, -H * 0.5);

  // Draw Background with Parallax Shift
  const bgImg = bgImgs[curBg];
  if (bgImg.complete && bgImg.naturalWidth > 0) {{
    ctx.save();
    ctx.translate(bgShiftX, bgShiftY);
    const bgScale = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight) * 1.25;
    const bw = bgImg.naturalWidth * bgScale;
    const bh = bgImg.naturalHeight * bgScale;
    const bx = (W - bw) * 0.5;
    const by = (H - bh) * 0.5;
    ctx.drawImage(bgImg, bx, by, bw, bh);
    ctx.restore();
  }}

  // Draw Rigged Character in the Stage Plane: MOVES WITH THE CAMERA + BREATHES
  if (atlasImg.complete && atlasImg.naturalWidth > 0) {{
    const fd = manifest.frames[curMood] || manifest.frames.Smiling;
    const cW = manifest.width, cH = manifest.height;
    const charScale = charScaleFactor;
    const targetW = cW * charScale;
    const charX = (W - targetW) * 0.5;
    const charY = charOffsetY + Math.sin(tSec * 2.0) * 3.0; // natural breathing bob

    ctx.save();
    ctx.translate(charX, charY);
    ctx.scale(charScale, charScale);

    // 1. Back hair
    ctx.drawImage(reconstructLayer(curMood, "back_hair"), 0, 0);

    // 2. Lower body
    ctx.drawImage(reconstructLayer(curMood, "lower_body"), 0, 0);

    // 3. Skin canvas
    ctx.drawImage(reconstructLayer(curMood, "skin_canvas"), 0, 0);

    // 4. Eyes & Mouth
    if (fd.organs) {{
      drawOrgan(ctx, fd.organs.left_eye);
      drawOrgan(ctx, fd.organs.right_eye);
      drawOrgan(ctx, fd.organs.mouth);
    }}

    // Skin Pass Expression FX (Blush & Gloom Lines under bangs)
    if (fd.organs && fd.organs.left_eye && fd.organs.right_eye) {{
      const L = fd.organs.left_eye.stage, R = fd.organs.right_eye.stage;
      const eyeSpan = Math.hypot(R.cx - L.cx, R.cy - L.cy);
      const u = eyeSpan * 0.42;
      const midX = (L.cx + R.cx) * 0.5, midY = (L.cy + R.cy) * 0.5;

      if (activeFx.has("blush")) {{
        ctx.fillStyle = "rgba(255, 110, 140, 0.45)";
        ctx.beginPath(); ctx.ellipse(L.cx, L.cy + u * 0.65, u * 0.6, u * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(R.cx, R.cy + u * 0.65, u * 0.6, u * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      }}
      if (activeFx.has("gloom_lines")) {{
        const lines = 11, spanW = u * 3.2, lineH = u * 3.1;
        ctx.save();
        ctx.translate(midX, midY - u * 2.55);
        const wash = ctx.createLinearGradient(0, 0, 0, lineH * 0.85);
        wash.addColorStop(0, "rgba(30, 27, 75, 0.58)");
        wash.addColorStop(0.65, "rgba(30, 27, 75, 0.28)");
        wash.addColorStop(1, "rgba(30, 27, 75, 0)");
        ctx.fillStyle = wash; ctx.fillRect(-spanW * 0.55, 0, spanW * 1.1, lineH * 0.85);
        ctx.strokeStyle = "rgba(49, 46, 129, 0.75)"; ctx.lineWidth = Math.max(2.2, u * 0.08);
        for (let i = 0; i < lines; i++) {{
          const lx = (i / (lines - 1) - 0.5) * spanW;
          ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, lineH); ctx.stroke();
        }}
        ctx.restore();
      }}
    }}

    // 5. Upper clothes
    ctx.drawImage(reconstructLayer(curMood, "upper_clothes"), 0, 0);

    // 6. Front hair (bangs lock over skin & gloom lines)
    ctx.drawImage(reconstructLayer(curMood, "front_hair"), 0, 0);

    // Top Pass Expression FX (Sweat, Sparkles, Vein, Hearts, Shock Burst)
    if (fd.organs && fd.organs.left_eye && fd.organs.right_eye) {{
      const L = fd.organs.left_eye.stage, R = fd.organs.right_eye.stage;
      const eyeSpan = Math.hypot(R.cx - L.cx, R.cy - L.cy);
      const u = eyeSpan * 0.42;

      if (activeFx.has("sparkles")) {{
        ctx.fillStyle = "#fef08a";
        ctx.beginPath(); ctx.arc(L.cx - u * 1.1, L.cy - u * 0.6, 6 + Math.sin(tSec * 6) * 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(R.cx + u * 1.1, R.cy - u * 0.6, 6 + Math.cos(tSec * 6) * 3, 0, Math.PI * 2); ctx.fill();
      }}
      if (activeFx.has("heart_pop")) {{
        ctx.fillStyle = "#f43f5e";
        const s = u * 0.5;
        ctx.save(); ctx.translate(R.cx + u * 1.2, R.cy - u * 0.6 - (tSec % 1.2) * 20);
        ctx.beginPath(); ctx.moveTo(0, s * 0.4); ctx.bezierCurveTo(-s, -s * 0.2, -s * 0.5, -s, 0, -s * 0.3); ctx.bezierCurveTo(s * 0.5, -s, s, -s * 0.2, 0, s * 0.4); ctx.fill();
        ctx.restore();
      }}
      if (activeFx.has("anger_vein")) {{
        const r = u * 0.25 * (1 + 0.08 * Math.sin(tSec * 8.5));
        ctx.save(); ctx.translate(L.cx - u * 0.85, L.cy - u * 0.98);
        ctx.strokeStyle = "#dc2626"; ctx.lineWidth = Math.max(1.8, r * 0.22);
        for (let q = 0; q < 4; q++) {{
          ctx.save(); ctx.rotate((q * Math.PI) / 2);
          ctx.beginPath(); ctx.moveTo(r * 0.20, -r * 0.88);
          ctx.quadraticCurveTo(r * 0.22, -r * 0.22, r * 0.88, -r * 0.20); ctx.stroke();
          ctx.restore();
        }}
        ctx.restore();
      }}
    }}

    ctx.restore();
  }}

  ctx.restore();
}}

requestAnimationFrame(render);
</script>
</body>
</html>
"""
    out_dir = 'dist/stage-parallax-preview'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'preview.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Built {out_path} ({len(html)/1024:.1f} KB)")
    return out_path

if __name__ == '__main__':
    build_parallax_preview()
