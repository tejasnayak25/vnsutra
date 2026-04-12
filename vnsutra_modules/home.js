import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { konvaStage } from "./stage.js";
import { getIsPortrait, getIsAndroid, getExitApp, getOpenWindow, scaleFontSize } from "./runtime-state.js";
import { animateBtn, openBar, closeBar } from "./ui/utils.js";
import actionBar from "./ui/actionbar.js";
import credits from "./credits.js";
import settings from "./settings.js";
import loadgame from "./loadgame.js";
import achievementsPage from "./achievements-page.js";
import chaptersPage from "./chapters-page.js";
import chapters from "./chapters.js";
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

        const sidebarTitleSize = isPortrait ? 30 : (isAndroid ? 25 : 30);
        const titleSize = isPortrait ? 50 : (isAndroid ? 50 : 90);
        const subtitleSize = isPortrait ? 30 : (isAndroid ? 25 : 30);

        sidebarTitle.setAttrs({
            text: "Menu",
            fontSize: scaleFontSize(sidebarTitleSize)
        });

        title.setAttrs({
            text: config.title,
            fontSize: scaleFontSize(titleSize),
            fillAfterStrokeEnabled: true
        });

        subtitle.setAttrs({
            text: config.subtitle || "",
            fontSize: scaleFontSize(subtitleSize),
            fillAfterStrokeEnabled: true
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

    const sidebarWidth = isPortrait ? stageWidth : (isAndroid ? 180 : 250);
    const sidebarOpacity = isPortrait ? (config?.ui?.mobile?.sidebar?.opacity ?? 0.9) : (config?.ui?.sidebar?.opacity ?? 0.8);
    const titleAlign = typeof config?.ui?.title?.align === "string" ? config.ui.title.align : "right";
    const titleColor = typeof config?.ui?.title?.color === "string" ? config.ui.title.color : config.colors.text;
    const configuredMobileTitleScale = Number(config?.ui?.mobile?.title?.scale);
    const mobileTitleScale = Number.isFinite(configuredMobileTitleScale) && configuredMobileTitleScale > 0
        ? configuredMobileTitleScale
        : 1.5;

    const sidebarTitleHeight = isPortrait ? 90 : (isAndroid ? 60 : 95);
    const sidebarTitleBorderPadding = isPortrait ? 30 : (isAndroid ? 20 : 30);
    const sidebarTitleBorderTop = isPortrait ? 80 : (isAndroid ? 50 : 85);

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
        fill: config.colors.menu,
        opacity: sidebarOpacity
    });

    const sidebarTopBorder = new Konva.Rect({
        id: "home-sidebar-top-border",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: 6,
        fill: config.colors.primary
    });

    const sidebarTitle = new Konva.Text({
        id: "home-sidebar-title",
        x: 0,
        y: 0,
        width: sidebarWidth,
        height: sidebarTitleHeight,
        text: "Menu",
        fontSize: scaleFontSize(isPortrait ? 30 : (isAndroid ? 25 : 30)),
        fontFamily: fonts["other"],
        align: "center",
        verticalAlign: "middle",
        fill: config.colors.text,
        fillAfterStrokeEnabled: true
    });

    const sidebarTitleBorder = new Konva.Rect({
        id: "home-sidebar-title-border",
        x: sidebarTitleBorderPadding,
        y: sidebarTitleBorderTop,
        width: sidebarWidth - (2 * sidebarTitleBorderPadding),
        height: 2,
        fill: config.colors["menu-border"]
    });

    const sidebarDivider = new Konva.Rect({
        id: "home-sidebar-divider",
        x: isPortrait ? sidebarWidth : (sidebarWidth - 1),
        y: 0,
        width: isPortrait ? 0 : 1,
        height: stageHeight,
        fill: config.colors.primary
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
        y: isAndroid && !isPortrait ? 62 : 97,
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

    const mainRootX = isPortrait ? 0 : (isAndroid ? 180 : 250);
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
        fontSize: scaleFontSize(isPortrait ? 50 : (isAndroid ? 50 : 90)),
        fontFamily: fonts["title"],
        align: isPortrait ? "center" : titleAlign,
        padding: isPortrait ? 0 : (isAndroid ? 30 : 60),
        wrap: "word",
        fill: titleColor,
        fillAfterStrokeEnabled: true,
        scaleX: isPortrait ? mobileTitleScale : 1,
        scaleY: isPortrait ? mobileTitleScale : 1
    });

    const subtitle = new Konva.Text({
        id: "home-subtitle",
        x: 0,
        y: isPortrait ? 40 : (74 + (stageHeight * 0.006)),
        width: mainRootWidth,
        text: config.subtitle || "",
        fontSize: scaleFontSize(isPortrait ? 30 : (isAndroid ? 25 : 30)),
        fontFamily: fonts["other"],
        align: isPortrait ? "center" : titleAlign,
        padding: isPortrait ? 60 : (isAndroid ? 30 : 60),
        wrap: "word",
        fill: titleColor,
        fillAfterStrokeEnabled: true
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

    const siderect = new Konva.Group({
        width: isPortrait ? width : (isAndroid ? 180 : 250),
        height: height,
        visible: isPortrait ? false : true
    });
    siderect.__vnsutraHistoryOverlay = "home-menu";

    const xmlLayoutEnabled = isXmlLayoutEnabled(config);

    const compiledHomeLayout = xmlLayoutEnabled
        ? await buildHomeCompiledLayout({
            config,
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
        document.body.style.cursor = "pointer";
    });

    closeMenuBtn.on("mouseout", () => {
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

    const goToGame = async (payload, { closeSidebar = false } = {}) => {
        const closeTasks = [closeActionbarAsync()];

        if (closeSidebar) {
            closeTasks.push(closeSidebarAsync());
        }

        await Promise.all(closeTasks);
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

    const optionRowHeight = isPortrait ? 80 : (isAndroid ? 55 : 70);

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
    const optsViewportHeight = sidebarHeight - titleHeight - borderHeight;

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
    optsGroup.removeChildren();

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

    const opts = [
        {
            name: "New Game", onclick: async (btnHolder) => {
                btnHolder.fire("mouseout");
                await goToGame(resolveDefaultStartPayload(), { closeSidebar: isPortrait });
            }
        },
        ...(chaptersEnabled ? [{
            name: chapterMapLabel, onclick: () => {
                if (getOpenWindow() === "chapters") {
                    return;
                }
                openBar(actionbar.actionrect, () => {
                    getChaptersDetails()?.render?.();
                });
            }
        }] : []),
        {
            name: "Load Game", onclick: async (btnHolder) => {
                if (getOpenWindow() === "loadgame") {
                    btnHolder.fire("mouseout");
                    return;
                }
                await loadgame_details.render();
                openBar(actionbar.actionrect);
                btnHolder.fire("mouseout");
            }
        },
        {
            name: "Settings", onclick: () => {
                if (getOpenWindow() === "settings") {
                    return;
                }
                getSettingsDetails().render();
                openBar(actionbar.actionrect);
            }
        },
        {
            name: "Credits", onclick: () => {
                if (getOpenWindow() === "credits") {
                    return;
                }
                getCreditDetails().render();
                openBar(actionbar.actionrect);
            }
        },
        ...(achievementsEnabled ? [{
            name: "Achievements", onclick: () => {
                if (getOpenWindow() === "achievements") {
                    return;
                }
                getAchievementsDetails().render();
                openBar(actionbar.actionrect);
            }
        }] : []),
        {
            name: "Fullscreen", onclick: () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
            }
        },
        {
            name: "Exit", onclick: () => {
                proceedBtn.onclick = () => {
                    alertWin.close();
                    if (typeof globalThis.closeApp === "function") {
                        globalThis.closeApp();
                        return;
                    }

                    // Only call `close()` if the window was opened by a script (has an opener).
                    if (globalThis.opener && typeof globalThis.close === "function") {
                        try { globalThis.close(); } catch (e) { void e; }
                        return;
                    }

                    // Use the runtime accessor so we always invoke the current exit implementation.
                    const runtimeExit = getExitApp();
                    if (typeof runtimeExit === "function") {
                        runtimeExit();
                        return;
                    }

                    // Fallback: prefer history.back or navigate away to avoid invoking `close()` illegally.
                    if (globalThis.history && globalThis.history.length > 1) {
                        history.back();
                    } else {
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

    for (let j = 0; j < opts.length; j++) {
        const opt = opts[j];

        const opt_group = new Konva.Group({
            width: sidebar.width(),
            height: optionRowHeight,
            y: j * optionRowHeight
        });

        const opt_text = new Konva.Text({
            align: "left",
            padding: isPortrait ? 60 : (isAndroid ? 20 : 30),
            verticalAlign: "middle",
            width: sidebar.width(),
            height: optionRowHeight,
            text: opt.name,
            fontFamily: fonts["other"],
            fontSize: scaleFontSize(isPortrait ? 30 : (isAndroid ? 25 : 30)),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
        });

        opt_group.on("mouseover", () => {
            opt_text.to({
                x: isPortrait ? 60 : (isAndroid ? 60 : 30),
                duration: 0.1
            });
            document.body.style.cursor = "pointer";
        });

        opt_group.on("mouseout", () => {
            opt_text.to({
                x: 0,
                duration: 0.1
            });
            document.body.style.cursor = "auto";
        });

        const activateOption = () => {
            if (shouldSuppressOptionActivation()) {
                return;
            }

            opt_text.to({
                scaleX: 1.04,
                duration: 0.05,
                onFinish: () => {
                    opt_text.to({
                        scaleX: 1,
                        duration: 0.05
                    });
                },
            });

            if (opt.onclick) {
                if (opt.onclick.length > 0) {
                    opt.onclick(opt_group);
                } else {
                    opt.onclick();
                }
            }
        };

        opt_group.on("click tap", activateOption);

        opt_group.add(opt_text);
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

    const mobileButtonFontSize = scaleFontSize(isPortrait ? 22 : (isAndroid ? 16 : 18));

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
                duration: 0.05,
                onFinish: () => {
                    btntext.to({
                        scaleX: 1,
                        duration: 0.05
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

    return ({
        layer: home_layer,
        menuOverlay: siderect,
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