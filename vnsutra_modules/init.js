// Import core modules
import "./konva.js";
import { konvaStage } from "./stage.js";
import { loadJSON, loadFonts } from "./utils.js";
import storage from "./storage.js";
import errorTracking from "./error-tracking.js";
import performanceMonitor from "./performance.js";
import chapters from "./chapters.js";
import { buildLoadEventSignature, buildSceneStartSignature, isRapidDuplicate } from "./scene-transition-utils.js";
import { isFullscreenActive, restoreFullscreenIfNeeded } from "./fullscreen-utils.js";
import { isDevelopment, initializeSecuritySettings } from "./global.js";
import { checkPortrait, mobileCheck } from "./mobile/ui.js";
import { EVENTS, STORAGE_KEYS } from "./constants.js";
import {
    getActiveLayer,
    setActiveLayer,
    getActiveScene,
    setActiveScene,
    getInstructionCount,
    getState,
    setState,
    setInstructionCount,
    setConfiguration,
    getIsPortrait,
    setIsPortrait,
    setIsAndroid,
    getIsAndroid,
    setResizeSuppressedUntil,
    getGameSettings,
    setExitApp,
    getGame,
    setGame,
    getBgm,
    getGameKeyboardActions,
    getOpenWindow,
    setOpenWindow,
    getIsInputFocused,
    getResizeSuppressedUntil,
    setShouldAbortGame,
    getAbortInstruction
} from "./runtime-state.js";
import { openBar, closeBar } from "./ui/utils.js";

const Konva = globalThis.Konva;

const loadwin = document.getElementById("loadwin"),
    loadimg = loadwin?.querySelector?.("#loadimg") ?? null,
    loadtitle = loadwin?.querySelector?.("#loadtitle") ?? null,
    loadstatus = loadwin?.querySelector?.("#loadstatus") ?? null,
    loadspin = loadwin?.querySelector?.("#loadspin") ?? null;

// Disclaimer cache for performance
const disclaimerCache = { content: null, loading: null, loaded: false };

const moduleCache = {};

const moduleLoaders = {
    autosave: () => import("./autosave.js"),
    splash: () => import("./splash.js"),
    "disclaimer-window": () => import("./disclaimer.js"),
    keyboard: () => import("./keyboard.js"),
    accessibility: () => import("./accessibility.js"),
    gestures: () => import("./gestures.js"),
    achievements: () => import("./achievements.js"),
    "playback-controls": () => import("./playback-controls.js"),
    "alert-window": () => import("./alert-window.js"),
    home: () => import("./home.js"),
    gameui: () => import("./gameui.js"),
    game: () => import("./game.js")
};

async function loadModule(cacheKey, loader) {
    if (!moduleCache[cacheKey]) {
        moduleCache[cacheKey] = loader();
    }
    return moduleCache[cacheKey];
}

const loadDefaultModule = (cacheKey) => loadModule(cacheKey, async () => {
    const loader = moduleLoaders[cacheKey];
    if (typeof loader !== "function") {
        throw new Error(`[Init] Unknown lazy module key: ${cacheKey}`);
    }
    const mod = await loader();
    return mod.default;
});

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
        // eslint-disable-next-line no-console
        console.log(`[Chapters][Debug] ${message}`);
        return;
    }

    // eslint-disable-next-line no-console
    console.log(`[Chapters][Debug] ${message}`, context);
}

const loadUiUtilsModule = () => loadModule("ui-utils", () => import("./ui/utils.js"));

const HISTORY_STATE_FLAG = "__vnsutra";

function preloadDisclaimer(config) {
    if (!config?.ui?.disclaimer?.enabled || disclaimerCache.loaded) {
        return;
    }

    disclaimerCache.loading = (async () => {
        try {
            const path = config.ui.disclaimer.path;
            if (!path) {
                console.warn("[Init] Disclaimer path missing");
                return null;
            }

            const response = await fetch(path);
            if (!response.ok) {
                console.warn(`[Init] Failed to fetch disclaimer: ${response.status} ${response.statusText}`);
                return null;
            }

            const markdown = await response.text();
            disclaimerCache.content = markdown;
            disclaimerCache.loaded = true;
            return markdown;
        } catch (error) {
            console.error("[Init] Disclaimer preload error:", error);
            disclaimerCache.loaded = true;
            return null;
        }
    })();
}

function initializeHotReloadClient() {
    if (!isDevelopment()) {
        return;
    }

    const protocol = globalThis.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://localhost:3001`);

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "reload") {
                // eslint-disable-next-line no-console
                console.log("[Hot Reload] Reloading due to:", data.file);
                globalThis.location.reload();
            }
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Hot Reload] Invalid message",
                context: { scope: "hot-reload" }
            });
        }
    };

    socket.onerror = () => {
        errorTracking?.captureError("Unable to connect to ws://localhost:3001", {
            type: "warning",
            message: "[Hot Reload] Unable to connect to ws://localhost:3001",
            context: { scope: "hot-reload" }
        });
    };
}

function initializeAriaSupport() {
    const alertWin = document.getElementById("alert-win");
    const alertCard = document.getElementById("alert-card");
    const alertMessage = document.getElementById("alert-message");
    const loadStatus = document.getElementById("loadstatus");

    alertWin?.setAttribute("aria-hidden", alertWin.classList.contains("hidden") ? "true" : "false");
    alertCard?.setAttribute("tabindex", "-1");
    alertMessage?.setAttribute("aria-live", "polite");
    loadStatus?.setAttribute("role", "status");
}

function isInputDebugEnabled() {
    if (typeof globalThis === "undefined") {
        return false;
    }

    const globalFlag = globalThis.VNSUTRA_DEBUG_INPUT;
    if (globalFlag === true || globalFlag === 1 || globalFlag === "1" || globalFlag === "true") {
        return true;
    }

    try {
        const stored = globalThis.localStorage?.getItem?.("vnsutra-debug-input");
        return stored === "1" || stored === "true";
    } catch {
        return false;
    }
}

function logInputDebug(message, context = undefined) {
    if (!isInputDebugEnabled()) {
        return;
    }

    if (context === undefined) {
        // eslint-disable-next-line no-console
        console.log(`[Input][Debug] ${message}`);
        return;
    }

    // eslint-disable-next-line no-console
    console.log(`[Input][Debug] ${message}`, context);
}

function isResizeDebugEnabled() {
    if (typeof globalThis === "undefined") {
        return false;
    }

    const globalFlag = globalThis.VNSUTRA_DEBUG_RESIZE;
    if (globalFlag === true || globalFlag === 1 || globalFlag === "1" || globalFlag === "true") {
        return true;
    }

    try {
        const stored = globalThis.localStorage?.getItem?.("vnsutra-debug-resize");
        return stored === "1" || stored === "true";
    } catch {
        return false;
    }
}

function logResizeDebug(message, context = undefined) {
    if (!isResizeDebugEnabled()) {
        return;
    }

    if (context === undefined) {
        // eslint-disable-next-line no-console
        console.log(`[Resize][Debug] ${message}`);
        return;
    }

    // eslint-disable-next-line no-console
    console.log(`[Resize][Debug] ${message}`, context);
}

const defaultAchievementDefinitions = [
    {
        id: "story.identity",
        title: "Identity Established",
        description: "Enter your name once.",
        target: 1
    },
    {
        id: "story.first-choice",
        title: "First Decision",
        description: "Make your first choice in the story.",
        target: 1
    },
    {
        id: "story.dialog-reader",
        title: "Patient Reader",
        description: "Read 20 dialogue lines.",
        target: 20
    },
    {
        id: "story.chapter-complete",
        title: "Introduction Complete",
        description: "Finish the starter chapter.",
        target: 1
    }
];

async function loadAchievementDefinitions() {
    try {
        const response = await fetch("../game/achievements.json");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const definitions = await response.json();
        if (!Array.isArray(definitions)) {
            throw new Error("Invalid achievements format");
        }

        return definitions;
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[Achievements] Failed to load external definitions. Using defaults",
            context: { scope: "init", subsystem: "achievements" }
        });
        return defaultAchievementDefinitions;
    }
}

async function loadChapterDefinitions(config) {
    const chaptersPath = config?.ui?.chapters?.path;

    if (!chaptersPath || typeof chaptersPath !== "string") {
        if (config?.ui?.chapters?.enabled) {
            errorTracking?.captureError("Chapter definitions path not configured", {
                type: "warning",
                message: "[Chapters] Missing chapters path. Using empty definitions",
                context: { scope: "init", subsystem: "chapters" }
            });
        }
        return [];
    }

    try {
        const response = await fetch(chaptersPath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const definitions = await response.json();
        if (!Array.isArray(definitions)) {
            throw new Error("Invalid chapters format");
        }

        return definitions;
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[Chapters] Failed to load external definitions. Using empty definitions",
            context: { scope: "init", subsystem: "chapters", path: chaptersPath }
        });
        return [];
    }
}

(async () => {
    if (!loadwin || !loadimg || !loadtitle || !loadstatus || !loadspin) {
        errorTracking?.captureError("Init elements not available", {
            message: "[Init] Required DOM elements missing",
            context: { scope: "init" }
        });
        return;
    }

    initializeHotReloadClient();
    initializeAriaSupport();

    if ("wakeLock" in navigator && "request" in navigator.wakeLock) {
        let wakeLock = null;
        const requestWakeLock = async () => {
            try {
                wakeLock = await navigator.wakeLock.request("screen");
                wakeLock.addEventListener("release", () => {
                    wakeLock = null;
                });
            } catch (error) {
                wakeLock = null;
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[WakeLock] Failed to acquire",
                    context: { scope: "init", subsystem: "wakelock" }
                });
            }
        };
        
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                requestWakeLock();
            }
        };

        requestWakeLock();
        
        document.addEventListener("visibilitychange", handleVisibilityChange);
        document.addEventListener("fullscreenchange", handleVisibilityChange);
    }

    let displayMode = "browser tab";
    if (globalThis.matchMedia("(display-mode: standalone)").matches) {
        displayMode = "standalone";
    }

    if (globalThis.matchMedia("(display-mode: fullscreen)").matches) {
        displayMode = "fullscreen";
    }

    if(displayMode === "standalone") {
        setExitApp(() => {
            globalThis.closeApp?.() || globalThis.close();
        });
    }

    if(displayMode === "fullscreen") {
        setExitApp(() => {
            if (globalThis.closeApp) {
                globalThis.closeApp();
                return;
            }
            document.exitFullscreen();
            setTimeout(() => {
                if (globalThis.matchMedia("(display-mode: standalone)").matches) {
                    globalThis.closeApp?.() || globalThis.close();
                } else {
                    globalThis.closeApp?.() || history.back();
                }
            }, 100);
        });
    }

    const modes = ["standalone", "fullscreen", "minimal-ui"];

    modes.forEach(mode => {
        const media = globalThis.matchMedia(`(display-mode: ${mode})`);
        media.onchange = () => {
            if (media.matches) {
                onDisplayModeChange(mode);
            }
        };
    });

    function onDisplayModeChange(mode) {
        if(mode === "standalone") {
            setExitApp(() => {
                globalThis.closeApp?.() || globalThis.close();
            });
        } else if(mode === "fullscreen") {
            setExitApp(() => {
                if (globalThis.closeApp) {
                    globalThis.closeApp();
                    return;
                }
                document.exitFullscreen();
                setTimeout(() => {
                    if (globalThis.matchMedia("(display-mode: standalone)").matches) {
                        globalThis.closeApp?.() || globalThis.close();
                    } else {
                        globalThis.closeApp?.() || history.back();
                    }
                }, 100);
            });
        } else {
            setExitApp(() => {
                globalThis.closeApp?.() || history.back();
            });
        }
    }

    const CONFIG = await loadJSON("../game/config.json");
    if (!CONFIG || CONFIG === 404) {
        errorTracking?.captureError("Config not available", {
            message: "[Init] Failed to load config",
            context: { scope: "init", path: "../game/config.json" }
        });
        return;
    }
    setConfiguration(CONFIG);
    setIsAndroid(mobileCheck());
    setIsPortrait(checkPortrait());

    const chapterDefinitions = await loadChapterDefinitions(CONFIG);
    const chaptersEnabled = Boolean(CONFIG?.ui?.chapters?.enabled) && chapterDefinitions.length > 0;

    await chapters.configure({
        enabled: chaptersEnabled,
        mode: CONFIG?.ui?.chapters?.mode ?? "all",
        chapters: chapterDefinitions
    }).catch((error) => {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[Init] Failed to configure chapters",
            context: { scope: "init", subsystem: "chapters" }
        });
    });

    // Preload disclaimer in background for faster display later
    preloadDisclaimer(CONFIG);

    // Install App utility (browser only, not standalone/fullscreen)
    let deferredPrompt = null;
    const installPromptId = "install-app-utility";
    const isStandalone = globalThis.matchMedia("(display-mode: standalone)").matches;
    const isFullscreen = globalThis.matchMedia("(display-mode: fullscreen)").matches;

    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        // eslint-disable-next-line no-console
        console.log("[Init] beforeinstallprompt event captured");
        deferredPrompt = e;
        maybeShowInstallPrompt();
    });

    function maybeShowInstallPrompt() {
        const prompt = document.getElementById(installPromptId);
        if (isStandalone || isFullscreen || !deferredPrompt) {
            if (prompt) prompt.classList.replace("flex", "hidden");
            return;
        }
        if (!prompt) return;
        prompt.querySelector("img")?.setAttribute("src", CONFIG.icon);
        prompt.classList.replace("hidden", "flex");
        const installBtn = prompt.querySelector("#install-app-btn");
        const closeBtn = prompt.querySelector("#install-app-close");
        if (installBtn) {
            installBtn.onclick = async () => {
                prompt.classList.replace("flex", "hidden");
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                prompt.classList.replace("flex", "hidden");
            };
        }
        if (closeBtn) {
            closeBtn.onclick = () => {
                prompt.classList.replace("flex", "hidden");
            };
        }
    }

    // Hide prompt if mode changes
    ["fullscreenchange", "webkitfullscreenchange"].forEach(evt => {
        document.addEventListener(evt, () => {
            maybeShowInstallPrompt();
        });
    });
    globalThis.matchMedia("(display-mode: standalone)").addEventListener("change", maybeShowInstallPrompt);
    globalThis.matchMedia("(display-mode: fullscreen)").addEventListener("change", maybeShowInstallPrompt);

    const isPortraitCompatible = CONFIG?.ui?.["portrait-compatible"] !== false;
    const portraitBlockMessage = CONFIG?.ui?.["portrait-block-message"] ?? "This story supports landscape mode only. Please rotate your device.";
    let hasStarted = false;
    let isDataLoaded = false;
    let isNewGame = false;
    let disclaimerShown = false;
    let isSplashRunning = false;
    let isSplashCompleted = false;
    let hasPrewarmedUi = false;
    let autoSave = null;
    let keyboardControls = null;
    let accessibility = null;
    let gestures = null;
    let achievements = null;
    let playbackControls = null;

    const ensureAutoSave = async () => {
        if (autoSave) {
            return autoSave;
        }
        autoSave = await loadDefaultModule("autosave");
        return autoSave;
    };

    const startSplashIfNeeded = () => {
        if (isSplashRunning || isSplashCompleted) {
            return;
        }

        isSplashRunning = true;
        loadDefaultModule("splash")
            .then((playSplashSequence) => playSplashSequence({ config: CONFIG, loadwin, loadspin, loadstatus }))
            .catch((error) => {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Init] Splash sequence failed",
                    context: { scope: "init", subsystem: "splash" }
                });
            })
            .finally(() => {
                isSplashCompleted = true;
                isSplashRunning = false;
                refreshPortraitCompatibilityUI();
            });
    };

    // Kick splash early so it starts while initialization continues
    startSplashIfNeeded();

    const isPortraitMode = () => checkPortrait();

    async function showDisclaimer() {
        try {
            const disclaimerConfig = CONFIG?.ui?.disclaimer;
            if (!disclaimerConfig?.enabled) {
                return false;
            }

            const disclaimerPath = disclaimerConfig.path;
            if (!disclaimerPath) {
                return false;
            }

            const DisclaimerWindow = await loadDefaultModule("disclaimer-window");
            const uiUtils = await loadUiUtilsModule();
            const disclaimerWindow = new DisclaimerWindow(CONFIG);

            // Fetch markdown content
            let markdown = disclaimerCache.content;
            if (!markdown) {
                try {
                    const response = await fetch(disclaimerPath);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    markdown = await response.text();
                    disclaimerCache.content = markdown;
                } catch (error) {
                    errorTracking?.captureError(error, {
                        type: "warning",
                        message: "Failed to fetch disclaimer",
                        context: { scope: "init", path: disclaimerPath }
                    });
                    
                    // Show error modal
                    await disclaimerWindow.showError("Could not load disclaimer.");
                    return true;
                }
            }

            // Convert markdown to HTML
            const html = uiUtils.markdownToHtml(markdown);

            // Show disclaimer modal
            await disclaimerWindow.show(html);
            return true;
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "Failed to display disclaimer",
                context: { scope: "init", subsystem: "disclaimer" }
            });
            return false;
        }
    }

    function bindStartPrompt() {
        loadstatus.innerText = "Click To Start";
        loadspin.classList.add("hidden");
        loadstatus.classList.remove("hidden");

        document.onclick = (e) => {
            // if inside the install prompt, ignore the click to start the game
            if (e.target && (e.target.closest("#install-app-utility") || e.target.id === "install-app-utility")) {
                return;
            }

            if (!isPortraitCompatible && isPortraitMode()) {
                showPortraitBlockNotice();
                return;
            }

            hasStarted = true;
            
            // Hide splash immediately before any async operations
            loadwin.classList.add("hidden");
            
            // Show home page immediately (don't wait for GAME_RESIZE)
            if (pages.home) {
                navigate("home", {});
            } else {
                // Fallback: if prewarm is still in progress, force a resize build now.
                globalThis.dispatchEvent(new CustomEvent(EVENTS.GAME_RESIZE));
            }
        
            // Request fullscreen (async, doesn't block UI)
            document.documentElement.requestFullscreen().catch(() => {
                // Fullscreen request might fail on some browsers
            });
        
            // Dispatch resize after fullscreen processes
            setTimeout(() => {
                globalThis.dispatchEvent(new CustomEvent(EVENTS.GAME_RESIZE));
            }, 250);
            
            document.onclick = () => {};
        };
    }

    function showPortraitBlockNotice() {
        loadstatus.innerText = portraitBlockMessage;
        loadspin.classList.add("hidden");
        loadstatus.classList.remove("hidden");
        loadwin.classList.remove("hidden");
        document.onclick = () => {};
    }

    function refreshPortraitCompatibilityUI() {
        if (!isDataLoaded || hasStarted) {
            return;
        }

        if (!isPortraitCompatible && isPortraitMode()) {
            showPortraitBlockNotice();
            return;
        }

        if (!isSplashCompleted) {
            startSplashIfNeeded();
            return;
        }

        if (!hasPrewarmedUi) {
            hasPrewarmedUi = true;
            // Build Konva pages behind the splash so first click can render instantly.
            globalThis.dispatchEvent(new CustomEvent(EVENTS.GAME_RESIZE));
        }

        bindStartPrompt();
    }

    globalThis.addEventListener(EVENTS.DATA_LOADED, () => {
        isDataLoaded = true;
        refreshPortraitCompatibilityUI();
    });

    // Initialize storage module explicitly
    try {
        await storage.initialize();
        // eslint-disable-next-line no-console
        console.log("[Init] Storage initialized successfully");
    } catch (error) {
        errorTracking?.captureError(error, {
            message: "[Init] Storage initialization failed",
            context: { scope: "init", subsystem: "storage" }
        });
    }

    if (errorTracking) {
        const trackingConfig = CONFIG?.monitoring?.errorTracking ?? {};
        errorTracking.configure({
            projectName: CONFIG["project-name"] ?? "vnsutra",
            release: CONFIG.version ?? "unknown",
            endpoint: trackingConfig.endpoint,
            enableReporting: Boolean(trackingConfig.enableReporting),
            maxEntries: trackingConfig.maxEntries
        });
        // Load logged errors from storage asynchronously
        if (errorTracking.loadLogsAsync) {
            await errorTracking.loadLogsAsync().catch((err) => {
                errorTracking?.captureError(err, {
                    type: "warning",
                    message: "[Init] Failed to load error logs",
                    context: { scope: "init", subsystem: "error-tracking" }
                });
            });
        }
    }

    if (performanceMonitor) {
        const performanceConfig = CONFIG?.monitoring?.performance ?? {};
        performanceMonitor.configure({
            enabled: performanceConfig.enabled !== false,
            maxEntries: performanceConfig.maxEntries,
            fpsSampleInterval: performanceConfig.fpsSampleInterval,
            memorySampleInterval: performanceConfig.memorySampleInterval
        });
        // Load stored metrics asynchronously
        if (performanceMonitor.restoreAsync) {
            await performanceMonitor.restoreAsync().catch((err) => {
                errorTracking?.captureError(err, {
                    type: "warning",
                    message: "[Init] Failed to restore performance metrics",
                    context: { scope: "init", subsystem: "performance" }
                });
            });
        }
    }
    
    // Initialize security settings based on configuration
    initializeSecuritySettings();

    // Initialize internationalization (i18n)
    const { initialize: initializeI18n } = await import("./i18n.js");
    await initializeI18n(CONFIG);

    [keyboardControls, accessibility, gestures, achievements, playbackControls] = await Promise.all([
        loadDefaultModule("keyboard"),
        loadDefaultModule("accessibility"),
        loadDefaultModule("gestures"),
        loadDefaultModule("achievements"),
        loadDefaultModule("playback-controls")
    ]);

    if (keyboardControls) {
        keyboardControls.bind();
    }

    if (accessibility) {
        // Load accessibility settings from storage
        await accessibility.load().catch((err) => {
            errorTracking?.captureError(err, {
                type: "warning",
                message: "[Init] Failed to load accessibility settings",
                context: { scope: "init", subsystem: "accessibility" }
            });
        });
        // Apply all settings to the DOM
        accessibility.applyAll();
        
        const settings = accessibility.getSettings();
        const gameSettings = getGameSettings();
        if (gameSettings) {
            gameSettings[STORAGE_KEYS.ACCESSIBILITY_HIGH_CONTRAST] = settings.highContrast;
            gameSettings[STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION] = settings.reduceMotion;
            gameSettings[STORAGE_KEYS.ACCESSIBILITY_FONT_SCALE] = settings.fontScale;
        }
    }

    if (gestures) {
        gestures.clearHandlers();
        gestures.on("left", () => {
            if (getActiveLayer() === "game") {
                document.body.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                }));
            }
        });
        gestures.on("right", () => {
            if (getActiveLayer() === "game") {
                document.body.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                }));
            }
        });
        gestures.on("down", () => {
            if (getActiveLayer() === "game") {
                getGameKeyboardActions()?.toggleMenu?.();
            }
        });
    }

    if (achievements) {
        const definitions = await loadAchievementDefinitions();
        achievements.defineMany(definitions);
    }

    if (playbackControls) {
        // Load playback settings from storage asynchronously
        await playbackControls.loadSettings().catch((err) => {
            errorTracking?.captureError(err, {
                type: "warning",
                message: "[Init] Failed to load playback settings",
                context: { scope: "init", subsystem: "playback" }
            });
        });
    }

    loadimg.src = CONFIG.poster;

    loadtitle.innerText = CONFIG.title;
    loadtitle.style.color = CONFIG.colors.text;
    loadstatus.style.color = CONFIG.colors.text;

    document.title = CONFIG.title;

    document.getElementById("icon").href = CONFIG.icon;

    const fonts = await loadFonts(CONFIG.fonts);

    loadtitle.style.fontFamily = fonts["title"];
    loadstatus.style.fontFamily = fonts["other"];

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Cancel";
    closeBtn.className = "btn btn-outline hover:bg-inherit";
    closeBtn.style.borderColor = CONFIG.colors.text;
    closeBtn.style.color = CONFIG.colors.text;
    closeBtn.onclick = () => {
        document.getElementById("alert-win").classList.replace("flex", "hidden");
    };
        
    const proceedBtn = document.createElement("button");
    proceedBtn.innerText = "Reload";
    proceedBtn.className = "btn hover:bg-inherit border-0";
    proceedBtn.style.backgroundColor = CONFIG.colors.primary;
    proceedBtn.style.color = CONFIG.colors["primary-text"];
    const AlertWindow = await loadDefaultModule("alert-window");

    const alertWin = new AlertWindow("Change orientation?", [ closeBtn, proceedBtn ], CONFIG);
    alertWin.color = CONFIG.colors.primary;

    globalThis.addEventListener(EVENTS.UPDATE_AVAILABLE, () => {
        alertWin.message = "An update is available!";

        proceedBtn.innerText = "Update";

        proceedBtn.onclick = () => {
            alertWin.close();
            globalThis.location.reload();
        };

        alertWin.show();
    });

    const music = document.getElementById("music");
    music.src = CONFIG.bgm;

    const story_module = await import("../game/story.js");
    const story = story_module.story;

    globalThis.dispatchEvent(new CustomEvent(EVENTS.DATA_LOADED));

    let pages = {};
    let isGameResizeInProgress = false;
    let isGameResizeQueued = false;
    let resizeNavigateTimer = null;
    let lastSceneStartSignature = null;
    let lastSceneStartAt = 0;
    let lastLoadEventSignature = null;
    let lastLoadEventAt = 0;
    let isApplyingAndroidHistoryState = false;
    let isHandlingAndroidFullscreenBack = false;
    let androidBackFullscreenGuardUntil = 0;
    const scheduledLayerDraws = new WeakSet();
    let stageDrawScheduled = false;

    const getViewportSize = () => {
        const viewport = globalThis.visualViewport;
        const bodyRect = document.body?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
        const docRect = document.documentElement?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
        const viewportWidth = Number(viewport?.width) || 0;
        const viewportHeight = Number(viewport?.height) || 0;
        const innerWidth = Number(globalThis.innerWidth) || 0;
        const innerHeight = Number(globalThis.innerHeight) || 0;

        return {
            width: Math.max(Math.round(bodyRect.width) || 0, Math.round(docRect.width) || 0, Math.round(viewportWidth), Math.round(innerWidth)),
            height: Math.max(Math.round(bodyRect.height) || 0, Math.round(docRect.height) || 0, Math.round(viewportHeight), Math.round(innerHeight))
        };
    };

    const scheduleLayerBatchDraw = (layer) => {
        if (!layer || typeof layer.batchDraw !== "function") {
            return;
        }

        if (scheduledLayerDraws.has(layer)) {
            return;
        }

        scheduledLayerDraws.add(layer);
        requestAnimationFrame(() => {
            scheduledLayerDraws.delete(layer);
            try {
                layer.batchDraw();
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Init] Deferred layer batchDraw failed",
                    context: { scope: "init", subsystem: "draw-scheduler" }
                });
            }
        });
    };

    const requestStageBatchDraw = ({ immediate = false } = {}) => {
        if (!konvaStage || typeof konvaStage.batchDraw !== "function") {
            return;
        }

        if (stageDrawScheduled) {
            return;
        }

        stageDrawScheduled = true;

        const release = () => {
            stageDrawScheduled = false;
        };

        if (immediate) {
            try {
                konvaStage.batchDraw();
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Init] Immediate stage batchDraw failed",
                    context: { scope: "init", subsystem: "draw-scheduler" }
                });
            } finally {
                requestAnimationFrame(release);
            }
            return;
        }

        requestAnimationFrame(() => {
            try {
                konvaStage.batchDraw();
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Init] Deferred stage batchDraw failed",
                    context: { scope: "init", subsystem: "draw-scheduler" }
                });
            } finally {
                release();
            }
        });
    };

    if (isInputDebugEnabled() && typeof konvaStage?.on === "function") {
        konvaStage.on("mousedown touchstart", () => {
            const pointer = konvaStage.getPointerPosition?.() ?? null;
            const intersection = pointer ? konvaStage.getIntersection?.(pointer) : null;
            const activeLayerName = getActiveLayer();
            const activeUiLayer = pages?.[activeLayerName]?.ui?.layer;
            const activeActionbar = pages?.[activeLayerName]?.ui?.actionbar;
            const activeMenuOverlay = pages?.[activeLayerName]?.ui?.menuOverlay;

            logInputDebug("Stage pointer interaction", {
                activeLayer: activeLayerName,
                pointer,
                hitNodeType: intersection?.className ?? null,
                hitNodeId: intersection?.id?.() ?? null,
                stageChildren: konvaStage.getChildren?.().length ?? null,
                activeLayerListening: typeof activeUiLayer?.listening === "function" ? activeUiLayer.listening() : null,
                activeLayerVisible: typeof activeUiLayer?.visible === "function" ? activeUiLayer.visible() : null,
                actionbarVisible: Boolean(activeActionbar?.actionrect?.visible?.()),
                menuVisible: Boolean(activeMenuOverlay?.visible?.()),
                openWindow: getOpenWindow()
            });
        });
        logInputDebug("Input diagnostics enabled");
    }

    const canUseAndroidHistory = () => {
        return getIsAndroid()
            && typeof globalThis.history?.pushState === "function"
            && typeof globalThis.history?.replaceState === "function";
    };

    const getLayerActionbar = (layerName) => pages?.[layerName]?.ui?.actionbar ?? null;

    const getLayerMenuOverlay = (layerName) => pages?.[layerName]?.ui?.menuOverlay ?? null;

    const getOverlayNode = (layerName, overlayType) => {
        if (overlayType === "home-menu") {
            return getLayerMenuOverlay(layerName);
        }

        if (overlayType === "actionbar") {
            return getLayerActionbar(layerName);
        }

        return null;
    };

    const isLayerActionbarOpen = (layerName) => {
        return Boolean(getLayerActionbar(layerName)?.actionrect?.visible?.());
    };

    const isLayerMenuOpen = (layerName) => {
        return Boolean(getLayerMenuOverlay(layerName)?.visible?.());
    };

    const getOpenOverlayTypeForLayer = (layerName) => {
        if (isLayerActionbarOpen(layerName)) {
            return "actionbar";
        }

        if (isLayerMenuOpen(layerName)) {
            return "home-menu";
        }

        return null;
    };

    const buildAndroidHistoryState = (layerName, navData = null, overlayType = undefined, windowName = null) => {
        const resolvedLayer = layerName || getActiveLayer() || "home";
        const resolvedOverlayType = typeof overlayType === "string"
            ? overlayType
            : getOpenOverlayTypeForLayer(resolvedLayer);
        return {
            [HISTORY_STATE_FLAG]: true,
            layer: resolvedLayer,
            navData: navData ?? null,
            overlayType: resolvedOverlayType,
            windowName: resolvedOverlayType === "actionbar" ? (windowName ?? getOpenWindow() ?? null) : null
        };
    };

    const replaceAndroidHistoryState = (layerName, navData = null, overlayType = undefined, windowName = null) => {
        if (!canUseAndroidHistory()) {
            return;
        }

        const nextState = buildAndroidHistoryState(layerName, navData, overlayType, windowName);
        globalThis.history.replaceState(nextState, "", globalThis.location?.href);
    };

    const pushAndroidHistoryState = (layerName, navData = null, overlayType = undefined, windowName = null) => {
        if (!canUseAndroidHistory()) {
            return;
        }

        const nextState = buildAndroidHistoryState(layerName, navData, overlayType, windowName);
        globalThis.history.pushState(nextState, "", globalThis.location?.href);
    };

    const closeLayerOverlay = (layerName, overlayType, options = {}) => new Promise((resolve) => {
        const { instant = false } = options;
        const overlayNode = getOverlayNode(layerName, overlayType);
        const isVisible = overlayType === "actionbar"
            ? overlayNode?.actionrect?.visible?.()
            : overlayNode?.visible?.();

        if (!isVisible) {
            resolve();
            return;
        }

        if (overlayType === "actionbar") {
            if (instant) {
                if (typeof overlayNode.__scrollCleanup === "function") {
                    overlayNode.__scrollCleanup();
                }
                overlayNode.__scrollSuppressTapUntil = 0;
                if (typeof overlayNode.actionrect?.listening === "function") {
                    overlayNode.actionrect.listening(false);
                }
                overlayNode.actionrect.y(konvaStage.height());
                overlayNode.actionrect.visible(false);
                scheduleLayerBatchDraw(overlayNode.actionrect.getLayer?.());
                resolve();
                return;
            }
            overlayNode.close(resolve, { animateButton: false });
            return;
        }

        if (instant) {
            if (typeof overlayNode?.listening === "function") {
                overlayNode.listening(false);
            }
            overlayNode.y(konvaStage.height());
            overlayNode.visible(false);
            scheduleLayerBatchDraw(overlayNode.getLayer?.());
            resolve();
            return;
        }

        closeBar(overlayNode, resolve);
    });

    if (canUseAndroidHistory()) {
        globalThis.addEventListener("vnsutra:overlay-opened", (event) => {
            if (isApplyingAndroidHistoryState) {
                return;
            }

            const layerName = event?.detail?.layer || getActiveLayer() || "home";
            const overlayType = event?.detail?.overlayType || null;
            const windowName = event?.detail?.windowName ?? null;
            const currentState = globalThis.history.state;
            if (currentState?.[HISTORY_STATE_FLAG] && currentState.layer === layerName && currentState.overlayType === overlayType) {
                replaceAndroidHistoryState(layerName, currentState.navData ?? null, overlayType, windowName ?? currentState.windowName ?? null);
                return;
            }

            pushAndroidHistoryState(layerName, currentState?.navData ?? null, overlayType, windowName);
        });

        globalThis.addEventListener("vnsutra:overlay-closed", (event) => {
            if (isApplyingAndroidHistoryState) {
                return;
            }

            const layerName = event?.detail?.layer || getActiveLayer() || "home";
            const currentState = globalThis.history.state;
            const remainingOverlayType = getOpenOverlayTypeForLayer(layerName);
            const remainingWindowName = remainingOverlayType === "actionbar" ? (getOpenWindow() ?? null) : null;

            replaceAndroidHistoryState(
                layerName,
                currentState?.navData ?? null,
                remainingOverlayType,
                remainingWindowName
            );
        });

        globalThis.addEventListener("vnsutra:open-window-changed", () => {
            if (isApplyingAndroidHistoryState) {
                return;
            }

            const currentState = globalThis.history.state;
            if (!currentState?.[HISTORY_STATE_FLAG] || currentState.overlayType !== "actionbar") {
                return;
            }

            replaceAndroidHistoryState(currentState.layer, currentState.navData ?? null, "actionbar", getOpenWindow());
        });

        globalThis.addEventListener("popstate", (event) => {
            const nextState = event.state;
            if (!nextState?.[HISTORY_STATE_FLAG]) {
                return;
            }

            androidBackFullscreenGuardUntil = Date.now() + 1200;
            isApplyingAndroidHistoryState = true;
            Promise.resolve()
                .then(async () => {
                    const wasFullscreenBeforePop = isFullscreenActive(document);
                    const currentLayer = getActiveLayer();
                    const targetLayer = pages[nextState.layer] ? nextState.layer : "home";

                    if (currentLayer === "home" && targetLayer === "game") {
                        const remainingOverlayType = getOpenOverlayTypeForLayer("home");
                        const remainingWindowName = remainingOverlayType === "actionbar" ? (getOpenWindow() ?? null) : null;
                        replaceAndroidHistoryState("home", null, remainingOverlayType, remainingWindowName);
                        return;
                    }

                    if (currentLayer === "game" && targetLayer === "home") {
                        const gameOverlayType = getOpenOverlayTypeForLayer("game");
                        const gameWindowName = gameOverlayType === "actionbar" ? (getOpenWindow() ?? null) : null;
                        replaceAndroidHistoryState("game", null, gameOverlayType, gameWindowName);
                        pages?.game?.ui?.promptExitToHome?.({ animateButton: false });
                        return;
                    }

                    if (targetLayer !== getActiveLayer()) {
                        navigate(targetLayer, nextState.navData ?? {}, { skipAndroidHistoryPush: true });
                    }

                    if (nextState.overlayType) {
                        const shouldForceHomeMenuFullscreenRecovery = nextState.overlayType === "home-menu" && targetLayer === "home";
                        const currentOverlayType = getOpenOverlayTypeForLayer(targetLayer);
                        if (currentOverlayType && currentOverlayType !== nextState.overlayType) {
                            await closeLayerOverlay(targetLayer, currentOverlayType, { instant: true });
                            if (currentOverlayType === "actionbar" && targetLayer === "home") {
                                setOpenWindow(null);
                            }
                        }

                        const overlayNode = getOverlayNode(targetLayer, nextState.overlayType);
                        if (nextState.overlayType === "actionbar") {
                            if (nextState.windowName && typeof pages?.home?.ui?.[nextState.windowName]?.render === "function") {
                                pages.home.ui[nextState.windowName].render();
                            }
                            const actionbar = getLayerActionbar(targetLayer);
                            if (actionbar?.actionrect && !actionbar.actionrect.visible()) {
                                openBar(actionbar.actionrect);
                            }
                        } else if (overlayNode && !overlayNode.visible?.()) {
                            openBar(overlayNode);
                        }

                        if (shouldForceHomeMenuFullscreenRecovery && !isFullscreenActive(document)) {
                            await restoreFullscreenIfNeeded({
                                wasFullscreenBefore: true,
                                userExitedFullscreen: false,
                                doc: document,
                                timeoutMs: 300,
                                onError: (error) => {
                                    errorTracking?.captureError(error, {
                                        type: "warning",
                                        message: "[Init] Failed to restore fullscreen after settings-to-menu swipe transition",
                                        context: { scope: "init", subsystem: "history-fullscreen" }
                                    });
                                }
                            });
                        }
                    } else {
                        const currentOverlayType = getOpenOverlayTypeForLayer(targetLayer);
                        if (currentOverlayType) {
                            setResizeSuppressedUntil(Date.now() + 700);
                            const shouldForceHomeMenuFullscreenRecovery = currentOverlayType === "home-menu" && targetLayer === "home";
                            await closeLayerOverlay(targetLayer, currentOverlayType, {
                                instant: shouldForceHomeMenuFullscreenRecovery
                            });
                            requestStageBatchDraw({ immediate: true });
                            if (currentOverlayType === "actionbar" && targetLayer === "home") {
                                setOpenWindow(null);
                            }

                            if (shouldForceHomeMenuFullscreenRecovery && !isFullscreenActive(document)) {
                                await restoreFullscreenIfNeeded({
                                    wasFullscreenBefore: true,
                                    userExitedFullscreen: false,
                                    doc: document,
                                    timeoutMs: 300,
                                    onError: (error) => {
                                        errorTracking?.captureError(error, {
                                            type: "warning",
                                            message: "[Init] Failed to restore fullscreen after home menu swipe close",
                                            context: { scope: "init", subsystem: "history-fullscreen" }
                                        });
                                    }
                                });
                            }
                        }
                    }

                    if (wasFullscreenBeforePop && !isFullscreenActive(document)) {
                        await restoreFullscreenIfNeeded({
                            wasFullscreenBefore: wasFullscreenBeforePop,
                            userExitedFullscreen: false,
                            doc: document,
                            timeoutMs: 300,
                            onError: (error) => {
                                errorTracking?.captureError(error, {
                                    type: "warning",
                                    message: "[Init] Failed to restore fullscreen after Android back navigation",
                                    context: { scope: "init", subsystem: "history-fullscreen" }
                                });
                            }
                        });
                    }
                })
                .finally(() => {
                    isApplyingAndroidHistoryState = false;
                });
        });

        document.addEventListener("fullscreenchange", () => {
            if (!hasStarted) {
                return;
            }

            if (isFullscreenActive(document) || isHandlingAndroidFullscreenBack) {
                return;
            }

            if (Date.now() <= androidBackFullscreenGuardUntil) {
                isHandlingAndroidFullscreenBack = true;
                Promise.resolve()
                    .then(async () => {
                        await restoreFullscreenIfNeeded({
                            wasFullscreenBefore: true,
                            userExitedFullscreen: false,
                            doc: document,
                            timeoutMs: 300,
                            onError: (error) => {
                                errorTracking?.captureError(error, {
                                    type: "warning",
                                    message: "[Init] Failed to restore fullscreen during Android back guard",
                                    context: { scope: "init", subsystem: "history-fullscreen" }
                                });
                            }
                        });
                    })
                    .finally(() => {
                        isHandlingAndroidFullscreenBack = false;
                    });
                return;
            }

            if (isApplyingAndroidHistoryState) {
                return;
            }

            const targetLayer = getActiveLayer();
            const openOverlayType = getOpenOverlayTypeForLayer(targetLayer);
            if (targetLayer === "game" && !openOverlayType) {
                const alertWinEl = document.getElementById("alert-win");
                const isAlertVisible = Boolean(alertWinEl && !alertWinEl.classList.contains("hidden"));

                if (!isAlertVisible) {
                    pages?.game?.ui?.promptExitToHome?.({ animateButton: false });
                }

                isHandlingAndroidFullscreenBack = true;
                Promise.resolve()
                    .then(async () => {
                        await restoreFullscreenIfNeeded({
                            wasFullscreenBefore: true,
                            userExitedFullscreen: false,
                            doc: document,
                            timeoutMs: 300,
                            onError: (error) => {
                                errorTracking?.captureError(error, {
                                    type: "warning",
                                    message: "[Init] Failed to restore fullscreen after game back swipe",
                                    context: { scope: "init", subsystem: "history-fullscreen" }
                                });
                            }
                        });
                    })
                    .finally(() => {
                        isHandlingAndroidFullscreenBack = false;
                    });
                return;
            }

            if (!openOverlayType) {
                return;
            }

            isHandlingAndroidFullscreenBack = true;
            Promise.resolve()
                .then(async () => {
                    setResizeSuppressedUntil(Date.now() + 700);
                    await closeLayerOverlay(targetLayer, openOverlayType, { instant: true });

                    const currentState = globalThis.history.state;
                    if (openOverlayType === "actionbar" && targetLayer === "home") {
                        setOpenWindow(null);
                    }

                    const remainingOverlayType = getOpenOverlayTypeForLayer(targetLayer);
                    const remainingWindowName = remainingOverlayType === "actionbar" ? (getOpenWindow() ?? null) : null;

                    if (currentState?.[HISTORY_STATE_FLAG]) {
                        replaceAndroidHistoryState(
                            targetLayer,
                            currentState.navData ?? null,
                            remainingOverlayType,
                            remainingWindowName
                        );
                    }

                    await restoreFullscreenIfNeeded({
                        wasFullscreenBefore: true,
                        userExitedFullscreen: false,
                        doc: document,
                        timeoutMs: 300,
                        onError: (error) => {
                            errorTracking?.captureError(error, {
                                type: "warning",
                                message: "[Init] Failed to restore fullscreen after Android fullscreen-exit close",
                                context: { scope: "init", subsystem: "history-fullscreen" }
                            });
                        }
                    });
                })
                .finally(() => {
                    isHandlingAndroidFullscreenBack = false;
                });
        });

        replaceAndroidHistoryState("home", null, null, null);
    }

    const startScene = ({ scene, state = {}, source = "unknown", dedupeKey, chapterId = null } = {}) => {
        const sceneName = typeof scene === "string" ? scene.trim() : "";
        if (!sceneName) {
            errorTracking?.captureError("Scene name is missing", {
                type: "warning",
                message: "[Init] Ignored scene load with missing scene name",
                context: { scope: "init", subsystem: "game-load", source }
            });
            return;
        }

        const sceneSignature = dedupeKey || buildSceneStartSignature(sceneName, state);
        const now = Date.now();
        if (isRapidDuplicate({
            signature: sceneSignature,
            lastSignature: lastSceneStartSignature,
            lastAt: lastSceneStartAt,
            now,
            windowMs: 250
        })) {
            return;
        }
        lastSceneStartSignature = sceneSignature;
        lastSceneStartAt = now;

        const abortFn = getAbortInstruction();
        if (typeof abortFn === "function") {
            abortFn();
        }
        if (playbackControls) {
            playbackControls.pause?.();
            playbackControls.isWaitingForInput = false;
        }

        const gameInstance = getGame();
        gameInstance?.ui?.game?.end?.visible(false);
        gameInstance?.ui?.game?.stopEndingSequence?.({ showEnd: false });
        gameInstance?.ui?.game?.loading?.visible(false);
        gameInstance?.ui?.dialog?.name?.text?.("");
        gameInstance?.ui?.dialog?.message?.text?.("");
        gameInstance?.ui?.dialog?.message?.fire?.("update");

        setInstructionCount(0);
        setActiveScene(sceneName);
        setState(state ?? {});

        if (chapterId) {
            chapters.startChapter(chapterId);
        } else {
            const isLoadResume = source === "load-game-event";
            chapters.startChapterForScene(sceneName, {
                resetOnMiss: !isLoadResume,
                preserveCurrent: false
            });
        }

        const sceneHandler = story?.[sceneName];
        if (typeof sceneHandler !== "function") {
            errorTracking?.captureError(`Scene not found: ${sceneName}`, {
                type: "error",
                message: `Failed to load scene: ${sceneName}`,
                context: { scope: "init", subsystem: "game-load", scene: sceneName, source }
            });
            return;
        }

        Promise.resolve(sceneHandler()).catch((error) => {
            errorTracking?.captureError(error, {
                type: "error",
                message: `Failed to load scene: ${sceneName}`,
                context: { scope: "init", subsystem: "game-load", scene: sceneName, source }
            });
        });
    };

    let resizeDispatchTimer = null;
    const isResizeTemporarilySuppressed = () => getResizeSuppressedUntil() > Date.now();
    const RESIZE_EPSILON_PX = 2;

    const getRoundedStageAndDocSize = () => {
        const docRect = getViewportSize();
        return {
            docWidth: Math.round(docRect.width),
            docHeight: Math.round(docRect.height),
            stageWidth: Math.round(konvaStage.width()),
            stageHeight: Math.round(konvaStage.height())
        };
    };

    const hasStageDimensionChanged = () => {
        const { docWidth, docHeight, stageWidth, stageHeight } = getRoundedStageAndDocSize();
        return Math.abs(docWidth - stageWidth) > RESIZE_EPSILON_PX
            || Math.abs(docHeight - stageHeight) > RESIZE_EPSILON_PX;
    };

    const scheduleGameResize = (forceRefresh = false) => {
        if (isResizeTemporarilySuppressed()) {
            return;
        }

        if (!forceRefresh && !hasStageDimensionChanged()) {
            return;
        }

        if (resizeDispatchTimer) {
            clearTimeout(resizeDispatchTimer);
        }

        resizeDispatchTimer = setTimeout(() => {
            globalThis.dispatchEvent(new CustomEvent(EVENTS.GAME_RESIZE));
            resizeDispatchTimer = null;
        }, 120);
    };

    globalThis.addEventListener("resize", (event) => {
        refreshPortraitCompatibilityUI();
        if (hasStarted && !isResizeTemporarilySuppressed()) {
            const forceRefresh = event?.detail?.force === true;
            scheduleGameResize(forceRefresh);
        }
    });

    document.addEventListener("fullscreenchange", () => {
        refreshPortraitCompatibilityUI();
        if (hasStarted && !isResizeTemporarilySuppressed()) {
            scheduleGameResize();
        }
    });

    globalThis.addEventListener("orientationchange", (e) => {
        e.preventDefault();

        if (!isPortraitCompatible) {
            refreshPortraitCompatibilityUI();
            if (hasStarted && !isResizeTemporarilySuppressed()) {
                scheduleGameResize();
            }
            return;
        }

        if (getActiveLayer() === "home") {
            globalThis.location.reload();
        } else {
            alertWin.message = "Reload page? You may lose your progress!";
            proceedBtn.innerText = "Reload";
            proceedBtn.onclick = () => {
                alertWin.close();
                globalThis.location.reload();
            };
            alertWin.show();
        }
    });

    globalThis.addEventListener(EVENTS.GAME_RESIZE, async () => {
        const resizeStartTs = performance.now();
        let resizePassCount = 0;

        if (isResizeTemporarilySuppressed()) {
            logResizeDebug("Skipped GAME_RESIZE due to temporary suppression");
            return;
        }

        if(getIsInputFocused()) {
            logResizeDebug("Skipped GAME_RESIZE because input is focused");
            return;
        }

        if (!isPortraitCompatible && isPortraitMode()) {
            logResizeDebug("Skipped GAME_RESIZE due to portrait compatibility block");
            showPortraitBlockNotice();
            return;
        }

        const { docWidth, docHeight, stageWidth, stageHeight } = getRoundedStageAndDocSize();
        const nextPortrait = checkPortrait();
        const isDimensionNoop = Math.abs(docWidth - stageWidth) <= RESIZE_EPSILON_PX
            && Math.abs(docHeight - stageHeight) <= RESIZE_EPSILON_PX;
        const isOrientationNoop = nextPortrait === getIsPortrait();
        const arePagesMounted = Boolean(pages.home?.ui?.layer) && Boolean(pages.game?.ui?.layer);

        if (isDimensionNoop && isOrientationNoop && arePagesMounted) {
            logResizeDebug("Skipped GAME_RESIZE because dimensions/orientation are unchanged", {
                docWidth,
                docHeight,
                stageWidth,
                stageHeight,
                nextPortrait
            });
            return;
        }

        if (isGameResizeInProgress) {
            isGameResizeQueued = true;
            logResizeDebug("Queued GAME_RESIZE because another resize is in progress");
            return;
        }

        isGameResizeInProgress = true;

        try {
            do {
                resizePassCount += 1;
                isGameResizeQueued = false;

                // Capture open window state before redraw
                const wasWindowOpen = getOpenWindow();
                const wasActionbarVisible = pages.home?.ui?.actionbar?.actionrect?.visible?.() ?? false;
                const wasActiveLayer = getActiveLayer();
                // Preserve ending overlays through resize/fullscreen remounts.
                const wasCreditsEndingVisible = pages.game?.ui?.game?.endingSequence?.visible?.() === true;
                const wasEndScreenVisible = pages.game?.ui?.game?.end?.visible?.() === true;
                const endingUiMode = wasCreditsEndingVisible ? "credits" : (wasEndScreenVisible ? "end" : null);

                Konva.autoDrawEnabled = false;

                const docRect = getViewportSize();
                konvaStage.width(docRect.width);
                konvaStage.height(docRect.height);

                // Ensure the Konva container DOM element matches the stage size.
                // On some Android landscape/viewport cases the canvas DOM size
                // can differ from Konva's internal stage size which breaks
                // hit-testing (clicks only register near center). Forcing the
                // container style to the same pixel dimensions fixes mapping.
                try {
                    const containerEl = typeof konvaStage.container === "function" ? konvaStage.container() : null;
                    if (containerEl && containerEl.style) {
                        containerEl.style.width = `${docRect.width}px`;
                        containerEl.style.height = `${docRect.height}px`;
                    }
                } catch (err) {
                    // non-fatal: continue without blocking resize
                    console.warn("Failed to set Konva container DOM size:", err);
                }

                setIsPortrait(checkPortrait());

                if (pages.home?.ui?.layer) {
                    pages.home.ui.layer.removeChildren();
                }
                if (pages.game?.ui?.layer) {
                    pages.game.ui.layer.removeChildren();
                }

                const [home, gameUI, Game, autoSaveModule] = await Promise.all([
                    loadDefaultModule("home"),
                    loadDefaultModule("gameui"),
                    loadDefaultModule("game"),
                    ensureAutoSave()
                ]);

                const restoreHomeWindow = async (windowName) => {
                    if (!windowName) {
                        return;
                    }

                    let didRender = false;
                    if (windowName === "settings" && typeof pages.home.ui.settings?.render === "function") {
                        pages.home.ui.settings.render();
                        didRender = true;
                    } else if (windowName === "credits" && typeof pages.home.ui.credits?.render === "function") {
                        pages.home.ui.credits.render();
                        didRender = true;
                    } else if (windowName === "loadgame" && typeof pages.home.ui.loadgame?.render === "function") {
                        await pages.home.ui.loadgame.render();
                        didRender = true;
                    } else if (windowName === "achievements" && typeof pages.home.ui.achievements?.render === "function") {
                        pages.home.ui.achievements.render();
                        didRender = true;
                    } else if (windowName === "chapters" && typeof pages.home.ui.chapters?.render === "function") {
                        pages.home.ui.chapters.render();
                        didRender = true;
                    }

                    if (didRender) {
                        openBar(pages.home.ui.actionbar.actionrect);
                    }
                };

                pages = {
                    home: { ui: await home(CONFIG, fonts, navigate), func: () => {
                        music.pause();
                        document.getElementById("sfx").pause();
                        const gameSettings = getGameSettings();
                        if(gameSettings && gameSettings["settings-music"] === true) {
                            music.src = CONFIG.bgm;
                            music.onloadedmetadata = () => {
                                const bgmFn = getBgm();
                                if (typeof bgmFn === "function") {
                                    bgmFn();
                                }
                            };
                        }
                    } },
                    game: { ui: await gameUI(CONFIG, fonts, navigate), func: async (data) => {
                        music.pause();
                        music.src = "";
                        const payload = data ?? {};
                        const shouldRestoreEndingUi = payload.endingUiMode === "credits" || payload.endingUiMode === "end";

                        if (shouldRestoreEndingUi) {
                            if (payload.endingUiMode === "credits" && typeof pages.game.ui.game.playEndingSequence === "function") {
                                const endConfig = CONFIG?.ui?.end ?? {};
                                void pages.game.ui.game.playEndingSequence({
                                    creditsDurationMs: endConfig?.creditsDurationMs,
                                    endHoldMs: endConfig?.endHoldMs,
                                    allowSkip: endConfig?.allowSkip !== false
                                });
                            } else {
                                pages.game.ui.game.stopEndingSequence?.({ showEnd: true });
                                pages.game.ui.game.end?.visible(true);
                            }

                            pages.game.ui.game.loading?.visible(false);
                            return;
                        }

                        let sceneName = payload.scene;
                        let nextState = payload.state ?? {};
                        let chapterId = payload.chapterId ?? null;
                        if (!sceneName) {
                            // No scene provided - check for autosave
                            const autosavedState = await autoSaveModule.load();
                            if (autosavedState?.scene) {
                                // Loading from autosave
                                sceneName = autosavedState.scene;
                                nextState = autosavedState.state ?? {};
                                chapterId = autosavedState.chapterId ?? chapterId;
                                isNewGame = false;
                            } else {
                                // Starting new game from "start"
                                sceneName = "start";
                                nextState = {};
                                isNewGame = true;
                            }
                        } else if (sceneName === "start" && !payload.state) {
                            // Explicitly starting new game with { scene: "start" }
                            isNewGame = true;
                        } else {
                            // Loading a specific saved scene
                            isNewGame = false;
                        }
                        startScene({
                            scene: sceneName,
                            state: nextState,
                            source: "navigate-game",
                            chapterId
                        });
                    } }
                };

                const gameInstance = new Game(pages.game.ui);
                setGame(gameInstance);

                if (gestures && konvaStage?.container) {
                    gestures.attach(konvaStage.container());
                }

                // Restore open window after resize navigation mounts the rebuilt layer.
                const shouldRestoreWindow = Boolean(wasWindowOpen) && (wasActionbarVisible || wasActiveLayer === "home");

                if (resizeNavigateTimer) {
                    clearTimeout(resizeNavigateTimer);
                }

                resizeNavigateTimer = setTimeout(async () => {
                    const currentLayer = getActiveLayer();
                    const targetLayer = currentLayer && pages[currentLayer] ? currentLayer : "home";
                    const currentState = getState() ?? {};
                    const resizeNavigationData = {
                        scene: getActiveScene() ?? null,
                        state: {
                            ...currentState,
                            instruction_count: getInstructionCount()
                        },
                        endingUiMode
                    };
                    navigate(targetLayer, resizeNavigationData);

                    const isWindowAlreadyRestored = targetLayer === "home"
                        && Boolean(wasWindowOpen)
                        && getOpenWindow() === wasWindowOpen
                        && (pages.home?.ui?.actionbar?.actionrect?.visible?.() ?? false);

                    if (targetLayer === "home" && shouldRestoreWindow && !isWindowAlreadyRestored) {
                        await restoreHomeWindow(wasWindowOpen);
                    }

                    if (hasStarted && !loadwin.classList.contains("hidden")) {
                        loadwin.classList.add("hidden");
                    }
                    
                    // Render immediately and re-enable autoDrawEnabled
                    requestStageBatchDraw({ immediate: true });
                    Konva.autoDrawEnabled = true;
                    
                    globalThis.dispatchEvent(new CustomEvent("game-ui-ready"));
                    resizeNavigateTimer = null;
                }, 100);

                // Remove this line - don't re-enable autoDrawEnabled here
                // Konva.autoDrawEnabled = true;
            } while (isGameResizeQueued);
        } finally {
            isGameResizeInProgress = false;
            logResizeDebug("Completed GAME_RESIZE", {
                passes: resizePassCount,
                durationMs: Math.round((performance.now() - resizeStartTs) * 100) / 100,
                activeLayer: getActiveLayer(),
                openWindow: getOpenWindow()
            });
        }
    });

    globalThis.addEventListener("load-game", (e) => {
        const detail = e?.detail ?? {};
        const signature = buildLoadEventSignature(detail);
        const now = Date.now();
        if (isRapidDuplicate({
            signature,
            lastSignature: lastLoadEventSignature,
            lastAt: lastLoadEventAt,
            now,
            windowMs: 300
        })) {
            return;
        }

        lastLoadEventSignature = signature;
        lastLoadEventAt = now;

        startScene({
            scene: detail.scene,
            state: detail.state ?? {},
            source: "load-game-event",
            dedupeKey: signature,
            chapterId: detail.chapterId ?? null
        });
    });

    globalThis.addEventListener("game-started", () => {
        setShouldAbortGame(false);
        ensureAutoSave().then((module) => {
            module.start();
        });
        // Show disclaimer only for new games, not for resumed/loaded games
        // Only show once per game session
        if (CONFIG?.ui?.disclaimer?.enabled && isNewGame && !disclaimerShown) {
            disclaimerShown = true;
            // Load in background without blocking
            showDisclaimer().catch(err => {
                errorTracking?.captureError(err, {
                    type: "warning",
                    message: "Failed to show disclaimer overlay",
                    context: { scope: "init", subsystem: "disclaimer" }
                });
            });
        }
    });

    globalThis.addEventListener(EVENTS.GAME_COMPLETED, (event) => {
        const chapterId = event?.detail?.chapterId ?? null;
        const alreadyPersisted = event?.detail?.completionPersistedInEnd === true;
        logChapterDebug("GAME_COMPLETED received", {
            detail: event?.detail ?? {},
            activeChapterId: chapters.getCurrentChapter()?.id ?? null
        });

        if (alreadyPersisted) {
            logChapterDebug("Skipping init completion because end() already persisted", {
                requestedChapterId: chapterId
            });
            return;
        }

        const completionPromise = chapterId
            ? chapters.completeChapter(chapterId)
            : chapters.completeCurrentChapter();

        completionPromise.then((result) => {
            logChapterDebug("Chapter completion persisted", {
                requestedChapterId: chapterId,
                completedChapterId: result?.chapter?.id ?? null,
                unlockedNextChapterId: result?.unlockedNext?.id ?? null
            });
        });

        completionPromise.catch((error) => {
            logChapterDebug("Chapter completion failed", {
                requestedChapterId: chapterId,
                error: error?.message ?? String(error)
            });
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Init] Failed to persist chapter completion",
                context: { scope: "init", subsystem: "chapters" }
            });
        });
    });

    globalThis.addEventListener("game-ended", async () => {
        chapters.clearCurrentChapter();
        setShouldAbortGame(true);
        const abortFn = getAbortInstruction();
        abortFn();
        setState({});
        setActiveScene(null);
        setInstructionCount(0);
        const autoSaveModule = await ensureAutoSave();
        autoSaveModule.stop();
        autoSaveModule.save();
    });

    globalThis.addEventListener("beforeunload", () => {
        autoSave?.save?.();
        autoSave?.stop?.();
    });

    function navigate(name, data, options = {}) {
        const { skipAndroidHistoryPush = false } = options;
        if(pages[name]) {
            const previousLayer = getActiveLayer();
            const isLeavingGame = previousLayer === "game" && name !== "game";

            // End active game work before detaching the game layer from the stage.
            // This prevents in-flight dialog/tween callbacks from drawing to nodes
            // whose stage buffers are already gone.
            if (isLeavingGame) {
                globalThis.dispatchEvent(new CustomEvent("game-ended"));
                disclaimerShown = false;
            }

            if (isLeavingGame) {
                pages.game?.ui?.teardown?.();
                pages.game?.ui?.animations?.loading?.stop?.();
            }

            if (previousLayer !== name) {
                setOpenWindow(null);
            }
            
            konvaStage.removeChildren();
            konvaStage.add(pages[name].ui.layer);
            
            // Ensure layer is listening after being re-added to stage
            // This prevents button clicks from being unresponsive after game exit
            if (pages[name].ui.layer.listening !== undefined) {
                pages[name].ui.layer.listening(true);
            }
            
            // Immediately render the layer to avoid black screen
            requestStageBatchDraw({ immediate: true });
            
            const funcResult = pages[name].func(data);
            setActiveLayer(name);

            if (canUseAndroidHistory() && previousLayer !== name && !skipAndroidHistoryPush) {
                pushAndroidHistoryState(name, data ?? null, false);
            } else if (canUseAndroidHistory() && previousLayer === name) {
                replaceAndroidHistoryState(name, data ?? null);
            }

            if(name === "game") {
                // Wait for async function to set isNewGame before dispatching event
                if (funcResult instanceof Promise) {
                    funcResult.then(() => {
                        const gameInstance = getGame();
                        gameInstance?.ui?.dialog?.message?.text?.("");
                        gameInstance?.ui?.dialog?.message?.fire?.("update");
                        globalThis.dispatchEvent(new CustomEvent("game-started"));
                    });
                } else {
                    const gameInstance = getGame();
                    gameInstance?.ui?.dialog?.message?.text?.("");
                    gameInstance?.ui?.dialog?.message?.fire?.("update");
                    globalThis.dispatchEvent(new CustomEvent("game-started"));
                }
            }            
        }
    }
})();