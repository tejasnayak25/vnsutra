import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { konvaStage } from "./stage.js";
import { getIsPortrait, getIsAndroid, getExitApp, getOpenWindow, scaleFontSize, getGameSettings } from "./runtime-state.js";
import { STORAGE_KEYS } from "./constants.js";
import { animateBtn, openBar, closeBar } from "./ui/utils.js";
import actionBar from "./ui/actionbar.js";
import credits from "./credits.js";
import settings from "./settings.js";
import loadgame from "./loadgame.js";
import achievementsPage from "./achievements-page.js";
import chaptersPage from "./chapters-page.js";
import chapters from "./chapters.js";
import autoSave from "./autosave.js";
import { storage } from "./storage.js";
import AlertWindow from "./alert-window.js";
import errorTracking from "./error-tracking.js";
import { createKonvaNodesFromPlan } from "./ui-layout/runtime.js";

const Konva = globalThis.Konva;

let homeLayoutPlanCache = null;
let homeLayoutPlanPromise = null;
let homeOverlayClosedHandler = null;

function isXmlLayoutEnabled(config) {
    return config?.ui?.["xml-mode"] !== false;
}

async function loadHomeLayoutPlan() {
    if (homeLayoutPlanCache) {
        return homeLayoutPlanCache;
    }

    if (homeLayoutPlanPromise) {
        return homeLayoutPlanPromise;
    }

    homeLayoutPlanPromise = (async () => {
        try {
            const response = await fetch("../game/.ui-cache/home.ui.json", { cache: "no-store" });
            if (!response.ok) {
                return null;
            }

            const plan = await response.json();
            if (!plan || !Array.isArray(plan.nodes)) {
                return null;
            }

            homeLayoutPlanCache = plan;
            return plan;
        } catch {
            return null;
        }
    })();

    try {
        return await homeLayoutPlanPromise;
    } finally {
        homeLayoutPlanPromise = null;
    }
}

function getPlanNode(nodesById, nodeId) {
    const entry = nodesById.get(nodeId);
    return entry?.node ?? null;
}

async function buildHomeCompiledLayout({
    config,
    fonts,
    stageWidth,
    stageHeight,
    isPortrait,
    isAndroid
}) {
    const plan = await loadHomeLayoutPlan();
    if (!plan || !Konva) {
        return null;
    }

    try {
        const context = {
            stageWidth,
            stageHeight,
            parentWidth: stageWidth,
            parentHeight: stageHeight,
            isPortrait,
            isAndroid
        };

        const { nodesById } = createKonvaNodesFromPlan({
            Konva,
            plan,
            context
        });

        const sidebarRoot = getPlanNode(nodesById, "home-sidebar-root");
        const sidebar = getPlanNode(nodesById, "home-sidebar");
        const sidebarTopBorder = getPlanNode(nodesById, "home-sidebar-top-border");
        const sidebarTitle = getPlanNode(nodesById, "home-sidebar-title");
        const sidebarTitleBorder = getPlanNode(nodesById, "home-sidebar-title-border");
        const sidebarDivider = getPlanNode(nodesById, "home-sidebar-divider");
        const closeMenuBtn = getPlanNode(nodesById, "home-close-menu-btn");
        const optsViewport = getPlanNode(nodesById, "home-opts-viewport");
        const optsGroup = getPlanNode(nodesById, "home-opts-group");

        const mainRoot = getPlanNode(nodesById, "home-main-root");
        const titleGroup = getPlanNode(nodesById, "home-title-group");
        const title = getPlanNode(nodesById, "home-title");
        const subtitle = getPlanNode(nodesById, "home-subtitle");
        const mobileButtons = getPlanNode(nodesById, "home-mobile-buttons");

        if (!sidebarRoot || !sidebar || !sidebarTopBorder || !sidebarTitle || !sidebarTitleBorder || !sidebarDivider || !closeMenuBtn || !optsViewport || !optsGroup || !mainRoot || !titleGroup || !title || !subtitle || !mobileButtons) {
            return null;
        }

        const sidebarTitleSize = isPortrait ? 26 : (isAndroid ? 22 : 26);
        const titleSize = isPortrait ? 44 : (isAndroid ? 44 : 76);
        const subtitleSize = isPortrait ? 20 : (isAndroid ? 18 : 22);
        const titleFont = fonts?.["title"]?.name || fonts?.["title"] || "Cinzel";
        const otherFont = fonts?.["other"]?.name || fonts?.["other"] || "Inter";

        sidebarTitle.setAttrs({
            text: "🌸 Visual Novel",
            fontSize: scaleFontSize(sidebarTitleSize),
            fontFamily: titleFont,
            fontStyle: "bold",
            fill: "#F8F2FF",
            shadowColor: "#05030A",
            shadowBlur: 10,
            shadowOpacity: 0.7,
            shadowOffsetY: 2
        });

        title.setAttrs({
            text: config.title,
            fontSize: scaleFontSize(titleSize),
            fontFamily: titleFont,
            fill: "#FFFFFF",
            stroke: "rgba(10, 6, 20, 0.95)",
            strokeWidth: 2,
            shadowColor: "#05030A",
            shadowBlur: 20,
            shadowOpacity: 0.95,
            shadowOffsetY: 4,
            letterSpacing: 2,
            fillAfterStrokeEnabled: true,
            perfectDrawEnabled: false
        });

        subtitle.setAttrs({
            text: config.subtitle || "",
            fontSize: scaleFontSize(subtitleSize),
            fontFamily: otherFont,
            fill: "#F2A9D5",
            stroke: "rgba(10, 6, 20, 0.85)",
            strokeWidth: 1.2,
            shadowColor: "#05030A",
            shadowBlur: 14,
            shadowOpacity: 0.9,
            shadowOffsetY: 2,
            letterSpacing: 1.5,
            fillAfterStrokeEnabled: true,
            perfectDrawEnabled: false
        });

        if (!isPortrait) {
            titleGroup.y(stageHeight - (subtitle.y() + subtitle.height()));
        } else {
            titleGroup.y((stageHeight / 2) - ((title.height() * title.scaleX()) + subtitle.height()));
        }

        // Create a convenience object with all compiled nodes
        const compiledNodes = new Proxy({}, {
            get(target, prop) {
                if (prop === "all") {
                    return nodesById;
                }
                const nodeId = `home-${prop.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
                return getPlanNode(nodesById, nodeId);
            }
        });

        return {
            sidebarRoot,
            sidebar,
            sidebarTopBorder,
            sidebarTitle,
            sidebarTitleBorder,
            sidebarDivider,
            closeMenuBtn,
            optsViewport,
            optsGroup,
            mainRoot,
            titleGroup,
            title,
            subtitle,
            mobileButtons,
            // Compiled nodes proxy for easy access
            nodes: compiledNodes,
            // Expose plan + nodesById for reflow on resize
            plan,
            nodesById
        };
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[Home] Failed to build compiled sidebar layout; falling back to imperative UI",
            context: { scope: "home", stage: "layout" }
        });
        return null;
    }
}

function buildHomeImperativeLayout({
    config,
    fonts,
    stageWidth,
    stageHeight,
    isPortrait,
    isAndroid
}) {
    if (!Konva) {
        return null;
    }

    const sidebarWidth = isPortrait ? stageWidth : (isAndroid ? 220 : 280);
    const sidebarOpacity = isPortrait ? (config?.ui?.mobile?.sidebar?.opacity ?? 0.9) : (config?.ui?.sidebar?.opacity ?? 0.88);
    const titleAlign = typeof config?.ui?.title?.align === "string" ? config.ui.title.align : "right";
    const titleColor = typeof config?.ui?.title?.color === "string" ? config.ui.title.color : "#F8F2FF";
    const configuredMobileTitleScale = Number(config?.ui?.mobile?.title?.scale);
    const mobileTitleScale = Number.isFinite(configuredMobileTitleScale) && configuredMobileTitleScale > 0
        ? configuredMobileTitleScale
        : 1.5;

    const sidebarTitleHeight = isPortrait ? 100 : (isAndroid ? 70 : 105);
    const sidebarTitleBorderPadding = isPortrait ? 24 : (isAndroid ? 18 : 24);
    const sidebarTitleBorderTop = isPortrait ? 90 : (isAndroid ? 62 : 96);

    const sidebarRoot = new Konva.Group({
        id: "home-sidebar-root",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: stageHeight
    });

    const sidebar = new Konva.Rect({
        id: "home-sidebar",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: stageHeight,
        fill: "#141126",
        opacity: sidebarOpacity,
        cornerRadius: 0,
        stroke: "rgba(184, 138, 239, 0.40)",
        strokeWidth: 1.5,
        shadowColor: "#080612",
        shadowBlur: 24,
        shadowOpacity: 0.65,
        shadowForStrokeEnabled: false,
        perfectDrawEnabled: false
    });

    const sidebarTopBorder = new Konva.Rect({
        id: "home-sidebar-top-border",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: 3,
        fill: "#F2A9D5",
        cornerRadius: 0,
        opacity: 0.9,
        perfectDrawEnabled: false
    });

    const sidebarTitle = new Konva.Text({
        id: "home-sidebar-title",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: sidebarTitleHeight,
        text: "🌸 Visual Novel",
        fontSize: scaleFontSize(isPortrait ? 26 : (isAndroid ? 22 : 26)),
        fontFamily: fonts["title"]?.name || fonts["title"] || "Cinzel",
        fontStyle: "bold",
        align: "center",
        verticalAlign: "middle",
        fill: "#F8F2FF",
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false,
        shadowColor: "#05030A",
        shadowBlur: 10,
        shadowOpacity: 0.7,
        shadowOffsetY: 2
    });

    const sidebarTitleBorder = new Konva.Rect({
        id: "home-sidebar-title-border",
        x: sidebarTitleBorderPadding,
        y: sidebarTitleBorderTop,
        width: sidebarWidth - (2 * sidebarTitleBorderPadding),
        height: 1,
        fill: "rgba(184, 138, 239, 0.35)"
    });

    const sidebarDivider = new Konva.Rect({
        id: "home-sidebar-divider",
        x: isPortrait ? sidebarWidth : (sidebarWidth - 1),
        y: 0,
        width: isPortrait ? 0 : 1,
        height: stageHeight,
        fill: "rgba(184, 138, 239, 0.25)"
    });

    const closeMenuBtn = new Konva.Image({
        id: "home-close-menu-btn",
        x: sidebarWidth - (isPortrait ? 70 : 55),
        y: 15,
        width: isPortrait ? 50 : 40,
        height: isPortrait ? 50 : 40,
        visible: isPortrait
    });

    const optsViewport = new Konva.Group({
        id: "home-opts-viewport",
        x: 0,
        y: isAndroid && !isPortrait ? 65 : 105,
        width: sidebarWidth
    });

    const optsGroup = new Konva.Group({
        id: "home-opts-group",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: stageHeight
    });

    optsViewport.add(optsGroup);
    sidebarRoot.add(sidebar, sidebarTopBorder, sidebarTitle, sidebarTitleBorder, sidebarDivider, closeMenuBtn, optsViewport);

    const mainRootX = isPortrait ? 0 : (isAndroid ? 240 : 350);
    const mainRootWidth = isPortrait ? stageWidth : Math.max(0, stageWidth - mainRootX);

    const mainRoot = new Konva.Group({
        id: "home-main-root",
        x: mainRootX,
        y: 0,
        width: mainRootWidth,
        height: stageHeight
    });

    const titleGroup = new Konva.Group({
        id: "home-title-group",
        x: 0,
        y: isPortrait ? (stageHeight * 0.2) : Math.max(0, stageHeight - 260),
        width: mainRootWidth,
        height: isPortrait ? (stageHeight * 0.6) : 260
    });

    const title = new Konva.Text({
        id: "home-title",
        x: isPortrait ? (-0.25 * mainRootWidth) : 0,
        y: 0,
        width: mainRootWidth,
        text: config.title,
        fontSize: scaleFontSize(isPortrait ? 44 : (isAndroid ? 44 : 76)),
        fontFamily: fonts["title"]?.name || fonts["title"] || "Cinzel",
        align: isPortrait ? "center" : titleAlign,
        padding: isPortrait ? 0 : (isAndroid ? 30 : 60),
        wrap: "word",
        fill: "#FFFFFF",
        stroke: "rgba(10, 6, 20, 0.95)",
        strokeWidth: 2,
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false,
        shadowColor: "#05030A",
        shadowBlur: 20,
        shadowOpacity: 0.95,
        shadowOffsetY: 4,
        letterSpacing: 2,
        scaleX: isPortrait ? mobileTitleScale : 1,
        scaleY: isPortrait ? mobileTitleScale : 1
    });

    const subtitle = new Konva.Text({
        id: "home-subtitle",
        x: 0,
        y: isPortrait ? 40 : (70 + (stageHeight * 0.006)),
        width: mainRootWidth,
        text: config.subtitle || "",
        fontSize: scaleFontSize(isPortrait ? 20 : (isAndroid ? 18 : 22)),
        fontFamily: fonts["other"]?.name || fonts["other"] || "Inter",
        align: isPortrait ? "center" : titleAlign,
        padding: isPortrait ? 60 : (isAndroid ? 30 : 60),
        wrap: "word",
        fill: "#F2A9D5",
        stroke: "rgba(10, 6, 20, 0.85)",
        strokeWidth: 1.2,
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false,
        shadowColor: "#05030A",
        shadowBlur: 14,
        shadowOpacity: 0.9,
        shadowOffsetY: 2,
        letterSpacing: 1.5
    });

    const mobileButtons = new Konva.Group({
        id: "home-mobile-buttons",
        x: 0,
        y: stageHeight * 0.72,
        width: mainRootWidth,
        height: 240
    });

    return {
        sidebarRoot,
        sidebar,
        sidebarTopBorder,
        sidebarTitle,
        sidebarTitleBorder,
        sidebarDivider,
        closeMenuBtn,
        optsViewport,
        optsGroup,
        mainRoot,
        titleGroup,
        title,
        subtitle,
        mobileButtons,
        plan: null,
        nodesById: null
    };
}

async function home(config, fonts, navigate) {
    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    window.onbeforeunload = () => { };

    const home_layer = new Konva.Layer();
    const origHomeDrawScene = home_layer.drawScene;
    home_layer.drawScene = function() {
        if (!this.getStage()) {
            return this;
        }
        return origHomeDrawScene.apply(this, arguments);
    };
    const origHomeDraw = home_layer.draw;
    home_layer.draw = function() {
        if (!this.getStage()) {
            return this;
        }
        return origHomeDraw.apply(this, arguments);
    };

    const width = konvaStage.width(),
        height = konvaStage.height();

    const img = new Image();
    img.src = isPortrait ? config.ui.mobile.poster.url : config.ui.poster.url;

    const image = new Konva.Image({
        image: img,
        opacity: isPortrait ? config.ui.mobile.poster.opacity : config.ui.poster.opacity
    });

    img.onload = () => {
        const scale = Math.max(width / img.width, height / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        image.scale({ x: scale, y: scale });

        if (isPortrait) {
            const rawOffset = config.ui.mobile["poster-offset"];
            const focalX = typeof rawOffset === "number" ? Math.min(1, Math.max(0, rawOffset)) : 0.5;
            const overflowX = Math.max(0, scaledWidth - width);
            image.x(-overflowX * focalX);
        } else {
            image.x((width - scaledWidth) / 2);
        }

        image.y((height - scaledHeight) / 2);
    };

    home_layer.add(image);

    const sidebarOffset = isPortrait ? 0 : (isAndroid ? 20 : 50);
    const sidebarWidth = isPortrait ? width : (isAndroid ? 220 : 280);

    const siderect = new Konva.Group({
        x: sidebarOffset,
        width: sidebarWidth,
        height: height,
        visible: isPortrait ? false : true
    });
    siderect.__vnsutraHistoryOverlay = "home-menu";

    const xmlLayoutEnabled = isXmlLayoutEnabled(config);

    const compiledHomeLayout = xmlLayoutEnabled
        ? await buildHomeCompiledLayout({
            config,
            fonts,
            stageWidth: width,
            stageHeight: height,
            isPortrait,
            isAndroid
        })
        : null;

    const usingCompiledHomeLayout = Boolean(compiledHomeLayout);

    const homeLayout = compiledHomeLayout ?? buildHomeImperativeLayout({
        config,
        fonts,
        stageWidth: width,
        stageHeight: height,
        isPortrait,
        isAndroid
    });

    const sidebarRoot = homeLayout?.sidebarRoot;
    const sidebarBorder = homeLayout?.sidebarDivider;
    const sidebar = homeLayout?.sidebar;
    const sidebar_title = homeLayout?.sidebarTitle;
    const closeMenuBtn = homeLayout?.closeMenuBtn;

    if (!sidebarRoot || !sidebar || !sidebar_title || !sidebarBorder || !closeMenuBtn) {
        console.error("[Home] Failed to build sidebar layout");
        return null;
    }

    const close_square_img = new Image();
    close_square_img.src = config.gui["close-icon"];
    closeMenuBtn.image(close_square_img.cloneNode(true));

    closeMenuBtn.on("mouseover", () => {
        closeMenuBtn.opacity(0.8);
        document.body.style.cursor = "pointer";
    });

    closeMenuBtn.on("mouseout", () => {
        closeMenuBtn.opacity(1);
        document.body.style.cursor = "auto";
    });

    closeMenuBtn.on("click touchstart", () => {
        animateBtn(closeMenuBtn);
        closeBar(siderect);
    });

    const add_img = new Image();
    add_img.src = config.gui["add-icon"];

    const actionbar = await actionBar(config, siderect, width, height, fonts, close_square_img, add_img);

    let credit_details = null;
    const getCreditDetails = () => credit_details ??= credits(config, actionbar, fonts);

    let settings_details = null;
    const getSettingsDetails = () => settings_details ??= settings(config, actionbar, fonts, getCreditDetails());

    const achievementsEnabled = Boolean(config?.ui?.achievements?.enabled);
    let achievements_details = null;
    const getAchievementsDetails = () => achievements_details ??= achievementsPage(config, actionbar, fonts);

    const chaptersEnabled = Boolean(config?.ui?.chapters?.enabled) && chapters.hasChapters();
    const chapterMapLabel = config?.ui?.chapters?.sidebarLabel || "Chapter Map";
    let chapters_details = null;
    const getChaptersDetails = () => {
        if (!chaptersEnabled) {
            return null;
        }

        return chapters_details ??= chaptersPage(config, actionbar, fonts, navigate);
    };

    const resolveDefaultStartPayload = () => {
        if (chaptersEnabled) {
            const chapter = chapters.getFirstPlayableChapter();
            if (chapter?.scene) {
                chapters.startChapter(chapter.id);
                return {
                    scene: chapter.scene,
                    chapterId: chapter.id
                };
            }
        }

        return {
            scene: "start"
        };
    };

    const closeActionbarAsync = () => new Promise((resolve) => {
        if (!actionbar.actionrect.visible()) {
            resolve();
            return;
        }

        actionbar.close(resolve, { animateButton: false });
    });

    const closeSidebarAsync = () => new Promise((resolve) => {
        if (!siderect.visible()) {
            resolve();
            return;
        }

        closeBar(siderect, resolve);
    });

    const activeTweens = new Set();
    const runTween = (node, params) => {
        if (!node || typeof node.to !== "function") {
            return null;
        }
        let tw = null;
        const userOnFinish = params.onFinish;
        tw = node.to({
            ...params,
            onFinish: () => {
                activeTweens.delete(tw);
                userOnFinish?.();
            }
        });
        if (tw) {
            activeTweens.add(tw);
        }
        return tw;
    };

    const stopAllTweens = () => {
        for (const tw of activeTweens) {
            try {
                tw.pause?.();
                tw.destroy?.();
            } catch (e) {
                void e;
            }
        }
        activeTweens.clear();
    };

    const goToGame = async (payload, { closeSidebar = false } = {}) => {
        stopAllTweens();
        const closeTasks = [closeActionbarAsync()];

        if (closeSidebar) {
            closeTasks.push(closeSidebarAsync());
        }

        await Promise.all(closeTasks);
        stopAllTweens();
        navigate("game", payload);
    };

    if (homeOverlayClosedHandler) {
        globalThis.removeEventListener("vnsutra:overlay-closed", homeOverlayClosedHandler);
    }

    homeOverlayClosedHandler = (event) => {
        // Only auto-close the menu on mobile portrait devices.
        if (!(isAndroid && isPortrait)) {
            return;
        }

        if (event?.detail?.overlayType !== "actionbar" || !siderect.visible()) {
            return;
        }

        closeBar(siderect);
    };

    globalThis.addEventListener("vnsutra:overlay-closed", homeOverlayClosedHandler);

    const optionRowHeight = isPortrait ? 78 : (isAndroid ? 56 : 64);

    const optsViewport = homeLayout?.optsViewport;
    const optsGroup = homeLayout?.optsGroup;
    if (!optsViewport) {
        console.error("[Home] Missing opts viewport from compiled layout");
        return null;
    }

    if (!optsGroup) {
        console.error("[Home] Missing opts group from compiled layout");
        return null;
    }

    // Calculate viewport height: sidebar height - title height - border height
    const sidebarHeight = sidebar.height();
    const titleHeight = sidebar_title.height();
    const borderHeight = 2; // from CSS
    const optsViewportHeight = sidebarHeight - titleHeight - borderHeight - 16;

    optsViewport.height(optsViewportHeight);
    const optsViewportWidth = optsViewport.width();

    // Set up clipping
    optsViewport.clipX(0);
    optsViewport.clipY(0);
    optsViewport.clipWidth(optsViewportWidth);
    optsViewport.clipHeight(optsViewportHeight);
    optsGroup.width(sidebar.width());
    optsGroup.height(optsViewportHeight);
    optsGroup.y(0);
    optsGroup.destroyChildren();

    const remove_img = new Image();
    remove_img.src = config.gui["remove-icon"];

    const loadgame_details = {
        render: async () => {
            await loadgame(config, actionbar, "Load Game", fonts, remove_img, (details) => {
                void goToGame({ ...details }, { closeSidebar: isPortrait });
            });
        },
    };

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Cancel";
    closeBtn.className = "btn btn-outline hover:bg-inherit";
    closeBtn.style.borderColor = config.colors.text;
    closeBtn.style.color = config.colors.text;
    closeBtn.onclick = () => {
        document.getElementById("alert-win").classList.replace("flex", "hidden");
    };

    const proceedBtn = document.createElement("button");
    proceedBtn.innerText = "Exit";
    proceedBtn.className = "btn hover:bg-inherit border-0";
    proceedBtn.style.backgroundColor = config.colors.primary;
    proceedBtn.style.color = config.colors["primary-text"];

    const alertWin = new AlertWindow("Are you sure you want to quit?", [closeBtn, proceedBtn], config);
    alertWin.color = config.colors.primary;

    let activeOptionName = "New Game";

    const ICONS = {
        continue: "M7.5 4.8c-.8-.5-1.8.1-1.8 1.1v12.2c0 1 1 1.6 1.8 1.1l10.5-6.1c.8-.5.8-1.7 0-2.2L7.5 4.8z",
        newGame: "M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z",
        loadGame: "M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z",
        chapters: "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
        achievements: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H8v2h8v-2h-3v-3.1c1.94-.38 3.5-1.93 3.9-3.92C19.16 11.64 21 9.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
        settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.49.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.63 8.47c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.49.41h4c.24 0 .44-.17.49-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
        credits: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
        fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
        quit: "M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
    };

    const opts = [
        {
            id: "continue",
            name: "Continue",
            iconPath: ICONS.continue,
            onclick: async (btnHolder) => {
                btnHolder?.fire?.("mouseout");
                try {
                    const candidates = [];

                    // 1. Check auto-save checkpoint
                    try {
                        const autosave = await autoSave?.load?.();
                        if (autosave?.scene) {
                            candidates.push(autosave);
                        }
                    } catch (e) {
                        void e;
                    }

                    // 2. Check manual save slots
                    try {
                        const savedGames = await storage?.get?.("saved-games");
                        if (Array.isArray(savedGames) && savedGames.length > 0) {
                            for (const save of savedGames) {
                                if (save?.scene) {
                                    candidates.push(save);
                                }
                            }
                        }
                    } catch (e) {
                        void e;
                    }

                    // Pick the most recent save by timestamp
                    candidates.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
                    const latestSave = candidates[0];

                    if (latestSave?.scene) {
                        await goToGame({ ...latestSave }, { closeSidebar: isPortrait });
                    } else {
                        await goToGame(resolveDefaultStartPayload(), { closeSidebar: isPortrait });
                    }
                } catch {
                    await goToGame(resolveDefaultStartPayload(), { closeSidebar: isPortrait });
                }
            }
        },
        {
            id: "newGame",
            name: "New Game",
            iconPath: ICONS.newGame,
            isActive: true,
            onclick: async (btnHolder) => {
                btnHolder?.fire?.("mouseout");
                await goToGame(resolveDefaultStartPayload(), { closeSidebar: isPortrait });
            }
        },
        {
            id: "loadGame",
            name: "Load Game",
            iconPath: ICONS.loadGame,
            onclick: async (btnHolder) => {
                if (getOpenWindow() === "loadgame") {
                    btnHolder?.fire?.("mouseout");
                    return;
                }
                actionbar.switchView(async () => {
                    await loadgame_details.render();
                });
                btnHolder?.fire?.("mouseout");
            }
        },
        ...(chaptersEnabled ? [{
            id: "chapters",
            name: chapterMapLabel,
            iconPath: ICONS.chapters,
            onclick: () => {
                if (getOpenWindow() === "chapters") {
                    return;
                }
                actionbar.switchView(() => {
                    getChaptersDetails()?.render?.();
                });
            }
        }] : []),
        {
            id: "settings",
            name: "Settings",
            iconPath: ICONS.settings,
            onclick: () => {
                if (getOpenWindow() === "settings") {
                    return;
                }
                actionbar.switchView(() => {
                    getSettingsDetails().render();
                });
            }
        },
        {
            id: "credits",
            name: "Credits",
            iconPath: ICONS.credits,
            onclick: () => {
                if (getOpenWindow() === "credits") {
                    return;
                }
                actionbar.switchView(() => {
                    getCreditDetails().render();
                });
            }
        },
        ...(achievementsEnabled ? [{
            id: "achievements",
            name: "Achievements",
            iconPath: ICONS.achievements,
            onclick: () => {
                if (getOpenWindow() === "achievements") {
                    return;
                }
                actionbar.switchView(() => {
                    getAchievementsDetails().render();
                });
            }
        }] : []),
        {
            id: "fullscreen",
            name: "Fullscreen",
            iconPath: ICONS.fullscreen,
            onclick: () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            }
        },
        {
            id: "quit",
            name: "Quit",
            iconPath: ICONS.quit,
            onclick: () => {
                proceedBtn.onclick = () => {
                    alertWin.close();
                    if (typeof globalThis.closeApp === "function") {
                        globalThis.closeApp();
                        return;
                    }
                    if (globalThis.opener && typeof globalThis.close === "function") {
                        try { globalThis.close(); } catch (e) { void e; }
                        return;
                    }
                    const runtimeExit = getExitApp();
                    if (typeof runtimeExit === "function") {
                        const handled = runtimeExit();
                        if (handled !== false) {
                            return;
                        }
                    }
                    try {
                        history.go(-history.length);
                    } catch (e) {
                        globalThis.location.href = "about:blank";
                    }
                };
                alertWin.show();
            }
        }
    ];

    let lastScrollTs = 0;
    const markScrolling = () => {
        lastScrollTs = Date.now();
    };

    const shouldSuppressOptionActivation = () => (Date.now() - lastScrollTs) < 220;

    const optionPillsList = [];

    for (let j = 0; j < opts.length; j++) {
        const opt = opts[j];

        const opt_group = new Konva.Group({
            width: sidebar.width(),
            height: optionRowHeight,
            y: j * optionRowHeight
        });

        const horizontalInset = isPortrait ? 18 : (isAndroid ? 10 : 14);
        const pillWidth = sidebar.width() - 2 * horizontalInset;
        const pillHeight = optionRowHeight - 10;

        const isItemActive = (opt.name === activeOptionName);

        const opt_pill = new Konva.Rect({
            x: isItemActive ? (horizontalInset + 6) : horizontalInset,
            y: 5,
            width: pillWidth,
            height: pillHeight,
            cornerRadius: 18,
            fill: isItemActive ? "rgba(168, 85, 247, 0.38)" : "rgba(255, 255, 255, 0.0)",
            stroke: isItemActive ? "rgba(244, 114, 182, 0.85)" : "rgba(255, 255, 255, 0.0)",
            strokeWidth: isItemActive ? 1.5 : 1,
            shadowColor: "#E879F9",
            shadowBlur: isItemActive ? 14 : 0,
            shadowOpacity: isItemActive ? 0.4 : 0,
            shadowForStrokeEnabled: false,
            perfectDrawEnabled: false
        });

        const sakuraBadge = new Konva.Text({
            x: horizontalInset + pillWidth - 28,
            y: 5 + (pillHeight - scaleFontSize(14)) / 2,
            text: "🌸",
            fontSize: scaleFontSize(13),
            visible: isItemActive
        });

        const iconScale = isPortrait ? 1.05 : (isAndroid ? 0.85 : 0.95);
        const iconBaseX = horizontalInset + 16;
        const iconData = opt.iconPath || ICONS[opt.id] || ICONS.continue;
        const opt_icon = (typeof Konva.Path === "function")
            ? new Konva.Path({
                x: isItemActive ? (iconBaseX + 6) : iconBaseX,
                y: 5 + (pillHeight - (24 * iconScale)) / 2,
                data: iconData,
                fill: isItemActive ? "#FFFFFF" : "#C4B6DC",
                scale: { x: iconScale, y: iconScale }
            })
            : new Konva.Text({
                x: isItemActive ? (iconBaseX + 6) : iconBaseX,
                y: 5 + (pillHeight - scaleFontSize(16)) / 2,
                text: "•",
                fill: isItemActive ? "#FFFFFF" : "#C4B6DC"
            });

        const textPaddingLeft = horizontalInset + 52;
        const opt_text = new Konva.Text({
            align: "left",
            padding: 0,
            x: isItemActive ? (textPaddingLeft + 6) : textPaddingLeft,
            y: (optionRowHeight - scaleFontSize(isPortrait ? 18 : (isAndroid ? 15 : 17))) / 2 - 1,
            verticalAlign: "middle",
            width: sidebar.width() - textPaddingLeft - 32,
            text: opt.name,
            fontFamily: fonts["other"]?.name || "Inter",
            fontSize: scaleFontSize(isPortrait ? 18 : (isAndroid ? 15 : 17)),
            fill: isItemActive ? "#FFFFFF" : "#C4B6DC",
            fontStyle: isItemActive ? "bold" : "normal",
            fillAfterStrokeEnabled: true,
        });

        optionPillsList.push({
            name: opt.name,
            pill: opt_pill,
            text: opt_text,
            icon: opt_icon,
            sakura: sakuraBadge,
            baseX: horizontalInset,
            textBaseX: textPaddingLeft,
            iconBaseX
        });

        opt_group.on("mouseover", () => {
            if (activeOptionName !== opt.name) {
                runTween(opt_pill, {
                    x: horizontalInset + 6,
                    fill: "rgba(168, 85, 247, 0.22)",
                    stroke: "rgba(244, 114, 182, 0.55)",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                runTween(opt_text, {
                    x: textPaddingLeft + 6,
                    fill: "#FFFFFF",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                runTween(opt_icon, {
                    x: iconBaseX + 6,
                    fill: "#FFFFFF",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
            }
            document.body.style.cursor = "pointer";
        });

        opt_group.on("mouseout", () => {
            if (activeOptionName !== opt.name) {
                runTween(opt_pill, {
                    x: horizontalInset,
                    fill: "rgba(255, 255, 255, 0.0)",
                    stroke: "rgba(255, 255, 255, 0.0)",
                    shadowBlur: 0,
                    shadowOpacity: 0,
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                runTween(opt_text, {
                    x: textPaddingLeft,
                    fill: "#C4B6DC",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                runTween(opt_icon, {
                    x: iconBaseX,
                    fill: "#C4B6DC",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
            }
            document.body.style.cursor = "auto";
        });

        const activateOption = () => {
            if (shouldSuppressOptionActivation()) {
                return;
            }

            activeOptionName = opt.name;
            for (const item of optionPillsList) {
                const isActive = (item.name === activeOptionName);
                runTween(item.pill, {
                    x: isActive ? (item.baseX + 6) : item.baseX,
                    fill: isActive ? "rgba(168, 85, 247, 0.38)" : "rgba(255, 255, 255, 0.0)",
                    stroke: isActive ? "rgba(244, 114, 182, 0.85)" : "rgba(255, 255, 255, 0.0)",
                    strokeWidth: isActive ? 1.5 : 1,
                    shadowBlur: isActive ? 14 : 0,
                    shadowOpacity: isActive ? 0.4 : 0,
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                runTween(item.text, {
                    x: isActive ? (item.textBaseX + 6) : item.textBaseX,
                    fill: isActive ? "#FFFFFF" : "#C4B6DC",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                runTween(item.icon, {
                    x: isActive ? (item.iconBaseX + 6) : item.iconBaseX,
                    fill: isActive ? "#FFFFFF" : "#C4B6DC",
                    duration: 0.18,
                    easing: Konva?.Easings?.EaseOut
                });
                item.text.fontStyle(isActive ? "bold" : "normal");
                item.sakura.visible(isActive);
            }
            home_layer.batchDraw();

            if (opt.onclick) {
                if (opt.onclick.length > 0) {
                    opt.onclick(opt_group);
                } else {
                    opt.onclick();
                }
            }
        };

        opt_group.on("click tap", activateOption);

        opt_group.add(opt_pill, opt_icon, opt_text, sakuraBadge);
        optsGroup.add(opt_group);
    }

    const optsContentHeight = opts.length * optionRowHeight;
    const optsOverflow = Math.max(0, optsContentHeight - optsViewportHeight);
    let resetOptsScroll = () => { };

    if (optsOverflow > 0) {
        let scrollY = 0;
        const optsViewportAbsY = optsViewport.y();
        let inertiaVelocity = 0;
        let inertiaRaf = null;
        let inertiaLastTs = 0;
        let lastDragTs = 0;
        let wheelInertiaTimeout = null;
        let lastWheelTs = 0;

        const stopInertia = () => {
            if (inertiaRaf !== null) {
                cancelAnimationFrame(inertiaRaf);
                inertiaRaf = null;
            }
            inertiaLastTs = 0;
            inertiaVelocity = 0;
            if (wheelInertiaTimeout) {
                clearTimeout(wheelInertiaTimeout);
                wheelInertiaTimeout = null;
            }
        };

        const runInertia = () => {
            if (Math.abs(inertiaVelocity) < 0.02) {
                stopInertia();
                return;
            }

            const step = (ts) => {
                if (!inertiaLastTs) {
                    inertiaLastTs = ts;
                }

                const dt = Math.min(32, Math.max(8, ts - inertiaLastTs));
                inertiaLastTs = ts;

                const prevY = scrollY;
                setScroll(prevY + (inertiaVelocity * dt));
                const moved = scrollY - prevY;

                if (Math.abs(moved) < 0.01) {
                    stopInertia();
                    updateIndicators();
                    return;
                }

                inertiaVelocity *= Math.pow(0.92, dt / 16);
                if (Math.abs(inertiaVelocity) < 0.02) {
                    stopInertia();
                    updateIndicators();
                    return;
                }

                updateIndicators();
                inertiaRaf = requestAnimationFrame(step);
            };

            if (inertiaRaf !== null) {
                cancelAnimationFrame(inertiaRaf);
            }
            inertiaLastTs = 0;
            inertiaRaf = requestAnimationFrame(step);
        };

        const clampScroll = (value) => Math.max(-optsOverflow, Math.min(0, value));
        const setScroll = (value) => {
            scrollY = clampScroll(value);
            optsGroup.y(scrollY);
            markScrolling();
            optsViewport.getLayer()?.batchDraw();
        };

        const indicatorColor = config.colors.text;
        const indicatorSize = 8;
        const indicatorCenterX = sidebar.width() / 2;

        const topFade = new Konva.Rect({
            x: 0,
            y: 0,
            width: sidebar.width() - 1,
            height: 28,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: 0, y: 28 },
            fillLinearGradientColorStops: [0, config.colors.menu, 1, "rgba(0,0,0,0)"],
            listening: false
        });

        const bottomFade = new Konva.Rect({
            x: 0,
            y: optsViewportHeight - 28,
            width: sidebar.width() - 1,
            height: 28,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: 0, y: 28 },
            fillLinearGradientColorStops: [0, "rgba(0,0,0,0)", 1, config.colors.menu],
            listening: false
        });

        const topIndicator = new Konva.Line({
            points: [
                indicatorCenterX - indicatorSize, 18,
                indicatorCenterX, 10,
                indicatorCenterX + indicatorSize, 18
            ],
            stroke: indicatorColor,
            strokeWidth: 2,
            lineCap: "round",
            lineJoin: "round",
            opacity: 0.7,
            listening: false
        });

        const bottomIndicator = new Konva.Line({
            points: [
                indicatorCenterX - indicatorSize, optsViewportHeight - 18,
                indicatorCenterX, optsViewportHeight - 10,
                indicatorCenterX + indicatorSize, optsViewportHeight - 18
            ],
            stroke: indicatorColor,
            strokeWidth: 2,
            lineCap: "round",
            lineJoin: "round",
            opacity: 0.7,
            listening: false
        });

        const updateIndicators = () => {
            topIndicator.visible(scrollY < 0);
            bottomIndicator.visible(scrollY > -optsOverflow);
        };

        optsGroup.draggable(true);
        optsGroup.dragBoundFunc((pos) => ({
            x: 0,
            y: optsViewportAbsY + clampScroll(pos.y - optsViewportAbsY)
        }));

        optsGroup.on("dragstart", () => {
            stopInertia();
            markScrolling();
            lastDragTs = performance.now();
            inertiaVelocity = 0;
        });

        optsGroup.on("dragmove", () => {
            markScrolling();
            const prevY = scrollY;
            scrollY = clampScroll(optsGroup.y());
            if (optsGroup.y() !== scrollY) {
                optsGroup.y(scrollY);
            }

            const now = performance.now();
            const dt = Math.max(1, now - lastDragTs);
            const moved = scrollY - prevY;
            inertiaVelocity = moved / dt;
            lastDragTs = now;

            updateIndicators();
        });

        optsGroup.on("dragend", () => {
            markScrolling();
            runInertia();
            updateIndicators();
        });

        optsViewport.on("wheel", (event) => {
            event.evt.preventDefault();
            stopInertia();

            const prevY = scrollY;
            setScroll(scrollY - (event.evt.deltaY * 0.8));
            const now = performance.now();
            const dt = Math.max(1, lastWheelTs ? (now - lastWheelTs) : 16);
            const moved = scrollY - prevY;
            const instantVelocity = moved / dt;
            inertiaVelocity = (inertiaVelocity * 0.55) + (instantVelocity * 0.45);
            lastWheelTs = now;

            if (wheelInertiaTimeout) {
                clearTimeout(wheelInertiaTimeout);
            }
            wheelInertiaTimeout = setTimeout(() => {
                runInertia();
            }, 55);

            updateIndicators();
        });

        resetOptsScroll = () => {
            setScroll(0);
            updateIndicators();
        };

        updateIndicators();
        optsViewport.add(topFade, bottomFade, topIndicator, bottomIndicator);
    }

    siderect.add(sidebarRoot);

    const main_group = homeLayout?.mainRoot;
    const title_group = homeLayout?.titleGroup;
    const title = homeLayout?.title;
    const subtitle = homeLayout?.subtitle;

    if (!main_group || !title_group || !title || !subtitle) {
        console.error("[Home] Failed to load compiled title group elements from layout");
        return null;
    }

    title_group.visible(true);

    if (!isPortrait) {
        title_group.y(height - (subtitle.y() + subtitle.height()));
    } else {
        title_group.y((height / 2) - ((title.height() * title.scaleX()) + subtitle.height()));
    }

    if (!usingCompiledHomeLayout) {
        title_group.add(title, subtitle);
    }

    const btnimage = new Image();

    if (config.gui.button) {
        btnimage.src = config.gui.button;
    }

    const btns = isPortrait ? [
        {
            name: "New Game", onclick: async () => {
                await goToGame(resolveDefaultStartPayload(), { closeSidebar: isPortrait });
            }
        },
        {
            name: "Load Game", onclick: async () => {
                await loadgame_details.render();
                openBar(actionbar.actionrect);
            }
        },
        {
            name: "More", onclick: () => {
                resetOptsScroll();
                openBar(siderect);
            }
        }
    ] : [];

    const mobileButtonFontSize = scaleFontSize(isPortrait ? 18 : (isAndroid ? 15 : 16));

    const btny = main_group.height() - (btns.length * 60 + 20);

    const btns_holder = homeLayout?.mobileButtons;

    if (!btns_holder) {
        console.error("[Home] Missing mobile button holder");
        return null;
    }

    if (btns_holder) {
        btns_holder.width(width - 60);
        btns_holder.height(btns.length * 50);
        btns_holder.x(30);
        btns_holder.y(btny);
        btns_holder.removeChildren();
    }

    for (let i = 0; i < btns.length; i++) {
        const btn = btns[i];

        const btn_group = new Konva.Group({
            width: btns_holder.width(),
            height: 50,
            y: i * 60
        });

        btn_group.on("mouseover", () => {
            btn_group.scale({ x: 1.05, y: 1.05 });
            const widthdiff = btn_group.width() * (0.05);
            const heightdiff = btn_group.height() * (0.05);
            btn_group.x(0 - widthdiff / 2);
            btn_group.y(i * 60 - heightdiff / 2);
            document.body.style.cursor = "pointer";
        });

        btn_group.on("mouseout", () => {
            btn_group.scale({ x: 1, y: 1 });
            btn_group.x(0);
            btn_group.y(i * 60);
            document.body.style.cursor = "auto";
        });

        const btn_rect = new Konva.Rect({
            width: btn_group.width(),
            height: 50
        });

        let btn_img;

        if (config.gui.button !== null) {
            btn_img = new Konva.Image({
                width: btn_group.width(),
                height: btn_rect.height(),
                image: btnimage
            });
        } else {
            btn_img = new Konva.Rect({
                width: btn_group.width(),
                height: btn_rect.height(),
                fill: config.colors.button ?? config.colors.primary,
                cornerRadius: btn_group.width() / 2
            });
        }


        const btntext = new Konva.Text({
            align: "center",
            verticalAlign: "middle",
            width: btn_group.width(),
            height: btn_rect.height(),
            text: btn.name,
            fontFamily: fonts["other"],
            fontSize: mobileButtonFontSize,
            fill: config.colors["button-text"],
            fillAfterStrokeEnabled: true
        });

        btn_group.on("click touchstart", () => {
            btntext.to({
                scaleX: 1.04,
                scaleY: 1.04,
                duration: 0.09,
                easing: Konva?.Easings?.EaseOut,
                onFinish: () => {
                    btntext.to({
                        scaleX: 1,
                        scaleY: 1,
                        duration: 0.14,
                        easing: Konva?.Easings?.BackEaseOut
                    });
                },
            });

            btn.onclick();
        });

        btn_group.add(btn_img);
        btn_group.add(btn_rect);
        btn_group.add(btntext);

        btns_holder.add(btn_group);
    }

    if (!usingCompiledHomeLayout) {
        main_group.add(title_group, btns_holder);
    }


    home_layer.add(main_group);
    home_layer.add(siderect, actionbar.actionrect);

    const playIntroTransition = () => {
        const gameSettings = getGameSettings();
        if (gameSettings && gameSettings[STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION]) {
            return;
        }

        if (!isPortrait) {
            const targetX = siderect.x();
            siderect.x(targetX - 32);
            siderect.opacity(0);
            runTween(siderect, {
                x: targetX,
                opacity: 1,
                duration: 0.55,
                easing: Konva?.Easings?.EaseOut
            });

            if (title_group) {
                const targetY = title_group.y();
                title_group.y(targetY + 18);
                title_group.opacity(0);
                runTween(title_group, {
                    y: targetY,
                    opacity: 1,
                    duration: 0.65,
                    easing: Konva?.Easings?.EaseOut
                });
            }
        } else {
            if (btns_holder) {
                const targetY = btns_holder.y();
                btns_holder.y(targetY + 24);
                btns_holder.opacity(0);
                runTween(btns_holder, {
                    y: targetY,
                    opacity: 1,
                    duration: 0.55,
                    easing: Konva?.Easings?.EaseOut
                });
            }

            if (title_group) {
                const targetY = title_group.y();
                title_group.y(targetY - 14);
                title_group.opacity(0);
                runTween(title_group, {
                    y: targetY,
                    opacity: 1,
                    duration: 0.65,
                    easing: Konva?.Easings?.EaseOut
                });
            }
        }
    };

    return ({
        layer: home_layer,
        menuOverlay: siderect,
        playIntroTransition,
        stopTweens: stopAllTweens,
        get settings() { return getSettingsDetails(); },
        get credits() { return getCreditDetails(); },
        loadgame: loadgame_details,
        get chapters() { return getChaptersDetails(); },
        get achievements() { return getAchievementsDetails(); },
        actionbar: actionbar,
    });
}

export { home };
export default home;