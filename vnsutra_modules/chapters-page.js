import "./konva.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";
import chapters from "./chapters.js";

const Konva = globalThis.Konva;

function normalizeNoticeStatus(status) {
    if (typeof status !== "string") {
        return "";
    }

    return status.trim().toLowerCase().replace(/\s+/g, "-");
}

function getNoticePresentation(chapter, config, fallbackColor) {
    const rawStatus = typeof chapter?.status === "string" ? chapter.status.trim() : "";
    const normalizedStatus = normalizeNoticeStatus(rawStatus);
    const warningColor = config?.colors?.warning || "#f59e0b";
    const dangerColor = config?.colors?.danger || "#ef4444";

    if (normalizedStatus === "delayed" || normalizedStatus === "on-delay") {
        return { label: "Delayed", color: warningColor };
    }

    if (normalizedStatus === "project-dropped" || normalizedStatus === "dropped" || normalizedStatus === "cancelled" || normalizedStatus === "canceled") {
        return { label: "Dropped", color: dangerColor };
    }

    if (normalizedStatus === "completed" || normalizedStatus === "done") {
        return { label: "Completed", color: config.colors.primary };
    }

    if (normalizedStatus === "coming-soon") {
        return { label: "Coming Soon", color: warningColor };
    }

    if (rawStatus) {
        return { label: rawStatus, color: fallbackColor };
    }

    return { label: "Notice", color: fallbackColor };
}

function chaptersPage(config, actionbar, fonts, navigate) {
    if (!Konva) {
        return null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const actionContent = actionbar.actionContent;
    const title = config?.ui?.chapters?.title || "Chapter Map";

    actionbar.addBtn.visible(false);

    const horizontalPadding = isPortrait ? 10 : (isAndroid ? 12 : 16);

    const mainContainer = new Konva.Group({
        x: horizontalPadding,
        width: actionContent.width() - (horizontalPadding * 2),
        height: 0,
        listening: true
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

    let pendingRenderFrame = null;
    let chapterStartInFlight = false;

    const emptyTextSize = scaleFontSize(isPortrait ? 26 : 22);
    const summaryTitleSize = scaleFontSize(isPortrait ? 16 : 14);
    const summaryProgressSize = scaleFontSize(isPortrait ? 20 : 18);
    const summaryCurrentSize = scaleFontSize(isPortrait ? 16 : 14);
    const chapterBadgeFontSize = scaleFontSize(isPortrait ? 12 : 11);
    const headingTextSize = scaleFontSize(isPortrait ? 24 : 22);
    const descriptionTextSize = scaleFontSize(isPortrait ? 16 : 14);
    const footerTextSize = scaleFontSize(isPortrait ? 16 : 14);
    const sceneCountTextSize = scaleFontSize(isPortrait ? 17 : 15);
    const actionButtonTextSize = scaleFontSize(isPortrait ? 17 : 16);

    const buildContent = () => {
        mainContainer.removeChildren();

        const chapterMap = chapters.getMap();
        if (!chapterMap.length) {
            const emptyText = new Konva.Text({
                width: mainContainer.width(),
                align: "center",
                text: "No chapters configured.",
                fontFamily: fonts["other"],
                fontSize: emptyTextSize,
                fill: config.colors.text,
                fillAfterStrokeEnabled: true
            });
            mainContainer.add(emptyText);
            mainContainer.height(emptyText.height());
            return;
        }

        const secondaryColor = config.colors.secondary || config.colors.primary;
        const unit = isPortrait ? 10 : (isAndroid ? 9 : 10);
        const spacing = {
            xxs: Math.max(4, Math.round(unit * 0.5)),
            xs: unit,
            sm: unit + 4,
            md: unit + 8,
            lg: unit + 12
        };

        const cardGap = spacing.sm;
        const cardPadding = spacing.sm;
        const statusSize = isPortrait ? 15 : 13;
        const railX = spacing.sm;
        const cardX = railX + spacing.md + 10;
        const cardWidth = Math.max(140, mainContainer.width() - cardX);
        const nodeRadius = isPortrait ? 8 : 7;
        const nodeCenterOffsetY = spacing.sm + 10;

        const playableChapters = chapterMap.filter((chapter) => Boolean(chapter.playable));
        const completedCount = playableChapters.filter((chapter) => Boolean(chapter.completed)).length;
        const currentChapter = playableChapters.find((chapter) => Boolean(chapter.current)) || null;
        const totalPlayableCount = playableChapters.length;

        const summaryTitle = new Konva.Text({
            x: cardX + cardPadding,
            y: cardPadding,
            width: cardWidth - (cardPadding * 2),
            text: "CHAPTER MAP",
            fontFamily: fonts["other"],
            fontSize: summaryTitleSize,
            fill: config.colors["menu-border"],
            fillAfterStrokeEnabled: true,
            wrap: "none"
        });

        const summaryProgress = new Konva.Text({
            x: cardX + cardPadding,
            y: summaryTitle.y() + summaryTitle.height() + spacing.xxs,
            width: cardWidth - (cardPadding * 2),
            text: totalPlayableCount > 0
                ? `${completedCount}/${totalPlayableCount} chapters completed`
                : "No playable chapters yet",
            fontFamily: fonts["other"],
            fontSize: summaryProgressSize,
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
            wrap: "none"
        });

        const summaryCurrent = new Konva.Text({
            x: cardX + cardPadding,
            y: summaryProgress.y() + summaryProgress.height() + spacing.xxs,
            width: cardWidth - (cardPadding * 2),
            text: currentChapter
                ? `Active: Chapter ${currentChapter.index} • ${currentChapter.title}`
                : "Active: None",
            fontFamily: fonts["other"],
            fontSize: summaryCurrentSize,
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
            opacity: 0.82,
            wrap: "none"
        });

        const summaryHeight = summaryCurrent.y() + summaryCurrent.height() + cardPadding;
        const summaryOuter = new Konva.Rect({
            x: cardX,
            y: 0,
            width: cardWidth,
            height: summaryHeight,
            cornerRadius: 12,
            fill: config.colors.menu,
            opacity: 0.9,
            stroke: config.colors.primary,
            strokeWidth: 1.5
        });

        const summaryInner = new Konva.Rect({
            x: cardX + 2,
            y: 2,
            width: cardWidth - 4,
            height: summaryHeight - 4,
            cornerRadius: 10,
            fill: config.colors.menu,
            opacity: 0.6,
            stroke: config.colors["menu-border"],
            strokeWidth: 1
        });

        mainContainer.add(summaryOuter, summaryInner, summaryTitle, summaryProgress, summaryCurrent);

        let currentY = summaryHeight + cardGap;

        chapterMap.forEach((chapter, index) => {
            const card = new Konva.Group({
                x: cardX,
                y: currentY,
                width: cardWidth
            });

            const isNotice = chapter.type === "notice" || chapter.playable === false;
            const isUnlocked = isNotice ? true : Boolean(chapter.unlocked);
            const isCompleted = isNotice ? false : Boolean(chapter.completed);
            const isCurrent = isNotice ? false : Boolean(chapter.current);
            let statusLabel = "Locked";
            let statusColor = config.colors["menu-border"];

            if (isNotice) {
                const noticePresentation = getNoticePresentation(chapter, config, secondaryColor);
                statusLabel = noticePresentation.label;
                statusColor = noticePresentation.color;
            } else if (isCurrent) {
                statusLabel = "Current";
                statusColor = secondaryColor;
            } else if (isCompleted) {
                statusLabel = "Completed";
                statusColor = config.colors.primary;
            } else if (isUnlocked) {
                statusLabel = "Unlocked";
                statusColor = config.colors.text;
            }

            const sceneCount = Number.isFinite(chapter.sceneCount) ? chapter.sceneCount : 1;
            const sceneCountLabel = sceneCount === 1 ? "1 scene" : `${sceneCount} scenes`;

            const chapterNodeY = currentY + nodeCenterOffsetY;
            const chapterNodeRing = new Konva.Circle({
                x: railX,
                y: chapterNodeY,
                radius: isCurrent ? nodeRadius + 2 : nodeRadius + 1,
                fill: config.colors.menu,
                stroke: isNotice ? statusColor : config.colors["menu-border"],
                strokeWidth: 2,
                opacity: isUnlocked ? 0.95 : 0.55
            });

            const chapterNodeCore = new Konva.Circle({
                x: railX,
                y: chapterNodeY,
                radius: isCurrent ? nodeRadius : nodeRadius - 1,
                fill: statusColor,
                stroke: statusColor,
                strokeWidth: 1,
                opacity: isUnlocked ? 0.95 : 0.6
            });

            const chapterBadgeLabel = isNotice ? "NOTICE" : `CHAPTER ${chapter.index}`;
            const chapterTagMeasure = new Konva.Text({
                text: chapterBadgeLabel,
                fontFamily: fonts["other"],
                fontSize: chapterBadgeFontSize,
                fill: config.colors["primary-text"],
                fillAfterStrokeEnabled: true,
                wrap: "none"
            });

            const chapterTagWidth = Math.max(isPortrait ? 104 : 96, chapterTagMeasure.width() + (spacing.sm * 2));
            const chapterTagHeight = isPortrait ? 24 : 22;
            const chapterTagStyle = isNotice
                ? {
                    fill: config.colors.menu,
                    stroke: statusColor,
                    text: statusColor,
                    opacity: 0.94
                }
                : (isCurrent || isCompleted)
                    ? {
                        fill: statusColor,
                        stroke: statusColor,
                        text: config.colors["primary-text"],
                        opacity: 0.95
                    }
                    : isUnlocked
                        ? {
                            fill: config.colors.menu,
                            stroke: statusColor,
                            text: statusColor,
                            opacity: 0.92
                        }
                        : {
                            fill: config.colors.menu,
                            stroke: config.colors["menu-border"],
                            text: config.colors["menu-border"],
                            opacity: 0.75
                        };

            const chapterTagRect = new Konva.Rect({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: chapterTagHeight,
                cornerRadius: 6,
                fill: chapterTagStyle.fill,
                stroke: chapterTagStyle.stroke,
                strokeWidth: 1.5,
                opacity: chapterTagStyle.opacity
            });

            const chapterTagText = new Konva.Text({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: chapterTagHeight,
                align: "center",
                verticalAlign: "middle",
                text: chapterBadgeLabel,
                fontFamily: fonts["other"],
                fontSize: chapterBadgeFontSize,
                fill: chapterTagStyle.text,
                fillAfterStrokeEnabled: true,
                wrap: "none"
            });

            const statusMeasure = new Konva.Text({
                text: statusLabel,
                fontFamily: fonts["other"],
                fontSize: statusSize,
                fill: statusColor,
                fillAfterStrokeEnabled: true,
                wrap: "none"
            });

            const statusBadgeHeight = isPortrait ? 24 : 22;
            const statusBadgeWidth = Math.max(isPortrait ? 96 : 90, statusMeasure.width() + (spacing.sm * 2));
            const statusBadgeX = card.width() - cardPadding - statusBadgeWidth;

            const statusBadgeRect = new Konva.Rect({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: statusBadgeHeight,
                cornerRadius: 6,
                fill: config.colors.menu,
                stroke: statusColor,
                strokeWidth: 1.5,
                opacity: isUnlocked ? 0.96 : 0.72
            });

            const statusBadgeText = new Konva.Text({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: statusBadgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: statusLabel,
                fontFamily: fonts["other"],
                fontSize: statusSize,
                fill: statusColor,
                fillAfterStrokeEnabled: true,
                wrap: "none"
            });

            const headingText = new Konva.Text({
                x: cardPadding,
                y: chapterTagRect.y() + chapterTagRect.height() + spacing.xs,
                width: card.width() - (cardPadding * 2),
                text: chapter.title,
                fontFamily: fonts["other"],
                fontSize: headingTextSize,
                fill: config.colors.text,
                fillAfterStrokeEnabled: true,
                wrap: "word"
            });

            const chapterDescription = typeof chapter.description === "string" && chapter.description.trim().length > 0
                ? chapter.description.trim()
                : (isNotice ? "No notice details provided." : "No quest notes available.");

            const descriptionText = new Konva.Text({
                x: cardPadding,
                y: headingText.y() + headingText.height() + spacing.xs,
                width: card.width() - (cardPadding * 2),
                text: chapterDescription,
                fontFamily: fonts["other"],
                fontSize: descriptionTextSize,
                fill: config.colors.text,
                fillAfterStrokeEnabled: true,
                opacity: isNotice ? 0.9 : (isUnlocked ? 0.86 : 0.64),
                wrap: "word",
                lineHeight: 1.18
            });

            const actionButtonWidth = isPortrait ? 126 : 120;
            const actionButtonHeight = isPortrait ? 34 : 32;
            const footerY = descriptionText.y() + descriptionText.height() + spacing.sm;

            let sceneCountText = null;
            let actionButtonRect = null;
            let actionButtonText = null;
            let noticeFooterText = null;
            let cardHeight = 0;

            if (isNotice) {
                noticeFooterText = new Konva.Text({
                    x: cardPadding,
                    y: footerY,
                    width: card.width() - (cardPadding * 2),
                    text: "Informational entry",
                    fontFamily: fonts["other"],
                    fontSize: footerTextSize,
                    fill: statusColor,
                    fillAfterStrokeEnabled: true,
                    opacity: 0.88,
                    wrap: "none"
                });

                cardHeight = noticeFooterText.y() + noticeFooterText.height() + cardPadding;
            } else {
                sceneCountText = new Konva.Text({
                    x: cardPadding,
                    y: footerY,
                    width: card.width() - (cardPadding * 2) - actionButtonWidth - spacing.sm,
                    height: actionButtonHeight,
                    text: sceneCountLabel,
                    verticalAlign: "middle",
                    fontFamily: fonts["other"],
                    fontSize: sceneCountTextSize,
                    fill: config.colors["menu-border"],
                    fillAfterStrokeEnabled: true,
                    wrap: "none"
                });

                const actionButtonY = footerY;
                const actionButtonX = card.width() - cardPadding - actionButtonWidth;
                const actionLabel = isUnlocked
                    ? (isCurrent ? "Continue" : (isCompleted ? "Replay" : "Start"))
                    : "Locked";

                actionButtonRect = new Konva.Rect({
                    x: actionButtonX,
                    y: actionButtonY,
                    width: actionButtonWidth,
                    height: actionButtonHeight,
                    cornerRadius: 8,
                    fill: isUnlocked ? config.colors.primary : config.colors.menu,
                    stroke: isUnlocked ? config.colors.primary : config.colors["menu-border"],
                    strokeWidth: 1.5,
                    opacity: isUnlocked ? 0.95 : 0.6
                });

                actionButtonText = new Konva.Text({
                    x: actionButtonX,
                    y: actionButtonY,
                    width: actionButtonWidth,
                    height: actionButtonHeight,
                    align: "center",
                    verticalAlign: "middle",
                    text: actionLabel,
                    fontFamily: fonts["other"],
                    fontSize: actionButtonTextSize,
                    fill: isUnlocked ? config.colors["primary-text"] : config.colors["menu-border"],
                    fillAfterStrokeEnabled: true
                });

                cardHeight = actionButtonY + actionButtonHeight + cardPadding;
            }

            const cardOuter = new Konva.Rect({
                width: card.width(),
                height: cardHeight,
                fill: config.colors.menu,
                opacity: isNotice ? 0.9 : (isUnlocked ? 0.92 : 0.62),
                stroke: isNotice
                    ? statusColor
                    : isCurrent
                        ? secondaryColor
                        : (isCompleted ? config.colors.primary : config.colors["menu-border"]),
                strokeWidth: (isNotice || isCurrent || isCompleted) ? 1.5 : 1,
                cornerRadius: 12
            });

            const cardInner = new Konva.Rect({
                x: 2,
                y: 2,
                width: Math.max(1, card.width() - 4),
                height: Math.max(1, cardHeight - 4),
                fill: config.colors.menu,
                opacity: isUnlocked ? 0.5 : 0.42,
                stroke: config.colors["menu-border"],
                strokeWidth: 1,
                cornerRadius: 10
            });

            card.height(cardHeight);
            const cardNodes = [
                cardOuter,
                cardInner,
                chapterTagRect,
                chapterTagText,
                statusBadgeRect,
                statusBadgeText,
                headingText,
                descriptionText
            ];

            if (sceneCountText && actionButtonRect && actionButtonText) {
                cardNodes.push(sceneCountText, actionButtonRect, actionButtonText);
            }

            if (noticeFooterText) {
                cardNodes.push(noticeFooterText);
            }

            card.add(...cardNodes);

            if (index < chapterMap.length - 1) {
                const nextChapter = chapterMap[index + 1];
                const nextIsNotice = nextChapter?.type === "notice" || nextChapter?.playable === false;
                const connectorColor = nextIsNotice
                    ? config.colors["menu-border"]
                    : nextChapter?.unlocked
                        ? config.colors.primary
                        : config.colors["menu-border"];
                const connector = new Konva.Line({
                    points: [
                        railX,
                        chapterNodeY + nodeRadius,
                        railX,
                        currentY + cardHeight + cardGap + nodeCenterOffsetY - nodeRadius
                    ],
                    stroke: connectorColor,
                    strokeWidth: isCurrent ? 2.5 : 2,
                    opacity: nextIsNotice ? 0.45 : (nextChapter?.unlocked ? 0.75 : 0.45),
                    lineCap: "round"
                });
                mainContainer.add(connector);
            }

            mainContainer.add(chapterNodeRing, chapterNodeCore);

            const startChapter = () => {
                if (chapterStartInFlight) {
                    return;
                }

                const selected = chapters.startChapter(chapter.id);
                if (!selected) {
                    return;
                }

                chapterStartInFlight = true;
                setOpenWindow(null);

                actionbar.close(() => {
                    navigate("game", {
                        scene: selected.scene,
                        chapterId: selected.id
                    });

                    setTimeout(() => {
                        chapterStartInFlight = false;
                    }, 250);
                }, { animateButton: false });
            };

            if (!isNotice && isUnlocked && actionButtonRect) {
                card.on("mouseover", () => {
                    document.body.style.cursor = "pointer";
                    cardOuter.opacity(1);
                    cardInner.opacity(0.62);
                    actionButtonRect.opacity(1);
                    card.getLayer()?.batchDraw();
                });

                card.on("mouseout", () => {
                    document.body.style.cursor = "auto";
                    cardOuter.opacity(0.92);
                    cardInner.opacity(0.5);
                    actionButtonRect.opacity(0.95);
                    card.getLayer()?.batchDraw();
                });

                card.on("click touchstart", startChapter);
            }

            mainContainer.add(card);
            currentY += cardHeight + cardGap;
        });

        mainContainer.height(Math.max(1, currentY - cardGap));
    };

    function render() {
        setOpenWindow("chapters");

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
        actionbar.title = title;
        mainContainer.y(0);

        buildContent();

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
        render
    };
}

export { chaptersPage };
export default chaptersPage;
