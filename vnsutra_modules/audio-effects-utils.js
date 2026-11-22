function setupPositionalPan(audioElement, panValue) {
    if (typeof panValue !== "number" || isNaN(panValue)) return null;
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx || typeof audioElement?.addEventListener !== "function") return null;
    try {
        const audioCtx = new AudioCtx();
        if (typeof audioCtx.createStereoPanner !== "function" || typeof audioCtx.createMediaElementSource !== "function") {
            return null;
        }
        const source = audioCtx.createMediaElementSource(audioElement);
        const panner = audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), audioCtx.currentTime);
        source.connect(panner);
        panner.connect(audioCtx.destination);
        return { audioCtx, panner, source };
    } catch {
        return null;
    }
}

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
     * Play sound effect with optional positional stereo panning and BGM auto-ducking.
     * @param {string} track - SFX track name or path
     * @param {number} volume - Volume level (0-1)
     * @param {{ wait?: boolean|number, pan?: number, actor?: any, x?: number, duck?: boolean, duckRatio?: number }} [options] - Playback options
     */
    gameInstance.playSFX = async function(track, volume = 1, options = {}) {
        const waitOption = options?.wait;
        const shouldWait = waitOption === true || (Number.isFinite(waitOption) && Number(waitOption) > 0);
        const waitMs = Number.isFinite(waitOption) && Number(waitOption) > 0
            ? Number(waitOption)
            : null;

        let pan = typeof options?.pan === "number" ? options.pan : null;
        if (pan === null && typeof options?.actor?.data?.x === "number") {
            pan = Math.max(-1, Math.min(1, options.actor.data.x / 640));
        } else if (pan === null && typeof options?.x === "number") {
            pan = Math.max(-1, Math.min(1, options.x / 640));
        }

        const shouldDuck = Boolean(options?.duck);
        if (shouldDuck) {
            this.duckMusic?.(options.duckRatio ?? 0.35, 150);
        }

        if (typeof this.audio?.playSFX === "function") {
            const result = this.audio.playSFX(track, volume, { ...options, pan });
            if (shouldDuck) {
                this.restoreMusic?.(250);
            }
            return Promise.resolve(result);
        }

        // Fallback: create audio element for SFX
        try {
            const sfx = new Audio(track);
            sfx.volume = Math.min(volume * (this.sfxVolume ?? 1), 1);
            setupPositionalPan(sfx, pan);
            const playPromise = sfx.play();

            const cleanup = () => {
                if (shouldDuck) {
                    this.restoreMusic?.(250);
                }
            };

            if (!shouldWait) {
                sfx.addEventListener("ended", cleanup, { once: true });
                sfx.addEventListener("error", cleanup, { once: true });
                return Promise.resolve(playPromise).catch(() => {
                    cleanup();
                    return Promise.resolve();
                });
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
                    cleanup();
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
            if (shouldDuck) {
                this.restoreMusic?.(250);
            }
            console.warn("Failed to play SFX:", track, e);
            return Promise.resolve();
        }
    };

    /**
     * Play a voice line with optional positional panning, speech lip-sync, and auto-BGM ducking.
     * @param {string} track
     * @param {{ volume?: number, actor?: any, pan?: number, duck?: boolean, duckRatio?: number, wait?: boolean }} [options]
     * @returns {Promise<void>}
     */
    gameInstance.playVoice = async function(track, options = {}) {
        if (!track) return Promise.resolve();
        const {
            volume = 1,
            actor = null,
            duck = true,
            duckRatio = 0.35,
            wait = false
        } = options;

        let pan = typeof options.pan === "number" ? options.pan : null;
        if (pan === null && typeof actor?.data?.x === "number") {
            pan = Math.max(-1, Math.min(1, actor.data.x / 640));
        }

        if (duck) {
            this.duckMusic?.(duckRatio, 150);
        }

        try {
            const voice = new Audio(track);
            voice.volume = Math.min(1, Math.max(0, volume * (this.sfxVolume ?? 1)));
            setupPositionalPan(voice, pan);

            if (actor && typeof actor.attachVoice === "function") {
                actor.attachVoice(voice).catch?.(() => {});
            }

            const playPromise = voice.play();

            const cleanup = () => {
                if (duck) {
                    this.restoreMusic?.(250);
                }
                if (actor && typeof actor.detachVoice === "function") {
                    actor.detachVoice();
                }
            };

            voice.addEventListener("ended", cleanup, { once: true });
            voice.addEventListener("error", cleanup, { once: true });

            if (wait) {
                return new Promise((resolve) => {
                    const done = () => {
                        cleanup();
                        resolve();
                    };
                    voice.addEventListener("ended", done, { once: true });
                    voice.addEventListener("error", done, { once: true });
                    Promise.resolve(playPromise).catch(done);
                });
            }

            return Promise.resolve(playPromise).catch(() => Promise.resolve());
        } catch (e) {
            if (duck) this.restoreMusic?.(250);
            return Promise.resolve();
        }
    };

    /**
     * Smoothly ramp an HTMLAudioElement volume from `from` to `to` over `durationMs`.
     */
    function rampAudioVolume(player, from, to, durationMs, onDone) {
        if (!player || durationMs <= 0) {
            if (player) player.volume = Math.min(1, Math.max(0, to));
            onDone?.();
            return Promise.resolve();
        }
        const startTime = Date.now();
        return new Promise((resolve) => {
            const iv = setInterval(() => {
                const p = Math.min((Date.now() - startTime) / durationMs, 1);
                player.volume = Math.min(1, Math.max(0, from + (to - from) * p));
                if (p >= 1) {
                    clearInterval(iv);
                    onDone?.();
                    resolve();
                }
            }, 30);
        });
    }

    /**
     * Crossfade smoothly from the active BGM track to a new track.
     * @param {string} track
     * @param {{ duration?: number, loop?: boolean, volume?: number }} [options]
     */
    gameInstance.crossfadeMusic = async function(track, { duration = 1200, loop = true, volume = 1 } = {}) {
        const targetVol = Math.min(1, Math.max(0, Number(volume) ?? 1));
        const dur = Math.max(0, Number(duration) || 0);
        if (!this._musicPlayer || !track) {
            return this.playMusic(track, { loop, volume: targetVol, fadeIn: dur });
        }
        const outgoing = this._musicPlayer;
        const outVol = outgoing.volume ?? targetVol;
        const incoming = new Audio(track);
        incoming.loop = loop;
        incoming.volume = 0;
        this._musicPlayer = incoming;
        this._musicBaseVolume = targetVol;
        incoming.play?.()?.catch?.(() => {});
        await Promise.all([
            rampAudioVolume(outgoing, outVol, 0, dur, () => outgoing.pause?.()),
            rampAudioVolume(incoming, 0, targetVol, dur)
        ]);
    };

    /**
     * Play looping ambient background sound (BGS) independently of BGM.
     * @param {string} track
     * @param {{ loop?: boolean, volume?: number, fadeIn?: number }} [options]
     */
    gameInstance.playAmbient = async function(track, { loop = true, volume = 0.5, fadeIn = 500 } = {}) {
        if (!track) return;
        if (!this._ambientPlayer) {
            this._ambientPlayer = new Audio();
        }
        const targetVol = Math.min(1, Math.max(0, Number(volume) ?? 0.5));
        this._ambientPlayer.src = track;
        this._ambientPlayer.loop = loop;
        this._ambientPlayer.volume = fadeIn > 0 ? 0 : targetVol;
        this._ambientPlayer.play?.()?.catch?.(() => {});
        if (fadeIn > 0) {
            await rampAudioVolume(this._ambientPlayer, 0, targetVol, fadeIn);
        }
    };

    /**
     * Stop looping ambient sound channel.
     * @param {number} [fadeOut=500]
     */
    gameInstance.stopAmbient = async function(fadeOut = 500) {
        if (!this._ambientPlayer) return;
        const player = this._ambientPlayer;
        await rampAudioVolume(player, player.volume ?? 0.5, 0, Math.max(0, fadeOut), () => player.pause?.());
    };

    /**
     * Temporarily duck BGM volume while voice lines or priority SFX play.
     * @param {number} [duckRatio=0.35]
     * @param {number} [duration=200]
     */
    gameInstance.duckMusic = async function(duckRatio = 0.35, duration = 200) {
        if (!this._musicPlayer) return;
        if (this._musicBaseVolume === undefined) {
            this._musicBaseVolume = this._musicPlayer.volume ?? 1;
        }
        const target = Math.min(1, Math.max(0, this._musicBaseVolume * Math.min(1, Math.max(0, duckRatio))));
        await rampAudioVolume(this._musicPlayer, this._musicPlayer.volume ?? this._musicBaseVolume, target, duration);
    };

    /**
     * Restore BGM volume after voice ducking.
     * @param {number} [duration=350]
     */
    gameInstance.restoreMusic = async function(duration = 350) {
        if (!this._musicPlayer || this._musicBaseVolume === undefined) return;
        await rampAudioVolume(this._musicPlayer, this._musicPlayer.volume ?? 0, this._musicBaseVolume, duration);
    };

    /**
     * Play a lightweight typewriter speech blip (custom URL or Web Audio acoustic tone).
     * Rate-throttled per character index so fast typing stays crisp.
     * @param {{ sound?: string, mode?: "vocal" | "click" | "typewriter" | "synth", pitchHz?: number, pitchVariation?: number, rate?: number, volume?: number, charIndex?: number }} [options]
     */
    gameInstance.playBlip = function({ sound = null, mode = "vocal", pitchHz = 420, pitchVariation = 0.08, rate = 2, volume = 0.25, charIndex = 0 } = {}) {
        const step = Math.max(1, Math.round(Number(rate) || 1));
        if (charIndex % step !== 0) {
            return false;
        }
        const safeVol = Math.min(1, Math.max(0, Number(volume) ?? 0.25)) * (this.sfxVolume ?? 1);
        if (safeVol <= 0.001) {
            return false;
        }
        if (sound && typeof globalThis.Audio === "function") {
            try {
                const a = new globalThis.Audio(sound);
                a.volume = safeVol;
                a.play?.()?.catch?.(() => {});
                return true;
            } catch {
                return false;
            }
        }
        const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioCtx) {
            return false;
        }
        if (!this._blipAudioCtx) {
            this._blipAudioCtx = new AudioCtx();
        }
        const ctx = this._blipAudioCtx;
        if (ctx.state === "suspended" && typeof ctx.resume === "function") {
            ctx.resume().catch?.(() => {});
        }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const jitter = 1 + ((Math.random() * 2 - 1) * Math.max(0, Number(pitchVariation) || 0));

        let duration = 0.038;
        let peakVol = safeVol * 0.22;
        let startFreq = Math.max(80, (Number(pitchHz) || 420) * jitter);
        let endFreq = startFreq * 0.72; // natural 28% downward pitch drop

        if (mode === "click" || mode === "typewriter") {
            // Crisp mechanical key click transient
            osc.type = "sine";
            duration = 0.024;
            peakVol = safeVol * 0.18;
            startFreq = Math.max(120, (Number(pitchHz) || 680) * jitter);
            endFreq = startFreq * 0.35;
        } else if (mode === "synth") {
            // Clean 8-bit retro blip
            osc.type = "triangle";
            duration = 0.045;
            peakVol = safeVol * 0.25;
            endFreq = startFreq;
        } else {
            // Default "vocal": warm, round speech blip (Celeste / Animal Crossing style)
            osc.type = "sine";
            duration = 0.036;
            peakVol = safeVol * 0.20;
            endFreq = startFreq * 0.75;
        }

        // Soft micro-attack (2.5ms) prevents harsh DC discontinuity pop/click
        gain.gain.setValueAtTime(0.0001, now);
        if (typeof gain.gain.linearRampToValueAtTime === "function") {
            gain.gain.linearRampToValueAtTime(peakVol, now + 0.0025);
        } else {
            gain.gain.setValueAtTime(peakVol, now);
        }
        if (typeof gain.gain.exponentialRampToValueAtTime === "function") {
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        }

        // Pitch slide envelope gives percussive warmth
        osc.frequency.setValueAtTime(startFreq, now);
        if (typeof osc.frequency.exponentialRampToValueAtTime === "function" && endFreq !== startFreq) {
            try {
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration * 0.85);
            } catch {
                // fallback
            }
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.005);
        return true;
    };

    gameInstance._audioInitialized = true;
    return gameInstance;
}

export {
    audioContext,
    initAudioSystem
};
