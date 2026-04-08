// Import core modules
import "./konva.js";
import { konvaStage } from "./stage.js";
import { loadJSON, loadFonts } from "./utils.js";
import storage from "./storage.js";
import errorTracking from "./error-tracking.js";
import performanceMonitor from "./performance.js";
import chapters from "./chapters.js";
import { buildLoadEventSignature, buildSceneStartSignature, isRapidDuplicate } from "./scene-transition-utils.js";
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
    setIsPortrait,
    setIsAndroid,
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
    const hasStageDimensionChanged = () => {
        const docRect = document.body.getBoundingClientRect();
        const nextWidth = Math.round(docRect.width);
        const nextHeight = Math.round(docRect.height);
        const currentWidth = Math.round(konvaStage.width());
        const currentHeight = Math.round(konvaStage.height());
        return nextWidth !== currentWidth || nextHeight !== currentHeight;
    };

    const scheduleGameResize = () => {
        if (isResizeTemporarilySuppressed()) {
            return;
        }

        if (!hasStageDimensionChanged()) {
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

    globalThis.addEventListener("resize", () => {
        refreshPortraitCompatibilityUI();
        if (hasStarted && !isResizeTemporarilySuppressed()) {
            scheduleGameResize();
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
        if (isResizeTemporarilySuppressed()) {
            return;
        }

        if(getIsInputFocused()) {
            return;
        }

        if (!isPortraitCompatible && isPortraitMode()) {
            showPortraitBlockNotice();
            return;
        }

        if (isGameResizeInProgress) {
            isGameResizeQueued = true;
            return;
        }

        isGameResizeInProgress = true;

        try {
            do {
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

                const docRect = document.body.getBoundingClientRect();
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

                    const { openBar } = await import("./ui/utils.js");
                    if (windowName === "settings" && typeof pages.home.ui.settings?.render === "function") {
                        pages.home.ui.settings.render();
                        openBar(pages.home.ui.actionbar.actionrect);
                    } else if (windowName === "credits" && typeof pages.home.ui.credits?.render === "function") {
                        pages.home.ui.credits.render();
                        openBar(pages.home.ui.actionbar.actionrect);
                    } else if (windowName === "loadgame" && typeof pages.home.ui.loadgame?.render === "function") {
                        await pages.home.ui.loadgame.render();
                        openBar(pages.home.ui.actionbar.actionrect);
                    } else if (windowName === "achievements" && typeof pages.home.ui.achievements?.render === "function") {
                        pages.home.ui.achievements.render();
                        openBar(pages.home.ui.actionbar.actionrect);
                    } else if (windowName === "chapters" && typeof pages.home.ui.chapters?.render === "function") {
                        pages.home.ui.chapters.render();
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

                    if (targetLayer === "home" && shouldRestoreWindow) {
                        await restoreHomeWindow(wasWindowOpen);
                    }

                    if (hasStarted && !loadwin.classList.contains("hidden")) {
                        loadwin.classList.add("hidden");
                    }
                    
                    // Render immediately and re-enable autoDrawEnabled
                    konvaStage.batchDraw();
                    Konva.autoDrawEnabled = true;
                    
                    globalThis.dispatchEvent(new CustomEvent("game-ui-ready"));
                    resizeNavigateTimer = null;
                }, 100);

                // Remove this line - don't re-enable autoDrawEnabled here
                // Konva.autoDrawEnabled = true;
            } while (isGameResizeQueued);
        } finally {
            isGameResizeInProgress = false;
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
        const abortFn = getAbortInstruction();
        abortFn();
        setShouldAbortGame(true);
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

    function navigate(name, data) {
        if(pages[name]) {
            const previousLayer = getActiveLayer();

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
            konvaStage.batchDraw();
            
            const funcResult = pages[name].func(data);
            setActiveLayer(name);

            if(name === "game") {
                // Wait for async function to set isNewGame before dispatching event
                if (funcResult instanceof Promise) {
                    funcResult.then(() => {
                        globalThis.dispatchEvent(new CustomEvent("game-started"));
                    });
                } else {
                    globalThis.dispatchEvent(new CustomEvent("game-started"));
                }
            }

            if(previousLayer === "game" && name !== "game") {
                globalThis.dispatchEvent(new CustomEvent("game-ended"));
                // Reset disclaimer flag when leaving game (going back to menu)
                disclaimerShown = false;
            }
        }
    }
})();