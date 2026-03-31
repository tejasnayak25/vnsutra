/**
 * Playback Controls Module
 * 
 * Provides skip and auto-play functionality for visual novels
 * - Skip Mode: Instantly advance through dialogues
 * - Auto-Play Mode: Automatically advance with configurable delay
 * 
 * Usage:
 * - playback.setSkipMode(true) - Enable skip
 * - playback.setAutoPlay(true, 3000) - Enable auto-play with 3 second delay
 * - playback.toggleAutoPlay() - Toggle current setting
 */

import { storage } from "./storage.js";
import { STORAGE_KEYS, EVENTS } from "./constants.js";
import errorTracking from "./error-tracking.js";
import { parseStoredBoolean, parseStoredDelay } from "./playback-settings-utils.js";

/**
 * Playback mode manager for skip and auto-play behavior.
 */
class PlaybackControls {
    /** @returns {void} */
    constructor() {
        this.skipMode = false;
        this.autoPlayMode = false;
        this.autoPlayDelay = 3000; // Milliseconds between advances in auto-play
        this.minAutoPlayDelay = 1000;
        this.maxAutoPlayDelay = 10000;
        this.autoPlayTimer = null;
        this.isWaitingForInput = false;
        // Load is now async - call it explicitly when needed
    }

    /**
     * Enable or disable skip mode
     * @param {boolean} enabled - Skip mode state
     */
    setSkipMode(enabled) {
        this.skipMode = !!enabled;
        storage.setItem(STORAGE_KEYS.PLAYBACK_SKIP, this.skipMode).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[PlaybackControls] Failed to save skip mode",
                context: { scope: "playback", stage: "skip" }
            });
        });
        globalThis.dispatchEvent(new CustomEvent(EVENTS.PLAYBACK_SETTING_CHANGED, {
            detail: { type: "skip", value: this.skipMode }
        }));
    }

    /**
     * Toggle skip mode
     * @returns {boolean} - New skip mode state
     */
    toggleSkipMode() {
        this.setSkipMode(!this.skipMode);
        return this.skipMode;
    }

    /**
     * Enable or disable auto-play mode
     * @param {boolean} enabled - Auto-play mode state
     * @param {number} [delay] - Optional delay in milliseconds
     */
    setAutoPlay(enabled, delay) {
        this.autoPlayMode = !!enabled;
        
        if (delay !== undefined) {
            this.setAutoPlayDelay(delay);
        }

        if (this.autoPlayMode) {
            this.skipMode = false; // Disable skip if auto-play is enabled
            storage.setItem(STORAGE_KEYS.PLAYBACK_SKIP, false).catch((error) => {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[PlaybackControls] Failed to save skip mode",
                    context: { scope: "playback", stage: "skip" }
                });
            });
        }

        storage.setItem(STORAGE_KEYS.PLAYBACK_AUTOPLAY, this.autoPlayMode).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[PlaybackControls] Failed to save autoplay",
                context: { scope: "playback", stage: "autoplay" }
            });
        });
        globalThis.dispatchEvent(new CustomEvent(EVENTS.PLAYBACK_SETTING_CHANGED, {
            detail: { type: "autoplay", value: this.autoPlayMode }
        }));
    }

    /**
     * Toggle auto-play mode
     * @returns {boolean} - New auto-play state
     */
    toggleAutoPlay() {
        this.setAutoPlay(!this.autoPlayMode, this.autoPlayDelay);
        return this.autoPlayMode;
    }

    /**
     * Set auto-play delay
     * @param {number} delayMs - Delay in milliseconds (1000-10000)
     */
    setAutoPlayDelay(delayMs) {
        const delay = Math.max(this.minAutoPlayDelay, Math.min(this.maxAutoPlayDelay, delayMs));
        this.autoPlayDelay = delay;
        storage.setItem(STORAGE_KEYS.PLAYBACK_AUTOPLAY_DELAY, this.autoPlayDelay).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[PlaybackControls] Failed to save delay",
                context: { scope: "playback", stage: "delay" }
            });
        });
        globalThis.dispatchEvent(new CustomEvent(EVENTS.PLAYBACK_SETTING_CHANGED, {
            detail: { type: "delay", value: this.autoPlayDelay }
        }));
    }

    /**
     * Increase auto-play delay by 500ms
     */
    increaseDelay() {
        this.setAutoPlayDelay(this.autoPlayDelay + 500);
    }

    /**
     * Decrease auto-play delay by 500ms
     */
    decreaseDelay() {
        this.setAutoPlayDelay(this.autoPlayDelay - 500);
    }

    /**
     * Get current settings as object
     * @returns {Object} - Current playback settings
     */
    getSettings() {
        return {
            skipMode: this.skipMode,
            autoPlayMode: this.autoPlayMode,
            autoPlayDelay: this.autoPlayDelay
        };
    }

    /**
     * Load settings from IndexedDB
     * @private
     * @returns {Promise<void>}
     */
    async loadSettings() {
        const savedSkip = await storage.getItem(STORAGE_KEYS.PLAYBACK_SKIP);
        const savedAutoPlay = await storage.getItem(STORAGE_KEYS.PLAYBACK_AUTOPLAY);
        const savedDelay = await storage.getItem(STORAGE_KEYS.PLAYBACK_AUTOPLAY_DELAY);

        if (savedSkip !== null) {
            this.skipMode = parseStoredBoolean(savedSkip, this.skipMode);
        }
        if (savedAutoPlay !== null) {
            this.autoPlayMode = parseStoredBoolean(savedAutoPlay, this.autoPlayMode);
        }
        if (savedDelay !== null) {
            this.autoPlayDelay = parseStoredDelay(savedDelay, this.minAutoPlayDelay, this.maxAutoPlayDelay, this.autoPlayDelay);
        }
    }

    /**
     * Clear all auto-play timers
     * @private
     */
    clearAutoPlayTimer() {
        if (this.autoPlayTimer) {
            clearTimeout(this.autoPlayTimer);
            this.autoPlayTimer = null;
        }
    }

    /**
     * Handle dialog completion - auto-advance if auto-play is active
     * @param {boolean} wasUserInput - Whether user triggered advance
     */
    onDialogComplete(wasUserInput = false) {
        if (this.autoPlayMode && !wasUserInput && this.isWaitingForInput) {
            this.clearAutoPlayTimer();
            this.scheduleAutoAdvance();
        }
    }

    /**
     * Schedule automatic advance after delay
     * @private
     */
    scheduleAutoAdvance() {
        if (!this.autoPlayMode) return;

        this.clearAutoPlayTimer();
        this.autoPlayTimer = setTimeout(() => {
            // Simulate Enter key press to advance dialogue
            const event = new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            document.body.dispatchEvent(event);
        }, this.autoPlayDelay);
    }

    /**
     * Check if should skip current input (for skip mode)
     * @returns {boolean}
     */
    shouldSkip() {
        return this.skipMode;
    }

    /**
     * Check if in auto-play mode
     * @returns {boolean}
     */
    isAutoPlayActive() {
        return this.autoPlayMode;
    }

    /**
     * Pause playback modes
     */
    pause() {
        this.clearAutoPlayTimer();
    }

    /**
     * Resume playback modes
     */
    resume() {
        if (this.autoPlayMode && this.isWaitingForInput) {
            this.scheduleAutoAdvance();
        }
    }

    /**
     * Reset all settings to defaults
     * @returns {Promise<void>}
     */
    async reset() {
        this.skipMode = false;
        this.autoPlayMode = false;
        this.autoPlayDelay = 3000;
        await storage.removeItem(STORAGE_KEYS.PLAYBACK_SKIP);
        await storage.removeItem(STORAGE_KEYS.PLAYBACK_AUTOPLAY);
        await storage.removeItem(STORAGE_KEYS.PLAYBACK_AUTOPLAY_DELAY);
        this.clearAutoPlayTimer();
    }
}

// Global instance
const playback = new PlaybackControls();
// Export as ES module
export { playback, PlaybackControls };
export default playback;