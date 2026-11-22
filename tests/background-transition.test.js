import { jest } from "@jest/globals";
import { Game } from "../vnsutra_modules/game.js";
import { executeActions } from "../vnsutra_modules/story-script-runner.js";

describe("Smooth Background & Stage Transitions", () => {
    let mockBg;
    let mockBgGroup;
    let mockUi;
    let origKonva;

    beforeEach(() => {
        origKonva = globalThis.Konva;

        const bgState = {
            image: null,
            opacity: 1,
            visible: true,
            scale: { x: 1, y: 1 },
            x: 0,
            y: 0
        };

        mockBg = {
            image: jest.fn((img) => (img !== undefined ? (bgState.image = img) : bgState.image)),
            scale: jest.fn((s) => (s !== undefined ? (bgState.scale = s) : bgState.scale)),
            x: jest.fn((v) => (v !== undefined ? (bgState.x = v) : bgState.x)),
            y: jest.fn((v) => (v !== undefined ? (bgState.y = v) : bgState.y)),
            opacity: jest.fn((v) => (v !== undefined ? (bgState.opacity = v) : bgState.opacity)),
            visible: jest.fn((v) => (v !== undefined ? (bgState.visible = v) : bgState.visible)),
            getParent: () => mockBgGroup,
            cache: jest.fn(),
            to: jest.fn(({ opacity, duration, onFinish }) => {
                bgState.opacity = opacity;
                onFinish?.();
            })
        };

        const addedNodes = [];
        mockBgGroup = {
            add: jest.fn((node) => addedNodes.push(node)),
            remove: jest.fn((node) => {
                const idx = addedNodes.indexOf(node);
                if (idx >= 0) addedNodes.splice(idx, 1);
            }),
            getLayer: () => ({ batchDraw: jest.fn() })
        };

        mockUi = {
            game: {
                bg: mockBg,
                bgGroup: mockBgGroup,
                viewport: { width: () => 1280, height: () => 720 },
                container: { width: () => 1280, height: () => 720 }
            }
        };
    });

    afterEach(() => {
        globalThis.Konva = origKonva;
    });

    test("Initial background assignment applies instantly without blank frames", async () => {
        const game = new Game(mockUi);
        const img = { width: 1920, height: 1080, naturalWidth: 1920, naturalHeight: 1080 };

        await game.changeBackground(img, { duration: 0 });

        expect(mockBg.image()).toBe(img);
        expect(mockBg.scale().x).toBeGreaterThan(0);
        expect(mockBg.visible()).toBe(true);
    });

    test("Subsequent background change runs smooth crossfade overlay tween", async () => {
        let tweenCreated = null;
        globalThis.Konva = {
            Easings: { EaseInOut: "EaseInOut" },
            Image: class {
                constructor(cfg) {
                    this.id = cfg.id;
                    this.image = cfg.image;
                    this._opacity = cfg.opacity ?? 0;
                    this.x = cfg.x;
                    this.y = cfg.y;
                }
                opacity(v) {
                    if (v !== undefined) this._opacity = v;
                    return this._opacity;
                }
                destroy() {
                    this._destroyed = true;
                }
            },
            Tween: class {
                constructor(cfg) {
                    this.cfg = cfg;
                    tweenCreated = this;
                }
                play() {
                    this.cfg.node.opacity(this.cfg.opacity);
                    this.cfg.onFinish?.();
                }
                destroy() {
                    this._destroyed = true;
                }
            }
        };

        const game = new Game(mockUi);
        const img1 = { width: 1920, height: 1080 };
        const img2 = { width: 1920, height: 1080 };

        // Set initial background
        await game.changeBackground(img1, { duration: 0 });
        expect(mockBg.image()).toBe(img1);

        // Transition to img2
        await game.changeBackground(img2, { duration: 0.5 });

        expect(mockBgGroup.add).toHaveBeenCalled();
        expect(tweenCreated).not.toBeNull();
        expect(tweenCreated.cfg.duration).toBe(0.5);
        expect(mockBg.image()).toBe(img2);
    });

    test("Rapid background changes safely cancel in-flight transitions", async () => {
        const destroyedNodes = [];
        globalThis.Konva = {
            Easings: { EaseInOut: "EaseInOut" },
            Image: class {
                constructor(cfg) {
                    this.cfg = cfg;
                }
                opacity() { return 0; }
                destroy() { destroyedNodes.push(this); }
            },
            Tween: class {
                constructor(cfg) { this.cfg = cfg; }
                play() {} // Does not call onFinish immediately
                destroy() { this.destroyed = true; }
            }
        };

        const game = new Game(mockUi);
        mockBg.image({ width: 1920, height: 1080 }); // Already has image

        const imgA = { width: 1920, height: 1080 };
        const imgB = { width: 1920, height: 1080 };

        // Start first change (will hang in flight)
        const p1 = game.changeBackground(imgA, { duration: 0.5 });
        expect(game._bgCrossfadeNode).not.toBeNull();

        // Immediately start second change
        const p2 = game.changeBackground(imgB, { duration: 0 });
        await Promise.all([p1, p2]);

        expect(destroyedNodes.length).toBeGreaterThan(0);
        expect(mockBg.image()).toBe(imgB);
    });

    test("loadStage supports smooth crossfade without prematurely clearing background", async () => {
        const mockStage = {
            activePlanes: [{ id: "plane-0", depth: 0.5, node: {} }],
            load: jest.fn(async () => {}),
            mount: jest.fn(),
            fadeIn: jest.fn(),
            fadeOut: jest.fn(),
            destroy: jest.fn()
        };

        const game = new Game(mockUi);
        mockBg.image({ width: 1920, height: 1080 }); // existing background

        globalThis.Konva = {
            Tween: class { constructor() {} play() {} }
        };

        const result = await game.loadStage(mockStage, { duration: 0.05 });
        expect(result).toBe(mockStage);
        expect(mockStage.mount).toHaveBeenCalledWith(game, { keepDefaultBgVisible: true });
        expect(mockStage.fadeIn).toHaveBeenCalledWith(0.05);
    });

    test("story-script-runner dispatches transition duration and honors replay catch-up", async () => {
        const changeBackgroundMock = jest.fn(async () => {});
        const mockGameInstance = {
            changeBackground: changeBackgroundMock
        };

        const runtime = {
            getGame: () => mockGameInstance,
            getAsset: (id) => `asset:${id}`,
            isFastForwarding: false,
            replayCatchUp: false
        };

        // Normal play: passes configured or default duration
        await executeActions([{ type: "background", asset: "sunset", duration: 0.6 }], runtime);
        expect(changeBackgroundMock).toHaveBeenCalledWith("asset:sunset", expect.objectContaining({
            duration: 0.6,
            transition: "crossfade"
        }));

        // Replay catch-up: forces duration: 0
        runtime.vars = { instruction_count: 9999 };
        await executeActions([{ type: "background", asset: "morning", duration: 0.6 }], runtime);
        expect(changeBackgroundMock).toHaveBeenLastCalledWith("asset:morning", expect.objectContaining({
            duration: 0
        }));
    });

    test("scene.transition crossfade seamlessly forwards duration to subsequent stage/background", async () => {
        const loadStageMock = jest.fn(async () => {});
        const clearParallaxBackgroundMock = jest.fn();
        const mockGameInstance = {
            loadStage: loadStageMock,
            clearParallaxBackground: clearParallaxBackgroundMock,
            background: { reset: jest.fn() }
        };

        const runtime = {
            getGame: () => mockGameInstance,
            getAsset: (id) => `asset:${id}`,
            vars: {}
        };

        // Scene transition with crossfade 800ms followed by stage with reset: true
        await executeActions([
            { type: "scene.transition", transitionType: "crossfade", duration: 800 },
            { type: "stage", reset: true, asset: "apartment_stage" }
        ], runtime);

        // Does NOT prematurely destroy existing parallax background before loadStage
        expect(clearParallaxBackgroundMock).not.toHaveBeenCalled();
        expect(loadStageMock).toHaveBeenCalledWith("asset:apartment_stage", expect.objectContaining({
            duration: 0.8
        }));
    });
});
