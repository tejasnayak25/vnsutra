import { storage } from "./storage.js";
import { STORAGE_KEYS } from "./constants.js";

function _writeStdout(msg) {
    try {
        if (typeof process !== "undefined" && process.stdout && typeof process.stdout.write === "function") {
            process.stdout.write(String(msg) + "\n");
        }
    } catch {
        // noop
    }
}

function _writeStderr(msg) {
    try {
        if (typeof process !== "undefined" && process.stderr && typeof process.stderr.write === "function") {
            process.stderr.write(String(msg) + "\n");
        }
    } catch {
        // noop
    }
}

function normalizeMode(mode) {
    return mode === "progressive" ? "progressive" : "all";
}

function normalizeScenes(rawChapter) {
    const scenesFromList = Array.isArray(rawChapter?.scenes)
        ? rawChapter.scenes
        : [];

    const normalized = scenesFromList
        .filter((scene) => typeof scene === "string")
        .map((scene) => scene.trim())
        .filter(Boolean);

    if (!normalized.length && typeof rawChapter?.scene === "string") {
        const legacyScene = rawChapter.scene.trim();
        if (legacyScene) {
            normalized.push(legacyScene);
        }
    }

    return [...new Set(normalized)];
}

function normalizeChapterType(type) {
    return typeof type === "string" && type.trim().toLowerCase() === "notice"
        ? "notice"
        : "chapter";
}

function normalizeChapter(rawChapter, index) {
    const fallbackId = `chapter-${index + 1}`;
    const id = typeof rawChapter?.id === "string" && rawChapter.id.trim().length > 0
        ? rawChapter.id.trim()
        : fallbackId;
    const title = typeof rawChapter?.title === "string" && rawChapter.title.trim().length > 0
        ? rawChapter.title.trim()
        : `Chapter ${index + 1}`;
    const type = normalizeChapterType(rawChapter?.type);
    const scenes = normalizeScenes(rawChapter);
    const scene = scenes[0] ?? "";

    return {
        id,
        title,
        type,
        scene,
        scenes,
        description: typeof rawChapter?.description === "string" ? rawChapter.description : "",
        status: typeof rawChapter?.status === "string" ? rawChapter.status : ""
    };
}

function isChapterDebugEnabled() {
    if (typeof globalThis === "undefined") {
        return false;
    }

    const globalFlag = globalThis.VNSUTRA_DEBUG_CHAPTERS;
    if (globalFlag === true || globalFlag === 1 || globalFlag === "1" || globalFlag === "true") {
        return true;
    }

    try {
        const stored = globalThis.localStorage?.getItem?.("vnsutra-debug-chapters");
        return stored === "1" || stored === "true";
    } catch {
        return false;
    }
}

function logChapterDebug(message, context = undefined) {
    if (!isChapterDebugEnabled()) {
        return;
    }

    if (context === undefined) {
        _writeStdout(`[Chapters][Debug] ${message}`);
        return;
    }

    try {
        _writeStdout(`[Chapters][Debug] ${message} ${JSON.stringify(context)}`);
    } catch {
        _writeStdout(`[Chapters][Debug] ${message}`);
    }
}

class ChapterManager {
    constructor({ storageKey = STORAGE_KEYS.CHAPTER_PROGRESS, storageImpl = storage } = {}) {
        this.storageKey = storageKey;
        this.storage = storageImpl;
        this.enabled = false;
        this.mode = "all";
        this.chapters = [];
        this.chapterById = new Map();
        this.progress = {
            completed: {},
            unlocked: {}
        };
        this.currentChapterId = null;
    }

    setChapters(chapters = []) {
        const source = Array.isArray(chapters) ? chapters : [];
        const normalized = source
            .map((entry, index) => normalizeChapter(entry, index))
            .filter((entry) => entry.type === "notice" || entry.scene);

        this.chapters = normalized;
        this.chapterById = new Map(normalized.map((chapter) => [chapter.id, chapter]));

        return this.chapters;
    }

    async configure({ enabled = true, mode = "all", chapters = [] } = {}) {
        this.enabled = Boolean(enabled);
        this.mode = normalizeMode(mode);
        this.setChapters(chapters);
        await this.loadProgress();
        this.reconcileProgress();
        await this.saveProgress();
        return this.getMap();
    }

    hasChapters() {
        return this.chapters.length > 0;
    }

    isEnabled() {
        return this.enabled && this.hasChapters();
    }

    getMode() {
        return this.mode;
    }

    getById(chapterId) {
        if (!chapterId) {
            return null;
        }
        return this.chapterById.get(chapterId) ?? null;
    }

    getByScene(sceneName) {
        const nextScene = typeof sceneName === "string" ? sceneName.trim() : "";
        if (!nextScene) {
            return null;
        }
        return this.chapters.find((chapter) => chapter.scenes.includes(nextScene)) ?? null;
    }

    isCompleted(chapterId) {
        return Boolean(this.progress.completed[chapterId]);
    }

    isUnlocked(chapterId) {
        const chapter = this.chapterById.get(chapterId);
        if (!chapter) {
            return false;
        }

        if (chapter.type === "notice") {
            return true;
        }

        if (this.mode === "all") {
            return true;
        }

        return Boolean(this.progress.unlocked[chapterId]);
    }

    getMap() {
        return this.chapters.map((chapter, index) => ({
            ...chapter,
            index: index + 1,
            sceneCount: chapter.scenes.length,
            playable: chapter.type !== "notice" && Boolean(chapter.scene),
            unlocked: chapter.type === "notice" ? true : this.isUnlocked(chapter.id),
            completed: chapter.type === "notice" ? false : this.isCompleted(chapter.id),
            current: chapter.type === "notice" ? false : chapter.id === this.currentChapterId
        }));
    }

    getFirstPlayableChapter() {
        const playableChapters = this.chapters.filter((chapter) => chapter.type !== "notice" && Boolean(chapter.scene));
        if (!playableChapters.length) {
            return null;
        }

        if (this.mode === "all") {
            return playableChapters[0];
        }

        return this.getMap().find((chapter) => chapter.playable && chapter.unlocked) ?? playableChapters[0];
    }

    startChapter(chapterId) {
        const chapter = this.getById(chapterId);
        if (!chapter || chapter.type === "notice" || !chapter.scene || !this.isUnlocked(chapter.id)) {
            return null;
        }

        this.currentChapterId = chapter.id;
        return chapter;
    }

    startChapterForScene(sceneName, { resetOnMiss = true, preserveCurrent = false } = {}) {
        if (preserveCurrent && this.currentChapterId && this.chapterById.has(this.currentChapterId)) {
            return this.getById(this.currentChapterId);
        }

        const chapter = this.getByScene(sceneName);
        if (!chapter || !this.isUnlocked(chapter.id)) {
            if (resetOnMiss) {
                this.currentChapterId = null;
            }
            return null;
        }

        this.currentChapterId = chapter.id;
        return chapter;
    }

    getCurrentChapter() {
        if (!this.currentChapterId) {
            return null;
        }
        return this.getById(this.currentChapterId);
    }

    clearCurrentChapter() {
        this.currentChapterId = null;
    }

    async completeCurrentChapter() {
        if (!this.currentChapterId) {
            return null;
        }

        const result = await this.completeChapter(this.currentChapterId);
        this.currentChapterId = null;
        return result;
    }

    async completeChapter(chapterId) {
        const chapter = this.getById(chapterId);
        if (!chapter || chapter.type === "notice" || !chapter.scene) {
            logChapterDebug("Skipped completion for unknown chapter", { chapterId });
            return null;
        }

        logChapterDebug("Completing chapter", {
            chapterId: chapter.id,
            mode: this.mode,
            currentChapterId: this.currentChapterId
        });

        this.progress.completed[chapter.id] = Date.now();

        let unlockedNext = null;
        if (this.mode === "progressive") {
            const currentIndex = this.chapters.findIndex((entry) => entry.id === chapter.id);
            const nextChapter = this.chapters
                .slice(currentIndex + 1)
                .find((entry) => entry.type !== "notice" && Boolean(entry.scene)) ?? null;
            if (nextChapter) {
                this.progress.unlocked[nextChapter.id] = true;
                unlockedNext = nextChapter;
            }
            this.progress.unlocked[chapter.id] = true;
        }

        await this.saveProgress();
        return {
            chapter,
            unlockedNext
        };
    }

    async resetProgress() {
        this.progress = {
            completed: {},
            unlocked: {}
        };
        this.currentChapterId = null;
        this.reconcileProgress();
        await this.saveProgress();
    }

    reconcileProgress() {
        const playableChapters = this.chapters.filter((chapter) => chapter.type !== "notice" && Boolean(chapter.scene));
        const validIds = new Set(playableChapters.map((chapter) => chapter.id));

        const nextCompleted = {};
        Object.entries(this.progress.completed ?? {}).forEach(([chapterId, value]) => {
            if (validIds.has(chapterId)) {
                nextCompleted[chapterId] = value;
            }
        });

        const nextUnlocked = {};
        Object.entries(this.progress.unlocked ?? {}).forEach(([chapterId, value]) => {
            if (validIds.has(chapterId) && value) {
                nextUnlocked[chapterId] = true;
            }
        });

        this.progress.completed = nextCompleted;
        this.progress.unlocked = nextUnlocked;

        if (this.currentChapterId && !validIds.has(this.currentChapterId)) {
            this.currentChapterId = null;
        }

        if (this.mode === "all") {
            return;
        }

        playableChapters.forEach((chapter, index) => {
            if (this.progress.completed[chapter.id]) {
                this.progress.unlocked[chapter.id] = true;
                const nextChapter = playableChapters[index + 1];
                if (nextChapter) {
                    this.progress.unlocked[nextChapter.id] = true;
                }
            }
        });

        const hasUnlockedChapter = playableChapters.some((chapter) => Boolean(this.progress.unlocked[chapter.id]));
        if (!hasUnlockedChapter && playableChapters.length > 0) {
            this.progress.unlocked[playableChapters[0].id] = true;
        }
    }

    async loadProgress() {
        try {
            const raw = await this.storage.getItem(this.storageKey);
            if (!raw) {
                this.progress = { completed: {}, unlocked: {} };
                return;
            }

            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            this.progress = {
                completed: parsed?.completed && typeof parsed.completed === "object" ? parsed.completed : {},
                unlocked: parsed?.unlocked && typeof parsed.unlocked === "object" ? parsed.unlocked : {}
            };
        } catch (error) {
            _writeStderr("[Chapters] Failed to load chapter progress: " + (error?.message ?? String(error)));
            this.progress = { completed: {}, unlocked: {} };
        }
    }

    async saveProgress() {
        if (!this.enabled) {
            logChapterDebug("Skipped saveProgress because chapters are disabled", {
                key: this.storageKey
            });
            return;
        }

        try {
            const payload = {
                mode: this.mode,
                completed: this.progress.completed,
                unlocked: this.progress.unlocked
            };

            logChapterDebug("Persisting chapter progress", {
                key: this.storageKey,
                payload
            });

            await this.storage.setItem(this.storageKey, payload);

            logChapterDebug("Persisted chapter progress", {
                key: this.storageKey
            });
        } catch (error) {
            logChapterDebug("Failed to persist chapter progress", {
                key: this.storageKey,
                error: error?.message ?? String(error)
            });
            _writeStderr("[Chapters] Failed to save chapter progress: " + (error?.message ?? String(error)));
        }
    }
}

const chapters = new ChapterManager();

export { ChapterManager, chapters };
export default chapters;
