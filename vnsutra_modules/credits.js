import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";

const Konva = globalThis.Konva;

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

    const outerPadding = isPortrait ? 6 : (isAndroid ? 8 : 0);
    const columnGap = isPortrait ? 0 : (isAndroid ? 0 : 16);
    const rowGap = isPortrait ? 18 : (isAndroid ? 14 : 18);
    const titleGap = 8;
    const cardPaddingY = isPortrait ? 8 : 6;
    const columnCount = (isPortrait || isAndroid) ? 1 : 2;
    const keyTextSize = scaleFontSize(isPortrait ? 25 : (isAndroid ? 20 : 25));
    const valueTextSize = scaleFontSize(isPortrait ? 23 : (isAndroid ? 18 : 23));

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

    const cardWidth = columnCount === 1
        ? mainContainer.width()
        : ((mainContainer.width() - columnGap) / 2);

    const columnHeights = Array.from({ length: columnCount }, () => 0);

    const createCreditText = (text, fill, options = {}) => new Konva.Text({
        align: options.align ?? "left",
        padding: 0,
        verticalAlign: options.verticalAlign ?? "middle",
        text,
        fontFamily: fonts["other"],
        fontSize: valueTextSize,
        fill,
        fillAfterStrokeEnabled: true,
        wrap: "word"
    });

    Object.entries(config.credits).forEach(([key, value]) => {
        let columnIndex = 0;
        if (columnCount > 1) {
            columnIndex = columnHeights[1] < columnHeights[0] ? 1 : 0;
        }

        const container = new Konva.Group({
            width: cardWidth,
            x: columnCount === 1 ? 0 : (columnIndex * (cardWidth + columnGap)),
            y: columnHeights[columnIndex]
        });

        const key_text = new Konva.Text({
            align: "center",
            padding: 0,
            verticalAlign: "middle",
            width: container.width(),
            text: key,
            fontFamily: fonts["other"],
            fontSize: keyTextSize,
            fill: config.colors.primary,
            fillAfterStrokeEnabled: true,
            wrap: "word"
        });

        const parsedSegments = parseCreditSegments(value);
        const valueY = key_text.height() + titleGap;
        const valueGroup = new Konva.Group({
            x: 0,
            y: valueY,
            width: container.width()
        });

        let valueHeight = 0;
        const maxLineWidth = container.width();
        const lines = [];
        let currentLine = [];
        let currentLineWidth = 0;
        let currentLineHeight = 0;

        const pushLine = () => {
            lines.push({
                tokens: currentLine,
                width: currentLineWidth,
                height: currentLineHeight || Math.ceil(valueTextSize * 1.2)
            });
            currentLine = [];
            currentLineWidth = 0;
            currentLineHeight = 0;
        };

        const createTokenNode = (text, segment) => {
            const node = createCreditText(
                text,
                segment.type === "link"
                    ? (config.colors.secondary || config.colors.primary || config.colors.text)
                    : config.colors.text
            );

            if (segment.type === "link") {
                node.textDecoration("underline");
                node.on("mouseover", () => {
                    document.body.style.cursor = "pointer";
                });
                node.on("mouseout", () => {
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
            let currentX = Math.max(0, (maxLineWidth - line.width) / 2);

            line.tokens.forEach((token) => {
                token.node.x(currentX);
                token.node.y(currentY);
                valueGroup.add(token.node);
                currentX += token.width;
            });

            currentY += line.height;
        });

        valueHeight = Math.max(currentY, Math.ceil(valueTextSize * 1.2));

        const containerHeight = valueY + valueHeight + (cardPaddingY * 2);
        container.height(containerHeight);

        container.add(key_text, valueGroup);

        mainContainer.add(container);

        columnHeights[columnIndex] += containerHeight + rowGap;
    });

    const maxHeight = columnHeights.length ? Math.max(...columnHeights) : 0;
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