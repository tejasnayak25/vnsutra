import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { parseVnStageBuffer, ParallaxStage } from "../vnsutra_modules/assets/parallax-stage.js";
import { Game } from "../vnsutra_modules/game.js";
import { CameraController } from "../vnsutra_modules/camera.js";
import { createStoryFromScript } from "../vnsutra_modules/story-script-runner.js";

function buildSyntheticVnStage(manifest, atlasBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0])) {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const buf = new ArrayBuffer(12 + jsonBytes.byteLength + atlasBytes.byteLength);
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);

    bytes[0] = 0x56; // V
    bytes[1] = 0x4e; // N
    bytes[2] = 0x53; // S
    bytes[3] = 0x54; // T
    view.setUint16(4, 1, true);
    view.setUint16(6, 0, true);
    view.setUint32(8, jsonBytes.byteLength, true);
    bytes.set(jsonBytes, 12);
    bytes.set(atlasBytes, 12 + jsonBytes.byteLength);
    return buf;
}

function createSampleManifest() {
    return {
        format: "VN-STAGE",
        version: 1,
        scene: "test_park",
        dimensions: { width: 1280, height: 720 },
        atlas: { width: 2048, height: 2048 },
        overscan: 0.06,
        layers: [
            {
                id: "test_sky",
                role: "underlay",
                depth: 0.2,
                screenRect: { x: 0, y: 0, w: 1280, h: 400 },
                atlasRect: { x: 0, y: 720, w: 1280, h: 400 }
            },
            {
                id: "test_base",
                role: "base",
                depth: 0.55,
                screenRect: { x: 0, y: 0, w: 1280, h: 720 },
                atlasRect: { x: 0, y: 0, w: 1280, h: 720 }
            },
            {
                id: "test_bench",
                role: "midground",
                depth: 0.70,
                screenRect: { x: 200, y: 400, w: 300, h: 200 },
                atlasRect: { x: 1280, y: 0, w: 300, h: 200 }
            },
            {
                id: "test_tree_canopy",
                role: "overlay",
                depth: 1.05,
                screenRect: { x: 0, y: 0, w: 400, h: 300 },
                atlasRect: { x: 1280, y: 200, w: 400, h: 300 }
            }
        ]
    };
}

describe("ParallaxStage & .vnstage Runtime", () => {
    const origKonva = globalThis.Konva;

    afterEach(() => {
        globalThis.Konva = origKonva;
    });

    test("parseVnStageBuffer decodes valid containers and rejects invalid magic/version", () => {
        const sample = createSampleManifest();
        const validBuf = buildSyntheticVnStage(sample);
        const parsed = parseVnStageBuffer(validBuf);

        expect(parsed.version).toBe(1);
        expect(parsed.manifest.scene).toBe("test_park");
        expect(parsed.manifest.layers).toHaveLength(4);
        expect(parsed.atlasBytes.byteLength).toBe(8);

        // Test legacy VNBG magic acceptance
        const vnbgBuf = buildSyntheticVnStage(sample);
        new Uint8Array(vnbgBuf)[2] = 0x42; // B
        new Uint8Array(vnbgBuf)[3] = 0x47; // G
        const parsedVnbg = parseVnStageBuffer(vnbgBuf);
        expect(parsedVnbg.manifest.scene).toBe("test_park");

        // Test bad magic error
        const badMagic = new Uint8Array(validBuf.slice(0));
        badMagic[0] = 0x58; // X
        expect(() => parseVnStageBuffer(badMagic)).toThrow(/magic/i);

        // Test unsupported version
        const badVer = new Uint8Array(validBuf.slice(0));
        new DataView(badVer.buffer).setUint16(4, 99, true);
        expect(() => parseVnStageBuffer(badVer)).toThrow(/version/i);

        // Test truncated buffer
        expect(() => parseVnStageBuffer(new Uint8Array(6))).toThrow(/truncated/i);
    });

    test("ParallaxStage loads real disk .vnstage file if present", async () => {
        const diskPath = path.resolve("assets/game-assets/backgrounds/cherry_park.vnstage");
        if (fs.existsSync(diskPath)) {
            const diskBytes = fs.readFileSync(diskPath);
            const parsed = parseVnStageBuffer(diskBytes.buffer);
            expect(parsed.manifest.dimensions.width).toBeGreaterThan(0);
            expect(parsed.manifest.layers.length).toBeGreaterThan(0);
            expect(parsed.atlasBytes.byteLength).toBeGreaterThan(1000);
        }
    });

    test("ParallaxStage.mount creates Konva crop nodes and splits into bgGroup and foreGroup", async () => {
        const bgGroupChildren = [];
        const foreGroupChildren = [];
        let defaultBgVisible = true;

        const fakeGame = {
            ui: {
                game: {
                    viewport: { width: () => 1280, height: () => 720 },
                    container: { width: () => 1280, height: () => 720 },
                    bg: {
                        visible: (v) => (v !== undefined ? (defaultBgVisible = v) : defaultBgVisible)
                    },
                    bgGroup: {
                        add: (node) => bgGroupChildren.push(node)
                    },
                    foreGroup: {
                        add: (node) => foreGroupChildren.push(node)
                    }
                }
            },
            camera: {
                setPlanes: jest.fn()
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
                opacity(v) { return v !== undefined ? (this.attrs.opacity = v) : this.attrs.opacity; }
                destroy() { this.destroyed = true; }
            }
        };

        const sample = createSampleManifest();
        const stage = new ParallaxStage();
        stage.manifest = sample;
        stage.atlasImage = { width: 2048, height: 2048 };

        const planes = stage.mount(fakeGame);

        expect(planes).toHaveLength(4);
        expect(defaultBgVisible).toBe(false);

        // 3 planes (underlay, base, midground) go to bgGroup behind actors
        expect(bgGroupChildren).toHaveLength(3);
        // 1 plane (overlay canopy, depth 1.05 > 0.85) goes to foreGroup in front of actors
        expect(foreGroupChildren).toHaveLength(1);
        expect(foreGroupChildren[0].cfg.id).toBe("test_tree_canopy");

        // Verify Konva crop rectangles
        expect(foreGroupChildren[0].cfg.crop).toEqual({
            x: 1280,
            y: 200,
            width: 400,
            height: 300
        });

        // Verify camera planes connection
        expect(fakeGame.camera.setPlanes).toHaveBeenCalledWith(planes);

        // Test unmount
        stage.unmount();
        expect(defaultBgVisible).toBe(true);
        expect(createdImages.every((img) => img.destroyed)).toBe(true);
    });

    test("Game.loadStage loads synthetic .vnstage buffer seamlessly", async () => {
        const bgGroupChildren = [];
        const foreGroupChildren = [];

        const fakeUi = {
            game: {
                viewport: { width: () => 1280, height: () => 720 },
                container: { width: () => 1280, height: () => 720 },
                bg: { visible: jest.fn() },
                bgGroup: { add: (n) => bgGroupChildren.push(n) },
                foreGroup: { add: (n) => foreGroupChildren.push(n) }
            }
        };

        globalThis.Konva = {
            Image: class {
                constructor(cfg) { this.cfg = cfg; }
                destroy() { this.destroyed = true; }
            }
        };

        const sample = createSampleManifest();
        const buf = buildSyntheticVnStage(sample);

        const game = new Game(fakeUi);
        const stage = await game.loadStage(buf);

        expect(stage).toBeDefined();
        expect(stage.manifest.scene).toBe("test_park");
        expect(stage.mounted).toBe(true);
        expect(bgGroupChildren.length + foreGroupChildren.length).toBe(4);

        game.clearParallaxBackground();
        expect(stage.mounted).toBe(false);
    });

    test("Story script runner supports { type: 'stage' } actions", async () => {
        let loadedStageTarget = null;
        const mockGame = {
            loadStage: jest.fn((target) => {
                loadedStageTarget = target;
                return Promise.resolve({ mounted: true });
            }),
            clearParallaxBackground: jest.fn()
        };

        const storyActions = [
            {
                type: "stage",
                asset: "cherry_park.vnstage",
                options: { mouseTilt: true }
            }
        ];

        const story = createStoryFromScript({
            scenes: {
                start: storyActions
            },
            getGame: () => mockGame
        });

        await story.start();
        expect(mockGame.loadStage).toHaveBeenCalledWith("cherry_park.vnstage", { mouseTilt: true });
        expect(loadedStageTarget).toBe("cherry_park.vnstage");
    });
});
