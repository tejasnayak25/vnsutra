/**
 * Visual Effects Utilities
 *
 * Provides APIs for:
 * - Screen transitions
 * - Screen flash, shake, and particles
 */

import { CameraController } from "./camera.js";
import { WeatherSystem } from "./weather.js";

const WIPE_TYPES = new Set(["wipe-left", "wipe-right", "wipe-up", "wipe-down", "iris", "blinds"]);

/**
 * Render a procedural wipe/mask frame onto a 2D canvas context.
 * `progress` = 0 -> transparent, `progress` = 1 -> fully covered by `color`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {string} type
 * @param {number} progress
 * @param {string} [color="#000000"]
 */
function renderWipeFrame(ctx, width, height, type, progress, color = "#000000") {
    if (!ctx || width <= 0 || height <= 0) {
        return;
    }
    const p = Math.min(1, Math.max(0, Number(progress) || 0));
    ctx.clearRect(0, 0, width, height);
    if (p <= 0.001) {
        return;
    }

    ctx.save();
    ctx.fillStyle = color;

    if (p >= 0.999) {
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        return;
    }

    if (type === "wipe-left") {
        ctx.fillRect(0, 0, width * p, height);
    } else if (type === "wipe-right") {
        const w = width * p;
        ctx.fillRect(width - w, 0, w, height);
    } else if (type === "wipe-up") {
        ctx.fillRect(0, 0, width, height * p);
    } else if (type === "wipe-down") {
        const h = height * p;
        ctx.fillRect(0, height - h, width, h);
    } else if (type === "blinds") {
        const slats = 10;
        const slatH = height / slats;
        for (let i = 0; i < slats; i++) {
            ctx.fillRect(0, i * slatH, width, slatH * p + 0.5);
        }
    } else if (type === "iris") {
        const maxR = Math.hypot(width * 0.5, height * 0.5);
        const openR = maxR * (1 - p);
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.arc(width * 0.5, height * 0.5, Math.max(0, openR), 0, Math.PI * 2, true);
        ctx.fill();
    } else {
        ctx.globalAlpha = p;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
}

function initVisualEffectsSystem(gameInstance) {
    if (!gameInstance || gameInstance._visualEffectsInitialized) {
        return gameInstance;
    }
    if (!gameInstance.camera) {
        gameInstance.camera = new CameraController(gameInstance);
    }
    if (!gameInstance.weather) {
        gameInstance.weather = new WeatherSystem(gameInstance);
    }

    /**
     * Scene transition effect
     * @param {Object} options - Options: type, color, duration, overlapRatio, fadeInRatio, holdMs
     */
    gameInstance.transitionEffect = async function(options = {}) {
        const {
            type = "fade",
            color = "#000000",
            duration = 500,
            overlapRatio = 0.45,
            fadeInRatio = 0.5,
            holdMs = 0
        } = options;

        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

        if (typeof this.transition?.execute === "function") {
            return this.transition.execute(type, {
                ...options,
                color,
                duration,
                overlapRatio,
                fadeInRatio,
                holdMs
            });
        }

        // Fallback: in-game fade transition
        if (type === "fade" && duration > 0) {
            const overlay = this.ui?.game?.transitionOverlay;
            const viewport = this.ui?.game?.viewport;
            const container = this.ui?.game?.container;
            const sizeSource = viewport || container;
            if (!overlay || !sizeSource) {
                return Promise.resolve();
            }

            if (typeof this._pendingTransitionResolve === "function") {
                this._pendingTransitionResolve();
                this._pendingTransitionResolve = null;
            }

            if (this._transitionHoldTimer) {
                clearTimeout(this._transitionHoldTimer);
                this._transitionHoldTimer = null;
            }
            if (this._transitionResolveTimer) {
                clearTimeout(this._transitionResolveTimer);
                this._transitionResolveTimer = null;
            }

            this._transitionFadeInTween?.destroy?.();
            this._transitionFadeOutTween?.destroy?.();
            this._transitionFadeInTween = null;
            this._transitionFadeOutTween = null;
            overlay.stop?.();

            if (typeof overlay.width === "function" && typeof overlay.height === "function") {
                overlay.width(sizeSource.width());
                overlay.height(sizeSource.height());
            }

            overlay.fill(color);
            overlay.opacity(0);
            overlay.listening?.(false);
            const layer = overlay.getLayer?.();
            const scheduleFrame = typeof requestAnimationFrame === "function"
                ? requestAnimationFrame
                : (cb) => setTimeout(cb, 16);
            const scheduleDraw = () => {
                if (this._transitionDrawQueued) {
                    return;
                }
                this._transitionDrawQueued = true;
                scheduleFrame(() => {
                    this._transitionDrawQueued = false;
                    layer?.batchDraw?.();
                });
            };

            scheduleDraw();

            const durationMs = Math.max(0, Number(duration) || 0);
            if (durationMs <= 0) {
                return Promise.resolve();
            }

            const safeFadeInRatio = clamp(Number(fadeInRatio) || 0.5, 0.2, 0.8);
            const safeOverlapRatio = clamp(Number(overlapRatio) || 0.45, 0, 0.9);
            const safeHoldMs = Math.max(0, Number(holdMs) || 0);
            const konvaEasings = globalThis?.Konva?.Easings;
            const fadeInEasing = konvaEasings?.EaseInOut ?? konvaEasings?.EaseIn;
            const fadeOutEasing = konvaEasings?.EaseInOut ?? konvaEasings?.EaseOut;

            const fadeInMs = Math.max(1, Math.round(durationMs * safeFadeInRatio));
            const fadeOutMs = Math.max(1, durationMs - fadeInMs);
            const resolveOffsetMs = Math.round(fadeOutMs * (1 - safeOverlapRatio));

            return new Promise((resolve) => {
                let resolved = false;
                const resolveOnce = () => {
                    if (resolved) {
                        return;
                    }
                    resolved = true;
                    this._pendingTransitionResolve = null;
                    resolve();
                };

                this._pendingTransitionResolve = resolveOnce;

                const startFadeOut = () => {
                    if (resolveOffsetMs > 0) {
                        this._transitionResolveTimer = setTimeout(() => {
                            this._transitionResolveTimer = null;
                            resolveOnce();
                        }, resolveOffsetMs);
                    } else {
                        resolveOnce();
                    }

                    this._transitionFadeOutTween = overlay.to({
                        opacity: 0,
                        duration: fadeOutMs / 1000,
                        easing: fadeOutEasing,
                        onUpdate: scheduleDraw,
                        onFinish: () => {
                            this._transitionFadeOutTween = null;
                            if (this._transitionResolveTimer) {
                                clearTimeout(this._transitionResolveTimer);
                                this._transitionResolveTimer = null;
                            }
                            overlay.opacity(0);
                            scheduleDraw();
                            resolveOnce();
                        }
                    });
                };

                this._transitionFadeInTween = overlay.to({
                    opacity: 1,
                    duration: fadeInMs / 1000,
                    easing: fadeInEasing,
                    onUpdate: scheduleDraw,
                    onFinish: () => {
                        this._transitionFadeInTween = null;
                        if (safeHoldMs > 0) {
                            this._transitionHoldTimer = setTimeout(() => {
                                this._transitionHoldTimer = null;
                                startFadeOut();
                            }, safeHoldMs);
                            return;
                        }

                        startFadeOut();
                    }
                });
            });
        }

        if (WIPE_TYPES.has(type) && duration > 0) {
            const overlay = this.ui?.game?.transitionOverlay;
            const viewport = this.ui?.game?.viewport;
            const container = this.ui?.game?.container;
            const sizeSource = viewport || container;
            const Konva = globalThis.Konva;
            const doc = globalThis.document;
            if (!overlay || !sizeSource || !Konva?.Image || !doc?.createElement) {
                return Promise.resolve();
            }

            const w = Math.max(1, Math.round(sizeSource.width?.() || 1280));
            const h = Math.max(1, Math.round(sizeSource.height?.() || 720));
            const wipeCanvas = doc.createElement("canvas");
            wipeCanvas.width = w;
            wipeCanvas.height = h;
            const wipeCtx = wipeCanvas.getContext("2d");
            const parent = overlay.getParent?.();
            const layer = overlay.getLayer?.();
            if (!wipeCtx || !parent) {
                return Promise.resolve();
            }

            const wipeNode = new Konva.Image({
                image: wipeCanvas,
                width: w,
                height: h,
                listening: false
            });
            parent.add(wipeNode);

            const durationMs = Math.max(1, Number(duration) || 500);
            const safeFadeInRatio = clamp(Number(fadeInRatio) || 0.5, 0.2, 0.8);
            const safeOverlapRatio = clamp(Number(overlapRatio) || 0.45, 0, 0.9);
            const safeHoldMs = Math.max(0, Number(holdMs) || 0);
            const fadeInMs = Math.max(1, Math.round(durationMs * safeFadeInRatio));
            const fadeOutMs = Math.max(1, durationMs - fadeInMs);
            const resolveOffsetMs = Math.round(fadeOutMs * (1 - safeOverlapRatio));
            const totalMs = fadeInMs + safeHoldMs + fadeOutMs;
            const scheduleFrame = typeof requestAnimationFrame === "function"
                ? requestAnimationFrame
                : (cb) => setTimeout(() => cb(Date.now()), 16);

            return new Promise((resolve) => {
                const startTs = performance.now();
                let resolved = false;
                const tick = (now) => {
                    const elapsed = Math.max(0, now - startTs);
                    let progress = 0;
                    if (elapsed < fadeInMs) {
                        const t = elapsed / fadeInMs;
                        progress = t * t * (3 - 2 * t);
                    } else if (elapsed < fadeInMs + safeHoldMs) {
                        progress = 1;
                    } else {
                        const outElapsed = elapsed - fadeInMs - safeHoldMs;
                        const t = Math.min(1, outElapsed / fadeOutMs);
                        progress = 1 - t * t * (3 - 2 * t);
                        if (!resolved && outElapsed >= resolveOffsetMs) {
                            resolved = true;
                            resolve();
                        }
                    }

                    renderWipeFrame(wipeCtx, w, h, type, progress, color);
                    layer?.batchDraw?.();

                    if (elapsed < totalMs) {
                        scheduleFrame(tick);
                    } else {
                        wipeNode.destroy?.();
                        layer?.batchDraw?.();
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                    }
                };
                scheduleFrame(tick);
            });
        }

        return Promise.resolve();
    };

    gameInstance._visualEffectsInitialized = true;
    return gameInstance;
}

/**
 * Trigger visual effect helper (for screen flash, particles, etc)
 * @param {Object} gameInstance - The game instance
 * @param {string} effectType - Type of effect
 * @param {Object} options - Effect options
 */
function triggerEffect(gameInstance, effectType, options = {}) {
    if (!gameInstance) {
        return Promise.resolve();
    }

    switch (effectType) {
    case "flash":
        return gameInstance.flash?.(options.color, options.duration) ?? Promise.resolve();
    case "shake":
        return gameInstance.shake?.(options.intensity, options.duration) ?? Promise.resolve();
    case "particles":
        return gameInstance.particles?.(options.x, options.y, options.type, options) ?? Promise.resolve();
    default:
        return Promise.resolve();
    }
}

export {
    initVisualEffectsSystem,
    triggerEffect,
    renderWipeFrame,
    WIPE_TYPES
};
