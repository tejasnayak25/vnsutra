/**
 * Storage Manager Module - Safe IndexedDB wrapper with explicit initialization
 * 
 * Usage:
 *   import { storage } from './storage.js';
 *   await storage.initialize();
 *   await storage.setItem('key', value);  // engine data (settings, achievements)
 *   await storage.storyDb.setItem('save123', saveData);  // story data (game saves)
 */

import { loadJSON } from "./utils.js";
import { 
    openDatabase, 
    addData, 
    getData, 
    deleteData, 
    clearData, 
    getKeyAt, 
    getDataLength 
} from "./storage-utils.js";
import { setDataStore, setStoryDb } from "./runtime-state.js";
import errorTracking from "./error-tracking.js";

/**
 * Create a localStorage-like wrapper for an IndexedDB database
 * @private
 * @param {IDBDatabase} db
 * @returns {Object} Storage API with setItem, getItem, removeItem, clear, key, length
 */
function createStorageWrapper(db) {
    return {
        setItem: async (key, value) => {
            try {
                await addData(db, { key, value });
            } catch (error) {
                errorTracking?.captureError(error, {
                    message: "[Storage] Failed to save data",
                    context: { scope: "storage", action: "setItem", key }
                });
                throw new Error("Storage operation failed");
            }
        },
        getItem: async (key) => {
            try {
                const data = await getData(db, key);
                return data ? data.value : null;
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Storage] Failed to retrieve data",
                    context: { scope: "storage", action: "getItem", key }
                });
                return null;
            }
        },
        removeItem: async (key) => {
            try {
                await deleteData(db, key);
            } catch (error) {
                errorTracking?.captureError(error, {
                    message: "[Storage] Failed to delete data",
                    context: { scope: "storage", action: "removeItem", key }
                });
                throw new Error("Storage operation failed");
            }
        },
        clear: async () => {
            try {
                await clearData(db);
            } catch (error) {
                errorTracking?.captureError(error, {
                    message: "[Storage] Failed to clear data",
                    context: { scope: "storage", action: "clear" }
                });
                throw new Error("Storage operation failed");
            }
        },
        key: async (index) => {
            try {
                return await getKeyAt(db, index);
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Storage] Failed to get key",
                    context: { scope: "storage", action: "key", index }
                });
                return null;
            }
        },
        get length() {
            try {
                return getDataLength(db);
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Storage] Failed to get storage length",
                    context: { scope: "storage", action: "length" }
                });
                return 0;
            }
        }
    };
}

class StorageManager {
    constructor() {
        this.dataStore = null;
        this.storyDb = null;
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize storage - safe to call multiple times
     * @returns {Promise<StorageManager>}
     */
    async initialize() {
        if (this.initialized) {
            return this;
        }
        
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        await this.initPromise;
        return this;
    }

    /**
     * Check if storage is ready
     * @returns {boolean}
     */
    isReady() {
        return this.initialized && this.dataStore !== null;
    }

    /**
     * Internal initialization logic
     * @private
     */
    async _doInitialize() {
        try {
            const config = await loadJSON("../game/config.json");
            
            if (config === 404) {
                throw new Error("Config file not found");
            }

            const db = await openDatabase(config["project-name"]);
            const storyDbRaw = await openDatabase(`${config["project-name"]}_story`);

            // Wrap both databases with the same localStorage-like API
            this.dataStore = createStorageWrapper(db);
            this.storyDb = createStorageWrapper(storyDbRaw);

            this.initialized = true;
            console.info("[Storage] Initialized successfully");
            setDataStore(this.dataStore);
            setStoryDb(this.storyDb);

        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[Storage] Failed to initialize",
                context: { scope: "storage", action: "initialize" }
            });
            
            // Provide no-op fallback to prevent crashes
            const noOpStore = {
                setItem: async () => { 
                    errorTracking?.captureError("Storage not available - setItem skipped", {
                        type: "warning",
                        message: "[Storage] Not available - operation skipped",
                        context: { scope: "storage", action: "setItem" }
                    });
                },
                getItem: async () => null,
                removeItem: async () => { 
                    errorTracking?.captureError("Storage not available - removeItem skipped", {
                        type: "warning",
                        message: "[Storage] Not available - operation skipped",
                        context: { scope: "storage", action: "removeItem" }
                    });
                },
                clear: async () => { 
                    errorTracking?.captureError("Storage not available - clear skipped", {
                        type: "warning",
                        message: "[Storage] Not available - operation skipped",
                        context: { scope: "storage", action: "clear" }
                    });
                },
                key: async () => null,
                length: 0
            };

            this.dataStore = noOpStore;
            this.storyDb = noOpStore;
            this.initialized = true;
            setDataStore(this.dataStore);
            setStoryDb(this.storyDb);
        }
    }

    /**
     * Convenience methods that auto-initialize
     */
    async setItem(key, value) {
        await this.initialize();
        return this.dataStore.setItem(key, value);
    }

    async getItem(key) {
        await this.initialize();
        return this.dataStore.getItem(key);
    }

    async removeItem(key) {
        await this.initialize();
        return this.dataStore.removeItem(key);
    }

    async clear() {
        await this.initialize();
        return this.dataStore.clear();
    }

    async key(index) {
        await this.initialize();
        return this.dataStore.key(index);
    }

    get length() {
        if (!this.isReady()) {
            return 0;
        }
        return this.dataStore.length;
    }
}

// Create singleton instance
const storage = new StorageManager();

// Export both named and default
export { storage, StorageManager };
export default storage;