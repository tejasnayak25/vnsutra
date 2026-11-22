import { getGameSettings } from "./runtime-state.js";

const LIGHTING_PRESETS = {
    day: { color: "#ffffff", strength: 0 },
    sunset: { color: "#ff7a3d", strength: 0.48 },
    night: { color: "#3b5fc4", strength: 0.58 },
    dramatic: { color: "#a33b5c", strength: 0.50 },
    noir: { color: "#64748b", strength: 0.62 }
};

const DEFAULT_PARALLAX_DEPTHS = {
    far: 0.2,
    mid: 0.6,
    near: 1.0,
    fore: 1.5
};

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

/**
 * 2D Stage Camera & Ambient Lighting Controller.
 * Operates on `game.ui.game.camera` (wrapping background + actors) while leaving dialogue/UI untouched.
 * Supports 2.5D multi-plane parallax depth, mouse-tilt, and mobile gyro orientation.
 */
class CameraController {
    /**
     * @param {any} gameInstance
     */
    constructor(gameInstance) {
        this.game = gameInstance;
        this._tween = null;
        this._bgTween = null;
        this._planeTweens = [];
        this.state = { x: 0, y: 0, zoom: 1, rotation: 0 };
        this.lighting = { ...LIGHTING_PRESETS.day };
        this.parallax = {
            enabled: true,
            bgMultiplier: 0.35,
            mouseTilt: true,
            maxTiltX: 32,
            maxTiltY: 18,
            smoothing: 0.12
        };
        this._planes = [];
        this._targetTilt = { x: 0, y: 0 };
        this._currentTilt = { x: 0, y: 0 };
        this._rafId = null;
        this._trackingTarget = null;
        this._boundPointerMove = null;
        this._boundPointerLeave = null;
        this._boundOrientation = null;
    }

    /**
     * Configure depth parallax settings.
     * @param {{ enabled?: boolean, bgMultiplier?: number, mouseTilt?: boolean, maxTiltX?: number, maxTiltY?: number, smoothing?: number }} [options]
     */
    setParallax({
        enabled = true,
        bgMultiplier = 0.35,
        mouseTilt = true,
        maxTiltX = 32,
        maxTiltY = 18,
        smoothing = 0.12
    } = {}) {
        this.parallax = {
            enabled: Boolean(enabled),
            bgMultiplier: clamp(Number(bgMultiplier) || 0.35, 0, 1),
            mouseTilt: Boolean(mouseTilt),
            maxTiltX: Math.max(0, Number(maxTiltX) || 32),
            maxTiltY: Math.max(0, Number(maxTiltY) || 18),
            smoothing: clamp(Number(smoothing) || 0.12, 0.01, 1)
        };
        if (!this.parallax.enabled || !this.parallax.mouseTilt || this._isReducedMotion()) {
            this._targetTilt = { x: 0, y: 0 };
            this._currentTilt = { x: 0, y: 0 };
        }
        this._applyPlaneTransforms();
        return this.parallax;
    }

    /**
     * Set active 2.5D background planes for multi-layer parallax depth.
     * @param {Array<{ node: any, depth?: number, baseX?: number, baseY?: number, id?: string }>} planes
     */
    setPlanes(planes) {
        this._planes = Array.isArray(planes) ? [...planes] : [];
        this._applyPlaneTransforms();
        return this._planes;
    }

    getPlanes() {
        return this._planes;
    }

    /**
     * Apply pan and mouse/gyro tilt transforms across all active planes.
     */
    _applyPlaneTransforms() {
        if (!this.parallax.enabled || this._isReducedMotion()) {
            this._currentTilt = { x: 0, y: 0 };
        }

        const tiltX = this._currentTilt.x;
        const tiltY = this._currentTilt.y;
        const maxTiltX = this.parallax.maxTiltX;
        const maxTiltY = this.parallax.maxTiltY;
        const px = this.state.x;
        const py = this.state.y;

        if (this._planes.length > 0) {
            for (const plane of this._planes) {
                const node = plane.node;
                if (!node) continue;
                const depth = plane.depth !== undefined ? plane.depth : 1.0;
                // Optical depth coefficient: (1 - depth).
                // Far (depth < 1): moves with pan/tilt
                // Focal (depth = 1): static relative to camera frame
                // Fore (depth > 1): shifts in reverse past camera lens
                const factor = plane.factor !== undefined ? plane.factor : (1.0 - depth);
                const tiltFactor = plane.tiltFactor !== undefined ? plane.tiltFactor : factor;
                const panShiftX = px * factor;
                const panShiftY = py * factor;
                const tiltShiftX = -tiltX * maxTiltX * tiltFactor;
                const tiltShiftY = -tiltY * maxTiltY * tiltFactor;

                const baseX = Number(plane.baseX) || 0;
                const baseY = Number(plane.baseY) || 0;

                node.x?.(baseX + panShiftX + tiltShiftX);
                node.y?.(baseY + panShiftY + tiltShiftY);
            }
        }

        // Base/legacy background node
        const bgNode = this._getBgNode();
        if (bgNode) {
            const bgMul = this.parallax.bgMultiplier;
            const factor = 1.0 - bgMul;
            const panShiftX = px * factor;
            const panShiftY = py * factor;
            const tiltShiftX = -tiltX * maxTiltX * factor;
            const tiltShiftY = -tiltY * maxTiltY * factor;

            bgNode.x?.(panShiftX + tiltShiftX);
            bgNode.y?.(panShiftY + tiltShiftY);
        }
    }

    /**
     * Start interactive pointer-tilt and device-orientation parallax tracking.
     * @param {HTMLElement} [target]
     */
    initParallaxTracking(target = null) {
        if (typeof window === "undefined") return;
        const el = target || this.game?.ui?.game?.container || document?.body;
        if (!el) return;

        this.stopParallaxTracking();
        this._trackingTarget = el;

        this._boundPointerMove = (e) => {
            if (!this.parallax.enabled || !this.parallax.mouseTilt || this._isReducedMotion()) {
                return;
            }
            let rect = null;
            if (typeof el.getBoundingClientRect === "function") {
                rect = el.getBoundingClientRect();
            } else if (typeof window !== "undefined") {
                rect = { left: 0, top: 0, width: window.innerWidth || 1280, height: window.innerHeight || 720 };
            }
            if (!rect || rect.width <= 0 || rect.height <= 0) return;

            const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX ?? (rect.left + rect.width / 2));
            const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY ?? (rect.top + rect.height / 2));

            const relX = clientX - rect.left;
            const relY = clientY - rect.top;

            let normX = (relX - rect.width * 0.5) / (rect.width * 0.5);
            let normY = (relY - rect.height * 0.5) / (rect.height * 0.5);

            // Circular radial clamping: ensures corner diagonal distance matches edge limit (1.0)
            // preventing the 41% diagonal corner acceleration and reverse drag sensation
            const dist = Math.hypot(normX, normY);
            if (dist > 1.0) {
                normX /= dist;
                normY /= dist;
            } else {
                normX = clamp(normX, -1, 1);
                normY = clamp(normY, -1, 1);
            }

            this._targetTilt.x = normX;
            this._targetTilt.y = normY;
            this._startTiltLoop();
        };

        this._boundPointerLeave = (e) => {
            // Only reset if pointer truly leaves window, not when reaching canvas corners
            if (e && e.relatedTarget) return;
            this._targetTilt.x = 0;
            this._targetTilt.y = 0;
            this._startTiltLoop();
        };

        this._boundOrientation = (e) => {
            if (!this.parallax.enabled || !this.parallax.mouseTilt || this._isReducedMotion()) {
                return;
            }
            const gamma = Number(e.gamma);
            const beta = Number(e.beta);
            if (!Number.isNaN(gamma) && !Number.isNaN(beta)) {
                this._targetTilt.x = clamp(gamma / 30, -1, 1);
                this._targetTilt.y = clamp((beta - 45) / 30, -1, 1);
                this._startTiltLoop();
            }
        };

        if (typeof el.addEventListener === "function") {
            el.addEventListener("pointermove", this._boundPointerMove, { passive: true });
        }
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            // Window-level tracking ensures corners remain active without abrupt pointerleave snapback
            window.addEventListener("pointermove", this._boundPointerMove, { passive: true });
            window.addEventListener("pointerleave", this._boundPointerLeave, { passive: true });
            window.addEventListener("deviceorientation", this._boundOrientation, { passive: true });
            window.addEventListener("blur", this._boundPointerLeave, { passive: true });
        }
    }

    _startTiltLoop() {
        if (this._rafId || typeof requestAnimationFrame === "undefined") return;

        const step = () => {
            const dx = this._targetTilt.x - this._currentTilt.x;
            const dy = this._targetTilt.y - this._currentTilt.y;
            const dist = Math.abs(dx) + Math.abs(dy);

            if (dist < 0.001) {
                this._currentTilt.x = this._targetTilt.x;
                this._currentTilt.y = this._targetTilt.y;
                this._applyPlaneTransforms();
                this._getCameraNode()?.getLayer?.()?.batchDraw?.();
                this._rafId = null;
                return;
            }

            const alpha = this.parallax.smoothing;
            this._currentTilt.x += dx * alpha;
            this._currentTilt.y += dy * alpha;
            this._applyPlaneTransforms();
            this._getCameraNode()?.getLayer?.()?.batchDraw?.();

            this._rafId = requestAnimationFrame(step);
        };

        this._rafId = requestAnimationFrame(step);
    }

    stopParallaxTracking() {
        if (this._rafId && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._trackingTarget && typeof this._trackingTarget.removeEventListener === "function") {
            if (this._boundPointerMove) this._trackingTarget.removeEventListener("pointermove", this._boundPointerMove);
            if (this._boundPointerLeave) this._trackingTarget.removeEventListener("pointerleave", this._boundPointerLeave);
        }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            if (this._boundPointerMove) window.removeEventListener("pointermove", this._boundPointerMove);
            if (this._boundPointerLeave) window.removeEventListener("pointerleave", this._boundPointerLeave);
            if (this._boundOrientation) window.removeEventListener("deviceorientation", this._boundOrientation);
            if (this._boundPointerLeave) window.removeEventListener("blur", this._boundPointerLeave);
        }
        this._trackingTarget = null;
        this._boundPointerMove = null;
        this._boundPointerLeave = null;
        this._boundOrientation = null;
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
            this._applyPlaneTransforms();
            node.getLayer?.()?.batchDraw?.();
            return;
        }

        for (const pt of this._planeTweens) {
            pt.destroy?.();
        }
        this._planeTweens = [];

        const easingFn = Konva?.Easings?.[easing] || Konva?.Easings?.EaseInOut;
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

        if (this._planes.length > 0) {
            for (const plane of this._planes) {
                const pNode = plane.node;
                if (!pNode) continue;
                const depth = plane.depth !== undefined ? plane.depth : 1.0;
                const factor = 1.0 - depth;
                const targetX = (Number(plane.baseX) || 0) + (useParallax ? px * factor : 0);
                const targetY = (Number(plane.baseY) || 0) + (useParallax ? py * factor : 0);
                promises.push(
                    new Promise((resolve) => {
                        const pt = new Konva.Tween({
                            node: pNode,
                            duration: actualDur,
                            x: targetX,
                            y: targetY,
                            easing: easingFn,
                            onFinish: () => resolve()
                        });
                        this._planeTweens.push(pt);
                        pt.play();
                    })
                );
            }
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
     * Subtle or dramatic camera trauma/screen shake.
     * @param {{ intensity?: number, duration?: number, count?: number }} [options]
     * @returns {Promise<void>}
     */
    async shake({ intensity = 10, duration = 0.35, count = 5 } = {}) {
        if (this._isReducedMotion()) return;
        const node = this._getCameraNode();
        if (!node) return;
        const origX = this.state.x;
        const origY = this.state.y;
        const stepDur = Math.max(0.02, duration / (count * 2));
        for (let i = 0; i < count; i++) {
            const decay = (count - i) / count;
            const dx = (Math.random() - 0.5) * 2 * intensity * decay;
            const dy = (Math.random() - 0.5) * 2 * intensity * decay;
            node.x(origX + dx);
            node.y(origY + dy);
            node.getLayer?.()?.batchDraw?.();
            await new Promise((r) => setTimeout(r, stepDur * 1000));
        }
        node.x(origX);
        node.y(origY);
        node.getLayer?.()?.batchDraw?.();
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
        this.stopParallaxTracking();
        if (this._tween) {
            this._tween.destroy?.();
            this._tween = null;
        }
        if (this._bgTween) {
            this._bgTween.destroy?.();
            this._bgTween = null;
        }
        for (const pt of this._planeTweens) {
            pt.destroy?.();
        }
        this._planeTweens = [];
    }
}

export { CameraController, LIGHTING_PRESETS, DEFAULT_PARALLAX_DEPTHS };

