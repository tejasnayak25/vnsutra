import { jest } from "@jest/globals";
import { CameraController, LIGHTING_PRESETS } from "../vnsutra_modules/camera.js";
import { renderWipeFrame, WIPE_TYPES } from "../vnsutra_modules/visual-effects-utils.js";

describe("Cinematic Stage 2.0 (Camera, Ambient Lighting & Wipe Masks)", () => {
    const origKonva = globalThis.Konva;

    afterEach(() => {
        globalThis.Konva = origKonva;
    });

    test("CameraController pans, focuses on actors, resets, and applies lighting presets", async () => {
        const attrs = { x: 640, y: 360, scaleX: 1, scaleY: 1, offsetX: 640, offsetY: 360, rotation: 0 };
        const fakeCameraNode = {
            x: (v) => (v !== undefined ? (attrs.x = v) : attrs.x),
            y: (v) => (v !== undefined ? (attrs.y = v) : attrs.y),
            scaleX: (v) => (v !== undefined ? (attrs.scaleX = v) : attrs.scaleX),
            scaleY: (v) => (v !== undefined ? (attrs.scaleY = v) : attrs.scaleY),
            offsetX: (v) => (v !== undefined ? (attrs.offsetX = v) : attrs.offsetX),
            offsetY: (v) => (v !== undefined ? (attrs.offsetY = v) : attrs.offsetY),
            rotation: (v) => (v !== undefined ? (attrs.rotation = v) : attrs.rotation),
            getLayer: () => ({ batchDraw: jest.fn() })
        };

        globalThis.Konva = {
            Easings: { EaseInOut: "EaseInOut" },
            Tween: class {
                constructor(cfg) { this.cfg = cfg; }
                play() {
                    const { node, onFinish, x, y, scaleX, scaleY, rotation } = this.cfg;
                    node.x(x);
                    node.y(y);
                    node.scaleX(scaleX);
                    node.scaleY(scaleY);
                    node.rotation(rotation);
                    onFinish?.();
                }
                destroy() {}
            }
        };

        const fakeGame = {
            ui: {
                game: {
                    camera: fakeCameraNode,
                    viewport: { width: () => 1280, height: () => 720 }
                }
            }
        };

        const camera = new CameraController(fakeGame);
        await camera.pan({ x: 0.1, y: -0.05, zoom: 1.4, rotation: 2.5, duration: 0.5 });

        expect(attrs.scaleX).toBeCloseTo(1.4, 4);
        expect(attrs.scaleY).toBeCloseTo(1.4, 4);
        expect(attrs.rotation).toBe(2.5);
        expect(attrs.x).toBeCloseTo(640 - 128 * 1.4, 2);

        const actor = {
            setTint: jest.fn(),
            img: {
                x: () => 900,
                y: () => 100,
                width: () => 300,
                height: () => 600,
                scaleX: () => 1,
                scaleY: () => 1
            }
        };
        await camera.focus(actor, { zoom: 1.3, duration: 0.4 });
        expect(attrs.scaleX).toBeCloseTo(1.3, 4);
        expect(camera.state.x).toBeGreaterThan(0);

        const lighting = camera.setLighting("sunset", undefined, [actor]);
        expect(lighting).toEqual(LIGHTING_PRESETS.sunset);
        expect(actor.setTint).toHaveBeenCalledWith(LIGHTING_PRESETS.sunset.color, LIGHTING_PRESETS.sunset.strength);

        camera.clearLighting([actor]);
        expect(actor.setTint).toHaveBeenLastCalledWith("#ffffff", 0);

        await camera.reset({ duration: 0.2 });
        expect(attrs.scaleX).toBe(1);
        expect(attrs.rotation).toBe(0);
        expect(attrs.x).toBe(640);
        expect(attrs.y).toBe(360);

        // Strict 2D boundary clamping: zoom < 1 or panning at zoom=1 never exposes void edges
        await camera.pan({ x: 0.4, y: -0.4, zoom: 0.7, duration: 0 });
        expect(attrs.scaleX).toBe(1);
        expect(camera.state.x).toBe(0);
        expect(camera.state.y).toBe(0);

        // At zoom=1.5, max pan is (0.5 / 3.0) * w = w / 6 (~213.33px), keeping edges flush inside viewport
        await camera.pan({ x: 0.5, y: 0.5, zoom: 1.5, duration: 0 });
        expect(camera.state.x).toBeCloseTo(1280 / 6, 2);
        expect(camera.state.y).toBeCloseTo(720 / 6, 2);

        // Depth parallax test
        const bgAttrs = { x: 0, y: 0 };
        fakeGame.ui.game.bg = {
            x: (v) => (v !== undefined ? (bgAttrs.x = v) : bgAttrs.x),
            y: (v) => (v !== undefined ? (bgAttrs.y = v) : bgAttrs.y)
        };
        camera.setParallax({ enabled: true, bgMultiplier: 0.4 });
        await camera.pan({ x: 0.2, y: 0.1, zoom: 1.4, duration: 0 });
        // Background shifts at (1 - 0.4) * pan = 0.6 * pan to simulate distant scenic plane
        expect(bgAttrs.x).toBeCloseTo(camera.state.x * 0.6, 2);
        expect(bgAttrs.y).toBeCloseTo(camera.state.y * 0.6, 2);
    });

    test("renderWipeFrame draws directional, iris, and blinds wipe masks", () => {
        const calls = [];
        const ctx = {
            fillStyle: "",
            globalAlpha: 1,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            fillRect: jest.fn((...args) => calls.push(["fillRect", ...args])),
            beginPath: jest.fn(),
            rect: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(() => calls.push(["fill"]))
        };

        for (const wipeType of WIPE_TYPES) {
            calls.length = 0;
            renderWipeFrame(ctx, 1000, 500, wipeType, 0.5, "#112233");
            expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1000, 500);
            expect(calls.length).toBeGreaterThan(0);
        }

        calls.length = 0;
        renderWipeFrame(ctx, 1000, 500, "wipe-left", 1, "#000000");
        expect(calls[0]).toEqual(["fillRect", 0, 0, 1000, 500]);
    });
});

