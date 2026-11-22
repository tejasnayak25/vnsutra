import { jest } from "@jest/globals";
import { CameraController } from "../vnsutra_modules/camera.js";
import { Game } from "../vnsutra_modules/game.js";
import { createStoryFromScript } from "../vnsutra_modules/story-script-runner.js";

describe("2.5D Multi-Plane Parallax Background Engine", () => {
    const origKonva = globalThis.Konva;

    afterEach(() => {
        globalThis.Konva = origKonva;
    });

    test("Game.setParallaxBackground splits planes into bgGroup and foreGroup based on depth", () => {
        const bgGroupChildren = [];
        const foreGroupChildren = [];
        let defaultBgVisible = true;

        const fakeUi = {
            game: {
                viewport: { width: () => 1280, height: () => 720 },
                container: { width: () => 1280, height: () => 720 },
                bg: {
                    visible: (v) => (v !== undefined ? (defaultBgVisible = v) : defaultBgVisible),
                    image: () => null
                },
                bgGroup: {
                    add: (node) => bgGroupChildren.push(node)
                },
                foreGroup: {
                    add: (node) => foreGroupChildren.push(node)
                }
            }
        };

        const createdImages = [];
        globalThis.Konva = {
            Image: class {
                constructor(cfg) {
                    this.cfg = cfg;
                    this.attrs = { ...cfg };
                    createdImages.push(this);
                }
                x(v) { return v !== undefined ? (this.attrs.x = v) : this.attrs.x; }
                y(v) { return v !== undefined ? (this.attrs.y = v) : this.attrs.y; }
                destroy() { this.destroyed = true; }
            },
            Filters: { Blur: "Blur" }
        };

        const game = new Game(fakeUi);
        const planes = game.setParallaxBackground([
            { id: "sky", depth: 0.15, image: { width: 1280, height: 720 } },
            { id: "mountains", depth: 0.45, image: { width: 1280, height: 720 } },
            { id: "terrace", depth: 1.0, image: { width: 1280, height: 720 } },
            { id: "vines", depth: 1.5, image: { width: 1280, height: 720 } }
        ]);

        expect(planes).toHaveLength(4);
        expect(defaultBgVisible).toBe(false);

        // First 3 planes (depth <= 1.0) go to bgGroup behind actors
        expect(bgGroupChildren).toHaveLength(3);
        // 4th plane (depth 1.5 > 1.0) goes to foreGroup in front of actors
        expect(foreGroupChildren).toHaveLength(1);
        expect(foreGroupChildren[0].cfg.id).toBe("vines");

        // Clear multi-plane background
        game.clearParallaxBackground();
        expect(defaultBgVisible).toBe(true);
        expect(createdImages.every((img) => img.destroyed)).toBe(true);
        expect(game.getParallaxPlanes()).toHaveLength(0);
    });

    test("CameraController applies optical depth coefficients for multi-plane camera pan", async () => {
        const cameraAttrs = { x: 640, y: 360, scaleX: 1, scaleY: 1, offsetX: 640, offsetY: 360, rotation: 0 };
        const fakeCameraNode = {
            x: (v) => (v !== undefined ? (cameraAttrs.x = v) : cameraAttrs.x),
            y: (v) => (v !== undefined ? (cameraAttrs.y = v) : cameraAttrs.y),
            scaleX: (v) => (v !== undefined ? (cameraAttrs.scaleX = v) : cameraAttrs.scaleX),
            scaleY: (v) => (v !== undefined ? (cameraAttrs.scaleY = v) : cameraAttrs.scaleY),
            offsetX: (v) => (v !== undefined ? (cameraAttrs.offsetX = v) : cameraAttrs.offsetX),
            offsetY: (v) => (v !== undefined ? (cameraAttrs.offsetY = v) : cameraAttrs.offsetY),
            rotation: (v) => (v !== undefined ? (cameraAttrs.rotation = v) : cameraAttrs.rotation),
            getLayer: () => ({ batchDraw: jest.fn() })
        };

        const planeAttrs = {
            far: { x: 0, y: 0 },
            mid: { x: 0, y: 0 },
            near: { x: 0, y: 0 },
            fore: { x: 0, y: 0 }
        };

        const createMockPlaneNode = (key) => ({
            x: (v) => (v !== undefined ? (planeAttrs[key].x = v) : planeAttrs[key].x),
            y: (v) => (v !== undefined ? (planeAttrs[key].y = v) : planeAttrs[key].y)
        });

        const fakeGame = {
            ui: {
                game: {
                    camera: fakeCameraNode,
                    viewport: { width: () => 1280, height: () => 720 },
                    container: { width: () => 1280, height: () => 720 },
                    bg: { x: () => 0, y: () => 0 }
                }
            }
        };

        globalThis.Konva = {
            Easings: { EaseInOut: "EaseInOut" }
        };

        const camera = new CameraController(fakeGame);
        camera.setPlanes([
            { id: "far", node: createMockPlaneNode("far"), depth: 0.2, baseX: 0, baseY: 0 },
            { id: "mid", node: createMockPlaneNode("mid"), depth: 0.6, baseX: 0, baseY: 0 },
            { id: "near", node: createMockPlaneNode("near"), depth: 1.0, baseX: 0, baseY: 0 },
            { id: "fore", node: createMockPlaneNode("fore"), depth: 1.5, baseX: 0, baseY: 0 }
        ]);

        // Pan camera by 200px horizontally at zoom=1.5
        await camera.pan({ x: 200, y: 100, zoom: 1.5, duration: 0 });

        const px = camera.state.x;
        const py = camera.state.y;
        expect(px).toBeGreaterThan(0);

        // Far plane (depth 0.2): factor = (1 - 0.2) = 0.8 -> moves with camera pan
        expect(planeAttrs.far.x).toBeCloseTo(px * 0.8, 2);
        expect(planeAttrs.far.y).toBeCloseTo(py * 0.8, 2);

        // Mid plane (depth 0.6): factor = (1 - 0.6) = 0.4
        expect(planeAttrs.mid.x).toBeCloseTo(px * 0.4, 2);

        // Near plane (depth 1.0): factor = (1 - 1.0) = 0.0 -> anchored to focal layer
        expect(planeAttrs.near.x).toBeCloseTo(0, 2);
        expect(planeAttrs.near.y).toBeCloseTo(0, 2);

        // Fore plane (depth 1.5): factor = (1 - 1.5) = -0.5 -> shifts in reverse
        expect(planeAttrs.fore.x).toBeCloseTo(px * -0.5, 2);
        expect(planeAttrs.fore.y).toBeCloseTo(py * -0.5, 2);
    });

    test("Story script runner executes background.parallax actions and resolves assets", async () => {
        const loadedPlanes = [];
        const mockGame = {
            setParallaxBackground: (planes) => {
                loadedPlanes.push(...planes);
            },
            clearParallaxBackground: jest.fn()
        };

        const storyActions = [
            {
                type: "background.parallax",
                planes: [
                    { asset: "sky_far", depth: 0.2 },
                    { asset: "city_mid", depth: 0.6 },
                    { asset: "street_near", depth: 1.0 },
                    { asset: "lantern_fore", depth: 1.4 }
                ]
            }
        ];

        const story = createStoryFromScript({
            scenes: {
                start: storyActions
            },
            getGame: () => mockGame,
            getAsset: (key) => ({ name: key, loaded: true })
        });
        await story.start();

        expect(loadedPlanes).toHaveLength(4);
        expect(loadedPlanes[0].depth).toBe(0.2);
        expect(loadedPlanes[0].image).toEqual({ name: "sky_far", loaded: true });
        expect(loadedPlanes[3].depth).toBe(1.4);
        expect(loadedPlanes[3].image).toEqual({ name: "lantern_fore", loaded: true });
    });

    test("CameraController mouse-tilt applies proportional dynamic offsets", () => {
        const planeAttrs = {
            far: { x: 0, y: 0 },
            fore: { x: 0, y: 0 }
        };

        const createMockPlaneNode = (key) => ({
            x: (v) => (v !== undefined ? (planeAttrs[key].x = v) : planeAttrs[key].x),
            y: (v) => (v !== undefined ? (planeAttrs[key].y = v) : planeAttrs[key].y)
        });

        const fakeGame = {
            ui: {
                game: {
                    camera: { x: () => 0, y: () => 0, getLayer: () => ({ batchDraw: jest.fn() }) },
                    viewport: { width: () => 1280, height: () => 720 },
                    container: { width: () => 1280, height: () => 720 },
                    bg: { x: () => 0, y: () => 0 }
                }
            }
        };

        const camera = new CameraController(fakeGame);
        camera.setParallax({ enabled: true, mouseTilt: true, maxTiltX: 40, maxTiltY: 20 });
        camera.setPlanes([
            { id: "far", node: createMockPlaneNode("far"), depth: 0.2, baseX: 0, baseY: 0 },
            { id: "fore", node: createMockPlaneNode("fore"), depth: 1.5, baseX: 0, baseY: 0 }
        ]);

        // Simulate tilt: mouse moved half-way to the right (tiltX = 0.5)
        camera._currentTilt = { x: 0.5, y: 0 };
        camera._applyPlaneTransforms();

        // Far plane (depth 0.2): factor = 0.8
        // tiltShiftX = -0.5 * 40 * 0.8 = -16px
        expect(planeAttrs.far.x).toBeCloseTo(-16, 2);

        // Fore plane (depth 1.5): factor = -0.5
        // tiltShiftX = -0.5 * 40 * (-0.5) = +10px
        expect(planeAttrs.fore.x).toBeCloseTo(10, 2);
    });
});
