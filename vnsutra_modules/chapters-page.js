import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import { bindActionbarScroll, bindHorizontalScroll } from "./ui/scrollable-content.js";
import chapters from "./chapters.js";

const Konva = globalThis.Konva;

const ICONS = {
    map: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
    book: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
    play: "M8 5v14l11-7z",
    replay: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
    sparkle: "M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z",
    info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
    clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
    flag: "M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z",
    compass: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.18 10.82l-4.76 2.04 2.04-4.76 4.76-2.04-2.04 4.76z"
};

function toRomanNumeral(num) {
    if (!Number.isFinite(num) || num <= 0) return String(num || 1);
    const lookup = [
        [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
    ];
    let res = "";
    let n = Math.floor(num);
    for (const [val, sym] of lookup) {
        while (n >= val) {
            res += sym;
            n -= val;
        }
    }
    return res || String(num);
}

function createVectorIcon(pathData, x, y, size = 20, fill = "#F8F2FF", fallback = "✦") {
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

function normalizeNoticeStatus(status) {
    if (typeof status !== "string") {
        return "";
    }
    return status.trim().toLowerCase().replace(/\s+/g, "-");
}

function getNoticePresentation(chapter, config, fallbackColor) {
    const rawStatus = typeof chapter?.status === "string" ? chapter.status.trim() : "";
    const normalizedStatus = normalizeNoticeStatus(rawStatus);
    const warningColor = config?.colors?.warning || "#F6C66B";
    const dangerColor = config?.colors?.danger || "#ef4444";
    const primaryColor = config?.colors?.primary || "#B88AEF";

    if (normalizedStatus === "delayed" || normalizedStatus === "on-delay") {
        return { label: "Delayed", color: warningColor, icon: ICONS.clock };
    }

    if (normalizedStatus === "project-dropped" || normalizedStatus === "dropped" || normalizedStatus === "cancelled" || normalizedStatus === "canceled") {
        return { label: "Dropped", color: dangerColor, icon: ICONS.info };
    }

    if (normalizedStatus === "completed" || normalizedStatus === "done") {
        return { label: "Completed", color: primaryColor, icon: ICONS.check };
    }

    if (normalizedStatus === "coming-soon") {
        return { label: "Coming Soon", color: warningColor, icon: ICONS.clock };
    }

    if (rawStatus) {
        return { label: rawStatus, color: fallbackColor, icon: ICONS.info };
    }

    return { label: "Notice", color: fallbackColor, icon: ICONS.info };
}

function chaptersPage(config, actionbar, fonts, navigate) {
    if (!Konva) {
        return null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const actionContent = actionbar.actionContent;
    const title = config?.ui?.chapters?.title || "Chapters";
    const shouldIgnoreActivation = () => performance.now() < (actionbar.__scrollSuppressTapUntil ?? 0);
    const supportsHover = !isPortrait && !isAndroid;

    actionbar.addBtn.visible(false);

    // Color tokens & typography matching new theme
    const primaryColor = config?.colors?.primary || "#B88AEF";
    const secondaryColor = config?.colors?.secondary || "#F2A9D5";
    const goldColor = config?.colors?.gold || "#F6C66B";
    const textColor = config?.colors?.text || "#F8F2FF";
    const subtextColor = config?.colors?.["timestamp-text"] || "#D8CCE8";
    const mutedBorder = "rgba(184, 138, 239, 0.28)";
    const fontOther = fonts?.["other"]?.name || fonts?.["other"] || "Inter";

    const configuredLayout = String(config?.ui?.chapters?.layout || "vertical").trim().toLowerCase().replace(/_/g, "-");
    const horizontalPadding = isPortrait ? 10 : (isAndroid ? 12 : 16);

    const mainContainer = new Konva.Group({
        x: configuredLayout === "vertical" ? horizontalPadding : 0,
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
    let contentSignature = null;

    // Tween tracking
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

    // Scaled typography
    const emptyTextSize = scaleFontSize(isPortrait ? 18 : 20);
    const heroTitleSize = scaleFontSize(isPortrait ? 13 : 13);
    const heroProgressSize = scaleFontSize(isPortrait ? 18 : 20);
    const heroActiveSize = scaleFontSize(isPortrait ? 13 : 13);
    const badgeFontSize = scaleFontSize(isPortrait ? 11 : 12);
    const headingTextSize = scaleFontSize(isPortrait ? 18 : 20);
    const descriptionTextSize = scaleFontSize(isPortrait ? 14 : 14);
    const metaTextSize = scaleFontSize(isPortrait ? 13 : 13);
    const actionBtnTextSize = scaleFontSize(isPortrait ? 14 : 15);

    const getContentSignature = () => chapters.getMap().map((chapter) => [
        chapter.id,
        chapter.type,
        chapter.title,
        chapter.description,
        chapter.status,
        Number(chapter.playable),
        Number(chapter.unlocked),
        Number(chapter.completed),
        Number(chapter.current),
        chapter.sceneCount ?? 0,
        configuredLayout
    ].join(":")).join("|");

    const startChapter = (chapter) => {
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

    // =========================================================================
    // Shared: Unified Route Progress Hero Banner
    // Used across ALL 4 layouts for complete visual consistency
    // =========================================================================
    const buildHeroProgressBanner = ({
        x,
        y,
        width,
        completedCount,
        totalPlayableCount,
        totalScenes,
        progressRatio,
        currentChapter,
        icon = ICONS.map
    }) => {
        const heroHeight = isPortrait ? 122 : 112;
        const heroGroup = new Konva.Group({
            x,
            y,
            width,
            height: heroHeight,
            name: "chapters-hero-banner"
        });

        const heroBg = new Konva.Rect({
            x: 0,
            y: 0,
            width,
            height: heroHeight,
            cornerRadius: 16,
            fill: "rgba(35, 26, 62, 0.85)",
            stroke: "rgba(184, 138, 239, 0.40)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const heroTopGlow = new Konva.Rect({
            x: 24,
            y: 0,
            width: Math.max(0, width - 48),
            height: 1.2,
            fill: "rgba(242, 169, 213, 0.45)",
            perfectDrawEnabled: false
        });

        const emblemSize = isPortrait ? 52 : 56;
        const emblemX = 14;
        const emblemY = (heroHeight - emblemSize) / 2;

        const emblemBox = new Konva.Rect({
            x: emblemX,
            y: emblemY,
            width: emblemSize,
            height: emblemSize,
            cornerRadius: 14,
            fill: "rgba(184, 138, 239, 0.20)",
            stroke: primaryColor,
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const emblemIcon = createVectorIcon(
            icon,
            emblemX + (emblemSize - 28) / 2,
            emblemY + (emblemSize - 28) / 2,
            28,
            secondaryColor,
            "🗺"
        );

        const heroTextX = emblemX + emblemSize + 14;
        const heroTextWidth = Math.max(40, width - heroTextX - 16);

        const heroTitle = new Konva.Text({
            x: heroTextX,
            y: isPortrait ? 14 : 15,
            width: heroTextWidth,
            text: "ROUTE PROGRESS & MILESTONES",
            fontFamily: fontOther,
            fontSize: heroTitleSize,
            fontStyle: "bold",
            letterSpacing: 1.6,
            fill: primaryColor,
            perfectDrawEnabled: false
        });

        const heroProgress = new Konva.Text({
            x: heroTextX,
            y: heroTitle.y() + 20,
            width: heroTextWidth,
            text: totalPlayableCount > 0
                ? `${completedCount}/${totalPlayableCount} Chapters Completed • ${totalScenes} Scenes`
                : "No playable chapters yet",
            fontFamily: fontOther,
            fontSize: heroProgressSize,
            fontStyle: "bold",
            fill: "#FFFFFF",
            perfectDrawEnabled: false
        });

        const barY = heroProgress.y() + 28;
        const barHeight = 8;
        const barWidth = Math.max(60, heroTextWidth - 54);

        const barTrack = new Konva.Rect({
            x: heroTextX,
            y: barY,
            width: barWidth,
            height: barHeight,
            cornerRadius: 4,
            fill: "rgba(25, 20, 48, 0.75)",
            stroke: "rgba(184, 138, 239, 0.30)",
            strokeWidth: 1,
            perfectDrawEnabled: false
        });

        const barFillWidth = Math.max(progressRatio > 0 ? 6 : 0, barWidth * Math.min(1, Math.max(0, progressRatio)));
        const barFill = new Konva.Rect({
            x: heroTextX,
            y: barY,
            width: barFillWidth,
            height: barHeight,
            cornerRadius: 4,
            fill: secondaryColor,
            perfectDrawEnabled: false
        });

        const percentText = new Konva.Text({
            x: heroTextX + barWidth + 8,
            y: barY - 4,
            width: 44,
            text: `${Math.round(progressRatio * 100)}%`,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 13 : 14),
            fontStyle: "bold",
            fill: textColor,
            perfectDrawEnabled: false
        });

        const heroActive = new Konva.Text({
            x: heroTextX,
            y: barY + barHeight + 6,
            width: heroTextWidth,
            text: currentChapter
                ? `Active: Chapter ${currentChapter.index} • ${currentChapter.title}`
                : "Active: None",
            fontFamily: fontOther,
            fontSize: heroActiveSize,
            fill: secondaryColor,
            perfectDrawEnabled: false
        });

        heroGroup.add(
            heroBg,
            heroTopGlow,
            emblemBox,
            emblemIcon,
            heroTitle,
            heroProgress,
            barTrack,
            barFill,
            percentText,
            heroActive
        );

        return { heroGroup, heroHeight };
    };

    // =========================================================================
    // Layout 1: Vertical Metro Rail Timeline (Existing, 100% Preserved)
    // =========================================================================
    const buildVerticalLayout = (chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes) => {
        const railX = isPortrait ? 14 : 20;
        const cardX = railX + (isPortrait ? 26 : 32);
        const cardWidth = Math.max(160, mainContainer.width() - cardX);
        const cardGap = isPortrait ? 14 : 16;
        const cardPadding = isPortrait ? 16 : 18;

        // 1. Hero Route Progress Banner
        const { heroGroup, heroHeight } = buildHeroProgressBanner({
            x: cardX,
            y: 0,
            width: cardWidth,
            completedCount,
            totalPlayableCount,
            totalScenes,
            progressRatio,
            currentChapter
        });

        mainContainer.add(heroGroup);

        // 2. Timeline Chapters & Rail
        let currentY = heroHeight + cardGap + 6;
        const nodeRadius = isPortrait ? 9 : 10;
        const nodePositions = [];

        chapterMap.forEach((chapter) => {
            const isNotice = chapter.type === "notice" || chapter.playable === false;
            const isUnlocked = isNotice ? true : Boolean(chapter.unlocked);
            const isCompleted = isNotice ? false : Boolean(chapter.completed);
            const isCurrent = isNotice ? false : Boolean(chapter.current);

            let statusLabel = "Locked";
            let statusColor = "rgba(184, 138, 239, 0.45)";

            if (isNotice) {
                const noticePresentation = getNoticePresentation(chapter, config, secondaryColor);
                statusLabel = noticePresentation.label;
                statusColor = noticePresentation.color;
            } else if (isCurrent) {
                statusLabel = "Current";
                statusColor = secondaryColor;
            } else if (isCompleted) {
                statusLabel = "Completed";
                statusColor = goldColor;
            } else if (isUnlocked) {
                statusLabel = "Unlocked";
                statusColor = primaryColor;
            }

            const card = new Konva.Group({
                x: cardX,
                y: currentY,
                width: cardWidth,
                name: `chapter-card-${chapter.id}`
            });

            const cardBg = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardWidth,
                height: 100,
                cornerRadius: 16,
                fill: isNotice
                    ? "rgba(30, 24, 52, 0.85)"
                    : isCurrent
                        ? "rgba(42, 32, 70, 0.90)"
                        : isUnlocked
                            ? "rgba(35, 26, 62, 0.78)"
                            : "rgba(22, 17, 38, 0.65)",
                stroke: isNotice
                    ? statusColor
                    : isCurrent
                        ? secondaryColor
                        : isCompleted
                            ? "rgba(246, 198, 107, 0.55)"
                            : isUnlocked
                                ? "rgba(184, 138, 239, 0.35)"
                                : "rgba(184, 138, 239, 0.15)",
                strokeWidth: isCurrent ? 1.5 : 1.2,
                perfectDrawEnabled: false
            });

            const topGlowLine = new Konva.Rect({
                x: 20,
                y: 0,
                width: cardWidth - 40,
                height: 1.2,
                fill: isCurrent ? "rgba(242, 169, 213, 0.55)" : "rgba(184, 138, 239, 0.30)",
                perfectDrawEnabled: false
            });

            const chapterBadgeLabel = isNotice ? "✦ SPECIAL NOTICE" : `CHAPTER ${chapter.index}`;
            const chapterTagMeasure = new Konva.Text({
                text: chapterBadgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2
            });
            const chapterTagWidth = Math.max(isPortrait ? 104 : 116, Math.ceil(chapterTagMeasure.width()) + 24);
            const badgeHeight = 28;

            const chapterTagBox = new Konva.Rect({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: badgeHeight,
                cornerRadius: 8,
                fill: isNotice ? "rgba(184, 138, 239, 0.16)" : "rgba(184, 138, 239, 0.22)",
                stroke: isNotice ? statusColor : "rgba(184, 138, 239, 0.45)",
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const chapterTagText = new Konva.Text({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: chapterBadgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2,
                fill: isNotice ? statusColor : "#FFFFFF",
                perfectDrawEnabled: false
            });

            const statusMeasure = new Konva.Text({
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1
            });
            const statusBadgeWidth = Math.max(isPortrait ? 88 : 96, Math.ceil(statusMeasure.width()) + 24);
            const statusBadgeX = cardWidth - cardPadding - statusBadgeWidth;

            const statusBadgeBox = new Konva.Rect({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: badgeHeight,
                cornerRadius: 8,
                fill: isCurrent
                    ? "rgba(242, 169, 213, 0.22)"
                    : isCompleted
                        ? "rgba(246, 198, 107, 0.18)"
                        : "rgba(35, 26, 62, 0.60)",
                stroke: statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const statusTextNode = new Konva.Text({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1,
                fill: statusColor,
                perfectDrawEnabled: false
            });

            const headingY = cardPadding + badgeHeight + 10;
            const headingWidth = cardWidth - (cardPadding * 2);

            const headingText = new Konva.Text({
                x: cardPadding,
                y: headingY,
                width: headingWidth,
                text: chapter.title,
                fontFamily: fontOther,
                fontSize: headingTextSize,
                fontStyle: "bold",
                letterSpacing: 0.8,
                fill: "#FFFFFF",
                lineHeight: 1.2,
                perfectDrawEnabled: false
            });

            const descY = headingY + headingText.height() + 6;
            const chapterDescription = typeof chapter.description === "string" && chapter.description.trim().length > 0
                ? chapter.description.trim()
                : (isNotice ? "No notice details provided." : "No quest notes available.");

            const descriptionText = new Konva.Text({
                x: cardPadding,
                y: descY,
                width: headingWidth,
                text: chapterDescription,
                fontFamily: fontOther,
                fontSize: descriptionTextSize,
                fill: isUnlocked ? subtextColor : "rgba(184, 138, 239, 0.55)",
                lineHeight: 1.28,
                perfectDrawEnabled: false
            });

            const footerY = descY + descriptionText.height() + 14;
            const actionBtnWidth = isPortrait ? 124 : 126;
            const actionBtnHeight = isPortrait ? 40 : 38;

            let cardHeight = 0;
            let actionBtnGroup = null;

            if (isNotice) {
                const noticeEmblemBox = new Konva.Rect({
                    x: cardPadding,
                    y: footerY,
                    width: headingWidth,
                    height: 36,
                    cornerRadius: 8,
                    fill: "rgba(184, 138, 239, 0.12)",
                    stroke: "rgba(184, 138, 239, 0.25)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const noticeIcon = createVectorIcon(
                    ICONS.info,
                    cardPadding + 12,
                    footerY + 10,
                    16,
                    statusColor,
                    "ℹ"
                );

                const noticeFooterText = new Konva.Text({
                    x: cardPadding + 34,
                    y: footerY,
                    width: headingWidth - 44,
                    height: 36,
                    verticalAlign: "middle",
                    text: "Informational route bulletin",
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fill: statusColor,
                    perfectDrawEnabled: false
                });

                cardHeight = footerY + 36 + cardPadding;
                card.add(noticeEmblemBox, noticeIcon, noticeFooterText);
            } else {
                const sceneCount = Number.isFinite(chapter.sceneCount) ? chapter.sceneCount : 1;
                const sceneCountLabel = sceneCount === 1 ? "1 Scene" : `${sceneCount} Scenes`;

                const scenePillWidth = isPortrait ? 108 : 114;
                const scenePillHeight = actionBtnHeight;

                const scenePillBox = new Konva.Rect({
                    x: cardPadding,
                    y: footerY,
                    width: scenePillWidth,
                    height: scenePillHeight,
                    cornerRadius: 10,
                    fill: "rgba(25, 20, 48, 0.70)",
                    stroke: "rgba(184, 138, 239, 0.28)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const sceneIcon = createVectorIcon(
                    ICONS.book,
                    cardPadding + 10,
                    footerY + (scenePillHeight - 16) / 2,
                    16,
                    primaryColor,
                    "📖"
                );

                const sceneCountText = new Konva.Text({
                    x: cardPadding + 32,
                    y: footerY,
                    width: scenePillWidth - 36,
                    height: scenePillHeight,
                    verticalAlign: "middle",
                    text: sceneCountLabel,
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fontStyle: "bold",
                    fill: "#FFFFFF",
                    perfectDrawEnabled: false
                });

                const actionBtnX = cardWidth - cardPadding - actionBtnWidth;
                const actionLabel = isUnlocked
                    ? (isCurrent ? "Continue" : (isCompleted ? "Replay" : "Start"))
                    : "Locked";

                actionBtnGroup = new Konva.Group({
                    x: actionBtnX,
                    y: footerY,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    name: `action-btn-${chapter.id}`
                });

                const actionBtnBox = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    cornerRadius: 10,
                    fill: isUnlocked
                        ? (isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)")
                        : "rgba(255, 255, 255, 0.04)",
                    stroke: isUnlocked
                        ? (isCurrent ? secondaryColor : primaryColor)
                        : "rgba(184, 138, 239, 0.20)",
                    strokeWidth: 1.2,
                    perfectDrawEnabled: false
                });

                const actionBtnText = new Konva.Text({
                    x: 0,
                    y: 0,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    align: "center",
                    text: actionLabel,
                    fontFamily: fontOther,
                    fontSize: actionBtnTextSize,
                    fontStyle: "bold",
                    letterSpacing: 1.2,
                    fill: isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.45)",
                    perfectDrawEnabled: false
                });

                actionBtnGroup.add(actionBtnBox, actionBtnText);
                card.add(scenePillBox, sceneIcon, sceneCountText, actionBtnGroup);

                cardHeight = footerY + actionBtnHeight + cardPadding;
            }

            cardBg.height(cardHeight);
            card.height(cardHeight);

            card.add(
                cardBg,
                topGlowLine,
                chapterTagBox,
                chapterTagText,
                statusBadgeBox,
                statusTextNode,
                headingText,
                descriptionText
            );

            cardBg.moveToBottom();
            topGlowLine.moveUp();

            const nodeCenterY = currentY + cardPadding + (badgeHeight / 2);
            nodePositions.push({
                x: railX,
                y: nodeCenterY,
                isCurrent,
                isCompleted,
                isUnlocked,
                isNotice,
                statusColor
            });

            if (supportsHover) {
                card.on("mouseover", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = isUnlocked && !isNotice ? "pointer" : "default";
                    runTween(cardBg, {
                        stroke: isNotice ? statusColor : (isCurrent ? secondaryColor : primaryColor),
                        fill: isNotice ? "rgba(38, 30, 64, 0.95)" : "rgba(48, 36, 80, 0.95)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) {
                            runTween(btnBox, {
                                fill: "rgba(242, 169, 213, 0.45)",
                                stroke: secondaryColor,
                                duration: 0.15
                            });
                        }
                    }
                });

                card.on("mouseout", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = "auto";
                    runTween(cardBg, {
                        stroke: isNotice
                            ? statusColor
                            : isCurrent
                                ? secondaryColor
                                : isCompleted
                                    ? "rgba(246, 198, 107, 0.55)"
                                    : isUnlocked
                                        ? "rgba(184, 138, 239, 0.35)"
                                        : "rgba(184, 138, 239, 0.15)",
                        fill: isNotice
                            ? "rgba(30, 24, 52, 0.85)"
                            : isCurrent
                                ? "rgba(42, 32, 70, 0.90)"
                                : isUnlocked
                                    ? "rgba(35, 26, 62, 0.78)"
                                    : "rgba(22, 17, 38, 0.65)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) {
                            runTween(btnBox, {
                                fill: isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)",
                                stroke: isCurrent ? secondaryColor : primaryColor,
                                duration: 0.15
                            });
                        }
                    }
                });
            }

            if (!isNotice && isUnlocked) {
                card.on("click tap", () => {
                    if (shouldIgnoreActivation()) {
                        return;
                    }
                    startChapter(chapter);
                });
            }

            mainContainer.add(card);
            currentY += cardHeight + cardGap;
        });

        // Connect hero banner to the first chapter node
        if (nodePositions.length > 0) {
            const firstNode = nodePositions[0];
            const emblemSize = isPortrait ? 52 : 56;
            const emblemY = (heroHeight - emblemSize) / 2;
            const heroConnector = new Konva.Line({
                points: [
                    railX,
                    emblemY + (emblemSize / 2),
                    railX,
                    firstNode.y - nodeRadius
                ],
                stroke: "rgba(184, 138, 239, 0.50)",
                strokeWidth: 2,
                perfectDrawEnabled: false
            });
            mainContainer.add(heroConnector);
        }

        // Connect successive chapter nodes
        for (let i = 0; i < nodePositions.length - 1; i++) {
            const current = nodePositions[i];
            const next = nodePositions[i + 1];
            const isLineActive = next.isUnlocked || next.isNotice;

            const connectorLine = new Konva.Line({
                points: [
                    railX,
                    current.y + nodeRadius,
                    railX,
                    next.y - nodeRadius
                ],
                stroke: isLineActive ? "rgba(184, 138, 239, 0.55)" : "rgba(184, 138, 239, 0.20)",
                strokeWidth: 2,
                dash: isLineActive ? [] : [4, 4],
                perfectDrawEnabled: false
            });
            mainContainer.add(connectorLine);
        }

        // Render nodes
        nodePositions.forEach((pos) => {
            const haloRadius = pos.isCurrent ? nodeRadius + 5 : nodeRadius + 3;
            const haloRing = new Konva.Circle({
                x: pos.x,
                y: pos.y,
                radius: haloRadius,
                fill: pos.isCurrent ? "rgba(242, 169, 213, 0.25)" : "rgba(35, 26, 62, 0.85)",
                stroke: pos.statusColor,
                strokeWidth: pos.isCurrent ? 2 : 1.5,
                perfectDrawEnabled: false
            });

            const coreRadius = pos.isCurrent ? nodeRadius - 1 : nodeRadius - 2;
            const coreCircle = new Konva.Circle({
                x: pos.x,
                y: pos.y,
                radius: coreRadius,
                fill: pos.isUnlocked ? pos.statusColor : "rgba(184, 138, 239, 0.20)",
                stroke: pos.statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            mainContainer.add(haloRing, coreCircle);
        });

        mainContainer.width(actionContent.width() - (horizontalPadding * 2));
        mainContainer.height(Math.max(1, currentY - cardGap + 16));
    };

    // =========================================================================
    // Layout 2: Horizontal Single-Row Timeline (Pinned Hero, Wide Cards, Centered Rail)
    // =========================================================================
    const buildHorizontalTimelineLayout = (chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes) => {
        const viewportW = actionContent.width();
        const viewportH = actionContent.height();
        const heroW = viewportW - (horizontalPadding * 2);

        // 1. Unified Hero Progress Banner — pinned to mainContainer top (never scrolls horizontally, never stretches)
        const { heroGroup, heroHeight } = buildHeroProgressBanner({
            x: horizontalPadding,
            y: isPortrait ? 8 : 10,
            width: heroW,
            completedCount,
            totalPlayableCount,
            totalScenes,
            progressRatio,
            currentChapter
        });
        mainContainer.add(heroGroup);

        // 2. Horizontal Scroll Group — holds the rail, milestones, and cards
        const scrollGroup = new Konva.Group({
            x: 0,
            y: heroHeight + (isPortrait ? 18 : 22),
            listening: true,
            name: "chapters-scroll-content"
        });

        // Spacious, wide cards (wider so badges never break onto 2 lines)
        const cardWidth = isPortrait ? 380 : 440;
        const cardHeight = isPortrait ? 250 : 270;
        const cardGap = isPortrait ? 28 : 36;
        const startX = 28;
        const totalTimelineWidth = startX + chapterMap.length * (cardWidth + cardGap) + 48;

        const remainingH = viewportH - (heroHeight + (isPortrait ? 18 : 22)) - 24;
        const totalBlockHeight = 32 + 24 + cardHeight;
        const blockTopY = Math.max(10, Math.floor((remainingH - totalBlockHeight) / 2));
        const railY = blockTopY + 16;
        const cardY = railY + 34;
        const nodeRadius = 14;
        const nodePositions = [];

        chapterMap.forEach((chapter, index) => {
            const isNotice = chapter.type === "notice" || chapter.playable === false;
            const isUnlocked = isNotice ? true : Boolean(chapter.unlocked);
            const isCompleted = isNotice ? false : Boolean(chapter.completed);
            const isCurrent = isNotice ? false : Boolean(chapter.current);

            let statusLabel = "Locked";
            let statusColor = "rgba(184, 138, 239, 0.45)";

            if (isNotice) {
                const noticePresentation = getNoticePresentation(chapter, config, secondaryColor);
                statusLabel = noticePresentation.label;
                statusColor = noticePresentation.color;
            } else if (isCurrent) {
                statusLabel = "Current";
                statusColor = secondaryColor;
            } else if (isCompleted) {
                statusLabel = "Completed";
                statusColor = goldColor;
            } else if (isUnlocked) {
                statusLabel = "Unlocked";
                statusColor = primaryColor;
            }

            const cardX = startX + index * (cardWidth + cardGap);
            const cardPadding = 20;

            const card = new Konva.Group({
                x: cardX,
                y: cardY,
                width: cardWidth,
                height: cardHeight,
                name: `chapter-card-${chapter.id}`
            });

            const cardBg = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                cornerRadius: 18,
                fill: isNotice
                    ? "rgba(30, 24, 52, 0.88)"
                    : isCurrent
                        ? "rgba(44, 34, 74, 0.94)"
                        : isUnlocked
                            ? "rgba(35, 26, 62, 0.85)"
                            : "rgba(22, 17, 38, 0.70)",
                stroke: isNotice
                    ? statusColor
                    : isCurrent
                        ? secondaryColor
                        : isCompleted
                            ? "rgba(246, 198, 107, 0.55)"
                            : isUnlocked
                                ? "rgba(184, 138, 239, 0.40)"
                                : "rgba(184, 138, 239, 0.18)",
                strokeWidth: isCurrent ? 1.6 : 1.2,
                perfectDrawEnabled: false
            });

            const topGlowLine = new Konva.Rect({
                x: 20,
                y: 0,
                width: cardWidth - 40,
                height: 1.5,
                fill: isCurrent ? "rgba(242, 169, 213, 0.65)" : "rgba(184, 138, 239, 0.35)",
                perfectDrawEnabled: false
            });

            // Badges with measured width (ample room across 440px wide cards)
            const chapterBadgeLabel = isNotice ? "✦ SPECIAL NOTICE" : `CHAPTER ${chapter.index}`;
            const chapterTagMeasure = new Konva.Text({
                text: chapterBadgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2
            });
            const chapterTagWidth = Math.max(isPortrait ? 104 : 118, Math.ceil(chapterTagMeasure.width()) + 24);
            const badgeHeight = 28;

            const chapterTagBox = new Konva.Rect({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: badgeHeight,
                cornerRadius: 8,
                fill: isNotice ? "rgba(184, 138, 239, 0.16)" : "rgba(184, 138, 239, 0.22)",
                stroke: isNotice ? statusColor : "rgba(184, 138, 239, 0.45)",
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const chapterTagText = new Konva.Text({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: chapterBadgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2,
                fill: isNotice ? statusColor : "#FFFFFF",
                perfectDrawEnabled: false
            });

            const statusMeasure = new Konva.Text({
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1
            });
            const statusBadgeWidth = Math.max(isPortrait ? 88 : 96, Math.ceil(statusMeasure.width()) + 24);
            const statusBadgeX = cardWidth - cardPadding - statusBadgeWidth;

            const statusBadgeBox = new Konva.Rect({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: badgeHeight,
                cornerRadius: 8,
                fill: isCurrent
                    ? "rgba(242, 169, 213, 0.22)"
                    : isCompleted
                        ? "rgba(246, 198, 107, 0.18)"
                        : "rgba(35, 26, 62, 0.60)",
                stroke: statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const statusTextNode = new Konva.Text({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1,
                fill: statusColor,
                perfectDrawEnabled: false
            });

            const headingY = cardPadding + badgeHeight + 12;
            const headingWidth = cardWidth - (cardPadding * 2);

            const headingText = new Konva.Text({
                x: cardPadding,
                y: headingY,
                width: headingWidth,
                text: chapter.title,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 18 : 20),
                fontStyle: "bold",
                letterSpacing: 0.8,
                fill: "#FFFFFF",
                lineHeight: 1.2,
                perfectDrawEnabled: false
            });

            const descY = headingY + headingText.height() + 8;
            const chapterDescription = typeof chapter.description === "string" && chapter.description.trim().length > 0
                ? chapter.description.trim()
                : (isNotice ? "No notice details provided." : "No quest notes available.");

            const descriptionText = new Konva.Text({
                x: cardPadding,
                y: descY,
                width: headingWidth,
                text: chapterDescription,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 13.5 : 14),
                fill: isUnlocked ? subtextColor : "rgba(184, 138, 239, 0.55)",
                lineHeight: 1.32,
                perfectDrawEnabled: false
            });

            const footerY = cardHeight - cardPadding - 38;
            const actionBtnWidth = isPortrait ? 120 : 128;
            const actionBtnHeight = 38;
            let actionBtnGroup = null;

            if (isNotice) {
                const noticeEmblemBox = new Konva.Rect({
                    x: cardPadding,
                    y: footerY,
                    width: headingWidth,
                    height: actionBtnHeight,
                    cornerRadius: 10,
                    fill: "rgba(184, 138, 239, 0.12)",
                    stroke: "rgba(184, 138, 239, 0.25)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const noticeIcon = createVectorIcon(
                    ICONS.info,
                    cardPadding + 12,
                    footerY + 11,
                    16,
                    statusColor,
                    "ℹ"
                );

                const noticeFooterText = new Konva.Text({
                    x: cardPadding + 36,
                    y: footerY,
                    width: headingWidth - 44,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    text: "Informational route bulletin",
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fill: statusColor,
                    perfectDrawEnabled: false
                });

                card.add(noticeEmblemBox, noticeIcon, noticeFooterText);
            } else {
                const sceneCount = Number.isFinite(chapter.sceneCount) ? chapter.sceneCount : 1;
                const sceneCountLabel = sceneCount === 1 ? "1 Scene" : `${sceneCount} Scenes`;

                const scenePillWidth = isPortrait ? 108 : 116;
                const scenePillBox = new Konva.Rect({
                    x: cardPadding,
                    y: footerY,
                    width: scenePillWidth,
                    height: actionBtnHeight,
                    cornerRadius: 10,
                    fill: "rgba(25, 20, 48, 0.70)",
                    stroke: "rgba(184, 138, 239, 0.28)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const sceneIcon = createVectorIcon(
                    ICONS.book,
                    cardPadding + 10,
                    footerY + (actionBtnHeight - 16) / 2,
                    16,
                    primaryColor,
                    "📖"
                );

                const sceneCountText = new Konva.Text({
                    x: cardPadding + 32,
                    y: footerY,
                    width: scenePillWidth - 36,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    text: sceneCountLabel,
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fontStyle: "bold",
                    fill: "#FFFFFF",
                    perfectDrawEnabled: false
                });

                const actionBtnX = cardWidth - cardPadding - actionBtnWidth;
                const actionLabel = isUnlocked
                    ? (isCurrent ? "Continue" : (isCompleted ? "Replay" : "Start"))
                    : "Locked";

                actionBtnGroup = new Konva.Group({
                    x: actionBtnX,
                    y: footerY,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    name: `action-btn-${chapter.id}`
                });

                const actionBtnBox = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    cornerRadius: 10,
                    fill: isUnlocked
                        ? (isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)")
                        : "rgba(255, 255, 255, 0.04)",
                    stroke: isUnlocked
                        ? (isCurrent ? secondaryColor : primaryColor)
                        : "rgba(184, 138, 239, 0.20)",
                    strokeWidth: 1.2,
                    perfectDrawEnabled: false
                });

                const actionBtnText = new Konva.Text({
                    x: 0,
                    y: 0,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    align: "center",
                    text: actionLabel,
                    fontFamily: fontOther,
                    fontSize: actionBtnTextSize,
                    fontStyle: "bold",
                    letterSpacing: 1.2,
                    fill: isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.45)",
                    perfectDrawEnabled: false
                });

                actionBtnGroup.add(actionBtnBox, actionBtnText);
                card.add(scenePillBox, sceneIcon, sceneCountText, actionBtnGroup);
            }

            card.add(
                cardBg,
                topGlowLine,
                chapterTagBox,
                chapterTagText,
                statusBadgeBox,
                statusTextNode,
                headingText,
                descriptionText
            );

            cardBg.moveToBottom();
            topGlowLine.moveUp();

            const nodeX = cardX + (cardWidth / 2);
            nodePositions.push({
                x: nodeX,
                y: railY,
                isCurrent,
                isCompleted,
                isUnlocked,
                isNotice,
                statusColor,
                index: chapter.index
            });

            // Connector from node down to card top
            const dropPin = new Konva.Line({
                points: [nodeX, railY + nodeRadius, nodeX, cardY],
                stroke: isUnlocked || isNotice ? "rgba(184, 138, 239, 0.50)" : "rgba(184, 138, 239, 0.20)",
                strokeWidth: 1.5,
                dash: isUnlocked || isNotice ? [] : [3, 3],
                perfectDrawEnabled: false
            });
            scrollGroup.add(dropPin);

            if (supportsHover) {
                card.on("mouseover", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = isUnlocked && !isNotice ? "pointer" : "default";
                    runTween(cardBg, {
                        stroke: isNotice ? statusColor : (isCurrent ? secondaryColor : primaryColor),
                        fill: isNotice ? "rgba(38, 30, 64, 0.95)" : "rgba(48, 36, 80, 0.95)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) {
                            runTween(btnBox, {
                                fill: "rgba(242, 169, 213, 0.45)",
                                stroke: secondaryColor,
                                duration: 0.15
                            });
                        }
                    }
                });

                card.on("mouseout", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = "auto";
                    runTween(cardBg, {
                        stroke: isNotice
                            ? statusColor
                            : isCurrent
                                ? secondaryColor
                                : isCompleted
                                    ? "rgba(246, 198, 107, 0.55)"
                                    : isUnlocked
                                        ? "rgba(184, 138, 239, 0.35)"
                                        : "rgba(184, 138, 239, 0.15)",
                        fill: isNotice
                            ? "rgba(30, 24, 52, 0.85)"
                            : isCurrent
                                ? "rgba(42, 32, 70, 0.90)"
                                : isUnlocked
                                    ? "rgba(35, 26, 62, 0.78)"
                                    : "rgba(22, 17, 38, 0.65)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) {
                            runTween(btnBox, {
                                fill: isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)",
                                stroke: isCurrent ? secondaryColor : primaryColor,
                                duration: 0.15
                            });
                        }
                    }
                });
            }

            if (!isNotice && isUnlocked) {
                card.on("click tap", () => {
                    if (shouldIgnoreActivation()) {
                        return;
                    }
                    startChapter(chapter);
                });
            }

            scrollGroup.add(card);
        });

        // Horizontal rail line connecting all nodes
        for (let i = 0; i < nodePositions.length - 1; i++) {
            const current = nodePositions[i];
            const next = nodePositions[i + 1];
            const isLineActive = next.isUnlocked || next.isNotice;

            const connectorLine = new Konva.Line({
                points: [
                    current.x + nodeRadius,
                    railY,
                    next.x - nodeRadius,
                    railY
                ],
                stroke: isLineActive ? "rgba(184, 138, 239, 0.55)" : "rgba(184, 138, 239, 0.20)",
                strokeWidth: 2,
                dash: isLineActive ? [] : [4, 4],
                perfectDrawEnabled: false
            });
            scrollGroup.add(connectorLine);
        }

        // Render milestone nodes
        nodePositions.forEach((pos) => {
            const haloRadius = pos.isCurrent ? nodeRadius + 5 : nodeRadius + 3;
            const haloRing = new Konva.Circle({
                x: pos.x,
                y: pos.y,
                radius: haloRadius,
                fill: pos.isCurrent ? "rgba(242, 169, 213, 0.25)" : "rgba(35, 26, 62, 0.85)",
                stroke: pos.statusColor,
                strokeWidth: pos.isCurrent ? 2 : 1.5,
                perfectDrawEnabled: false
            });

            const coreRadius = pos.isCurrent ? nodeRadius - 1 : nodeRadius - 2;
            const coreCircle = new Konva.Circle({
                x: pos.x,
                y: pos.y,
                radius: coreRadius,
                fill: pos.isUnlocked ? pos.statusColor : "rgba(184, 138, 239, 0.20)",
                stroke: pos.statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const numeralText = new Konva.Text({
                x: pos.x - 14,
                y: pos.y - 6,
                width: 28,
                align: "center",
                verticalAlign: "middle",
                text: toRomanNumeral(pos.index),
                fontFamily: fontOther,
                fontSize: 10,
                fontStyle: "bold",
                fill: pos.isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.45)",
                listening: false,
                perfectDrawEnabled: false
            });

            scrollGroup.add(haloRing, coreCircle, numeralText);
        });

        scrollGroup.width(totalTimelineWidth);
        scrollGroup.height(viewportH - (heroHeight + 24));
        mainContainer.add(scrollGroup);
        mainContainer.__horizontalScrollNode = scrollGroup;
        mainContainer.width(viewportW);
        mainContainer.height(viewportH);
    };

    // =========================================================================
    // Layout 3: Horizontal 2-Row Timeline (Alternating Spine & Branches)
    // Chapters alternate: Ch1 UP, Ch2 DOWN, Ch3 UP, Ch4 DOWN
    // Common bus line starts strictly at the 1st block and ends at the last block
    // =========================================================================
    const buildDualRowTimelineLayout = (chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes) => {
        const viewportW = actionContent.width();
        const viewportH = actionContent.height();
        const heroW = viewportW - (horizontalPadding * 2);

        // 1. Unified Hero Progress Banner — pinned to mainContainer top (never scrolls horizontally, never stretches)
        const { heroGroup, heroHeight } = buildHeroProgressBanner({
            x: horizontalPadding,
            y: isPortrait ? 8 : 10,
            width: heroW,
            completedCount,
            totalPlayableCount,
            totalScenes,
            progressRatio,
            currentChapter
        });
        mainContainer.add(heroGroup);

        // 2. Horizontal Scroll Group — holds the bus line and 2-row cards
        const scrollGroup = new Konva.Group({
            x: 0,
            y: heroHeight + (isPortrait ? 18 : 22),
            listening: true,
            name: "chapters-scroll-content"
        });

        // Large, impactful cards
        const cardWidth = isPortrait ? 310 : 350;
        const cardHeight = isPortrait ? 210 : 230;
        const stepX = isPortrait ? 330 : 380;
        const startX = 28;
        const totalWidth = startX + chapterMap.length * stepX + 64;

        // Central Bus spine — vertically centered in remaining space below banner
        const availableH = viewportH - (heroHeight + (isPortrait ? 18 : 22)) - 24;
        const busY = Math.max(140, Math.floor(availableH / 2));
        const branchGap = isPortrait ? 28 : 34;
        const rowUpY = busY - branchGap - cardHeight;
        const rowDownY = busY + branchGap;

        const junctions = [];

        chapterMap.forEach((chapter, index) => {
            // Alternation: Even index = UP (above bus line), Odd index = DOWN (below bus line)
            const isBottom = (index % 2 === 1);
            const cardX = startX + index * stepX;
            const cardY = isBottom ? rowDownY : rowUpY;

            const isNotice = chapter.type === "notice" || chapter.playable === false;
            const isUnlocked = isNotice ? true : Boolean(chapter.unlocked);
            const isCompleted = isNotice ? false : Boolean(chapter.completed);
            const isCurrent = isNotice ? false : Boolean(chapter.current);

            let statusLabel = "Locked";
            let statusColor = "rgba(184, 138, 239, 0.45)";

            if (isNotice) {
                const noticePresentation = getNoticePresentation(chapter, config, secondaryColor);
                statusLabel = noticePresentation.label;
                statusColor = noticePresentation.color;
            } else if (isCurrent) {
                statusLabel = "Current";
                statusColor = secondaryColor;
            } else if (isCompleted) {
                statusLabel = "Completed";
                statusColor = goldColor;
            } else if (isUnlocked) {
                statusLabel = "Unlocked";
                statusColor = primaryColor;
            }

            const cardPadding = 18;
            const card = new Konva.Group({
                x: cardX,
                y: cardY,
                width: cardWidth,
                height: cardHeight,
                name: `chapter-card-${chapter.id}`
            });

            const cardBg = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                cornerRadius: 16,
                fill: isNotice
                    ? "rgba(30, 24, 52, 0.88)"
                    : isCurrent
                        ? "rgba(44, 34, 74, 0.94)"
                        : isUnlocked
                            ? "rgba(35, 26, 62, 0.85)"
                            : "rgba(22, 17, 38, 0.70)",
                stroke: isNotice
                    ? statusColor
                    : isCurrent
                        ? secondaryColor
                        : isCompleted
                            ? "rgba(246, 198, 107, 0.55)"
                            : isUnlocked
                                ? "rgba(184, 138, 239, 0.40)"
                                : "rgba(184, 138, 239, 0.18)",
                strokeWidth: isCurrent ? 1.6 : 1.2,
                perfectDrawEnabled: false
            });

            const topGlowLine = new Konva.Rect({
                x: 18,
                y: 0,
                width: cardWidth - 36,
                height: 1.2,
                fill: isCurrent ? "rgba(242, 169, 213, 0.55)" : "rgba(184, 138, 239, 0.30)",
                perfectDrawEnabled: false
            });

            const chapterBadgeLabel = isNotice ? "✦ NOTICE" : `CHAPTER ${chapter.index}`;
            const chapterTagMeasure = new Konva.Text({
                text: chapterBadgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2
            });
            const chapterTagWidth = Math.max(isPortrait ? 96 : 108, Math.ceil(chapterTagMeasure.width()) + 20);
            const badgeHeight = 26;

            const chapterTagBox = new Konva.Rect({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: badgeHeight,
                cornerRadius: 7,
                fill: isNotice ? "rgba(184, 138, 239, 0.16)" : "rgba(184, 138, 239, 0.22)",
                stroke: isNotice ? statusColor : "rgba(184, 138, 239, 0.45)",
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const chapterTagText = new Konva.Text({
                x: cardPadding,
                y: cardPadding,
                width: chapterTagWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: chapterBadgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2,
                fill: isNotice ? statusColor : "#FFFFFF",
                perfectDrawEnabled: false
            });

            const statusMeasure = new Konva.Text({
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1
            });
            const statusBadgeWidth = Math.max(isPortrait ? 84 : 92, Math.ceil(statusMeasure.width()) + 20);
            const statusBadgeX = cardWidth - cardPadding - statusBadgeWidth;

            const statusBadgeBox = new Konva.Rect({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: badgeHeight,
                cornerRadius: 7,
                fill: isCurrent
                    ? "rgba(242, 169, 213, 0.22)"
                    : isCompleted
                        ? "rgba(246, 198, 107, 0.18)"
                        : "rgba(35, 26, 62, 0.60)",
                stroke: statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const statusTextNode = new Konva.Text({
                x: statusBadgeX,
                y: cardPadding,
                width: statusBadgeWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1,
                fill: statusColor,
                perfectDrawEnabled: false
            });

            const headingY = cardPadding + badgeHeight + 10;
            const headingWidth = cardWidth - (cardPadding * 2);

            const headingText = new Konva.Text({
                x: cardPadding,
                y: headingY,
                width: headingWidth,
                text: chapter.title,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 17 : 18),
                fontStyle: "bold",
                letterSpacing: 0.6,
                fill: "#FFFFFF",
                lineHeight: 1.2,
                perfectDrawEnabled: false
            });

            const descY = headingY + headingText.height() + 6;
            const chapterDescription = typeof chapter.description === "string" && chapter.description.trim().length > 0
                ? chapter.description.trim()
                : (isNotice ? "No notice details." : "No quest notes.");

            const descriptionText = new Konva.Text({
                x: cardPadding,
                y: descY,
                width: headingWidth,
                text: chapterDescription,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 12.5 : 13),
                fill: isUnlocked ? subtextColor : "rgba(184, 138, 239, 0.55)",
                lineHeight: 1.3,
                perfectDrawEnabled: false
            });

            const footerY = cardHeight - cardPadding - 34;
            const actionBtnWidth = isPortrait ? 104 : 112;
            const actionBtnHeight = 34;
            let actionBtnGroup = null;

            if (isNotice) {
                const noticeEmblemBox = new Konva.Rect({
                    x: cardPadding,
                    y: footerY,
                    width: headingWidth,
                    height: actionBtnHeight,
                    cornerRadius: 8,
                    fill: "rgba(184, 138, 239, 0.12)",
                    stroke: "rgba(184, 138, 239, 0.25)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const noticeFooterText = new Konva.Text({
                    x: cardPadding + 8,
                    y: footerY,
                    width: headingWidth - 16,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    text: "Informational route bulletin",
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fill: statusColor,
                    perfectDrawEnabled: false
                });

                card.add(noticeEmblemBox, noticeFooterText);
            } else {
                const sceneCount = Number.isFinite(chapter.sceneCount) ? chapter.sceneCount : 1;
                const sceneCountLabel = sceneCount === 1 ? "1 Scene" : `${sceneCount} Scenes`;

                const scenePillWidth = isPortrait ? 92 : 100;
                const scenePillBox = new Konva.Rect({
                    x: cardPadding,
                    y: footerY,
                    width: scenePillWidth,
                    height: actionBtnHeight,
                    cornerRadius: 8,
                    fill: "rgba(25, 20, 48, 0.70)",
                    stroke: "rgba(184, 138, 239, 0.28)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const sceneCountText = new Konva.Text({
                    x: cardPadding + 6,
                    y: footerY,
                    width: scenePillWidth - 12,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    align: "center",
                    text: sceneCountLabel,
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fontStyle: "bold",
                    fill: "#FFFFFF",
                    perfectDrawEnabled: false
                });

                const actionBtnX = cardWidth - cardPadding - actionBtnWidth;
                const actionLabel = isUnlocked
                    ? (isCurrent ? "Continue" : (isCompleted ? "Replay" : "Start"))
                    : "Locked";

                actionBtnGroup = new Konva.Group({
                    x: actionBtnX,
                    y: footerY,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    name: `action-btn-${chapter.id}`
                });

                const actionBtnBox = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    cornerRadius: 8,
                    fill: isUnlocked
                        ? (isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)")
                        : "rgba(255, 255, 255, 0.04)",
                    stroke: isUnlocked
                        ? (isCurrent ? secondaryColor : primaryColor)
                        : "rgba(184, 138, 239, 0.20)",
                    strokeWidth: 1.2,
                    perfectDrawEnabled: false
                });

                const actionBtnText = new Konva.Text({
                    x: 0,
                    y: 0,
                    width: actionBtnWidth,
                    height: actionBtnHeight,
                    verticalAlign: "middle",
                    align: "center",
                    text: actionLabel,
                    fontFamily: fontOther,
                    fontSize: actionBtnTextSize,
                    fontStyle: "bold",
                    letterSpacing: 1,
                    fill: isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.45)",
                    perfectDrawEnabled: false
                });

                actionBtnGroup.add(actionBtnBox, actionBtnText);
                card.add(scenePillBox, sceneCountText, actionBtnGroup);
            }

            card.add(
                cardBg,
                topGlowLine,
                chapterTagBox,
                chapterTagText,
                statusBadgeBox,
                statusTextNode,
                headingText,
                descriptionText
            );

            cardBg.moveToBottom();
            topGlowLine.moveUp();

            const junctionX = cardX + Math.floor(cardWidth / 2);
            junctions.push({
                x: junctionX,
                y: busY,
                isBottom,
                cardY,
                cardHeight,
                isCurrent,
                isCompleted,
                isUnlocked,
                isNotice,
                statusColor,
                index: chapter.index
            });

            // Vertical Branch line from bus line to card
            const branchLine = new Konva.Line({
                points: isBottom
                    ? [junctionX, busY + 8, junctionX, cardY]
                    : [junctionX, busY - 8, junctionX, cardY + cardHeight],
                stroke: isUnlocked || isNotice ? "rgba(242, 169, 213, 0.70)" : "rgba(184, 138, 239, 0.25)",
                strokeWidth: 2,
                dash: isUnlocked || isNotice ? [] : [4, 4],
                perfectDrawEnabled: false
            });
            scrollGroup.add(branchLine);

            if (supportsHover) {
                card.on("mouseover", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = isUnlocked && !isNotice ? "pointer" : "default";
                    runTween(cardBg, {
                        stroke: isNotice ? statusColor : (isCurrent ? secondaryColor : primaryColor),
                        fill: isNotice ? "rgba(38, 30, 64, 0.95)" : "rgba(48, 36, 80, 0.95)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) {
                            runTween(btnBox, {
                                fill: "rgba(242, 169, 213, 0.45)",
                                stroke: secondaryColor,
                                duration: 0.15
                            });
                        }
                    }
                });

                card.on("mouseout", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = "auto";
                    runTween(cardBg, {
                        stroke: isNotice
                            ? statusColor
                            : isCurrent
                                ? secondaryColor
                                : isCompleted
                                    ? "rgba(246, 198, 107, 0.55)"
                                    : isUnlocked
                                        ? "rgba(184, 138, 239, 0.35)"
                                        : "rgba(184, 138, 239, 0.15)",
                        fill: isNotice
                            ? "rgba(30, 24, 52, 0.85)"
                            : isCurrent
                                ? "rgba(42, 32, 70, 0.90)"
                                : isUnlocked
                                    ? "rgba(35, 26, 62, 0.78)"
                                    : "rgba(22, 17, 38, 0.65)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) {
                            runTween(btnBox, {
                                fill: isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)",
                                stroke: isCurrent ? secondaryColor : primaryColor,
                                duration: 0.15
                            });
                        }
                    }
                });
            }

            if (!isNotice && isUnlocked) {
                card.on("click tap", () => {
                    if (shouldIgnoreActivation()) {
                        return;
                    }
                    startChapter(chapter);
                });
            }

            scrollGroup.add(card);
        });

        // Bus spine: strictly starts at first junction X and ends at last junction X
        if (junctions.length > 0) {
            const busX0 = junctions[0].x;
            const busX1 = junctions[junctions.length - 1].x;

            const busLineTrack = new Konva.Line({
                points: [busX0, busY, busX1, busY],
                stroke: "rgba(184, 138, 239, 0.22)",
                strokeWidth: 6,
                lineCap: "round",
                perfectDrawEnabled: false
            });

            const busLineActive = new Konva.Line({
                points: [busX0, busY, busX1, busY],
                stroke: "rgba(184, 138, 239, 0.55)",
                strokeWidth: 2.5,
                lineCap: "round",
                perfectDrawEnabled: false
            });

            scrollGroup.add(busLineTrack, busLineActive);
            busLineTrack.moveToBottom();
            busLineActive.moveToBottom();
        }

        // Bus Junction nodes on top of the bus line
        junctions.forEach((j) => {
            const haloRing = new Konva.Circle({
                x: j.x,
                y: j.y,
                radius: j.isCurrent ? 16 : 13,
                fill: j.isCurrent ? "rgba(242, 169, 213, 0.30)" : "rgba(35, 26, 62, 0.90)",
                stroke: j.statusColor,
                strokeWidth: j.isCurrent ? 2 : 1.5,
                perfectDrawEnabled: false
            });

            const coreCircle = new Konva.Circle({
                x: j.x,
                y: j.y,
                radius: j.isCurrent ? 9 : 7,
                fill: j.isUnlocked ? j.statusColor : "rgba(184, 138, 239, 0.20)",
                stroke: j.statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const numeralText = new Konva.Text({
                x: j.x - 14,
                y: j.y - 7,
                width: 28,
                align: "center",
                verticalAlign: "middle",
                text: toRomanNumeral(j.index),
                fontFamily: fontOther,
                fontSize: 10,
                fontStyle: "bold",
                fill: j.isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.45)",
                listening: false,
                perfectDrawEnabled: false
            });

            scrollGroup.add(haloRing, coreCircle, numeralText);
        });

        scrollGroup.width(totalWidth);
        scrollGroup.height(viewportH - (heroHeight + 24));
        mainContainer.add(scrollGroup);
        mainContainer.__horizontalScrollNode = scrollGroup;
        mainContainer.width(viewportW);
        mainContainer.height(viewportH);
    };

    // =========================================================================
    // Layout 4: Adventure Journey Map (Curved Fantasy Route Trail)
    // - Pinned spacing below hero progress header (zero collision)
    // - Smooth cubic Bezier S-curves connecting milestones (never intersecting cards)
    // - Stepping stone milestone nodes with elegant quest cards on outer wings
    // =========================================================================
    const buildAdventureMapLayout = (chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes) => {
        const viewportW = actionContent.width();
        const mapWidth = viewportW;
        const heroPad = isPortrait ? 10 : 16;
        const heroW = mapWidth - (heroPad * 2);

        // 1. Unified Hero Route Progress Banner — top of map, scrolls naturally with the journey
        const { heroGroup, heroHeight } = buildHeroProgressBanner({
            x: heroPad,
            y: 10,
            width: heroW,
            completedCount,
            totalPlayableCount,
            totalScenes,
            progressRatio,
            currentChapter,
            icon: ICONS.compass
        });
        mainContainer.add(heroGroup);

        // Responsive layout geometry
        const isNarrow = isPortrait || mapWidth < 680;
        const cardH = isNarrow ? 204 : 210;
        const cardHalfH = Math.floor(cardH / 2);

        // Safe clearance below progress header: header is at y: 10..10+heroHeight
        // First card top starts at (10 + heroHeight + 36) -> wpY is (firstCardTop + cardHalfH)
        const firstCardTopY = 10 + heroHeight + (isNarrow ? 28 : 36);
        const startY = firstCardTopY + cardHalfH;
        const stepY = isNarrow ? 240 : 252;
        const nodeRadius = isNarrow ? 22 : 26;

        let leftX = 0;
        let rightX = 0;
        let cardW = 0;
        let cardGap = 16;

        if (isNarrow) {
            // Narrow / Mobile: Nodes snake gently along the left corridor [40..64],
            // all cards neatly aligned on the right [104..mapWidth-14] -> 0% overlap with curves
            leftX = 42;
            rightX = 66;
            cardGap = 14;
            const rightEdgeOfNodes = rightX + nodeRadius;
            const cardStartX = rightEdgeOfNodes + cardGap;
            cardW = Math.max(220, mapWidth - cardStartX - 16);
        } else {
            // Wide / Desktop: Nodes zigzag down central corridor [centerX-75..centerX+75],
            // cards placed on the outer wings (Left node has card on Left, Right node has card on Right)
            // Curves travel strictly in the center corridor [centerX-75..centerX+75] -> 0% overlap with cards
            const centerX = Math.floor(mapWidth / 2);
            const trailOffset = Math.min(75, Math.floor(mapWidth * 0.10));
            leftX = centerX - trailOffset;
            rightX = centerX + trailOffset;
            cardGap = 18;
            const availableHalfW = Math.floor(mapWidth / 2) - trailOffset - nodeRadius - cardGap - 16;
            cardW = Math.min(340, Math.max(280, availableHalfW));
        }

        const waypoints = chapterMap.map((chapter, index) => {
            const isLeft = (index % 2 === 0);
            const wpX = isNarrow
                ? (isLeft ? leftX : rightX)
                : (isLeft ? leftX : rightX);
            const wpY = startY + index * stepY;
            return {
                x: wpX,
                y: wpY,
                isLeft,
                chapter,
                index
            };
        });

        const totalHeight = startY + (chapterMap.length - 1) * stepY + cardHalfH + 60;

        // 2. Smooth cubic Bezier S-curves connecting milestone nodes
        // Dual-layer trail: soft amethyst underglow + crisp sakura/primary path
        for (let i = 0; i < waypoints.length - 1; i++) {
            const a = waypoints[i];
            const b = waypoints[i + 1];
            const isNextUnlocked = b.chapter.type === "notice" || Boolean(b.chapter.unlocked);
            const dy = b.y - a.y;

            // Natural cubic Bezier S-curve control points:
            // leaves a vertically downward, enters b vertically downward
            const cp1x = a.x;
            const cp1y = a.y + (dy * 0.5);
            const cp2x = b.x;
            const cp2y = b.y - (dy * 0.5);
            const curvePoints = [a.x, a.y, cp1x, cp1y, cp2x, cp2y, b.x, b.y];

            const pathGlow = new Konva.Line({
                points: curvePoints,
                bezier: true,
                stroke: isNextUnlocked ? "rgba(184, 138, 239, 0.18)" : "rgba(184, 138, 239, 0.08)",
                strokeWidth: 6,
                lineCap: "round",
                perfectDrawEnabled: false
            });

            const pathCore = new Konva.Line({
                points: curvePoints,
                bezier: true,
                stroke: isNextUnlocked ? "rgba(242, 169, 213, 0.75)" : "rgba(184, 138, 239, 0.30)",
                strokeWidth: 2.5,
                dash: isNextUnlocked ? [] : [6, 6],
                lineCap: "round",
                perfectDrawEnabled: false
            });

            mainContainer.add(pathGlow, pathCore);
        }

        // 3. Stepping Stone Milestone Nodes & Floating Quest Cards
        waypoints.forEach(({ x: wpX, y: wpY, isLeft, chapter }) => {
            const isNotice = chapter.type === "notice" || chapter.playable === false;
            const isUnlocked = isNotice ? true : Boolean(chapter.unlocked);
            const isCompleted = isNotice ? false : Boolean(chapter.completed);
            const isCurrent = isNotice ? false : Boolean(chapter.current);

            let statusLabel = "Locked";
            let statusColor = "rgba(184, 138, 239, 0.45)";
            if (isNotice) {
                const np = getNoticePresentation(chapter, config, secondaryColor);
                statusLabel = np.label;
                statusColor = np.color;
            } else if (isCurrent) {
                statusLabel = "Current";
                statusColor = secondaryColor;
            } else if (isCompleted) {
                statusLabel = "Completed";
                statusColor = goldColor;
            } else if (isUnlocked) {
                statusLabel = "Unlocked";
                statusColor = primaryColor;
            }

            // Milestone Node: layered circular stepping stone
            const outerHalo = new Konva.Circle({
                x: wpX,
                y: wpY,
                radius: nodeRadius + (isCurrent ? 7 : 4),
                fill: isCurrent ? "rgba(242, 169, 213, 0.22)" : "rgba(35, 26, 62, 0.85)",
                stroke: statusColor,
                strokeWidth: isCurrent ? 2.5 : 1.5,
                perfectDrawEnabled: false
            });

            const midRing = new Konva.Circle({
                x: wpX,
                y: wpY,
                radius: nodeRadius + 1,
                fill: "rgba(24, 18, 44, 0.95)",
                stroke: statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const innerFill = new Konva.Circle({
                x: wpX,
                y: wpY,
                radius: nodeRadius - 4,
                fill: isUnlocked
                    ? (isCurrent ? "rgba(242, 169, 213, 0.75)" : (isCompleted ? "rgba(246, 198, 107, 0.75)" : "rgba(184, 138, 239, 0.70)"))
                    : "rgba(50, 38, 76, 0.60)",
                perfectDrawEnabled: false
            });

            const pinNumeral = new Konva.Text({
                x: wpX - nodeRadius,
                y: wpY - 7,
                width: nodeRadius * 2,
                align: "center",
                verticalAlign: "middle",
                text: toRomanNumeral(chapter.index),
                fontFamily: fontOther,
                fontSize: scaleFontSize(isNarrow ? 11.5 : 12.5),
                fontStyle: "bold",
                fill: isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.50)",
                listening: false,
                perfectDrawEnabled: false
            });

            mainContainer.add(outerHalo, midRing, innerFill, pinNumeral);

            // Card position:
            // In wide/desktop: Left nodes have cards to the LEFT; Right nodes have cards to the RIGHT
            // In narrow/mobile: All cards are placed to the RIGHT of the nodes
            let cardX = 0;
            if (isNarrow) {
                cardX = rightX + nodeRadius + cardGap;
            } else {
                cardX = isLeft
                    ? (wpX - nodeRadius) - cardGap - cardW
                    : (wpX + nodeRadius) + cardGap;
            }
            const cardY = wpY - cardHalfH;

            // Connector stub: strictly connects node outer edge to the nearest card edge
            let stubPoints = [];
            if (isNarrow) {
                stubPoints = [wpX + nodeRadius, wpY, cardX, wpY];
            } else if (isLeft) {
                stubPoints = [wpX - nodeRadius, wpY, cardX + cardW, wpY];
            } else {
                stubPoints = [wpX + nodeRadius, wpY, cardX, wpY];
            }

            const stubLine = new Konva.Line({
                points: stubPoints,
                stroke: isUnlocked || isNotice ? "rgba(184, 138, 239, 0.45)" : "rgba(184, 138, 239, 0.20)",
                strokeWidth: 1.5,
                dash: [4, 4],
                perfectDrawEnabled: false
            });
            mainContainer.add(stubLine);

            const cardPad = isNarrow ? 16 : 18;
            const card = new Konva.Group({
                x: cardX,
                y: cardY,
                width: cardW,
                height: cardH,
                name: `chapter-card-${chapter.id}`
            });

            const cardBg = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardW,
                height: cardH,
                cornerRadius: 16,
                fill: isNotice
                    ? "rgba(30, 24, 52, 0.90)"
                    : isCurrent
                        ? "rgba(44, 34, 74, 0.94)"
                        : isUnlocked
                            ? "rgba(35, 26, 62, 0.86)"
                            : "rgba(22, 17, 38, 0.72)",
                stroke: isNotice
                    ? statusColor
                    : isCurrent
                        ? secondaryColor
                        : isCompleted
                            ? "rgba(246, 198, 107, 0.55)"
                            : isUnlocked
                                ? "rgba(184, 138, 239, 0.40)"
                                : "rgba(184, 138, 239, 0.18)",
                strokeWidth: isCurrent ? 1.6 : 1.2,
                perfectDrawEnabled: false
            });

            const cardTopGlow = new Konva.Rect({
                x: 16,
                y: 0,
                width: Math.max(0, cardW - 32),
                height: 1.2,
                fill: isCurrent ? "rgba(242, 169, 213, 0.55)" : "rgba(184, 138, 239, 0.28)",
                perfectDrawEnabled: false
            });

            // Chapter Badge (standard rich styling consistent with vertical & horizontal)
            const badgeLabel = isNotice ? "✦ SPECIAL NOTICE" : `CHAPTER ${chapter.index}`;
            const badgeMeasure = new Konva.Text({
                text: badgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2
            });
            const badgeW = Math.max(isNarrow ? 96 : 108, Math.ceil(badgeMeasure.width()) + 24);
            const badgeH = 28;

            const chTagBox = new Konva.Rect({
                x: cardPad,
                y: cardPad,
                width: badgeW,
                height: badgeH,
                cornerRadius: 8,
                fill: isNotice ? "rgba(184, 138, 239, 0.16)" : "rgba(184, 138, 239, 0.22)",
                stroke: isNotice ? statusColor : "rgba(184, 138, 239, 0.45)",
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const chTagTxt = new Konva.Text({
                x: cardPad,
                y: cardPad,
                width: badgeW,
                height: badgeH,
                align: "center",
                verticalAlign: "middle",
                text: badgeLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1.2,
                fill: isNotice ? statusColor : "#FFFFFF",
                perfectDrawEnabled: false
            });

            // Status Badge
            const statusMeas = new Konva.Text({
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1
            });
            const statusBadgeW = Math.max(isNarrow ? 80 : 92, Math.ceil(statusMeas.width()) + 22);
            const statusBadgeX = cardW - cardPad - statusBadgeW;

            const stBadgeBox = new Konva.Rect({
                x: statusBadgeX,
                y: cardPad,
                width: statusBadgeW,
                height: badgeH,
                cornerRadius: 8,
                fill: isCurrent
                    ? "rgba(242, 169, 213, 0.22)"
                    : isCompleted
                        ? "rgba(246, 198, 107, 0.18)"
                        : "rgba(35, 26, 62, 0.60)",
                stroke: statusColor,
                strokeWidth: 1,
                perfectDrawEnabled: false
            });

            const stBadgeTxt = new Konva.Text({
                x: statusBadgeX,
                y: cardPad,
                width: statusBadgeW,
                height: badgeH,
                align: "center",
                verticalAlign: "middle",
                text: statusLabel,
                fontFamily: fontOther,
                fontSize: badgeFontSize,
                fontStyle: "bold",
                letterSpacing: 1,
                fill: statusColor,
                perfectDrawEnabled: false
            });

            // Title
            const headY = cardPad + badgeH + 10;
            const headW = cardW - (cardPad * 2);
            const headTxt = new Konva.Text({
                x: cardPad,
                y: headY,
                width: headW,
                text: chapter.title,
                fontFamily: fontOther,
                fontSize: headingTextSize,
                fontStyle: "bold",
                letterSpacing: 0.8,
                fill: "#FFFFFF",
                lineHeight: 1.2,
                perfectDrawEnabled: false
            });

            // Chapter Description (Properly styled with generous typography)
            const descY = headY + headTxt.height() + 6;
            const chapterDescription = typeof chapter.description === "string" && chapter.description.trim().length > 0
                ? chapter.description.trim()
                : (isNotice ? "No notice details provided." : "No quest notes available.");

            const descTxt = new Konva.Text({
                x: cardPad,
                y: descY,
                width: headW,
                text: chapterDescription,
                fontFamily: fontOther,
                fontSize: descriptionTextSize,
                fill: isUnlocked ? subtextColor : "rgba(184, 138, 239, 0.55)",
                lineHeight: 1.28,
                perfectDrawEnabled: false
            });

            // Footer
            const actionBtnH = 38;
            const actionBtnW = isNotice ? headW : (isNarrow ? 104 : 116);
            const footerY = cardH - cardPad - actionBtnH;
            let actionBtnGroup = null;

            if (isNotice) {
                const noticeBulletin = new Konva.Rect({
                    x: cardPad,
                    y: footerY,
                    width: headW,
                    height: actionBtnH,
                    cornerRadius: 10,
                    fill: "rgba(184, 138, 239, 0.12)",
                    stroke: "rgba(184, 138, 239, 0.25)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const noticeIcon = createVectorIcon(
                    ICONS.info,
                    cardPad + 12,
                    footerY + 11,
                    16,
                    statusColor,
                    "ℹ"
                );

                const noticeTxt = new Konva.Text({
                    x: cardPad + 34,
                    y: footerY,
                    width: headW - 44,
                    height: actionBtnH,
                    verticalAlign: "middle",
                    text: "Informational route bulletin",
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fill: statusColor,
                    perfectDrawEnabled: false
                });

                card.add(noticeBulletin, noticeIcon, noticeTxt);
            } else {
                const sceneCount = Number.isFinite(chapter.sceneCount) ? chapter.sceneCount : 1;
                const sceneLbl = sceneCount === 1 ? "1 Scene" : `${sceneCount} Scenes`;
                const sceneW = isNarrow ? 98 : 108;

                const scenePill = new Konva.Rect({
                    x: cardPad,
                    y: footerY,
                    width: sceneW,
                    height: actionBtnH,
                    cornerRadius: 10,
                    fill: "rgba(25, 20, 48, 0.70)",
                    stroke: "rgba(184, 138, 239, 0.28)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const sceneIcon = createVectorIcon(
                    ICONS.book,
                    cardPad + 10,
                    footerY + (actionBtnH - 16) / 2,
                    16,
                    primaryColor,
                    "📖"
                );

                const sceneT = new Konva.Text({
                    x: cardPad + 30,
                    y: footerY,
                    width: sceneW - 34,
                    height: actionBtnH,
                    verticalAlign: "middle",
                    text: sceneLbl,
                    fontFamily: fontOther,
                    fontSize: metaTextSize,
                    fontStyle: "bold",
                    fill: "#FFFFFF",
                    perfectDrawEnabled: false
                });

                const actionLabel = isUnlocked
                    ? (isCurrent ? "Continue" : (isCompleted ? "Replay" : "Start"))
                    : "Locked";

                actionBtnGroup = new Konva.Group({
                    x: cardW - cardPad - actionBtnW,
                    y: footerY,
                    width: actionBtnW,
                    height: actionBtnH,
                    name: `action-btn-${chapter.id}`
                });

                const actBtnBox = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: actionBtnW,
                    height: actionBtnH,
                    cornerRadius: 10,
                    fill: isUnlocked
                        ? (isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)")
                        : "rgba(255, 255, 255, 0.04)",
                    stroke: isUnlocked
                        ? (isCurrent ? secondaryColor : primaryColor)
                        : "rgba(184, 138, 239, 0.20)",
                    strokeWidth: 1.2,
                    perfectDrawEnabled: false
                });

                const actBtnTxt = new Konva.Text({
                    x: 0,
                    y: 0,
                    width: actionBtnW,
                    height: actionBtnH,
                    verticalAlign: "middle",
                    align: "center",
                    text: actionLabel,
                    fontFamily: fontOther,
                    fontSize: actionBtnTextSize,
                    fontStyle: "bold",
                    letterSpacing: 1.2,
                    fill: isUnlocked ? "#FFFFFF" : "rgba(184, 138, 239, 0.45)",
                    perfectDrawEnabled: false
                });

                actionBtnGroup.add(actBtnBox, actBtnTxt);
                card.add(scenePill, sceneIcon, sceneT, actionBtnGroup);
            }

            card.add(cardBg, cardTopGlow, chTagBox, chTagTxt, stBadgeBox, stBadgeTxt, headTxt, descTxt);
            cardBg.moveToBottom();
            cardTopGlow.moveUp();

            if (supportsHover) {
                card.on("mouseover", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = isUnlocked && !isNotice ? "pointer" : "default";
                    runTween(cardBg, {
                        stroke: isNotice ? statusColor : (isCurrent ? secondaryColor : primaryColor),
                        fill: isNotice ? "rgba(38, 30, 64, 0.95)" : "rgba(48, 36, 80, 0.95)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) runTween(btnBox, { fill: "rgba(242, 169, 213, 0.45)", stroke: secondaryColor, duration: 0.15 });
                    }
                });

                card.on("mouseout", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = "auto";
                    runTween(cardBg, {
                        stroke: isNotice
                            ? statusColor
                            : isCurrent
                                ? secondaryColor
                                : isCompleted
                                    ? "rgba(246, 198, 107, 0.55)"
                                    : isUnlocked
                                        ? "rgba(184, 138, 239, 0.35)"
                                        : "rgba(184, 138, 239, 0.15)",
                        fill: isNotice
                            ? "rgba(30, 24, 52, 0.85)"
                            : isCurrent
                                ? "rgba(42, 32, 70, 0.90)"
                                : isUnlocked
                                    ? "rgba(35, 26, 62, 0.78)"
                                    : "rgba(22, 17, 38, 0.65)",
                        duration: 0.15
                    });
                    if (actionBtnGroup && isUnlocked) {
                        const btnBox = actionBtnGroup.getChildren()[0];
                        if (btnBox) runTween(btnBox, { fill: isCurrent ? "rgba(242, 169, 213, 0.35)" : "rgba(184, 138, 239, 0.28)", stroke: isCurrent ? secondaryColor : primaryColor, duration: 0.15 });
                    }
                });
            }

            if (!isNotice && isUnlocked) {
                card.on("click tap", () => {
                    if (shouldIgnoreActivation()) return;
                    startChapter(chapter);
                });
            }

            mainContainer.add(card);
        });

        mainContainer.width(mapWidth);
        mainContainer.height(Math.max(actionContent.height(), totalHeight));
    };

    // =========================================================================
    // Build Content Orchestration
    // =========================================================================
    const buildContent = () => {
        stopAllTweens();
        contentSignature = getContentSignature();
        mainContainer.removeChildren();
        mainContainer.__horizontalScrollNode = null;

        const chapterMap = chapters.getMap();
        if (!chapterMap.length) {
            const emptyCard = new Konva.Group({
                x: 0,
                y: 24,
                width: mainContainer.width(),
                height: 160
            });

            const emptyCardBg = new Konva.Rect({
                x: 0,
                y: 0,
                width: mainContainer.width(),
                height: 160,
                cornerRadius: 16,
                fill: "rgba(35, 26, 62, 0.70)",
                stroke: mutedBorder,
                strokeWidth: 1.2,
                perfectDrawEnabled: false
            });

            const emptyIcon = createVectorIcon(
                ICONS.map,
                (mainContainer.width() - 40) / 2,
                24,
                40,
                "rgba(184, 138, 239, 0.45)",
                "✦"
            );

            const emptyText = new Konva.Text({
                x: 20,
                y: 76,
                width: mainContainer.width() - 40,
                align: "center",
                text: "No chapters configured yet.",
                fontFamily: fontOther,
                fontSize: emptyTextSize,
                fontStyle: "bold",
                fill: textColor,
                perfectDrawEnabled: false
            });

            const emptySubtext = new Konva.Text({
                x: 20,
                y: 112,
                width: mainContainer.width() - 40,
                align: "center",
                text: "Story routes and narrative chapters will appear here as you progress.",
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 13 : 14),
                fill: subtextColor,
                perfectDrawEnabled: false
            });

            emptyCard.add(emptyCardBg, emptyIcon, emptyText, emptySubtext);
            mainContainer.add(emptyCard);
            mainContainer.height(200);
            return;
        }

        const playableChapters = chapterMap.filter((ch) => Boolean(ch.playable));
        const completedCount = playableChapters.filter((ch) => Boolean(ch.completed)).length;
        const currentChapter = playableChapters.find((ch) => Boolean(ch.current)) || null;
        const totalPlayableCount = playableChapters.length;
        const progressRatio = totalPlayableCount > 0 ? (completedCount / totalPlayableCount) : 0;
        const totalScenes = chapterMap.reduce((acc, ch) => acc + (ch.sceneCount || 1), 0);

        if (configuredLayout === "horizontal" || configuredLayout === "timeline" || configuredLayout === "single-row") {
            buildHorizontalTimelineLayout(chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes);
        } else if (configuredLayout === "2-row" || configuredLayout === "dual-row" || configuredLayout === "two-row") {
            buildDualRowTimelineLayout(chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes);
        } else if (configuredLayout === "adventure-map" || configuredLayout === "map") {
            buildAdventureMapLayout(chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes);
        } else {
            buildVerticalLayout(chapterMap, playableChapters, completedCount, currentChapter, totalPlayableCount, progressRatio, totalScenes);
        }
    };

    buildContent();

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
        mainContainer.x(configuredLayout === "vertical" ? horizontalPadding : 0);

        if (contentSignature !== getContentSignature() || mainContainer.getChildren().length === 0) {
            buildContent();
        }

        actionContent.add(scrollTouchArea, mainContainer);

        const isHorizontal = (
            configuredLayout === "horizontal" || configuredLayout === "timeline" || configuredLayout === "single-row" ||
            configuredLayout === "2-row" || configuredLayout === "dual-row" || configuredLayout === "two-row"
        );

        if (isHorizontal) {
            const scrollTarget = mainContainer.__horizontalScrollNode || mainContainer;
            bindHorizontalScroll({
                actionbar,
                actionContent,
                contentNode: scrollTarget,
                touchTargets: [scrollTouchArea, scrollTarget],
                inertia: true,
                wheelFactor: 1,
                dragFactor: 1,
                resetToStart: true
            });
        } else {
            bindActionbarScroll({
                actionbar,
                actionContent,
                contentNode: mainContainer,
                touchTargets: [scrollTouchArea, mainContainer],
                inertia: true,
                wheelFactor: 1,
                dragFactor: 1,
                resetToTop: true
            });
        }
    }

    return {
        container: mainContainer,
        render
    };
}

export { chaptersPage };
export default chaptersPage;
