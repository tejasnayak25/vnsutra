import { getGameSettings } from "./runtime-state.js";
import { storage } from "./storage.js";
import { EVENTS, STORAGE_KEYS } from "./constants.js";
import errorTracking from "./error-tracking.js";

/**
 * Accessibility controls for contrast, motion, and font scaling.
 */
class AccessibilityControls {
    /**
     * @param {string} [storagePrefix="accessibility"]
     */
    constructor(storagePrefix = "accessibility") {
        this.storagePrefix = storagePrefix;
        this.storageKeys = this.resolveStorageKeys(storagePrefix);
        this.settings = {
            highContrast: false,
            reduceMotion: false,
            fontScale: 1
        };
        // Note: Load is async - must call load().then(() => applyAll()) during app init
    }

    /**
     * Build a storage key for a setting.
     * @param {string} name
     * @returns {string}
     */
    getStorageKey(name) {
        return `${this.storagePrefix}-${name}`;
    }

    /**
     * Resolve storage key names, allowing a custom prefix override.
     * @param {string} prefix
     * @returns {{ highContrast: string, reduceMotion: string, fontScale: string }}
     */
    resolveStorageKeys(prefix) {
        if (!prefix || prefix === "accessibility") {
            return {
                highContrast: STORAGE_KEYS.ACCESSIBILITY_HIGH_CONTRAST,
                reduceMotion: STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION,
                fontScale: STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE
            };
        }

        return {
            highContrast: `${prefix}-high-contrast`,
            reduceMotion: `${prefix}-reduce-motion`,
            fontScale: `${prefix}-font-scale`
        };
    }

    /**
     * Load persisted accessibility settings.
     * @returns {Promise<void>}
     */
    async load() {
        try {
            const highContrast = await storage.getItem(this.storageKeys.highContrast);
            const reduceMotion = await storage.getItem(this.storageKeys.reduceMotion);
            const fontScale = await storage.getItem(this.storageKeys.fontScale);

            if (highContrast !== null) {
                this.settings.highContrast = highContrast === "true";
            }

            if (reduceMotion !== null) {
                this.settings.reduceMotion = reduceMotion === "true";
            }

            if (fontScale !== null) {
                const parsed = Number(fontScale);
                if (!Number.isNaN(parsed)) {
                    this.settings.fontScale = Math.min(1.5, Math.max(0.8, parsed));
                }
            }
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Accessibility] Failed to load settings",
                context: { scope: "accessibility", stage: "load" }
            });
        }
    }

    /**
     * Persist current accessibility settings.
     * @returns {void}
     */
    save() {
        try {
            storage.setItem(this.storageKeys.highContrast, Boolean(this.settings.highContrast)).catch((error) => {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Accessibility] Failed to save high-contrast",
                    context: { scope: "accessibility", stage: "save" }
                });
            });
            storage.setItem(this.storageKeys.reduceMotion, Boolean(this.settings.reduceMotion)).catch((error) => {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Accessibility] Failed to save reduce-motion",
                    context: { scope: "accessibility", stage: "save" }
                });
            });
            storage.setItem(this.storageKeys.fontScale, String(this.settings.fontScale)).catch((error) => {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Accessibility] Failed to save font-scale",
                    context: { scope: "accessibility", stage: "save" }
                });
            });
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Accessibility] Failed to save settings",
                context: { scope: "accessibility", stage: "save" }
            });
        }
    }

    /**
     * Apply all accessibility settings to the DOM/runtime.
     * @returns {void}
     */
    applyAll() {
        this.applyHighContrast();
        this.applyReduceMotion();
        this.applyFontScale();
    }

    /**
     * Emit settings update event.
     * @returns {void}
     */
    notify() {
        globalThis.dispatchEvent(new CustomEvent(EVENTS.ACCESSIBILITY, {
            detail: this.getSettings()
        }));
    }

    /**
     * Toggle high-contrast mode.
     * @param {boolean} enabled
     * @returns {void}
     */
    setHighContrast(enabled) {
        this.settings.highContrast = Boolean(enabled);
        this.applyHighContrast();
        this.save();
        this.notify();
    }

    /**
     * Toggle reduced motion mode.
     * @param {boolean} enabled
     * @returns {void}
     */
    setReduceMotion(enabled) {
        this.settings.reduceMotion = Boolean(enabled);
        this.applyReduceMotion();
        this.save();
        this.notify();
    }

    /**
     * Set font scale factor.
     * @param {number} scale
     * @returns {void}
     */
    setFontScale(scale) {
        const normalized = Math.min(1.5, Math.max(0.8, Number(scale) || 1));
        this.settings.fontScale = normalized;
        this.applyFontScale();
        this.save();
        this.notify();
    }

    /**
     * Increase font scale by a step.
     * @param {number} [step=0.1]
     * @returns {void}
     */
    increaseFontScale(step = 0.1) {
        this.setFontScale(this.settings.fontScale + step);
    }

    /**
     * Decrease font scale by a step.
     * @param {number} [step=0.1]
     * @returns {void}
     */
    decreaseFontScale(step = 0.1) {
        this.setFontScale(this.settings.fontScale - step);
    }

    /** @returns {void} */
    applyHighContrast() {
        const body = document.body;
        if (!body) {
            return;
        }

        body.classList.toggle("vnsutra-high-contrast", this.settings.highContrast);
        body.style.filter = this.settings.highContrast ? "contrast(1.25) saturate(1.1)" : "";
    }

    /** @returns {void} */
    applyReduceMotion() {
        document.body?.classList.toggle("vnsutra-reduce-motion", this.settings.reduceMotion);
        const gameSettings = getGameSettings();
        if (gameSettings) {
            gameSettings[STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION] = this.settings.reduceMotion;
        }
    }

    /** @returns {void} */
    applyFontScale() {
        const scale = this.settings.fontScale;
        const gameSettings = getGameSettings();
        if (gameSettings) {
            gameSettings[STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE] = scale;
        }

        const root = document.documentElement;
        if (root?.style) {
            root.style.setProperty("--vnsutra-font-scale", String(scale));
            root.style.fontSize = "calc(16px * var(--vnsutra-font-scale, 1))";
        }
    }

    /**
     * Get current accessibility settings.
     * @returns {{ highContrast: boolean, reduceMotion: boolean, fontScale: number }}
     */
    getSettings() {
        return {
            highContrast: this.settings.highContrast,
            reduceMotion: this.settings.reduceMotion,
            fontScale: this.settings.fontScale
        };
    }
}

const accessibility = new AccessibilityControls();

export { AccessibilityControls, accessibility };
export default accessibility;
