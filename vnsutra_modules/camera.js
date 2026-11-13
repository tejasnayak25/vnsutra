import { getGameSettings } from "./runtime-state.js";

const LIGHTING_PRESETS = {
    day: { color: "#ffffff", strength: 0 },
    sunset: { color: "#ff7a3d", strength: 0.48 },
    night: { color: "#3b5fc4", strength: 0.58 },
    dramatic: { color: "#a33b5c", strength: 0.50 },
    noir: { color: "#64748b", strength: 0.62 }
};

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

/**
 * 2D Stage Camera & Ambient Lighting Controller.
 * Operates on `game.ui.game.camera` (wrapping background + actors) while leaving dialogue/UI untouched.
 */
class CameraController {
    /**
     * @param {any} gameInstance
     */
    constructor(gameInstance) {
        this.game = gameInstance;
        this._tween = null;
        this._bgTween = null;
        this.state = { x: 0, y: 0, zoom: 1, rotation: 0 };
        this.lighting = { ...LIGHTING_PRESETS.day };
        this.parallax = { enabled: true, bgMultiplier: 0.35 };
    }

    /**
     * Configure depth parallax settings.
     * @param {{ enabled?: boolean, bgMultiplier?: number }} [options]
     */
    setParallax({ enabled = true, bgMultiplier = 0.35 } = {}) {
        this.parallax = {
            enabled: Boolean(enabled),
            bgMultiplier: clamp(Number(bgMultiplier) || 0.35, 0, 1)
        };
        return this.parallax;
    }

    _getBgNode() {
        return this.game?.ui?.game?.bg || null;
    }

    _getCameraNode() {
        return this.game?.ui?.game?.camera || null;
    }

    _getStageSize() {
        const vp = this.game?.ui?.game?.viewport || this.game?.ui?.game?.container;
        const w = typeof vp?.width === "function" ? vp.width() : 1280;
        const h = typeof vp?.height === "function" ? vp.height() : 720;
        return { w: Math.max(1, w || 1280), h: Math.max(1, h || 720) };
    }

    _isReducedMotion() {
        return Boolean(getGameSettings?.()?.["accessibility-reduce-motion"]);
    }

    /**
     * Smoothly pan, zoom, and rotate the 2D stage camera.
     * Coordinates with |val| <= 2 are treated as normalized fractions of stage width/height.
     * By default (`clampBounds: true`), zoom >= 1.0 and pan stays strictly inside the 2D background edges.
     * @param {{ x?: number, y?: number, zoom?: number, rotation?: number, duration?: number, easing?: string, clampBounds?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async pan({ x = 0, y = 0, zoom = 1, rotation = 0, duration = 0.8, easing = "EaseInOut", clampBounds = true, parallax = true } = {}) {
        const node = this._getCameraNode();
        const bgNode = this._getBgNode();
        const { w, h } = this._getStageSize();
        const targetRot = Number(rotation) || 0;
        let minZoom = 0.5;
        if (clampBounds) {
            const rad = Math.abs(targetRot) * Math.PI / 180;
            const c = Math.abs(Math.cos(rad));
            const s = Math.abs(Math.sin(rad));
            minZoom = Math.max(1.0, c + (h / w) * s, c + (w / h) * s);
        }
        const targetZoom = clamp(Number(zoom) || 1, minZoom, 3.0);
        let px = Math.abs(x) <= 2 ? x * w : x;
        let py = Math.abs(y) <= 2 ? y * h : y;
        if (clampBounds) {
            const maxPanX = Math.max(0, ((targetZoom - minZoom) / (2 * targetZoom)) * w);
            const maxPanY = Math.max(0, ((targetZoom - minZoom) / (2 * targetZoom)) * h);
            px = clamp(px, -maxPanX, maxPanX) + 0;
            py = clamp(py, -maxPanY, maxPanY) + 0;
        }

        this.state = { x: px, y: py, zoom: targetZoom, rotation: targetRot };

        if (!node) {
            return;
        }

        if (this._tween) {
            this._tween.destroy?.();
            this._tween = null;
        }
        if (this._bgTween) {
            this._bgTween.destroy?.();
            this._bgTween = null;
        }

        const baseX = w * 0.5;
        const baseY = h * 0.5;
        if (typeof node.offsetX === "function") {
            node.offsetX(baseX);
            node.offsetY(baseY);
        }

        const destX = baseX - px * targetZoom;
        const destY = baseY - py * targetZoom;
        const actualDur = this._isReducedMotion() ? 0 : Math.max(0, Number(duration) || 0);
        const Konva = globalThis.Konva;

        // Depth Parallax: Background shifts at a slower rate than camera to simulate distance
        const useParallax = parallax && this.parallax.enabled && !this._isReducedMotion() && bgNode;
        const bgMul = typeof parallax === "number" ? clamp(parallax, 0, 1) : this.parallax.bgMultiplier;
        const bgShiftX = useParallax ? px * (1 - bgMul) : 0;
        const bgShiftY = useParallax ? py * (1 - bgMul) : 0;

        if (actualDur <= 0 || !Konva?.Tween) {
            node.x(destX);
            node.y(destY);
            node.scaleX(targetZoom);
            node.scaleY(targetZoom);
            node.rotation?.(targetRot);
            if (bgNode) {
                bgNode.x?.(bgShiftX);
                bgNode.y?.(bgShiftY);
            }
            node.getLayer?.()?.batchDraw?.();
            return;
        }

        const easingFn = Konva.Easings?.[easing] || Konva.Easings?.EaseInOut;
        const promises = [
            new Promise((resolve) => {
                this._tween = new Konva.Tween({
                    node,
                    duration: actualDur,
                    x: destX,
                    y: destY,
                    scaleX: targetZoom,
                    scaleY: targetZoom,
                    rotation: targetRot,
                    easing: easingFn,
                    onFinish: () => {
                        this._tween = null;
                        resolve();
                    }
                });
                this._tween.play();
            })
        ];

        if (bgNode && (bgNode.x?.() !== bgShiftX || bgNode.y?.() !== bgShiftY)) {
            promises.push(
                new Promise((resolve) => {
                    this._bgTween = new Konva.Tween({
                        node: bgNode,
                        duration: actualDur,
                        x: bgShiftX,
                        y: bgShiftY,
                        easing: easingFn,
                        onFinish: () => {
                            this._bgTween = null;
                            resolve();
                        }
                    });
                    this._bgTween.play();
                })
            );
        }

        await Promise.all(promises);
    }

    /**
     * Focus the camera onto a character actor's upper body/head.
     * @param {any} actor
     * @param {{ zoom?: number, duration?: number, yOffset?: number }} [options]
     * @returns {Promise<void>}
     */
    async focus(actor, { zoom = 1.25, duration = 0.7, yOffset = -0.05 } = {}) {
        if (!actor?.img) {
            return this.pan({ zoom, duration });
        }
        const { w, h } = this._getStageSize();
        const img = actor.img;
        const rawW = (typeof img.width === "function" ? img.width() : 0) * (img.scaleX?.() || 1);
        const rawH = (typeof img.height === "function" ? img.height() : 0) * (img.scaleY?.() || 1);
        const cx = (typeof img.x === "function" ? img.x() : w * 0.5) + rawW * 0.5;
        const cy = (typeof img.y === "function" ? img.y() : h * 0.5) + rawH * 0.30 + yOffset * h;

        const maxPanX = w * 0.38;
        const maxPanY = h * 0.32;
        const panX = clamp(cx - w * 0.5, -maxPanX, maxPanX);
        const panY = clamp(cy - h * 0.5, -maxPanY, maxPanY);
        return this.pan({ x: panX, y: panY, zoom, duration });
    }

    /**
     * Reset camera back to neutral framing.
     * @param {{ duration?: number }} [options]
     * @returns {Promise<void>}
     */
    async reset({ duration = 0.6 } = {}) {
        return this.pan({ x: 0, y: 0, zoom: 1, rotation: 0, duration });
    }

    /**
     * Apply an ambient lighting preset ("day", "sunset", "night", "dramatic", "noir") or hex color
     * to a list of actors.
     * @param {string} presetOrColor
     * @param {number} [strength]
     * @param {Array<any>} [actors]
     */
    setLighting(presetOrColor = "day", strength = undefined, actors = null) {
        const key = String(presetOrColor || "day").toLowerCase();
        const preset = LIGHTING_PRESETS[key];
        const color = preset ? preset.color : (presetOrColor || "#ffffff");
        const finalStrength = clamp(
            strength !== undefined ? Number(strength) : (preset ? preset.strength : 0.45),
            0,
            1
        );
        this.lighting = { color, strength: finalStrength };

        const overlay = this.game?.ui?.game?.lightingOverlay;
        if (overlay) {
            overlay.fill?.(color);
            overlay.opacity?.(finalStrength);
            overlay.getLayer?.()?.batchDraw?.();
        }

        const actorList = Array.isArray(actors) ? actors : Object.values(this.game?.actors || {});
        for (const actor of actorList) {
            actor?.setTint?.(color, finalStrength);
        }
        return this.lighting;
    }

    clearLighting(actors = null) {
        return this.setLighting("day", 0, actors);
    }

    dispose() {
        if (this._tween) {
            this._tween.destroy?.();
            this._tween = null;
        }
        if (this._bgTween) {
            this._bgTween.destroy?.();
            this._bgTween = null;
        }
    }
}

export { CameraController, LIGHTING_PRESETS };

