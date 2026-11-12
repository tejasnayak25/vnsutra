import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

function buildSyntheticVnSprite(manifest, atlasBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0])) {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const buf = new ArrayBuffer(12 + jsonBytes.byteLength + atlasBytes.byteLength);
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);

    bytes[0] = 0x56; // V
    bytes[1] = 0x4e; // N
    bytes[2] = 0x53; // S
    bytes[3] = 0x52; // R
    view.setUint16(4, 1, true);
    view.setUint16(6, 0, true);
    view.setUint32(8, jsonBytes.byteLength, true);
    bytes.set(jsonBytes, 12);
    bytes.set(atlasBytes, 12 + jsonBytes.byteLength);
    return buf;
}

function createSampleManifest() {
    return {
        character: "Nanami",
        format: "semantic-quadtree-atlas-v2",
        width: 800,
        height: 1200,
        overlap: 2,
        lashColor: "#3a2220",
        atlas: { width: 1024, height: 1024, uniqueTiles: 4, uniqueOrgans: 6 },
        frames: {
            "Nanami_Casual_Neutral.png": {
                eyeAngleDeg: 0,
                pivots: { waist: [400, 740], neck: [400, 340], head: [400, 240] },
                layerBlocks: {
                    back_hair: [[0, 0, 64, 0, 0, 0]],
                    lower_body: [],
                    skin_canvas: [],
                    upper_clothes: [],
                    front_hair: []
                },
                organs: {
                    left_eye: { atlas: { x: 0, y: 0, w: 60, h: 40 }, stage: { x: 320, y: 260, w: 60, h: 40, cx: 350, cy: 280 } },
                    right_eye: { atlas: { x: 64, y: 0, w: 60, h: 40 }, stage: { x: 420, y: 260, w: 60, h: 40, cx: 450, cy: 280 } },
                    mouth: { atlas: { x: 0, y: 64, w: 40, h: 12 }, stage: { x: 380, y: 330, w: 40, h: 12, cx: 400, cy: 336 } }
                }
            },
            "Nanami_Casual_Smiling_EyesClosed.png": {
                eyeAngleDeg: 0,
                pivots: { waist: [400, 740], neck: [400, 340], head: [400, 240] },
                layerBlocks: { back_hair: [], lower_body: [], skin_canvas: [], upper_clothes: [], front_hair: [] },
                organs: {
                    left_eye: { atlas: { x: 128, y: 0, w: 60, h: 18 }, stage: { x: 320, y: 270, w: 60, h: 18, cx: 350, cy: 279 } },
                    right_eye: { atlas: { x: 192, y: 0, w: 60, h: 18 }, stage: { x: 420, y: 270, w: 60, h: 18, cx: 450, cy: 279 } },
                    mouth: { atlas: { x: 64, y: 64, w: 52, h: 28 }, stage: { x: 374, y: 324, w: 52, h: 28, cx: 400, cy: 338 } }
                }
            }
        }
    };
}

function setupFakeKonva() {
    class FakeKonvaImage {
        constructor(cfg = {}) {
            this._attrs = { ...cfg };
            this._image = null;
            this._x = 0;
            this._y = 0;
            this._scale = { x: 1, y: 1 };
            this._opacity = 1;
            this._visible = true;
            this._filters = cfg.filters || [];
            this._parent = { batchDraw: jest.fn() };
            this._handlers = new Map();
            this.cached = false;
        }
        image(val) { if (val !== undefined) { this._image = val; return this; } return this._image; }
        x(val) { if (val !== undefined) { this._x = val; return this; } return this._x; }
        y(val) { if (val !== undefined) { this._y = val; return this; } return this._y; }
        scale(val) { if (val !== undefined) { this._scale = val; return this; } return this._scale; }
        opacity(val) { if (val !== undefined) { this._opacity = val; return this; } return this._opacity; }
        visible(val) { if (val !== undefined) { this._visible = val; return this; } return this._visible; }
        filters(val) { if (val !== undefined) { this._filters = val; return this; } return this._filters; }
        blurRadius(val) { if (val !== undefined) { this._attrs.blurRadius = val; return this; } return this._attrs.blurRadius; }
        noise(val) { if (val !== undefined) { this._attrs.noise = val; return this; } return this._attrs.noise; }
        pixelSize(val) { if (val !== undefined) { this._attrs.pixelSize = val; return this; } return this._attrs.pixelSize; }
        brightness(val) { if (val !== undefined) { this._attrs.brightness = val; return this; } return this._attrs.brightness; }
        contrast(val) { if (val !== undefined) { this._attrs.contrast = val; return this; } return this._attrs.contrast; }
        hue(val) { if (val !== undefined) { this._attrs.hue = val; return this; } return this._attrs.hue; }
        saturation(val) { if (val !== undefined) { this._attrs.saturation = val; return this; } return this._attrs.saturation; }
        luminance(val) { if (val !== undefined) { this._attrs.luminance = val; return this; } return this._attrs.luminance; }
        setAttr(k, v) { this._attrs[k] = v; return this; }
        getAttr(k) { return this._attrs[k]; }
        setAttrs(obj) { Object.assign(this._attrs, obj); if (obj.opacity !== undefined) this._opacity = obj.opacity; return this; }
        getParent() { return this._parent; }
        getLayer() { return this._parent; }
        cache() { this.cached = true; }
        clearCache() { this.cached = false; }
        on(ev, fn) { this._handlers.set(ev, fn); }
        destroy() { this._parent = null; }
    }

    class FakeTween {
        constructor(cfg) { this.cfg = cfg; }
        play() {
            const { node, onFinish, ...rest } = this.cfg;
            delete rest.duration;
            delete rest.easing;
            node?.setAttrs?.(rest);
            onFinish?.();
        }
    }

    globalThis.Konva = {
        Image: FakeKonvaImage,
        Tween: FakeTween,
        Filters: {
            Blur: "Blur",
            Noise: "Noise",
            Pixelate: "Pixelate",
            Brighten: "Brighten",
            Contrast: "Contrast",
            HSL: "HSL",
            Grayscale: "Grayscale",
            Invert: "Invert"
        }
    };
}

describe("RiggedOutfit & RiggedCharacter (.vnsprite runtime)", () => {
    const origKonva = globalThis.Konva;
    const origCreateImageBitmap = globalThis.createImageBitmap;
    const origFetch = globalThis.fetch;

    beforeEach(() => {
        jest.resetModules();
        setupFakeKonva();
        globalThis.createImageBitmap = jest.fn(async () => ({
            width: 1024,
            height: 1024,
            close: jest.fn()
        }));
    });

    afterEach(() => {
        globalThis.Konva = origKonva;
        globalThis.createImageBitmap = origCreateImageBitmap;
        globalThis.fetch = origFetch;
    });

    test("parseVnSpriteBuffer decodes valid containers and rejects invalid magic/version", async () => {
        const { parseVnSpriteBuffer } = await import("../vnsutra_modules/assets/rigged-outfit.js");

        const manifest = createSampleManifest();
        const rawPayload = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
        const validBuf = buildSyntheticVnSprite(manifest, rawPayload);

        const parsed = parseVnSpriteBuffer(validBuf);
        expect(parsed.version).toBe(1);
        expect(parsed.flags).toBe(0);
        expect(parsed.manifest.character).toBe("Nanami");
        expect(Object.keys(parsed.manifest.frames)).toHaveLength(2);
        expect(Array.from(parsed.atlasBytes)).toEqual(Array.from(rawPayload));

        // Corrupt magic
        const badMagic = validBuf.slice(0);
        new Uint8Array(badMagic)[0] = 0x58;
        expect(() => parseVnSpriteBuffer(badMagic)).toThrow(/magic/i);

        // Unsupported version
        const badVer = validBuf.slice(0);
        new DataView(badVer).setUint16(4, 99, true);
        expect(() => parseVnSpriteBuffer(badVer)).toThrow(/version/i);

        // If packed Nanami artifact exists on disk, verify its real header parses cleanly
        const diskPath = path.resolve("dist/sprite-experiment/unified_nanami/Casual.vnsprite");
        if (fs.existsSync(diskPath)) {
            const diskBytes = fs.readFileSync(diskPath);
            const diskParsed = parseVnSpriteBuffer(diskBytes);
            expect(diskParsed.manifest.character).toBe("Nanami");
            expect(diskParsed.manifest.outfit).toBe("Casual");
            expect(Object.keys(diskParsed.manifest.frames).length).toBeGreaterThan(0);
            expect(String.fromCharCode(...diskParsed.atlasBytes.slice(0, 4))).toBe("RIFF");
        }
    });

    test("RiggedCharacter loads .vnsprite via fetch, integrates with DynamicSprites, and handles spring/mouth actions", async () => {
        const gameSettings = {
            text_animation: true,
            "accessibility-reduce-motion": false
        };

        await jest.unstable_mockModule("../vnsutra_modules/runtime-state.js", () => ({
            getGame: () => ({
                ui: {
                    game: {
                        container: {
                            width: () => 1280,
                            height: () => 720
                        }
                    }
                }
            }),
            getIsPortrait: () => false,
            getGameSettings: () => gameSettings,
            getShouldAbortGame: () => false
        }));

        await jest.unstable_mockModule("../vnsutra_modules/error-tracking.js", () => ({
            default: { captureError: jest.fn() }
        }));

        const manifest = createSampleManifest();
        const bin = buildSyntheticVnSprite(manifest);
        globalThis.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => bin
        }));

        const { RiggedCharacter } = await import("../vnsutra_modules/assets/rigged-character.js");
        const { default: DynamicSprites } = await import("../vnsutra_modules/dynamic-sprites.js");

        const nanami = new RiggedCharacter({ name: "Nanami", folder: "characters/Nanami", scale: 1 });
        await nanami.loadOutfit("Casual");

        expect(globalThis.fetch).toHaveBeenCalledWith("./assets/game-assets/characters/Nanami/Casual.vnsprite");
        expect(nanami.outfit).toBeTruthy();
        expect(Object.keys(nanami.outfit.moods)).toContain("Nanami_Casual_Neutral.png");
        expect(nanami.mood).toBe("Nanami_Casual_Neutral.png");

        // DynamicSprites parity
        nanami.sprites = new DynamicSprites(nanami);
        nanami.sprites.defineMany({
            neutral: { outfit: "Casual", mood: "Nanami_Casual_Neutral" },
            closedSmile: { outfit: "Casual", mood: "Nanami_Casual_Smiling_EyesClosed" }
        });
        await nanami.sprites.apply("closedSmile", { duration: 0.2 });
        expect(nanami.mood).toBe("Nanami_Casual_Smiling_EyesClosed.png");

        // Secondary spring impulses + rig property sync
        nanami.wind = 1.1;
        nanami.blink = false;
        nanami.breathe = false;
        nanami.setTalkMouth("Nanami_Casual_Smiling_EyesClosed.png");
        nanami.startTalking();
        expect(nanami.outfit.wind).toBe(1.1);
        expect(nanami.outfit.blink).toBe(false);
        expect(nanami.outfit.breathe).toBe(false);
        expect(nanami.outfit.talkMouth).toBe("Nanami_Casual_Smiling_EyesClosed.png");
        nanami.stopTalking();

        nanami.hop(200);
        nanami.shake(300);
        expect(nanami.outfit.springs.bodyY.v).toBeLessThan(0);
        expect(nanami.outfit.springs.bodyX.v).toBeGreaterThan(0);

        // Accessibility reduced motion resets springs cleanly
        gameSettings["accessibility-reduce-motion"] = true;
        nanami._syncReduceMotion();
        expect(nanami.outfit.springs.bodyY.v).toBe(0);
        expect(nanami.outfit.springs.bodyX.v).toBe(0);
        gameSettings["accessibility-reduce-motion"] = false;

        nanami.dispose();
    });

    test("RiggedCharacter automatically toggles lip-sync on EVENTS.DIALOG and EVENTS.DIALOG_END", async () => {
        const listeners = new Map();
        const origAdd = globalThis.addEventListener;
        const origRemove = globalThis.removeEventListener;
        globalThis.addEventListener = (type, fn) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        };
        globalThis.removeEventListener = (type, fn) => {
            listeners.get(type)?.delete(fn);
        };

        try {
            const { RiggedCharacter } = await import("../vnsutra_modules/assets/rigged-character.js");
            const { EVENTS } = await import("../vnsutra_modules/constants.js");

            const bin = buildSyntheticVnSprite(createSampleManifest());
            const nanami = new RiggedCharacter({ name: "Nanami", folder: "characters/Nanami" });
            await nanami.loadOutfit("Casual", bin);

            expect(nanami.outfit.talk).toBe(false);

            // Matching speaker starts talking
            for (const fn of listeners.get(EVENTS.DIALOG) || []) {
                fn({ detail: { speaker: "Nanami", text: "Hello there!", animating: true } });
            }
            expect(nanami.outfit.talk).toBe(true);

            // Another speaker stops Nanami
            for (const fn of listeners.get(EVENTS.DIALOG) || []) {
                fn({ detail: { speaker: "Akane", text: "Hey!", animating: true } });
            }
            expect(nanami.outfit.talk).toBe(false);

            // Matching again then DIALOG_END stops talking
            for (const fn of listeners.get(EVENTS.DIALOG) || []) {
                fn({ detail: { speaker: "Nanami", text: "Continuing!", animating: true } });
            }
            expect(nanami.outfit.talk).toBe(true);

            for (const fn of listeners.get(EVENTS.DIALOG_END) || []) {
                fn({ detail: { speaker: "Nanami" } });
            }
            expect(nanami.outfit.talk).toBe(false);

            nanami.dispose();
        } finally {
            globalThis.addEventListener = origAdd;
            globalThis.removeEventListener = origRemove;
        }
    });

    test("RiggedCharacter gaze springs track pointer / lookAt and WebGLRigRenderer compiles & renders with fallback", async () => {
        const listeners = new Map();
        const origAdd = globalThis.addEventListener;
        const origRemove = globalThis.removeEventListener;
        globalThis.addEventListener = (type, fn) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        };
        globalThis.removeEventListener = (type, fn) => {
            listeners.get(type)?.delete(fn);
        };

        try {
            const { RiggedCharacter } = await import("../vnsutra_modules/assets/rigged-character.js");
            const { WebGLRigRenderer, GRID_COLS, GRID_ROWS, evalMorphCurve } = await import("../vnsutra_modules/assets/webgl-rig.js");

            // Headless canvas returns null cleanly
            expect(WebGLRigRenderer.tryCreate({ getContext: () => null })).toBeNull();

            // Mock WebGL2 context verifies shader compile, mesh upload, render & cleanup for any character manifest
            const drawElements = jest.fn();
            const drawArrays = jest.fn();
            const fakeGl = {
                VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
                ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7,
                TEXTURE_2D: 8, RGBA: 9, UNSIGNED_BYTE: 10, TEXTURE0: 11, TEXTURE1: 12,
                UNPACK_PREMULTIPLY_ALPHA_WEBGL: 12, TEXTURE_WRAP_S: 13, TEXTURE_WRAP_T: 14,
                TEXTURE_MIN_FILTER: 15, TEXTURE_MAG_FILTER: 16, CLAMP_TO_EDGE: 17, LINEAR: 18,
                BLEND: 19, ONE: 20, ONE_MINUS_SRC_ALPHA: 21, COLOR_BUFFER_BIT: 22,
                TRIANGLES: 23, TRIANGLE_STRIP: 24, UNSIGNED_SHORT: 25, FLOAT: 26,
                createShader: jest.fn(() => ({})),
                shaderSource: jest.fn(),
                compileShader: jest.fn(),
                getShaderParameter: jest.fn(() => true),
                deleteShader: jest.fn(),
                createProgram: jest.fn(() => ({})),
                attachShader: jest.fn(),
                linkProgram: jest.fn(),
                getProgramParameter: jest.fn(() => true),
                deleteProgram: jest.fn(),
                getAttribLocation: jest.fn(() => 0),
                getUniformLocation: jest.fn(() => ({})),
                createVertexArray: jest.fn(() => ({})),
                bindVertexArray: jest.fn(),
                deleteVertexArray: jest.fn(),
                createBuffer: jest.fn(() => ({})),
                bindBuffer: jest.fn(),
                bufferData: jest.fn(),
                deleteBuffer: jest.fn(),
                enableVertexAttribArray: jest.fn(),
                vertexAttribPointer: jest.fn(),
                createTexture: jest.fn(() => ({})),
                bindTexture: jest.fn(),
                pixelStorei: jest.fn(),
                texParameteri: jest.fn(),
                texImage2D: jest.fn(),
                deleteTexture: jest.fn(),
                viewport: jest.fn(),
                clearColor: jest.fn(),
                clear: jest.fn(),
                enable: jest.fn(),
                blendFunc: jest.fn(),
                useProgram: jest.fn(),
                uniform1i: jest.fn(),
                uniform1f: jest.fn(),
                uniform2f: jest.fn(),
                uniform4f: jest.fn(),
                activeTexture: jest.fn(),
                drawElements,
                drawArrays
            };
            const renderer = WebGLRigRenderer.tryCreate({ getContext: (kind) => (kind === "webgl2" ? fakeGl : null) });
            expect(renderer).toBeTruthy();
            expect(renderer.geom.meshIndexCount).toBe(GRID_COLS * GRID_ROWS * 6);

            const sampleManifest = createSampleManifest();
            const fd = sampleManifest.frames["Nanami_Casual_Neutral.png"];
            renderer.setAtlas({ width: 1024, height: 1024 });
            renderer.render({
                W: 800,
                H: 1200,
                mood: "Nanami_Casual_Neutral.png",
                layers: { back_hair: {}, lower_body: {}, skin_canvas: {}, upper_clothes: {}, front_hair: {} },
                atlasW: 1024,
                atlasH: 1024,
                eyeSrc: fd.organs,
                mouthState: { spec: fd.organs.mouth, sy: 1 },
                restMouthStage: fd.organs.mouth.stage,
                syUse: 0.5,
                eyeAngleDeg: 0,
                lashColor: "#3a2220",
                pivots: fd.pivots,
                springs: {
                    bodyX: { x: 0 }, bodyY: { x: 0 }, chest: { x: 0 },
                    headRot: { x: 0 }, headY: { x: 0 }, fHair: { x: 0 }
                },
                windPhase: 1.0,
                windAmp: 0.35,
                gazeShift: { x: 3.0, y: 1.5, eyeIrisX: 1.2 }
            });
            expect(drawElements).toHaveBeenCalledTimes(5);
            // 2 eyes + 1 mouth + 2 blink lash curves (syUse=0.5 < 0.72)
            expect(drawArrays).toHaveBeenCalledTimes(5);

            // Morph pass blends previous + target skin/organs smoothly via quintic curve
            const qMid = evalMorphCurve(0.5);
            expect(qMid.s).toBeCloseTo(0.5, 5);
            expect(qMid.prevAlpha).toBeCloseTo(0.75, 5);
            expect(qMid.nextAlpha).toBeCloseTo(0.75, 5);
            expect(qMid.eyeCushion).toBeLessThan(1.0);

            drawElements.mockClear();
            drawArrays.mockClear();
            renderer.render({
                W: 800,
                H: 1200,
                mood: "Nanami_Casual_Neutral.png",
                layers: { back_hair: {}, lower_body: {}, skin_canvas: {}, upper_clothes: {}, front_hair: {} },
                atlasW: 1024,
                atlasH: 1024,
                eyeSrc: fd.organs,
                mouthState: { spec: fd.organs.mouth, sy: 1 },
                restMouthStage: fd.organs.mouth.stage,
                syUse: 1.0,
                eyeAngleDeg: 0,
                lashColor: "#3a2220",
                pivots: fd.pivots,
                springs: {
                    bodyX: { x: 0 }, bodyY: { x: 0 }, chest: { x: 0 },
                    headRot: { x: 0 }, headY: { x: 0 }, fHair: { x: 0 }
                },
                windPhase: 1.0,
                windAmp: 0.35,
                gazeShift: { x: 0, y: 0, eyeIrisX: 0 },
                morph: {
                    t: 0.5,
                    prevMood: "Nanami_Casual_Smiling_EyesClosed.png",
                    prevLayers: { skin_canvas: {} },
                    prevEyeSrc: fd.organs,
                    prevMouthSpec: fd.organs.mouth,
                    prevRestMouthStage: fd.organs.mouth.stage,
                    prevEyeAngleDeg: 0
                }
            });
            expect(drawElements).toHaveBeenCalledTimes(5);
            // 3 previous organs + 3 target organs
            expect(drawArrays).toHaveBeenCalledTimes(6);
            renderer.dispose();

            // Gaze tracking springs on RiggedCharacter
            const char = new RiggedCharacter({ name: "AnyChar", folder: "characters/Any" });
            await char.loadOutfit("Casual", buildSyntheticVnSprite(sampleManifest));
            for (const fn of listeners.get("pointermove") || []) {
                fn({ clientX: 1100, clientY: 180 });
            }
            expect(char.outfit.lookTarget.x).toBeGreaterThan(0);
            for (let i = 0; i < 20; i++) {
                char.outfit.stepPhysics(0.016, i * 0.016);
            }
            expect(char.outfit.springs.lookX.x).toBeGreaterThan(0.1);

            char.lookAt(-0.75, 0.4);
            expect(char.outfit.lookTarget).toEqual({ x: -0.75, y: 0.4 });
            char.clearLookAt();
            expect(char.outfit.lookTarget).toEqual({ x: 0, y: 0 });
            char.dispose();
        } finally {
            globalThis.addEventListener = origAdd;
            globalThis.removeEventListener = origRemove;
        }
    });

    test("RiggedCharacter handles punctuation reactions, speaker attention glance, talkMouthMap, and Web Audio lip-sync", async () => {
        const listeners = new Map();
        const origAdd = globalThis.addEventListener;
        const origRemove = globalThis.removeEventListener;
        globalThis.addEventListener = (type, fn) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        };
        globalThis.removeEventListener = (type, fn) => {
            listeners.get(type)?.delete(fn);
        };

        try {
            const { RiggedCharacter } = await import("../vnsutra_modules/assets/rigged-character.js");
            const { pickSpeechMouth, buildVisemeBank } = await import("../vnsutra_modules/assets/rigged-outfit.js");
            const { EVENTS } = await import("../vnsutra_modules/constants.js");

            const manifest = createSampleManifest();
            manifest.talkMouthMap = {
                "Nanami_Casual_Neutral.png": "Nanami_Casual_Smiling_EyesClosed.png"
            };
            const actor = new RiggedCharacter({ name: "Nanami", folder: "characters/Nanami", x: 0.8 });
            await actor.loadOutfit("Casual", buildSyntheticVnSprite(manifest));

            // 1. Punctuation cues: '!' hops, '?' tilts head
            for (const fn of listeners.get(EVENTS.DIALOG) || []) {
                fn({ detail: { speaker: "Nanami", text: "Watch out!", animating: true } });
            }
            expect(actor.outfit.springs.bodyY.v).toBeLessThan(0);

            for (const fn of listeners.get(EVENTS.DIALOG) || []) {
                fn({ detail: { speaker: "Nanami", text: "Really?", animating: true } });
            }
            expect(actor.outfit.springs.headRot.v).toBeGreaterThan(0);

            // 2. Speaker attention: Mary speaks on left (x=0.2) -> Nanami on right (x=0.8) glances left
            for (const fn of listeners.get(EVENTS.DIALOG) || []) {
                fn({ detail: { speaker: "Mary", speakerX: 0.2, text: "Hi there!", animating: true } });
            }
            expect(actor.outfit.lookTarget.x).toBeLessThan(0);

            for (const fn of listeners.get(EVENTS.DIALOG_END) || []) {
                fn({ detail: { speaker: "Mary" } });
            }
            expect(actor.outfit.lookTarget.x).toBe(0);

            // 3. Live audio analyser RMS & formant viseme mapping
            const fakeAnalyser = {
                fftSize: 32,
                frequencyBinCount: 16,
                disconnect: jest.fn(),
                getByteTimeDomainData(buf) {
                    for (let i = 0; i < buf.length; i++) {
                        buf[i] = i % 2 === 0 ? 190 : 66; // loud signal
                    }
                },
                getByteFrequencyData(buf) {
                    buf.fill(10);
                    buf[0] = 200;
                    buf[1] = 200; // low-frequency round vowel dominance
                }
            };
            expect(actor.attachAudio({ analyser: fakeAnalyser })).toBe(true);
            const metrics = actor._sampleAudioMetrics();
            expect(metrics.rms).toBeGreaterThan(0.2);
            expect(metrics.roundness).toBeGreaterThan(0.55);

            const fd = manifest.frames["Nanami_Casual_Neutral.png"];
            const bank = buildVisemeBank(manifest, "Nanami_Casual_Neutral.png");
            const silentMouth = pickSpeechMouth(fd, 0.1, bank, null, { rms: 0.005, roundness: 0.5 });
            expect(silentMouth.spec).toBe(fd.organs.mouth);
            const loudRound = pickSpeechMouth(fd, 0.1, bank, null, metrics);
            expect(loudRound.spec).toBe(bank.round);

            const lockedMouth = pickSpeechMouth(fd, 0.1, bank, manifest.frames[manifest.talkMouthMap["Nanami_Casual_Neutral.png"]].organs.mouth, metrics);
            expect(lockedMouth.sy).toBeGreaterThan(0.9);

            actor.detachAudio();
            expect(fakeAnalyser.disconnect).toHaveBeenCalled();
            actor.dispose();
        } finally {
            globalThis.addEventListener = origAdd;
            globalThis.removeEventListener = origRemove;
        }
    });
});

