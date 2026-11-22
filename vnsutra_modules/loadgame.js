import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
import AlertWindow from "./alert-window.js";
import autoSave from "./autosave.js";
import { storage } from "./storage.js";
import { konvaStage } from "./stage.js";
import { getIsPortrait, getIsAndroid, setOpenWindow, scaleFontSize } from "./runtime-state.js";
import { animateBtn, getMonth } from "./ui/utils.js";
import { bindActionbarScroll } from "./ui/scrollable-content.js";
import errorTracking from "./error-tracking.js";
import { mergeLoadEntries, toPersistedSaves } from "./save-utils.js";

const Konva = globalThis.Konva;

const ICONS = {
    bookmark: "M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z",
    clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    trash: "M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z",
    sparkle: "M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z",
    photo: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
};

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

function drawRoundedTopClip(ctx, width, height, radius = 16) {
    if (!ctx) return;
    const r = Math.min(radius, width / 2, height);
    if (typeof ctx.beginPath === "function") {
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(0, 0, width, height, [r, r, 0, 0]);
        } else if (typeof ctx.arcTo === "function") {
            ctx.moveTo(0, r);
            ctx.arcTo(0, 0, r, 0, r);
            ctx.lineTo(width - r, 0);
            ctx.arcTo(width, 0, width, r, r);
            ctx.lineTo(width, height);
            ctx.lineTo(0, height);
            ctx.closePath();
        } else {
            ctx.rect(0, 0, width, height);
            ctx.closePath();
        }
    }
}

async function loadgame(config, actionbar, title, fonts, remove_img, click = () => { }, add = false, addFunc = () => { }) {
    if (!Konva) {
        errorTracking?.captureError("Konva not available", {
            message: "[LoadGame] Konva not available",
            context: { scope: "loadgame" }
        });
        return null;
    }

    const isPortrait = getIsPortrait();
    const isAndroid = getIsAndroid();
    setOpenWindow("loadgame");
    const renderToken = Symbol("loadgame-render");
    actionbar.__loadgameRenderToken = renderToken;
    const isRenderActive = () => actionbar?.__loadgameRenderToken === renderToken;

    const safeBatchDraw = () => {
        if (!isRenderActive()) {
            return;
        }
        try {
            konvaStage?.batchDraw?.();
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[LoadGame] Safe batchDraw prevented render crash",
                context: { scope: "loadgame", action: "batchDraw" }
            });
        }
    };

    // Color tokens & fonts
    const primaryColor = config?.colors?.primary || "#B88AEF";
    const secondaryColor = config?.colors?.secondary || "#F2A9D5";
    const goldColor = config?.colors?.gold || "#F6C66B";
    const textColor = config?.colors?.text || "#F8F2FF";
    const subtextColor = config?.colors?.["timestamp-text"] || "#D8CCE8";
    const fontOther = fonts?.["other"]?.name || fonts?.["other"] || "Inter";
    const supportsHover = !isPortrait && !isAndroid;

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
            try { tw.destroy(); } catch { /* ignore */ }
        });
        activeTweens.clear();
    };

    actionbar.clear?.();
    actionbar.title = title;

    if (actionbar?.addBtn) {
        actionbar.addBtn.off?.("click touchstart");
        actionbar.addBtn.visible?.(false);
    }

    const actionContent = actionbar.actionContent;
    const shouldIgnoreActivation = () => performance.now() < (actionbar.__scrollSuppressTapUntil ?? 0);

    const { width: containerWidth, height: containerHeight } = actionContent.getAttrs();
    const padding = isPortrait ? 10 : 16;
    const gap = isPortrait ? 16 : 18;

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
        visible: true
    });

    // Load both autosave and regular saves
    let autosaveData = null;
    let data = null;
    try {
        autosaveData = await autoSave.load();
        if (!isRenderActive()) {
            return null;
        }
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "warning",
            message: "[LoadGame] Failed to load autosave",
            context: { scope: "loadgame", action: "loadAutosave" }
        });
    }

    try {
        data = await storage.getItem("saved-games");
        if (!isRenderActive()) {
            return null;
        }
    } catch (error) {
        errorTracking?.captureError(error, {
            message: "[LoadGame] Failed to read saved games",
            context: { scope: "loadgame", action: "readSavedGames" }
        });
    }

    const includeAutosave = !add;
    const hasSaves = (data && data.length > 0) || (includeAutosave && autosaveData);

    if (hasSaves || add) {
        const mergedData = mergeLoadEntries(data || [], autosaveData, { includeAutosave });

        const persistRegularSaves = async (gamesWithMeta) => {
            const regularSaves = toPersistedSaves(gamesWithMeta);
            await storage.setItem("saved-games", regularSaves);
        };

        // Confirmation modal elements
        let alertWin = null;
        let proceedBtn = null;
        if (typeof document !== "undefined") {
            const closeBtn = document.createElement("button");
            closeBtn.innerText = "Cancel";
            closeBtn.className = "btn btn-outline hover:bg-inherit";
            closeBtn.style.borderColor = "rgba(184, 138, 239, 0.45)";
            closeBtn.style.color = "#FFFFFF";
            closeBtn.onclick = () => {
                const win = document.getElementById("alert-win");
                if (win) win.classList.replace("flex", "hidden");
            };

            proceedBtn = document.createElement("button");
            proceedBtn.innerText = "Delete Record";
            proceedBtn.className = "btn hover:bg-inherit border-0";
            proceedBtn.style.backgroundColor = "#ef4444";
            proceedBtn.style.color = "#FFFFFF";

            alertWin = new AlertWindow("Are you sure you want to delete this saved record?", [closeBtn, proceedBtn], config);
            alertWin.color = "#ef4444";
        }

        const columns = isPortrait ? 1 : (mainContainer.width() < 680 ? 2 : 3);
        const cardWidth = (mainContainer.width() - (columns - 1) * gap) / columns;
        const aspectHeight = Math.round((cardWidth * 9) / 16);
        const timeBarHeight = isPortrait ? 44 : 40;
        const cardHeight = aspectHeight + timeBarHeight;

        const slotCards = [];
        let regularSaveCounter = 1;

        // In Save Game mode, create a prominent "Create New Save" slot card at the top
        if (add) {
            slotCards.push({
                isNewSlot: true
            });
        }

        mergedData.forEach((item) => {
            slotCards.push({
                isNewSlot: false,
                data: item
            });
        });

        slotCards.forEach((slot, slotIdx) => {
            const col = slotIdx % columns;
            const row = Math.floor(slotIdx / columns);
            const cardX = col * (cardWidth + gap);
            const cardY = row * (cardHeight + gap);

            const card = new Konva.Group({
                x: cardX,
                y: cardY,
                width: cardWidth,
                height: cardHeight,
                name: slot.isNewSlot ? "new-save-card" : `save-slot-${slot.data.id}`
            });

            if (slot.isNewSlot) {
                // ---------------------------------------------------------
                // "Create New Save" Card
                // ---------------------------------------------------------
                const newCardBg = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: cardWidth,
                    height: cardHeight,
                    cornerRadius: 16,
                    fill: "rgba(35, 26, 62, 0.65)",
                    stroke: "rgba(184, 138, 239, 0.45)",
                    strokeWidth: 1.5,
                    dash: [6, 4],
                    perfectDrawEnabled: false
                });

                const plusSize = isPortrait ? 44 : 40;
                const plusBoxSize = isPortrait ? 60 : 54;
                const plusBox = new Konva.Rect({
                    x: (cardWidth - plusBoxSize) / 2,
                    y: (aspectHeight - plusBoxSize) / 2 + 10,
                    width: plusBoxSize,
                    height: plusBoxSize,
                    cornerRadius: 16,
                    fill: "rgba(184, 138, 239, 0.20)",
                    stroke: primaryColor,
                    strokeWidth: 1.2,
                    perfectDrawEnabled: false
                });

                const plusIcon = createVectorIcon(
                    ICONS.plus,
                    (cardWidth - plusSize) / 2,
                    (aspectHeight - plusBoxSize) / 2 + 10 + (plusBoxSize - plusSize) / 2,
                    plusSize,
                    secondaryColor,
                    "+"
                );

                const newCardTitle = new Konva.Text({
                    x: 10,
                    y: plusBox.y() + plusBoxSize + 14,
                    width: cardWidth - 20,
                    align: "center",
                    text: "CREATE NEW SAVE",
                    fontFamily: fontOther,
                    fontSize: scaleFontSize(isPortrait ? 16 : 16),
                    fontStyle: "bold",
                    letterSpacing: 1.5,
                    fill: "#FFFFFF",
                    perfectDrawEnabled: false
                });

                const newCardSub = new Konva.Text({
                    x: 10,
                    y: newCardTitle.y() + 24,
                    width: cardWidth - 20,
                    align: "center",
                    text: "Record current snapshot",
                    fontFamily: fontOther,
                    fontSize: scaleFontSize(isPortrait ? 13 : 13),
                    fill: subtextColor,
                    perfectDrawEnabled: false
                });

                if (supportsHover) {
                    card.on("mouseover", () => {
                        if (typeof document !== "undefined") document.body.style.cursor = "pointer";
                        runTween(newCardBg, {
                            fill: "rgba(48, 36, 80, 0.85)",
                            stroke: secondaryColor,
                            duration: 0.15
                        });
                        runTween(plusBox, {
                            fill: "rgba(242, 169, 213, 0.35)",
                            stroke: secondaryColor,
                            duration: 0.15
                        });
                    });

                    card.on("mouseout", () => {
                        if (typeof document !== "undefined") document.body.style.cursor = "auto";
                        runTween(newCardBg, {
                            fill: "rgba(35, 26, 62, 0.65)",
                            stroke: "rgba(184, 138, 239, 0.45)",
                            duration: 0.15
                        });
                        runTween(plusBox, {
                            fill: "rgba(184, 138, 239, 0.20)",
                            stroke: primaryColor,
                            duration: 0.15
                        });
                    });
                }

                card.on("click tap", () => {
                    if (shouldIgnoreActivation()) return;
                    animateBtn(card);
                    addFunc();
                });

                card.add(newCardBg, plusBox, plusIcon, newCardTitle, newCardSub);
                mainContainer.add(card);
                return;
            }

            // -------------------------------------------------------------
            // Standard / Autosave Slot Card
            // -------------------------------------------------------------
            const element = slot.data;
            const isAuto = Boolean(element.isAutosave);
            const slotNumber = isAuto ? null : regularSaveCounter++;

            const cardBg = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                cornerRadius: 16,
                fill: "rgba(25, 20, 48, 0.90)",
                stroke: isAuto ? "rgba(246, 198, 107, 0.45)" : "rgba(184, 138, 239, 0.35)",
                strokeWidth: 1.2,
                perfectDrawEnabled: false
            });

            // Card border outline (rendered on top of image and timebg to guarantee clean 16px corner framing)
            const cardBorder = new Konva.Rect({
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                cornerRadius: 16,
                stroke: isAuto ? "rgba(246, 198, 107, 0.45)" : "rgba(184, 138, 239, 0.35)",
                strokeWidth: 1.2,
                listening: false,
                perfectDrawEnabled: false
            });

            const topGlowLine = new Konva.Rect({
                x: 20,
                y: 0,
                width: cardWidth - 40,
                height: 1.2,
                fill: isAuto ? "rgba(246, 198, 107, 0.55)" : "rgba(242, 169, 213, 0.45)",
                perfectDrawEnabled: false
            });

            // Thumbnail presentation
            let imageNode = null;
            if (element.src) {
                const img = new Image();
                img.src = element.src;

                const imgGroup = new Konva.Group({
                    x: 0,
                    y: 0,
                    width: cardWidth,
                    height: aspectHeight,
                    clipFunc: (ctx) => {
                        drawRoundedTopClip(ctx, cardWidth, aspectHeight, 16);
                    }
                });

                const rawImgNode = new Konva.Image({
                    x: 0,
                    y: 0,
                    width: cardWidth,
                    height: aspectHeight,
                    image: img,
                    perfectDrawEnabled: false
                });

                img.onload = () => {
                    const iw = img.naturalWidth || img.width;
                    const ih = img.naturalHeight || img.height;
                    if (iw && ih && rawImgNode) {
                        // Use cover scaling so the thumbnail completely fills the slot card
                        const ratio = Math.max(cardWidth / iw, aspectHeight / ih);
                        const newW = iw * ratio;
                        const newH = ih * ratio;
                        rawImgNode.width(newW);
                        rawImgNode.height(newH);
                        rawImgNode.x((cardWidth - newW) / 2);
                        rawImgNode.y((aspectHeight - newH) / 2);
                        safeBatchDraw();
                    }
                };

                imgGroup.add(rawImgNode);
                imageNode = imgGroup;
            } else {
                // Placeholder when image is missing
                const placeholderGroup = new Konva.Group({
                    x: 0,
                    y: 0,
                    width: cardWidth,
                    height: aspectHeight,
                    clipFunc: (ctx) => {
                        drawRoundedTopClip(ctx, cardWidth, aspectHeight, 16);
                    }
                });

                const placeholderBg = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: cardWidth,
                    height: aspectHeight,
                    cornerRadius: [16, 16, 0, 0],
                    fill: "rgba(20, 16, 36, 0.85)",
                    perfectDrawEnabled: false
                });

                const photoIcon = createVectorIcon(
                    ICONS.photo,
                    (cardWidth - 32) / 2,
                    (aspectHeight - 44) / 2,
                    32,
                    "rgba(184, 138, 239, 0.40)",
                    "🖼"
                );

                const placeholderText = new Konva.Text({
                    x: 10,
                    y: (aspectHeight - 44) / 2 + 36,
                    width: cardWidth - 20,
                    align: "center",
                    text: "SCENE SNAPSHOT",
                    fontFamily: fontOther,
                    fontSize: scaleFontSize(isPortrait ? 13 : 12),
                    fontStyle: "bold",
                    letterSpacing: 1.5,
                    fill: "rgba(184, 138, 239, 0.50)",
                    perfectDrawEnabled: false
                });

                placeholderGroup.add(placeholderBg, photoIcon, placeholderText);
                imageNode = placeholderGroup;
            }

            // Top Badges Row (Opaque high-contrast backing + drop shadow ensures visibility on ANY scene image)
            const badgeLabel = isAuto ? "✦ AUTO SAVE" : `✦ SAVE ${String(slotNumber).padStart(2, "0")}`;
            const badgeMeasure = new Konva.Text({
                text: badgeLabel,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 13 : 13),
                fontStyle: "bold",
                letterSpacing: 1.2
            });
            const badgeWidth = Math.max(isPortrait ? 96 : 104, Math.ceil(badgeMeasure.width()) + 20);
            const badgeHeight = isPortrait ? 26 : 26;

            const badgeBox = new Konva.Rect({
                x: 10,
                y: 10,
                width: badgeWidth,
                height: badgeHeight,
                cornerRadius: 8,
                fill: isAuto ? "rgba(28, 19, 10, 0.95)" : "rgba(20, 15, 36, 0.92)",
                stroke: isAuto ? goldColor : primaryColor,
                strokeWidth: isAuto ? 1.5 : 1.2,
                shadowColor: "rgba(0, 0, 0, 0.75)",
                shadowBlur: 8,
                shadowOffsetY: 2,
                shadowOpacity: 0.85,
                perfectDrawEnabled: false
            });

            const badgeText = new Konva.Text({
                x: 10,
                y: 10,
                width: badgeWidth,
                height: badgeHeight,
                align: "center",
                verticalAlign: "middle",
                text: badgeLabel,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 13 : 13),
                fontStyle: "bold",
                letterSpacing: 1.2,
                fill: isAuto ? "#FCD34D" : "#FFFFFF",
                shadowColor: isAuto ? "rgba(0, 0, 0, 0.85)" : "rgba(0, 0, 0, 0.50)",
                shadowBlur: 3,
                shadowOffsetY: 1,
                perfectDrawEnabled: false
            });

            // Bottom Frosted Glass Bar
            const timebg = new Konva.Rect({
                x: 0,
                y: aspectHeight,
                width: cardWidth,
                height: timeBarHeight,
                fill: "rgba(23, 18, 42, 0.95)",
                cornerRadius: [0, 0, 16, 16],
                perfectDrawEnabled: false
            });

            const timeDivider = new Konva.Rect({
                x: 0,
                y: aspectHeight,
                width: cardWidth,
                height: 1,
                fill: "rgba(184, 138, 239, 0.22)",
                perfectDrawEnabled: false
            });

            // Date / Time formatting
            const date = new Date(element.timestamp ?? 0);
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const formattedDate = `${date.getDate()} ${getMonth(date.getMonth())} ${date.getFullYear()} • ${hours}:${minutes}`;

            const clockIconSize = 14;
            const clockIcon = createVectorIcon(
                ICONS.clock,
                12,
                aspectHeight + (timeBarHeight - clockIconSize) / 2,
                clockIconSize,
                isAuto ? goldColor : primaryColor,
                "⏱"
            );

            const deleteBtnSize = 28;
            const deleteBtnX = cardWidth - deleteBtnSize - 10;
            const deleteBtnY = aspectHeight + (timeBarHeight - deleteBtnSize) / 2;

            const timestampText = new Konva.Text({
                x: 32,
                y: aspectHeight,
                width: isAuto ? (cardWidth - 44) : (cardWidth - 44 - deleteBtnSize - 8),
                height: timeBarHeight,
                verticalAlign: "middle",
                align: "left",
                text: formattedDate,
                fontFamily: fontOther,
                fontSize: scaleFontSize(isPortrait ? 15 : 15),
                fontStyle: "bold",
                letterSpacing: 0.5,
                fill: "#F8F2FF",
                perfectDrawEnabled: false
            });

            // Delete Button (Regular Saves only)
            let deleteBtnGroup = null;
            if (!isAuto) {
                deleteBtnGroup = new Konva.Group({
                    x: deleteBtnX,
                    y: deleteBtnY,
                    width: deleteBtnSize,
                    height: deleteBtnSize,
                    name: `delete-btn-${element.id}`
                });

                const deleteBtnBg = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: deleteBtnSize,
                    height: deleteBtnSize,
                    cornerRadius: 8,
                    fill: "rgba(255, 255, 255, 0.05)",
                    stroke: "rgba(184, 138, 239, 0.30)",
                    strokeWidth: 1,
                    perfectDrawEnabled: false
                });

                const deleteIconNode = createVectorIcon(
                    ICONS.trash,
                    6,
                    6,
                    16,
                    "#ff5555",
                    "🗑"
                );

                deleteBtnGroup.add(deleteBtnBg, deleteIconNode);

                if (supportsHover) {
                    deleteBtnGroup.on("mouseover", (e) => {
                        e.cancelBubble = true;
                        if (typeof document !== "undefined") document.body.style.cursor = "pointer";
                        runTween(deleteBtnBg, {
                            fill: "rgba(239, 68, 68, 0.35)",
                            stroke: "rgba(239, 68, 68, 0.85)",
                            duration: 0.15
                        });
                        runTween(deleteIconNode, {
                            fill: "#ffffff",
                            duration: 0.15
                        });
                    });

                    deleteBtnGroup.on("mouseout", (e) => {
                        e.cancelBubble = true;
                        if (typeof document !== "undefined") document.body.style.cursor = "auto";
                        runTween(deleteBtnBg, {
                            fill: "rgba(255, 255, 255, 0.05)",
                            stroke: "rgba(184, 138, 239, 0.30)",
                            duration: 0.15
                        });
                        runTween(deleteIconNode, {
                            fill: "#ff5555",
                            duration: 0.15
                        });
                    });
                }

                deleteBtnGroup.on("click tap", (e) => {
                    e.cancelBubble = true;
                    if (shouldIgnoreActivation()) return;

                    animateBtn(deleteBtnGroup, () => {
                        if (alertWin && proceedBtn) {
                            proceedBtn.onclick = () => {
                                const originalDataIndex = (data || []).findIndex(s => s.id === element.id);
                                if (originalDataIndex >= 0) {
                                    data.splice(originalDataIndex, 1);
                                    persistRegularSaves(data).then(() => {
                                        loadgame(config, actionbar, title, fonts, remove_img, click, add, addFunc);
                                    }).catch((error) => {
                                        errorTracking?.captureError(error, {
                                            message: "[LoadGame] Failed to delete save",
                                            context: { scope: "loadgame", action: "deleteSave" }
                                        });
                                    });
                                }
                                alertWin.close();
                            };
                            alertWin.show();
                        }
                    });
                });
            }

            // Click handling for the card
            if (supportsHover) {
                card.on("mouseover", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
                    runTween(cardBg, {
                        fill: "rgba(42, 34, 76, 0.95)",
                        stroke: isAuto ? goldColor : secondaryColor,
                        shadowBlur: 20,
                        duration: 0.15
                    });
                    runTween(cardBorder, {
                        stroke: isAuto ? goldColor : secondaryColor,
                        strokeWidth: 1.8,
                        duration: 0.15
                    });
                });

                card.on("mouseout", () => {
                    if (typeof document !== "undefined") document.body.style.cursor = "auto";
                    runTween(cardBg, {
                        fill: "rgba(25, 20, 48, 0.90)",
                        stroke: isAuto ? "rgba(246, 198, 107, 0.45)" : "rgba(184, 138, 239, 0.35)",
                        shadowBlur: 0,
                        duration: 0.15
                    });
                    runTween(cardBorder, {
                        stroke: isAuto ? "rgba(246, 198, 107, 0.45)" : "rgba(184, 138, 239, 0.35)",
                        strokeWidth: 1.2,
                        duration: 0.15
                    });
                });
            }

            card.on("click tap", () => {
                if (shouldIgnoreActivation()) {
                    return;
                }
                if (!add) {
                    actionbar.close();
                }
                click(element, card);
            });

            card.add(
                cardBg,
                imageNode,
                timebg,
                timeDivider,
                topGlowLine,
                clockIcon,
                timestampText,
                cardBorder,
                badgeBox,
                badgeText
            );

            if (deleteBtnGroup) {
                card.add(deleteBtnGroup);
            }

            // Ensure background remains at base
            cardBg.moveToBottom();
            topGlowLine.moveUp();

            mainContainer.add(card);
        });
    } else {
        // -----------------------------------------------------------------
        // Empty State: No Saved Chronicles Found
        // -----------------------------------------------------------------
        const emptyCard = new Konva.Group({
            x: 0,
            y: 30,
            width: mainContainer.width(),
            height: 180
        });

        const emptyCardBg = new Konva.Rect({
            x: 0,
            y: 0,
            width: mainContainer.width(),
            height: 180,
            cornerRadius: 18,
            fill: "rgba(35, 26, 62, 0.70)",
            stroke: "rgba(184, 138, 239, 0.35)",
            strokeWidth: 1.2,
            perfectDrawEnabled: false
        });

        const emptyIcon = createVectorIcon(
            ICONS.bookmark,
            (mainContainer.width() - 44) / 2,
            26,
            44,
            "rgba(184, 138, 239, 0.50)",
            "✦"
        );

        const emptyTitle = new Konva.Text({
            x: 20,
            y: 84,
            width: mainContainer.width() - 40,
            align: "center",
            text: "No Saved Chronicles Found",
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 18 : 20),
            fontStyle: "bold",
            letterSpacing: 1,
            fill: "#FFFFFF",
            perfectDrawEnabled: false
        });

        const emptySub = new Konva.Text({
            x: 20,
            y: 122,
            width: mainContainer.width() - 40,
            align: "center",
            text: "Save your story progress to bookmark memories and resume your journey anytime.",
            fontFamily: fontOther,
            fontSize: scaleFontSize(isPortrait ? 13 : 14),
            fill: subtextColor,
            perfectDrawEnabled: false
        });

        emptyCard.add(emptyCardBg, emptyIcon, emptyTitle, emptySub);
        mainContainer.add(emptyCard);
    }

    let contentBottom = 0;
    mainContainer.getChildren().forEach((child) => {
        const childBottom = child.y() + child.height();
        if (childBottom > contentBottom) {
            contentBottom = childBottom;
        }
    });
    mainContainer.height(Math.max(1, contentBottom + 20));

    if (!isRenderActive()) {
        return null;
    }

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

export { loadgame };
export default loadgame;
