import { jest } from "@jest/globals";
import { createQuickLoadHandler } from "../vnsutra_modules/quick-load-utils.js";

describe("Quick Load Utils", () => {
    it("prevents overlapping quick-load requests", async () => {
        let resolveRead;
        const readSavedGames = jest.fn(() => new Promise((resolve) => {
            resolveRead = resolve;
        }));
        const dispatchLoad = jest.fn();
        const onError = jest.fn();

        const loadLatestSnapshot = createQuickLoadHandler({
            readSavedGames,
            dispatchLoad,
            onError
        });

        const first = loadLatestSnapshot();
        const second = await loadLatestSnapshot();

        expect(second).toBe(false);
        expect(readSavedGames).toHaveBeenCalledTimes(1);

        resolveRead([
            { id: 1, timestamp: 100, scene: "start" }
        ]);

        await expect(first).resolves.toBe(true);
        expect(dispatchLoad).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
    });

    it("dispatches the newest save entry", async () => {
        const readSavedGames = jest.fn(async () => ([
            { id: 1, timestamp: 100, scene: "start" },
            { id: 2, timestamp: 200, scene: "scene2" },
            { id: 3, timestamp: 150, scene: "scene3" }
        ]));
        const dispatchLoad = jest.fn();

        const loadLatestSnapshot = createQuickLoadHandler({
            readSavedGames,
            dispatchLoad
        });

        await expect(loadLatestSnapshot()).resolves.toBe(true);
        expect(dispatchLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 2, scene: "scene2" }));
    });

    it("returns false when no saves exist", async () => {
        const loadLatestSnapshot = createQuickLoadHandler({
            readSavedGames: async () => [],
            dispatchLoad: jest.fn()
        });

        await expect(loadLatestSnapshot()).resolves.toBe(false);
    });
});
