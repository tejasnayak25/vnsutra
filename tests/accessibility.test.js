import { jest } from "@jest/globals";
import { EVENTS, STORAGE_KEYS } from "../vnsutra_modules/constants.js";

describe("Accessibility Controls", () => {
    let accessibility;
    let getGameSettings;
    let storageMock;
    let rootStyle;
    let originalDocument;
    let originalDispatchEvent;
    let originalCustomEvent;

    beforeEach(async () => {
        jest.resetModules();

        storageMock = {
            getItem: jest.fn(async () => null),
            setItem: jest.fn(async () => {})
        };

        rootStyle = {
            setProperty: jest.fn(),
            fontSize: ""
        };

        originalDocument = global.document;
        originalDispatchEvent = global.dispatchEvent;
        originalCustomEvent = global.CustomEvent;

        global.document = {
            body: {
                style: {},
                classList: {
                    toggle: jest.fn(),
                    add: jest.fn(),
                    remove: jest.fn()
                }
            },
            documentElement: {
                style: rootStyle
            }
        };

        global.dispatchEvent = jest.fn(() => true);
        global.CustomEvent = class CustomEvent {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };

        await jest.unstable_mockModule("../vnsutra_modules/storage.js", () => ({
            storage: storageMock,
            default: storageMock
        }));

        await jest.unstable_mockModule("../vnsutra_modules/error-tracking.js", () => ({
            default: { captureError: jest.fn() }
        }));

        ({ accessibility } = await import("../vnsutra_modules/accessibility.js"));
        ({ getGameSettings } = await import("../vnsutra_modules/runtime-state.js"));
        accessibility.applyAll();
    });

    afterEach(() => {
        if (typeof originalDocument === "undefined") {
            delete global.document;
        } else {
            global.document = originalDocument;
        }

        if (typeof originalDispatchEvent === "undefined") {
            delete global.dispatchEvent;
        } else {
            global.dispatchEvent = originalDispatchEvent;
        }

        if (typeof originalCustomEvent === "undefined") {
            delete global.CustomEvent;
        } else {
            global.CustomEvent = originalCustomEvent;
        }
    });

    it("stores and applies font scale through runtime settings and root CSS", () => {
        accessibility.setFontScale(1.2);

        expect(rootStyle.setProperty).toHaveBeenCalledWith("--vnsutra-font-scale", "1.2");
        expect(rootStyle.fontSize).toBe("calc(16px * var(--vnsutra-font-scale, 1))");
        expect(storageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE, "1.2");
        expect(getGameSettings()[STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE]).toBe(1.2);
        expect(global.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: EVENTS.ACCESSIBILITY,
            detail: expect.objectContaining({ fontScale: 1.2 })
        }));
    });

    it("clamps the font scale to supported bounds", () => {
        accessibility.setFontScale(2);
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--vnsutra-font-scale", "1.5");
        expect(getGameSettings()[STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE]).toBe(1.5);

        accessibility.setFontScale(0.1);
        expect(rootStyle.setProperty).toHaveBeenCalledWith("--vnsutra-font-scale", "0.8");
        expect(getGameSettings()[STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE]).toBe(0.8);
    });
});
