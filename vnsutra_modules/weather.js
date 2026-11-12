import { getGameSettings } from "./runtime-state.js";

const WEATHER_PRESETS = {
    rain: { count: 150, vx: -2.6, vy: 16.5, size: 22, kind: "rain", splash: true },
    snow: { count: 95, vx: 0.45, vy: 1.9, size: 8.5, kind: "snow" },
    cherry_blossoms: { count: 60, vx: 1.35, vy: 1.75, size: 9.0, kind: "petal" },
    embers: { count: 75, vx: 0.25, vy: -2.4, size: 7.5, kind: "ember" }
};

/**
 * High-quality multi-plane 2D weather particle system (`rain`, `snow`, `cherry_blossoms`, `embers`).
 */
class WeatherSystem {
    /**
     * @param {any} gameInstance
     */
    constructor(gameInstance) {
        this.game = gameInstance;
        this.activePreset = null;
        this.intensity = 0.7;
        this.particles = [];
        this.ripples = [];
        this._canvas = null;
        this._ctx = null;
        this._node = null;
        this._rafId = null;
        this._lastTs = 0;
        this._t = 0;
        this._sprites = new Map();
    }

    _getSize() {
        const vp = this.game?.ui?.game?.viewport || this.game?.ui?.game?.container;
        const w = typeof vp?.width === "function" ? vp.width() : 1280;
        const h = typeof vp?.height === "function" ? vp.height() : 720;
        return { w: Math.max(1, Math.round(w || 1280)), h: Math.max(1, Math.round(h || 720)) };
    }

    _getGlowSprite(key, innerColor, midColor, outerColor) {
        if (this._sprites.has(key)) return this._sprites.get(key);
        const doc = globalThis.document;
        if (!doc?.createElement) return null;
        const c = doc.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const sctx = c.getContext("2d");
        if (!sctx) return null;
        const g = sctx.createRadialGradient(16, 16, 1, 16, 16, 15);
        g.addColorStop(0, innerColor);
        g.addColorStop(0.42, midColor);
        g.addColorStop(1, outerColor);
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, 32, 32);
        this._sprites.set(key, c);
        return c;
    }

    _spawnParticle(spec, w, h, randomY = true) {
        const depth = 0.35 + Math.random() * 0.65; // multi-plane parallax [0.35..1.0]
        return {
            x: Math.random() * (w + 120) - 60,
            y: randomY ? Math.random() * h : (spec.vy < 0 ? h + 16 : -20),
            vx: spec.vx * (0.65 + depth * 0.55) + (Math.random() - 0.5) * 0.7,
            vy: spec.vy * (0.55 + depth * 0.65),
            size: spec.size * (0.45 + depth * 0.75),
            depth,
            alpha: 0.35 + depth * 0.6,
            spin: (Math.random() - 0.5) * 3.2,
            phase: Math.random() * Math.PI * 2
        };
    }

    /**
     * Start a weather preset with intensity in [0.1..1.5].
     * @param {string} preset
     * @param {{ intensity?: number }} [options]
     */
    start(preset, { intensity = 0.7 } = {}) {
        const key = String(preset || "").toLowerCase();
        if (key === "off" || key === "none") {
            this.stop();
            return;
        }
        const spec = WEATHER_PRESETS[key];
        if (!spec) {
            return;
        }
        if (getGameSettings?.()?.["accessibility-reduce-motion"]) {
            this.stop();
            return;
        }

        const safeIntensity = Math.min(1.5, Math.max(0.1, Number(intensity) || 0.7));
        this.activePreset = key;
        this.intensity = safeIntensity;
        this.ripples.length = 0;

        const { w, h } = this._getSize();
        const total = Math.max(10, Math.round(spec.count * safeIntensity));
        this.particles = Array.from({ length: total }, () => this._spawnParticle(spec, w, h, true));

        const doc = globalThis.document;
        const Konva = globalThis.Konva;
        const parent = this.game?.ui?.game?.camera || this.game?.ui?.game?.container;

        if (!this._canvas && doc?.createElement) {
            this._canvas = doc.createElement("canvas");
            this._canvas.width = w;
            this._canvas.height = h;
            this._ctx = this._canvas.getContext("2d");
        }
        if (!this._node && Konva?.Image && parent && this._canvas) {
            this._node = new Konva.Image({
                id: "game-weather-overlay",
                image: this._canvas,
                width: w,
                height: h,
                listening: false
            });
            parent.add(this._node);
        }

        if (this._rafId === null && typeof globalThis.requestAnimationFrame === "function") {
            this._lastTs = 0;
            const tick = (ts) => {
                if (!this.activePreset) {
                    this._rafId = null;
                    return;
                }
                const dt = this._lastTs ? Math.min(0.05, Math.max(0.004, (ts - this._lastTs) * 0.001)) : 0.016;
                this._lastTs = ts;
                this.step(dt);
                this._rafId = globalThis.requestAnimationFrame(tick);
            };
            this._rafId = globalThis.requestAnimationFrame(tick);
        }
    }

    /**
     * Advance and draw one frame of weather particles.
     * @param {number} [dt=0.016]
     */
    step(dt = 0.016) {
        const spec = WEATHER_PRESETS[this.activePreset];
        if (!spec) return;

        const { w, h } = this._getSize();
        this._t += dt;
        const scale = dt * 60;
        const ctx = this._ctx;

        if (ctx) {
            ctx.clearRect(0, 0, w, h);
        }

        const snowSprite = spec.kind === "snow"
            ? this._getGlowSprite("snow", "rgba(255,255,255,0.95)", "rgba(226,242,255,0.45)", "rgba(255,255,255,0)")
            : null;
        const emberSprite = spec.kind === "ember"
            ? this._getGlowSprite("ember", "rgba(255,247,237,0.98)", "rgba(251,146,60,0.65)", "rgba(234,88,12,0)")
            : null;

        if (ctx && spec.kind === "ember") {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
        }

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const sway = spec.kind === "petal"
                ? Math.sin(this._t * 1.9 + p.phase) * 0.85 + Math.cos(this._t * 0.9 + p.phase) * 0.35
                : (spec.kind === "snow" || spec.kind === "ember"
                    ? Math.sin(this._t * 1.6 + p.phase) * 0.55
                    : 0);

            p.x += (p.vx + sway) * scale;
            p.y += p.vy * scale;

            if (spec.splash && p.depth > 0.72 && p.y > h * 0.80 && Math.random() < 0.045) {
                this.ripples.push({ x: p.x, y: p.y, r: 2, maxR: 12 + p.depth * 10, a: 0.45 });
                this.particles[i] = this._spawnParticle(spec, w, h, false);
                continue;
            }

            if (p.y > h + 28 || p.y < -28 || p.x > w + 80 || p.x < -80) {
                this.particles[i] = this._spawnParticle(spec, w, h, false);
                continue;
            }

            if (!ctx) continue;

            if (spec.kind === "rain") {
                const dx = p.vx * 1.35;
                const dy = p.size;
                const grad = ctx.createLinearGradient(p.x, p.y, p.x + dx, p.y + dy);
                grad.addColorStop(0, "rgba(186,230,253,0)");
                grad.addColorStop(0.65, `rgba(186,230,253,${(p.alpha * 0.45).toFixed(2)})`);
                grad.addColorStop(1, `rgba(224,242,254,${(p.alpha * 0.85).toFixed(2)})`);
                ctx.strokeStyle = grad;
                ctx.lineWidth = 0.8 + p.depth * 0.9;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + dx, p.y + dy);
                ctx.stroke();
            } else if (spec.kind === "petal") {
                const tumble = 0.25 + 0.75 * Math.abs(Math.cos(this._t * 2.2 + p.phase));
                const s = p.size;
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.phase + this._t * p.spin * 0.35);
                ctx.scale(1, tumble);
                const pg = ctx.createLinearGradient(-s, -s, s, s);
                pg.addColorStop(0, "#fff1f2");
                pg.addColorStop(0.5, "#fbcfe8");
                pg.addColorStop(1, "#f472b6");
                ctx.fillStyle = pg;
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.65);
                ctx.bezierCurveTo(s * 0.85, -s * 0.85, s * 0.95, s * 0.45, 0, s * 0.85);
                ctx.bezierCurveTo(-s * 0.95, s * 0.45, -s * 0.85, -s * 0.85, 0, -s * 0.65);
                ctx.fill();
                ctx.restore();
            } else if (spec.kind === "snow" && snowSprite) {
                const d = p.size * 2;
                ctx.globalAlpha = p.alpha;
                ctx.drawImage(snowSprite, p.x - p.size, p.y - p.size, d, d);
            } else if (spec.kind === "ember" && emberSprite) {
                const flicker = 0.55 + 0.45 * Math.sin(this._t * 7.5 + p.phase);
                const d = p.size * 2.4;
                ctx.globalAlpha = p.alpha * flicker;
                ctx.drawImage(emberSprite, p.x - d * 0.5, p.y - d * 0.5, d, d);
            }
        }

        if (ctx && spec.kind === "ember") {
            ctx.restore();
        }

        // Expanding rainground splash ripples
        if (ctx && this.ripples.length > 0) {
            ctx.save();
            for (let i = this.ripples.length - 1; i >= 0; i--) {
                const rp = this.ripples[i];
                rp.r += 0.95 * scale;
                rp.a -= 0.024 * scale;
                if (rp.a <= 0 || rp.r >= rp.maxR) {
                    this.ripples.splice(i, 1);
                    continue;
                }
                ctx.strokeStyle = `rgba(224,242,254,${rp.a.toFixed(2)})`;
                ctx.lineWidth = 1.1;
                ctx.beginPath();
                ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        if (ctx) {
            ctx.globalAlpha = 1;
        }
        this._node?.getLayer?.()?.batchDraw?.();
    }

    stop() {
        this.activePreset = null;
        this.particles.length = 0;
        this.ripples.length = 0;
        if (this._rafId !== null && typeof globalThis.cancelAnimationFrame === "function") {
            globalThis.cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._ctx && this._canvas) {
            this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        }
        this._node?.getLayer?.()?.batchDraw?.();
    }

    dispose() {
        this.stop();
        this._sprites.clear();
        this._node?.destroy?.();
        this._node = null;
        this._canvas = null;
        this._ctx = null;
    }
}

export { WeatherSystem, WEATHER_PRESETS };
export default WeatherSystem;
