import { jest } from "@jest/globals";

async function createRunnerHarness({ inputValue = "Peanut" } = {}) {
    jest.resetModules();

    const dialogMock = jest.fn(async () => {});
    const nextMock = jest.fn((sceneExecutor) => sceneExecutor());
    const loadingMock = {
        start: jest.fn(),
        stop: jest.fn()
    };
    const inputMock = jest.fn(async () => inputValue);
    const choiceMock = jest.fn(async (_message, options = []) => options[0] ?? "");
    const endMock = jest.fn();

    const store = new Map();
    const storageMock = {
        setItem: jest.fn(async (key, value) => {
            store.set(key, value);
        }),
        getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
        removeItem: jest.fn(async (key) => {
            store.delete(key);
        })
    };

    await jest.unstable_mockModule("../vnsutra_modules/game-utils.js", () => ({
        dialog: dialogMock,
        next: nextMock,
        loading: loadingMock,
        input: inputMock,
        choice: choiceMock,
        storage: storageMock,
        end: endMock
    }));

    await jest.unstable_mockModule("../vnsutra_modules/i18n.js", () => ({
        i18n: {
            t: jest.fn(() => null),
            isTranslationKey: jest.fn(() => false),
            process: jest.fn((value) => value)
        }
    }));

    await jest.unstable_mockModule("../vnsutra_modules/animation-utils.js", () => ({
        initActorAnimation: (actor) => actor,
        addGameAnimationMethods: jest.fn()
    }));

    await jest.unstable_mockModule("../vnsutra_modules/audio-effects-utils.js", () => ({
        initAudioSystem: jest.fn()
    }));

    const { createStoryFromScript } = await import("../vnsutra_modules/story-script-runner.js");

    return {
        createStoryFromScript,
        dialogMock,
        nextMock,
        loadingMock,
        inputMock,
        choiceMock,
        storageMock,
        endMock,
        store
    };
}

describe("Story Script Runner Lifecycle Integration", () => {
    it("jumps to next scene and skips trailing actions", async () => {
        const { createStoryFromScript, dialogMock, nextMock, endMock } = await createRunnerHarness();

        const story = createStoryFromScript({
            scenes: {
                start: [
                    { type: "dialog", text: "start:line1" },
                    { type: "jump", scene: "scene2" },
                    { type: "dialog", text: "start:line2-should-not-run" }
                ],
                scene2: [
                    { type: "dialog", text: "scene2:line1" },
                    { type: "end" }
                ]
            }
        });

        await story.start();

        expect(nextMock).toHaveBeenCalledTimes(1);
        expect(nextMock).toHaveBeenCalledWith(expect.any(Function), "scene2");
        expect(dialogMock.mock.calls.map((call) => call[1])).toEqual([
            "start:line1",
            "scene2:line1"
        ]);
        expect(endMock).toHaveBeenCalledTimes(1);
    });

    it("persists and reloads vars through storage actions for branching", async () => {
        const {
            createStoryFromScript,
            dialogMock,
            nextMock,
            storageMock,
            endMock
        } = await createRunnerHarness({ inputValue: "Peanut" });

        const story = createStoryFromScript({
            scenes: {
                start: [
                    { type: "input", var: "name", message: "Name?" },
                    { type: "storage.set", key: "playerName", value: { fromVar: "name" } },
                    { type: "storage.get", key: "playerName", var: "loadedName" },
                    {
                        type: "if",
                        test: { left: { fromVar: "loadedName" }, op: "===", right: "Peanut" },
                        then: [{ type: "jump", scene: "secret" }],
                        else: [{ type: "jump", scene: "fallback" }]
                    }
                ],
                secret: [
                    { type: "dialog", text: "secret-route" },
                    { type: "end" }
                ],
                fallback: [
                    { type: "dialog", text: "fallback-route" },
                    { type: "end" }
                ]
            }
        });

        await story.start();

        expect(storageMock.setItem).toHaveBeenCalledWith("playerName", "Peanut");
        expect(storageMock.getItem).toHaveBeenCalledWith("playerName");
        expect(nextMock).toHaveBeenCalledWith(expect.any(Function), "secret");
        expect(dialogMock.mock.calls.map((call) => call[1])).toContain("secret-route");
        expect(dialogMock.mock.calls.map((call) => call[1])).not.toContain("fallback-route");
        expect(endMock).toHaveBeenCalledTimes(1);
    });

    it("stops current scene after parallel branch triggers jump", async () => {
        const { createStoryFromScript, dialogMock, nextMock, endMock } = await createRunnerHarness();

        const story = createStoryFromScript({
            scenes: {
                start: [
                    {
                        type: "parallel",
                        sequences: [
                            [
                                { type: "wait", duration: 1 },
                                { type: "jump", scene: "scene2" }
                            ],
                            [
                                { type: "wait", duration: 2 }
                            ]
                        ]
                    },
                    { type: "dialog", text: "after-parallel-should-not-run" }
                ],
                scene2: [
                    { type: "dialog", text: "scene2-only" },
                    { type: "end" }
                ]
            }
        });

        await story.start();

        expect(nextMock).toHaveBeenCalledTimes(1);
        expect(nextMock).toHaveBeenCalledWith(expect.any(Function), "scene2");
        expect(dialogMock.mock.calls.map((call) => call[1])).toEqual(["scene2-only"]);
        expect(endMock).toHaveBeenCalledTimes(1);
    });

    it("runs loading actions from declarative scenes", async () => {
        const { createStoryFromScript, loadingMock, endMock } = await createRunnerHarness();

        const story = createStoryFromScript({
            scenes: {
                start: [
                    { type: "loading.start" },
                    { type: "loading.stop" },
                    { type: "end" }
                ]
            }
        });

        await story.start();

        expect(loadingMock.start).toHaveBeenCalledTimes(1);
        expect(loadingMock.stop).toHaveBeenCalledTimes(1);
        expect(endMock).toHaveBeenCalledTimes(1);
    });

    it("runs custom action handlers and reports unknown actions", async () => {
        const { createStoryFromScript, dialogMock, endMock } = await createRunnerHarness();
        const customActionHandler = jest.fn(async (action, runtime) => {
            runtime.vars.customHandled = action.value;
        });
        const unknownActionHandler = jest.fn();

        const story = createStoryFromScript({
            scenes: {
                start: [
                    { type: "dialog", text: "before-custom" },
                    { type: "camera.zoom", value: 2 },
                    { type: "story.unknown", value: "ignored" },
                    { type: "dialog", text: "after-custom" },
                    { type: "end" }
                ]
            },
            actionHandlers: {
                "camera.zoom": customActionHandler
            },
            onUnknownAction: unknownActionHandler
        });

        await story.start();

        expect(customActionHandler).toHaveBeenCalledTimes(1);
        expect(customActionHandler).toHaveBeenCalledWith(
            { type: "camera.zoom", value: 2 },
            expect.objectContaining({
                vars: expect.any(Object),
                actionHandlers: expect.any(Object)
            })
        );
        expect(unknownActionHandler).toHaveBeenCalledTimes(1);
        expect(unknownActionHandler).toHaveBeenCalledWith(
            { type: "story.unknown", value: "ignored" },
            expect.any(Object)
        );
        expect(dialogMock.mock.calls.map((call) => call[1])).toEqual([
            "before-custom",
            "after-custom"
        ]);
        expect(endMock).toHaveBeenCalledTimes(1);
    });

    it("passes context into scene hooks and resolves remote scenes with overrides", async () => {
        const { createStoryFromScript, dialogMock, nextMock, endMock } = await createRunnerHarness();
        const getSceneMock = jest.fn(async (sceneName, context) => {
            if (sceneName === "remote") {
                return [
                    { type: "dialog", text: `${context.tag}:remote` },
                    { type: "end" }
                ];
            }

            return null;
        });
        const beforeScene = jest.fn(async (sceneName, runtime) => {
            expect(runtime.context).toEqual({ tag: "alpha" });
            return true;
        });
        const afterScene = jest.fn(async (_sceneName, runtime) => {
            expect(runtime.context).toEqual({ tag: "alpha" });
        });

        const story = createStoryFromScript({
            scenes: {
                start: [
                    { type: "jump", scene: "remote" }
                ]
            },
            getScene: getSceneMock,
            context: { tag: "alpha" },
            beforeScene,
            afterScene
        });

        expect(story.listScenes()).toEqual(expect.arrayContaining(["start"]));

        await story.start();
        await new Promise((resolve) => setImmediate(resolve));

        expect(getSceneMock).toHaveBeenCalledTimes(1);
        expect(getSceneMock).toHaveBeenCalledWith("remote", { tag: "alpha" });
        expect(dialogMock.mock.calls.map((call) => call[1])).toEqual(["alpha:remote"]);
        expect(beforeScene.mock.calls.map((call) => call[0])).toEqual(
            expect.arrayContaining(["start", "remote"])
        );
        expect(afterScene.mock.calls.map((call) => call[0])).toEqual(
            expect.arrayContaining(["start", "remote"])
        );
        expect(afterScene).toHaveBeenCalledWith(
            "start",
            expect.objectContaining({ context: { tag: "alpha" } }),
            { jumped: true }
        );
        expect(afterScene).toHaveBeenCalledWith(
            "remote",
            expect.objectContaining({ context: { tag: "alpha" } }),
            { ended: true }
        );
        expect(nextMock).toHaveBeenCalledWith(expect.any(Function), "remote");
        expect(endMock).toHaveBeenCalledTimes(1);

        const overrideScene = [
            { type: "dialog", text: "override-remote" },
            { type: "end" }
        ];
        expect(story.setScene("remote", overrideScene)).toBe(true);
        expect(story.listScenes()).toEqual(expect.arrayContaining(["remote"]));

        dialogMock.mockClear();
        nextMock.mockClear();
        endMock.mockClear();
        getSceneMock.mockClear();

        await story.start();
        await new Promise((resolve) => setImmediate(resolve));

        expect(getSceneMock).not.toHaveBeenCalled();
        expect(dialogMock.mock.calls.map((call) => call[1])).toEqual(["override-remote"]);
        expect(endMock).toHaveBeenCalledTimes(1);

        expect(story.invalidateScene("remote")).toBe(true);

        dialogMock.mockClear();
        nextMock.mockClear();
        endMock.mockClear();

        await story.start();
        await new Promise((resolve) => setImmediate(resolve));

        expect(getSceneMock).toHaveBeenCalledTimes(1);
        expect(getSceneMock).toHaveBeenCalledWith("remote", { tag: "alpha" });
        expect(dialogMock.mock.calls.map((call) => call[1])).toEqual(["alpha:remote"]);
        expect(endMock).toHaveBeenCalledTimes(1);
    });

    it("resolves actors and assets from runtime resolvers with context", async () => {
        const { createStoryFromScript, dialogMock, endMock } = await createRunnerHarness();
        const gameInstance = {
            background: null,
            ui: {
                animations: {
                    loading: {
                        start: jest.fn(),
                        stop: jest.fn()
                    }
                },
                game: {
                    loading: {
                        visible: jest.fn()
                    }
                }
            }
        };
        const getActorMock = jest.fn((actorName, context) => ({
            data: {
                name: `${context.prefix}:${actorName}`
            }
        }));
        const getAssetMock = jest.fn((assetName, context) => ({
            resolvedAsset: `${context.prefix}:${assetName}`
        }));

        const story = createStoryFromScript({
            scenes: {
                start: [
                    { type: "background", asset: "intro-bg" },
                    { type: "dialog", actor: "mary", text: "hello" },
                    { type: "end" }
                ]
            },
            getGame: () => gameInstance,
            getActor: getActorMock,
            getAsset: getAssetMock,
            context: { prefix: "ctx" }
        });

        await story.start();

        expect(getAssetMock).toHaveBeenCalledTimes(1);
        expect(getAssetMock).toHaveBeenCalledWith("intro-bg", { prefix: "ctx" });
        expect(gameInstance.background).toEqual({ resolvedAsset: "ctx:intro-bg" });
        expect(getActorMock).toHaveBeenCalledTimes(1);
        expect(getActorMock).toHaveBeenCalledWith("mary", { prefix: "ctx" });
        expect(dialogMock).toHaveBeenCalledWith(
            expect.objectContaining({ data: { name: "ctx:mary" } }),
            "hello",
            true,
            {}
        );
        expect(endMock).toHaveBeenCalledTimes(1);
    });
});
