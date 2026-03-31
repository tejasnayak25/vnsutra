import { jest } from "@jest/globals";
import {
    isFullscreenActive,
    restoreFullscreenIfNeeded
} from "../vnsutra_modules/fullscreen-utils.js";

describe("Fullscreen Utils", () => {
    it("detects active fullscreen", () => {
        expect(isFullscreenActive({ fullscreenElement: {} })).toBe(true);
        expect(isFullscreenActive({})).toBe(false);
        expect(isFullscreenActive(null)).toBe(false);
    });

    it("skips restore when fullscreen was not active before", async () => {
        const requestFullscreen = jest.fn(() => Promise.resolve());
        const doc = { documentElement: { requestFullscreen } };

        await restoreFullscreenIfNeeded({
            wasFullscreenBefore: false,
            userExitedFullscreen: false,
            doc
        });

        expect(requestFullscreen).not.toHaveBeenCalled();
    });

    it("requests fullscreen when needed", async () => {
        const requestFullscreen = jest.fn(() => Promise.resolve());
        const doc = {
            fullscreenElement: null,
            documentElement: { requestFullscreen }
        };

        await restoreFullscreenIfNeeded({
            wasFullscreenBefore: true,
            userExitedFullscreen: false,
            doc
        });

        expect(requestFullscreen).toHaveBeenCalledTimes(1);
    });

    it("invokes onError when requestFullscreen throws", async () => {
        const expectedError = new Error("fullscreen failed");
        const onError = jest.fn();
        const doc = {
            fullscreenElement: null,
            documentElement: {
                requestFullscreen: () => {
                    throw expectedError;
                }
            }
        };

        await restoreFullscreenIfNeeded({
            wasFullscreenBefore: true,
            userExitedFullscreen: false,
            doc,
            onError
        });

        expect(onError).toHaveBeenCalledWith(expectedError);
    });
});
