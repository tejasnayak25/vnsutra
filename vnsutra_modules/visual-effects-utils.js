/**
 * Visual Effects Utilities
 *
 * Provides APIs for:
 * - Screen transitions
 * - Screen flash, shake, and particles
 */

function initVisualEffectsSystem(gameInstance) {
    if (!gameInstance || gameInstance._visualEffectsInitialized) {
        return gameInstance;
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
    triggerEffect
};
