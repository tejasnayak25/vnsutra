/**
 * Audio Utilities
 * 
 * Provides APIs for:
 * - Music playback, stop, and volume control
 * - Sound effect playback
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
     * @param {{ wait?: boolean|number }} [options] - Playback options
     */
    gameInstance.playSFX = async function(track, volume = 1, options = {}) {
        const waitOption = options?.wait;
        const shouldWait = waitOption === true || (Number.isFinite(waitOption) && Number(waitOption) > 0);
        const waitMs = Number.isFinite(waitOption) && Number(waitOption) > 0
            ? Number(waitOption)
            : null;

        if (typeof this.audio?.playSFX === "function") {
            const result = this.audio.playSFX(track, volume, options);
            return Promise.resolve(result);
        }

        // Fallback: create audio element for SFX
        try {
            const sfx = new Audio(track);
            sfx.volume = Math.min(volume * this.sfxVolume, 1);
            const playPromise = sfx.play();

            if (!shouldWait) {
                return Promise.resolve(playPromise).catch(() => Promise.resolve());
            }

            return new Promise((resolve) => {
                let resolved = false;
                let timeoutId = null;

                const resolveOnce = () => {
                    if (resolved) {
                        return;
                    }

                    resolved = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    sfx.removeEventListener("ended", resolveOnce);
                    sfx.removeEventListener("error", resolveOnce);
                    resolve();
                };

                sfx.addEventListener("ended", resolveOnce, { once: true });
                sfx.addEventListener("error", resolveOnce, { once: true });

                if (waitMs !== null) {
                    timeoutId = setTimeout(resolveOnce, waitMs);
                }

                Promise.resolve(playPromise).catch(resolveOnce);
            });
        } catch (e) {
            console.warn("Failed to play SFX:", track, e);
            return Promise.resolve();
        }
    };

    gameInstance._audioInitialized = true;
    return gameInstance;
}

export {
    audioContext,
    initAudioSystem
};
