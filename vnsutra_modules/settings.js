import "./konva.js";
import { Switch, animateBtn, openBar } from "./ui/utils.js";
import * as runtimeState from "./runtime-state.js";
const { getIsPortrait, getIsAndroid, getOpenWindow, setOpenWindow } = runtimeState;
const scaleFontSize = runtimeState.scaleFontSize ?? ((n) => Number(n) || 0);
import { STORAGE_KEYS, EVENTS } from "./constants.js";
import { i18n } from "./i18n.js";
import accessibility from "./accessibility.js";
import errorTracking from "./error-tracking.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";
const Konva = globalThis.Konva;

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
    
    const { width: containerWidth, height: containerHeight } = actionContent.getAttrs();

    const padding = isPortrait ? 20 : 28;
    const gap = isPortrait ? 18 : 22;
    const sectionGap = isPortrait ? 16 : 18;
    const sectionTitleSize = isPortrait ? 22 : 20;
    const valueTextSize = isPortrait ? 19 : 18;
    const linkButtonTextSize = isPortrait ? 22 : 20;
    const footerTextSize = isPortrait ? 26 : (isAndroid ? 22 : 23);
    const sectionTitleColor = config.colors.primary;
    const sectionTextColor = config.colors.text;
    const toggleScale = isPortrait ? 0.84 : (isAndroid ? 0.8 : 0.78);

    const mainContainer = new Konva.Group({
        x: padding,
        width: containerWidth - 2 * padding,
        height: containerHeight
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
    
    // Divider will be added later after calculating section heights
    let divider = null;
    
    const audioSectionLabel = new Konva.Text({
        x: isPortrait ? 0 : 0,
        width: isPortrait ? mainContainer.width() : mainContainer.width() / 2,
        align: "center",
        text: "Audio & Dialogue",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(sectionTitleSize),
        fill: sectionTitleColor,
        fillAfterStrokeEnabled: true
    });

    const textAnimation = new Switch({ label: "Text Animation", id: "text-animation", variable: "text_animation", checked: true, listener: () => {} }, config, mainContainer, fonts);
    const getSwitchHeight = (item) => item.container.height() * toggleScale;
    const scaleSwitch = (item) => {
        item.container.scale({ x: toggleScale, y: toggleScale });
    };

    scaleSwitch(textAnimation);
    textAnimation.update();
    textAnimation.container.y(audioSectionLabel.height() + 8);
    if (isPortrait) {
        textAnimation.container.x(0);
    } else {
        const columnPadding = 20;
        textAnimation.container.x(columnPadding);
    }

    const music = new Switch({ label: "Music", id: "settings-music", variable: "settings-music", checked: true, listener: (value) => {
        const elem = document.getElementById("music");
        if(value) {
            if(elem.paused) {
                elem.play();
            }
        } else {
            if(!elem.paused) {
                elem.pause();
            }
        }
    } }, config, mainContainer, fonts);
    
    const sfx = new Switch({ label: "Sound Effects", id: "settings-sfx", variable: "settings-sfx", checked: true, listener: (value) => {
        const elem = document.getElementById("sfx");
        if(value) {
            if(elem.paused) {
                elem.play();
            }
        } else {
            if(!elem.paused) {
                elem.pause();
            }
        }
    } }, config, mainContainer, fonts);

    scaleSwitch(music);
    scaleSwitch(sfx);
    music.update();
    sfx.update();

    if (isPortrait) {
        music.container.y(textAnimation.container.y() + getSwitchHeight(textAnimation) + sectionGap);
        music.container.x(0);
        sfx.container.y(music.container.y() + getSwitchHeight(music) + sectionGap);
        sfx.container.x(0);
    } else {
        // On desktop, position audio section in left column with padding
        const columnPadding = 20;
        music.container.y(textAnimation.container.y() + getSwitchHeight(textAnimation) + sectionGap);
        music.container.x(columnPadding);
        sfx.container.y(music.container.y() + getSwitchHeight(music) + sectionGap);
        sfx.container.x(columnPadding);
        textAnimation.container.x(columnPadding);
    }

    const audioSectionHeight = sfx.container.y() + getSwitchHeight(sfx);
    const audioSectionEndY = sfx.container.y() + getSwitchHeight(sfx) + gap * 2;

    const accessibilitySectionLabel = new Konva.Text({
        x: isPortrait ? 0 : mainContainer.width() / 2,
        width: isPortrait ? mainContainer.width() : mainContainer.width() / 2,
        align: "center",
        y: isPortrait ? audioSectionEndY : audioSectionLabel.y(),
        text: "Accessibility",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(sectionTitleSize),
        fill: sectionTitleColor,
        fillAfterStrokeEnabled: true
    });

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

    scaleSwitch(highContrast);
    scaleSwitch(reduceMotion);
    highContrast.update();
    reduceMotion.update();

    highContrast.container.y(accessibilitySectionLabel.y() + accessibilitySectionLabel.height() + 8);
    reduceMotion.container.y(highContrast.container.y() + getSwitchHeight(highContrast) + sectionGap);
    
    if (isPortrait) {
        highContrast.container.x(0);
        reduceMotion.container.x(0);
    } else {
        // Position accessibility section in right column with padding
        const columnPadding = 20;
        highContrast.container.x(mainContainer.width() / 2 + columnPadding);
        reduceMotion.container.x(mainContainer.width() / 2 + columnPadding);
        
        // Create divider with height matching the max of both sections
        const a11yMaxHeight = reduceMotion.container.y() + getSwitchHeight(reduceMotion);
        const maxSectionHeight = Math.max(audioSectionHeight, a11yMaxHeight);
        divider = new Konva.Line({
            points: [mainContainer.width() / 2, 0, mainContainer.width() / 2, maxSectionHeight],
            stroke: config.colors["menu-border"],
            strokeWidth: 1,
            opacity: 0.5
        });
        mainContainer.add(divider);
    }

    const fontScaleLabel = new Konva.Text({
        width: mainContainer.width(),
        y: isPortrait ? (reduceMotion.container.y() + getSwitchHeight(reduceMotion) + gap * 2) : (audioSectionHeight + gap * 2),
        text: "Font Scale",
        align: "center",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(sectionTitleSize),
        fill: sectionTitleColor,
        fillAfterStrokeEnabled: true
    });

    const fontScaleGroup = new Konva.Group({
        y: fontScaleLabel.y() + fontScaleLabel.height() + 10,
        width: mainContainer.width(),
        height: 46
    });

    const currentScale = accessibility?.getSettings().fontScale ?? 1;

    const fontScaleValue = new Konva.Text({
        width: 120,
        height: 40,
        x: (fontScaleGroup.width() - 120) / 2,
        y: 0,
        align: "center",
        verticalAlign: "middle",
        text: `${Math.round(currentScale * 100)}%`,
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(valueTextSize),
        fill: sectionTextColor,
        fillAfterStrokeEnabled: true
    });

    function updateFontScaleText() {
        const value = accessibility?.getSettings().fontScale ?? 1;
        fontScaleValue.text(`${Math.round(value * 100)}%`);
        fontScaleGroup.getLayer()?.draw();
    }

    function triggerResizeRedraw() {
        if (typeof globalThis.dispatchEvent !== "function") {
            return;
        }

        if (typeof Event === "function") {
            globalThis.dispatchEvent(new Event("resize"));
            return;
        }

        if (typeof CustomEvent === "function") {
            globalThis.dispatchEvent(new CustomEvent("resize"));
        }
    }

    function createScaleButton(label, x, onClick) {
        const group = new Konva.Group({ x, y: 0, width: 56, height: 40 });
        const rect = new Konva.Rect({
            width: 56,
            height: 40,
            cornerRadius: 8,
            fill: config.colors.primary
        });
        const text = new Konva.Text({
            width: 56,
            height: 40,
            align: "center",
            verticalAlign: "middle",
            text: label,
            fontFamily: fonts["other"],
            fontSize: scaleFontSize(22),
            fill: config.colors["primary-text"],
            fillAfterStrokeEnabled: true
        });
        group.on("mouseover", () => {
            document.body.style.cursor = "pointer";
            rect.opacity(0.85);
            group.getLayer()?.draw();
        });
        group.on("mouseout", () => {
            document.body.style.cursor = "auto";
            rect.opacity(1);
            group.getLayer()?.draw();
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

    const decreaseBtn = createScaleButton("A-", fontScaleValue.x() - 70, () => {
        accessibility?.decreaseFontScale(0.1);
    });

    const increaseBtn = createScaleButton("A+", fontScaleValue.x() + fontScaleValue.width() + 14, () => {
        accessibility?.increaseFontScale(0.1);
    });

    fontScaleGroup.add(decreaseBtn, fontScaleValue, increaseBtn);

    mainContainer.add(fontScaleLabel, fontScaleGroup);

    // Language Selector
    const languageLabel = new Konva.Text({
        width: mainContainer.width(),
        y: fontScaleGroup.y() + fontScaleGroup.height() + gap * 2,
        text: "Language",
        align: "center",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(sectionTitleSize),
        fill: sectionTitleColor,
        fillAfterStrokeEnabled: true
    });
    mainContainer.add(languageLabel);

    const languageGroup = new Konva.Group({
        y: languageLabel.y() + languageLabel.height() + 10,
        width: mainContainer.width()
    });

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
        if (!code) {
            return "";
        }

        if (languageDisplayNames && typeof languageDisplayNames.of === "function") {
            const resolved = languageDisplayNames.of(code);
            if (typeof resolved === "string" && resolved.trim().length > 0) {
                return resolved;
            }
        }

        return String(code).toUpperCase();
    };

    const languages = configuredLanguages.length > 0
        ? configuredLanguages.map((code) => ({
            code,
            name: getLanguageLabel(code)
        }))
        : [{ code: "en", name: getLanguageLabel("en") }];
    const langColumns = isPortrait
        ? Math.max(1, Math.min(2, languages.length))
        : Math.max(1, Math.min(4, languages.length));
    const langRowGap = 10;
    const langColGap = 10;
    const langBtnWidth = (languageGroup.width() - langColGap * (langColumns - 1)) / langColumns;
    const langBtnHeight = isPortrait ? 42 : 40;

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
            fill: isSelected ? config.colors.primary : config.colors.menu,
            stroke: config.colors["menu-border"],
            strokeWidth: 2,
            cornerRadius: 10
        });

        const btnText = new Konva.Text({
            width: langBtnWidth,
            height: langBtnHeight,
            align: "center",
            verticalAlign: "middle",
            text: lang.name,
            fontFamily: fonts["other"],
            fontSize: scaleFontSize(isPortrait ? 16 : 14),
            fill: isSelected ? config.colors["primary-text"] : sectionTextColor,
            fillAfterStrokeEnabled: true
        });

        btnGroup.on("click touchstart", async () => {
            if (i18n) {
                await i18n.loadLanguage(lang.code);
                // Update button styles
                languages.forEach(l => {
                    const btn = languageGroup.findOne(`.lang-btn-${l.code}`);
                    if (btn) {
                        const rect = btn.findOne("Rect");
                        const text = btn.findOne("Text");
                        if (l.code === lang.code) {
                            rect.fill(config.colors.primary);
                            rect.stroke(config.colors.primary);
                            text.fill(config.colors["primary-text"]);
                        } else {
                            rect.fill(config.colors.menu);
                            rect.stroke(config.colors["menu-border"]);
                            text.fill(sectionTextColor);
                        }
                    }
                });
                languageGroup.getLayer().draw();
            }
        });

        btnGroup.on("mouseover", () => {
            document.body.style.cursor = "pointer";
            btnRect.opacity(0.8);
            btnGroup.getLayer().draw();
        });

        btnGroup.on("mouseout", () => {
            document.body.style.cursor = "auto";
            btnRect.opacity(1);
            btnGroup.getLayer().draw();
        });

        btnGroup.add(btnRect);
        btnGroup.add(btnText);
        languageGroup.add(btnGroup);
    });

    languageGroup.height(Math.ceil(languages.length / langColumns) * langBtnHeight + (Math.ceil(languages.length / langColumns) - 1) * langRowGap);

    mainContainer.add(languageGroup);

    const linksSectionLabel = new Konva.Text({
        width: mainContainer.width(),
        y: languageGroup.y() + languageGroup.height() + gap * 2,
        text: "Links",
        align: "center",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(sectionTitleSize),
        fill: sectionTitleColor,
        fillAfterStrokeEnabled: true
    });

    const btnny = linksSectionLabel.y() + linksSectionLabel.height() + 10;

    const btnimage = new Image();
    
    if(config.gui.button) {
        btnimage.src = config.gui.button;
    }


    // Use SVG icon URLs from config.json gui properties
    const btns = [ 
        { name: "Support", onclick: () => {
            window.open(config["support-url"], "_system");
        }, iconUrl: config.gui["settings-icon"] },
        { name: "Credits", onclick: () => {
            credit_details.render();
            openBar(actionbar.actionrect);
        }, iconUrl: config.gui["group-icon"] },
        { name: "About", onclick: () => {
            window.open(config["about-url"], "_system");
        }, iconUrl: config.gui["info-icon"] }
    ];

    const btny = btnny;

    const btns_holder = new Konva.Group({
        width: isPortrait ? (mainContainer.width() - 8) : Math.min(340, mainContainer.width() * 0.68),
        height: btns.length * (isPortrait ? 68 : (isAndroid ? 58 : 68)),
        x: (mainContainer.width() - (isPortrait ? (mainContainer.width() - 8) : Math.min(340, mainContainer.width() * 0.68))) / 2,
        y: btny
    });

    const btn_height = isPortrait ? 68 : (isAndroid ? 58 : 68);

    for (let i = 0; i < btns.length; i++) {
        const btn = btns[i];

        const btn_group = new Konva.Group({
            width: btns_holder.width(),
            height: (isPortrait ? 56 : (isAndroid ? 48 : 56)),
            y: i * btn_height,
            name: `link-btn-${btn.name}`
        });

        // Button background
        const btn_rect = new Konva.Rect({
            width: btn_group.width(),
            height: btn_group.height(),
            fill: config.colors.button ?? config.colors.primary,
            stroke: config.colors["menu-border"],
            strokeWidth: 2,
            cornerRadius: 16,
            shadowColor: config.colors.primary,
            shadowBlur: 0,
            shadowOffset: { x: 0, y: 2 },
            opacity: 0.98
        });

        btn_group.on("mouseover", () => {
            btn_rect.shadowColor(config.colors.secondary);
            document.body.style.cursor = "pointer";
            btn_group.getLayer()?.draw();
        });

        btn_group.on("mouseout", () => {
            // Force scale reset regardless of state
            btn_rect.shadowColor(config.colors.primary);
            document.body.style.cursor = "auto";
            btn_group.getLayer()?.draw();
        });

        // Icon
        let iconShape = null;
        if (btn.iconUrl) {
            const iconImg = new window.Image();
            iconImg.src = btn.iconUrl;
            iconShape = new Konva.Image({
                image: iconImg,
                x: 18,
                y: (btn_group.height() - 28) / 2,
                width: 28,
                height: 28,
                opacity: 0.92
            });
            // Redraw when loaded
            iconImg.onload = () => {
                btn_group.getLayer()?.draw();
            };
        }

        // Button text
        const btntext = new Konva.Text({
            align: "left",
            x: 54,
            width: btn_group.width() - 54,
            height: btn_group.height(),
            verticalAlign: "middle",
            text: btn.name,
            fontFamily: fonts["other"],
            fontSize: scaleFontSize(linkButtonTextSize + 2),
            fill: config.colors["button-text"],
            fillAfterStrokeEnabled: true,
            shadowColor: config.colors.menu,
            shadowBlur: 0
        });

        btn_group.on("click touchstart", () => {
            btntext.to({
                scaleX: 1.08,
                duration: 0.08,
                onFinish: () => {
                    btntext.to({
                        scaleX: 1,
                        duration: 0.08
                    });
                },
            });
            btn_rect.to({
                shadowBlur: 18,
                duration: 0.12,
                onFinish: () => {
                    btn_rect.to({
                        shadowBlur: 0,
                        duration: 0.12
                    });
                }
            });
            btn.onclick();
        });

        btn_group.add(btn_rect);
        if (iconShape) btn_group.add(iconShape);
        btn_group.add(btntext);

        btns_holder.add(btn_group);
    }

    const version_text = new Konva.Text({
        align: "center",
        padding: isPortrait ? 40 : 24,
        verticalAlign: "middle",
        width: mainContainer.width(),
        height: isPortrait ? 96 : (isAndroid ? 76 : 82),
        y: btny + btns_holder.height() + (isPortrait ? 0 : gap),
        text: `Version: ${config.version}`,
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(footerTextSize),
        fill: sectionTextColor,
        fillAfterStrokeEnabled: true,
        wrap: "word"
    });

    const copyright_text = new Konva.Text({
        align: "center",
        padding: isPortrait ? 24 : 18,
        verticalAlign: "middle",
        width: mainContainer.width(),
        y: version_text.y() + version_text.height() - (isPortrait ? 12 : 6),
        text: config.copyright,
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(footerTextSize),
        fill: sectionTextColor,
        fillAfterStrokeEnabled: true,
        lineHeight: 1.5,
        wrap: "word"
    });

    const label_text = new Konva.Text({
        align: "center",
        padding: isPortrait ? 24 : 18,
        verticalAlign: "middle",
        width: mainContainer.width(),
        y: copyright_text.y() + copyright_text.height() - (isPortrait ? 12 : 6),
        text: "Built with VN-Sutra",
        fontFamily: fonts["other"],
        fontSize: scaleFontSize(footerTextSize),
        fill: sectionTextColor,
        fillAfterStrokeEnabled: true,
        wrap: "word"
    });


    mainContainer.add(
        audioSectionLabel,
        textAnimation.container,
        music.container,
        sfx.container,
        accessibilitySectionLabel,
        highContrast.container,
        reduceMotion.container,
        linksSectionLabel,
        btns_holder,
        version_text,
        copyright_text
    );

    if(config.ui["vnsutra-label"]) {
        mainContainer.add(label_text);
    }

    let contentBottom = 0;
    mainContainer.getChildren().forEach((child) => {
        const childBottom = child.y() + child.height();
        if (childBottom > contentBottom) {
            contentBottom = childBottom;
        }
    });
    mainContainer.height(contentBottom + gap);

    textAnimation.update();
    music.update();
    sfx.update();
    highContrast.update();
    reduceMotion.update();

    function render() {
        setOpenWindow("settings");
        actionbar.clear();
        actionbar.title = "Settings";

        textAnimation.update();
        music.update();
        sfx.update();
        highContrast.update();
        reduceMotion.update();
        updateFontScaleText();

        // Reset any previously scrolled offset before re-binding the scrollbar.
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

    return ({
        container: mainContainer,
        render,
    });
}

export { settings };
export default settings;