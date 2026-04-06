import { getConfiguration, getIsAndroid, getIsPortrait } from "./runtime-state.js";
import { storage } from "./storage.js";
import { STORAGE_KEYS, EVENTS } from "./constants.js";
import errorTracking from "./error-tracking.js";

/**
 * Achievement registry, progress tracker, and toast notifier.
 */
class Achievements {
    /**
     * @param {string} [storageKey=STORAGE_KEYS.ACHIEVEMENTS]
     */
    constructor(storageKey = STORAGE_KEYS.ACHIEVEMENTS) {
        this.storageKey = typeof storageKey === "string" && storageKey.trim().length > 0
            ? storageKey
            : STORAGE_KEYS.ACHIEVEMENTS;
        this.definitions = {};
        this.unlocked = {};
        this.progress = {};
        this.toastContainer = null;
        this.load();
        this.ensureToastContainer();
    }

    /** @returns {string | null} */
    readLocalFallback() {
        try {
            return globalThis.localStorage?.getItem(this.storageKey) ?? null;
        } catch {
            return null;
        }
    }

    /**
     * @param {string} payload
     * @returns {boolean}
     */
    writeLocalFallback(payload) {
        try {
            globalThis.localStorage?.setItem(this.storageKey, payload);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Register a single achievement definition.
     * @param {string} id
     * @param {{ title?: string, description?: string, target?: number, hidden?: boolean }} [config={}]
     * @returns {void}
     */
    define(id, config = {}) {
        if (!id) {
            return;
        }

        const target = Number.isFinite(config.target) ? Math.max(1, config.target) : 1;
        this.definitions[id] = {
            id,
            title: config.title ?? id,
            description: config.description ?? "",
            target,
            hidden: Boolean(config.hidden)
        };

        if (typeof this.progress[id] !== "number") {
            this.progress[id] = 0;
        }

        this.save();
    }

    /**
     * Register multiple achievement definitions.
     * @param {Array<{ id: string, title?: string, description?: string, target?: number, hidden?: boolean }>} [items=[]]
     * @returns {void}
     */
    defineMany(items = []) {
        items.forEach((item) => {
            if (item?.id) {
                this.define(item.id, item);
            }
        });
    }

    /**
     * Unlock an achievement and emit completion event.
     * @param {string} id
     * @param {Record<string, unknown>} [metadata={}]
     * @returns {void}
     */
    unlock(id, metadata = {}) {
        const definition = this.definitions[id];
        if (!definition) {
            return;
        }

        if (this.unlocked[id]) {
            return;
        }

        this.unlocked[id] = {
            timestamp: Date.now(),
            metadata
        };
        this.progress[id] = Math.max(definition.target, this.progress[id] ?? 0);

        this.save();
        this.notify(definition);

        globalThis.dispatchEvent(new CustomEvent(EVENTS.ACHIEVEMENT_UNLOCKED, {
            detail: { id, ...this.unlocked[id] }
        }));
    }

    /**
     * Increment progress for a tracked achievement.
     * @param {string} id
     * @param {number} [amount=1]
     * @returns {void}
     */
    increment(id, amount = 1) {
        // Validate inputs
        if (!Number.isFinite(amount) || amount <= 0) {
            console.warn("[Achievements] Invalid amount:", amount);
            return;
        }

        const definition = this.definitions[id];
        if (!definition) {
            return;
        }

        if (this.unlocked[id]) {
            return;
        }

        const current = this.progress[id] ?? 0;
        const next = current + amount;
        this.progress[id] = next;
        this.save();

        if (next >= definition.target) {
            this.unlock(id, { progress: next });
        }
    }

    /**
     * Check whether an achievement is unlocked.
     * @param {string} id
     * @returns {boolean}
     */
    isUnlocked(id) {
        return Boolean(this.unlocked[id]);
    }

    /**
     * Get a normalized report of all achievement definitions and progress.
     * @returns {Array<{
     *  id: string,
     *  title: string,
     *  description: string,
     *  target: number,
     *  progress: number,
     *  unlocked: boolean,
     *  unlockedAt: number | null
     * }>}
     */
    getProgressReport() {
        return Object.keys(this.definitions).map((id) => {
            const definition = this.definitions[id];
            return {
                id,
                title: definition.title,
                description: definition.description,
                target: definition.target,
                progress: this.progress[id] ?? 0,
                unlocked: this.isUnlocked(id),
                unlockedAt: this.unlocked[id]?.timestamp ?? null
            };
        });
    }

    /** @returns {void} */
    save() {
        try {
            const payload = {
                definitions: this.definitions,
                unlocked: this.unlocked,
                progress: this.progress
            };
            const serialized = JSON.stringify(payload);
            storage.setItem(this.storageKey, serialized).catch((error) => {
                const fallbackSaved = this.writeLocalFallback(serialized);
                if (!fallbackSaved) {
                    errorTracking?.captureError(error, {
                        type: "warning",
                        message: "[Achievements] Failed to save",
                        context: { scope: "achievements", stage: "save" }
                    });
                }
            });
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Achievements] Failed to save",
                context: { scope: "achievements", stage: "save" }
            });
        }
    }

    /** @returns {Promise<void>} */
    async load() {
        try {
            let raw = await storage.getItem(this.storageKey);
            if (!raw) {
                raw = this.readLocalFallback();
            }

            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            this.definitions = parsed.definitions ?? {};
            this.unlocked = parsed.unlocked ?? {};
            this.progress = parsed.progress ?? {};
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Achievements] Failed to load",
                context: { scope: "achievements", stage: "load" }
            });
            this.definitions = {};
            this.unlocked = {};
            this.progress = {};
        }
    }

    /** @returns {void} */
    ensureToastContainer() {
        if (this.toastContainer) {
            return;
        }

        const container = document.createElement("div");
        container.id = "achievement-toast-container";
        const androidLandscapeOffset = getIsAndroid() && !getIsPortrait() ? " top-16 sm:top-20" : " top-20 sm:top-24";
        container.className = `fixed${androidLandscapeOffset} left-1/2 -translate-x-1/2 w-11/12 max-w-md z-50 flex flex-col items-stretch gap-3 pointer-events-none`;
        document.body.appendChild(container);
        this.toastContainer = container;
    }

    /**
     * Resolve current theme colors from configuration with fallbacks.
     * @returns {{ menu: string, text: string, menuBorder: string, primary: string }}
     */
    getThemeColors() {
        const config = getConfiguration?.();
        const colors = config?.colors ?? null;

        if (!colors) {
            console.info("[Achievements] Configuration not loaded, using fallback theme");
        }

        return {
            menu: colors?.menu ?? "#0f172a",
            text: colors?.text ?? "#f8fafc",
            menuBorder: colors?.["menu-border"] ?? "rgba(148, 163, 184, 0.35)",
            primary: colors?.primary ?? "#fbbf24"
        };
    }

    /**
     * Render achievement unlock toast UI.
     * @param {{ title: string, description?: string }} definition
     * @returns {void}
     */
    notify(definition) {
        this.ensureToastContainer();
        const theme = this.getThemeColors();

        const toast = document.createElement("div");
        toast.className = "pointer-events-auto rounded-xl border border-slate-400/40 border-l-4 border-l-amber-300 bg-slate-900/90 px-4 py-3 shadow-xl backdrop-blur-sm";
        toast.style.background = `${theme.menu}f2`;
        toast.style.color = theme.text;
        toast.style.borderColor = theme.menuBorder;
        toast.style.borderLeftColor = theme.primary;

        const heading = document.createElement("p");
        heading.className = "text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-300";
        heading.textContent = "🏆 Achievement Unlocked";
        heading.style.color = theme.primary;

        const subtitle = document.createElement("p");
        subtitle.className = "mt-1 text-sm sm:text-base font-bold leading-tight text-slate-50";
        subtitle.textContent = definition.title;
        subtitle.style.color = theme.text;

        toast.appendChild(heading);
        toast.appendChild(subtitle);

        if (definition.description) {
            const description = document.createElement("p");
            description.className = "mt-1 text-xs sm:text-sm leading-snug text-slate-300";
            description.textContent = definition.description;
            description.style.color = theme.text;
            description.style.opacity = "0.82";
            toast.appendChild(description);
        }

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3500);
    }
}

const achievements = new Achievements();

if (typeof globalThis !== "undefined") {
    globalThis.addEventListener(EVENTS.DIALOG, () => {
        try {
            achievements.increment("story.dialog-reader", 1);
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[Achievements] Failed to track dialog",
                context: { scope: "achievements", stage: "dialog" }
            });
        }
    });

    globalThis.addEventListener(EVENTS.CHOICE, () => {
        try {
            achievements.increment("story.first-choice", 1);
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[Achievements] Failed to track choice",
                context: { scope: "achievements", stage: "choice" }
            });
        }
    });

    globalThis.addEventListener(EVENTS.INPUT, () => {
        try {
            achievements.increment("story.identity", 1);
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[Achievements] Failed to track input",
                context: { scope: "achievements", stage: "input" }
            });
        }
    });
}

export { Achievements, achievements };
export default achievements;
