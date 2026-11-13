import { jest } from "@jest/globals";
import { RollbackManager } from "../vnsutra_modules/rollback.js";
import { initAudioSystem } from "../vnsutra_modules/audio-effects-utils.js";

describe("RollbackManager & Audio Engine 2.0", () => {
    const origAudio = globalThis.Audio;
    const origAudioContext = globalThis.AudioContext;

    afterEach(() => {
        globalThis.Audio = origAudio;
        globalThis.AudioContext = origAudioContext;
    });

    test("RollbackManager records, steps back/forward, truncates abandoned branches, and restores state", async () => {
        const rb = new RollbackManager({ maxEntries: 5, throttleMs: 0 });
        rb.capture({ sceneName: "start", actionIndex: 1, vars: { score: 10 }, actors: { mary: { x: 0.2, y: 0.1, visible: true, mood: "Smiling" } }, camera: { x: 0, y: 0, zoom: 1 } });
        rb.capture({ sceneName: "start", actionIndex: 3, vars: { score: 25, key: true }, actors: { mary: { x: 0.5, y: 0.1, visible: true, mood: "Shocked" } }, camera: { x: 50, y: 0, zoom: 1.2 } });

        expect(rb.canRollback()).toBe(true);
        expect(rb.canRollForward()).toBe(false);

        const prev = rb.stepBack();
        expect(prev.actionIndex).toBe(1);
        expect(rb.canRollback()).toBe(false);
        expect(rb.canRollForward()).toBe(true);

        const vars = { score: 25, key: true };
        const actor = {
            x: 0.5,
            y: 0.1,
            visible: true,
            mood: "Shocked",
            show: jest.fn(),
            hide: jest.fn(),
            to: jest.fn(async ({ mood }) => { actor.mood = mood; })
        };
        const camera = { pan: jest.fn(async () => {}) };

        await rb.applySnapshot(prev, { vars, actors: { mary: actor }, camera });
        expect(vars).toEqual({ score: 10 });
        expect(actor.x).toBe(0.2);
        expect(actor.mood).toBe("Smiling");
        expect(camera.pan).toHaveBeenCalledWith({ x: 0, y: 0, zoom: 1, duration: 0.25 });

        const fwd = rb.stepForward();
        expect(fwd.actionIndex).toBe(3);

        // New capture after stepping back drops forward branch
        rb.stepBack();
        rb.capture({ sceneName: "start", actionIndex: 2, vars: { score: 99 } });
        expect(rb.canRollForward()).toBe(false);
        expect(rb.history).toHaveLength(2);
    });

    test("Audio Engine 2.0 handles BGM crossfade, ambient channel, ducking, and rate-limited blips", async () => {
        const createdAudios = [];
        globalThis.Audio = class MockAudio {
            constructor(src = "") {
                this.src = src;
                this.loop = false;
                this.volume = 1;
                this.play = jest.fn(async () => {});
                this.pause = jest.fn();
                createdAudios.push(this);
            }
        };

        const oscFreq = jest.fn();
        const oscStart = jest.fn();
        globalThis.AudioContext = class MockAudioCtx {
            constructor() { this.currentTime = 0; this.destination = {}; }
            createOscillator() {
                return { type: "", frequency: { setValueAtTime: oscFreq }, connect: jest.fn(), start: oscStart, stop: jest.fn() };
            }
            createGain() {
                return { gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: jest.fn() };
            }
        };

        const game = { sfxVolume: 1 };
        initAudioSystem(game);

        await game.playMusic("bgm1.mp3", { volume: 0.8 });
        expect(createdAudios[0].volume).toBe(0.8);

        await game.crossfadeMusic("bgm2.mp3", { duration: 0, volume: 0.6 });
        expect(createdAudios[0].pause).toHaveBeenCalled();
        expect(createdAudios[1].volume).toBe(0.6);

        await game.duckMusic(0.5, 0);
        expect(createdAudios[1].volume).toBeCloseTo(0.3, 4);
        await game.restoreMusic(0);
        expect(createdAudios[1].volume).toBeCloseTo(0.6, 4);

        await game.playAmbient("rain.mp3", { volume: 0.4, fadeIn: 0 });
        expect(createdAudios[2].loop).toBe(true);
        expect(createdAudios[2].volume).toBe(0.4);
        await game.stopAmbient(0);
        expect(createdAudios[2].pause).toHaveBeenCalled();

        // Voice playback ducks BGM, connects speech lip-sync, and restores BGM
        const mockActor = {
            data: { x: -320 },
            attachVoice: jest.fn(async () => {}),
            detachVoice: jest.fn()
        };
        await game.playVoice("voice_line1.mp3", { actor: mockActor, duck: true, duckRatio: 0.4 });
        expect(mockActor.attachVoice).toHaveBeenCalled();
        expect(createdAudios[createdAudios.length - 1].src).toBe("voice_line1.mp3");

        // Rate=2 plays only on even character indices
        expect(game.playBlip({ pitchHz: 400, rate: 2, charIndex: 0 })).toBe(true);
        expect(game.playBlip({ pitchHz: 400, rate: 2, charIndex: 1 })).toBe(false);
        expect(oscStart).toHaveBeenCalledTimes(1);
    });
});

