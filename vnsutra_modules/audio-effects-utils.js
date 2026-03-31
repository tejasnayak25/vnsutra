/**
 * Audio and Effects Utilities
 * 
 * Provides APIs for:
 * - Music playback, stop, and volume control
 * - Sound effect playback
 * - Screen effects (flash, transitions, etc)
 */

/**
 * Audio context for managing music and SFX
 */
const audioContext = {
    currentTrack: null,
    isPlaying: false,
    volume: 1,
    sfxVolume: 1
};

/**
 * Initialize audio system with game instance
 * @param {Object} gameInstance - The game instance
 */
function initAudioSystem(gameInstance) {
    if (!gameInstance || gameInstance._audioInitialized) {
        return gameInstance;
    }

    /**
     * Play background music
     * @param {string} track - Track name or path
     * @param {Object} options - Options: duration, loop, volume, fadeIn
     */
    gameInstance.playMusic = async function(track, options = {}) {
        const { loop = true, volume = 1, fadeIn = 0 } = options;

        // Check if audio asset/player exists
        if (typeof this.audio?.playMusic === "function") {
            return this.audio.playMusic(track, { loop, volume, fadeIn });
        }

        // Fallback: create audio element if needed
        if (!this._musicPlayer) {
            this._musicPlayer = new Audio();
            this._musicPlayer.volume = volume;
        }

        this._musicPlayer.src = track;
        this._musicPlayer.loop = loop;
        this._musicPlayer.volume = volume;

        if (fadeIn > 0) {
            this._musicPlayer.volume = 0;
            this._musicPlayer.play();

            const startTime = Date.now();
            return new Promise((resolve) => {
                const fadeInterval = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / fadeIn, 1);
                    this._musicPlayer.volume = volume * progress;

                    if (progress >= 1) {
                        clearInterval(fadeInterval);
                        resolve();
                    }
                }, 50);
            });
        } else {
            this._musicPlayer.play();
            return Promise.resolve();
        }
    };

    /**
     * Stop music playback
     * @param {number} fadeOut - Fade out duration in ms
     */
    gameInstance.stopMusic = async function(fadeOut = 500) {
        if (typeof this.audio?.stopMusic === "function") {
            return this.audio.stopMusic(fadeOut);
        }

        if (!this._musicPlayer) {
            return Promise.resolve();
        }

        if (fadeOut > 0) {
            const startTime = Date.now();
            const startVolume = this._musicPlayer.volume;

            return new Promise((resolve) => {
                const fadeInterval = setInterval(() => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / fadeOut, 1);
                    this._musicPlayer.volume = startVolume * (1 - progress);

                    if (progress >= 1) {
                        clearInterval(fadeInterval);
                        this._musicPlayer.pause();
                        resolve();
                    }
                }, 50);
            });
        } else {
            this._musicPlayer.pause();
            return Promise.resolve();
        }
    };

    /**
     * Fade music volume
     * @param {number} targetVolume - Target volume (0-1)
     * @param {number} duration - Fade duration in ms
     */
    gameInstance.fadeMusic = async function(targetVolume = 0, duration = 1000) {
        if (typeof this.audio?.fadeMusic === "function") {
            return this.audio.fadeMusic(targetVolume, duration);
        }

        if (!this._musicPlayer) {
            return Promise.resolve();
        }

        const startVolume = this._musicPlayer.volume;
        const startTime = Date.now();

        return new Promise((resolve) => {
            const fadeInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                this._musicPlayer.volume = startVolume + (targetVolume - startVolume) * progress;

                if (progress >= 1) {
                    clearInterval(fadeInterval);
                    this._musicPlayer.volume = targetVolume;
                    resolve();
                }
            }, 50);
        });
    };

    /**
     * Play sound effect
     * @param {string} track - SFX track name or path
     * @param {number} volume - Volume level (0-1)
     */
    gameInstance.playSFX = async function(track, volume = 1) {
        if (typeof this.audio?.playSFX === "function") {
            return this.audio.playSFX(track, volume);
        }

        // Fallback: create audio element for SFX
        try {
            const sfx = new Audio(track);
            sfx.volume = Math.min(volume * this.sfxVolume, 1);
            sfx.play();
            return Promise.resolve();
        } catch (e) {
            console.warn("Failed to play SFX:", track, e);
            return Promise.resolve();
        }
    };

    /**
     * Scene transition effect
     * @param {Object} options - Options: type, color, duration, overlapRatio, fadeInRatio, holdMs
     */
    gameInstance.transitionEffect = async function(options = {}) {
        const {
            type = "fade",
            color = "#000000",
            duration = 500,
            overlapRatio = 0.2,
            fadeInRatio = 0.55,
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

            overlay.stop?.();

            if (typeof overlay.width === "function" && typeof overlay.height === "function") {
                overlay.width(sizeSource.width());
                overlay.height(sizeSource.height());
            }

            overlay.fill(color);
            overlay.opacity(0);
            const layer = overlay.getLayer?.();
            layer?.batchDraw?.();

            const durationMs = Math.max(0, Number(duration) || 0);
            if (durationMs <= 0) {
                return Promise.resolve();
            }

            const safeFadeInRatio = clamp(Number(fadeInRatio) || 0.55, 0.2, 0.8);
            const safeOverlapRatio = clamp(Number(overlapRatio) || 0, 0, 0.9);
            const safeHoldMs = Math.max(0, Number(holdMs) || 0);

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

                    overlay.to({
                        opacity: 0,
                        duration: fadeOutMs / 1000,
                        onFinish: () => {
                            if (this._transitionResolveTimer) {
                                clearTimeout(this._transitionResolveTimer);
                                this._transitionResolveTimer = null;
                            }
                            overlay.opacity(0);
                            layer?.batchDraw?.();
                            resolveOnce();
                        }
                    });
                };

                overlay.to({
                    opacity: 1,
                    duration: fadeInMs / 1000,
                    onFinish: () => {
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

    gameInstance._audioInitialized = true;
    return gameInstance;
}

/**
 * Create effect trigger (for screen flash, particles, etc)
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
    audioContext,
    initAudioSystem,
    triggerEffect
};
