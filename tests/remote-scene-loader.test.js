import { jest } from "@jest/globals";
import { createRemoteSceneLoader } from "../vnsutra_modules/remote-scene-loader.js";

function createJsonResponse(body, ok = true) {
    return {
        ok,
        async json() {
            return body;
        }
    };
}

describe("Remote Scene Loader", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("caches loaded scenes and avoids duplicate fetches", async () => {
        const fetchImpl = jest.fn(async () => createJsonResponse([{ type: "dialog", text: "hello" }]));
        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: false,
            fetchImpl
        });

        const first = await loader.getScene("intro");
        const second = await loader.getScene("intro");

        expect(first).toBe(second);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith("/scenes/intro.json");
    });

    it("invalidates cache with removeScene and fetches again", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce(createJsonResponse([{ type: "dialog", text: "v1" }]))
            .mockResolvedValueOnce(createJsonResponse([{ type: "dialog", text: "v2" }]));

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: false,
            fetchImpl
        });

        const first = await loader.getScene("intro");
        loader.removeScene("intro");
        const second = await loader.getScene("intro");

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(first).not.toEqual(second);
    });

    it("refreshes scene with cache busting and emits update when changed", async () => {
        const onSceneUpdated = jest.fn();
        const fetchImpl = jest.fn(async () => createJsonResponse([{ type: "dialog", text: "remote-v2" }]));

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: false,
            onSceneUpdated,
            fetchImpl
        });

        loader.setScene("intro", [{ type: "dialog", text: "local-v1" }]);
        onSceneUpdated.mockClear();

        const next = await loader.refreshScene("intro");

        expect(next).toEqual([{ type: "dialog", text: "remote-v2" }]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toMatch(/^\/scenes\/intro\.json\?t=\d+$/);
        expect(onSceneUpdated).toHaveBeenCalledTimes(1);
        expect(onSceneUpdated).toHaveBeenCalledWith(
            "intro",
            [{ type: "dialog", text: "remote-v2" }],
            [{ type: "dialog", text: "local-v1" }]
        );
    });

    it("does not emit update when refresh payload is unchanged", async () => {
        const onSceneUpdated = jest.fn();
        const existing = [{ type: "dialog", text: "same" }];
        const fetchImpl = jest.fn(async () => createJsonResponse(existing));

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: true,
            onSceneUpdated,
            fetchImpl
        });

        loader.setScene("intro", existing);
        onSceneUpdated.mockClear();

        const result = await loader.refreshScene("intro");

        expect(result).toEqual(existing);
        expect(onSceneUpdated).not.toHaveBeenCalled();
    });

    it("returns null on non-ok refresh while preserving previous cache", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce(createJsonResponse([{ type: "dialog", text: "cached" }]))
            .mockResolvedValueOnce({ ok: false });

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: false,
            fetchImpl
        });

        const cached = await loader.getScene("intro");
        const refreshed = await loader.refreshScene("intro");
        const fromCache = await loader.getScene("intro");

        expect(refreshed).toBeNull();
        expect(fromCache).toEqual(cached);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("applies transformScene before storing cache", async () => {
        const transformScene = jest.fn(async (sceneName, payload) => ({
            sceneName,
            actions: payload
        }));
        const fetchImpl = jest.fn(async () => createJsonResponse([{ type: "dialog", text: "hello" }]));

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: false,
            transformScene,
            fetchImpl
        });

        const scene = await loader.getScene("intro");

        expect(transformScene).toHaveBeenCalledWith("intro", [{ type: "dialog", text: "hello" }]);
        expect(scene).toEqual({
            sceneName: "intro",
            actions: [{ type: "dialog", text: "hello" }]
        });
    });

    it("polls scene updates and can stop polling", async () => {
        jest.useFakeTimers();

        const onSceneUpdated = jest.fn();
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(createJsonResponse([{ type: "dialog", text: "remote" }]));

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: true,
            onSceneUpdated,
            fetchImpl
        });

        loader.setScene("intro", [{ type: "dialog", text: "local" }]);
        onSceneUpdated.mockClear();

        expect(loader.startPolling("intro", 100)).toBe(true);
        expect(loader.startPolling("intro", 100)).toBe(false);

        await jest.advanceTimersByTimeAsync(110);
        await Promise.resolve();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(onSceneUpdated).toHaveBeenCalledTimes(1);

        loader.stopPolling("intro");
        await jest.advanceTimersByTimeAsync(250);
        await Promise.resolve();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("swallows polling refresh errors without crashing timer loop", async () => {
        jest.useFakeTimers();

        const fetchImpl = jest.fn(async () => {
            throw new Error("network failed");
        });

        const loader = createRemoteSceneLoader({
            baseUrl: "/scenes",
            extension: ".json",
            cacheBust: true,
            fetchImpl
        });

        expect(loader.startPolling("intro", 100)).toBe(true);

        await expect(jest.advanceTimersByTimeAsync(250)).resolves.toBeUndefined();

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        loader.clear();
    });

    it("returns safe no-op loader when fetch is unavailable", async () => {
        const loader = createRemoteSceneLoader({ fetchImpl: null });

        await expect(loader.getScene("intro")).resolves.toBeNull();
        await expect(loader.refreshScene("intro")).resolves.toBeNull();
        expect(loader.startPolling("intro", 100)).toBe(false);

        expect(() => loader.setScene("intro", [{ type: "dialog", text: "x" }])).not.toThrow();
        expect(() => loader.stopPolling("intro")).not.toThrow();
        expect(() => loader.clear()).not.toThrow();
    });
});
