import { jest } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAssetsManifest } from "../scripts/assets-manifest.js";

describe("AOT Assets Manifest & Static Outfit Loading", () => {
    const origFetch = globalThis.fetch;
    const origKonva = globalThis.Konva;
    const origAddEventListener = globalThis.addEventListener;

    afterEach(() => {
        globalThis.fetch = origFetch;
        globalThis.Konva = origKonva;
        globalThis.addEventListener = origAddEventListener;
    });

    test("buildAssetsManifest indexes image files recursively using POSIX keys", async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vnsutra-manifest-"));
        try {
            const casualDir = path.join(tmpDir, "characters", "Rin", "Casual");
            fs.mkdirSync(casualDir, { recursive: true });
            fs.writeFileSync(path.join(casualDir, "b.png"), "x");
            fs.writeFileSync(path.join(casualDir, "a.webp"), "x");
            fs.writeFileSync(path.join(casualDir, "notes.txt"), "ignore");

            const manifest = await buildAssetsManifest(tmpDir);
            expect(manifest.version).toBe(1);
            expect(manifest.folders).toEqual({
                "characters/Rin/Casual": ["a.webp", "b.png"]
            });
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test("Character.loadOutfit loads directly from assets.manifest.json without JSZip or /folder", async () => {
        jest.resetModules();
        globalThis.addEventListener = jest.fn();

        class FakeKonvaImage {
            constructor(cfg = {}) {
                this._attrs = { ...cfg };
            }
            image(v) { if (v !== undefined) { this._img = v; return this; } return this._img; }
            filters() { return this; }
            getParent() { return null; }
            getAttr(k) { return this._attrs[k]; }
            setAttr(k, v) { this._attrs[k] = v; return this; }
            cache() {}
        }
        globalThis.Konva = {
            Image: FakeKonvaImage,
            Filters: { Blur: "Blur", Noise: "Noise", Pixelate: "Pixelate", Brighten: "Brighten", Contrast: "Contrast", HSL: "HSL" }
        };

        await jest.unstable_mockModule("../vnsutra_modules/ui/utils.js", () => ({
            loadImg: jest.fn((src) => ({ src }))
        }));
        await jest.unstable_mockModule("../vnsutra_modules/runtime-state.js", () => ({
            getGame: () => null,
            getShouldAbortGame: () => false,
            getIsPortrait: () => false
        }));
        await jest.unstable_mockModule("../vnsutra_modules/error-tracking.js", () => ({
            default: { captureError: jest.fn() }
        }));

        globalThis.fetch = jest.fn(async (url) => {
            expect(url).toBe("./assets/assets.manifest.json");
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    version: 1,
                    folders: {
                        "characters/Rin/Casual": ["Smile.png", "Happy Smile.png"]
                    }
                })
            };
        });

        const { Character, clearAssetsManifestCache, normalizeOutfitFolderPath } = await import("../vnsutra_modules/assets/character.js");
        clearAssetsManifestCache();

        expect(normalizeOutfitFolderPath("./assets/game-assets/characters/Rin/", "Casual")).toBe("characters/Rin/Casual");

        const mary = new Character({ name: "Mary", folder: "characters/Rin" });
        const outfit = await mary.loadOutfit("Casual");

        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(outfit.moods["Smile.png"].src).toBe("./assets/game-assets/characters/Rin/Casual/Smile.png");
        expect(outfit.moods["Happy Smile.png"].src).toBe("./assets/game-assets/characters/Rin/Casual/Happy%20Smile.png");

        await expect(mary.loadOutfit("MissingOutfit")).rejects.toThrow(/404 - Folder Not Found/);
    });
});

