import {
    mergeLoadEntries,
    toPersistedSaves,
    buildSavedGameEntry,
    toAutosavePayload
} from "../vnsutra_modules/save-utils.js";

describe("Save Utils", () => {
    it("prepends autosave for load lists when enabled", () => {
        const autosave = { id: "auto", scene: "scene2", timestamp: 2 };
        const saves = [{ id: 1, scene: "start", timestamp: 1 }];

        const merged = mergeLoadEntries(saves, autosave, { includeAutosave: true });

        expect(merged).toHaveLength(2);
        expect(merged[0]).toMatchObject({ id: "auto", isAutosave: true });
        expect(merged[1]).toMatchObject({ id: 1, scene: "start" });
    });

    it("does not inject autosave into save-management lists", () => {
        const autosave = { id: "auto", scene: "scene2", timestamp: 2 };
        const saves = [{ id: 1, scene: "start", timestamp: 1 }];

        const merged = mergeLoadEntries(saves, autosave, { includeAutosave: false });

        expect(merged).toEqual(saves);
        expect(merged.find((item) => item?.isAutosave)).toBeUndefined();
    });

    it("filters autosave entries before persisting saved-games", () => {
        const entries = [
            { id: "auto", isAutosave: true, scene: "scene2" },
            { id: 1, scene: "start" },
            { id: 2, scene: "scene2" }
        ];

        const persisted = toPersistedSaves(entries);

        expect(persisted).toEqual([
            { id: 1, scene: "start" },
            { id: 2, scene: "scene2" }
        ]);
    });

    it("creates immutable state snapshots for saved entries", () => {
        const runtimeState = {
            history: {
                "start-1": "hello"
            },
            flags: {
                metMary: true
            }
        };

        const entry = buildSavedGameEntry({
            id: 42,
            scene: "start",
            chapterId: "chapter-1",
            src: "data:image/png;base64,abc",
            state: runtimeState,
            instructionCount: 7
        });

        runtimeState.history["start-1"] = "changed";
        runtimeState.flags.metMary = false;

        expect(entry.state.history["start-1"]).toBe("hello");
        expect(entry.state.flags.metMary).toBe(true);
        expect(entry.state.instruction_count).toBe(7);
        expect(entry.chapterId).toBe("chapter-1");
    });

    it("keeps autosave payload shape compatible when projecting from shared entry", () => {
        const runtimeState = {
            chapter: 2,
            history: {
                "scene2-3": "option-a"
            }
        };

        const base = buildSavedGameEntry({
            id: 99,
            scene: "scene2",
            chapterId: "chapter-1",
            timestamp: 123456,
            src: "data:image/png;base64,xyz",
            state: runtimeState,
            instructionCount: 11
        });

        const autosavePayload = toAutosavePayload(base);

        expect(autosavePayload).toMatchObject({
            scene: "scene2",
            chapterId: "chapter-1",
            timestamp: 123456,
            src: "data:image/png;base64,xyz"
        });
        expect(autosavePayload.id).toBeUndefined();
        expect(autosavePayload.state.instruction_count).toBe(11);
        expect(Object.keys(autosavePayload).sort()).toEqual(["chapterId", "scene", "src", "state", "timestamp"]);
    });

    it("uses safe defaults for autosave payload projection", () => {
        expect(toAutosavePayload()).toEqual({
            scene: null,
            chapterId: null,
            timestamp: null,
            src: null,
            state: {}
        });
    });
});
