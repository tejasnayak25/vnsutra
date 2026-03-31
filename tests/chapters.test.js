import { ChapterManager } from "../vnsutra_modules/chapters.js";
import { STORAGE_KEYS } from "../vnsutra_modules/constants.js";

function createMemoryStorage(initialEntries = {}) {
    const memory = new Map(Object.entries(initialEntries));

    return {
        async getItem(key) {
            return memory.has(key) ? memory.get(key) : null;
        },
        async setItem(key, value) {
            memory.set(key, value);
        },
        async removeItem(key) {
            memory.delete(key);
        },
        snapshot() {
            return new Map(memory);
        }
    };
}

const chapterDefinitions = [
    { id: "chapter-1", title: "Chapter One", scenes: ["start", "start-mid"] },
    { id: "chapter-2", title: "Chapter Two", scenes: ["scene2", "scene2-mid"] },
    { id: "chapter-3", title: "Chapter Three", scenes: ["scene3"] }
];

describe("Chapter Manager", () => {
    it("unlocks only the first chapter in progressive mode by default", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "progressive",
            chapters: chapterDefinitions
        });

        const map = manager.getMap();

        expect(map[0].unlocked).toBe(true);
        expect(map[1].unlocked).toBe(false);
        expect(map[2].unlocked).toBe(false);
    });

    it("marks current chapter complete and unlocks the next chapter in progressive mode", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "progressive",
            chapters: chapterDefinitions
        });

        expect(manager.startChapter("chapter-1")).toMatchObject({ id: "chapter-1" });

        const completion = await manager.completeCurrentChapter();
        const map = manager.getMap();

        expect(completion?.chapter?.id).toBe("chapter-1");
        expect(completion?.unlockedNext?.id).toBe("chapter-2");
        expect(map[0].completed).toBe(true);
        expect(map[1].unlocked).toBe(true);
        expect(map[2].unlocked).toBe(false);
    });

    it("uses the first chapter scene as the chapter entry point", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "all",
            chapters: chapterDefinitions
        });

        const selected = manager.startChapter("chapter-1");

        expect(selected?.scene).toBe("start");
        expect(selected?.scenes).toEqual(["start", "start-mid"]);
    });

    it("counts unique normalized chapter scenes in map metadata", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "all",
            chapters: [
                {
                    id: "chapter-meta",
                    title: "Chapter Meta",
                    scenes: [" start ", "start", "scene2", "scene2", ""]
                }
            ]
        });

        const map = manager.getMap();

        expect(map[0].scene).toBe("start");
        expect(map[0].sceneCount).toBe(2);
    });

    it("treats all chapters as unlocked in all-unlocked mode", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "all",
            chapters: chapterDefinitions
        });

        const map = manager.getMap();

        expect(map.every((chapter) => chapter.unlocked)).toBe(true);
    });

    it("loads persisted progress and keeps unlock chain consistent", async () => {
        const storageImpl = createMemoryStorage({
            [STORAGE_KEYS.CHAPTER_PROGRESS]: {
                mode: "progressive",
                completed: { "chapter-1": 1700000000000 },
                unlocked: { "chapter-1": true }
            }
        });
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "progressive",
            chapters: chapterDefinitions
        });

        const map = manager.getMap();

        expect(map[0].completed).toBe(true);
        expect(map[1].unlocked).toBe(true);
    });

    it("tracks chapter by scene pointer and ignores locked scene pointers", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "progressive",
            chapters: chapterDefinitions
        });

        expect(manager.startChapterForScene("scene2-mid")).toBeNull();
        expect(manager.getCurrentChapter()).toBeNull();

        expect(manager.startChapterForScene("start-mid")).toMatchObject({ id: "chapter-1", scene: "start" });
        expect(manager.getCurrentChapter()).toMatchObject({ id: "chapter-1" });
    });

    it("can preserve current chapter when syncing an unknown scene", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "progressive",
            chapters: chapterDefinitions
        });

        expect(manager.startChapter("chapter-1")).toMatchObject({ id: "chapter-1" });
        expect(manager.startChapterForScene("non-chapter-scene", { resetOnMiss: false })).toBeNull();
        expect(manager.getCurrentChapter()).toMatchObject({ id: "chapter-1" });
    });

    it("does not switch to another chapter scene while preserving current chapter", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "all",
            chapters: chapterDefinitions
        });

        expect(manager.startChapter("chapter-1")).toMatchObject({ id: "chapter-1" });
        expect(manager.startChapterForScene("scene2", { preserveCurrent: true })).toMatchObject({ id: "chapter-1" });
        expect(manager.getCurrentChapter()).toMatchObject({ id: "chapter-1" });
    });

    it("switches to the loaded scene chapter when preserveCurrent is disabled", async () => {
        const storageImpl = createMemoryStorage();
        const manager = new ChapterManager({ storageImpl });

        await manager.configure({
            enabled: true,
            mode: "all",
            chapters: chapterDefinitions
        });

        expect(manager.startChapter("chapter-1")).toMatchObject({ id: "chapter-1" });
        expect(manager.startChapterForScene("scene2", {
            resetOnMiss: false,
            preserveCurrent: false
        })).toMatchObject({ id: "chapter-2" });
        expect(manager.getCurrentChapter()).toMatchObject({ id: "chapter-2" });
    });
});
