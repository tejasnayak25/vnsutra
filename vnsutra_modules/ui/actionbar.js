import "../konva.js";
import { animateBtn, closeBar } from "./utils.js";
import { cleanupActionbarScroll } from "./scrollable-content.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "../runtime-state.js";
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
    const actionWidth = isPortrait ? width : (width - siderect.width());

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
        x: isPortrait ? 0 : siderect.width(),
        visible: false
    });
    actionrect.width(actionWidth);
    actionrect.height(height);
    actionrect.x(isPortrait ? 0 : siderect.width());
    actionrect.visible(false);
    actionrect.__vnsutraHistoryOverlay = "actionbar";

    const actionbar = compiledActionbarLayout?.actionBg ?? new Konva.Rect({
        width: actionWidth,
        height: height
    });
    actionbar.setAttrs({
        fill: config.colors.menu,
        opacity: isPortrait ? config.ui.mobile.sidebar.opacity : config.ui.sidebar.opacity
    });

    const actionbar_border = compiledActionbarLayout?.actionTopBorder ?? new Konva.Rect({
        width: actionbar.width(),
        height: 6
    });
    actionbar_border.setAttrs({
        width: actionbar.width(),
        fill: config.colors.primary
    });

    const actionbar_title = compiledActionbarLayout?.actionTitle ?? new Konva.Text({
        align: "left",
        verticalAlign: "middle",
        padding: isPortrait ? 30 : (isAndroid ? 40 : 60),
        width: actionbar.width(),
        height: isPortrait ? 90 : (isAndroid ? 60 : 95),
        text: "Action Menu",
        fontFamily: fonts["other"],
        fontSize: isPortrait ? 30 : (isAndroid ? 25 : 30)
    });
    actionbar_title.fontSize(scaleFontSize(actionbar_title.fontSize()));
    actionbar_title.setAttrs({
        width: actionbar.width(),
        text: "Action Menu",
        fill: config.colors.text,
        fillAfterStrokeEnabled: true
    });

    const borderPadding = isPortrait ? 30 : (isAndroid ? 20 : 30);

    const actionbar_title_border = compiledActionbarLayout?.actionTitleBorder ?? new Konva.Rect({
        x: borderPadding,
        y: actionbar_title.height() - 10,
        height: 2,
        width: actionbar.width() - 2*borderPadding
    });
    actionbar_title_border.setAttrs({
        x: borderPadding,
        y: actionbar_title.height() - 10,
        width: actionbar.width() - 2*borderPadding,
        fill: config.colors["menu-border"]
    });

    const closeActionMenuBtn = new Konva.Image({
        width: isPortrait ? 50 : (isAndroid ? 30 : 40),
        height: isPortrait ? 50 : (isAndroid ? 30 : 40),
        x: actionrect.width() - (isPortrait ? 70 : (isAndroid ? 70 : 90)),
        y: isPortrait ? 15 : (isAndroid ? 15 : 25),
        image: close_square_img.cloneNode(true)
    });

    const addBtn = new Konva.Image({
        width: isPortrait ? 55 : (isAndroid ? 35 : 45),
        height: isPortrait ? 55 : (isAndroid ? 35 : 45),
        x: actionrect.width() - closeActionMenuBtn.width() - (isPortrait ? 70 : (isAndroid ? 70 : 90)) - 15,
        y: isPortrait ? 13 : (isAndroid ? 13 : 23),
        image: add_img.cloneNode(true),
        visible: false
    });

    addBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    addBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

    closeActionMenuBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    closeActionMenuBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

    closeActionMenuBtn.on("click touchstart", () => {
        setOpenWindow(null);
        animateBtn(closeActionMenuBtn);
        closeBar(actionrect);
    });

    const padding = 30;

    const contentWidth = actionrect.width() - 2*padding;
    const contentHeight = height - actionbar_title.height() - 2*padding;
    const actionContent = new Konva.Group({
        width: contentWidth,
        height: contentHeight,
        x: padding,
        y: actionbar_title.height() + padding,
        id: "action-content",
        clipX: 0,
        clipY: 0,
        clipWidth: contentWidth,
        clipHeight: contentHeight
    });

    const scrollContainer = new Konva.Group({
        width: 4,
        height: contentHeight,
        x: contentWidth + padding,
        y: actionContent.y()
    });

    const scrollbarBg = new Konva.Rect({
        width: 4,
        height: contentHeight,
        fill: config.colors.primary,
        opacity: 0.5
    });

    scrollContainer.add(scrollbarBg);

    const scrollbar = new Konva.Rect({
        width: 4,
        height: scrollContainer.height(),
        fill: config.colors.primary,
        draggable: true
    });

    scrollbar.dragBoundFunc(function(pos){
        const actionHeight = actionbar_title.height();
        const totalHeight = actionHeight + actionContent.height() + padding;
        if(pos.y < actionHeight + padding) {
            pos.y = actionHeight + padding;
        } else if(pos.y > (totalHeight - scrollbar.height())) {
            pos.y = totalHeight - scrollbar.height();
        }
        return {
            x: this.absolutePosition().x,
            y: pos.y
        };
    });

    scrollbar.on("mouseover", () => {
        scrollbar.fill(config.colors.secondary);
    });

    scrollbar.on("mouseout", () => {
        scrollbar.fill(config.colors.primary);
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
        scrollbar,
        scrollContainer,
        scrollScale: 1,
        /**
         * @param {string} value 
         */
        set title(value) {
            actionbar_title.text(value);
        },
        /**
         * @param {number} value 
         */
        set scrollbarHeight(value) {
            if(value > 1) {
                value = 0;
            }
            this.scrollScale = value;
            scrollbar.height(value * scrollContainer.height());

            if(value === 0) {
                scrollbarBg.visible(false);
            } else {
                scrollbarBg.visible(true);
            }
        },
        get scrollbarHeight() {
            return scrollbar.height()/scrollContainer.height();
        },
        /**
         * @param {number} value 
         */
        set scrollHeight(value) {
            if(value < 0) {
                value = 0;
            } else if(value > (scrollContainer.height() - scrollbar.height())) {
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
        },
        close(done = () => {}, options = {}) {
            const { animateButton = true } = options;
            cleanupActionbarScroll(this);
            setOpenWindow(null);
            if (animateButton) {
                animateBtn(closeActionMenuBtn);
            }
            closeBar(actionrect, done);
        }
    });
}

export { actionBar };
export default actionBar;