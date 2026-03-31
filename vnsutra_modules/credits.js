import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";

const Konva = globalThis.Konva;

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

        const value_text = new Konva.Text({
            align: "center",
            padding: 0,
            verticalAlign: "middle",
            width: container.width(),
            y: key_text.height() + titleGap,
            text: value,
            fontFamily: fonts["other"],
            fontSize: valueTextSize,
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
            wrap: "word"
        });

        const containerHeight = value_text.y() + value_text.height() + (cardPaddingY * 2);
        container.height(containerHeight);

        container.add(key_text, value_text);

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