import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";

const Konva = globalThis.Konva;

const ROLE_ICONS = {
    music: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
    character: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    art: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
    code: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
    story: "M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z",
    star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
};

function getRoleIconPath(role = "") {
    const lower = String(role || "").toLowerCase();
    if (lower.includes("music") || lower.includes("audio") || lower.includes("sound") || lower.includes("bgm")) {
        return ROLE_ICONS.music;
    }
    if (lower.includes("character") || lower.includes("sprite") || lower.includes("voice") || lower.includes("cast")) {
        return ROLE_ICONS.character;
    }
    if (lower.includes("poster") || lower.includes("cover") || lower.includes("art") || lower.includes("illustrat") || lower.includes("bg") || lower.includes("background")) {
        return ROLE_ICONS.art;
    }
    if (lower.includes("code") || lower.includes("program") || lower.includes("dev") || lower.includes("script") || lower.includes("engine")) {
        return ROLE_ICONS.code;
    }
    if (lower.includes("story") || lower.includes("write") || lower.includes("scenario") || lower.includes("script")) {
        return ROLE_ICONS.story;
    }
    return ROLE_ICONS.star;
}

function parseCreditSegments(value) {
    if (typeof value !== "string") {
        return [];
    }

    const segments = [];
    const markdownLinkPattern = /\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s)]+)\)/gi;
    let lastIndex = 0;

    for (let match = markdownLinkPattern.exec(value); match; match = markdownLinkPattern.exec(value)) {
        if (match.index > lastIndex) {
            segments.push({
                type: "text",
                text: value.slice(lastIndex, match.index)
            });
        }

        segments.push({
            type: "link",
            text: match[1],
            link: match[2].startsWith("http") ? match[2] : `https://${match[2]}`
        });

        lastIndex = markdownLinkPattern.lastIndex;
    }

    if (lastIndex < value.length) {
        segments.push({
            type: "text",
            text: value.slice(lastIndex)
        });
    }

    if (!segments.length) {
        segments.push({
            type: "text",
            text: value
        });
    }

    return segments;
}

function openExternalLink(url) {
    if (!url || typeof window === "undefined") {
        return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
}

function credits(config, actionbar, fonts) {
    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const actionContent = actionbar.actionContent;

    actionbar.addBtn.visible(false);

    const { width: containerWidth } = actionContent.getAttrs();

    const outerPadding = isPortrait ? 4 : 0;
    const columnGap = isPortrait ? 0 : 20;
    const rowGap = isPortrait ? 14 : 18;
    const columnCount = (isPortrait || isAndroid) ? 1 : 2;
    const valueTextSize = scaleFontSize(isPortrait ? 14 : 14);

    const mainContainer = new Konva.Group({
        x: outerPadding,
        width: containerWidth - (outerPadding * 2),
        height: 0
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

    // 1. Hero Acknowledgement Banner
    const bannerHeight = isPortrait ? 82 : 80;
    const banner = new Konva.Group({
        x: 0,
        y: 0,
        width: mainContainer.width(),
        height: bannerHeight
    });

    const bannerBg = new Konva.Rect({
        x: 0,
        y: 0,
        width: mainContainer.width(),
        height: bannerHeight,
        cornerRadius: 16,
        fill: "rgba(35, 26, 62, 0.65)",
        stroke: "rgba(184, 138, 239, 0.35)",
        strokeWidth: 1.2,
        perfectDrawEnabled: false
    });

    const bannerTitle = new Konva.Text({
        x: 20,
        y: 12,
        width: mainContainer.width() - 40,
        text: `🌸  ${config.title || "VN-Sutra"} • Production & Creative Credits`,
        fontFamily: fonts["other"]?.name || "Inter",
        fontStyle: "bold",
        fontSize: scaleFontSize(isPortrait ? 18 : 20),
        letterSpacing: 0.5,
        fill: "#F8F2FF"
    });

    const bannerSubtitle = new Konva.Text({
        x: 20,
        y: isPortrait ? 48 : 46,
        width: mainContainer.width() - 40,
        text: "Special thanks to all the talented artists, composers, and developers who contributed to this journey.",
        fontFamily: fonts["other"]?.name || "Inter",
        fontSize: scaleFontSize(isPortrait ? 13 : 13),
        fill: "#D8CCE8"
    });

    banner.add(bannerBg, bannerTitle, bannerSubtitle);
    mainContainer.add(banner);

    // 2. Credits Cards Grid
    const startY = bannerHeight + (isPortrait ? 14 : 18);
    const cardWidth = columnCount === 1
        ? mainContainer.width()
        : ((mainContainer.width() - columnGap) / 2);

    const columnHeights = Array.from({ length: columnCount }, () => startY);

    const createCreditText = (text, fill, options = {}) => new Konva.Text({
        align: options.align ?? "left",
        padding: 0,
        verticalAlign: options.verticalAlign ?? "middle",
        text,
        fontFamily: fonts["other"]?.name || "Inter",
        fontSize: valueTextSize,
        fill,
        fillAfterStrokeEnabled: true,
        wrap: "word",
        perfectDrawEnabled: false
    });

    const creditsEntries = Object.entries(config.credits || {});

    creditsEntries.forEach(([key, value]) => {
        let columnIndex = 0;
        if (columnCount > 1) {
            columnIndex = columnHeights[1] < columnHeights[0] ? 1 : 0;
        }

        const container = new Konva.Group({
            width: cardWidth,
            x: columnCount === 1 ? 0 : (columnIndex * (cardWidth + columnGap)),
            y: columnHeights[columnIndex]
        });

        // Header: Glowing Icon Circle + Role Title
        const iconCircleSize = 32;
        const iconCircle = new Konva.Rect({
            x: 18,
            y: 14,
            width: iconCircleSize,
            height: iconCircleSize,
            cornerRadius: 16,
            fill: "rgba(184, 138, 239, 0.18)",
            stroke: "rgba(242, 169, 213, 0.45)",
            strokeWidth: 1,
            perfectDrawEnabled: false
        });

        const iconPath = getRoleIconPath(key);
        const iconScale = 0.65;
        const iconNode = (typeof Konva.Path === "function")
            ? new Konva.Path({
                x: 18 + (iconCircleSize - (24 * iconScale)) / 2,
                y: 14 + (iconCircleSize - (24 * iconScale)) / 2,
                data: iconPath,
                fill: "#F2A9D5",
                scale: { x: iconScale, y: iconScale },
                perfectDrawEnabled: false
            })
            : new Konva.Text({
                x: 18,
                y: 14,
                width: iconCircleSize,
                height: iconCircleSize,
                text: "★",
                align: "center",
                verticalAlign: "middle",
                fill: "#F2A9D5"
            });

        const roleText = new Konva.Text({
            align: "left",
            padding: 0,
            x: 18 + iconCircleSize + 12,
            y: 14,
            verticalAlign: "middle",
            width: container.width() - (18 + iconCircleSize + 24),
            height: iconCircleSize,
            text: key,
            fontFamily: fonts["other"]?.name || "Inter",
            fontSize: scaleFontSize(isPortrait ? 16 : 16),
            fontStyle: "bold",
            fill: "#F8F2FF",
            wrap: "none",
            perfectDrawEnabled: false
        });

        const cardDivider = new Konva.Rect({
            x: 18,
            y: 14 + iconCircleSize + 10,
            width: container.width() - 36,
            height: 1,
            fill: "rgba(184, 138, 239, 0.20)",
            perfectDrawEnabled: false
        });

        const valueY = 14 + iconCircleSize + 20;
        const maxLineWidth = container.width() - 36;
        const valueGroup = new Konva.Group({
            x: 18,
            y: valueY,
            width: maxLineWidth
        });

        const parsedSegments = parseCreditSegments(value);
        const lines = [];
        let currentLine = [];
        let currentLineWidth = 0;
        let currentLineHeight = 0;

        const pushLine = () => {
            lines.push({
                tokens: currentLine,
                width: currentLineWidth,
                height: currentLineHeight || Math.ceil(valueTextSize * 1.3)
            });
            currentLine = [];
            currentLineWidth = 0;
            currentLineHeight = 0;
        };

        const createTokenNode = (text, segment) => {
            const isLink = segment.type === "link";
            const node = createCreditText(
                text,
                isLink ? (config.colors.secondary || "#F2A9D5") : "#D5CEE8"
            );

            if (isLink) {
                node.textDecoration("underline");
                node.on("mouseover", () => {
                    node.fill("#FFFFFF");
                    node.getLayer()?.batchDraw();
                    document.body.style.cursor = "pointer";
                });
                node.on("mouseout", () => {
                    node.fill(config.colors.secondary || "#F2A9D5");
                    node.getLayer()?.batchDraw();
                    document.body.style.cursor = "auto";
                });
                node.on("click tap", (event) => {
                    if (event) {
                        event.cancelBubble = true;
                    }
                    openExternalLink(segment.link);
                });
            }

            return {
                node,
                width: node.getTextWidth(),
                height: node.height(),
                text
            };
        };

        const addTokenToLines = (tokenText, segment) => {
            if (!tokenText) {
                return;
            }

            const token = createTokenNode(tokenText, segment);

            if (token.width > maxLineWidth && tokenText.length > 1) {
                for (const char of tokenText) {
                    addTokenToLines(char, segment);
                }
                return;
            }

            if (tokenText.trim().length === 0 && currentLine.length === 0) {
                return;
            }

            if (currentLine.length > 0 && (currentLineWidth + token.width) > maxLineWidth && tokenText.trim().length > 0) {
                pushLine();
            }

            currentLine.push(token);
            currentLineWidth += token.width;
            currentLineHeight = Math.max(currentLineHeight, token.height);
        };

        parsedSegments.forEach((segment) => {
            const tokens = segment.text.match(/\s+|\S+/g) || [];
            tokens.forEach((tokenText) => {
                addTokenToLines(tokenText, segment);
            });
        });

        if (currentLine.length > 0 || lines.length === 0) {
            pushLine();
        }

        let currentY = 0;
        lines.forEach((line) => {
            let currentX = 0;

            line.tokens.forEach((token) => {
                token.node.x(currentX);
                token.node.y(currentY);
                valueGroup.add(token.node);
                currentX += token.width;
            });

            currentY += line.height + 2;
        });

        const valueHeight = Math.max(currentY, Math.ceil(valueTextSize * 1.3));
        const containerHeight = valueY + valueHeight + 16;
        container.height(containerHeight);

        const cardBg = new Konva.Rect({
            x: 0,
            y: 0,
            width: container.width(),
            height: containerHeight,
            cornerRadius: 16,
            fill: "rgba(25, 20, 48, 0.78)",
            stroke: "rgba(184, 138, 239, 0.25)",
            strokeWidth: 1.2,
            shadowColor: "#080612",
            shadowBlur: 16,
            shadowOpacity: 0.45,
            perfectDrawEnabled: false
        });

        container.on("mouseover", () => {
            cardBg.to({
                stroke: "rgba(242, 169, 213, 0.65)",
                fill: "rgba(38, 30, 68, 0.90)",
                shadowBlur: 20,
                shadowOpacity: 0.6,
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
            iconCircle.to({
                stroke: "#F2A9D5",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
        });

        container.on("mouseout", () => {
            cardBg.to({
                stroke: "rgba(184, 138, 239, 0.25)",
                fill: "rgba(25, 20, 48, 0.78)",
                shadowBlur: 16,
                shadowOpacity: 0.45,
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
            iconCircle.to({
                stroke: "rgba(242, 169, 213, 0.45)",
                duration: 0.18,
                easing: Konva?.Easings?.EaseOut
            });
        });

        container.add(cardBg, iconCircle, iconNode, roleText, cardDivider, valueGroup);
        mainContainer.add(container);

        columnHeights[columnIndex] += containerHeight + rowGap;
    });

    const maxHeight = columnHeights.length ? Math.max(...columnHeights) : startY;
    mainContainer.height(Math.max(1, maxHeight - rowGap));

    function render() {
        setOpenWindow("credits");
        actionbar.clear();
        actionbar.title = "Credits";
        mainContainer.y(0);

        actionContent.add(scrollTouchArea, mainContainer);

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

    return ({
        container: mainContainer,
        render,
    });
}

export { credits };
export default credits;
