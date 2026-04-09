import { STORAGE_KEYS } from "./constants.js";

/**
 * Runtime state accessors for ES modules.
 * This module owns mutable runtime state.
 */

/** @type {any} */
let game = null;

/** @type {{ text_animation: boolean, [key: string]: any }} */
let gameSettings = {
    text_animation: true,
    [STORAGE_KEYS.ACCESSIBILITY_HIGH_CONTRAST]: false,
    [STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION]: false,
    [STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE]: 1
};
/** @type {() => void} */
let exitApp = () => {
    globalThis.closeApp?.() || history.back();
};
/** @type {() => void} */
let bgm = () => {
    document.getElementById("music")?.play();
};
/** @type {boolean} */
let autoplay = false;
/** @type {boolean} */
let is_app = false;

/** @type {string|undefined} */
let activeScene = undefined;
/** @type {string} */
let activeLayer = "home";
/** @type {Record<string, any>|null} */
let configuration = null;
/** @type {Record<string, any>} */
let state = {};
/** @type {number} */
let instruction_count = 0;

/** @type {boolean} */
let isPortrait = false;
/** @type {boolean} */
let isAndroid = false;

/** @type {any} */
let storyDb = null;
/** @type {any} */
let dataStore = null;
/** @type {{ toggleMenu?: Function, showHistory?: Function, quickSave?: Function, quickLoad?: Function }|null} */
let gameKeyboardActions = null;
/** @type {string|null} */
let openWindow = null;
/** @type {boolean} */
let isInputFocused = false;
/** @type {boolean} */
let shouldAbortGame = false;
/** @type {() => void} */
let abortInstruction = () => {};
/** @type {number} */
let resizeSuppressedUntil = 0;

/** @returns {Record<string, any>|null} */
export const getConfiguration = () => configuration;
/** @param {Record<string, any>|null} value */
export const setConfiguration = (value) => { configuration = value; };
/** @returns {Record<string, any>} */
export const getState = () => state;
/** @param {Record<string, any>} value */
export const setState = (value) => { state = value; };
/** @returns {number} */
export const getInstructionCount = () => instruction_count;
/** @param {number} value
 *  @returns {number}
 */
export const setInstructionCount = (value) => {
    instruction_count = value;
    return value;
};
/** @returns {number} */
export const incrementInstructionCount = () => ++instruction_count;
/** @returns {string|undefined} */
export const getActiveScene = () => activeScene;
/** @param {string|undefined} value */
export const setActiveScene = (value) => { activeScene = value; };
/** @returns {string} */
export const getActiveLayer = () => activeLayer;
/** @param {string} value */
export const setActiveLayer = (value) => { activeLayer = value; };
/** @returns {{ text_animation: boolean, [key: string]: any }} */
export const getGameSettings = () => gameSettings;
/** @param {{ text_animation: boolean, [key: string]: any }} value */
export const setGameSettings = (value) => { gameSettings = value; };
/**
 * Normalize user-configured font scale.
 * @param {any} value
 * @returns {number}
 */
const normalizeFontScale = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 1;
    }

    return Math.min(1.5, Math.max(0.8, parsed));
};

/** @returns {number} */
export const getFontScale = () => normalizeFontScale(gameSettings?.[STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE]);

/**
 * Scale a numeric font size using the persisted accessibility setting.
 * @param {number} baseSize
 * @returns {number}
 */
export function scaleFontSize(baseSize) {
    const parsed = Number(baseSize);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return parsed * getFontScale();
}

/** @returns {boolean} */
export const getIsPortrait = () => isPortrait;
/** @param {boolean} value */
export const setIsPortrait = (value) => { isPortrait = value; };
/** @returns {boolean} */
export const getIsAndroid = () => isAndroid;
/** @param {boolean} value */
export const setIsAndroid = (value) => { isAndroid = value; };
/** @returns {any} */
export const getStoryDb = () => storyDb;
/** @param {any} value */
export const setStoryDb = (value) => { storyDb = value; };
/** @returns {any} */
export const getDataStore = () => dataStore;
/** @param {any} value */
export const setDataStore = (value) => { dataStore = value; };
/** @returns {{ toggleMenu?: Function, showHistory?: Function, quickSave?: Function, quickLoad?: Function }|null} */
export const getGameKeyboardActions = () => gameKeyboardActions;
/** @param {{ toggleMenu?: Function, showHistory?: Function, quickSave?: Function, quickLoad?: Function }|null} value */
export const setGameKeyboardActions = (value) => { gameKeyboardActions = value; };
/** @returns {() => void} */
export const getExitApp = () => exitApp;
/** @param {() => void} value */
export const setExitApp = (value) => { exitApp = value; };
/** @returns {() => void} */
export const getBgm = () => bgm;
/** @param {() => void} value */
export const setBgm = (value) => { bgm = value; };
/** @returns {boolean} */
export const getAutoplay = () => autoplay;
/** @param {boolean} value */
export const setAutoplay = (value) => { autoplay = value; };
/** @returns {boolean} */
export const getIsApp = () => is_app;
/** @param {boolean} value */
export const setIsApp = (value) => { is_app = value; };
/** @returns {any} */
export const getGame = () => game;
/** @param {any} value */
export const setGame = (value) => { game = value; };
/** @returns {string|null} */
export const getOpenWindow = () => openWindow;
/** @param {string|null} value */
export const setOpenWindow = (value) => {
    openWindow = value;
    globalThis.dispatchEvent(new CustomEvent("vnsutra:open-window-changed", {
        detail: { windowName: value }
    }));
};
/** @returns {boolean} */
export const getIsInputFocused = () => isInputFocused;
/** @param {boolean} value */
export const setIsInputFocused = (value) => { isInputFocused = value; };
/** @returns {boolean} */
export const getShouldAbortGame = () => shouldAbortGame;
/** @param {boolean} value */
export const setShouldAbortGame = (value) => { shouldAbortGame = value; };
/** @returns {() => void} */
export const getAbortInstruction = () => abortInstruction;
/** @param {() => void} value */
export const setAbortInstruction = (value) => { abortInstruction = value; };
/** @returns {number} */
export const getResizeSuppressedUntil = () => resizeSuppressedUntil;
/** @param {number} value */
export const setResizeSuppressedUntil = (value) => { resizeSuppressedUntil = value; };
