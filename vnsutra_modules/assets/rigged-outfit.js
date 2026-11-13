import { getGame, getIsPortrait } from "../runtime-state.js";
import errorTracking from "../error-tracking.js";
import { WebGLRigRenderer, evalMorphCurve } from "./webgl-rig.js";
import { renderExpressionFx } from "./expression-fx.js";

const VNSPRITE_MAGIC = [0x56, 0x4e, 0x53, 0x52]; // "VNSR"
const VNSPRITE_HEADER_BYTES = 12;
const VNSPRITE_SUPPORTED_VERSION = 1;

const BODY_ORDER = ["back_hair", "lower_body", "skin_canvas", "upper_clothes", "front_hair"];

/**
 * 1D critically/semi-damped spring solver with stability clamp on dt.
 */
class Spring1D {
    /**
     * @param {number} [stiffness=140]
     * @param {number} [damping=16]
     */
    constructor(stiffness = 140, damping = 16) {
        this.k = stiffness;
        this.d = damping;
        this.x = 0;
        this.v = 0;
    }

    /**
     * @param {number} target
     * @param {number} dt
     * @returns {number}
     */
    step(target, dt) {
        const clampedDt = Math.min(Math.max(dt || 0, 0), 0.033);
        if (clampedDt === 0) {
            return this.x;
        }
        const a = -this.k * (this.x - target) - this.d * this.v;
        this.v += a * clampedDt;
        this.x += this.v * clampedDt;
        return this.x;
    }

    /**
     * @param {number} dv
     */
    impulse(dv) {
        this.v += dv;
    }

    reset() {
        this.x = 0;
        this.v = 0;
    }
}

/**
 * Parse a binary .vnsprite ArrayBuffer into manifest metadata + embedded WebP atlas bytes.
 * Binary layout (little-endian):
 *   [0..3]  "VNSR" magic
 *   [4..5]  uint16 version (1)
 *   [6..7]  uint16 flags
 *   [8..11] uint32 jsonLength
 *   [12..]  UTF-8 manifest JSON
 *   [..]    Raw WebP atlas bytes
 *
 * @param {ArrayBuffer | ArrayBufferView} input
 * @returns {{ version: number, flags: number, manifest: Record<string, any>, atlasBytes: Uint8Array }}
 */
function parseVnSpriteBuffer(input) {
    if (!input) {
        throw new Error("[RiggedOutfit] Empty .vnsprite buffer");
    }

    let bytes;
    if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
    } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
        throw new TypeError("[RiggedOutfit] Expected ArrayBuffer or TypedArray for .vnsprite");
    }

    if (bytes.byteLength < VNSPRITE_HEADER_BYTES) {
        throw new Error(`[RiggedOutfit] Truncated .vnsprite header (${bytes.byteLength} bytes)`);
    }

    for (let i = 0; i < VNSPRITE_MAGIC.length; i++) {
        if (bytes[i] !== VNSPRITE_MAGIC[i]) {
            throw new Error("[RiggedOutfit] Invalid .vnsprite magic header (expected VNSR)");
        }
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint16(4, true);
    if (version !== VNSPRITE_SUPPORTED_VERSION) {
        throw new Error(`[RiggedOutfit] Unsupported .vnsprite version: ${version}`);
    }

    const flags = view.getUint16(6, true);
    const jsonLen = view.getUint32(8, true);
    const jsonEnd = VNSPRITE_HEADER_BYTES + jsonLen;
    if (jsonLen === 0 || jsonEnd > bytes.byteLength) {
        throw new Error(`[RiggedOutfit] Invalid manifest length (${jsonLen}) in .vnsprite`);
    }

    const jsonText = new TextDecoder("utf-8").decode(bytes.subarray(VNSPRITE_HEADER_BYTES, jsonEnd));
    const manifest = JSON.parse(jsonText);
    const atlasBytes = bytes.slice(jsonEnd);

    return { version, flags, manifest, atlasBytes };
}

/**
 * Decode WebP atlas bytes into an ImageBitmap (preferred) or HTMLImageElement.
 * @param {Uint8Array} atlasBytes
 * @returns {Promise<ImageBitmap | HTMLImageElement>}
 */
async function decodeAtlasImage(atlasBytes) {
    if (!atlasBytes || atlasBytes.byteLength === 0) {
        throw new Error("[RiggedOutfit] Missing embedded atlas image bytes");
    }
    const blob = new Blob([atlasBytes], { type: "image/webp" });

    if (typeof globalThis.createImageBitmap === "function") {
        return globalThis.createImageBitmap(blob);
    }

    return new Promise((resolve, reject) => {
        if (typeof globalThis.Image !== "function") {
            reject(new Error("[RiggedOutfit] No image decoder available in this environment"));
            return;
        }
        const img = new globalThis.Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err instanceof Error ? err : new Error("[RiggedOutfit] Failed to decode WebP atlas"));
        };
        img.src = url;
    });
}

function clamp(v, lim) {
    return Math.max(-lim, Math.min(lim, v));
}

function createCanvas(width, height) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
        return null;
    }
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
}

function stripExt(name) {
    return String(name || "").replace(/\.(png|webp|vnsprite)$/i, "");
}

function classifyMoodPolarity(name) {
    const low = String(name || "").toLowerCase();
    if (/sad|worried|crying|pout|upset|unhappy/.test(low)) return "sad";
    if (/angry|annoyed|glare|frown|mad/.test(low)) return "angry";
    if (/shock|surpris|gasp|panicked|fluster/.test(low)) return "shock";
    if (/happy|smile|grin|laugh|joy|delighted|smug|wink/.test(low)) return "happy";
    return "neutral";
}

/**
 * Find the matching eyes-closed mood variant in the manifest for blink swapping.
 * @param {Record<string, any>} frames
 * @param {string} mood
 * @returns {string | null}
 */
function findClosedEyesMood(frames, mood) {
    if (!frames || !mood) return null;
    const keys = Object.keys(frames);
    const stem = stripExt(mood).toLowerCase();
    const direct = keys.find((k) => {
        const s = stripExt(k).toLowerCase();
        return s === `${stem}_eyesclosed` || s === `${stem}_closed`;
    });
    if (direct) return direct;

    const pol = classifyMoodPolarity(mood);
    return keys.find((k) => /eyes?closed/i.test(k) && classifyMoodPolarity(k) === pol)
        || keys.find((k) => /eyes?closed/i.test(k))
        || null;
}

/**
 * Build a viseme mouth bank tailored to the current mood expression polarity.
 * @param {Record<string, any>} manifest
 * @param {string} mood
 * @returns {{ rest: any, closed: any, mid: any, wide: any, round: any }}
 */
function buildVisemeBank(manifest, mood) {
    const frames = manifest?.frames || {};
    const keys = Object.keys(frames);
    const fd = frames[mood];
    const rest = fd?.organs?.mouth || null;
    if (!rest) {
        return { rest: null, closed: null, mid: null, wide: null, round: null };
    }

    const pol = classifyMoodPolarity(mood);
    const candidates = [];
    for (const k of keys) {
        const spec = frames[k]?.organs?.mouth;
        if (!spec?.stage) continue;
        const kPol = classifyMoodPolarity(k);
        const h = spec.stage.h || 0;
        const w = spec.stage.w || 1;
        const aspect = h / Math.max(1, w);
        const isShock = /shock|surpris|gasp/.test(k.toLowerCase());
        const samePol = kPol === pol || kPol === "neutral";
        candidates.push({ key: k, spec, h, w, aspect, samePol, isShock });
    }

    const pool = candidates.filter((c) => c.samePol && !c.isShock);
    const activePool = pool.length ? pool : candidates;

    const byAreaAsc = [...activePool].sort((a, b) => a.h - b.h || a.w - b.w);
    const closed = byAreaAsc[0]?.spec || rest;

    const openOnly = activePool.filter((c) => c.h >= Math.max(14, (rest.stage?.h || 0) * 0.9));
    const wide = [...openOnly].sort((a, b) => (b.h * b.w) - (a.h * a.w))[0]?.spec || rest;
    const mid = openOnly.length > 1
        ? [...openOnly].sort((a, b) => a.h - b.h)[Math.floor(openOnly.length / 2)].spec
        : wide;
    const round = [...candidates].sort((a, b) => b.aspect - a.aspect)[0]?.spec || wide;

    return { rest, closed, mid, wide, round };
}

/**
 * Syllable-cadenced or live Web Audio envelope lip-sync selector.
 * @param {Record<string, any>} fd
 * @param {number} tSec
 * @param {{ rest: any, closed: any, mid: any, wide: any, round: any }} bank
 * @param {any} [talkMouthSpec=null]
 * @param {{ rms: number, roundness?: number } | null} [audioMetrics=null]
 * @returns {{ spec: any, sy: number }}
 */
function pickSpeechMouth(fd, tSec, bank, talkMouthSpec = null, audioMetrics = null) {
    const rest = fd?.organs?.mouth || bank?.rest;
    if (!rest) {
        return { spec: null, sy: 1.0 };
    }

    if (audioMetrics && Number.isFinite(audioMetrics.rms)) {
        const rms = Math.max(0, audioMetrics.rms);
        if (rms < 0.025) {
            return { spec: rest, sy: 1.0 };
        }
        const level = Math.min(1, (rms - 0.025) / 0.28);
        if (talkMouthSpec) {
            return { spec: talkMouthSpec, sy: 0.28 + level * 0.82 };
        }
        if (level < 0.22) {
            return { spec: bank.closed || rest, sy: 0.94 };
        }
        if (level < 0.56) {
            return { spec: bank.mid || rest, sy: 0.96 };
        }
        if ((audioMetrics.roundness || 0) > 0.55) {
            return { spec: bank.round || bank.wide || rest, sy: 1.0 };
        }
        return { spec: bank.wide || rest, sy: 1.0 };
    }

    if (talkMouthSpec) {
        const beat = Math.sin(tSec * 2.65 * Math.PI * 2) * 0.65 + Math.sin(tSec * 4.1 * Math.PI * 2 + 0.9) * 0.35;
        const sy = 0.25 + Math.max(0, (beat + 1.0) * 0.5) * 0.85;
        return { spec: talkMouthSpec, sy };
    }

    const phraseMod = Math.sin(tSec * 1.15);
    if (phraseMod < -0.68) {
        return { spec: rest, sy: 1.0 };
    }

    const syll = 0.5 + 0.35 * Math.sin(tSec * 2.65 * Math.PI * 2) + 0.15 * Math.sin(tSec * 4.1 * Math.PI * 2 + 0.8);
    if (syll < 0.28) {
        return { spec: bank.closed || rest, sy: 0.92 };
    }
    if (syll < 0.56) {
        return { spec: bank.mid || rest, sy: 0.95 };
    }
    if (syll < 0.78) {
        return { spec: bank.wide || rest, sy: 1.0 };
    }
    return { spec: bank.round || bank.wide || rest, sy: 0.98 };
}

/**
 * Semantic quadtree outfit bundle for RiggedCharacter.
 * Matches Outfit public API (`moods`, `set mood`, `to({ mood, duration })`, `dispose`)
 * while adding cached WOLA layer reconstruction, Spring1D secondary motion, blink, and lip-sync.
 */
class RiggedOutfit {
    /**
     * @param {any} img Konva.Image target backed by RiggedOutfit.canvas
     * @param {string} name
     * @param {any} character
     * @param {{ manifest: Record<string, any>, atlas: ImageBitmap | HTMLImageElement } | null} [bundle=null]
     */
    constructor(img, name, character, bundle = null) {
        this.img = img;
        this.name = name;
        this.character = character;

        /** @type {Record<string, any> | null} */
        this.manifest = null;
        /** @type {ImageBitmap | HTMLImageElement | null} */
        this.atlas = null;
        /** @type {Record<string, { name: string, width: number, height: number, frame: any }>} */
        this.moods = {};
        /** @type {string | null} */
        this.currentMood = null;

        this.breathe = true;
        this.blink = true;
        this.blinkSwap = true;
        this.talk = false;
        this.talkMouth = null;
        this.wind = 0.35;
        this.reduceMotion = false;
        this.gazeEnabled = true;
        this.lookTarget = { x: 0, y: 0 };
        this.audioMetrics = null;
        this.tint = { color: "#ffffff", strength: 0 };
        this.fx = { list: [], intensity: 0.85, speed: 1 };
        this._fxAlphas = {};
        this._fxCanvas = null;
        this._fxCtx = null;
        this._fxTopCanvas = null;
        this._fxTopCtx = null;
        this._fxTopCanvas = null;
        this._fxTopCtx = null;

        this.springs = {
            bodyX: new Spring1D(160, 14),
            bodyY: new Spring1D(210, 15),
            chest: new Spring1D(120, 14),
            headRot: new Spring1D(95, 11),
            headY: new Spring1D(150, 14),
            fHair: new Spring1D(55, 7),
            bHair: new Spring1D(38, 5.5),
            lookX: new Spring1D(45, 9),
            lookY: new Spring1D(45, 9)
        };

        this._disposed = false;
        this._canvas = null;
        this._ctx = null;
        this._fxCanvas = null;
        this._fxCtx = null;
        this._fxTopCanvas = null;
        this._fxTopCtx = null;
        this._gl = null;
        this._windPhase = 0;
        this._morph = null;
        this._atlasPixels = null;
        this._atlasW = 0;
        this._atlasH = 0;
        this._layerCache = new Map();
        this._layerDiffCache = new Map();
        this._visemeCache = new Map();
        this._rampCache = new Map();
        this._scratch = null;
        this._warmHandle = null;
        this._warmType = null;

        if (bundle) {
            this.setBundle(bundle);
        }
    }

    /**
     * @returns {HTMLCanvasElement | null}
     */
    get canvas() {
        return this._canvas;
    }

    /**
     * Attach parsed manifest + decoded atlas image and pre-populate `moods`.
     * @param {{ manifest: Record<string, any>, atlas: ImageBitmap | HTMLImageElement }} bundle
     */
    setBundle(bundle) {
        if (!bundle?.manifest) {
            throw new Error("[RiggedOutfit] Missing manifest in outfit bundle");
        }
        this.manifest = bundle.manifest;
        this.atlas = bundle.atlas || null;
        this._layerCache.clear();
        this._layerDiffCache.clear();
        this._visemeCache.clear();
        this._atlasPixels = null;
        this._atlasW = this.atlas?.width || this.manifest?.atlas?.width || 0;
        this._atlasH = this.atlas?.height || this.manifest?.atlas?.height || 0;

        const W = this.manifest.width || 1024;
        const H = this.manifest.height || 1024;

        this._gl?.dispose?.();
        this._gl = null;
        this._canvas = createCanvas(W, H);
        // Attempt WebGL2 mesh renderer first (a single <canvas> cannot bind both WebGL2 and 2D contexts).
        this._gl = WebGLRigRenderer.tryCreate(this._canvas);
        this._ctx = this._gl ? null : (this._canvas?.getContext?.("2d") || null);
        if (this._gl && this.atlas) {
            this._gl.setAtlas(this.atlas);
        }

        const frames = this.manifest.frames || {};
        this.moods = {};
        for (const key of Object.keys(frames)) {
            this.moods[key] = {
                name: key,
                width: W,
                height: H,
                frame: frames[key]
            };
        }

        if (this.atlas && typeof document !== "undefined") {
            const ac = createCanvas(this.atlas.width, this.atlas.height);
            const actx = ac?.getContext?.("2d");
            if (actx) {
                actx.drawImage(this.atlas, 0, 0);
                this._atlasPixels = actx.getImageData(0, 0, ac.width, ac.height).data;
                this._atlasW = ac.width;
            }
        }

        if (this._canvas) {
            const len = W * H;
            this._scratch = {
                W,
                H,
                accR: new Float32Array(len),
                accG: new Float32Array(len),
                accB: new Float32Array(len),
                accA: new Float32Array(len),
                accW: new Float32Array(len)
            };
        }

        const firstMood = Object.keys(frames)[0];
        if (firstMood && !this.currentMood) {
            this.mood = firstMood;
        }
        this._scheduleLayerWarmup();
    }

    _cancelLayerWarmup() {
        if (this._warmHandle === null) return;
        if (this._warmType === "idle" && typeof globalThis.cancelIdleCallback === "function") {
            globalThis.cancelIdleCallback(this._warmHandle);
        } else {
            clearTimeout(this._warmHandle);
        }
        this._warmHandle = null;
        this._warmType = null;
    }

    _scheduleLayerWarmup() {
        this._cancelLayerWarmup();
        if (this._disposed || !this._atlasPixels || !this.manifest?.frames || typeof globalThis.requestAnimationFrame !== "function") {
            return;
        }
        const queue = [];
        for (const m of Object.keys(this.manifest.frames)) {
            if (m === this.currentMood) continue;
            for (const lid of BODY_ORDER) {
                if (!this._layerCache.has(`${m}::${lid}`)) {
                    queue.push([m, lid]);
                }
            }
        }
        if (!queue.length) return;

        const scheduleNext = (fn, delayMs) => {
            if (typeof globalThis.requestIdleCallback === "function") {
                this._warmType = "idle";
                this._warmHandle = globalThis.requestIdleCallback(fn, { timeout: 120 });
            } else {
                this._warmType = "timeout";
                this._warmHandle = setTimeout(fn, delayMs);
            }
        };

        const step = () => {
            this._warmHandle = null;
            this._warmType = null;
            if (this._disposed || !this._atlasPixels || !queue.length) return;
            const [m, lid] = queue.shift();
            const layerCanvas = this._getLayerCanvas(m, lid);
            if (this._gl && layerCanvas) {
                this._gl.getOrUploadLayer(`${m}::${lid}`, layerCanvas);
            }
            if (queue.length) {
                scheduleNext(step, 24);
            }
        };

        this._warmType = "timeout";
        this._warmHandle = setTimeout(step, 180);
    }

    /**
     * Resolve mood name flexibly: exact key, `<name>.png`, without extension, or case-insensitive.
     * @param {string} src
     * @returns {string}
     */
    resolveMoodKey(src) {
        if (!src || !this.manifest?.frames) {
            throw new Error(`[RiggedOutfit] Mood '${src}' not available (manifest not loaded)`);
        }
        const frames = this.manifest.frames;
        if (frames[src]) return src;
        if (frames[`${src}.png`]) return `${src}.png`;

        const targetStem = stripExt(src).toLowerCase();
        const match = Object.keys(frames).find((k) => stripExt(k).toLowerCase() === targetStem);
        if (match) return match;

        throw new Error(`Mood "${src}" not found in rigged outfit "${this.name}"!`);
    }

    /**
     * Set active mood and synchronize Konva container sizing/baseline positioning.
     * Mirrors `Outfit.set mood(src)` layout logic.
     * @param {string} src
     */
    set mood(src) {
        const resolved = this.resolveMoodKey(src);
        this.currentMood = resolved;

        const targetImg = this._canvas || { width: this.manifest.width, height: this.manifest.height };
        this.img.image(targetImg);

        if (!this.img.getAttr("origScale")) {
            this.applyInitialLayout(targetImg);
        }

        this.renderFrame(0);
    }

    /**
     * @returns {string | null}
     */
    get mood() {
        return this.currentMood;
    }

    /**
     * Compute `origScale`, `x`, and `y` for Konva placement relative to container dimensions.
     * @param {{ width: number, height: number }} targetImg
     */
    applyInitialLayout(targetImg) {
        const game = getGame();
        const container = game?.ui?.game?.container;
        if (!container) {
            return;
        }
        const cw = container.width();
        const ch = container.height();
        const aspect = cw / ch;
        const imgAspect = targetImg.width / targetImg.height;
        const portrait = getIsPortrait();

        let baseScale = 1;
        if (portrait) {
            if (aspect < imgAspect) {
                baseScale = cw / targetImg.width;
            } else {
                baseScale = ch / targetImg.height;
            }
        } else {
            baseScale = ch / targetImg.height;
        }

        const characterScale = this.character?.data?.scale ?? 1;
        const effectiveScale = baseScale * characterScale;

        this.img.setAttr("origScale", baseScale);
        this.img.scale({ x: effectiveScale, y: effectiveScale });

        const prevX = this.img.x();
        const prevY = this.img.y();
        const currentScale = this.img.scale();

        let x = 0;
        let y = 0;
        if (typeof prevX === "number" && !Number.isNaN(prevX)) {
            x = prevX;
        } else {
            const movableWidth = cw - (targetImg.width * currentScale.x);
            x = (this.character?.data?.x ?? 0) * movableWidth;
        }
        if (typeof prevY === "number" && !Number.isNaN(prevY)) {
            y = prevY;
        } else {
            y = (this.character?.data?.y ?? 0) * ch;
        }

        this.img.x(x);
        this.img.y(y);
    }

    _finishMorph() {
        const m = this._morph;
        if (!m) return;
        this._morph = null;
        if (m.safetyTimer) {
            clearTimeout(m.safetyTimer);
        }
        m.resolve?.();
    }

    setTint(color = "#ffffff", strength = 0.35) {
        this.tint = {
            color: color || "#ffffff",
            strength: Math.min(1, Math.max(0, Number(strength) || 0))
        };
    }

    /**
     * Enable procedural expression overlays (`blush`, `sweat`, `sparkles`, `anger_vein`).
     * @param {string[] | string} fxList
     * @param {{ intensity?: number, speed?: number }} [options]
     */
    setFx(fxList = [], { intensity = 0.85, speed = 1 } = {}) {
        const arr = Array.isArray(fxList) ? fxList : (fxList ? [fxList] : []);
        this.fx = {
            list: arr.map((f) => String(f || "").toLowerCase()).filter(Boolean),
            intensity: Math.min(1, Math.max(0.05, Number(intensity) || 0.85)),
            speed: Math.max(0.1, Number(speed) || 1)
        };
    }

    clearFx() {
        this.fx = { list: [], intensity: 0.85, speed: 1 };
    }

    _applyMoodImpulse(mood) {
        if (this.reduceMotion || !this.breathe) return;
        const rules = [
            [/shock|surpris|gasp/i, { headY: -2.2, fHair: 0.004, chest: -0.22 }],
            [/happy|laugh|smil|excit/i, { headY: 1.6, chest: 0.20, fHair: -0.003 }],
            [/sad|cry|tire|worr|shy|embar/i, { headY: 1.8, headRot: 0.0035 }],
            [/angry|determin|annoy/i, { headY: 1.4, headRot: -0.003 }]
        ];
        const matched = rules.find(([re]) => re.test(mood || ""));
        const impulses = matched ? matched[1] : { headY: 1.0 };
        for (const [key, val] of Object.entries(impulses)) {
            this.springs[key]?.impulse(val);
        }
    }

    /**
     * Transition smoothly via facial-organ crossfade (or instantaneously when reduced-motion / headless)
     * to a target mood without fading body opacity.
     * @param {{ mood?: string | null, duration?: number }} [options]
     * @returns {Promise<void>}
     */
    async to({ mood = null, duration = 0.5 } = {}) {
        if (!mood) {
            return;
        }
        try {
            const resolved = this.resolveMoodKey(mood);
            const hasRaf = typeof globalThis.requestAnimationFrame === "function";
            if (!hasRaf || !duration || duration <= 0 || this.reduceMotion || !this.img?.getParent?.() || !this.currentMood || resolved === this.currentMood) {
                this._finishMorph();
                this.mood = resolved;
                return;
            }

            const fromMood = (this._morph && (this._morph.elapsed / Math.max(0.01, this._morph.duration)) < 0.45 && this.manifest.frames?.[this._morph.fromMood])
                ? this._morph.fromMood
                : this.currentMood;
            this._finishMorph();
            this.currentMood = resolved;
            this._applyMoodImpulse(resolved);
            const targetImg = this._canvas || { width: this.manifest.width, height: this.manifest.height };
            this.img.image(targetImg);
            if (!this.img.getAttr("origScale")) {
                this.applyInitialLayout(targetImg);
            }

            await new Promise((resolve) => {
                const safetyTimer = setTimeout(() => {
                    this._finishMorph();
                }, Math.ceil(duration * 1000) + 120);
                this._morph = { fromMood, elapsed: 0, duration, resolve, safetyTimer, started: false };
            });
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[RiggedOutfit] Failed to animate outfit mood transition",
                context: { scope: "assets", component: "rigged-outfit", mood }
            });
            this._finishMorph();
            this.mood = mood;
        }
    }

    /**
     * Trigger vertical hop impulse (stage squash/bounce).
     * @param {number} [strength=210]
     */
    hop(strength = 210) {
        if (this.reduceMotion) return;
        this.springs.bodyY.impulse(-Math.abs(strength));
        this.springs.headY.impulse(-Math.abs(strength) * 0.32);
        this.springs.fHair.impulse(-0.24);
        this.springs.bHair.impulse(-0.34);
    }

    /**
     * Trigger horizontal startle/shock shake impulse.
     * @param {number} [strength=360]
     */
    shake(strength = 360) {
        if (this.reduceMotion) return;
        this.springs.bodyX.impulse(strength);
        this.springs.headRot.impulse(-0.22);
        this.springs.fHair.impulse(0.35);
        this.springs.bHair.impulse(0.50);
    }

    /**
     * Step 1D springs and secondary physics.
     * @param {number} dt Seconds elapsed since last step
     * @param {number} tSec Total elapsed time in seconds
     */
    stepPhysics(dt, tSec) {
        if (this._morph) {
            if (this.reduceMotion) {
                this._finishMorph();
            } else {
                if (!this._morph.started) {
                    this._morph.started = true;
                } else {
                    this._morph.elapsed += Math.min(Math.max(dt || 0, 0), 0.033);
                }
                if (this._morph.elapsed >= this._morph.duration) {
                    this._finishMorph();
                }
            }
        }
        if (this.reduceMotion) {
            this._fxAlphas = {};
            for (const f of this.fx?.list || []) {
                this._fxAlphas[f] = 1;
            }
            for (const s of Object.values(this.springs)) {
                s.reset();
            }
            return;
        }
        const fxStep = Math.min(1, Math.max(0.01, (dt || 0.016) / 0.25));
        const wanted = new Set(this.fx?.list || []);
        for (const f of wanted) {
            this._fxAlphas[f] = Math.min(1, (this._fxAlphas[f] || 0) + fxStep);
        }
        for (const k of Object.keys(this._fxAlphas)) {
            if (!wanted.has(k)) {
                const nextA = this._fxAlphas[k] - fxStep;
                if (nextA <= 0.005) delete this._fxAlphas[k];
                else this._fxAlphas[k] = nextA;
            }
        }

        const brTarget = this.breathe ? Math.sin(tSec * 1.9) : 0;
        const gust = this.wind * (Math.sin(tSec * 2.1) * 0.65 + Math.sin(tSec * 3.7) * 0.35);
        this._windPhase += Math.min(Math.max(dt || 0, 0), 0.033) * (2.2 + Math.abs(this.wind) * 1.1);

        const targetLookX = this.gazeEnabled ? clamp(this.lookTarget.x || 0, 1.0) : 0;
        const targetLookY = this.gazeEnabled ? clamp(this.lookTarget.y || 0, 1.0) : 0;
        this.springs.lookX.step(targetLookX, dt);
        this.springs.lookY.step(targetLookY, dt);

        this.springs.bodyX.step(0, dt);
        this.springs.bodyY.step(0, dt);
        this.springs.chest.step(brTarget, dt);

        const gazeTilt = this.springs.lookX.x * 0.006;
        const headRotTarget = clamp((this.breathe ? Math.sin(tSec * 1.1) * 0.0020 : 0) + gazeTilt - this.springs.bodyX.v * 0.00004, 0.014);
        const headYTarget = clamp(-this.springs.chest.x * 1.25 + this.springs.lookY.x * 1.6 + this.springs.bodyY.v * 0.005, 4.5);
        this.springs.headRot.step(headRotTarget, dt);
        this.springs.headY.step(headYTarget, dt);

        const swayBase = this.breathe ? Math.sin(tSec * 1.45 - 0.55) * 0.0035 : 0;
        const hairTorque = gust * 0.008 - this.springs.bodyX.v * 0.00006 - this.springs.headRot.v * 0.015;
        this.springs.fHair.step(clamp(swayBase + hairTorque * 0.7, 0.010), dt);
        this.springs.bHair.step(clamp(swayBase * 1.3 + hairTorque * 1.3, 0.016), dt);

        this.springs.headRot.x = clamp(this.springs.headRot.x, 0.016);
        this.springs.fHair.x = clamp(this.springs.fHair.x, 0.011);
        this.springs.bHair.x = clamp(this.springs.bHair.x, 0.018);
    }

    /**
     * Reconstruct and cache a single body layer bitmap for `mood` using 2px-overlap WOLA blending.
     * Rebuilding once per (mood, layerId) lets 60fps renderFrame blit cached layers without block overhead.
     * @param {string} mood
     * @param {string} layerId
     * @returns {HTMLCanvasElement | null}
     */
    _getLayerCanvas(mood, layerId) {
        const cacheKey = `${mood}::${layerId}`;
        if (this._layerCache.has(cacheKey)) {
            return this._layerCache.get(cacheKey);
        }
        if (!this._atlasPixels || !this._scratch) {
            return null;
        }

        const fd = this.manifest.frames?.[mood];
        const blocks = fd?.layerBlocks?.[layerId] || [];
        const { W, H, accR, accG, accB, accA, accW } = this._scratch;
        const ov = this.manifest.overlap ?? 2;
        const aw = this._atlasW;
        const ap = this._atlasPixels;

        const outCanvas = createCanvas(W, H);
        const outCtx = outCanvas?.getContext?.("2d");
        if (!outCtx) return null;

        accR.fill(0);
        accG.fill(0);
        accB.fill(0);
        accA.fill(0);
        accW.fill(0);

        for (const blk of blocks) {
            const [sx, sy, sz, ax, ay] = blk;
            const dim = sz + ov * 2;
            const x0 = sx - ov;
            const y0 = sy - ov;
            const ramp = this._getRamp(dim, ov);

            for (let by = 0; by < dim; by++) {
                const dy = y0 + by;
                if (dy < 0 || dy >= H) continue;
                const wy = ramp[by];
                const aRow = (ay + by) * aw;
                const sRow = dy * W;
                for (let bx = 0; bx < dim; bx++) {
                    const dx = x0 + bx;
                    if (dx < 0 || dx >= W) continue;
                    const w = wy * ramp[bx];
                    const aIdx = (aRow + ax + bx) * 4;
                    const sIdx = sRow + dx;
                    accR[sIdx] += ap[aIdx] * w;
                    accG[sIdx] += ap[aIdx + 1] * w;
                    accB[sIdx] += ap[aIdx + 2] * w;
                    accA[sIdx] += ap[aIdx + 3] * w;
                    accW[sIdx] += w;
                }
            }
        }

        const outImg = outCtx.createImageData(W, H);
        const od = outImg.data;
        for (let i = 0, p = 0; i < accW.length; i++, p += 4) {
            const w = accW[i];
            if (w > 0) {
                const inv = 1 / w;
                od[p] = accR[i] * inv + 0.5;
                od[p + 1] = accG[i] * inv + 0.5;
                od[p + 2] = accB[i] * inv + 0.5;
                od[p + 3] = accA[i] * inv + 0.5;
            }
        }
        outCtx.putImageData(outImg, 0, 0);
        this._layerCache.set(cacheKey, outCanvas);
        return outCanvas;
    }

    /**
     * @param {number} dim
     * @param {number} overlap
     * @returns {Float32Array}
     */
    _layersDiffer(moodA, moodB, lid) {
        if (!moodA || !moodB || moodA === moodB) return false;
        const key = `${moodA}::${moodB}::${lid}`;
        if (this._layerDiffCache.has(key)) {
            return this._layerDiffCache.get(key);
        }
        const a = this.manifest?.frames?.[moodA]?.layerBlocks?.[lid] || [];
        const b = this.manifest?.frames?.[moodB]?.layerBlocks?.[lid] || [];
        let diff = a.length !== b.length;
        if (!diff) {
            for (let i = 0; i < a.length; i++) {
                const pa = a[i];
                const pb = b[i];
                if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2] || pa[3] !== pb[3] || pa[4] !== pb[4]) {
                    diff = true;
                    break;
                }
            }
        }
        this._layerDiffCache.set(key, diff);
        return diff;
    }

    _getRamp(dim, overlap) {
        const key = `${dim}:${overlap}`;
        if (this._rampCache.has(key)) {
            return this._rampCache.get(key);
        }
        const edge = Math.max(1, overlap * 2);
        const w = new Float32Array(dim);
        for (let i = 0; i < dim; i++) {
            if (i < edge) w[i] = (i + 0.5) / edge;
            else if (i >= dim - edge) w[i] = (dim - 1 - i + 0.5) / edge;
            else w[i] = 1.0;
        }
        this._rampCache.set(key, w);
        return w;
    }

    /**
     * Compose the active rigged pose into the offscreen canvas at timestamp `tSec`.
     * @param {number} [tSec=0]
     */
    renderFrame(tSec = 0) {
        if ((!this._gl && !this._ctx) || !this.manifest || !this.currentMood) {
            return;
        }
        const fd = this.manifest.frames?.[this.currentMood];
        if (!fd) {
            return;
        }

        const W = this.manifest.width;
        const H = this.manifest.height;
        const pivots = fd.pivots || {
            waist: [W * 0.5, H * 0.62],
            neck: [W * 0.5, H * 0.28],
            head: [W * 0.5, H * 0.20]
        };
        const [wx, wy] = pivots.waist;
        const [nx, ny] = pivots.neck;
        const [hx, hy] = pivots.head;

        const bodyDx = this.springs.bodyX.x;
        const bodyDy = this.springs.bodyY.x;
        const breath = this.springs.chest.x;
        const hRot = this.springs.headRot.x;
        const hDy = this.springs.headY.x;
        const fRot = this.springs.fHair.x;

        let blinkAmt = 0;
        if (this.blink && !this.reduceMotion) {
            const cyc = tSec % 3.8;
            if (cyc > 3.56) {
                blinkAmt = Math.sin(((cyc - 3.56) / 0.24) * Math.PI);
            }
        }
        const eyeSy = Math.max(0.08, 1.0 - blinkAmt * 0.92);
        const closedMood = this.blinkSwap ? findClosedEyesMood(this.manifest.frames, this.currentMood) : null;
        const useClosedSwap = blinkAmt > 0.55 && closedMood && closedMood !== this.currentMood;
        const eyeSrc = useClosedSwap ? this.manifest.frames[closedMood].organs : fd.organs;
        const syUse = useClosedSwap ? 1.0 : eyeSy;

        let bank = this._visemeCache.get(this.currentMood);
        if (!bank) {
            bank = buildVisemeBank(this.manifest, this.currentMood);
            this._visemeCache.set(this.currentMood, bank);
        }
        const talkKey = this.talkMouth || this.manifest.talkMouthMap?.[this.currentMood] || null;
        const talkSpec = talkKey && this.manifest.frames?.[talkKey]?.organs?.mouth
            ? this.manifest.frames[talkKey].organs.mouth
            : null;
        const mouthState = this.talk
            ? pickSpeechMouth(fd, tSec, bank, talkSpec, this.audioMetrics)
            : { spec: fd.organs?.mouth, sy: 1.0 };

        const layers = {};
        for (const lid of BODY_ORDER) {
            layers[lid] = this._getLayerCanvas(this.currentMood, lid);
        }

        // Scale-invariant subtle 2.5D head parallax & iris gaze offset keeping neck/shoulders seam-locked.
        const faceRef = Math.max(H * 0.14, (ny - hy) * 1.4);
        const gX = this.reduceMotion ? 0 : clamp(this.springs.lookX.x * faceRef * 0.012, Math.max(2.0, W * 0.0028));
        const gY = this.reduceMotion ? 0 : clamp(this.springs.lookY.x * faceRef * 0.008, Math.max(1.5, H * 0.0015));
        const eyeW = eyeSrc?.left_eye?.stage?.w || faceRef * 0.12;
        const eyeIrisX = this.reduceMotion ? 0 : clamp(this.springs.lookX.x * eyeW * 0.038, 3.5);

        let morphData = null;
        if (this._morph && !this.reduceMotion) {
            const prevFd = this.manifest.frames?.[this._morph.fromMood];
            if (prevFd) {
                const prevEyeSrc = useClosedSwap ? this.manifest.frames[closedMood].organs : prevFd.organs;
                const prevLayers = {};
                for (const lid of BODY_ORDER) {
                    if (this._layersDiffer(this._morph.fromMood, this.currentMood, lid)) {
                        prevLayers[lid] = this._getLayerCanvas(this._morph.fromMood, lid);
                    }
                }
                morphData = {
                    t: Math.min(1, Math.max(0, this._morph.elapsed / Math.max(0.01, this._morph.duration))),
                    prevMood: this._morph.fromMood,
                    prevLayers,
                    prevEyeSrc,
                    prevMouthSpec: prevFd.organs?.mouth,
                    prevRestMouthStage: prevFd.organs?.mouth?.stage,
                    prevEyeAngleDeg: prevFd.eyeAngleDeg || 0
                };
            }
        }

        let fxLayer = null;
        let fxTopLayer = null;
        const fxKeys = new Set([...(this.fx?.list || []), ...Object.keys(this._fxAlphas || {})]);
        if (fxKeys.size > 0) {
            const buildFxPass = (cProp, ctxProp, pass) => {
                if (!this[cProp]) {
                    this[cProp] = createCanvas(W, H);
                    this[ctxProp] = this[cProp]?.getContext?.("2d") || null;
                }
                if (!this[cProp] || !this[ctxProp]) return null;
                if (this[cProp].width !== W || this[cProp].height !== H) {
                    this[cProp].width = W;
                    this[cProp].height = H;
                }
                renderExpressionFx(this[ctxProp], {
                    width: W,
                    height: H,
                    leftEye: eyeSrc?.left_eye?.stage || null,
                    rightEye: eyeSrc?.right_eye?.stage || null,
                    headPivot: pivots.head,
                    eyeAngleDeg: fd.eyeAngleDeg || 0,
                    fxList: this.fx.list,
                    fxAlphas: this._fxAlphas,
                    intensity: this.fx.intensity,
                    speed: this.fx.speed,
                    tSec,
                    reduceMotion: this.reduceMotion,
                    pass
                });
                return this[cProp];
            };
            if (fxKeys.has("blush") || fxKeys.has("gloom_lines")) {
                fxLayer = buildFxPass("_fxCanvas", "_fxCtx", "skin");
            }
            if ([...fxKeys].some((f) => f !== "blush" && f !== "gloom_lines")) {
                fxTopLayer = buildFxPass("_fxTopCanvas", "_fxTopCtx", "top");
            }
        }

        if (this._gl) {
            this._gl.render({
                W,
                H,
                mood: this.currentMood,
                layers,
                atlasW: this._atlasW,
                atlasH: this._atlasH,
                eyeSrc,
                mouthState,
                restMouthStage: fd.organs?.mouth?.stage,
                syUse,
                eyeAngleDeg: fd.eyeAngleDeg || 0,
                lashColor: this.manifest.lashColor || "#3a2220",
                pivots,
                springs: this.springs,
                windPhase: this._windPhase,
                windAmp: this.reduceMotion ? 0 : Math.max(0, this.wind),
                gazeShift: { x: gX, y: gY, eyeIrisX },
                morph: morphData,
                tint: this.tint,
                fxLayer,
                fxTopLayer
            });
            return;
        }

        const mm = morphData ? evalMorphCurve(morphData.t) : { active: false, s: 1, prevAlpha: 0, nextAlpha: 1, eyeCushion: 1 };
        const eyeSyMorph = mm.active ? Math.max(0.08, syUse * mm.eyeCushion) : syUse;
        const ctx = this._ctx;
        const drawLayerBlended = (lid) => {
            const prevC = mm.active ? morphData.prevLayers?.[lid] : null;
            const curC = layers[lid];
            if (prevC && curC) {
                if (mm.prevAlpha > 0.002) {
                    ctx.save();
                    ctx.globalAlpha *= mm.prevAlpha;
                    ctx.drawImage(prevC, 0, 0);
                    ctx.restore();
                }
                if (mm.nextAlpha > 0.002) {
                    ctx.save();
                    ctx.globalAlpha *= mm.nextAlpha;
                    ctx.drawImage(curC, 0, 0);
                    ctx.restore();
                }
            } else if (curC) {
                ctx.drawImage(curC, 0, 0);
            }
        };

        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.translate(bodyDx, bodyDy);

        // 1. Back Hair: Canvas2D keeps back_hair & front_hair locked together (zero seam shear)
        if (layers.back_hair) {
            ctx.save();
            ctx.translate(nx, ny + hDy);
            ctx.rotate(hRot);
            ctx.translate(-nx, -ny);
            ctx.translate(hx, hy);
            ctx.rotate(fRot);
            ctx.translate(-hx, -hy);
            drawLayerBlended("back_hair");
            ctx.restore();
        }

        // 2. Lower Body (static ground anchor)
        if (layers.lower_body) {
            drawLayerBlended("lower_body");
        }

        // 3. Head/Neck Skin + Face Organs (Canvas2D shifts eyes gently inside sockets & blends mood morphs)
        const drawHeadGroup = () => {
            if (layers.skin_canvas) {
                drawLayerBlended("skin_canvas");
            }
            const angleRad = ((fd.eyeAngleDeg || 0) * Math.PI) / 180;
            const drawEye = (spec, alpha = 1.0, ang = angleRad) => {
                if (!spec || !this.atlas || alpha <= 0.002) return;
                const { atlas: a, stage: s } = spec;
                ctx.save();
                ctx.globalAlpha *= alpha;
                ctx.translate(s.cx + eyeIrisX, s.cy + gY * 0.5);
                ctx.rotate(ang);
                ctx.scale(1, eyeSyMorph);
                ctx.rotate(-ang);
                ctx.drawImage(this.atlas, a.x, a.y, a.w, a.h, -s.w / 2, -s.h / 2, s.w, s.h);
                ctx.restore();

                if (eyeSyMorph < 0.72) {
                    const lash = this.manifest.lashColor || "#3a2220";
                    ctx.save();
                    ctx.globalAlpha *= alpha;
                    ctx.translate(s.cx + eyeIrisX, s.cy + gY * 0.5);
                    ctx.rotate(ang);
                    ctx.strokeStyle = lash;
                    ctx.lineWidth = Math.max(2, s.h * 0.08);
                    ctx.beginPath();
                    ctx.moveTo(-s.w * 0.48, 0);
                    ctx.quadraticCurveTo(0, s.h * 0.14 * (1 - eyeSyMorph), s.w * 0.48, 0);
                    ctx.stroke();
                    ctx.restore();
                }
            };
            if (mm.active) {
                const prevAngRad = (morphData.prevEyeAngleDeg * Math.PI) / 180;
                drawEye(morphData.prevEyeSrc?.left_eye, mm.prevAlpha, prevAngRad);
                drawEye(morphData.prevEyeSrc?.right_eye, mm.prevAlpha, prevAngRad);
                if (morphData.prevMouthSpec && this.atlas && mm.prevAlpha > 0.002) {
                    const { atlas: a, stage: s } = morphData.prevMouthSpec;
                    const rs = morphData.prevRestMouthStage || s;
                    ctx.save();
                    ctx.globalAlpha *= mm.prevAlpha;
                    ctx.translate(rs.cx, rs.cy);
                    ctx.drawImage(this.atlas, a.x, a.y, a.w, a.h, -s.w / 2, -s.h / 2, s.w, s.h);
                    ctx.restore();
                }
            }
            drawEye(eyeSrc?.left_eye, mm.nextAlpha, angleRad);
            drawEye(eyeSrc?.right_eye, mm.nextAlpha, angleRad);

            if (mouthState.spec && this.atlas && mm.nextAlpha > 0.002) {
                const { atlas: a, stage: s } = mouthState.spec;
                const restStage = fd.organs?.mouth?.stage || s;
                ctx.save();
                ctx.globalAlpha *= mm.nextAlpha;
                ctx.translate(restStage.cx, restStage.cy);
                ctx.scale(1, mouthState.sy);
                ctx.drawImage(this.atlas, a.x, a.y, a.w, a.h, -s.w / 2, -s.h / 2, s.w, s.h);
                ctx.restore();
            }
            if (fxLayer) {
                ctx.drawImage(fxLayer, 0, 0);
            }
        };

        ctx.save();
        ctx.translate(nx, ny + hDy);
        ctx.rotate(hRot);
        ctx.translate(-nx, -ny);
        drawHeadGroup();
        ctx.restore();

        // 4. Upper Clothes (torso breathing subtly scaled at waist pivot, sits over neck underfill)
        if (layers.upper_clothes) {
            ctx.save();
            ctx.translate(wx, wy);
            ctx.scale(1 + breath * 0.0018, 1 + breath * 0.0024);
            ctx.translate(-wx, -wy - breath * 0.6);
            drawLayerBlended("upper_clothes");
            ctx.restore();
        }

        // 5. Front Hair (locked to head + crown pivot)
        if (layers.front_hair) {
            ctx.save();
            ctx.translate(nx, ny + hDy);
            ctx.rotate(hRot);
            ctx.translate(-nx, -ny);
            ctx.translate(hx, hy);
            ctx.rotate(fRot);
            ctx.translate(-hx, -hy);
            drawLayerBlended("front_hair");
            ctx.restore();
        }

        if (fxTopLayer) {
            ctx.save();
            ctx.translate(nx, ny + hDy);
            ctx.rotate(hRot);
            ctx.translate(-nx, -ny);
            ctx.drawImage(fxTopLayer, 0, 0);
            ctx.restore();
        }

        ctx.restore();

        if (this.tint && this.tint.strength > 0.002) {
            ctx.save();
            ctx.globalCompositeOperation = "source-atop";
            ctx.globalAlpha = Math.min(1, Math.max(0, this.tint.strength));
            ctx.fillStyle = this.tint.color || "#ffffff";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    /**
     * Release offscreen canvases, bitmaps, and caches.
     */
    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this._cancelLayerWarmup();
        this._finishMorph();
        this._layerCache.clear();
        this._layerDiffCache.clear();
        this._visemeCache.clear();
        this._rampCache.clear();
        this._gl?.dispose?.();
        this._gl = null;
        if (this.atlas && typeof this.atlas.close === "function") {
            try {
                this.atlas.close();
            } catch (_) {
                // Ignore if already closed
            }
        }
        this.atlas = null;
        this._atlasPixels = null;
        this._scratch = null;
        if (this._canvas) {
            this._canvas.width = 0;
            this._canvas.height = 0;
            this._canvas = null;
        }
        this._ctx = null;
        this.moods = {};
        this.manifest = null;
    }
}

export {
    RiggedOutfit,
    Spring1D,
    parseVnSpriteBuffer,
    decodeAtlasImage,
    findClosedEyesMood,
    buildVisemeBank,
    pickSpeechMouth
};

