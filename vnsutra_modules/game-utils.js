/**
 * Game Utilities Module
 * 
 * Provides core game functions for visual novel gameplay:
 * - dialog: Display character dialogue
 * - next: Skip to next instruction
 * - loading: Show loading UI
 * - input: Get text input from player
 * - choice: Present multiple-choice options
 * - storage: Story-specific storage API
 * - end: Show game end screen
 * - wait: Delay execution
 */

// Import global state getters
import { 
    getConfiguration, 
    getState, 
    getInstructionCount, 
    setInstructionCount,
    incrementInstructionCount,
    getActiveScene,
    setActiveScene,
    getIsPortrait,
    getStoryDb,
    getGameSettings,
    getGame,
    setIsInputFocused,
    getShouldAbortGame,
    setAbortInstruction
} from "./runtime-state.js";
import { i18n } from "./i18n.js";
import playback from "./playback-controls.js";
import AlertWindow from "./alert-window.js";
import { ChoiceMenu } from "./ui/utils.js";
import { EVENTS } from "./constants.js";
import chapters from "./chapters.js";
import errorTracking from "./error-tracking.js";
import { registerAbortHandler, rejectWithAbortCleanup } from "./abort-utils.js";
import { isFullscreenActive, restoreFullscreenIfNeeded as restoreFullscreen } from "./fullscreen-utils.js";

function dispatchGameEvent(name, detail) {
    if (typeof globalThis === "undefined" || typeof globalThis.dispatchEvent !== "function") {
        return;
    }
    globalThis.dispatchEvent(new CustomEvent(name, { detail }));
}

let fullscreenTransitionTs = 0;
let fullscreenTransitionTrackingBound = false;

function ensureFullscreenTransitionTracking() {
    if (fullscreenTransitionTrackingBound || typeof document === "undefined") {
        return;
    }

    const markFullscreenTransition = () => {
        fullscreenTransitionTs = Date.now();
    };

    document.addEventListener("fullscreenchange", markFullscreenTransition);
    document.addEventListener("webkitfullscreenchange", markFullscreenTransition);
    fullscreenTransitionTrackingBound = true;
}

function shouldIgnoreAdvanceInteraction() {
    return (Date.now() - fullscreenTransitionTs) < 320;
}

function getAdvanceInteractionTarget(gameInstance) {
    // `viewport` spans the full playable area (`#game-box`), while
    // `container` (`#game-container`) only contains scene nodes and can leave
    // non-interactive zones. Use viewport so tap/click-to-advance works
    // across the full visible game area on desktop and landscape devices.
    return gameInstance?.ui?.game?.viewport ?? gameInstance?.ui?.game?.container ?? null;
}

/**
 * Displays dialog text for a speaker and optionally waits for player input.
 * Supports translation keys (starting with @) for multi-language support.
 * Integrates with playback controls (skip/auto-play).
 * @param {{ data: { name: string } } | null} speaker
 * @param {string} [text=""] - Plain text or translation key (e.g., "@scene1.hello")
 * @param {boolean|Object} [wait=true] - Wait for input, or an options object
 * @param {Object} [params={}] - Parameters for {{param}} interpolation in translations
 * @returns {Promise<void>}
 */
function dialog(speaker, text = "", wait = true, params = {}) {
    ensureFullscreenTransitionTracking();

    // Abort if game has been ended (e.g., navigated away)
    if (getShouldAbortGame()) {
        console.warn("Attempted to show dialog after game was ended. Ignoring.", text);
        return Promise.resolve();
    }

    const id = incrementInstructionCount();
    const state = getState();
    const gameInstance = getGame();
    const gameSettings = getGameSettings();
    if ((state?.instruction_count ?? 0) > id) return;
    if (!gameInstance?.ui?.dialog || !gameInstance?.ui?.game) {
        return Promise.resolve();
    }

    // Handle options object as third parameter
    if (typeof wait === "object") {
        params = wait;
        wait = true;
    }

    // Translate text if it's a translation key
    let displayText = text;
    if (i18n && i18n.isTranslationKey(text)) {
        displayText = i18n.process(text, params);
    }

    const data = gameInstance.ui.dialog;
    if(speaker === null) {
        data.name.text("");
        data.message.text("");
        data.message.fire("update");
    }

    /**
     * Animates dialog text character-by-character.
     * @param {string} text
     * @returns {Promise<void>}
     */
    // Separate animation handler
    async function animateText(text, registerAbortCleanup) {
        return new Promise((resolve) => {
            let userSkipped = false;
            let time = 0;
            let completed = false;
            const interval = setInterval(() => {
                if (completed) {
                    clearInterval(interval);
                    return;
                }
                time++;
                if(time <= text.length) {
                    data.message.text(text.substring(0, time));
                } else {
                    completed = true;
                    clearInterval(interval);
                    cleanup();
                    resolve(userSkipped);
                }
            }, 50);

            const keyHandler = (e) => {
                if (shouldIgnoreAdvanceInteraction()) {
                    return;
                }
                if (completed) {
                    return;
                }
                completed = true;
                if(e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    userSkipped = true;
                    clearInterval(interval);
                    data.message.text(text);
                    cleanup();
                    resolve(userSkipped);
                }
            };

            const clickHandler = () => {
                if (shouldIgnoreAdvanceInteraction()) {
                    return;
                }
                if (completed) {
                    return;
                }
                completed = true;
                userSkipped = true;
                clearInterval(interval);
                data.message.text(text);
                cleanup();
                resolve(userSkipped);
            };

            function cleanup() {
                document.body.removeEventListener("keydown", keyHandler);
                getAdvanceInteractionTarget(gameInstance)?.off("click touchstart", clickHandler);
            }

            if (typeof registerAbortCleanup === "function") {
                registerAbortCleanup(() => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    clearInterval(interval);
                    cleanup();
                    resolve(true);
                });
            }

            document.body.addEventListener("keydown", keyHandler);
            getAdvanceInteractionTarget(gameInstance)?.on("click touchstart", clickHandler);
        });
    }

    // Separate wait handler
    async function waitForInput(skipIfNoInteraction = true, registerAbortCleanup) {
        return new Promise((resolve) => {
            // If skip mode enabled and user didn't skip animation, skip immediately
            if (skipIfNoInteraction && playback && playback.shouldSkip()) {
                setTimeout(() => resolve(), 100);
                return;
            }

            let completed = false;
            let autoPlayTimer = null;

            const keyHandler = (e) => {
                if (completed) return;
                if (shouldIgnoreAdvanceInteraction()) {
                    return;
                }
                if(e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    completed = true;
                    cleanup();
                    resolve();
                }
            };

            const clickHandler = () => {
                if (completed) return;
                if (shouldIgnoreAdvanceInteraction()) {
                    return;
                }
                completed = true;
                cleanup();
                resolve();
            };

            function cleanup() {
                document.body.removeEventListener("keydown", keyHandler);
                getAdvanceInteractionTarget(gameInstance)?.off("click touchstart", clickHandler);
                if (autoPlayTimer) clearTimeout(autoPlayTimer);
                if (playback) {
                    playback.isWaitingForInput = false;
                    playback.onDialogComplete(true);
                }
            }

            if (typeof registerAbortCleanup === "function") {
                registerAbortCleanup(() => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    cleanup();
                });
            }

            document.body.addEventListener("keydown", keyHandler);
            getAdvanceInteractionTarget(gameInstance)?.on("click touchstart", clickHandler);

            // Auto-play if enabled (and user didn't manually skip)
            if (skipIfNoInteraction && playback && playback.isAutoPlayActive()) {
                playback.isWaitingForInput = true;
                autoPlayTimer = setTimeout(() => {
                    if (!completed) {
                        completed = true;
                        cleanup();
                        resolve();
                    }
                }, playback.autoPlayDelay);
            }
        });
    }

    // Helper async function for dialog logic
    async function showDialog() {
        data.name.text(speaker?.data?.name ?? "");
    
        if(gameSettings && gameSettings["text_animation"]) {
            data.message.text("");
            data.message.fire("update");
            dispatchGameEvent(EVENTS.DIALOG, { speaker: speaker?.data?.name ?? null, text: displayText });
            
            return new Promise((resolve, reject) => {
                let aborted = false;
                let abortCleanup = () => {};

                const clearAbort = registerAbortHandler(setAbortInstruction, () => {
                    aborted = true;
                    abortCleanup();
                    reject(new Error("Dialog aborted"));
                });

                animateText(displayText, (cleanup) => {
                    abortCleanup = cleanup;
                }).then((skipped) => {
                    if (aborted) {
                        return;
                    }

                    if (!wait) {
                        clearAbort();
                        resolve();
                        return;
                    }

                    waitForInput(!skipped, (cleanup) => {
                        abortCleanup = cleanup;
                    }).then(() => {
                        if (aborted) {
                            return;
                        }
                        clearAbort();
                        resolve();
                    });
                });
            });
        } else {
            data.message.text(displayText);
            data.message.fire("update");
            dispatchGameEvent(EVENTS.DIALOG, { speaker: speaker?.data?.name ?? null, text: displayText });
            if(wait) {
                return new Promise((resolve, reject) => {
                    // Check skip mode first - if enabled, auto-advance
                    if (playback && playback.shouldSkip()) {
                        setTimeout(() => resolve(), 100); // Minimal delay for skip
                        return;
                    }

                    let autoPlayTimer = null;
                    let completed = false;

                    const keyHandler = (e) => {
                        if (completed) return;
                        if (shouldIgnoreAdvanceInteraction()) {
                            return;
                        }
                        if(e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            completed = true;
                            clearAbort();
                            cleanup();
                            resolve();
                        }
                    };

                    const clickHandler = () => {
                        if (completed) return;
                        if (shouldIgnoreAdvanceInteraction()) {
                            return;
                        }
                        completed = true;
                        clearAbort();
                        cleanup();
                        resolve();
                    };

                    function cleanup() {
                        document.body.removeEventListener("keydown", keyHandler);
                        target.off("click touchstart", clickHandler);
                        if (autoPlayTimer) {
                            clearTimeout(autoPlayTimer);
                            autoPlayTimer = null;
                        }

                        if (playback) {
                            playback.isWaitingForInput = false;
                            playback.onDialogComplete(true);
                        }
                    }

                    const clearAbort = registerAbortHandler(setAbortInstruction, () => {
                        completed = true;
                        cleanup();
                        reject(new Error("Dialog aborted"));
                    });

                    document.body.addEventListener("keydown", keyHandler);
                    const target = getAdvanceInteractionTarget(gameInstance);
                    target?.on("click touchstart", clickHandler);

                    // Auto-play handling
                    if (playback && playback.isAutoPlayActive()) {
                        playback.isWaitingForInput = true;
                        autoPlayTimer = setTimeout(() => {
                            if (!completed) {
                                completed = true;
                                clearAbort();
                                cleanup();
                                resolve();
                            }
                        }, playback.autoPlayDelay);
                    }
                });
            }
        }
    }

    return showDialog();
}

/**
 * Switches execution to the provided scene and resets instruction counters.
 * @param {Function} scene
 */
function next(scene, targetSceneName = "") {
    if (getShouldAbortGame()) {
        console.warn("Attempted to switch scenes after game was ended. Ignoring.");
        return;
    }

    if (typeof scene !== "function") {
        console.warn("Attempted to switch to a non-callable scene. Ignoring.");
        return;
    }

    const hintedSceneName = typeof targetSceneName === "string" ? targetSceneName.trim() : "";
    const metadataSceneName = typeof scene.__sceneName === "string" ? scene.__sceneName.trim() : "";
    const functionSceneName = typeof scene.name === "string" ? scene.name.trim() : "";
    const nextSceneName = hintedSceneName || metadataSceneName || functionSceneName;

    setAbortInstruction(() => {});

    const gameInstance = getGame();
    gameInstance?.ui?.game?.end?.visible(false);
    gameInstance?.ui?.game?.stopEndingSequence?.({ showEnd: false });
    gameInstance?.ui?.game?.loading?.visible(false);

    const previousSceneName = getActiveScene();
    const currentChapter = chapters.getCurrentChapter() ?? chapters.getByScene(previousSceneName);
    const nextChapter = nextSceneName ? chapters.getByScene(nextSceneName) : null;

    if (currentChapter && nextChapter && currentChapter.id !== nextChapter.id) {
        chapters.completeChapter(currentChapter.id).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[GameUtils] Failed to persist chapter completion on scene transition",
                context: {
                    scope: "game-utils",
                    action: "next",
                    fromScene: previousSceneName,
                    toScene: nextSceneName,
                    chapterId: currentChapter.id
                }
            });
        });
    }

    if (nextSceneName) {
        setActiveScene(nextSceneName);
        chapters.startChapterForScene(nextSceneName, {
            resetOnMiss: false,
            preserveCurrent: !nextChapter
        });
    }

    setInstructionCount(0);
    const state = getState();
    if (state) {
        state.instruction_count = 0;
    }
    scene();
}

/**
 * Prompts the player for a text input.
 * Supports translation keys (starting with @) for multi-language support.
 * @param {string} message - Plain text or translation key (e.g., "@scene1.namePrompt")
 * @param {string | undefined} [placeholder=undefined] - Placeholder text or translation key
 * @param {Object} [params={}] - Parameters for {{param}} interpolation
 * @returns {Promise<string>}
 */
function input(message, placeholder = undefined, params = {}) {
    ensureFullscreenTransitionTracking();

    // Abort if game has been ended (e.g., navigated away)
    if (getShouldAbortGame()) {
        console.warn("Attempted to show input prompt after game was ended. Ignoring.");
        return Promise.resolve("");
    }

    const id = setInstructionCount(getInstructionCount() + 1);
    const state = getState();
    const activeScene = getActiveScene();
    if ((state?.instruction_count ?? 0) > id) {
        // Return a resolved Promise with the stored value for consistency
        return Promise.resolve(state?.history?.[`${activeScene}-${id}`] ?? "");
    }

    // Translate message and placeholder if they're translation keys
    let displayMessage = message;
    let displayPlaceholder = placeholder;
    if (i18n) {
        if (i18n.isTranslationKey(message)) {
            displayMessage = i18n.process(message, params);
        }
        if (placeholder && i18n.isTranslationKey(placeholder)) {
            displayPlaceholder = i18n.process(placeholder, params);
        }
    }

    return new Promise((resolve, reject) => {
        // Skip mode: auto-submit with placeholder value
        if (playback && playback.shouldSkip()) {
            const defaultValue = displayPlaceholder ?? "Enter something...";
            if (state) {
                state.history = state.history || {};
                state.history[`${activeScene}-${id}`] = defaultValue;
            }
            dispatchGameEvent(EVENTS.INPUT, { message: displayMessage, value: defaultValue });
            setTimeout(() => resolve(defaultValue), 50); // Minimal delay
            return;
        }

        const config = getConfiguration();
        const proceedBtn = document.createElement("button");
        proceedBtn.innerText = "Continue";
        proceedBtn.className = "btn hover:bg-inherit border-0";
        proceedBtn.style.backgroundColor = config?.colors?.primary || "#000";
        proceedBtn.style.color = config?.colors?.["primary-text"] || "#fff";
        
        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = displayPlaceholder ?? "Enter something...";
        inp.className = "w-full input rounded-full input-bordered border-2";
        inp.style.borderColor = config?.colors?.primary || "#000";
        inp.style.backgroundColor = "transparent";
        inp.style.color = config?.colors?.text || "#fff";

        const wasFullscreenBeforeInput = isFullscreenActive(document);
        let userExitedFullscreen = false;
        setIsInputFocused(true);

        const alertwin = new AlertWindow(displayMessage, [proceedBtn], config, "input", { input: inp });
        if (!alertwin) {
            errorTracking?.captureError("Failed to create AlertWindow", {
                message: "[GameUtils] Failed to create AlertWindow",
                context: { scope: "game-utils", action: "input" }
            });
            throw new Error("Failed to create AlertWindow");
        }
        alertwin.btns.classList.replace("justify-between", "justify-end");

        const isPortrait = getIsPortrait();
        let documentClickHandler = null;
        let fullscreenChangeHandler = null;

        const cleanupInputHandlers = () => {
            if (documentClickHandler) {
                document.removeEventListener("click", documentClickHandler, true);
                documentClickHandler = null;
            }
            if (fullscreenChangeHandler) {
                document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
                document.removeEventListener("webkitfullscreenchange", fullscreenChangeHandler);
                fullscreenChangeHandler = null;
            }
            inp.onblur = null;
        };

        const clearAbort = registerAbortHandler(setAbortInstruction, () => {
            rejectWithAbortCleanup({
                cleanup: cleanupInputHandlers,
                closeAlert: () => alertwin.close(),
                setInputFocused: setIsInputFocused,
                reject,
                errorMessage: "Input aborted"
            });
        });

        // Track if user manually exits fullscreen
        fullscreenChangeHandler = () => {
            const isCurrentlyFullscreen = isFullscreenActive(document);
            if (wasFullscreenBeforeInput && !isCurrentlyFullscreen) {
                userExitedFullscreen = true;
            }
        };
        document.addEventListener("fullscreenchange", fullscreenChangeHandler);
        document.addEventListener("webkitfullscreenchange", fullscreenChangeHandler);

        if(isPortrait) {
            inp.onblur = () => {
                setIsInputFocused(true);
            };

            documentClickHandler = (e) => {
                if(e.target?.tagName !== "INPUT") {
                    inp.blur();
                }
            };
            document.addEventListener("click", documentClickHandler, true);
        }

        async function submitInput() {
            if(inp.value !== "") {
                alertwin.close();
                alertwin.btns.classList.replace("justify-end", "justify-between");
                if (state) {
                    state.history = state.history || {};
                    state.history[`${activeScene}-${id}`] = inp.value;
                }
                dispatchGameEvent(EVENTS.INPUT, { message: displayMessage, value: inp.value });

                try {
                    await restoreFullscreen({
                        wasFullscreenBefore: wasFullscreenBeforeInput,
                        userExitedFullscreen,
                        doc: document,
                        onError: () => {
                            errorTracking?.captureError("Failed to restore fullscreen after input", {
                                message: "[GameUtils] Failed to restore fullscreen after input",
                                context: { scope: "game-utils", action: "input" }
                            });
                        }
                    });
                } finally {
                    cleanupInputHandlers();
                    setIsInputFocused(false);
                    clearAbort();
                }

                await new Promise((resolveNextFrame) => requestAnimationFrame(resolveNextFrame));
                resolve(inp.value);
            }
        }

        inp.onkeydown = (e) => {
            if(e.key === "Enter") {
                if(isPortrait) {
                    inp.blur();
                } else {
                    void submitInput();
                }
            }
        };
        
        proceedBtn.onclick = () => {
            void submitInput();
        };

        alertwin.show();
        inp.select();
    });
}

/**
 * Shows a choice prompt and resolves with the selected option.
 * Supports translation keys (starting with @) for multi-language support.
 * @param {string} message - Plain text or translation key
 * @param {string[]} opts - Array of options (plain text or translation keys)
 * @param {Object} [params={}] - Parameters for {{param}} interpolation
 * @returns {Promise<string>}
 */
function choice(message, opts, params = {}) {
    // Abort if game has been ended (e.g., navigated away)
    if (getShouldAbortGame()) {
        console.warn("Attempted to show choice prompt after game was ended. Ignoring.");
        return Promise.resolve("");
    }

    const id = setInstructionCount(getInstructionCount() + 1);
    const state = getState();
    const activeScene = getActiveScene();
    if ((state?.instruction_count ?? 0) > id) {
        return Promise.resolve(state?.history?.[`${activeScene}-${id}`] ?? "");
    }

    // Translate message if it's a translation key
    let displayMessage = message;
    if (i18n && i18n.isTranslationKey(message)) {
        displayMessage = i18n.process(message, params);
    }

    // Translate options if they're translation keys
    const displayOpts = opts.map(opt => {
        if (i18n && i18n.isTranslationKey(opt)) {
            return i18n.process(opt, params);
        }
        return opt;
    });

    return new Promise((resolve, reject) => {
        const config = getConfiguration();
        const proceedBtn = document.createElement("button");
        proceedBtn.innerText = "Continue";
        proceedBtn.className = "btn hover:bg-inherit border-0";
        proceedBtn.style.backgroundColor = config?.colors?.primary || "#000";
        proceedBtn.style.color = config?.colors?.["primary-text"] || "#fff";
    
        const choices = new ChoiceMenu({
            label: "Choices",
            id: "choices",
            options: displayOpts,
            onchange: () => {
            }
        });

        const choicesElem = choices.element;

        setIsInputFocused(true);

        const wasFullscreenBeforeChoice = isFullscreenActive(document);
        let userExitedFullscreen = false;

        const alertwin = new AlertWindow(displayMessage, [proceedBtn], config, "choice", { opts: choicesElem });
        alertwin.btns.classList.replace("justify-between", "justify-end");

        // Track if user manually exits fullscreen
        const fullscreenChangeHandler = () => {
            const isCurrentlyFullscreen = isFullscreenActive(document);
            if (wasFullscreenBeforeChoice && !isCurrentlyFullscreen) {
                userExitedFullscreen = true;
            }
        };
        document.addEventListener("fullscreenchange", fullscreenChangeHandler);
        document.addEventListener("webkitfullscreenchange", fullscreenChangeHandler);

        const cleanupChoiceHandlers = () => {
            document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
            document.removeEventListener("webkitfullscreenchange", fullscreenChangeHandler);
        };

        const clearAbort = registerAbortHandler(setAbortInstruction, () => {
            rejectWithAbortCleanup({
                cleanup: cleanupChoiceHandlers,
                closeAlert: () => alertwin.close(),
                setInputFocused: setIsInputFocused,
                reject,
                errorMessage: "Choice aborted"
            });
        });

        async function submitChoice() {
            const selected = choicesElem.querySelector("input[name=\"choices-radio\"]:checked");
            if (!selected) {
                return;
            }
            const value = selected.value;
            alertwin.close();
            alertwin.btns.classList.replace("justify-end", "justify-between");

            try {
                await restoreFullscreen({
                    wasFullscreenBefore: wasFullscreenBeforeChoice,
                    userExitedFullscreen,
                    doc: document,
                    onError: () => {
                        errorTracking?.captureError("Failed to restore fullscreen after choice", {
                            message: "[GameUtils] Failed to restore fullscreen after choice",
                            context: { scope: "game-utils", action: "choice" }
                        });
                    }
                });
            } finally {
                cleanupChoiceHandlers();
                setIsInputFocused(false);
                clearAbort();
            }

            await new Promise((resolveNextFrame) => requestAnimationFrame(resolveNextFrame));

            if (state) {
                state.history = state.history || {};
                state.history[`${activeScene}-${id}`] = value;
            }
            dispatchGameEvent(EVENTS.CHOICE, { message: displayMessage, value });
            resolve(value);
        }

        proceedBtn.onclick = () => {
            void submitChoice();
        };

        alertwin.show();

        choices.onappend();
    });
}

/**
 * Story-state scoped persistence adapter.
 * Delegates to the wrapped storyDb API from runtime-state.
 * @type {{
 *   setItem: (key: string, value: any) => Promise<void>,
 *   getItem: (key: string) => Promise<any>,
 *   removeItem: (key: string) => Promise<void>,
 *   clear: () => Promise<void>,
 *   key: (index: number) => Promise<string | null>,
 *   readonly length: number
 * }}
 */
const storage = getStoryDb();

/**
 * Shows the end screen UI layer.
 */
function end() {
    const gameInstance = getGame();
    const config = getConfiguration();
    const endConfig = config?.ui?.end ?? {};
    const endMode = endConfig?.mode === "credits-then-end" ? "credits-then-end" : "end-only";
    const activeScene = getActiveScene();
    let chapterId = chapters.getCurrentChapter()?.id ?? null;

    if (!chapterId) {
        const sceneChapter = chapters.getByScene(activeScene);
        if (sceneChapter) {
            chapterId = sceneChapter.id;

            if (chapters.getMode() === "progressive" && !chapters.isUnlocked(sceneChapter.id)) {
                const chapterMap = chapters.getMap();
                const sceneChapterIndex = chapterMap.findIndex((chapter) => chapter.id === sceneChapter.id);
                if (sceneChapterIndex > 0) {
                    const nearestUnlocked = [...chapterMap.slice(0, sceneChapterIndex)]
                        .reverse()
                        .find((chapter) => chapter.unlocked);
                    chapterId = nearestUnlocked?.id ?? chapterId;
                }
            }
        }
    }

    if (endMode === "credits-then-end" && typeof gameInstance?.ui?.game?.playEndingSequence === "function") {
        void gameInstance.ui.game.playEndingSequence({
            creditsDurationMs: endConfig?.creditsDurationMs,
            endHoldMs: endConfig?.endHoldMs,
            allowSkip: endConfig?.allowSkip !== false
        });
    } else {
        gameInstance?.ui?.game?.end?.visible(true);
    }

    const completionPromise = chapterId
        ? chapters.completeChapter(chapterId)
        : chapters.completeCurrentChapter();

    completionPromise.catch((error) => {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[GameUtils] Failed to persist chapter completion",
            context: { scope: "game-utils", action: "end", chapterId }
        });
    });

    dispatchGameEvent(EVENTS.GAME_COMPLETED, {
        scene: activeScene,
        chapterId,
        completionPersistedInEnd: true
    });
}

/**
 * Global loading indicator controller.
 */
const loading = {
    start() {
        const gameInstance = getGame();
        gameInstance?.ui?.animations?.loading?.start();
        gameInstance?.ui?.game?.loading?.visible(true);
    },
    stop() {
        const gameInstance = getGame();
        gameInstance?.ui?.game?.loading?.visible(false);
        gameInstance?.ui?.animations?.loading?.stop();
    }
};

/**
 * 
 * @param {number} time - seconds
 */
function wait(time) {
    if (getShouldAbortGame()) {
        return Promise.resolve();
    }

    const id = setInstructionCount(getInstructionCount() + 1);
    const state = getState();
    if ((state?.instruction_count ?? 0) > id) {
        return;
    }
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, time*1000);
    });
}

export { dialog, next, loading, input, choice, storage, end, wait };