const FX_TYPES = new Set([
    "blush",
    "sweat",
    "sparkles",
    "anger_vein",
    "gloom_lines",
    "heart_pop",
    "shock_burst"
]);

/**
 * Draw procedural anime facial expression FX onto a `W × H` overlay canvas
 * scaled cleanly from inter-ocular distance (`eyeSpan`).
 * Supports 2-pass layering (`pass: "skin"` for blush/gloom_lines, `"top"` for comic overlays).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   width: number,
 *   height: number,
 *   leftEye?: { cx: number, cy: number, w: number, h: number } | null,
 *   rightEye?: { cx: number, cy: number, w: number, h: number } | null,
 *   headPivot?: [number, number] | null,
 *   eyeAngleDeg?: number,
 *   fxList?: string[],
 *   fxAlphas?: Record<string, number> | null,
 *   intensity?: number,
 *   speed?: number,
 *   tSec?: number,
 *   reduceMotion?: boolean,
 *   pass?: "all" | "skin" | "top"
 * }} params
 */
function renderExpressionFx(ctx, params = {}) {
    const {
        width = 0,
        height = 0,
        leftEye = null,
        rightEye = null,
        headPivot = null,
        eyeAngleDeg = 0,
        fxList = [],
        fxAlphas = null,
        intensity = 0.85,
        speed = 1,
        tSec = 0,
        reduceMotion = false,
        pass = "all"
    } = params;

    if (!ctx || width <= 0 || height <= 0) {
        return;
    }

    ctx.clearRect(0, 0, width, height);

    const active = Array.isArray(fxList)
        ? fxList.map((f) => String(f || "").toLowerCase()).filter((f) => FX_TYPES.has(f))
        : [];
    const alphaFor = (name) => {
        if (fxAlphas && typeof fxAlphas[name] === "number") {
            return Math.min(1, Math.max(0, fxAlphas[name]));
        }
        return active.includes(name) ? 1 : 0;
    };

    const wantsSkin = pass === "all" || pass === "skin";
    const wantsTop = pass === "all" || pass === "top";
    const baseScale = Math.min(1.2, Math.max(0.05, Number(intensity) || 0.85));
    const t = reduceMotion ? 0 : tSec * (Number(speed) || 1);

    const fallbackSpan = Math.max(48, width * 0.14);
    const L = leftEye || { cx: (headPivot?.[0] ?? width * 0.5) - fallbackSpan * 0.5, cy: (headPivot?.[1] ?? height * 0.25) + fallbackSpan * 0.35 };
    const R = rightEye || { cx: (headPivot?.[0] ?? width * 0.5) + fallbackSpan * 0.5, cy: (headPivot?.[1] ?? height * 0.25) + fallbackSpan * 0.35 };
    const eyeSpan = Math.max(40, Math.hypot(R.cx - L.cx, R.cy - L.cy));
    const u = eyeSpan * 0.42;
    const ang = ((eyeAngleDeg || 0) * Math.PI) / 180;
    const midX = (L.cx + R.cx) * 0.5;
    const midY = (L.cy + R.cy) * 0.5;

    const blushA = wantsSkin ? alphaFor("blush") * baseScale : 0;
    if (blushA > 0.01) {
        const pulse = reduceMotion ? 1 : 0.94 + 0.06 * Math.sin(t * 2.2);
        for (const eye of [L, R]) {
            const rx = u * 0.62;
            const ry = u * 0.30;
            ctx.save();
            ctx.translate(eye.cx, eye.cy + u * 0.64);
            ctx.rotate(ang);
            ctx.globalAlpha = Math.min(1, blushA * 0.54 * pulse);
            const g = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
            g.addColorStop(0, "rgba(255, 110, 140, 0.88)");
            g.addColorStop(0.55, "rgba(255, 138, 165, 0.44)");
            g.addColorStop(1, "rgba(255, 138, 165, 0)");
            ctx.fillStyle = g;
            ctx.save();
            ctx.scale(1, ry / rx);
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = "rgba(235, 75, 110, 0.45)";
            ctx.lineWidth = Math.max(1.2, u * 0.032);
            ctx.lineCap = "round";
            for (let k = -1.5; k <= 1.5; k += 1) {
                const ox = k * rx * 0.28;
                ctx.beginPath();
                ctx.moveTo(ox - rx * 0.10, ry * 0.44);
                ctx.lineTo(ox + rx * 0.12, -ry * 0.44);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    const gloomA = wantsSkin ? alphaFor("gloom_lines") * baseScale : 0;
    if (gloomA > 0.01) {
        const lines = 11;
        const spanW = u * 3.2;
        const lineH = u * 3.1;
        const startY = midY - u * 2.55;
        ctx.save();
        ctx.globalAlpha = Math.min(1, gloomA * 0.88);
        ctx.translate(midX, startY);
        ctx.rotate(ang);
        // Forehead dread shadow wash extending from hairline downward
        const wash = ctx.createLinearGradient(0, 0, 0, lineH * 0.85);
        wash.addColorStop(0, "rgba(30, 27, 75, 0.58)");
        wash.addColorStop(0.65, "rgba(30, 27, 75, 0.28)");
        wash.addColorStop(1, "rgba(30, 27, 75, 0)");
        ctx.fillStyle = wash;
        ctx.fillRect(-spanW * 0.55, 0, spanW * 1.1, lineH * 0.85);

        ctx.lineCap = "round";
        for (let i = 0; i < lines; i++) {
            const frac = i / (lines - 1) - 0.5;
            const lx = frac * spanW;
            const bob = reduceMotion ? 0 : Math.sin(t * 2.6 + i * 0.9) * u * 0.08;
            const lg = ctx.createLinearGradient(lx, 0, lx, lineH);
            lg.addColorStop(0, "rgba(15, 23, 42, 0.95)");
            lg.addColorStop(0.55, "rgba(49, 46, 129, 0.65)");
            lg.addColorStop(1, "rgba(49, 46, 129, 0)");
            ctx.strokeStyle = lg;
            ctx.lineWidth = Math.max(2.2, u * (i % 2 === 0 ? 0.095 : 0.06));
            ctx.beginPath();
            ctx.moveTo(lx, bob);
            ctx.lineTo(lx, lineH + bob);
            ctx.stroke();
        }
        ctx.restore();
    }

    const sweatA = wantsTop ? alphaFor("sweat") * baseScale : 0;
    if (sweatA > 0.01) {
        const drops = [
            { phase: 0, scale: 1.0, dx: 0 },
            { phase: 0.34, scale: 0.55, dx: u * 0.24 }
        ];
        for (const d of drops) {
            const cycle = reduceMotion ? 0.35 : (t * 0.58 + d.phase) % 1;
            const dropX = R.cx + u * 1.12 + d.dx;
            const dropY = R.cy - u * 0.72 + cycle * u * 0.86;
            const fade = reduceMotion ? 0.9 : Math.sin(cycle * Math.PI);
            const hDrop = Math.max(11, u * 0.44 * d.scale);
            const wDrop = hDrop * 0.60;
            const stretchY = reduceMotion ? 1 : 0.85 + 0.30 * cycle;
            ctx.save();
            ctx.globalAlpha = Math.min(1, Math.max(0.1, sweatA * fade));
            ctx.translate(dropX, dropY);
            ctx.scale(1 / Math.sqrt(stretchY), stretchY);
            const dg = ctx.createLinearGradient(0, -hDrop * 0.55, 0, hDrop * 0.55);
            dg.addColorStop(0, "#e0f2fe");
            dg.addColorStop(0.55, "#38bdf8");
            dg.addColorStop(1, "#0284c7");
            ctx.fillStyle = dg;
            ctx.strokeStyle = "rgba(15, 45, 80, 0.8)";
            ctx.lineWidth = Math.max(1.2, u * 0.03);
            ctx.beginPath();
            ctx.moveTo(0, -hDrop * 0.55);
            ctx.bezierCurveTo(wDrop * 0.85, 0, wDrop * 0.75, hDrop * 0.55, 0, hDrop * 0.55);
            ctx.bezierCurveTo(-wDrop * 0.75, hDrop * 0.55, -wDrop * 0.85, 0, 0, -hDrop * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
            ctx.beginPath();
            ctx.ellipse(-wDrop * 0.22, hDrop * 0.10, wDrop * 0.14, hDrop * 0.13, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    const veinA = wantsTop ? alphaFor("anger_vein") * baseScale : 0;
    if (veinA > 0.01) {
        const pulse = reduceMotion ? 1 : 1 + 0.08 * Math.sin(t * 8.5);
        const vx = L.cx - u * 0.85;
        const vy = L.cy - u * 0.98;
        const r = Math.max(10, u * 0.25) * pulse;
        ctx.save();
        ctx.globalAlpha = Math.min(1, veinA);
        ctx.translate(vx, vy);
        ctx.rotate(ang - 0.18);
        ctx.lineCap = "round";
        for (const [col, lw] of [["rgba(254, 202, 202, 0.6)", r * 0.34], ["#dc2626", r * 0.18]]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(1.5, lw);
            for (let q = 0; q < 4; q++) {
                ctx.save();
                ctx.rotate((q * Math.PI) / 2);
                ctx.beginPath();
                ctx.moveTo(r * 0.20, -r * 0.88);
                ctx.quadraticCurveTo(r * 0.22, -r * 0.22, r * 0.88, -r * 0.20);
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.restore();
    }

    const sparkA = wantsTop ? alphaFor("sparkles") * baseScale : 0;
    if (sparkA > 0.01) {
        const spots = [
            { x: L.cx - u * 1.15, y: L.cy - u * 0.78, s: u * 0.32, ph: 0 },
            { x: R.cx + u * 1.12, y: R.cy - u * 0.65, s: u * 0.26, ph: 1.7 },
            { x: midX, y: Math.min(L.cy, R.cy) - u * 1.35, s: u * 0.22, ph: 3.1 }
        ];
        for (const sp of spots) {
            const tw = reduceMotion ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(t * 3.2 + sp.ph));
            const r = sp.s * (0.72 + 0.38 * tw);
            ctx.save();
            ctx.globalAlpha = Math.min(1, sparkA * tw);
            ctx.translate(sp.x, sp.y);
            const sg = ctx.createRadialGradient(0, 0, 0.5, 0, 0, r * 1.15);
            sg.addColorStop(0, "rgba(254, 249, 195, 0.92)");
            sg.addColorStop(0.5, "rgba(251, 191, 36, 0.38)");
            sg.addColorStop(1, "rgba(251, 191, 36, 0)");
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#fffbeb";
            ctx.strokeStyle = "rgba(217, 119, 6, 0.85)";
            ctx.lineWidth = Math.max(1.1, r * 0.08);
            ctx.beginPath();
            for (let k = 0; k < 4; k++) {
                const a0 = (k * Math.PI) / 2;
                const a1 = a0 + Math.PI / 4;
                if (k === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
                else ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
                ctx.lineTo(Math.cos(a1) * r * 0.15, Math.sin(a1) * r * 0.15);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    const heartA = wantsTop ? alphaFor("heart_pop") * baseScale : 0;
    if (heartA > 0.01) {
        const hearts = [
            { x: R.cx + u * 1.25, y: R.cy - u * 0.55, s: u * 0.52, ph: 0 },
            { x: L.cx - u * 1.18, y: L.cy - u * 0.78, s: u * 0.36, ph: 0.45 }
        ];
        for (const ht of hearts) {
            const cyc = reduceMotion ? 0.35 : (t * 0.5 + ht.ph) % 1;
            const fade = reduceMotion ? 0.95 : Math.sin(cyc * Math.PI);
            const swayX = reduceMotion ? 0 : Math.sin(t * 3.0 + ht.ph * 6) * u * 0.10;
            const dy = -cyc * u * 0.85;
            const s = ht.s;
            ctx.save();
            ctx.globalAlpha = Math.min(1, heartA * fade);
            ctx.translate(ht.x + swayX, ht.y + dy);
            ctx.rotate(ang + (reduceMotion ? 0 : Math.sin(t * 2.4 + ht.ph) * 0.14));
            const hg = ctx.createLinearGradient(0, -s, 0, s);
            hg.addColorStop(0, "#fda4af");
            hg.addColorStop(1, "#e11d48");
            ctx.fillStyle = hg;
            ctx.strokeStyle = "rgba(159, 18, 57, 0.85)";
            ctx.lineWidth = Math.max(1.4, s * 0.09);
            ctx.beginPath();
            ctx.moveTo(0, s * 0.48);
            ctx.bezierCurveTo(-s * 1.15, -s * 0.2, -s * 0.58, -s * 1.08, 0, -s * 0.38);
            ctx.bezierCurveTo(s * 0.58, -s * 1.08, s * 1.15, -s * 0.2, 0, s * 0.48);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.beginPath();
            ctx.ellipse(-s * 0.34, -s * 0.34, s * 0.16, s * 0.10, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    const shockA = wantsTop ? alphaFor("shock_burst") * baseScale : 0;
    if (shockA > 0.01) {
        const pulse = reduceMotion ? 1 : 0.95 + 0.07 * Math.sin(t * 14);
        const clusters = [
            { cx: L.cx - u * 1.45, cy: L.cy - u * 0.55, dir: -1 },
            { cx: R.cx + u * 1.45, cy: R.cy - u * 0.55, dir: 1 }
        ];
        const angles = [-0.65, -0.22, 0.20, 0.62];
        ctx.save();
        ctx.globalAlpha = Math.min(1, shockA * 0.95);
        ctx.lineCap = "round";
        for (const cl of clusters) {
            for (let k = 0; k < angles.length; k++) {
                const a = (cl.dir > 0 ? angles[k] : Math.PI - angles[k]) + ang;
                const r0 = u * 0.25 * pulse;
                const r1 = u * (k % 2 === 0 ? 0.95 : 0.68) * pulse;
                const x0 = cl.cx + Math.cos(a) * r0;
                const y0 = cl.cy + Math.sin(a) * r0;
                const x1 = cl.cx + Math.cos(a) * r1;
                const y1 = cl.cy + Math.sin(a) * r1;
                ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
                ctx.lineWidth = Math.max(3.5, u * 0.11);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                ctx.strokeStyle = "#fef08a";
                ctx.lineWidth = Math.max(1.8, u * 0.055);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

export { renderExpressionFx, FX_TYPES };
