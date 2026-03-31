/**
 * Shared storage key constants used across runtime modules.
 * @readonly
 * @enum {string}
 */
const STORAGE_KEYS = {
    ACHIEVEMENTS: "vnsutra-achievements",
    AUTOSAVE: "__autosave__",
    CHAPTER_PROGRESS: "vnsutra-chapter-progress",
    ERROR_LOG: "vnsutra-error-log",
    PERFORMANCE_LOG: "vnsutra-performance-log",
    PLAYBACK_SKIP: "playback-skip",
    PLAYBACK_AUTOPLAY: "playback-autoplay",
    PLAYBACK_AUTOPLAY_DELAY: "playback-autoplay-delay",
    PREFERRED_LANGUAGE: "preferredLanguage",
    ACCESSIBILITY_HIGH_CONTRAST: "accessibility-high-contrast",
    ACCESSIBILITY_REDUCE_MOTION: "accessibility-reduce-motion",
    ACCESSIBILITY_FONT_SCALE: "accessibility-font-scale"
};

/**
 * Shared custom event names used by VN-Sutra modules.
 * @readonly
 * @enum {string}
 */
const EVENTS = {
    DIALOG: "vnsutra:dialog",
    INPUT: "vnsutra:input",
    CHOICE: "vnsutra:choice",
    GAME_COMPLETED: "vnsutra:game-completed",
    ACHIEVEMENT_UNLOCKED: "achievement-unlocked",
    AUTOSAVE_FAILED: "vnsutra:autosave-failed",
    ACCESSIBILITY: "vnsutra:accessibility",
    GESTURE: "vnsutra:gesture",
    PERFORMANCE: "vnsutra:performance",
    PLAYBACK_SETTING_CHANGED: "playback-setting-changed",
    UPDATE_AVAILABLE: "vnsutra-update",
    DATA_LOADED: "data-loaded",
    GAME_RESIZE: "game-resize"
};

export { STORAGE_KEYS, EVENTS };
export default { STORAGE_KEYS, EVENTS };