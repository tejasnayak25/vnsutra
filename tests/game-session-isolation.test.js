import { jest } from "@jest/globals";

describe("Game Session Isolation (no overlapping runs on home exit + restart)", () => {
    test("aborted game coroutine stops cleanly even after a new game resets shouldAbortGame=false", async () => {
        jest.resetModules();

        const runtimeState = await import("../vnsutra_modules/runtime-state.js");
        const { setShouldAbortGame, incrementGameSessionId, getGameSessionId } = runtimeState;

        let releaseDialog1;
        const dialogSpy = jest.fn((_actor, text) => {
            if (text === "game1-line1") {
                return new Promise((resolve) => {
                    releaseDialog1 = resolve;
                });
            }
            return Promise.resolve();
        });

        await jest.unstable_mockModule("../vnsutra_modules/game-utils.js", () => ({
            dialog: dialogSpy,
            next: jest.fn(async () => {}),
            loading: { start: jest.fn(), stop: jest.fn() },
            input: jest.fn(async () => ""),
            choice: jest.fn(async () => ""),
            storage: { setItem: jest.fn(async () => {}), getItem: jest.fn(async () => null), removeItem: jest.fn(async () => {}) },
            end: jest.fn(async () => {})
        }));

        const { createStoryFromScript } = await import("../vnsutra_modules/story-script-runner.js");

        const story = createStoryFromScript({
            scenes: {
                game1: [
                    { type: "dialog", text: "game1-line1" },
                    { type: "dialog", text: "game1-line2-should-never-run" }
                ],
                game2: [
                    { type: "dialog", text: "game2-line1" }
                ]
            },
            game: {}
        });

        // Start Game 1
        setShouldAbortGame(false);
        const s1 = getGameSessionId();
        const game1Promise = story.game1();
        await Promise.resolve();
        expect(dialogSpy).toHaveBeenCalledWith(null, "game1-line1", true, expect.anything());

        // Exit to Home midway -> aborts session 1
        setShouldAbortGame(true);
        expect(getGameSessionId()).toBeGreaterThan(s1);

        // Start Game 2 -> new session & shouldAbortGame=false
        incrementGameSessionId();
        setShouldAbortGame(false);

        // Now Game 1's suspended dialog resolves AFTER Game 2 already cleared shouldAbortGame!
        releaseDialog1();
        await game1Promise;

        // Game 2 runs cleanly
        await story.game2();

        const spoken = dialogSpy.mock.calls.map((c) => c[1]);
        expect(spoken).toEqual(["game1-line1", "game2-line1"]);
    });
});
