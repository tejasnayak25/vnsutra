import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { konvaStage } from "./stage.js";
import { getIsPortrait, getIsMobile, getIsAndroid, getState, getActiveScene, getInstructionCount, setGameKeyboardActions, setShouldAbortGame, getAbortInstruction, scaleFontSize } from "./runtime-state.js";
import { storage } from "./storage.js";
import { animateBtn, openBar, closeBar, isBarOpen, animateMenu, loadImg } from "./ui/utils.js";
import actionBar from "./ui/actionbar.js";
import loadgame from "./loadgame.js";
import AlertWindow from "./alert-window.js";
import errorTracking from "./error-tracking.js";
import { buildSavedGameEntry } from "./save-utils.js";
import { createQuickLoadHandler } from "./quick-load-utils.js";
import chapters from "./chapters.js";
import { createKonvaNodesFromPlan } from "./ui-layout/runtime.js";

const Konva = globalThis.Konva;

let gameuiLayoutPlanCache = null;
let gameuiLayoutPlanPromise = null;

function isXmlLayoutEnabled(config) {
    return config?.ui?.["xml-mode"] !== false;
}

async function loadGameUiLayoutPlan() {
    if (gameuiLayoutPlanCache) {
        return gameuiLayoutPlanCache;
    }

    if (gameuiLayoutPlanPromise) {
        return gameuiLayoutPlanPromise;
    }

    gameuiLayoutPlanPromise = (async () => {
        try {
            const response = await fetch("../game/.ui-cache/gameui.ui.json", { cache: "no-store" });
            if (!response.ok) {
                return null;
            }

            const plan = await response.json();
            if (!plan || !Array.isArray(plan.nodes)) {
                return null;
            }

            gameuiLayoutPlanCache = plan;
            return plan;
        } catch {
            return null;
        }
    })();

    try {
        return await gameuiLayoutPlanPromise;
    } finally {
        gameuiLayoutPlanPromise = null;
    }
}

function getPlanNode(nodesById, nodeId) {
    const entry = nodesById.get(nodeId);
    return entry?.node ?? null;
}

async function buildGameUiCompiledLayout({
    stageWidth,
    stageHeight,
    isPortrait,
    isAndroid
}) {
    const plan = await loadGameUiLayoutPlan();
    if (!plan || !Konva) {
        return null;
    }

    try {
        const { nodesById } = createKonvaNodesFromPlan({
            Konva,
            plan,
            context: {
                stageWidth,
                stageHeight,
                parentWidth: stageWidth,
                parentHeight: stageHeight,
                isPortrait,
                isAndroid
            }
        });

        const topbarContainer = getPlanNode(nodesById, "gameui-topbar-container");
        const topbarBg = getPlanNode(nodesById, "gameui-topbar-bg");
        const topbarBorder = getPlanNode(nodesById, "gameui-topbar-border");
        const dialogBox = getPlanNode(nodesById, "dialog-box");
        const dialogBg = getPlanNode(nodesById, "dialog-bg");
        const dialogNameGroup = getPlanNode(nodesById, "dialog-name-group");
        const nameBg = getPlanNode(nodesById, "name-bg");
        const dialogNameBorder = getPlanNode(nodesById, "dialog-name-border");
        const dialogName = getPlanNode(nodesById, "dialog-name");
        const dialogMessage = getPlanNode(nodesById, "dialog-message");

        if (!topbarContainer || !topbarBg || !topbarBorder || !dialogBox || !dialogBg || !dialogNameGroup || !nameBg || !dialogNameBorder || !dialogName || !dialogMessage) {
            return null;
        }

        return {
            topbarContainer,
            topbarBg,
            topbarBorder,
            dialogBox,
            dialogBg,
            dialogNameGroup,
            nameBg,
            dialogNameBorder,
            dialogName,
            dialogMessage
        };
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[GameUI] Failed to build compiled topbar/dialog layout; falling back to imperative UI",
            context: { scope: "gameui", stage: "layout" }
        });
        return null;
    }
}

async function gameUI(config, fonts, navigate) {
    if (!Konva) {
        errorTracking?.captureError("Konva not available", {
            message: "[GameUI] Konva not available",
            context: { scope: "gameui" }
        });
        return null;
    }

    const isPortrait = getIsPortrait();
    const isMobile = getIsMobile();
    const isAndroid = getIsAndroid();
    const isMobileLandscape = isMobile && !isPortrait;
    const isMobileLayout = isPortrait || isMobileLandscape;
    const game_layer = new Konva.Layer();
    const origGameDrawScene = game_layer.drawScene;
    game_layer.drawScene = function() {
        if (!this.getStage()) {
            return this;
        }
        return origGameDrawScene.apply(this, arguments);
    };
    const origGameDraw = game_layer.draw;
    game_layer.draw = function() {
        if (!this.getStage()) {
            return this;
        }
        return origGameDraw.apply(this, arguments);
    };

    const { width, height } = konvaStage.getAttrs();

    const compiledGameUiLayout = isXmlLayoutEnabled(config)
        ? await buildGameUiCompiledLayout({
            stageWidth: width,
            stageHeight: height,
            isPortrait,
            isAndroid
        })
        : null;

    const topbar_container = compiledGameUiLayout?.topbarContainer ?? new Konva.Group({
        width: width,
        height: isPortrait ? 52 : (isMobileLandscape ? 44 : (isAndroid ? 44 : 52)),
        id: "topbar-container"
    });
    if (topbar_container && !topbar_container.id()) {
        topbar_container.id("topbar-container");
    }

    const topbar_rect = compiledGameUiLayout?.topbarBg ?? new Konva.Rect({
        width: width,
        height: topbar_container.height(),
        fill: config.colors.menu,
        perfectDrawEnabled: false
    });
    topbar_rect.setAttrs({
        fill: config.colors.menu,
        perfectDrawEnabled: false
    });

    const topbar_border = compiledGameUiLayout?.topbarBorder ?? new Konva.Rect({
        width: width,
        height: 2,
        fill: "rgba(184, 138, 239, 0.40)",
        y: topbar_container.height() - 2,
        perfectDrawEnabled: false
    });
    topbar_border.setAttrs({
        height: 2,
        fill: "rgba(184, 138, 239, 0.40)",
        perfectDrawEnabled: false
    });

    if (!compiledGameUiLayout?.topbarContainer) {
        topbar_container.add(topbar_rect, topbar_border);
    }

    const topbarHeight = topbar_container.height();

    const topbarInnerHeight = topbarHeight - topbar_border.height();

    const backicon = new Image();
    backicon.src = config.gui["back-icon"];

    const backBtnHeight = isPortrait ? 36 : (isMobileLandscape ? 32 : (isAndroid ? 32 : 36));
    const backBtnWidth = isMobileLayout ? 40 : (isAndroid ? 86 : 94);
    const backBtnX = isMobileLayout ? 10 : 16;
    const backBtnY = (topbarInnerHeight - backBtnHeight) / 2;

    const backBtn = new Konva.Group({
        width: backBtnWidth,
        height: backBtnHeight,
        x: backBtnX,
        y: backBtnY
    });

    const backPill = new Konva.Rect({
        x: 0,
        y: 0,
        width: backBtnWidth,
        height: backBtnHeight,
        cornerRadius: 8,
        fill: "rgba(184, 138, 239, 0.14)",
        stroke: "rgba(184, 138, 239, 0.32)",
        strokeWidth: 1,
        perfectDrawEnabled: false
    });

    const backIconSize = 18;
    const backIconImg = new Konva.Image({
        width: backIconSize,
        height: backIconSize,
        x: isMobileLayout ? (backBtnWidth - backIconSize) / 2 : 11,
        y: (backBtnHeight - backIconSize) / 2,
        image: backicon.cloneNode(true)
    });

    let backText = null;
    if (!isMobileLayout) {
        backText = new Konva.Text({
            x: 34,
            y: 0,
            width: backBtnWidth - 36,
            height: backBtnHeight,
            text: "Home",
            fontFamily: fonts["other"]?.name || "Inter",
            fontSize: scaleFontSize(isAndroid ? 13 : 14),
            fontStyle: "bold",
            fill: "#F8F2FF",
            align: "left",
            verticalAlign: "middle",
            perfectDrawEnabled: false
        });
        backBtn.add(backPill, backIconImg, backText);
    } else {
        backBtn.add(backPill, backIconImg);
    }

    const expandIcon = new Image();
    expandIcon.src = config.gui["expand-icon"];

    const expandBtnSize = isPortrait ? 36 : (isMobileLandscape ? 32 : (isAndroid ? 32 : 36));
    const rightOffset = isMobileLayout ? 0 : 16;

    const expandBtnX = isMobileLayout
        ? (width - (topbarInnerHeight - 8) - expandBtnSize - 12)
        : (width - expandBtnSize - rightOffset);
    const expandBtnY = (topbarInnerHeight - expandBtnSize) / 2;

    const expandBtn = new Konva.Group({
        width: expandBtnSize,
        height: expandBtnSize,
        x: expandBtnX,
        y: expandBtnY,
        visible: true,
        opacity: isMobileLayout ? (document.fullscreenElement ? 0.3 : 1) : (!document.fullscreenElement ? 1 : 0)
    });

    const expandPill = new Konva.Rect({
        x: 0,
        y: 0,
        width: expandBtnSize,
        height: expandBtnSize,
        cornerRadius: 8,
        fill: "rgba(184, 138, 239, 0.12)",
        stroke: "rgba(184, 138, 239, 0.28)",
        strokeWidth: 1,
        perfectDrawEnabled: false
    });

    const expandIconSize = isPortrait ? 22 : 18;
    const expandIconImg = new Konva.Image({
        width: expandIconSize,
        height: expandIconSize,
        x: (expandBtnSize - expandIconSize) / 2,
        y: (expandBtnSize - expandIconSize) / 2,
        image: expandIcon.cloneNode(true)
    });

    expandBtn.add(expandPill, expandIconImg);

    const topbarDivider = new Konva.Line({
        points: [0, 8, 0, topbarInnerHeight - 8],
        stroke: "rgba(184, 138, 239, 0.30)",
        strokeWidth: 1,
        opacity: 0.6,
        visible: false,
        x: expandBtnX - 14,
        perfectDrawEnabled: false
    });

    const syncExpandBtnVisibility = () => {
        if (isGameUiDisposed) {
            return;
        }

        if (!expandBtn || !expandBtn.getLayer()) {
            return;
        }

        stopTopbarTweens();

        if (isMobileLayout) {
            // On mobile: fade effect, always visible
            const targetOpacity = document.fullscreenElement ? 0.3 : 1;
            expandBtnTween = new Konva.Tween({
                node: expandBtn,
                opacity: targetOpacity,
                duration: 0.22,
                easing: Konva?.Easings?.EaseOut
            });
            expandBtnTween.play();
        } else {
            // On desktop: visibility toggle
            expandBtn.visible(!document.fullscreenElement);
            topbarDivider.visible(!document.fullscreenElement);
            // Animate menu x position to avoid overlapping with expand button when it is visible
            const newX = calculateMenuHolderX();
            menuHolderTween = new Konva.Tween({
                node: menuHolder,
                x: newX,
                duration: 0.24,
                easing: Konva?.Easings?.EaseOut
            });
            menuHolderTween.play();
        }
    };

    const handleFullscreenEscape = (e) => {
        if (isGameUiDisposed) {
            return;
        }

        // On mobile, ESC might not trigger fullscreenchange event, so trigger sync manually
        if (e.key === "Escape") {
            syncExpandBtnVisibility();
        }
    };

    backBtn.on("mouseover", () => {
        backPill.to({
            fill: "rgba(242, 169, 213, 0.26)",
            stroke: "rgba(242, 169, 213, 0.65)",
            duration: 0.18,
            easing: Konva?.Easings?.EaseOut
        });
        if (backText) {
            backText.to({
                fill: "#FFFFFF",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
        }
        document.body.style.cursor = "pointer";
    });

    backBtn.on("mouseout", () => {
        backPill.to({
            fill: "rgba(184, 138, 239, 0.12)",
            stroke: "rgba(184, 138, 239, 0.28)",
            duration: 0.18,
            easing: Konva?.Easings?.EaseOut
        });
        if (backText) {
            backText.to({
                fill: "#F8F2FF",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
        }
        document.body.style.cursor = "auto";
    });

    expandBtn.on("mouseover", () => {
        expandPill.to({
            fill: "rgba(242, 169, 213, 0.26)",
            stroke: "rgba(242, 169, 213, 0.65)",
            duration: 0.18,
            easing: Konva?.Easings?.EaseOut
        });
        document.body.style.cursor = "pointer";
    });

    expandBtn.on("mouseout", () => {
        expandPill.to({
            fill: "rgba(184, 138, 239, 0.12)",
            stroke: "rgba(184, 138, 239, 0.28)",
            duration: 0.18,
            easing: Konva?.Easings?.EaseOut
        });
        document.body.style.cursor = "auto";
    });

    expandBtn.on("click touchstart", () => {
        if (!document.fullscreenElement) {
            animateBtn(expandBtn);
            document.documentElement.requestFullscreen();
        }
    });

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Close";
    closeBtn.className = "btn btn-outline hover:bg-inherit";
    closeBtn.style.borderColor = config.colors.text;
    closeBtn.style.color = config.colors.text;
    closeBtn.onclick = async () => {
        if (globalThis.__vnsutraNeedsFullscreenRestore) {
            globalThis.__vnsutraNeedsFullscreenRestore = false;
            // One-shot flag consumed in init fullscreenchange listener.
            // This keeps cancel->restore from forcing a full remount when
            // dimensions did not actually change.
            globalThis.__vnsutraSkipNextFullscreenForcedResize = true;
            try {
                const p = document.documentElement.requestFullscreen?.();
                if (p && typeof p.then === "function") {
                    await p.catch(() => {});
                }
            } catch (err) { void err; }
        }
        document.getElementById("alert-win").classList.replace("flex", "hidden");
    };

    const proceedBtn = document.createElement("button");
    proceedBtn.innerText = "Proceed";
    proceedBtn.className = "btn hover:bg-inherit border-0";
    proceedBtn.style.backgroundColor = config.colors.primary;
    proceedBtn.style.color = config.colors["primary-text"];

    const alertWin = new AlertWindow("Are you sure you want to exit?", [closeBtn, proceedBtn], config);
    alertWin.color = config.colors.primary;

    const promptExitToHome = ({ animateButton = true } = {}) => {
        if (animateButton) {
            animateBtn(backBtn);
        }

        proceedBtn.onclick = () => {
            setShouldAbortGame(true);
            getAbortInstruction()?.();
            stopEndingSequence({ showEnd: false });
            alertWin.close();
            requestAnimationFrame(() => {
                navigate("home", {});
            });
        };

        alertWin.message = "Are you sure you want to exit?";
        alertWin.show();
    };

    backBtn.on("click touchstart", () => {
        promptExitToHome({ animateButton: !endingSequenceGroup.visible() });
    });

    window.onbeforeunload = (e) => {
        e.preventDefault();
        e.returnValue = "";
        return "";
    };

    const close_square_img = new Image();
    close_square_img.src = config.gui["close-icon"];

    const add_img = new Image();
    add_img.src = config.gui["add-icon"];

    const load_win = await actionBar(config, new Konva.Group(), width, height, fonts, close_square_img, add_img);

    const remove_img = new Image();
    remove_img.src = config.gui["remove-icon"];
    const captureGameSnapshot = () => {
        const gameBox = game_layer.findOne("#game-box");
        if (!gameBox || typeof gameBox.toDataURL !== "function") {
            return null;
        }
        const boxY = typeof gameBox.y === "function" ? gameBox.y() : topbarHeight;
        const boxW = typeof gameBox.width === "function" ? gameBox.width() : width;
        const boxH = typeof gameBox.height === "function" ? gameBox.height() : (height - topbarHeight);
        return gameBox.toDataURL({
            x: 0,
            y: boxY,
            width: boxW,
            height: boxH,
            imageSmoothingEnabled: true
        });
    };

    const saveSnapshot = async () => {
        try {
            let games = await storage.getItem("saved-games");
            if (games === null) {
                games = [];
            }

            const url = captureGameSnapshot();
            const id = Date.now();
            const state = getState() ?? {};
            const activeScene = getActiveScene();
            const chapterId = chapters.getCurrentChapter()?.id ?? null;

            games.push(buildSavedGameEntry({
                id: id,
                scene: activeScene,
                chapterId,
                timestamp: id,
                src: url,
                state: state,
                instructionCount: getInstructionCount()
            }));

            await storage.setItem("saved-games", games);
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[GameUI] Failed to save snapshot",
                context: { scope: "gameui", action: "saveSnapshot" }
            });
        }
    };

    const loadLatestSnapshot = createQuickLoadHandler({
        readSavedGames: async () => storage.getItem("saved-games"),
        dispatchLoad: (latest) => {
            window.dispatchEvent(new CustomEvent("load-game", { detail: { ...latest } }));
        },
        onError: (error) => {
            errorTracking?.captureError(error, {
                message: "[GameUI] Failed to load latest snapshot",
                context: { scope: "gameui", action: "loadLatestSnapshot" }
            });
        }
    });

    const showHistory = () => {
        const state = getState() ?? {};
        const entries = Object.entries(state.history ?? {}).slice(-20).map(([, value]) => String(value));
        const closeBtn = document.createElement("button");
        closeBtn.innerText = "Close";
        closeBtn.className = "btn btn-outline hover:bg-inherit";
        closeBtn.style.borderColor = config.colors.text;
        closeBtn.style.color = config.colors.text;
        closeBtn.onclick = () => {
            document.getElementById("alert-win").classList.replace("flex", "hidden");
        };

        const content = entries.length > 0 ? entries.join("\n") : "No history available yet.";
        const historyWindow = new AlertWindow(content, [closeBtn], config);
        historyWindow.color = config.colors.primary;
        historyWindow.show();
    };

    const menuItems = [
        {
            name: "Save Game",
            icon: config.gui["save-icon"],
            onclick: (element) => {
                const snapshotUrl = captureGameSnapshot();
                loadgame(config, load_win, "Save Game", fonts, remove_img, (details) => {
                    proceedBtn.onclick = async () => {
                        const url = snapshotUrl || captureGameSnapshot();

                        storage.getItem("saved-games").then((games) => {
                            const index = games.findIndex(item => item.id === details.id);
                            const id = Date.now();
                            const state = getState() ?? {};
                            const activeScene = getActiveScene();
                            const chapterId = chapters.getCurrentChapter()?.id ?? null;
                            games[index] = buildSavedGameEntry({
                                id: id,
                                scene: activeScene,
                                chapterId,
                                timestamp: id,
                                src: url,
                                state: state,
                                instructionCount: getInstructionCount()
                            });

                            storage.setItem("saved-games", games).then(() => {
                                element.onclick(element);
                            }).catch((error) => {
                                errorTracking?.captureError(error, {
                                    message: "[GameUI] Failed to overwrite saved game",
                                    context: { scope: "gameui", action: "saveGame" }
                                });
                            });
                        }).catch((error) => {
                            errorTracking?.captureError(error, {
                                message: "[GameUI] Failed to read saved games",
                                context: { scope: "gameui", action: "saveGame" }
                            });
                        });

                        alertWin.close();
                    };

                    alertWin.message = "Are you sure you want to overwrite this game?";
                    alertWin.show();
                }, true, () => {
                    const url = snapshotUrl || captureGameSnapshot();

                    storage.getItem("saved-games").then((games) => {
                        const id = Date.now();
                        if (games === null) {
                            games = [];
                        }

                        const state = getState() ?? {};
                        const activeScene = getActiveScene();
                        const chapterId = chapters.getCurrentChapter()?.id ?? null;
                        games.push(buildSavedGameEntry({
                            id: id,
                            scene: activeScene,
                            chapterId,
                            timestamp: id,
                            src: url,
                            state: state,
                            instructionCount: getInstructionCount()
                        }));

                        storage.setItem("saved-games", games).then(() => {
                            element.onclick(element);
                        }).catch((error) => {
                            errorTracking?.captureError(error, {
                                message: "[GameUI] Failed to save new game",
                                context: { scope: "gameui", action: "saveGame" }
                            });
                        });
                    }).catch((error) => {
                        errorTracking?.captureError(error, {
                            message: "[GameUI] Failed to read saved games",
                            context: { scope: "gameui", action: "saveGame" }
                        });
                    });
                });
                if (!isBarOpen(load_win.actionrect)) {
                    openBar(load_win.actionrect);
                }
            }
        }, {
            name: "Load Game",
            icon: config.gui["load-icon"],
            onclick: () => {
                loadgame(config, load_win, "Load Game", fonts, remove_img, (details) => {
                    proceedBtn.onclick = () => {
                        alertWin.close();
                        closeBar(load_win.actionrect);
                        window.dispatchEvent(new CustomEvent("load-game", { detail: { ...details } }));
                    };

                    alertWin.message = "Are you sure you want to quit the active game?";
                    alertWin.show();
                });
                openBar(load_win.actionrect);
            }
        },
        {
            name: "Screenshot",
            icon: config.gui["screenshot-icon"],
            onclick: (element) => {
                if (isPortrait) {
                    menuBtn.fire("click");
                }
                setTimeout(() => {
                    game_layer.toBlob({ imageSmoothingEnabled: true }).then(blob => {
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `${config.title}_screenshot_${Date.now()}`;
                        a.click();
                        element.img.src = config.gui["check-icon"];
                        setTimeout(() => {
                            element.img.src = config.gui["screenshot-icon"];
                        }, 2000);
                    });
                }, 500);
            }
        }
    ];

    const useMobileMenu = isMobileLayout || width < 860;
    const mobilePadding = useMobileMenu ? 12 : 0;
    function calculateMenuHolderX() {
        if (!menuHolder) {
            return 0;
        }
        if (useMobileMenu) {
            return width - menuHolder.width() - 8;
        }
        // On desktop: adjust menu position based on expand button visibility
        const expandBtnVisible = !document.fullscreenElement;
        if (expandBtnVisible) {
            const requiredSpace = expandBtnSize + rightOffset + 24;
            return Math.max(backBtn.x() + backBtn.width() + 16, width - menuHolder.width() - requiredSpace);
        } else {
            return Math.max(backBtn.x() + backBtn.width() + 16, width - menuHolder.width() - rightOffset);
        }
    }

    const pillHeight = isAndroid ? 32 : 36;
    const pillY = (topbarInnerHeight - pillHeight) / 2;
    const rowHeight = isPortrait ? 46 : (isMobileLandscape ? 38 : 46);
    const btnGap = 8;

    const menuHolder = new Konva.Group({
        height: useMobileMenu ? ((menuItems.length * rowHeight) + 2 * mobilePadding) : topbarInnerHeight,
        y: useMobileMenu ? topbarInnerHeight : 0,
        visible: !useMobileMenu
    });

    if (useMobileMenu) {
        const menuBg = new Konva.Rect({
            fill: "rgba(18, 14, 34, 0.96)",
            cornerRadius: [0, 0, 16, 16],
            stroke: "rgba(184, 138, 239, 0.35)",
            strokeWidth: 1.2,
            shadowColor: "#05030A",
            shadowBlur: 20,
            shadowOpacity: 0.7,
            shadowOffsetY: 6,
            perfectDrawEnabled: false,
            id: "game-menu-bg"
        });

        menuHolder.add(menuBg);
    }

    const btns_height = [], btns_width = [];
    let currentX = 0;

    for (let j = 0; j < menuItems.length; j++) {
        const element = menuItems[j];

        const img = new Image();
        img.src = element.icon;

        element.img = img;

        const iconSize = 18;
        const fontSize = scaleFontSize(isPortrait ? 15 : (isAndroid ? 13 : 14));

        const btn_img = new Konva.Image({
            width: iconSize,
            height: iconSize,
            image: img
        });

        const btn_text = new Konva.Text({
            align: "left",
            verticalAlign: "middle",
            text: element.name,
            fontFamily: fonts["other"]?.name || "Inter",
            fontSize: fontSize,
            fontStyle: "bold",
            fill: "#F8F2FF",
            fillAfterStrokeEnabled: true,
            perfectDrawEnabled: false,
            wrap: "none"
        });

        let btnHolder;
        let btnPill;

        if (useMobileMenu) {
            const rowWidth = isMobileLandscape ? 160 : 180;
            btnHolder = new Konva.Group({
                width: rowWidth,
                height: rowHeight,
                x: mobilePadding,
                y: (j * rowHeight) + mobilePadding
            });

            btnPill = new Konva.Rect({
                x: 0,
                y: 2,
                width: rowWidth,
                height: rowHeight - 4,
                cornerRadius: 8,
                fill: "rgba(184, 138, 239, 0.12)",
                stroke: "rgba(184, 138, 239, 0.25)",
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            btn_img.setAttrs({
                x: 14,
                y: (rowHeight - 4 - iconSize) / 2 + 2
            });

            btn_text.setAttrs({
                x: 42,
                y: 2,
                width: rowWidth - 50,
                height: rowHeight - 4
            });

            btns_width.push(rowWidth);
            btns_height.push(rowHeight);
        } else {
            const textWidth = Math.ceil(btn_text.width());
            const btnHolderWidth = textWidth + iconSize + 28;

            btnHolder = new Konva.Group({
                width: btnHolderWidth,
                height: pillHeight,
                x: currentX,
                y: pillY
            });

            btnPill = new Konva.Rect({
                x: 0,
                y: 0,
                width: btnHolderWidth,
                height: pillHeight,
                cornerRadius: 8,
                fill: "rgba(184, 138, 239, 0.14)",
                stroke: "rgba(184, 138, 239, 0.30)",
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            btn_img.setAttrs({
                x: 12,
                y: (pillHeight - iconSize) / 2
            });

            btn_text.setAttrs({
                x: 12 + iconSize + 8,
                y: 0,
                width: textWidth + 4,
                height: pillHeight
            });

            currentX += btnHolderWidth + btnGap;
            btns_width.push(btnHolderWidth);
            btns_height.push(pillHeight);
        }

        btnHolder.on("mouseover", () => {
            btnPill.to({
                fill: "rgba(242, 169, 213, 0.28)",
                stroke: "rgba(242, 169, 213, 0.70)",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
            btn_text.to({
                fill: "#FFFFFF",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
            document.body.style.cursor = "pointer";
        });

        btnHolder.on("mouseout", () => {
            btnPill.to({
                fill: useMobileMenu ? "rgba(184, 138, 239, 0.12)" : "rgba(184, 138, 239, 0.14)",
                stroke: useMobileMenu ? "rgba(184, 138, 239, 0.25)" : "rgba(184, 138, 239, 0.30)",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
            btn_text.to({
                fill: "#F8F2FF",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
            document.body.style.cursor = "auto";
        });

        btnHolder.on("click touchstart", () => {
            animateBtn(btnHolder);
            if (element.onclick.length > 0) {
                element.onclick(element);
            } else {
                element.onclick();
            }
            if (useMobileMenu) {
                menuBtn.fire("click");
            }
        });

        btnHolder.add(btnPill, btn_img, btn_text);
        menuHolder.add(btnHolder);
    }

    if (useMobileMenu) {
        const menuWidth = isMobileLandscape ? 160 : 180;
        menuHolder.width(menuWidth + 2 * mobilePadding);
        const menuBg = menuHolder.findOne("#game-menu-bg");
        if (menuBg) {
            menuBg.width(menuHolder.width());
            menuBg.height(menuHolder.height());
        }
    } else {
        menuHolder.width(Math.max(0, currentX - btnGap));
    }

    menuHolder.x(calculateMenuHolderX());

    const menuBtnSize = isPortrait ? 36 : 36;
    const menuBtn = new Konva.Group({
        width: menuBtnSize,
        height: menuBtnSize,
        x: width - menuBtnSize - 12,
        y: (topbarInnerHeight - menuBtnSize) / 2,
        visible: useMobileMenu
    });

    const menuPill = new Konva.Rect({
        x: 0,
        y: 0,
        width: menuBtnSize,
        height: menuBtnSize,
        cornerRadius: 8,
        fill: "rgba(184, 138, 239, 0.12)",
        stroke: "rgba(184, 138, 239, 0.28)",
        strokeWidth: 1,
        perfectDrawEnabled: false
    });

    // Refined 3-dots vector icon (kebab menu) matching line weight of adjacent icons
    const dotRadius = 1.65;
    const dotSpacing = 5.8;
    const dotCenterX = menuBtnSize / 2;
    const dotCenterY = menuBtnSize / 2;

    const dotTop = new Konva.Circle({
        x: dotCenterX,
        y: dotCenterY - dotSpacing,
        radius: dotRadius,
        fill: "rgba(248, 242, 255, 0.85)",
        perfectDrawEnabled: false
    });
    const dotMid = new Konva.Circle({
        x: dotCenterX,
        y: dotCenterY,
        radius: dotRadius,
        fill: "rgba(248, 242, 255, 0.85)",
        perfectDrawEnabled: false
    });
    const dotBot = new Konva.Circle({
        x: dotCenterX,
        y: dotCenterY + dotSpacing,
        radius: dotRadius,
        fill: "rgba(248, 242, 255, 0.85)",
        perfectDrawEnabled: false
    });

    menuBtn.add(menuPill, dotTop, dotMid, dotBot);

    menuBtn.on("mouseover", () => {
        menuPill.to({
            fill: "rgba(242, 169, 213, 0.26)",
            stroke: "rgba(242, 169, 213, 0.65)",
            duration: 0.18,
            easing: Konva?.Easings?.EaseOut
        });
        dotTop.fill("#FFFFFF");
        dotMid.fill("#FFFFFF");
        dotBot.fill("#FFFFFF");
        document.body.style.cursor = "pointer";
    });

    menuBtn.on("mouseout", () => {
        menuPill.to({
            fill: "rgba(184, 138, 239, 0.12)",
            stroke: "rgba(184, 138, 239, 0.28)",
            duration: 0.18,
            easing: Konva?.Easings?.EaseOut
        });
        dotTop.fill("rgba(248, 242, 255, 0.85)");
        dotMid.fill("rgba(248, 242, 255, 0.85)");
        dotBot.fill("rgba(248, 242, 255, 0.85)");
        document.body.style.cursor = "auto";
    });

    menuBtn.on("click touchstart", () => {
        if (useMobileMenu) {
            animateBtn(menuBtn);
            animateMenu(menuHolder);
        }
    });

    setGameKeyboardActions({
        toggleMenu: () => {
            if (useMobileMenu) {
                menuBtn.fire("click");
                return;
            }

            if (isBarOpen(load_win.actionrect)) {
                closeBar(load_win.actionrect);
            } else {
                openBar(load_win.actionrect);
            }
        },
        quickSave: saveSnapshot,
        quickLoad: loadLatestSnapshot,
        showHistory
    });

    topbar_container.add(backBtn, menuHolder, topbarDivider, expandBtn, menuBtn);

    const game_container = new Konva.Group({
        width: width,
        height: height - topbarHeight,
        y: topbarHeight,
        clipX: 0,
        clipY: 0,
        clipWidth: width,
        clipHeight: height - topbarHeight,
        id: "game-box"
    });

    const gameHeight = game_container.height();

    const dialogPadding = isPortrait ? 10 : (isMobileLandscape ? 10 : 30);

    const dialogContainer = compiledGameUiLayout?.dialogBox ?? new Konva.Group({
        width: width,
        height: 180,
        y: gameHeight - 180,
        id: "dialog-box",
        visible: false
    });

    const dialogContainerBG = compiledGameUiLayout?.dialogBg ?? new Konva.Rect({
        width: width,
        height: dialogContainer.height(),
        fill: config.colors.menu,
        id: "dialog-bg",
        stroke: config.colors.primary,
        strokeWidth: 2,
        cornerRadius: isPortrait ? [12, 12, 0, 0] : [14, 14, 0, 0],
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false,
    });
    dialogContainerBG.setAttrs({
        fill: config.colors.menu,
        stroke: config.colors.primary,
        strokeWidth: 2,
        cornerRadius: isPortrait ? [12, 12, 0, 0] : [14, 14, 0, 0],
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false
    });

    const nameGroup = compiledGameUiLayout?.dialogNameGroup ?? new Konva.Group({
        skewX: isPortrait ? 0 : config["game-ui"].dialog.title.skew,
    });
    nameGroup.setAttrs({
        skewX: isPortrait ? 0 : config["game-ui"].dialog.title.skew,
    });

    const nameContainerBG = compiledGameUiLayout?.nameBg ?? new Konva.Rect({
        width: width,
        height: dialogContainer.height(),
        fill: config.colors.menu,
        id: "name-bg",
        stroke: config.colors.primary,
        strokeWidth: 2,
        cornerRadius: isPortrait ? [10, 10, 0, 0] : [12, 12, 4, 4],
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false,
    });
    nameContainerBG.setAttrs({
        fill: config.colors.menu,
        stroke: config.colors.primary,
        strokeWidth: 2,
        cornerRadius: isPortrait ? [10, 10, 0, 0] : [12, 12, 4, 4],
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false
    });

    const nameBorderB = compiledGameUiLayout?.dialogNameBorder ?? new Konva.Rect({
        width: width,
        height: 0,
        x: nameContainerBG.x(),
        y: nameContainerBG.height(),
        fill: config.colors.primary,
        opacity: 0,
        visible: false
    });
    nameBorderB.setAttrs({
        height: 0,
        opacity: 0,
        visible: false
    });

    const name_text = compiledGameUiLayout?.dialogName ?? new Konva.Text({
        align: "center",
        padding: isPortrait ? 7 : (isMobileLandscape ? 8 : 14),
        verticalAlign: "middle",
        x: isPortrait ? 16 : (isMobileLandscape ? 20 : (isAndroid ? 100 : 160)),
        text: "Alex",
        fontFamily: fonts["other"],
        fontStyle: "bold",
        fontSize: scaleFontSize(isPortrait ? 16 : (isMobileLandscape ? 16 : (isAndroid ? 23 : 27))),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "none",
        id: "dialog-name"
    });
    name_text.setAttrs({
        text: "Alex",
        fontFamily: fonts["other"],
        fontStyle: "bold",
        fontSize: scaleFontSize(isPortrait ? 16 : (isMobileLandscape ? 16 : (isAndroid ? 23 : 27))),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
    });

    if (!compiledGameUiLayout?.dialogBox) {
        nameGroup.add(nameContainerBG, nameBorderB, name_text);
        dialogContainer.add(dialogContainerBG, nameGroup);
    }

    const dialogContainerWidth = dialogContainer.width();

    const dialog_text = compiledGameUiLayout?.dialogMessage ?? new Konva.Text({
        align: config["game-ui"].dialog.speech.align,
        verticalAlign: "middle",
        padding: isPortrait ? 10 : (isMobileLandscape ? 10 : 16),
        width: isPortrait ? (dialogContainerWidth - 32) : (isMobileLandscape ? (dialogContainerWidth - 40) : (dialogContainerWidth - 240)),
        x: isPortrait ? 16 : (isMobileLandscape ? 20 : 120),
        y: name_text.height() + dialogPadding,
        text: "",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 17 : (isMobileLandscape ? 17 : (isAndroid ? 23 : 28))),
        lineHeight: isMobileLandscape ? 1.45 : (isPortrait ? 1.45 : 1.6),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "word",
        id: "dialog-message"
    });
    dialog_text.setAttrs({
        align: config["game-ui"].dialog.speech.align,
        y: name_text.height() + dialogPadding,
        text: "",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 17 : (isMobileLandscape ? 17 : (isAndroid ? 23 : 28))),
        lineHeight: isMobileLandscape ? 1.45 : (isPortrait ? 1.45 : 1.6),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true
    });

    dialogContainer.height(name_text.height() + dialog_text.height() + 2 * dialogPadding);
    dialogContainer.y(gameHeight);
    nameContainerBG.height(name_text.height());
    nameContainerBG.width(name_text.width());
    dialogContainerBG.height(dialog_text.height() + 2 * dialogPadding);

    if (!compiledGameUiLayout?.dialogBox) {
        dialogContainer.add(dialog_text);
    }

    const game_rect = new Konva.Group({
        width: width,
        height: gameHeight,
        id: "game-container",
        clipWidth: width,
        clipHeight: gameHeight
    });

    const game_bg = new Konva.Image({
        id: "game-bg",
        filters: [Konva.Filters.Blur, Konva.Filters.Noise, Konva.Filters.Pixelate, Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL],
        noise: 0,
        blurRadius: 0,
        pixelSize: 1,
        listening: false
    });

    const transitionOverlay = new Konva.Rect({
        id: "game-transition-overlay",
        width: width,
        height: gameHeight,
        fill: "#000000",
        opacity: 0,
        listening: false
    });

    const flashOverlay = new Konva.Rect({
        id: "game-flash-overlay",
        width: width,
        height: gameHeight,
        fill: "#ffffff",
        opacity: 0,
        listening: false
    });

    // Invisible hit area so empty viewport zones still receive pointer events.
    // This allows click/tap-to-advance to work across the full game viewport,
    // not only where sprites/text nodes happen to exist.
    const gameClickCatcher = new Konva.Rect({
        id: "game-click-catcher",
        width: width,
        height: gameHeight,
        fill: "#000000",
        opacity: 0.001,
        listening: true
    });

    dialog_text.on("update", () => {
        if (isGameUiDisposed || !game_layer?.getStage?.()) {
            return;
        }

        if (name_text.text() === "" && dialog_text.text() === "") {
            dialogContainer.visible(false);
            return;
        } else {
            dialogContainer.visible(true);
        }
        const minDialogHeight = isPortrait ? 120 : (isMobileLandscape ? 110 : (isAndroid ? 150 : 230));
        const extraSafetyPad = isPortrait ? 8 : 0;
        const height = Math.max(name_text.height() + dialog_text.height() + 2 * dialogPadding + extraSafetyPad, minDialogHeight);
        dialogContainerBG.to({
            height: height - name_text.height(),
            y: name_text.height() + 3,
            duration: 0.22,
            easing: Konva?.Easings?.EaseOut,
            opacity: 0.9
        });
        const minNameWidth = isPortrait ? 90 : (isMobileLandscape ? 110 : 200);
        const name_width = Math.max(name_text.width(), minNameWidth);
        if (name_text.width() !== name_width) name_text.width(name_width);
        const name_x = name_text.x() - (name_width - name_text.width()) / 2;
        nameBorderB.y(name_text.height() - 1);
        nameBorderB.x(name_x);
        nameBorderB.width(name_width);
        nameContainerBG.to({
            width: name_width,
            x: name_x,
            height: name_text.height(),
            duration: 0.22,
            easing: Konva?.Easings?.EaseOut,
            opacity: 0.9
        });
        dialogContainer.to({
            height: height,
            y: gameHeight - height,
            duration: 0.22,
            easing: Konva?.Easings?.EaseOut
        });

        game_rect.to({
            height: gameHeight - height,
            duration: 0.22,
            easing: Konva?.Easings?.EaseOut
        });
    });

    const game_bg_group = new Konva.Group({
        id: "game-bg-group",
        width: width,
        height: gameHeight,
        listening: false
    });
    game_bg_group.add(game_bg);

    const game_fore_group = new Konva.Group({
        id: "game-fore-group",
        width: width,
        height: gameHeight,
        listening: false
    });

    const game_camera = new Konva.Group({
        id: "game-camera-group",
        width: width,
        height: gameHeight,
        offsetX: width / 2,
        offsetY: gameHeight / 2,
        x: width / 2,
        y: gameHeight / 2
    });
    const lightingOverlay = new Konva.Rect({
        id: "game-lighting-overlay",
        width: width,
        height: gameHeight,
        fill: "#ffffff",
        opacity: 0,
        listening: false,
        globalCompositeOperation: "multiply"
    });
    game_camera.add(game_bg_group, game_fore_group, game_rect, lightingOverlay);

    // Keep background in the full viewport so translucent dialog always has scene content behind it,
    // while gameplay nodes can still shrink via game_rect height when dialog is open.
    game_container.add(gameClickCatcher, game_camera, transitionOverlay, flashOverlay, dialogContainer);

    // The End

    const endGroup = new Konva.Group({
        id: "end-group",
        width: width,
        height: game_container.height(),
        visible: false
    });

    const endRect = new Konva.Rect({
        width: width,
        height: endGroup.height(),
        fill: config.colors.menu
    });

    const endText = new Konva.Text({
        align: "center",
        padding: 0,
        verticalAlign: "middle",
        width: width,
        height: endGroup.height(),
        text: "The End",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 40 : (isMobileLandscape ? 28 : (isAndroid ? 35 : 40))),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "none"
    });

    endGroup.add(endRect, endText);

    const chapterEndGroup = new Konva.Group({
        id: "chapter-end-group",
        width: width,
        height: game_container.height(),
        visible: false,
        listening: true
    });

    const chapterEndRect = new Konva.Rect({
        width: width,
        height: chapterEndGroup.height(),
        fill: config.colors.menu,
        opacity: 0.97
    });

    const chapterEndTitle = new Konva.Text({
        align: "center",
        verticalAlign: "middle",
        width: width,
        height: chapterEndGroup.height(),
        text: "Chapter Complete",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 38 : (isMobileLandscape ? 26 : (isAndroid ? 34 : 38))),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "none",
        offsetY: isPortrait ? 48 : (isMobileLandscape ? 36 : 54)
    });

    const chapterEndSubtitle = new Konva.Text({
        align: "center",
        width: width,
        y: Math.round(chapterEndGroup.height() * (isMobileLandscape ? 0.52 : 0.56)),
        text: "",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 22 : (isMobileLandscape ? 16 : (isAndroid ? 20 : 22))),
        fill: config.colors.primary,
        fillAfterStrokeEnabled: true,
        wrap: "word",
        padding: isPortrait ? 18 : (isMobileLandscape ? 16 : 28)
    });

    const chapterEndHint = new Konva.Text({
        align: "center",
        width: width,
        y: chapterEndGroup.height() - (isPortrait ? 44 : (isMobileLandscape ? 36 : 48)),
        text: "Tap / Enter to continue",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 18 : (isMobileLandscape ? 14 : (isAndroid ? 16 : 18))),
        fill: config.colors["menu-border"],
        fillAfterStrokeEnabled: true,
        wrap: "none",
        opacity: 0.85
    });

    chapterEndGroup.add(chapterEndRect, chapterEndTitle, chapterEndSubtitle, chapterEndHint);

    const endingSequenceGroup = new Konva.Group({
        id: "ending-sequence-group",
        width: width,
        height: game_container.height(),
        visible: false,
        listening: true
    });

    const endingBackdrop = new Konva.Rect({
        width: width,
        height: endingSequenceGroup.height(),
        fill: config.colors.menu,
        opacity: 0.97
    });

    const creditsViewportPaddingX = isPortrait ? 18 : (isAndroid ? 22 : 40);
    const creditsViewportY = isPortrait ? 24 : (isAndroid ? 20 : 24);
    const creditsViewportBottomPadding = isPortrait ? 64 : 74;
    const creditsViewportHeight = Math.max(1, endingSequenceGroup.height() - creditsViewportY - creditsViewportBottomPadding);

    const creditsViewport = new Konva.Group({
        x: creditsViewportPaddingX,
        y: creditsViewportY,
        width: width - (creditsViewportPaddingX * 2),
        height: creditsViewportHeight,
        clipX: 0,
        clipY: 0,
        clipWidth: width - (creditsViewportPaddingX * 2),
        clipHeight: creditsViewportHeight
    });

    const creditsContent = new Konva.Group({
        width: creditsViewport.width(),
        y: 0
    });

    const toEndingCreditText = (value) => {
        if (value == null) {
            return "";
        }

        const raw = String(value);
        const withMarkdownLabels = raw.replace(/\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s)]+)\)/gi, "$1");
        const withoutUrls = withMarkdownLabels.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, "");
        return withoutUrls.replace(/\s{2,}/g, " ").trim();
    };

    const creditsEntries = Object.entries(config.credits || {});
    let creditsY = 0;

    if (!creditsEntries.length) {
        const emptyCredits = new Konva.Text({
            align: "center",
            width: creditsContent.width(),
            text: "No credits configured",
            fontFamily: fonts["other"],
            fontSize: scaleFontSize(isPortrait ? 24 : (isAndroid ? 20 : 24)),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
            wrap: "word"
        });
        creditsContent.add(emptyCredits);
        creditsY = emptyCredits.height();
    } else {
        const sectionGap = isPortrait ? 20 : 16;
        const titleGap = 6;

        creditsEntries.forEach(([key, value], index) => {
            const creditKey = new Konva.Text({
                align: "center",
                width: creditsContent.width(),
                y: creditsY,
                text: key,
                fontFamily: fonts["other"],
                fontSize: scaleFontSize(isPortrait ? 27 : (isAndroid ? 22 : 27)),
                fill: config.colors.primary,
                fillAfterStrokeEnabled: true,
                wrap: "word"
            });

            const creditValue = new Konva.Text({
                align: "center",
                width: creditsContent.width(),
                y: creditKey.y() + creditKey.height() + titleGap,
                text: toEndingCreditText(value),
                fontFamily: fonts["other"],
                fontSize: scaleFontSize(isPortrait ? 21 : (isAndroid ? 18 : 21)),
                fill: config.colors.text,
                fillAfterStrokeEnabled: true,
                wrap: "word"
            });

            creditsContent.add(creditKey, creditValue);
            creditsY = creditValue.y() + creditValue.height();

            if (index < creditsEntries.length - 1) {
                creditsY += sectionGap;
            }
        });
    }

    creditsContent.height(Math.max(1, creditsY));
    creditsViewport.add(creditsContent);

    const endingHint = new Konva.Text({
        align: "center",
        width: width,
        y: endingSequenceGroup.height() - (isPortrait ? 44 : 48),
        text: "Tap / Enter to skip",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(isPortrait ? 18 : (isAndroid ? 16 : 18)),
        fill: config.colors["menu-border"],
        fillAfterStrokeEnabled: true,
        wrap: "none",
        opacity: 0.85,
        visible: false
    });

    endingSequenceGroup.add(endingBackdrop, creditsViewport, endingHint);

    let endingKeyHandler = null;
    let endingHoldTimer = null;
    let endingResolve = null;
    let endingRunToken = 0;
    let endingCreditsTween = null;
    let chapterEndKeyHandler = null;
    let chapterEndResolve = null;
    let chapterEndPromptToken = 0;
    let expandBtnTween = null;
    let menuHolderTween = null;
    let topbarSyncFrameId = null;
    let isGameUiDisposed = false;

    const stopTopbarTweens = () => {
        if (expandBtnTween) {
            expandBtnTween.pause?.();
            expandBtnTween.destroy?.();
            expandBtnTween = null;
        }

        if (menuHolderTween) {
            menuHolderTween.pause?.();
            menuHolderTween.destroy?.();
            menuHolderTween = null;
        }
    };

    const stopEndingTween = () => {
        if (!endingCreditsTween) {
            return;
        }

        endingCreditsTween.pause?.();
        endingCreditsTween.destroy?.();
        endingCreditsTween = null;
    };

    const clearEndingHandlers = () => {
        endingSequenceGroup.off("click.ending touchstart.ending");

        if (endingKeyHandler) {
            document.removeEventListener("keydown", endingKeyHandler);
            endingKeyHandler = null;
        }

        if (endingHoldTimer) {
            clearTimeout(endingHoldTimer);
            endingHoldTimer = null;
        }
    };

    const clearChapterEndHandlers = () => {
        chapterEndGroup.off("click.chapter-end touchstart.chapter-end");

        if (chapterEndKeyHandler) {
            document.removeEventListener("keydown", chapterEndKeyHandler);
            chapterEndKeyHandler = null;
        }
    };

    const safeEndingBatchDraw = () => {
        if (isGameUiDisposed) {
            return;
        }

        const stage = game_layer?.getStage?.();
        if (!stage) {
            return;
        }

        try {
            game_layer.batchDraw();
        } catch {
            // Ignore draw errors during teardown/race conditions.
        }
    };

    const finalizeEnding = (token) => {
        if (token !== endingRunToken) {
            return;
        }

        clearEndingHandlers();
        endingSequenceGroup.visible(false);
        endGroup.visible(true);
        stopEndingTween();
        safeEndingBatchDraw();

        if (typeof endingResolve === "function") {
            const resolve = endingResolve;
            endingResolve = null;
            resolve();
        }
    };

    const stopEndingSequence = ({ showEnd = false, skipDraw = false } = {}) => {
        endingRunToken += 1;
        clearEndingHandlers();
        stopEndingTween();
        endingSequenceGroup.visible(false);
        endingHint.visible(false);
        if (!showEnd) {
            endGroup.visible(false);
        } else {
            endGroup.visible(true);
        }
        if (!skipDraw) {
            safeEndingBatchDraw();
        }

        if (typeof endingResolve === "function") {
            const resolve = endingResolve;
            endingResolve = null;
            resolve();
        }
    };

    const hideChapterEndPrompt = ({ skipDraw = false } = {}) => {
        chapterEndPromptToken += 1;
        clearChapterEndHandlers();
        chapterEndGroup.visible(false);
        if (!skipDraw) {
            safeEndingBatchDraw();
        }

        if (typeof chapterEndResolve === "function") {
            const resolve = chapterEndResolve;
            chapterEndResolve = null;
            resolve();
        }
    };

    const showChapterEndPrompt = ({ title = "Chapter Complete", subtitle = "", hint = "Tap / Enter to continue" } = {}) => {
        hideChapterEndPrompt({ skipDraw: true });

        const token = ++chapterEndPromptToken;
        chapterEndTitle.text(typeof title === "string" && title.trim().length > 0 ? title.trim() : "Chapter Complete");
        chapterEndSubtitle.text(typeof subtitle === "string" ? subtitle.trim() : "");
        chapterEndSubtitle.visible(chapterEndSubtitle.text().length > 0);
        chapterEndHint.text(typeof hint === "string" && hint.trim().length > 0 ? hint.trim() : "Tap / Enter to continue");
        chapterEndGroup.visible(true);
        safeEndingBatchDraw();

        const completePrompt = () => {
            if (token !== chapterEndPromptToken) {
                return;
            }
            hideChapterEndPrompt();
        };

        chapterEndGroup.on("click.chapter-end touchstart.chapter-end", completePrompt);
        chapterEndKeyHandler = (event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
                event.preventDefault();
                completePrompt();
            }
        };
        document.addEventListener("keydown", chapterEndKeyHandler);

        return new Promise((resolve) => {
            chapterEndResolve = resolve;
        });
    };

    const resetSession = ({ skipDraw = true } = {}) => {
        if (isGameUiDisposed) {
            return;
        }

        if (topbarSyncFrameId !== null) {
            cancelAnimationFrame(topbarSyncFrameId);
            topbarSyncFrameId = null;
        }

        stopEndingSequence({ showEnd: false, skipDraw: true });
        hideChapterEndPrompt({ skipDraw: true });
        stopTopbarTweens();

        if (typeof load_win?.__scrollCleanup === "function") {
            load_win.__scrollCleanup();
        }
        load_win.__scrollSuppressTapUntil = 0;
        if (load_win?.actionrect) {
            if (typeof load_win.actionrect.listening === "function") {
                load_win.actionrect.listening(false);
            }
            load_win.actionrect.visible(false);
        }

        // Reset dialog visibility and content
        name_text?.text?.("");
        dialog_text?.text?.("");
        dialogContainer?.visible?.(false);

        // Reset transition and flash overlays
        transitionOverlay?.stop?.();
        transitionOverlay?.opacity?.(0);
        flashOverlay?.stop?.();
        flashOverlay?.opacity?.(0);

        // Stop in-flight node tweens on game_layer
        const animatedNodes = game_layer?.find?.("*") ?? [];
        for (const node of animatedNodes) {
            try {
                node?.stop?.();
            } catch {
                // ignore
            }
        }

        const runningAnimations = Konva?.Animation?.animations;
        if (Array.isArray(runningAnimations) && game_layer) {
            for (let index = runningAnimations.length - 1; index >= 0; index -= 1) {
                const animation = runningAnimations[index];
                const layers = animation?.getLayers?.() ?? [];
                if (layers.some((layer) => layer === game_layer)) {
                    animation.stop?.();
                }
            }
        }

        if (!skipDraw) {
            safeEndingBatchDraw();
        }
    };

    const teardown = () => {
        if (isGameUiDisposed) {
            return;
        }

        resetSession({ skipDraw: true });
        isGameUiDisposed = true;

        document.removeEventListener("fullscreenchange", syncExpandBtnVisibility);
        document.removeEventListener("webkitfullscreenchange", syncExpandBtnVisibility);
        document.removeEventListener("keydown", handleFullscreenEscape);
        game_container.off("click touchstart");

        game_layer.removeChildren();
    };

    const playEndingSequence = ({ creditsDurationMs = 9000, endHoldMs = 900, allowSkip = true } = {}) => {
        stopEndingSequence({ showEnd: false });

        if (!creditsEntries.length) {
            endGroup.visible(true);
            safeEndingBatchDraw();
            return Promise.resolve();
        }

        const token = ++endingRunToken;
        const scrollStartY = creditsViewport.height() + (isPortrait ? 18 : 24);
        const scrollEndY = -(creditsContent.height() + (isPortrait ? 26 : 30));
        const durationMs = Math.max(1200, Number(creditsDurationMs) || 9000);
        const holdMs = Math.max(0, Number(endHoldMs) || 0);

        endGroup.visible(false);
        endingSequenceGroup.visible(true);
        endingHint.visible(Boolean(allowSkip));
        creditsContent.y(scrollStartY);
        stopEndingTween();
        safeEndingBatchDraw();

        if (allowSkip) {
            endingSequenceGroup.on("click.ending touchstart.ending", () => {
                finalizeEnding(token);
            });

            endingKeyHandler = (event) => {
                if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
                    event.preventDefault();
                    finalizeEnding(token);
                }
            };
            document.addEventListener("keydown", endingKeyHandler);
        }

        return new Promise((resolve) => {
            endingResolve = resolve;

            endingCreditsTween = new Konva.Tween({
                node: creditsContent,
                y: scrollEndY,
                duration: durationMs / 1000,
                easing: Konva?.Easings?.Linear,
                onFinish: () => {
                    endingCreditsTween = null;
                    if (token !== endingRunToken) {
                        return;
                    }

                    if (holdMs > 0) {
                        endingHoldTimer = setTimeout(() => {
                            endingHoldTimer = null;
                            finalizeEnding(token);
                        }, holdMs);
                        return;
                    }

                    finalizeEnding(token);
                }
            });
            endingCreditsTween.play();
        });
    };

    game_container.add(endGroup, chapterEndGroup, endingSequenceGroup);

    // Loading

    const loadingGroup = new Konva.Group({
        id: "loading-group",
        width: width,
        height: game_container.height(),
        visible: false
    });

    const loadingRect = new Konva.Rect({
        width: width,
        height: loadingGroup.height(),
        fill: config.colors.menu
    });

    const loadingImg = new Konva.Image({
        width: 50,
        height: 50,
        x: (loadingRect.width() / 2) - 25,
        y: (loadingRect.height() / 2) - 25,
        offsetX: 25, // center rotation
        offsetY: 25,
        image: loadImg(config.gui["loading-spinner-icon"])
    });

    const loadingAnimation = new Konva.Animation((frame) => {
        const angleDiff = (frame.timeDiff * 180) / 500; // 90 degrees per second
        loadingImg.rotate(angleDiff);
    }, game_layer);

    loadingGroup.add(loadingRect, loadingImg);

    game_container.add(loadingGroup);

    game_layer.add(game_container, topbar_container, load_win.actionrect);

    if (isPortrait) {
        game_container.on("click touchstart", () => {
            if (menuHolder.visible()) {
                menuBtn.fire("click");
            }
        });
    }

    // Remove any existing listeners before adding new ones to prevent stacking
    document.removeEventListener("fullscreenchange", syncExpandBtnVisibility);
    document.removeEventListener("webkitfullscreenchange", syncExpandBtnVisibility);
    document.removeEventListener("keydown", handleFullscreenEscape);

    document.addEventListener("fullscreenchange", syncExpandBtnVisibility);
    document.addEventListener("webkitfullscreenchange", syncExpandBtnVisibility);
    document.addEventListener("keydown", handleFullscreenEscape);

    // Defer initial sync to next frame to ensure all layers are ready
    topbarSyncFrameId = requestAnimationFrame(() => {
        topbarSyncFrameId = null;
        syncExpandBtnVisibility();
    });

    return ({
        layer: game_layer,
        topbar: topbar_container,
        actionbar: load_win,
        promptExitToHome,
        resetSession,
        teardown,
        game: {
            container: game_layer.findOne("#game-container"),
            camera: game_layer.findOne("#game-camera-group"),
            lightingOverlay: game_layer.findOne("#game-lighting-overlay"),
            viewport: game_layer.findOne("#game-box"),
            bg: game_layer.findOne("#game-bg"),
            bgGroup: game_layer.findOne("#game-bg-group"),
            foreGroup: game_layer.findOne("#game-fore-group"),
            transitionOverlay: game_layer.findOne("#game-transition-overlay"),
            flashOverlay: game_layer.findOne("#game-flash-overlay"),
            end: game_layer.findOne("#end-group"),
            chapterEnd: game_layer.findOne("#chapter-end-group"),
            endingSequence: game_layer.findOne("#ending-sequence-group"),
            playEndingSequence,
            stopEndingSequence,
            showChapterEndPrompt,
            hideChapterEndPrompt,
            resetSession,
            teardown,
            loading: game_layer.findOne("#loading-group")
        },
        dialog: {
            box: game_layer.findOne("#dialog-box"),
            bg: game_layer.findOne("#dialog-bg"),
            nameGroup: game_layer.findOne("#dialog-name-group"),
            nameBg: game_layer.findOne("#name-bg"),
            nameBorder: game_layer.findOne("#dialog-name-border"),
            name: game_layer.findOne("#dialog-name"),
            message: game_layer.findOne("#dialog-message")
        },
        animations: {
            loading: loadingAnimation
        }
    });
}

export { gameUI };
export default gameUI;