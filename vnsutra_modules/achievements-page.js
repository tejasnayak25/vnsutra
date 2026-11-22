import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import errorTracking from "./error-tracking.js";
import achievements from "./achievements.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";

const Konva = globalThis.Konva;

const ICONS = {
    trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
    star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    target: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
};

function createVectorIcon(pathData, x, y, size = 20, fill = "#F8F2FF", fallback = "★") {
    if (typeof Konva?.Path === "function") {
        const scale = size / 24;
        return new Konva.Path({
            x,
            y,
            data: pathData,
            fill,
            scale: { x: scale, y: scale },
            listening: false,
            perfectDrawEnabled: false
        });
    }
    return new Konva.Text({
        x,
        y,
        width: size,
        height: size,
        align: "center",
        verticalAlign: "middle",
        text: fallback,
        fontSize: size * 0.8,
        fill,
        listening: false,
        perfectDrawEnabled: false
    });
}

function achievementsPage(config, actionbar, fonts) {
    if (!Konva) {
        errorTracking?.captureError("Konva not available", {
            message: "[Achievements] Konva not available",
            context: { scope: "achievements" }
        });
        return null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const actionContent = actionbar.actionContent;
    let pendingRenderFrame = null;

    actionbar.addBtn.visible(false);

    const { width: containerWidth } = actionContent.getAttrs();

    // Twilight Color Palette
    const primaryColor = config?.colors?.primary || "#B88AEF";
    const secondaryColor = config?.colors?.secondary || "#F2A9D5";
    const goldColor = config?.colors?.gold || "#F6C66B";
    const textColor = config?.colors?.text || "#F8F2FF";
    const subtextColor = config?.colors?.["timestamp-text"] || "#C4B6DC";
    const fontOther = fonts?.["other"]?.name || fonts?.["other"] || "Inter";

    // Layout configuration
    const outerPadding = isPortrait ? 6 : 10;
    const cardGap = isPortrait ? 14 : 16;
    const columnGap = isPortrait ? 0 : 16;
    const columnCount = (isPortrait || isAndroid) ? 1 : 2;

    const titleSize = scaleFontSize(isPortrait ? 17 : 18);
    const bodySize = scaleFontSize(isPortrait ? 13 : 14);
    const footerSize = scaleFontSize(isPortrait ? 12 : 13);

    // Tween tracking to prevent canvas buffer leaks on layer detach
    const activeTweens = new Set();
    const runTween = (node, tweenConfig) => {
        if (!node || !node.getStage()) {
            return null;
        }
        let tw = null;
        const onFinishOrig = tweenConfig.onFinish;
        const configWithEasing = {
            easing: Konva?.Easings?.EaseOut,
            ...tweenConfig,
            onFinish: () => {
                if (tw) activeTweens.delete(tw);
                if (typeof onFinishOrig === "function") onFinishOrig();
            }
        };
        tw = node.to(configWithEasing);
        if (tw) activeTweens.add(tw);
        return tw;
    };

    const stopAllTweens = () => {
        activeTweens.forEach(tw => {
            try { tw.destroy(); } catch {}
        });
        activeTweens.clear();
    };

    const mainContainer = new Konva.Group({
        x: outerPadding,
        width: containerWidth - (2 * outerPadding),
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
        const emptyCard = new Konva.Group({
            x: 0,
            y: 20,
            width: mainContainer.width(),
            height: 140
        });

        const emptyCardBg = new Konva.Rect({
            x: 0,
            y: 0,
            width: mainContainer.width(),
            height: 140,
            cornerRadius: 16,
            fill: "rgba(35, 26, 62, 0.65)",
            stroke: "rgba(184, 138, 239, 0.28)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const emptyIcon = createVectorIcon(
            ICONS.trophy,
            (mainContainer.width() - 36) / 2,
            24,
            36,
            "rgba(184, 138, 239, 0.45)",
            "★"
        );

        const emptyText = new Konva.Text({
            x: 20,
            y: 72,
            width: mainContainer.width() - 40,
            align: "center",
            text: "No achievements configured yet.",
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 18 : 20),
            fontStyle: "bold",
            fill: textColor,
            perfectDrawEnabled: false
        });

        const emptySubtext = new Konva.Text({
            x: 20,
            y: 102,
            width: mainContainer.width() - 40,
            align: "center",
            text: "Story milestones and trophies will appear here as they are registered.",
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 13 : 14),
            fill: subtextColor,
            perfectDrawEnabled: false
        });

        emptyCard.add(emptyCardBg, emptyIcon, emptyText, emptySubtext);
        mainContainer.add(emptyCard);
        mainContainer.height(180);
    } else {
        // Sort: Unlocked first, then highest in-progress ratio, then title
        const sorted = [...report].sort((a, b) => {
            if (Boolean(a.unlocked) !== Boolean(b.unlocked)) {
                return a.unlocked ? -1 : 1;
            }
            const ratioA = (a.progress || 0) / Math.max(1, a.target || 1);
            const ratioB = (b.progress || 0) / Math.max(1, b.target || 1);
            if (ratioA !== ratioB) {
                return ratioB - ratioA;
            }
            return (a.title || "").localeCompare(b.title || "");
        });

        const unlockedCount = sorted.filter(item => Boolean(item.unlocked)).length;
        const totalCount = sorted.length;
        const progressRatioAll = totalCount > 0 ? (unlockedCount / totalCount) : 0;
        const isMastered = unlockedCount === totalCount && totalCount > 0;

        // 1. Hero Summary Banner
        const summaryCardHeight = isPortrait ? 96 : 88;
        const summaryCard = new Konva.Group({
            x: 0,
            y: 0,
            width: mainContainer.width(),
            height: summaryCardHeight
        });

        const summaryCardBg = new Konva.Rect({
            x: 0,
            y: 0,
            width: mainContainer.width(),
            height: summaryCardHeight,
            cornerRadius: 16,
            fill: "rgba(35, 26, 62, 0.75)",
            stroke: "rgba(184, 138, 239, 0.35)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        // Top inset neon highlight line
        const summaryTopGlow = new Konva.Rect({
            x: 24,
            y: 0,
            width: mainContainer.width() - 48,
            height: 1.2,
            fill: "rgba(242, 169, 213, 0.45)",
            perfectDrawEnabled: false
        });

        // Left Emblem Badge
        const summaryEmblemSize = isPortrait ? 58 : 52;
        const summaryEmblemX = 18;
        const summaryEmblemY = (summaryCardHeight - summaryEmblemSize) / 2;

        const summaryEmblemBox = new Konva.Rect({
            x: summaryEmblemX,
            y: summaryEmblemY,
            width: summaryEmblemSize,
            height: summaryEmblemSize,
            cornerRadius: 14,
            fill: isMastered ? "rgba(246, 198, 107, 0.22)" : "rgba(184, 138, 239, 0.20)",
            stroke: isMastered ? goldColor : primaryColor,
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const trophyIconSize = isPortrait ? 28 : 26;
        const summaryIcon = createVectorIcon(
            ICONS.trophy,
            summaryEmblemX + (summaryEmblemSize - trophyIconSize) / 2,
            summaryEmblemY + (summaryEmblemSize - trophyIconSize) / 2,
            trophyIconSize,
            isMastered ? goldColor : secondaryColor,
            "🏆"
        );

        const summaryTextX = summaryEmblemX + summaryEmblemSize + 16;
        const pillWidth = isPortrait ? 130 : 145;
        const pillHeight = 26;
        const pillX = mainContainer.width() - pillWidth - 18;
        const pillY = 16;

        // Top Right Count & Percentage Pill
        const countPillBg = new Konva.Rect({
            x: pillX,
            y: pillY,
            width: pillWidth,
            height: pillHeight,
            cornerRadius: 13,
            fill: "rgba(184, 138, 239, 0.18)",
            stroke: "rgba(242, 169, 213, 0.40)",
            strokeWidth: 1,
            perfectDrawEnabled: false
        });

        const countPillText = new Konva.Text({
            x: pillX,
            y: pillY,
            width: pillWidth,
            height: pillHeight,
            align: "center",
            verticalAlign: "middle",
            text: `${unlockedCount} / ${totalCount}  •  ${Math.round(progressRatioAll * 100)}%`,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 13 : 14),
            fontStyle: "bold",
            letterSpacing: 0.5,
            fill: textColor,
            perfectDrawEnabled: false
        });

        // Banner Title & Subtitle
        const summaryTitle = new Konva.Text({
            x: summaryTextX,
            y: 16,
            width: pillX - summaryTextX - 10,
            text: "ACHIEVEMENTS",
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 18 : 20),
            fontStyle: "bold",
            fill: primaryColor,
            letterSpacing: 2,
            perfectDrawEnabled: false
        });

        const summarySubtitle = new Konva.Text({
            x: summaryTextX,
            y: 42,
            width: pillX - summaryTextX - 10,
            text: isMastered
                ? "All story trophies mastered!"
                : "Complete milestones to unlock story badges",
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 13 : 14),
            fill: "#D8CCE8",
            perfectDrawEnabled: false
        });

        // Overall Progress Bar Track & Fill
        const summaryTrackY = summaryCardHeight - 16;
        const summaryTrackWidth = mainContainer.width() - summaryTextX - 18;

        const summaryTrack = new Konva.Rect({
            x: summaryTextX,
            y: summaryTrackY,
            width: summaryTrackWidth,
            height: 6,
            cornerRadius: 3,
            fill: "rgba(255, 255, 255, 0.10)",
            perfectDrawEnabled: false
        });

        const summaryFill = new Konva.Rect({
            x: summaryTextX,
            y: summaryTrackY,
            width: Math.max(0, summaryTrackWidth * progressRatioAll),
            height: 6,
            cornerRadius: 3,
            fill: isMastered ? goldColor : secondaryColor,
            perfectDrawEnabled: false
        });

        summaryCard.add(
            summaryCardBg,
            summaryTopGlow,
            summaryEmblemBox,
            summaryIcon,
            countPillBg,
            countPillText,
            summaryTitle,
            summarySubtitle,
            summaryTrack,
            summaryFill
        );
        mainContainer.add(summaryCard);

        // 2. Achievement Cards (2-column masonry on desktop / 1-column on mobile)
        const startY = summaryCardHeight + (isPortrait ? 14 : 18);
        const columnHeights = Array.from({ length: columnCount }, () => startY);

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
            const target = Math.max(1, item.target || 1);
            const progress = Math.min(item.progress || 0, target);
            const progressRatio = Math.min(1, progress / target);
            const inProgress = !unlocked && target > 1 && progress > 0;

            const iconSize = isPortrait ? 52 : 48;
            const iconPadding = 16;

            // Card Emblem
            const emblemBox = new Konva.Rect({
                x: iconPadding,
                y: iconPadding,
                width: iconSize,
                height: iconSize,
                cornerRadius: 14,
                fill: unlocked
                    ? "rgba(246, 198, 107, 0.18)"
                    : (inProgress ? "rgba(184, 138, 239, 0.18)" : "rgba(255, 255, 255, 0.04)"),
                stroke: unlocked
                    ? "rgba(246, 198, 107, 0.50)"
                    : (inProgress ? "rgba(184, 138, 239, 0.45)" : "rgba(184, 138, 239, 0.16)"),
                strokeWidth: 1.2,
                perfectDrawEnabled: false
            });

            const emblemIconSize = 24;
            const emblemPath = unlocked
                ? ICONS.trophy
                : (inProgress ? ICONS.target : ICONS.lock);
            const emblemFill = unlocked
                ? goldColor
                : (inProgress ? primaryColor : "rgba(184, 138, 239, 0.40)");

            const emblemIcon = createVectorIcon(
                emblemPath,
                iconPadding + (iconSize - emblemIconSize) / 2,
                iconPadding + (iconSize - emblemIconSize) / 2,
                emblemIconSize,
                emblemFill,
                unlocked ? "★" : "◇"
            );

            // Status Pill (Top Right)
            const statusPillWidth = isPortrait ? 104 : 100;
            const statusPillHeight = 26;
            const statusPillX = cardWidth - 16 - statusPillWidth;
            const statusPillY = 16;

            const statusPillBg = new Konva.Rect({
                x: statusPillX,
                y: statusPillY,
                width: statusPillWidth,
                height: statusPillHeight,
                cornerRadius: 13,
                fill: unlocked
                    ? "rgba(242, 169, 213, 0.20)"
                    : (inProgress ? "rgba(246, 198, 107, 0.18)" : "rgba(255, 255, 255, 0.04)"),
                stroke: unlocked
                    ? "rgba(242, 169, 213, 0.50)"
                    : (inProgress ? "rgba(246, 198, 107, 0.45)" : "rgba(184, 138, 239, 0.18)"),
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const statusText = new Konva.Text({
                x: statusPillX,
                y: statusPillY,
                width: statusPillWidth,
                height: statusPillHeight,
                align: "center",
                verticalAlign: "middle",
                text: unlocked ? "✦ COMPLETED" : (inProgress ? "IN PROGRESS" : "LOCKED"),
                fontFamily: fontOther,
                fontSize: scaleFontSize(11),
                fontStyle: "bold",
                letterSpacing: 0.8,
                fill: unlocked ? secondaryColor : (inProgress ? goldColor : "#D8CCE8"),
                perfectDrawEnabled: false
            });

            // Card Content (Title, Description, Progress / Footer)
            const contentX = iconPadding + iconSize + 14;
            const titleWidth = statusPillX - contentX - 10;

            const title = new Konva.Text({
                x: contentX,
                y: 16,
                width: titleWidth,
                text: item.title || "Achievement",
                fontFamily: fontOther,
                fontSize: titleSize,
                fontStyle: "bold",
                fill: unlocked ? textColor : "rgba(226, 232, 240, 0.75)",
                perfectDrawEnabled: false,
                wrap: "word"
            });

            const description = new Konva.Text({
                x: contentX,
                y: title.y() + title.height() + 6,
                width: cardWidth - contentX - 16,
                text: item.description || "",
                fontFamily: fontOther,
                fontSize: bodySize,
                lineHeight: 1.35,
                fill: unlocked ? "rgba(226, 232, 240, 0.90)" : "rgba(184, 170, 210, 0.60)",
                perfectDrawEnabled: false,
                wrap: "word"
            });

            const footerNodes = [];
            let calculatedBottomY = description.y() + description.height();

            if (unlocked) {
                const footerIconSize = 14;
                const footerY = description.y() + description.height() + 10;
                const checkIcon = createVectorIcon(
                    ICONS.check,
                    contentX,
                    footerY + 1,
                    footerIconSize,
                    secondaryColor,
                    "✓"
                );

                const unlockDateStr = item.unlockedAt
                    ? `Completed • ${new Date(item.unlockedAt).toLocaleDateString()}`
                    : "Completed • Milestone Achieved";

                const footerText = new Konva.Text({
                    x: contentX + footerIconSize + 6,
                    y: footerY,
                    text: unlockDateStr,
                    fontFamily: fontOther,
                    fontSize: footerSize,
                    letterSpacing: 0.5,
                    fontStyle: "bold",
                    fill: primaryColor,
                    perfectDrawEnabled: false
                });

                footerNodes.push(checkIcon, footerText);
                calculatedBottomY = footerY + footerText.height();
            } else if (target > 1) {
                const footerY = description.y() + description.height() + 10;
                const progressText = new Konva.Text({
                    x: contentX,
                    y: footerY,
                    text: `Progress: ${progress} / ${target}  (${Math.round(progressRatio * 100)}%)`,
                    fontFamily: fontOther,
                    fontSize: footerSize,
                    letterSpacing: 0.5,
                    fontStyle: "bold",
                    fill: inProgress ? goldColor : subtextColor,
                    perfectDrawEnabled: false
                });

                const trackY = progressText.y() + progressText.height() + 6;
                const trackWidth = cardWidth - contentX - 16;

                const track = new Konva.Rect({
                    x: contentX,
                    y: trackY,
                    width: trackWidth,
                    height: 6,
                    cornerRadius: 3,
                    fill: "rgba(255, 255, 255, 0.08)",
                    perfectDrawEnabled: false
                });

                const fillBar = new Konva.Rect({
                    x: contentX,
                    y: trackY,
                    width: Math.max(0, trackWidth * progressRatio),
                    height: 6,
                    cornerRadius: 3,
                    fill: inProgress ? goldColor : secondaryColor,
                    perfectDrawEnabled: false
                });

                footerNodes.push(progressText, track, fillBar);
                calculatedBottomY = trackY + 8;
            } else {
                const footerY = description.y() + description.height() + 10;
                const footerIconSize = 13;
                const lockIcon = createVectorIcon(
                    ICONS.lock,
                    contentX,
                    footerY + 1,
                    footerIconSize,
                    "rgba(184, 138, 239, 0.35)",
                    "🔒"
                );

                const lockText = new Konva.Text({
                    x: contentX + footerIconSize + 6,
                    y: footerY,
                    text: "Locked • Secret story event",
                    fontFamily: fontOther,
                    fontSize: footerSize,
                    letterSpacing: 0.5,
                    fill: "rgba(184, 170, 210, 0.45)",
                    perfectDrawEnabled: false
                });

                footerNodes.push(lockIcon, lockText);
                calculatedBottomY = footerY + lockText.height();
            }

            const cardHeight = Math.max(iconPadding + iconSize + 20, calculatedBottomY + 16);

            const cardBgNormal = unlocked
                ? "rgba(35, 26, 62, 0.75)"
                : (inProgress ? "rgba(30, 24, 52, 0.72)" : "rgba(22, 17, 38, 0.65)");

            const cardStrokeNormal = unlocked
                ? "rgba(242, 169, 213, 0.40)"
                : (inProgress ? "rgba(246, 198, 107, 0.40)" : "rgba(184, 138, 239, 0.18)");

            const cardStrokeHover = unlocked
                ? secondaryColor
                : (inProgress ? goldColor : "rgba(242, 169, 213, 0.45)");

            const cardBgHover = unlocked
                ? "rgba(48, 36, 84, 0.90)"
                : (inProgress ? "rgba(42, 32, 70, 0.88)" : "rgba(32, 26, 56, 0.85)");

            const cardRect = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                fill: cardBgNormal,
                stroke: cardStrokeNormal,
                strokeWidth: 1.2,
                cornerRadius: 16,
                perfectDrawEnabled: false
            });

            card.on("mouseenter", () => {
                runTween(cardRect, {
                    stroke: cardStrokeHover,
                    fill: cardBgHover,
                    duration: 0.15
                });
                if (typeof document !== "undefined") {
                    document.body.style.cursor = "default";
                }
            });

            card.on("mouseleave", () => {
                runTween(cardRect, {
                    stroke: cardStrokeNormal,
                    fill: cardBgNormal,
                    duration: 0.15
                });
                if (typeof document !== "undefined") {
                    document.body.style.cursor = "auto";
                }
            });

            card.height(cardHeight);
            card.add(
                cardRect,
                emblemBox,
                emblemIcon,
                statusPillBg,
                statusText,
                title,
                description,
                ...footerNodes
            );

            mainContainer.add(card);
            columnHeights[columnIndex] += cardHeight + cardGap;
        });

        const maxHeight = Math.max(...columnHeights);
        mainContainer.height(Math.max(0, maxHeight - cardGap));
    }

    function render() {
        stopAllTweens();
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

    return {
        container: mainContainer,
        render,
        destroy: stopAllTweens
    };
}

export { achievementsPage };
export default achievementsPage;
