import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import errorTracking from "./error-tracking.js";
import achievements from "./achievements.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";
const Konva = globalThis.Konva;

function achievementsPage(config, actionbar, fonts) {
    if (!Konva) {
        errorTracking?.captureError("Konva not available", {
            message: "[Settings] Konva not available",
            context: { scope: "settings" }
        });
        return null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const actionContent = actionbar.actionContent;
    let pendingRenderFrame = null;

    actionbar.addBtn.visible(false);

    const { width: containerWidth } = actionContent.getAttrs();

    const outerPadding = isPortrait ? 8 : 14;
    const cardGap = isPortrait ? 14 : 16;
    const columnGap = isPortrait ? 0 : 16;
    const columnCount = isPortrait ? 1 : 2;
    const titleSize = scaleFontSize(isPortrait ? 24 : (isAndroid ? 20 : 24));
    const bodySize = scaleFontSize(isPortrait ? 20 : (isAndroid ? 16 : 18));
    const progressSize = scaleFontSize(isPortrait ? 18 : (isAndroid ? 14 : 16));

    const mainContainer = new Konva.Group({
        x: outerPadding,
        width: containerWidth - 2 * outerPadding,
        height: 0,
        listening: false
    });

    const scrollTouchArea = new Konva.Rect({
        x: 0,
        y: 0,
        width: actionContent.width(),
        height: actionContent.height(),
        fill: "rgba(0,0,0,0)",
        listening: true,
        visible: true
    });

    const cardWidth = columnCount === 1
        ? mainContainer.width()
        : ((mainContainer.width() - columnGap) / 2);

    const report = achievements.getProgressReport();

    if (!report.length) {
        const emptyText = new Konva.Text({
            width: mainContainer.width(),
            align: "center",
            text: "No achievements configured yet.",
            fontFamily: fonts["other"],
            fontSize: bodySize,
            fill: config.colors.text,
            fillAfterStrokeEnabled: true
        });
        mainContainer.add(emptyText);
        mainContainer.height(emptyText.height());
    } else {
        const sorted = [...report].sort((a, b) => {
            if (a.unlocked !== b.unlocked) {
                return a.unlocked ? -1 : 1;
            }
            return a.title.localeCompare(b.title);
        });

        const columnHeights = Array.from({ length: columnCount }, () => 0);

        sorted.forEach((item) => {
            let columnIndex = 0;
            if (columnCount > 1) {
                columnIndex = columnHeights[1] < columnHeights[0] ? 1 : 0;
            }

            const cardX = columnCount === 1 ? 0 : (columnIndex * (cardWidth + columnGap));
            const cardY = columnHeights[columnIndex];

            const card = new Konva.Group({
                width: cardWidth,
                x: cardX,
                y: cardY
            });

            const unlocked = Boolean(item.unlocked);
            const progressRatio = Math.min(1, (item.progress || 0) / Math.max(1, item.target || 1));

            const title = new Konva.Text({
                width: card.width() - 24,
                x: 12,
                y: 10,
                text: `${unlocked ? "🏆" : "•"} ${item.title}`,
                fontFamily: fonts["other"],
                fontSize: titleSize,
                fill: unlocked ? config.colors.primary : config.colors.text,
                fillAfterStrokeEnabled: true,
                wrap: "word"
            });

            const description = new Konva.Text({
                width: card.width() - 24,
                x: 12,
                y: title.y() + title.height() + 6,
                text: item.description || "",
                fontFamily: fonts["other"],
                fontSize: bodySize,
                fill: config.colors.text,
                opacity: 0.9,
                fillAfterStrokeEnabled: true,
                wrap: "word"
            });

            const progressText = new Konva.Text({
                width: card.width() - 24,
                x: 12,
                y: description.y() + description.height() + 10,
                text: unlocked ? "Completed" : `${Math.min(item.progress || 0, item.target || 0)}/${item.target}`,
                fontFamily: fonts["other"],
                fontSize: progressSize,
                fill: unlocked ? config.colors.primary : config.colors.text,
                fillAfterStrokeEnabled: true
            });

            const progressTrackY = progressText.y() + progressText.height() + 8;
            const progressTrack = new Konva.Rect({
                x: 12,
                y: progressTrackY,
                width: card.width() - 24,
                height: 8,
                fill: config.colors["menu-border"] || "gray",
                opacity: 0.5,
                cornerRadius: 4
            });

            const progressFill = new Konva.Rect({
                x: 12,
                y: progressTrackY,
                width: (card.width() - 24) * progressRatio,
                height: 8,
                fill: unlocked ? config.colors.primary : config.colors.secondary,
                cornerRadius: 4
            });

            const cardHeight = progressTrack.y() + progressTrack.height() + 12;

            const cardRect = new Konva.Rect({
                width: card.width(),
                height: cardHeight,
                fill: config.colors.menu,
                opacity: 0.85,
                stroke: unlocked ? config.colors.primary : (config.colors["menu-border"] || "gray"),
                strokeWidth: 2,
                cornerRadius: 12
            });

            card.height(cardHeight);
            card.add(cardRect, title, description, progressText, progressTrack, progressFill);

            mainContainer.add(card);

            columnHeights[columnIndex] += cardHeight + cardGap;
        });

        const maxHeight = Math.max(...columnHeights);
        mainContainer.height(Math.max(0, maxHeight - cardGap));
    }

    function render() {
        setOpenWindow("achievements");

        if (!actionContent.getStage()) {
            if (pendingRenderFrame == null) {
                pendingRenderFrame = globalThis.requestAnimationFrame(() => {
                    pendingRenderFrame = null;
                    render();
                });
            }
            return;
        }

        actionbar.clear();
        actionbar.title = "Achievements";
        mainContainer.y(0);

        actionContent.add(scrollTouchArea, mainContainer);

        bindActionbarScroll({
            actionbar,
            actionContent,
            contentNode: mainContainer,
            touchTargets: [scrollTouchArea],
            inertia: true,
            wheelFactor: 1,
            dragFactor: 1,
            resetToTop: true
        });
    }

    return ({
        container: mainContainer,
        render,
    });
}

export { achievementsPage };
export default achievementsPage;