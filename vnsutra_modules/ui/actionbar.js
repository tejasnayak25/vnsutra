import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { animateBtn, closeBar, openBar } from "./utils.js";
import { cleanupActionbarScroll } from "./scrollable-content.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize, getGameSettings } from "../runtime-state.js";
import { STORAGE_KEYS } from "../constants.js";
import errorTracking from "../error-tracking.js";
import { createKonvaNodesFromPlan } from "../ui-layout/runtime.js";

const Konva = globalThis.Konva;

let actionbarLayoutPlanCache = null;
let actionbarLayoutPlanPromise = null;

function isXmlLayoutEnabled(config) {
    return config?.ui?.["xml-mode"] !== false;
}

async function loadActionbarLayoutPlan() {
    if (actionbarLayoutPlanCache) {
        return actionbarLayoutPlanCache;
    }

    if (actionbarLayoutPlanPromise) {
        return actionbarLayoutPlanPromise;
    }

    actionbarLayoutPlanPromise = (async () => {
        try {
            const response = await fetch("../game/.ui-cache/actionbar.ui.json", { cache: "no-store" });
            if (!response.ok) {
                return null;
            }

            const plan = await response.json();
            if (!plan || !Array.isArray(plan.nodes)) {
                return null;
            }

            actionbarLayoutPlanCache = plan;
            return plan;
        } catch {
            return null;
        }
    })();

    try {
        return await actionbarLayoutPlanPromise;
    } finally {
        actionbarLayoutPlanPromise = null;
    }
}

function getPlanNode(nodesById, nodeId) {
    const entry = nodesById.get(nodeId);
    return entry?.node ?? null;
}

async function buildActionbarCompiledLayout({
    stageWidth,
    stageHeight,
    parentWidth,
    parentHeight,
    isPortrait,
    isAndroid
}) {
    const plan = await loadActionbarLayoutPlan();
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
                parentWidth,
                parentHeight,
                isPortrait,
                isAndroid
            }
        });

        const actionRoot = getPlanNode(nodesById, "action-root");
        const actionBg = getPlanNode(nodesById, "action-bg");
        const actionTopBorder = getPlanNode(nodesById, "action-top-border");
        const actionTitle = getPlanNode(nodesById, "action-title");
        const actionTitleBorder = getPlanNode(nodesById, "action-title-border");

        if (!actionRoot || !actionBg || !actionTopBorder || !actionTitle || !actionTitleBorder) {
            return null;
        }

        return {
            actionRoot,
            actionBg,
            actionTopBorder,
            actionTitle,
            actionTitleBorder
        };
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[ActionBar] Failed to build compiled actionbar layout; falling back to imperative UI",
            context: { scope: "actionbar", stage: "layout" }
        });
        return null;
    }
}

async function actionBar(config, siderect, width, height, fonts, close_square_img, add_img) {
    if (!Konva) {
        errorTracking?.captureError("Konva not available", {
            message: "[ActionBar] Konva not available",
            context: { scope: "actionbar" }
        });
        return null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const sidebarRight = (siderect?.x?.() || 0) + (siderect?.width?.() || 0);
    const actionWidth = isPortrait ? width : Math.max(300, width - sidebarRight);

    const compiledActionbarLayout = isXmlLayoutEnabled(config)
        ? await buildActionbarCompiledLayout({
            stageWidth: width,
            stageHeight: height,
            parentWidth: actionWidth,
            parentHeight: height,
            isPortrait,
            isAndroid
        })
        : null;

    const actionrect = compiledActionbarLayout?.actionRoot ?? new Konva.Group({
        width: actionWidth,
        height: height,
        x: isPortrait ? 0 : sidebarRight,
        visible: false
    });
    actionrect.width(actionWidth);
    actionrect.height(height);
    actionrect.x(isPortrait ? 0 : sidebarRight);
    actionrect.visible(false);
    actionrect.__vnsutraHistoryOverlay = "actionbar";

    const cardMarginX = isPortrait ? 0 : 24;
    const cardMarginY = isPortrait ? 0 : 20;
    const cardWidth = isPortrait ? actionWidth : (actionWidth - cardMarginX * 2);
    const cardHeight = isPortrait ? height : (height - cardMarginY * 2);

    const actionbar = compiledActionbarLayout?.actionBg ?? new Konva.Rect({
        x: isPortrait ? 0 : cardMarginX,
        y: isPortrait ? 0 : cardMarginY,
        width: cardWidth,
        height: cardHeight
    });
    actionbar.setAttrs({
        x: isPortrait ? 0 : cardMarginX,
        y: isPortrait ? 0 : cardMarginY,
        width: cardWidth,
        height: cardHeight,
        fill: config.colors.menu || "#141126",
        opacity: 0.92,
        cornerRadius: isPortrait ? [24, 24, 0, 0] : 24,
        stroke: "rgba(184, 138, 239, 0.40)",
        strokeWidth: 1.5,
        shadowColor: "#080612",
        shadowBlur: 32,
        shadowOpacity: 0.70,
        shadowOffsetX: -4,
        shadowOffsetY: 4,
        perfectDrawEnabled: false
    });

    const actionbar_border = compiledActionbarLayout?.actionTopBorder ?? new Konva.Rect({
        x: (isPortrait ? 0 : cardMarginX) + 36,
        y: isPortrait ? 0 : cardMarginY,
        width: cardWidth - 72,
        height: 2
    });
    actionbar_border.setAttrs({
        x: (isPortrait ? 0 : cardMarginX) + 36,
        y: isPortrait ? 0 : cardMarginY,
        width: cardWidth - 72,
        height: 2,
        fill: config.colors.secondary || "#F2A9D5",
        cornerRadius: 1,
        opacity: 0.85,
        perfectDrawEnabled: false
    });

    const titleHeight = isPortrait ? 80 : 80;
    const actionbar_title = compiledActionbarLayout?.actionTitle ?? new Konva.Text({
        align: "left",
        verticalAlign: "middle",
        x: (isPortrait ? 0 : cardMarginX) + 32,
        y: isPortrait ? 0 : cardMarginY,
        width: cardWidth - (isPortrait ? 130 : 170),
        height: titleHeight,
        text: "🌸  Action Menu",
        fontFamily: fonts["title"]?.name || "LavishlyYours",
        fontStyle: "italic",
        fontSize: scaleFontSize(isPortrait ? 28 : (isAndroid ? 24 : 32)),
        fill: "#F8F2FF"
    });
    actionbar_title.setAttrs({
        x: (isPortrait ? 0 : cardMarginX) + 32,
        y: isPortrait ? 0 : cardMarginY,
        width: cardWidth - (isPortrait ? 130 : 170),
        height: titleHeight,
        text: "🌸  Action Menu",
        fontFamily: fonts["title"]?.name || "LavishlyYours",
        fontStyle: "italic",
        fontSize: scaleFontSize(isPortrait ? 28 : (isAndroid ? 24 : 32)),
        verticalAlign: "middle",
        fill: "#F8F2FF",
        shadowColor: "#0D0B18",
        shadowBlur: 10,
        shadowOpacity: 0.5,
        shadowOffsetY: 2,
        fillAfterStrokeEnabled: true,
        perfectDrawEnabled: false
    });

    const borderPadding = isPortrait ? 20 : 28;
    const actionbar_title_border = compiledActionbarLayout?.actionTitleBorder ?? new Konva.Rect({
        x: (isPortrait ? 0 : cardMarginX) + borderPadding,
        y: (isPortrait ? 0 : cardMarginY) + titleHeight,
        height: 1,
        width: cardWidth - (2 * borderPadding)
    });
    actionbar_title_border.setAttrs({
        x: (isPortrait ? 0 : cardMarginX) + borderPadding,
        y: (isPortrait ? 0 : cardMarginY) + titleHeight,
        height: 1,
        width: cardWidth - (2 * borderPadding),
        fill: config.colors.primary || "#B88AEF",
        opacity: 0.30,
        perfectDrawEnabled: false
    });

    // Sleek Back Pill Button matching mockup with crisp vector arrow
    const backBtnWidth = isPortrait ? 90 : 96;
    const backBtnHeight = 36;
    const backBtnX = (isPortrait ? 0 : cardMarginX) + cardWidth - backBtnWidth - (isPortrait ? 16 : 28);
    const backBtnY = (isPortrait ? 0 : cardMarginY) + (titleHeight - backBtnHeight) / 2;
    const backBtnGroup = new Konva.Group({
        x: backBtnX,
        y: backBtnY,
        width: backBtnWidth,
        height: backBtnHeight
    });

    const backPill = new Konva.Rect({
        x: 0,
        y: 0,
        width: backBtnWidth,
        height: backBtnHeight,
        cornerRadius: 18,
        fill: "rgba(38, 30, 64, 0.85)",
        stroke: "rgba(184, 138, 239, 0.50)",
        strokeWidth: 1.2,
        shadowColor: "#0D0B18",
        shadowBlur: 8,
        shadowOpacity: 0.4,
        perfectDrawEnabled: false
    });

    const backArrowData = "M19 11H7.414l3.293-3.293a1 1 0 0 0-1.414-1.414l-5 5a1 1 0 0 0 0 1.414l5 5a1 1 0 0 0 1.414-1.414L7.414 13H19a1 1 0 0 0 0-2z";
    const backIconScale = isPortrait ? 0.62 : 0.65;
    const backIconBaseX = isPortrait ? 16 : 18;
    const backIcon = (typeof Konva.Path === "function")
        ? new Konva.Path({
            x: backIconBaseX,
            y: (backBtnHeight - (24 * backIconScale)) / 2,
            data: backArrowData,
            fill: "#F8F2FF",
            scale: { x: backIconScale, y: backIconScale },
            perfectDrawEnabled: false
        })
        : new Konva.Text({
            x: backIconBaseX,
            y: (backBtnHeight - scaleFontSize(16)) / 2,
            text: "<",
            fontSize: scaleFontSize(16),
            fill: "#F8F2FF"
        });

    const backTextX = isPortrait ? 38 : 40;
    const backText = new Konva.Text({
        x: backTextX,
        y: 0,
        width: backBtnWidth - backTextX,
        height: backBtnHeight,
        text: "Back",
        fontFamily: fonts["other"]?.name || "YanoneKaffeesatz",
        fontSize: scaleFontSize(isPortrait ? 17 : 19),
        fontStyle: "normal",
        fill: "#F8F2FF",
        align: "left",
        verticalAlign: "middle",
        perfectDrawEnabled: false
    });

    backBtnGroup.add(backPill, backIcon, backText);

    backBtnGroup.on("mouseover", () => {
        backPill.to({
            fill: "rgba(168, 85, 247, 0.40)",
            stroke: "#F2A9D5",
            strokeWidth: 1.5,
            duration: 0.15,
            easing: Konva?.Easings?.EaseOut
        });
        backIcon.to({
            x: backIconBaseX - 2,
            fill: "#FFFFFF",
            duration: 0.15,
            easing: Konva?.Easings?.EaseOut
        });
        document.body.style.cursor = "pointer";
    });

    backBtnGroup.on("mouseout", () => {
        backPill.to({
            fill: "rgba(38, 30, 64, 0.85)",
            stroke: "rgba(184, 138, 239, 0.50)",
            strokeWidth: 1.2,
            duration: 0.15,
            easing: Konva?.Easings?.EaseOut
        });
        backIcon.to({
            x: backIconBaseX,
            fill: "#F8F2FF",
            duration: 0.15,
            easing: Konva?.Easings?.EaseOut
        });
        document.body.style.cursor = "auto";
    });

    backBtnGroup.on("click touchstart", () => {
        setOpenWindow(null);
        animateBtn(backBtnGroup);
        closeBar(actionrect);
    });

    const closeActionMenuBtn = backBtnGroup;

    const addBtnSize = isPortrait ? 36 : 32;
    const addBtn = new Konva.Image({
        width: addBtnSize,
        height: addBtnSize,
        x: backBtnX - addBtnSize - 12,
        y: (isPortrait ? 0 : cardMarginY) + (titleHeight - addBtnSize) / 2,
        image: add_img.cloneNode(true),
        visible: false
    });

    addBtn.on("mouseover", () => {
        addBtn.opacity(0.8);
        document.body.style.cursor = "pointer";
    });

    addBtn.on("mouseout", () => {
        addBtn.opacity(1);
        document.body.style.cursor = "auto";
    });

    const contentPaddingX = isPortrait ? 16 : 28;
    const contentPaddingTop = 16;
    const contentPaddingBottom = 20;
    const contentWidth = cardWidth - contentPaddingX * 2;
    const contentHeight = cardHeight - titleHeight - contentPaddingTop - contentPaddingBottom;
    const contentY = (isPortrait ? 0 : cardMarginY) + titleHeight + contentPaddingTop;
    let viewTransitionTween = null;

    const actionContent = new Konva.Group({
        width: contentWidth,
        height: contentHeight,
        x: (isPortrait ? 0 : cardMarginX) + contentPaddingX,
        y: contentY,
        id: "action-content",
        clipX: 0,
        clipY: 0,
        clipWidth: contentWidth,
        clipHeight: contentHeight
    });

    const scrollContainer = new Konva.Group({
        width: 5,
        height: contentHeight,
        x: actionContent.x() + contentWidth + 6,
        y: actionContent.y()
    });

    const scrollbarBg = new Konva.Rect({
        width: 5,
        height: contentHeight,
        cornerRadius: 2.5,
        fill: "rgba(184, 138, 239, 0.12)",
        opacity: 0.5,
        perfectDrawEnabled: false
    });

    scrollContainer.add(scrollbarBg);

    const scrollbar = new Konva.Rect({
        width: 5,
        height: scrollContainer.height(),
        cornerRadius: 2.5,
        fill: "rgba(184, 138, 239, 0.55)",
        draggable: true,
        perfectDrawEnabled: false
    });

    scrollbar.dragBoundFunc(function (pos) {
        const actionContentY = actionContent.y();
        const totalHeight = actionContentY + actionContent.height();
        if (pos.y < actionContentY) {
            pos.y = actionContentY;
        } else if (pos.y > (totalHeight - scrollbar.height())) {
            pos.y = totalHeight - scrollbar.height();
        }
        return {
            x: this.absolutePosition().x,
            y: pos.y
        };
    });

    scrollbar.on("mouseover", () => {
        scrollbar.fill(config.colors.secondary || "#F2A9D5");
    });

    scrollbar.on("mouseout", () => {
        scrollbar.fill(config.colors.primary || "#B88AEF");
    });

    scrollContainer.add(scrollbar);

    if (compiledActionbarLayout?.actionRoot) {
        actionrect.add(addBtn, closeActionMenuBtn, actionContent, scrollContainer);
    } else {
        actionrect.add(actionbar, actionbar_border, actionbar_title, actionbar_title_border, addBtn, closeActionMenuBtn, actionContent, scrollContainer);
    }

    return ({
        addBtn,
        actionrect,
        actionContent,
        actionbar_title,
        closeActionMenuBtn,
        scrollbar,
        scrollContainer,
        scrollScale: 1,
        /**
         * @param {string} value 
         */
        set title(value) {
            const formatted = value ? (value.startsWith("🌸") ? value : `🌸  ${value}`) : "";
            actionbar_title.text(formatted);
        },
        /**
         * @param {number} value 
         */
        set scrollbarHeight(value) {
            if (value > 1) {
                value = 0;
            }
            this.scrollScale = value;
            scrollbar.height(value * scrollContainer.height());

            if (value === 0) {
                scrollbarBg.visible(false);
            } else {
                scrollbarBg.visible(true);
            }
        },
        get scrollbarHeight() {
            return scrollbar.height() / scrollContainer.height();
        },
        /**
         * @param {number} value 
         */
        set scrollHeight(value) {
            if (value < 0) {
                value = 0;
            } else if (value > (scrollContainer.height() - scrollbar.height())) {
                value = (scrollContainer.height() - scrollbar.height());
            }
            scrollbar.y(value);
        },
        get scrollHeight() {
            return scrollbar.y();
        },
        clear() {
            actionbar_title.text("");
            cleanupActionbarScroll(this);
            actionContent.removeChildren();
            this.scrollbarHeight = 0;
            if (!viewTransitionTween) {
                actionContent.opacity(1);
                actionContent.y(contentY);
                actionbar_title.opacity(1);
            }
        },
        /**
         * Smoothly switches the actionbar view.
         * If the actionbar is already visible, it runs a smooth cross-fade transition on actionContent.
         * If the actionbar is closed, it renders the content and animates the actionbar open.
         * @param {() => void | Promise<void>} renderFn
         * @param {() => void} [done]
         */
        switchView(renderFn, done = () => {}) {
            if (typeof renderFn !== "function") {
                if (typeof done === "function") done();
                return;
            }

            if (viewTransitionTween) {
                try { viewTransitionTween.destroy(); } catch { /* ignore */ }
                viewTransitionTween = null;
            }

            if (!actionrect.visible()) {
                actionContent.opacity(1);
                actionContent.y(contentY);
                actionbar_title.opacity(1);
                const result = renderFn();
                if (result && typeof result.then === "function") {
                    result.then(() => openBar(actionrect, done));
                } else {
                    openBar(actionrect, done);
                }
                return;
            }

            const gameSettings = getGameSettings();
            const reduceMotion = Boolean(gameSettings?.[STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION]);
            if (reduceMotion) {
                actionContent.opacity(1);
                actionContent.y(contentY);
                actionbar_title.opacity(1);
                const result = renderFn();
                if (result && typeof result.then === "function") {
                    result.then(() => done());
                } else {
                    done();
                }
                return;
            }

            viewTransitionTween = actionContent.to({
                opacity: 0,
                y: contentY - 8,
                duration: 0.12,
                easing: Konva?.Easings?.EaseIn,
                onFinish: () => {
                    viewTransitionTween = null;
                    const result = renderFn();
                    const finishTransition = () => {
                        actionContent.y(contentY + 8);
                        viewTransitionTween = actionContent.to({
                            opacity: 1,
                            y: contentY,
                            duration: 0.16,
                            easing: Konva?.Easings?.EaseOut,
                            onFinish: () => {
                                viewTransitionTween = null;
                                done();
                            }
                        });
                    };

                    if (result && typeof result.then === "function") {
                        result.then(finishTransition);
                    } else {
                        finishTransition();
                    }
                }
            });
        },
        close(done = () => { }, options = {}) {
            const { animateButton = true } = options;
            if (viewTransitionTween) {
                try { viewTransitionTween.destroy(); } catch { /* ignore */ }
                viewTransitionTween = null;
            }
            cleanupActionbarScroll(this);
            setOpenWindow(null);
            if (animateButton && backBtnGroup) {
                animateBtn(backBtnGroup);
            }
            closeBar(actionrect, done);
        }
    });
}

export { actionBar };
export default actionBar;