import { storage } from "./storage.js";
import errorTracking from "./error-tracking.js";
import { konvaStage } from "./stage.js";
import { getActiveLayer, getActiveScene, getState, getInstructionCount } from "./runtime-state.js";
import { STORAGE_KEYS, EVENTS } from "./constants.js";
import { buildSavedGameEntry, toAutosavePayload } from "./save-utils.js";
import chapters from "./chapters.js";

/**
 * Periodic auto-save controller for capturing game state.
 */
class AutoSave {
    /**
     * @param {number} [interval=30000] - Autosave interval in milliseconds.
     */
    constructor(interval = 30000) {
        this.interval = Math.max(1000, Number(interval) || 30000); // Min 1s with validation
        this.timer = null;
        this.key = STORAGE_KEYS.AUTOSAVE;
    }

    /**
     * Wait for storage initialization with timeout.
     * @param {number} [maxWaitMs=5000]
     * @returns {Promise<boolean>}
     */
    async waitForStorage(maxWaitMs = 5000) {
        const initPromise = storage.initialize()
            .then(() => storage.isReady())
            .catch(() => false);

        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve(false), maxWaitMs);
        });

        return Promise.race([initPromise, timeoutPromise]);
    }

    /**
     * Start autosave timer immediately.
     * @returns {void}
     */
    start() {
        this.stop();
        this.save();
        this.timer = setInterval(() => {
            this.save();
        }, this.interval);
    }

    /**
     * Capture a snapshot from the Konva stage if available.
     * @returns {string | null}
     */
    captureSnapshot() {
        try {
            if (!konvaStage || typeof konvaStage.findOne !== "function") {
                return null;
            }

            const gameBox = konvaStage.findOne("#game-box");
            if (!gameBox || typeof gameBox.toDataURL !== "function") {
                return null;
            }

            return gameBox.toDataURL({
                imageSmoothingEnabled: true,
                width: gameBox.width(),
                height: gameBox.height(),
            });
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[AutoSave] Snapshot capture failed",
                context: { scope: "autosave", stage: "capture" }
            });
            return null;
        }
    }

    /**
     * Stop autosave timer.
     * @returns {void}
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Persist current autosave snapshot/state.
     * @returns {Promise<void>}
     */
    async save() {
        try {
            const storageReady = await this.waitForStorage();
            if (!storageReady) {
                throw new Error("Storage not available after timeout");
            }

            // Check required globals
            const activeLayer = getActiveLayer();
            if (!activeLayer || activeLayer !== "game") {
                console.info("[AutoSave] Skipping - not in game layer");
                return;
            }

            const activeScene = getActiveScene();
            if (!activeScene) {
                console.info("[AutoSave] Skipping - no active scene");
                return;
            }

            const snapshot = this.captureSnapshot();
            const state = getState();
            const timestamp = Date.now();
            const chapterId = chapters.getCurrentChapter()?.id ?? null;
            const built = buildSavedGameEntry({
                id: timestamp,
                scene: activeScene,
                chapterId,
                timestamp,
                src: snapshot,
                state: state ?? {},
                instructionCount: getInstructionCount()
            });
            const gameState = toAutosavePayload(built);

            await storage.setItem(this.key, JSON.stringify(gameState));
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[AutoSave] Save failed",
                context: { scope: "autosave", stage: "save" }
            });
            // Notify user via custom event
            if (typeof globalThis !== "undefined") {
                globalThis.dispatchEvent(new CustomEvent(EVENTS.AUTOSAVE_FAILED, {
                    detail: { error: error.message } 
                }));
            }
        }
    }

    /**
     * Load the latest autosave state.
     * @returns {Promise<{scene: string, state: Record<string, any>, timestamp: number, src: string | null} | null>}
     */
    async load() {
        try {
            const storageReady = await this.waitForStorage();
            if (!storageReady) {
                console.warn("[AutoSave] Storage not available, cannot load");
                return null;
            }

            const rawData = await storage.getItem(this.key);
            if (!rawData) {
                return null;
            }

            const parsed = JSON.parse(rawData);
            if (!parsed || typeof parsed !== "object") {
                return null;
            }

            return {
                scene: parsed.scene,
                chapterId: parsed.chapterId ?? null,
                state: parsed.state ?? {},
                timestamp: parsed.timestamp ?? 0,
                src: parsed.src ?? null,
            };
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[AutoSave] Load failed",
                context: { scope: "autosave", stage: "load" }
            });
            return null;
        }
    }

    /**
     * Clear autosave entry from storage.
     * @returns {Promise<void>}
     */
    async clear() {
        try {
            const storageReady = await this.waitForStorage();
            if (!storageReady) {
                console.warn("[AutoSave] Storage not available, cannot clear");
                return;
            }

            await storage.removeItem(this.key);
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[AutoSave] Clear failed",
                context: { scope: "autosave", stage: "clear" }
            });
        }
    }
}

const autoSave = new AutoSave();

export { autoSave, AutoSave };
export default autoSave;
