import { jest } from "@jest/globals";
import {
    StudioOverlay,
    isStudioEnabled,
    formatCameraCommand,
    formatLightingCommand
} from "../vnsutra_modules/studio.js";

describe("In-Browser Dev Studio (?studio=true)", () => {
    test("isStudioEnabled detects ?studio=true on local dev hosts and blocks public domains", () => {
        expect(isStudioEnabled("?studio=true", "localhost")).toBe(true);
        expect(isStudioEnabled("?foo=1&studio=1", "127.0.0.1")).toBe(true);
        expect(isStudioEnabled("?foo=1", "localhost")).toBe(false);
        expect(isStudioEnabled("?studio=true", "mygame.itch.io")).toBe(false);
    });

    test("formatCameraCommand and formatLightingCommand emit valid .vn actions", () => {
        expect(formatCameraCommand({ x: 120.4, y: -45.6, zoom: 1.35, rotation: 2 })).toBe(
            "@camera.pan x=120 y=-46 zoom=1.35 rotation=2 duration=0.8"
        );
        expect(formatLightingCommand("sunset")).toBe("@camera.lighting preset=\"sunset\"");
    });

    test("StudioOverlay mounts cleanly onto DOM, refreshes, and disposes timers", () => {
        const listeners = new Map();
        const makeEl = (tag) => ({
            tag,
            id: "",
            innerHTML: "",
            textContent: "",
            style: {},
            dataset: {},
            children: [],
            setAttribute: jest.fn(),
            appendChild(child) { this.children.push(child); return child; },
            addEventListener(ev, fn) { listeners.set(ev, fn); },
            querySelector(sel) {
                if (!this._q) this._q = new Map();
                if (!this._q.has(sel)) {
                    this._q.set(sel, makeEl("div"));
                }
                return this._q.get(sel);
            },
            remove: jest.fn()
        });
        const fakeDoc = {
            body: makeEl("body"),
            createElement: makeEl
        };

        const studio = new StudioOverlay({ actors: {} });
        const root = studio.mount(fakeDoc);
        expect(root).toBeTruthy();
        expect(fakeDoc.body.children).toContain(root);

        studio.setStatus("Ready");
        expect(root.querySelector("[data-status]").textContent).toBe("Ready");

        studio.dispose();
        expect(root.remove).toHaveBeenCalled();
        expect(studio.root).toBeNull();
    });
});
