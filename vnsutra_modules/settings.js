import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import { Switch, animateBtn, openBar } from "./ui/utils.js";
import * as runtimeState from "./runtime-state.js";
import { STORAGE_KEYS, EVENTS } from "./constants.js";
import { i18n } from "./i18n.js";
import accessibility from "./accessibility.js";
import errorTracking from "./error-tracking.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";

const { getIsPortrait, getIsAndroid, getOpenWindow, setOpenWindow } = runtimeState;
const scaleFontSize = runtimeState.scaleFontSize ?? ((n) => Number(n) || 0);
const Konva = globalThis.Konva;

const ICONS = {
    audio: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
    a11y: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    font: "M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z",
    globe: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
    links: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
    support: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.49.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.63 8.47c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.49.41h4c.24 0 .44-.17.49-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
    credits: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    about: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
    arrow: "M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
};

function createVectorIcon(pathData, x, y, size = 18, fill = "#F8F2FF", fallback = "✦") {
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

let settingsAccessibilityCleanup = null;

function settings(config, actionbar, fonts, credit_details) {
    if (!Konva) {
        errorTracking?.captureError("Konva not available", {
            message: "[Settings] Konva not available",
            context: { scope: "settings" }
        });
        return null;
    }

    if (typeof settingsAccessibilityCleanup === "function") {
        settingsAccessibilityCleanup();
        settingsAccessibilityCleanup = null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    const actionContent = actionbar.actionContent;

    actionbar.addBtn.visible(false);

    const { width: containerWidth } = actionContent.getAttrs();

    // Twilight Color Scheme
    const primaryColor = config?.colors?.primary || "#B88AEF";
    const secondaryColor = config?.colors?.secondary || "#F2A9D5";
    const goldColor = config?.colors?.gold || "#F6C66B";
    const textColor = config?.colors?.text || "#F8F2FF";
    const subtextColor = config?.colors?.["timestamp-text"] || "#C4B6DC";
    const fontOther = fonts?.["other"]?.name || fonts?.["other"] || "Inter";

    // Spacing & Metrics
    const outerPadding = isPortrait ? 6 : 10;
    const cardGap = isPortrait ? 14 : 16;
    const columnGap = isPortrait ? 0 : 16;
    const columnCount = (isPortrait || isAndroid) ? 1 : 2;
    const toggleScale = isPortrait ? 0.88 : 0.86;

    // Tween tracking for clean teardown
    const activeTweens = new Set();
    const runTween = (node, tweenConfig) => {
        if (!node || !node.getStage()) return null;
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
        height: 0
    });

    const scrollTouchArea = new Konva.Rect({
        x: 0,
        y: 0,
        width: actionContent.width(),
        height: actionContent.height(),
        fill: "rgba(0,0,0,0)",
        listening: true,
        visible: false
    });

    function createSectionHeader(title, iconPath, width, x = 0, y = 0) {
        const headerGroup = new Konva.Group({ x, y, width, height: 36 });
        const badgeSize = 28;
        const badgeBg = new Konva.Rect({
            x: 0,
            y: 4,
            width: badgeSize,
            height: badgeSize,
            cornerRadius: 9,
            fill: "rgba(184, 138, 239, 0.20)",
            stroke: "rgba(242, 169, 213, 0.45)",
            strokeWidth: 1,
            perfectDrawEnabled: false
        });

        const badgeIcon = createVectorIcon(iconPath, 4, 8, 20, secondaryColor, "✦");

        const label = new Konva.Text({
            x: badgeSize + 12,
            y: 0,
            width: width - (badgeSize + 12),
            height: 36,
            verticalAlign: "middle",
            text: title,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 15 : 16),
            fontStyle: "bold",
            letterSpacing: 1.2,
            fill: primaryColor,
            perfectDrawEnabled: false
        });

        headerGroup.add(badgeBg, badgeIcon, label);
        return headerGroup;
    }

    function createCardContainer(x, y, width, height) {
        const group = new Konva.Group({ x, y, width, height });
        const bg = new Konva.Rect({
            x: 0,
            y: 0,
            width,
            height,
            cornerRadius: 16,
            fill: "rgba(32, 24, 56, 0.72)",
            stroke: "rgba(184, 138, 239, 0.32)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const topGlow = new Konva.Rect({
            x: 20,
            y: 0,
            width: width - 40,
            height: 1.2,
            fill: "rgba(242, 169, 213, 0.45)",
            perfectDrawEnabled: false
        });

        group.add(bg, topGlow);
        return { group, bg };
    }

    // -------------------------------------------------------------
    // 1. Audio & Dialogue Switches
    // -------------------------------------------------------------
    const textAnimation = new Switch({
        label: "Text Animation",
        id: "text-animation",
        variable: "text_animation",
        checked: true,
        listener: () => { }
    }, config, mainContainer, fonts);

    const music = new Switch({
        label: "Music",
        id: "settings-music",
        variable: "settings-music",
        checked: true,
        listener: (value) => {
            const elem = document.getElementById("music");
            if (elem) {
                if (value) {
                    if (elem.paused) elem.play();
                } else {
                    if (!elem.paused) elem.pause();
                }
            }
        }
    }, config, mainContainer, fonts);

    const sfx = new Switch({
        label: "Sound Effects",
        id: "settings-sfx",
        variable: "settings-sfx",
        checked: true,
        listener: (value) => {
            const elem = document.getElementById("sfx");
            if (elem) {
                if (value) {
                    if (elem.paused) elem.play();
                } else {
                    if (!elem.paused) elem.pause();
                }
            }
        }
    }, config, mainContainer, fonts);

    const highContrast = new Switch({
        label: "High Contrast",
        id: STORAGE_KEYS.ACCESSIBILITY_HIGH_CONTRAST,
        variable: STORAGE_KEYS.ACCESSIBILITY_HIGH_CONTRAST,
        checked: false,
        updateEnabled: false,
        listener: (value) => {
            accessibility?.setHighContrast(value);
        }
    }, config, mainContainer, fonts);

    const reduceMotion = new Switch({
        label: "Reduce Motion",
        id: STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION,
        variable: STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION,
        checked: false,
        updateEnabled: false,
        listener: (value) => {
            accessibility?.setReduceMotion(value);
        }
    }, config, mainContainer, fonts);

    const allSwitches = [textAnimation, music, sfx, highContrast, reduceMotion];
    allSwitches.forEach(sw => {
        sw.container.scale({ x: toggleScale, y: toggleScale });
        sw.update();
    });

    // Layout Columns: 2 columns on desktop landscape, 1 column on mobile/portrait
    const colWidth = columnCount === 1
        ? mainContainer.width()
        : ((mainContainer.width() - columnGap) / 2);

    const audioSwitchRowHeight = isPortrait ? 58 : 56;
    const audioCardContentHeight = 18 + 36 + 12 + (3 * audioSwitchRowHeight) + 14;
    const a11yCardContentHeight = 18 + 36 + 12 + (2 * audioSwitchRowHeight) + 14;
    const topRowCardHeight = columnCount === 1
        ? audioCardContentHeight
        : Math.max(audioCardContentHeight, a11yCardContentHeight);

    // Audio Card
    const audioCard = createCardContainer(0, 0, colWidth, topRowCardHeight);
    const audioHeader = createSectionHeader("AUDIO & DIALOGUE", ICONS.audio, colWidth - 36, 18, 16);
    audioCard.group.add(audioHeader);

    const audioDivider = new Konva.Rect({
        x: 18,
        y: 60,
        width: colWidth - 36,
        height: 1,
        fill: "rgba(184, 138, 239, 0.20)",
        perfectDrawEnabled: false
    });
    audioCard.group.add(audioDivider);

    const audioStartY = 70;
    textAnimation.container.x(16);
    textAnimation.container.y(audioStartY);
    music.container.x(16);
    music.container.y(audioStartY + audioSwitchRowHeight);
    sfx.container.x(16);
    sfx.container.y(audioStartY + audioSwitchRowHeight * 2);

    audioCard.group.add(textAnimation.container, music.container, sfx.container);
    mainContainer.add(audioCard.group);

    // Accessibility Card
    const a11yX = columnCount === 1 ? 0 : (colWidth + columnGap);
    const a11yY = columnCount === 1 ? (topRowCardHeight + cardGap) : 0;
    const a11yHeight = columnCount === 1 ? a11yCardContentHeight : topRowCardHeight;

    const a11yCard = createCardContainer(a11yX, a11yY, colWidth, a11yHeight);
    const a11yHeader = createSectionHeader("ACCESSIBILITY", ICONS.a11y, colWidth - 36, 18, 16);
    a11yCard.group.add(a11yHeader);

    const a11yDivider = new Konva.Rect({
        x: 18,
        y: 60,
        width: colWidth - 36,
        height: 1,
        fill: "rgba(184, 138, 239, 0.20)",
        perfectDrawEnabled: false
    });
    a11yCard.group.add(a11yDivider);

    highContrast.container.x(16);
    highContrast.container.y(audioStartY);
    reduceMotion.container.x(16);
    reduceMotion.container.y(audioStartY + audioSwitchRowHeight);

    a11yCard.group.add(highContrast.container, reduceMotion.container);
    mainContainer.add(a11yCard.group);

    // -------------------------------------------------------------
    // 2. Display & Font Scale Section
    // -------------------------------------------------------------
    const afterTopY = columnCount === 1
        ? (a11yY + a11yHeight + cardGap)
        : (topRowCardHeight + cardGap);

    const fontScaleCardHeight = isPortrait ? 162 : 152;
    const fontScaleCard = createCardContainer(0, afterTopY, mainContainer.width(), fontScaleCardHeight);

    const fontScaleHeader = createSectionHeader("FONT & DISPLAY SCALE", ICONS.font, mainContainer.width() - 36, 18, 16);
    fontScaleCard.group.add(fontScaleHeader);

    const fontScaleDivider = new Konva.Rect({
        x: 18,
        y: 60,
        width: mainContainer.width() - 36,
        height: 1,
        fill: "rgba(184, 138, 239, 0.20)",
        perfectDrawEnabled: false
    });
    fontScaleCard.group.add(fontScaleDivider);

    const fontScaleGroup = new Konva.Group({
        x: 18,
        y: 74,
        width: mainContainer.width() - 36,
        height: 64
    });

    const fontScaleLabel = new Konva.Text({
        x: 0,
        y: 0,
        text: "Interface & Text Scale",
        fontFamily: fontOther,
        fontSize: scaleFontSize(isPortrait ? 16 : 17),
        fontStyle: "bold",
        fill: textColor,
        perfectDrawEnabled: false
    });

    const fontScaleHint = new Konva.Text({
        x: 0,
        y: 28,
        text: "Adjust dialogue and HUD scaling for readability",
        fontFamily: fontOther,
        fontSize: scaleFontSize(isPortrait ? 13 : 13),
        fill: "#E2D8F0",
        perfectDrawEnabled: false
    });

    const currentScale = accessibility?.getSettings().fontScale ?? 1;
    const stepperWidth = 220;
    const stepperX = fontScaleGroup.width() - stepperWidth;
    const pillWidth = 92;
    const pillHeight = 44;
    const pillX = stepperX + 62;

    const fontScalePill = new Konva.Rect({
        x: pillX,
        y: 2,
        width: pillWidth,
        height: pillHeight,
        cornerRadius: 12,
        fill: "rgba(184, 138, 239, 0.16)",
        stroke: "rgba(242, 169, 213, 0.40)",
        strokeWidth: 1,
        perfectDrawEnabled: false
    });

    const fontScaleValue = new Konva.Text({
        x: pillX,
        y: 2,
        width: pillWidth,
        height: pillHeight,
        align: "center",
        verticalAlign: "middle",
        text: `${Math.round(currentScale * 100)}%`,
        fontFamily: fontOther,
        fontSize: scaleFontSize(isPortrait ? 15 : 16),
        fontStyle: "bold",
        letterSpacing: 0.5,
        fill: textColor,
        perfectDrawEnabled: false
    });

    function updateFontScaleText() {
        const value = accessibility?.getSettings().fontScale ?? 1;
        fontScaleValue.text(`${Math.round(value * 100)}%`);
        fontScaleGroup.getLayer()?.draw();
    }

    function triggerResizeRedraw() {
        if (typeof globalThis.dispatchEvent !== "function") return;
        if (typeof CustomEvent === "function") {
            globalThis.dispatchEvent(new CustomEvent("resize", { detail: { force: true } }));
            return;
        }
        if (typeof Event === "function") {
            globalThis.dispatchEvent(new Event("resize"));
        }
    }

    function createScaleButton(label, x, onClick) {
        const btnWidth = 54;
        const btnHeight = 44;
        const group = new Konva.Group({
            x,
            y: 2,
            width: btnWidth,
            height: btnHeight
        });

        const rect = new Konva.Rect({
            width: btnWidth,
            height: btnHeight,
            cornerRadius: 12,
            fill: "rgba(184, 138, 239, 0.22)",
            stroke: "rgba(184, 138, 239, 0.50)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const text = new Konva.Text({
            width: btnWidth,
            height: btnHeight,
            align: "center",
            verticalAlign: "middle",
            text: label,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 15 : 16),
            fontStyle: "bold",
            fill: "#F8F2FF",
            perfectDrawEnabled: false
        });

        group.on("mouseover", () => {
            if (typeof document !== "undefined") document.body.style.cursor = "pointer";
            runTween(rect, {
                fill: "rgba(242, 169, 213, 0.35)",
                stroke: secondaryColor,
                duration: 0.15
            });
        });

        group.on("mouseout", () => {
            if (typeof document !== "undefined") document.body.style.cursor = "auto";
            runTween(rect, {
                fill: "rgba(184, 138, 239, 0.22)",
                stroke: "rgba(184, 138, 239, 0.50)",
                duration: 0.15
            });
        });

        group.on("click touchstart", () => {
            animateBtn(group);
            onClick();
            updateFontScaleText();
            triggerResizeRedraw();
        });

        group.add(rect, text);
        return group;
    }

    const decreaseBtn = createScaleButton("A-", stepperX, () => {
        accessibility?.decreaseFontScale(0.1);
    });

    const increaseBtn = createScaleButton("A+", pillX + pillWidth + 8, () => {
        accessibility?.increaseFontScale(0.1);
    });

    fontScaleGroup.add(
        fontScaleLabel,
        fontScaleHint,
        decreaseBtn,
        fontScalePill,
        fontScaleValue,
        increaseBtn
    );

    fontScaleCard.group.add(fontScaleGroup);
    mainContainer.add(fontScaleCard.group);

    // -------------------------------------------------------------
    // 3. System Language Section
    // -------------------------------------------------------------
    const afterFontScaleY = afterTopY + fontScaleCardHeight + cardGap;
    const configuredLanguages = i18n?.getSupportedLanguages?.() ?? ["en", "ja", "es", "fr"];
    const currentLang = i18n ? i18n.getLanguage() : "en";

    let languageDisplayNames = null;
    try {
        if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
            languageDisplayNames = new Intl.DisplayNames([currentLang || "en"], { type: "language" });
        }
    } catch {
        languageDisplayNames = null;
    }

    const getLanguageLabel = (code) => {
        if (!code) return "";
        if (languageDisplayNames && typeof languageDisplayNames.of === "function") {
            const resolved = languageDisplayNames.of(code);
            if (typeof resolved === "string" && resolved.trim().length > 0) {
                return resolved.charAt(0).toUpperCase() + resolved.slice(1);
            }
        }
        return String(code).toUpperCase();
    };

    const languages = configuredLanguages.length > 0
        ? configuredLanguages.map(code => ({ code, name: getLanguageLabel(code) }))
        : [{ code: "en", name: "English" }];

    const langColumns = isPortrait
        ? Math.max(1, Math.min(2, languages.length))
        : Math.max(1, Math.min(4, languages.length));

    const langRowGap = 10;
    const langColGap = 12;
    const langGridWidth = mainContainer.width() - 36;
    const langBtnWidth = (langGridWidth - langColGap * (langColumns - 1)) / langColumns;
    const langBtnHeight = isPortrait ? 46 : 44;
    const langRowCount = Math.ceil(languages.length / langColumns);
    const langGridHeight = langRowCount * langBtnHeight + (langRowCount - 1) * langRowGap;
    const languageCardHeight = 72 + langGridHeight + 16;

    const languageCard = createCardContainer(0, afterFontScaleY, mainContainer.width(), languageCardHeight);
    const languageHeader = createSectionHeader("SYSTEM LANGUAGE", ICONS.globe, mainContainer.width() - 36, 18, 16);
    languageCard.group.add(languageHeader);

    const languageDivider = new Konva.Rect({
        x: 18,
        y: 60,
        width: mainContainer.width() - 36,
        height: 1,
        fill: "rgba(184, 138, 239, 0.20)",
        perfectDrawEnabled: false
    });
    languageCard.group.add(languageDivider);

    const languageGroup = new Konva.Group({
        x: 18,
        y: 72,
        width: langGridWidth,
        height: langGridHeight
    });

    const langBtnNodes = [];

    languages.forEach((lang, index) => {
        const isSelected = lang.code === currentLang;
        const col = index % langColumns;
        const row = Math.floor(index / langColumns);

        const btnGroup = new Konva.Group({
            width: langBtnWidth,
            height: langBtnHeight,
            x: col * (langBtnWidth + langColGap),
            y: row * (langBtnHeight + langRowGap),
            name: `lang-btn-${lang.code}`
        });

        const btnRect = new Konva.Rect({
            width: langBtnWidth,
            height: langBtnHeight,
            fill: isSelected ? "rgba(184, 138, 239, 0.32)" : "rgba(25, 20, 48, 0.70)",
            stroke: isSelected ? secondaryColor : "rgba(184, 138, 239, 0.25)",
            strokeWidth: isSelected ? 1.5 : 1,
            cornerRadius: 12,
            perfectDrawEnabled: false
        });

        const btnText = new Konva.Text({
            width: langBtnWidth,
            height: langBtnHeight,
            align: "center",
            verticalAlign: "middle",
            text: lang.name,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 14 : 14),
            fontStyle: "bold",
            fill: isSelected ? "#FFFFFF" : "#D8CCE8",
            perfectDrawEnabled: false
        });

        btnGroup.on("click touchstart", async () => {
            if (i18n) {
                await i18n.loadLanguage(lang.code);
                langBtnNodes.forEach(item => {
                    const active = item.code === lang.code;
                    item.rect.fill(active ? "rgba(184, 138, 239, 0.32)" : "rgba(25, 20, 48, 0.70)");
                    item.rect.stroke(active ? secondaryColor : "rgba(184, 138, 239, 0.25)");
                    item.rect.strokeWidth(active ? 1.5 : 1);
                    item.text.fill(active ? "#FFFFFF" : "#D8CCE8");
                    item.text.fontStyle("bold");
                });
                languageGroup.getLayer()?.draw();
            }
        });

        btnGroup.on("mouseover", () => {
            if (typeof document !== "undefined") document.body.style.cursor = "pointer";
            runTween(btnRect, {
                fill: isSelected ? "rgba(184, 138, 239, 0.45)" : "rgba(42, 32, 70, 0.85)",
                stroke: secondaryColor,
                duration: 0.15
            });
        });

        btnGroup.on("mouseout", () => {
            if (typeof document !== "undefined") document.body.style.cursor = "auto";
            const currentlyActive = lang.code === (i18n ? i18n.getLanguage() : "en");
            runTween(btnRect, {
                fill: currentlyActive ? "rgba(184, 138, 239, 0.32)" : "rgba(25, 20, 48, 0.70)",
                stroke: currentlyActive ? secondaryColor : "rgba(184, 138, 239, 0.25)",
                duration: 0.15
            });
        });

        btnGroup.add(btnRect, btnText);
        langBtnNodes.push({ code: lang.code, rect: btnRect, text: btnText });
        languageGroup.add(btnGroup);
    });

    languageCard.group.add(languageGroup);
    mainContainer.add(languageCard.group);

    // -------------------------------------------------------------
    // 4. Information & Resources Links Section
    // -------------------------------------------------------------
    const afterLanguageY = afterFontScaleY + languageCardHeight + cardGap;
    const linksColumnCount = isPortrait ? 1 : 3;
    const linkGap = 12;
    const linkCardWidth = (mainContainer.width() - 36 - ((linksColumnCount - 1) * linkGap)) / linksColumnCount;
    const linkCardHeight = isPortrait ? 74 : 80;
    const linkRowCount = Math.ceil(3 / linksColumnCount);
    const linksGridHeight = linkRowCount * linkCardHeight + ((linkRowCount - 1) * linkGap);
    const linksCardHeight = 72 + linksGridHeight + 16;

    const linksCard = createCardContainer(0, afterLanguageY, mainContainer.width(), linksCardHeight);
    const linksHeader = createSectionHeader("INFORMATION & RESOURCES", ICONS.links, mainContainer.width() - 36, 18, 16);
    linksCard.group.add(linksHeader);

    const linksDivider = new Konva.Rect({
        x: 18,
        y: 60,
        width: mainContainer.width() - 36,
        height: 1,
        fill: "rgba(184, 138, 239, 0.20)",
        perfectDrawEnabled: false
    });
    linksCard.group.add(linksDivider);

    const linkButtonsData = [
        {
            name: "Support",
            desc: "Guides, issues & community",
            iconPath: ICONS.support,
            onclick: () => {
                if (typeof window !== "undefined") {
                    window.open(config["support-url"] || "https://github.com/tejasnayak25/vnsutra", "_blank");
                }
            }
        },
        {
            name: "Credits",
            desc: "Production, art & music cast",
            iconPath: ICONS.credits,
            onclick: () => {
                if (typeof actionbar?.switchView === "function") {
                    actionbar.switchView(() => credit_details.render());
                } else {
                    credit_details.render();
                    openBar(actionbar.actionrect);
                }
            }
        },
        {
            name: "About",
            desc: "Engine documentation & repo",
            iconPath: ICONS.about,
            onclick: () => {
                if (typeof window !== "undefined") {
                    window.open(config["about-url"] || "https://github.com/tejasnayak25/vnsutra", "_blank");
                }
            }
        }
    ];

    const linksGrid = new Konva.Group({
        x: 18,
        y: 72,
        width: mainContainer.width() - 36,
        height: linksGridHeight
    });

    linkButtonsData.forEach((btn, idx) => {
        const col = idx % linksColumnCount;
        const row = Math.floor(idx / linksColumnCount);
        const cardX = col * (linkCardWidth + linkGap);
        const cardY = row * (linkCardHeight + linkGap);

        const btnGroup = new Konva.Group({
            x: cardX,
            y: cardY,
            width: linkCardWidth,
            height: linkCardHeight,
            name: `link-btn-${btn.name}`
        });

        const btnBg = new Konva.Rect({
            x: 0,
            y: 0,
            width: linkCardWidth,
            height: linkCardHeight,
            cornerRadius: 14,
            fill: "rgba(38, 30, 64, 0.85)",
            stroke: "rgba(184, 138, 239, 0.35)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const emblemSize = 38;
        const emblemBox = new Konva.Rect({
            x: 12,
            y: (linkCardHeight - emblemSize) / 2,
            width: emblemSize,
            height: emblemSize,
            cornerRadius: 11,
            fill: "rgba(184, 138, 239, 0.18)",
            stroke: "rgba(242, 169, 213, 0.40)",
            strokeWidth: 1,
            perfectDrawEnabled: false
        });

        const iconNode = createVectorIcon(
            btn.iconPath,
            12 + (emblemSize - 20) / 2,
            (linkCardHeight - emblemSize) / 2 + (emblemSize - 20) / 2,
            20,
            secondaryColor,
            "✦"
        );

        const textX = 12 + emblemSize + 12;
        const titleText = new Konva.Text({
            x: textX,
            y: isPortrait ? 16 : 18,
            width: linkCardWidth - textX - 28,
            text: btn.name,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 16 : 16),
            fontStyle: "bold",
            fill: textColor,
            perfectDrawEnabled: false
        });

        const descText = new Konva.Text({
            x: textX,
            y: isPortrait ? 38 : 41,
            width: linkCardWidth - textX - 28,
            text: btn.desc,
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 13 : 13),
            fill: "#D8CCE8",
            perfectDrawEnabled: false
        });

        const arrowIcon = createVectorIcon(
            ICONS.arrow,
            linkCardWidth - 24,
            (linkCardHeight - 18) / 2,
            18,
            "rgba(184, 138, 239, 0.50)",
            "›"
        );

        btnGroup.on("mouseover", () => {
            if (typeof document !== "undefined") document.body.style.cursor = "pointer";
            runTween(btnBg, {
                fill: "rgba(48, 36, 84, 0.95)",
                stroke: secondaryColor,
                duration: 0.15
            });
            runTween(arrowIcon, {
                fill: secondaryColor,
                duration: 0.15
            });
        });

        btnGroup.on("mouseout", () => {
            if (typeof document !== "undefined") document.body.style.cursor = "auto";
            runTween(btnBg, {
                fill: "rgba(38, 30, 64, 0.85)",
                stroke: "rgba(184, 138, 239, 0.35)",
                duration: 0.15
            });
            runTween(arrowIcon, {
                fill: "rgba(184, 138, 239, 0.50)",
                duration: 0.15
            });
        });

        btnGroup.on("click touchstart", () => {
            animateBtn(btnGroup);
            btn.onclick();
        });

        btnGroup.add(btnBg, emblemBox, iconNode, titleText, descText, arrowIcon);
        linksGrid.add(btnGroup);
    });

    linksCard.group.add(linksGrid);
    mainContainer.add(linksCard.group);

    // -------------------------------------------------------------
    // 5. Footer Information (Frosted Glass Emblem Card)
    // -------------------------------------------------------------
    const afterLinksY = afterLanguageY + linksCardHeight + 28;

    const footerGroup = new Konva.Group({
        id: "settings-footer",
        x: 0,
        y: afterLinksY,
        width: mainContainer.width()
    });

    // Decorative top divider with glowing center pip
    const dividerWidth = Math.min(mainContainer.width(), 480);
    const dividerX = (mainContainer.width() - dividerWidth) / 2;

    const footerDivider = new Konva.Rect({
        x: dividerX,
        y: 0,
        width: dividerWidth,
        height: 1,
        fill: "rgba(184, 138, 239, 0.22)",
        perfectDrawEnabled: false
    });

    const dividerGlow = new Konva.Rect({
        x: (mainContainer.width() - 80) / 2,
        y: -0.5,
        width: 80,
        height: 2,
        fill: "rgba(242, 169, 213, 0.50)",
        perfectDrawEnabled: false
    });

    const dividerPip = new Konva.Text({
        x: (mainContainer.width() - 30) / 2,
        y: -10,
        width: 30,
        height: 20,
        align: "center",
        verticalAlign: "middle",
        text: "✦",
        fontFamily: fontOther,
        fontSize: 12,
        fill: secondaryColor,
        perfectDrawEnabled: false
    });

    // Frosted Footer Capsule Card
    const footerCardWidth = isPortrait
        ? mainContainer.width()
        : Math.min(mainContainer.width(), 540);
    const footerCardX = (mainContainer.width() - footerCardWidth) / 2;
    const showEngineLabel = config?.ui?.["vnsutra-label"] !== false;
    const footerCardHeight = showEngineLabel ? 112 : 84;
    const footerCardY = 18;

    const footerCardBg = new Konva.Rect({
        x: footerCardX,
        y: footerCardY,
        width: footerCardWidth,
        height: footerCardHeight,
        cornerRadius: 16,
        fill: "rgba(25, 18, 44, 0.65)",
        stroke: "rgba(184, 138, 239, 0.26)",
        strokeWidth: 1,
        perfectDrawEnabled: false
    });

    const footerCardGlow = new Konva.Rect({
        x: footerCardX + 24,
        y: footerCardY,
        width: footerCardWidth - 48,
        height: 1,
        fill: "rgba(242, 169, 213, 0.35)",
        perfectDrawEnabled: false
    });

    footerGroup.add(footerDivider, dividerGlow, dividerPip, footerCardBg, footerCardGlow);

    let contentY = footerCardY + 16;

    // Engine Branding Pill Chip
    if (showEngineLabel) {
        const pillWidth = 196;
        const pillHeight = 24;
        const pillX = footerCardX + (footerCardWidth - pillWidth) / 2;

        const pillBg = new Konva.Rect({
            x: pillX,
            y: contentY,
            width: pillWidth,
            height: pillHeight,
            cornerRadius: 12,
            fill: "rgba(184, 138, 239, 0.14)",
            stroke: "rgba(242, 169, 213, 0.32)",
            strokeWidth: 1,
            perfectDrawEnabled: false
        });

        const labelText = new Konva.Text({
            x: pillX,
            y: contentY,
            width: pillWidth,
            height: pillHeight,
            align: "center",
            verticalAlign: "middle",
            text: "🌸 BUILT WITH VN-SUTRA",
            fontFamily: fontOther,
            fontSize: scaleFontSize(11),
            fontStyle: "bold",
            letterSpacing: 1.2,
            fill: secondaryColor,
            perfectDrawEnabled: false
        });

        footerGroup.add(pillBg, labelText);
        contentY += pillHeight + 10;
    }

    // Version & Game Title Row
    const versionLabel = `Version ${config.version || "1.0.0"}`;
    const versionText = new Konva.Text({
        x: footerCardX + 16,
        y: contentY,
        width: footerCardWidth - 32,
        align: "center",
        text: versionLabel,
        fontFamily: fontOther,
        fontSize: scaleFontSize(isPortrait ? 13 : 14),
        fontStyle: "bold",
        letterSpacing: 0.8,
        fill: "#FFFFFF",
        perfectDrawEnabled: false
    });

    // Copyright Subtext
    const copyrightText = new Konva.Text({
        x: footerCardX + 16,
        y: contentY + 22,
        width: footerCardWidth - 32,
        align: "center",
        text: config.copyright || "Copyright VN-Sutra",
        fontFamily: fontOther,
        fontSize: scaleFontSize(isPortrait ? 12 : 12),
        fill: "#C4B6DC",
        lineHeight: 1.35,
        perfectDrawEnabled: false
    });

    footerGroup.add(versionText, copyrightText);
    mainContainer.add(footerGroup);

    const totalHeight = afterLinksY + footerCardY + footerCardHeight + 24;
    mainContainer.height(totalHeight);

    function render() {
        stopAllTweens();
        setOpenWindow("settings");
        actionbar.clear();
        actionbar.title = "Settings";

        textAnimation.update();
        music.update();
        sfx.update();
        highContrast.update();
        reduceMotion.update();
        updateFontScaleText();

        mainContainer.y(0);
        actionContent.add(scrollTouchArea, mainContainer);

        const isScrollable = mainContainer.height() > actionContent.height();
        scrollTouchArea.visible(isScrollable);

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

    const handleAccessibilityChange = () => {
        if (getOpenWindow() === "settings") {
            render();
        }
    };

    if (typeof globalThis.addEventListener === "function") {
        globalThis.addEventListener(EVENTS.ACCESSIBILITY, handleAccessibilityChange);
        settingsAccessibilityCleanup = () => {
            globalThis.removeEventListener(EVENTS.ACCESSIBILITY, handleAccessibilityChange);
        };
    }

    return {
        container: mainContainer,
        render,
        destroy: stopAllTweens
    };
}

export { settings };
export default settings;
