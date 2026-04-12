import { jest } from "@jest/globals";

let dialog;
let next;
let setGame;
let setGameSettings;
let setState;
let getState;
let setInstructionCount;
let getInstructionCount;
let setActiveScene;
let getActiveScene;
let setShouldAbortGame;
let getAbortInstruction;

describe("Game Utils Lifecycle Integration", () => {
    let originalDocument;
    let endVisibleMock;
    let loadingVisibleMock;

    beforeAll(async () => {
        jest.resetModules();

        if (!global.document) {
            global.document = {
                body: {
                    getBoundingClientRect: () => ({ width: 0, height: 0 }),
                    addEventListener: jest.fn(),
                    removeEventListener: jest.fn(),
                    style: {}
                },
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                fullscreenElement: null,
                documentElement: {
                    requestFullscreen: jest.fn()
                },
                getElementById: jest.fn(() => null),
                createElement: jest.fn(() => ({
                    style: {},
                    classList: { add: jest.fn(), remove: jest.fn(), replace: jest.fn() },
                    append: jest.fn(),
                    appendChild: jest.fn(),
                    querySelector: jest.fn(() => null),
                    setAttribute: jest.fn()
                }))
            };
        }

        await jest.unstable_mockModule("../vnsutra_modules/error-tracking.js", () => ({
            default: {
                captureError: jest.fn()
            }
        }));

        ({
            setGame,
            setGameSettings,
            setState,
            getState,
            setInstructionCount,
            getInstructionCount,
            setActiveScene,
            getActiveScene,
            setShouldAbortGame,
            getAbortInstruction
        } = await import("../vnsutra_modules/runtime-state.js"));

        ({ dialog, next } = await import("../vnsutra_modules/game-utils.js"));
    });

    beforeEach(() => {
        originalDocument = global.document;

        global.document = {
            body: {
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                style: {}
            },
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            fullscreenElement: null,
            documentElement: {
                requestFullscreen: jest.fn()
            }
        };

        endVisibleMock = jest.fn();
        loadingVisibleMock = jest.fn();

        setGame({
            ui: {
                dialog: {
                    name: {
                        text: jest.fn()
                    },
                    message: {
                        text: jest.fn(),
                        fire: jest.fn(),
                        getLayer: () => ({ getStage: () => ({}) })
                    }
                },
                game: {
                    container: {
                        on: jest.fn(),
                        off: jest.fn()
                    },
                    end: {
                        visible: endVisibleMock
                    },
                    loading: {
                        visible: loadingVisibleMock
                    }
                }
            }
        });

        setGameSettings({ text_animation: false });
        setState({ instruction_count: 0, history: {} });
        setInstructionCount(0);
        setActiveScene("start");
        setShouldAbortGame(false);
        getAbortInstruction()?.();
    });

    afterEach(() => {
        global.document = originalDocument;
    });

    it("aborts an active dialog wait using the shared abort lifecycle", async () => {
        const pendingDialog = dialog({ data: { name: "Mary" } }, "Lifecycle test", true);

        const abortInstruction = getAbortInstruction();
        abortInstruction();

        await expect(pendingDialog).rejects.toThrow("Dialog aborted");
    });

    it("resets scene state and starts the next scene", async () => {
        setInstructionCount(5);
        setState({ instruction_count: 5, history: { "start-1": "hello" } });

        const sceneSpy = jest.fn();
        function chapterTwo() {
            sceneSpy();
        }

        next(chapterTwo);
        
        await Promise.resolve();

        expect(sceneSpy).toHaveBeenCalledTimes(1);
        expect(getInstructionCount()).toBe(0);
        expect(getState().instruction_count).toBe(0);
        expect(getActiveScene()).toBe("chapterTwo");
        expect(endVisibleMock).toHaveBeenCalledWith(false);
        expect(loadingVisibleMock).toHaveBeenCalledWith(false);
    });

    it("ignores next-scene calls when the game is flagged for abort", () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

        const sceneSpy = jest.fn();
        function shouldNotRun() {
            sceneSpy();
        }

        setShouldAbortGame(true);
        next(shouldNotRun);

        expect(sceneSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
