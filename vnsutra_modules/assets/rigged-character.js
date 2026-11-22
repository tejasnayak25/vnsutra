import { getGame, getGameSettings, getShouldAbortGame } from "../runtime-state.js";
import { EVENTS, STORAGE_KEYS } from "../constants.js";
import errorTracking from "../error-tracking.js";
import { RiggedOutfit, parseVnSpriteBuffer, decodeAtlasImage } from "./rigged-outfit.js";

const mediaElementSourceCache = new WeakMap();

function getKonva() {
    return globalThis.Konva;
}

function tweenNode(node, props) {
    const KonvaRef = getKonva();
    const duration = Number(props.duration) || 0;
    if (!KonvaRef?.Tween || duration <= 0 || !node?.getParent?.()) {
        const cleanProps = { ...props };
        delete cleanProps.duration;
        delete cleanProps.easing;
        delete cleanProps.onFinish;
        node?.setAttrs?.(cleanProps);
        props.onFinish?.();
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const userOnFinish = props.onFinish;
        new KonvaRef.Tween({
            ...props,
            node,
            onFinish: () => {
                userOnFinish?.();
                resolve();
            }
        }).play();
    });
}

/**
 * Live-rigged character backed by a binary `.vnsprite` semantic quadtree atlas.
 * Drop-in companion to `Character` (`vnsutra_modules/assets/character.js`) with
 * Konva.Image parity plus automatic lip-sync, eye blinking, breathing, wind, and spring impulses.
 */
class RiggedCharacter {
    /**
     * @param {{ name?: string, folder?: string, x?: number, y?: number, scale?: number }} [options]
     */
    constructor({ name = "", folder = "", x = 0, y = 0, scale = 1 } = {}) {
        this._defaultScale = scale;
        this.data = {
            name,
            folder,
            x,
            y,
            scale,
            opacity: 1,
            blurRadius: 0,
            noise: 0,
            pixelSize: 1,
            brightness: 0,
            contrast: 0,
            hue: 0,
            saturation: 0,
            luminance: 0,
            grayscale: false,
            invert: false
        };

        /** @type {Record<string, RiggedOutfit>} */
        this.outfits = {};
        /** @type {RiggedOutfit | null} */
        this._outfit = null;
        this._initialized = false;
        this._disposed = false;
        this._rafId = null;
        this._lastTs = 0;
        this._elapsedSec = 0;
        this._talkTimer = null;
        this._pendingLoads = new Map();
        this._manualLook = false;
        this._speakerGlancing = false;
        this._audioBinding = null;
        this._rigProps = {
            wind: 0.35,
            breathe: true,
            blink: true,
            gaze: true,
            autoReact: true,
            speakerAttention: true,
            talkMouth: null
        };

        const KonvaRef = getKonva();
        const filters = KonvaRef?.Filters
            ? [
                KonvaRef.Filters.Blur,
                KonvaRef.Filters.Noise,
                KonvaRef.Filters.Pixelate,
                KonvaRef.Filters.Brighten,
                KonvaRef.Filters.Contrast,
                KonvaRef.Filters.HSL
            ].filter(Boolean)
            : [];

        this.img = KonvaRef?.Image
            ? new KonvaRef.Image({
                filters,
                blurRadius: 0,
                noise: 0,
                pixelSize: 1
            })
            : null;

        if (this.img && typeof this.img.on === "function") {
            this.img.on("added", () => this._startLoop());
        }

        this._repositionCallback = () => {
            if (this._disposed || !this.img?.getParent?.() || !this._outfit?.canvas) {
                return;
            }
            const game = getGame();
            const container = game?.ui?.game?.container;
            if (!container) {
                return;
            }
            this.img.x(this.getValue("x", this.data.x));
            this.img.y(this.getValue("y", this.data.y));
        };

        this._dialogHandler = (ev) => {
            if (this._disposed || !this._outfit) return;
            const detail = ev?.detail || {};
            const speaker = detail.speaker;
            const textStr = String(detail.text || "");
            if (speaker && speaker === this.data.name) {
                if (this._speakerGlancing) {
                    this._speakerGlancing = false;
                    if (!this._manualLook) {
                        this._outfit.lookTarget = { x: 0, y: 0 };
                    }
                }
                if (this._rigProps.autoReact && !this._isReduceMotion()) {
                    if (/[!！]/.test(textStr)) {
                        this.hop(115);
                    } else if (/[?？]/.test(textStr)) {
                        this._outfit.springs.headRot.impulse(0.045);
                    }
                }
                if (detail.animating) {
                    this.startTalking();
                } else {
                    const durationMs = Math.min(2400, Math.max(450, textStr.length * 32));
                    this.startTalking({ timeoutMs: durationMs });
                }
            } else {
                this.stopTalking();
                if (
                    speaker &&
                    this._rigProps.speakerAttention &&
                    this._rigProps.gaze &&
                    !this._manualLook &&
                    !this._isReduceMotion() &&
                    this.img?.getParent?.() &&
                    typeof detail.speakerX === "number"
                ) {
                    const dx = detail.speakerX - (Number(this.data.x) || 0);
                    if (Math.abs(dx) > 0.08) {
                        this._speakerGlancing = true;
                        this._outfit.lookTarget = {
                            x: Math.max(-0.8, Math.min(0.8, Math.sign(dx) * 0.65)),
                            y: 0
                        };
                    }
                }
            }
        };

        this._dialogEndHandler = () => {
            if (this._disposed) return;
            this.stopTalking();
            if (this._speakerGlancing) {
                this._speakerGlancing = false;
                if (!this._manualLook && this._outfit) {
                    this._outfit.lookTarget = { x: 0, y: 0 };
                }
            }
        };

        this._accessibilityHandler = () => {
            this._syncReduceMotion();
        };

        this._pointerMoveHandler = (ev) => {
            if (
                this._disposed ||
                this._manualLook ||
                this._speakerGlancing ||
                !this._rigProps.gaze ||
                !this._outfit ||
                !this.img?.getParent?.() ||
                this._isReduceMotion()
            ) {
                return;
            }
            const pt = ev?.touches?.[0] || ev;
            const clientX = Number(pt?.clientX);
            const clientY = Number(pt?.clientY);
            if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
                return;
            }
            const game = getGame();
            const container = game?.ui?.game?.container;
            const vw = globalThis.innerWidth || 1280;
            const vh = globalThis.innerHeight || 720;
            const cw = container?.width?.() || vw;
            const ch = container?.height?.() || vh;
            const rect = this.img.getStage?.()?.content?.getBoundingClientRect?.();
            const px = rect && rect.width > 0 ? ((clientX - rect.left) / rect.width) * cw : (clientX / vw) * cw;
            const py = rect && rect.height > 0 ? ((clientY - rect.top) / rect.height) * ch : (clientY / vh) * ch;

            const curFrame = this._outfit.manifest?.frames?.[this._outfit.currentMood];
            const headPivot = curFrame?.pivots?.head || [this._outfit.manifest?.width * 0.5 || 0, this._outfit.manifest?.height * 0.22 || 0];
            const sc = this.img.scale?.() || { x: 1, y: 1 };
            const headX = (this.img.x?.() || 0) + headPivot[0] * (sc.x || 1);
            const headY = (this.img.y?.() || 0) + headPivot[1] * (sc.y || 1);

            const nx = Math.max(-1, Math.min(1, (px - headX) / Math.max(120, cw * 0.42)));
            const ny = Math.max(-1, Math.min(1, (py - headY) / Math.max(100, ch * 0.42)));
            this._outfit.lookTarget = { x: nx, y: ny };
        };

        this._pointerLeaveHandler = () => {
            if (!this._disposed && !this._manualLook && this._outfit) {
                this._outfit.lookTarget = { x: 0, y: 0 };
            }
        };

        if (typeof globalThis.addEventListener === "function") {
            globalThis.addEventListener("game-ui-ready", this._repositionCallback);
            globalThis.addEventListener(EVENTS.DIALOG, this._dialogHandler);
            globalThis.addEventListener(EVENTS.DIALOG_END, this._dialogEndHandler);
            globalThis.addEventListener(EVENTS.ACCESSIBILITY, this._accessibilityHandler);
            globalThis.addEventListener("pointermove", this._pointerMoveHandler, { passive: true });
            globalThis.addEventListener("pointerleave", this._pointerLeaveHandler);
        }
    }

    /**
     * @returns {boolean}
     */
    _isReduceMotion() {
        const settings = getGameSettings?.();
        return Boolean(settings?.[STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION]);
    }

    _syncReduceMotion() {
        const reduced = this._isReduceMotion();
        if (this._outfit) {
            this._outfit.reduceMotion = reduced;
        }
        if (reduced) {
            this._stopLoop();
            if (this._outfit) {
                this._outfit.stepPhysics(0, this._elapsedSec);
                this._outfit.renderFrame(this._elapsedSec);
                this._refreshKonvaNode();
            }
        } else if (this.img?.getParent?.() && this._outfit) {
            this._startLoop();
        }
    }

    /**
     * @returns {boolean}
     */
    _hasActiveFilters() {
        return (
            this.data.blurRadius > 0 ||
            this.data.noise > 0 ||
            this.data.pixelSize > 1 ||
            this.data.brightness !== 0 ||
            this.data.contrast !== 0 ||
            this.data.hue !== 0 ||
            this.data.saturation !== 0 ||
            this.data.luminance !== 0 ||
            this.data.grayscale ||
            this.data.invert
        );
    }

    _refreshKonvaNode() {
        if (!this.img || this._disposed) {
            return;
        }
        if (this._hasActiveFilters() && typeof this.img.cache === "function") {
            this.img.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
        } else if (typeof this.img.clearCache === "function") {
            this.img.clearCache();
        }
        this.img.getLayer?.()?.batchDraw?.();
    }

    _startLoop() {
        if (this._disposed || this._rafId !== null || this._isReduceMotion()) {
            return;
        }
        if (typeof globalThis.requestAnimationFrame !== "function") {
            return;
        }
        this._lastTs = 0;
        const tick = (ts) => {
            if (this._disposed || this._isReduceMotion()) {
                this._rafId = null;
                return;
            }
            if (!this.img?.getParent?.()) {
                this._rafId = null;
                return;
            }

            if (!this._lastTs) {
                this._lastTs = ts;
            }
            const dt = Math.min(Math.max((ts - this._lastTs) / 1000, 0), 0.05);
            this._lastTs = ts;
            this._elapsedSec += dt;

            if (this._outfit) {
                if (this._audioBinding) {
                    this._outfit.audioMetrics = this._sampleAudioMetrics();
                    if (this._outfit.audioMetrics && this._outfit.audioMetrics.rms >= 0.025) {
                        this._outfit.talk = true;
                    }
                } else {
                    this._outfit.audioMetrics = null;
                }
                this._outfit.stepPhysics(dt, this._elapsedSec);
                this._outfit.renderFrame(this._elapsedSec);
                this._refreshKonvaNode();
            }

            this._rafId = globalThis.requestAnimationFrame(tick);
        };
        this._rafId = globalThis.requestAnimationFrame(tick);
    }

    _stopLoop() {
        if (this._rafId !== null && typeof globalThis.cancelAnimationFrame === "function") {
            globalThis.cancelAnimationFrame(this._rafId);
        }
        this._rafId = null;
        this._lastTs = 0;
    }

    /**
     * Resolve candidate URLs for `<outfit>.vnsprite`.
     * @param {string} outfit
     * @param {string | null} [sourceOverride=null]
     * @returns {string[]}
     */
    _resolveOutfitUrls(outfit, sourceOverride = null) {
        if (typeof sourceOverride === "string" && sourceOverride.length > 0) {
            return [sourceOverride];
        }
        const folder = String(this.data.folder || "").replace(/\/+$/, "");
        const fileName = outfit.endsWith(".vnsprite") ? outfit : `${outfit}.vnsprite`;
        if (!folder) {
            return [`./assets/game-assets/characters/${fileName}`, `./${fileName}`];
        }
        if (/^(?:https?:|blob:|data:|\/|\.\.?\/|assets\/)/i.test(folder)) {
            return [`${folder}/${fileName}`];
        }
        return [`./assets/game-assets/${folder}/${fileName}`, `./${folder}/${fileName}`];
    }

    /**
     * Load a `.vnsprite` outfit bundle from URL or pre-fetched ArrayBuffer.
     * @param {string} outfit
     * @param {string | ArrayBuffer | ArrayBufferView | null} [source=null]
     * @returns {Promise<RiggedOutfit | undefined>}
     */
    async loadOutfit(outfit, source = null) {
        if (this.outfits[outfit] && source === null) {
            return this.outfits[outfit];
        }
        if (source === null && this._pendingLoads.has(outfit)) {
            return this._pendingLoads.get(outfit);
        }

        const runLoad = async () => {
            try {
                if (getShouldAbortGame()) {
                    return undefined;
                }

                let buffer;
                if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
                    buffer = source;
                } else {
                    const candidates = this._resolveOutfitUrls(outfit, typeof source === "string" ? source : null);
                    let lastStatus = 0;
                    let fetched = null;
                    for (const url of candidates) {
                        const response = await fetch(url);
                        if (response.ok) {
                            fetched = await response.arrayBuffer();
                            break;
                        }
                        lastStatus = response.status;
                    }
                    if (!fetched) {
                        throw new Error(`${lastStatus || 404} - Rigged outfit not found (${candidates.join(", ")})`);
                    }
                    buffer = fetched;
                }

                const parsed = parseVnSpriteBuffer(buffer);
                const atlas = await decodeAtlasImage(parsed.atlasBytes);

                const outfitObj = new RiggedOutfit(this.img, outfit, this, {
                    manifest: parsed.manifest,
                    atlas
                });
                outfitObj.reduceMotion = this._isReduceMotion();

                this.outfits[outfit] = outfitObj;
                if (!this._outfit) {
                    this.outfit = outfitObj;
                }
                return outfitObj;
            } catch (error) {
                errorTracking?.captureError(error, {
                    message: "[RiggedCharacter] Failed to load rigged outfit",
                    context: {
                        scope: "assets",
                        component: "rigged-character",
                        outfit,
                        folder: this.data.folder
                    }
                });
                throw error;
            } finally {
                if (source === null) {
                    this._pendingLoads.delete(outfit);
                }
            }
        };

        const promise = runLoad();
        if (source === null) {
            this._pendingLoads.set(outfit, promise);
        }
        return promise;
    }

    /**
     * @returns {RiggedOutfit | null}
     */
    get outfit() {
        return this._outfit;
    }

    /**
     * @param {RiggedOutfit} val
     */
    set outfit(val) {
        const isSameOutfit = this._outfit === val;
        this._outfit = val;
        if (val) {
            val.reduceMotion = this._isReduceMotion();
            val.wind = this._rigProps.wind;
            val.breathe = this._rigProps.breathe;
            val.blink = this._rigProps.blink;
            val.gazeEnabled = this._rigProps.gaze;
            if (this._rigProps.tint) {
                val.setTint(this._rigProps.tint.color, this._rigProps.tint.strength);
            }
            if (this._rigProps.fx) {
                val.setFx(this._rigProps.fx.list, this._rigProps.fx);
            }
            if (val.canvas && this.img) {
                this.img.image(val.canvas);
                if (!isSameOutfit || !this.img.getAttr?.("origScale")) {
                    val.applyInitialLayout(val.canvas);
                }
            }
            if (this.img?.getParent?.() && !val.reduceMotion) {
                this._startLoop();
            }
        }
    }

    /**
     * Apply an ambient lighting tint to the rigged character.
     * @param {string} [color="#ffffff"]
     * @param {number} [strength=0.35]
     * @param {number} [duration=0]
     */
    setTint(color = "#ffffff", strength = 0.35, duration = 0) {
        const s = Math.min(1, Math.max(0, Number(strength) || 0));
        const next = {
            color: color || "#ffffff",
            strength: s
        };
        this._rigProps.tint = next;
        const baseOpacity = typeof this.data.opacity === "number" ? this.data.opacity : 1;
        const targetOpacity = s > 0 ? Math.max(0.35, baseOpacity * (1 - s * 0.75)) : baseOpacity;
        const dur = Number(duration) || 0;

        if (dur > 0 && typeof this.img?.to === "function" && this.img?.getParent?.()) {
            this.img.to({
                opacity: targetOpacity,
                duration: dur,
                onFinish: () => {
                    this._refreshKonvaNode();
                }
            });
            this._startTintTransition(next.color, s, dur);
        } else {
            if (this._tintRaf && typeof globalThis.cancelAnimationFrame === "function") {
                globalThis.cancelAnimationFrame(this._tintRaf);
                this._tintRaf = null;
            }
            this._outfit?.setTint?.(next.color, next.strength);
            this.img?.opacity?.(targetOpacity);
            this._refreshKonvaNode();
        }
    }

    clearTint(duration = 0) {
        this.setTint("#ffffff", 0, duration);
    }

    _startTintTransition(targetColor, targetStrength, duration) {
        if (!this._outfit) return;
        if (this._tintRaf && typeof globalThis.cancelAnimationFrame === "function") {
            globalThis.cancelAnimationFrame(this._tintRaf);
            this._tintRaf = null;
        }
        if (typeof globalThis.requestAnimationFrame !== "function") {
            this._outfit.setTint(targetColor, targetStrength);
            return;
        }

        const startStrength = this._outfit.tint?.strength ?? 0;
        const startTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        const durationMs = duration * 1000;

        const step = (now) => {
            if (this._disposed || !this._outfit) {
                this._tintRaf = null;
                return;
            }
            const currentNow = now || ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
            const elapsed = currentNow - startTime;
            const progress = Math.min(1, Math.max(0, elapsed / durationMs));
            const currentStrength = startStrength + (targetStrength - startStrength) * progress;
            this._outfit.setTint(targetColor, currentStrength);
            if (progress < 1) {
                this._tintRaf = globalThis.requestAnimationFrame(step);
            } else {
                this._tintRaf = null;
            }
        };
        this._tintRaf = globalThis.requestAnimationFrame(step);
    }

    /**
     * Enable procedural expression overlays (`blush`, `sweat`, `sparkles`, `anger_vein`).
     * @param {string[] | string} fxList
     * @param {{ intensity?: number, speed?: number }} [options]
     */
    setFx(fxList = [], options = {}) {
        const list = Array.isArray(fxList) ? fxList : (fxList ? [fxList] : []);
        this._rigProps.fx = { list, ...options };
        this._outfit?.setFx?.(list, options);
    }

    clearFx() {
        this.setFx([]);
    }

    /**
     * @param {string} src
     */
    set mood(src) {
        if (!this._outfit) {
            throw new Error("No outfit set!");
        }
        this._outfit.mood = src;
        this._refreshKonvaNode();
    }

    /**
     * @returns {string | null}
     */
    get mood() {
        return this._outfit?.mood || null;
    }

    /**
     * Enable speaking lip-sync animation for this character.
     * @param {{ mood?: string | null, timeoutMs?: number }} [options]
     */
    startTalking({ mood = null, timeoutMs = 0 } = {}) {
        if (this._talkTimer) {
            clearTimeout(this._talkTimer);
            this._talkTimer = null;
        }
        if (this._outfit) {
            this._outfit.talkMouth = mood ?? this._rigProps.talkMouth ?? null;
            this._outfit.talk = true;
            if (this._isReduceMotion()) {
                this._outfit.renderFrame(this._elapsedSec);
                this._refreshKonvaNode();
            }
        }
        if (timeoutMs > 0) {
            this._talkTimer = setTimeout(() => {
                this._talkTimer = null;
                this.stopTalking();
            }, timeoutMs);
        }
    }

    /**
     * Stop speaking lip-sync animation and return mouth to rest pose.
     */
    stopTalking() {
        if (this._talkTimer) {
            clearTimeout(this._talkTimer);
            this._talkTimer = null;
        }
        if (this._outfit) {
            this._outfit.talk = false;
            this._outfit.talkMouth = null;
            this._outfit.renderFrame(this._elapsedSec);
            this._refreshKonvaNode();
        }
    }

    /**
     * Trigger vertical spring hop impulse.
     * @param {number} [strength=210]
     */
    hop(strength = 210) {
        this._outfit?.hop(strength);
    }

    /**
     * Trigger horizontal spring startle impulse.
     * @param {number} [strength=360]
     */
    shake(strength = 360) {
        this._outfit?.shake(strength);
    }

    /**
     * Adjust ambient hair wind strength (0..2).
     * @param {number} level
     */
    setWind(level) {
        this.wind = level;
    }

    /**
     * Override preferred mouth expression used during lip-sync (`null` resets to auto visemes).
     * @param {string | null} mood
     */
    setTalkMouth(mood) {
        this.talkMouth = mood;
    }

    /**
     * Aim eyes & 2.5D head tilt toward normalized coordinates `(-1..1, -1..1)`.
     * Locks cursor tracking until `clearLookAt()` is called.
     * @param {number} [x=0]
     * @param {number} [y=0]
     */
    lookAt(x = 0, y = 0) {
        this._manualLook = true;
        if (this._outfit) {
            this._outfit.lookTarget = {
                x: Math.max(-1, Math.min(1, Number(x) || 0)),
                y: Math.max(-1, Math.min(1, Number(y) || 0))
            };
        }
    }

    /**
     * Release manual `lookAt` lock and re-center/resume passive pointer tracking.
     */
    clearLookAt() {
        this._manualLook = false;
        if (this._outfit) {
            this._outfit.lookTarget = { x: 0, y: 0 };
        }
    }

    set gaze(value) {
        this._rigProps.gaze = Boolean(value);
        if (this._outfit) {
            this._outfit.gazeEnabled = this._rigProps.gaze;
        }
    }
    get gaze() { return this._rigProps.gaze; }

    set autoReact(value) { this._rigProps.autoReact = Boolean(value); }
    get autoReact() { return this._rigProps.autoReact; }

    set speakerAttention(value) { this._rigProps.speakerAttention = Boolean(value); }
    get speakerAttention() { return this._rigProps.speakerAttention; }

    /**
     * Attach a voiced HTMLAudioElement/HTMLMediaElement, MediaStream, or Web Audio AnalyserNode
     * to drive live RMS + formant visemes on this character's mouth.
     * @param {any} source
     * @returns {boolean}
     */
    attachAudio(source) {
        this.detachAudio();
        if (!source) {
            return false;
        }

        // Support passing a pre-configured { analyser } directly (or Web Audio AnalyserNode)
        if (source.analyser && typeof source.analyser.getByteTimeDomainData === "function") {
            const analyser = source.analyser;
            const size = analyser.fftSize || 256;
            const freqCount = analyser.frequencyBinCount || Math.floor(size / 2);
            this._audioBinding = {
                analyser,
                timeBuf: new Uint8Array(size),
                freqBuf: new Uint8Array(freqCount),
                ownsCtx: false,
                ctx: null
            };
            return true;
        }

        if (typeof source.getByteTimeDomainData === "function") {
            const size = source.fftSize || 256;
            const freqCount = source.frequencyBinCount || Math.floor(size / 2);
            this._audioBinding = {
                analyser: source,
                timeBuf: new Uint8Array(size),
                freqBuf: new Uint8Array(freqCount),
                ownsCtx: false,
                ctx: null
            };
            return true;
        }

        const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (typeof AudioCtx !== "function") {
            return false;
        }

        try {
            const ctx = new AudioCtx();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.45;

            if (typeof globalThis.HTMLMediaElement !== "undefined" && source instanceof globalThis.HTMLMediaElement) {
                let mediaNode = mediaElementSourceCache.get(source);
                if (!mediaNode) {
                    mediaNode = ctx.createMediaElementSource(source);
                    mediaElementSourceCache.set(source, mediaNode);
                }
                mediaNode.connect(analyser);
                analyser.connect(ctx.destination);
            } else if (typeof globalThis.MediaStream !== "undefined" && source instanceof globalThis.MediaStream) {
                const streamNode = ctx.createMediaStreamSource(source);
                streamNode.connect(analyser);
            } else if (typeof source.connect === "function") {
                source.connect(analyser);
            } else {
                ctx.close?.();
                return false;
            }

            if (ctx.state === "suspended") {
                ctx.resume?.().catch(() => {});
            }

            this._audioBinding = {
                analyser,
                timeBuf: new Uint8Array(analyser.fftSize),
                freqBuf: new Uint8Array(analyser.frequencyBinCount),
                ownsCtx: true,
                ctx
            };
            return true;
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[RiggedCharacter] Failed to attach voice audio analyser",
                context: { scope: "assets", component: "rigged-character" }
            });
            return false;
        }
    }

    /**
     * Sample current RMS volume + low/high frequency balance for audio lip-sync.
     * @returns {{ rms: number, roundness: number } | null}
     */
    _sampleAudioMetrics() {
        const b = this._audioBinding;
        if (!b?.analyser) {
            return null;
        }
        b.analyser.getByteTimeDomainData(b.timeBuf);
        let sumSq = 0;
        for (let i = 0; i < b.timeBuf.length; i++) {
            const v = (b.timeBuf[i] - 128) / 128;
            sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / Math.max(1, b.timeBuf.length));

        let roundness = 0.5;
        if (typeof b.analyser.getByteFrequencyData === "function" && b.freqBuf) {
            b.analyser.getByteFrequencyData(b.freqBuf);
            const split = Math.max(2, Math.floor(b.freqBuf.length * 0.25));
            let low = 0;
            let high = 0;
            for (let i = 0; i < b.freqBuf.length; i++) {
                if (i < split) low += b.freqBuf[i];
                else high += b.freqBuf[i];
            }
            const lowAvg = low / split;
            const highAvg = high / Math.max(1, b.freqBuf.length - split);
            roundness = lowAvg / Math.max(1, lowAvg + highAvg);
        }
        return { rms, roundness };
    }

    /**
     * Disconnect attached voice audio analyser and release audio context if owned.
     */
    detachAudio() {
        if (!this._audioBinding) {
            return;
        }
        try {
            this._audioBinding.analyser?.disconnect?.();
            if (this._audioBinding.ownsCtx) {
                this._audioBinding.ctx?.close?.();
            }
        } catch (_) {
            // Ignore cleanup errors
        }
        this._audioBinding = null;
        if (this._outfit) {
            this._outfit.audioMetrics = null;
        }
    }

    set wind(value) {
        const parsed = Number(value);
        this._rigProps.wind = Number.isFinite(parsed) ? parsed : 0;
        if (this._outfit) {
            this._outfit.wind = this._rigProps.wind;
        }
    }
    get wind() { return this._rigProps.wind; }

    set breathe(value) {
        this._rigProps.breathe = Boolean(value);
        if (this._outfit) {
            this._outfit.breathe = this._rigProps.breathe;
        }
    }
    get breathe() { return this._rigProps.breathe; }

    set blink(value) {
        this._rigProps.blink = Boolean(value);
        if (this._outfit) {
            this._outfit.blink = this._rigProps.blink;
        }
    }
    get blink() { return this._rigProps.blink; }

    set talkMouth(value) {
        this._rigProps.talkMouth = value || null;
        if (this._outfit && this._outfit.talk) {
            this._outfit.talkMouth = this._rigProps.talkMouth;
        }
    }
    get talkMouth() { return this._rigProps.talkMouth; }

    /**
     * Compute Konva screen coordinate/scale matching `Character.getValue`.
     * @param {"x" | "y" | "scale"} key
     * @param {number} val
     * @returns {number}
     */
    getValue(key = "x", val) {
        const game = getGame();
        const container = game?.ui?.game?.container;
        switch (key) {
        case "x": {
            const img = this.img?.image?.();
            const scaleX = this.img?.scale?.()?.x || 1;
            const imgWidth = img?.width || 0;
            const movableWidth = (container?.width?.() || 0) - (imgWidth * scaleX);
            return val * movableWidth;
        }
        case "y": {
            return val * (container?.height?.() || 0);
        }
        case "scale": {
            const originalScale = this.img?.getAttr?.("origScale") || 1;
            return val * originalScale;
        }
        default:
            throw new Error("Invalid Key!");
        }
    }

    /**
     * Ensure Konva node is attached to `game.ui.game.container` and initial layout is computed.
     */
    _mountToContainer() {
        const game = getGame();
        const container = game?.ui?.game?.container;
        if (container?.add && this.img) {
            if (this.img._isDestroyed) {
                const Konva = globalThis.Konva;
                this.img = new Konva.Image({
                    image: this._outfit?.canvas || null,
                    listening: false
                });
            }
            if (this.img.getParent() !== container) {
                container.add(this.img);
            }
        }
        if (this.img && !this.img.getAttr?.("origScale") && this._outfit?.canvas) {
            this._outfit.applyInitialLayout(this._outfit.canvas);
        }
    }

    /**
     * Show character immediately and start live rig animation loop.
     * @param {{ x?: number, y?: number, scale?: number }} [options]
     */
    show({ x, y, scale } = {}) {
        this._mountToContainer();
        if (x !== undefined) this.x = x;
        if (y !== undefined) this.y = y;
        if (scale !== undefined) this.scale = scale;
        this.opacity = 1;
        this.img?.visible?.(true);
        this._startLoop();
    }

    /**
     * Hide character immediately and pause live animation loop.
     */
    hide() {
        this.stopTalking();
        this.opacity = 0;
        this.img?.visible?.(false);
        this.img?.remove?.();
        this._stopLoop();
    }

    /**
     * @param {number} [duration=0.5]
     * @returns {Promise<void>}
     */
    fadeIn(duration = 0.5) {
        if (getShouldAbortGame()) {
            return Promise.resolve();
        }
        this._mountToContainer();
        this.opacity = 0;
        this.img?.visible?.(true);
        this._startLoop();
        const d = this._isReduceMotion() ? 0 : duration;
        return this.to({ opacity: 1, duration: d });
    }

    /**
     * @param {number} [duration=0.5]
     * @returns {Promise<void>}
     */
    async fadeOut(duration = 0.5) {
        if (getShouldAbortGame()) {
            return;
        }
        const d = this._isReduceMotion() ? 0 : duration;
        await this.to({ opacity: 0, duration: d });
        this.hide();
    }

    /**
     * @param {number} [x=0]
     * @param {number} [duration=0.5]
     * @returns {Promise<void>}
     */
    slideIn(x = 0, duration = 0.5) {
        if (getShouldAbortGame()) {
            return Promise.resolve();
        }
        this._mountToContainer();
        this.opacity = 0;
        this.img?.visible?.(true);
        if (typeof this.data.y === "number" && this.img?.image?.()) {
            this.img.y(this.getValue("y", this.data.y));
        }
        this._startLoop();
        const d = this._isReduceMotion() ? 0 : duration;
        return this.to({ x, opacity: 1, duration: d });
    }

    /**
     * @param {number} [x=-1.5]
     * @param {number} [duration=0.5]
     * @returns {Promise<void>}
     */
    async slideOut(x = -1.5, duration = 0.5) {
        if (getShouldAbortGame()) {
            return;
        }
        const d = this._isReduceMotion() ? 0 : duration;
        await this.to({ x, opacity: 0, duration: d });
        this.hide();
    }

    /**
     * Animate character transform, filters, or rigged outfit mood.
     * Mirrors `Character.to(...)` signature.
     * @param {Record<string, any>} [options]
     * @returns {Promise<void>}
     */
    async to(options = {}) {
        const {
            x,
            y,
            scale,
            opacity,
            blurRadius,
            noise,
            pixelSize,
            brightness,
            contrast,
            hue,
            saturation,
            luminance,
            grayscale,
            invert,
            mood,
            duration = 0.5
        } = options;

        const effectiveDuration = this._isReduceMotion() ? 0 : duration;
        const tweenProps = { duration: effectiveDuration };
        let hasTweenProps = false;

        if (x !== undefined) {
            this.data.x = x;
            tweenProps.x = this.getValue("x", x);
            hasTweenProps = true;
        }
        if (y !== undefined) {
            this.data.y = y;
            tweenProps.y = this.getValue("y", y);
            hasTweenProps = true;
        }
        if (scale !== undefined) {
            this.data.scale = scale;
            const s = this.getValue("scale", scale);
            tweenProps.scaleX = s;
            tweenProps.scaleY = s;
            hasTweenProps = true;
        }
        if (opacity !== undefined) {
            this.data.opacity = opacity;
            tweenProps.opacity = opacity;
            hasTweenProps = true;
        }

        const directFilters = { blurRadius, noise, pixelSize, brightness, contrast, hue, saturation, luminance };
        for (const [k, v] of Object.entries(directFilters)) {
            if (v !== undefined) {
                this.data[k] = v;
                tweenProps[k] = v;
                hasTweenProps = true;
            }
        }

        if (grayscale !== undefined) this.grayscale = grayscale;
        if (invert !== undefined) this.invert = invert;

        const tasks = [];
        if (mood && this._outfit) {
            tasks.push(this._outfit.to({ mood, duration: effectiveDuration }));
        }
        if (hasTweenProps && this.img) {
            tasks.push(tweenNode(this.img, tweenProps));
        }

        await Promise.all(tasks);
        this._refreshKonvaNode();
    }

    /**
     * Reset transforms and filter attributes back to defaults (except keys listed in `except`).
     * @param {string[]} [except=[]]
     */
    reset(except = []) {
        const attrs = {};
        if (!except.includes("x")) { attrs.x = 0; this.data.x = 0; }
        if (!except.includes("y")) { attrs.y = 0; this.data.y = 0; }
        if (!except.includes("scale")) {
            this.data.scale = this._defaultScale;
            const origScale = this.img?.getAttr?.("origScale") || 1;
            const effectiveScale = this.data.scale * origScale;
            attrs.scaleX = effectiveScale;
            attrs.scaleY = effectiveScale;
        }
        if (!except.includes("opacity")) { attrs.opacity = 1; this.data.opacity = 1; }
        if (!except.includes("blurRadius")) { attrs.blurRadius = 0; this.data.blurRadius = 0; }
        if (!except.includes("noise")) { attrs.noise = 0; this.data.noise = 0; }
        if (!except.includes("pixelSize")) { attrs.pixelSize = 1; this.data.pixelSize = 1; }
        if (!except.includes("brightness")) { attrs.brightness = 0; this.data.brightness = 0; }
        if (!except.includes("contrast")) { attrs.contrast = 0; this.data.contrast = 0; }
        if (!except.includes("hue")) { attrs.hue = 0; this.data.hue = 0; }
        if (!except.includes("saturation")) { attrs.saturation = 0; this.data.saturation = 0; }
        if (!except.includes("luminance")) { attrs.luminance = 0; this.data.luminance = 0; }
        this.img?.setAttrs?.(attrs);
        if (!except.includes("grayscale")) this.grayscale = false;
        if (!except.includes("invert")) this.invert = false;
        this._refreshKonvaNode();
    }

    set opacity(value) {
        this.data.opacity = value;
        this.img?.opacity?.(value);
    }
    get opacity() { return this.data.opacity; }

    set x(value) {
        this.data.x = value;
        if (this.img?.image?.()) {
            this.img.x(this.getValue("x", value));
        }
    }
    get x() { return this.data.x; }

    set y(value) {
        this.data.y = value;
        if (this.img?.image?.()) {
            this.img.y(this.getValue("y", value));
        }
    }
    get y() { return this.data.y; }

    set scale(value) {
        this.data.scale = value;
        if (this.img?.image?.()) {
            const s = this.getValue("scale", value);
            this.img.scale({ x: s, y: s });
        }
    }
    get scale() { return this.data.scale; }

    set blurRadius(value) { this.data.blurRadius = value; this.img?.blurRadius?.(value); this._refreshKonvaNode(); }
    get blurRadius() { return this.data.blurRadius; }

    set noise(value) { this.data.noise = value; this.img?.noise?.(value); this._refreshKonvaNode(); }
    get noise() { return this.data.noise; }

    set pixelSize(value) { this.data.pixelSize = value; this.img?.pixelSize?.(value); this._refreshKonvaNode(); }
    get pixelSize() { return this.data.pixelSize; }

    set brightness(value) { this.data.brightness = value; this.img?.brightness?.(value); this._refreshKonvaNode(); }
    get brightness() { return this.data.brightness; }

    set contrast(value) { this.data.contrast = value; this.img?.contrast?.(value); this._refreshKonvaNode(); }
    get contrast() { return this.data.contrast; }

    set hue(value) { this.data.hue = value; this.img?.hue?.(value); this._refreshKonvaNode(); }
    get hue() { return this.data.hue; }

    set saturation(value) { this.data.saturation = value; this.img?.saturation?.(value); this._refreshKonvaNode(); }
    get saturation() { return this.data.saturation; }

    set luminance(value) { this.data.luminance = value; this.img?.luminance?.(value); this._refreshKonvaNode(); }
    get luminance() { return this.data.luminance; }

    set grayscale(value) {
        const KonvaRef = getKonva();
        this.data.grayscale = Boolean(value);
        const cur = this.img?.filters?.() || [];
        if (KonvaRef?.Filters?.Grayscale) {
            if (this.data.grayscale && !cur.includes(KonvaRef.Filters.Grayscale)) {
                this.img.filters([...cur, KonvaRef.Filters.Grayscale]);
            } else if (!this.data.grayscale) {
                this.img.filters(cur.filter((f) => f !== KonvaRef.Filters.Grayscale));
            }
        }
        this._refreshKonvaNode();
    }
    get grayscale() { return this.data.grayscale; }

    set invert(value) {
        const KonvaRef = getKonva();
        this.data.invert = Boolean(value);
        const cur = this.img?.filters?.() || [];
        if (KonvaRef?.Filters?.Invert) {
            if (this.data.invert && !cur.includes(KonvaRef.Filters.Invert)) {
                this.img.filters([...cur, KonvaRef.Filters.Invert]);
            } else if (!this.data.invert) {
                this.img.filters(cur.filter((f) => f !== KonvaRef.Filters.Invert));
            }
        }
        this._refreshKonvaNode();
    }
    get invert() { return this.data.invert; }

    /**
     * Cleanly release animation loops, event listeners, Konva node, and outfit buffers.
     */
    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this._stopLoop();
        this.detachAudio();
        if (this._talkTimer) {
            clearTimeout(this._talkTimer);
            this._talkTimer = null;
        }
        if (this._tintRaf && typeof globalThis.cancelAnimationFrame === "function") {
            globalThis.cancelAnimationFrame(this._tintRaf);
            this._tintRaf = null;
        }
        if (typeof globalThis.removeEventListener === "function") {
            globalThis.removeEventListener("game-ui-ready", this._repositionCallback);
            globalThis.removeEventListener(EVENTS.DIALOG, this._dialogHandler);
            globalThis.removeEventListener(EVENTS.DIALOG_END, this._dialogEndHandler);
            globalThis.removeEventListener(EVENTS.ACCESSIBILITY, this._accessibilityHandler);
            globalThis.removeEventListener("pointermove", this._pointerMoveHandler);
            globalThis.removeEventListener("pointerleave", this._pointerLeaveHandler);
        }
        for (const outfitObj of Object.values(this.outfits)) {
            outfitObj?.dispose?.();
        }
        this.outfits = {};
        this._outfit = null;
        this.img?.destroy?.();
    }
}

export { RiggedCharacter };

