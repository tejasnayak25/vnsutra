import "./konva.js";
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

async function loadgame(config, actionbar, title, fonts, remove_img, click = () => {}, add = false, addFunc = () => {}) {
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

    actionbar.clear();
    actionbar.title = title;

    actionbar.addBtn.off("click touchstart");
    actionbar.addBtn.visible(add);

    if(add) {
        actionbar.addBtn.on("click touchstart", () => {
            animateBtn(actionbar.addBtn);
            addFunc();
        });
    } else {
        actionbar.addBtn.off("click touchstart");
    }

    const actionContent = actionbar.actionContent;
    const shouldIgnoreActivation = () => performance.now() < (actionbar.__scrollSuppressTapUntil ?? 0);

    const { width: containerWidth, height: containerHeight } = actionContent.getAttrs();

    const padding = 10, gap = 20;
    const timestampFontSize = scaleFontSize(15);
    const emptyMessageFontSize = scaleFontSize(isPortrait ? 23 : (isAndroid ? 20 : 23));

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

    let i = 0, imgHeight = 0;

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

    if((data && data.length > 0) || (includeAutosave && autosaveData)) {
        data = mergeLoadEntries(data, autosaveData, { includeAutosave });
        i = data.length;

        const persistRegularSaves = async (gamesWithMeta) => {
            const regularSaves = toPersistedSaves(gamesWithMeta);
            await storage.setItem("saved-games", regularSaves);
        };

        let currentIndex = 0, j=0;

        const closeBtn = document.createElement("button");
        closeBtn.innerText = "Close";
        closeBtn.className = "btn btn-outline hover:bg-inherit";
        closeBtn.style.borderColor = config.colors.text;
        closeBtn.style.color = config.colors.text;
        closeBtn.onclick = () => {
            document.getElementById("alert-win").classList.replace("flex", "hidden");
        };
    
        const proceedBtn = document.createElement("button");
        proceedBtn.innerText = "Proceed";
        proceedBtn.className = "btn hover:bg-inherit border-0";
        proceedBtn.style.backgroundColor = config.colors.primary;
        proceedBtn.style.color = config.colors["primary-text"];
    
        const alertWin = new AlertWindow("Are you sure you want to delete this?", [ closeBtn, proceedBtn ], config);
        alertWin.color = config.colors.primary;

        if(isPortrait) {
            const imgWidth = mainContainer.width();
            imgHeight = (konvaStage.height() * imgWidth) / konvaStage.width();

            for (let i = 0; i < data.length; i++) {
                const element = data[i];
            
                const img = new Image();
                img.src = element.src;
    
                // Container area (black background) to enforce uniform aspect ratio
                const containerX = 0;
                const containerY = i*(imgHeight + gap);
                const container = new Konva.Rect({
                    x: containerX,
                    y: containerY,
                    width: imgWidth,
                    height: imgHeight,
                    fill: element.src ? "black" : config.colors.menu,
                    opacity: element.src ? 1 : 0.5
                });

                let imageNode = null;
                if (element.src) {
                    // create image node and scale it to 'contain' within container
                    img.onload = () => {
                        const iw = img.naturalWidth || img.width;
                        const ih = img.naturalHeight || img.height;
                        if (iw && ih) {
                            const ratio = Math.min(imgWidth / iw, imgHeight / ih);
                            const newW = iw * ratio;
                            const newH = ih * ratio;
                            const offsetX = containerX + (imgWidth - newW) / 2;
                            const offsetY = containerY + (imgHeight - newH) / 2;
                            if (imageNode) {
                                imageNode.width(newW);
                                imageNode.height(newH);
                                imageNode.x(offsetX);
                                imageNode.y(offsetY);
                                safeBatchDraw();
                            }
                        }
                    };

                    imageNode = new Konva.Image({
                        x: containerX,
                        y: containerY,
                        width: 0,
                        height: 0,
                        image: img
                    });
                } else {
                    // autosave placeholder - keep as a single rect
                    imageNode = container;
                }

                // click handler uses the displayed image or placeholder
                const clickTarget = imageNode || container;
                clickTarget.on("mouseover", () => {
                    document.body.style.cursor = "pointer";
                });
                clickTarget.on("mouseout", () => {
                    document.body.style.cursor = "auto";
                });
                clickTarget.on("click tap", () => {
                    if (shouldIgnoreActivation()) {
                        return;
                    }

                    actionbar.close();
                    click(element, clickTarget);
                });

                const timebg = new Konva.Rect({
                    width: imgWidth,
                    height: isPortrait ? 40 : 30,
                    y: i*(imgHeight + gap) - (isPortrait ? 40 : 30) + imgHeight,
                    fill: "black",
                    opacity: 0.7
                });

                const date = new Date(element.timestamp ?? 0);
                let time = `${date.getDate()} ${getMonth(date.getMonth())}, ${date.getFullYear()}`;
                if (element.isAutosave) {
                    time = "Auto Save";
                }

                const timestamp = new Konva.Text({
                    align: "center",
                    padding: 30,
                    verticalAlign: "middle",
                    width: imgWidth,
                    height: isPortrait ? 40 : 30,
                    y: i*(imgHeight + gap) - (isPortrait ? 40 : 30) + imgHeight,
                    text: time,
                    fontFamily: fonts["other"],
                    fontSize: timestampFontSize,
                    fill: config.colors["timestamp-text"],
                    fillAfterStrokeEnabled: true,
                    wrap: "none",
                    opacity: 0.7
                });

                const deletePadding = 5;

                const deleteBtn = new Konva.Image({
                    width: timestamp.height() - 2*deletePadding,
                    height: timestamp.height() - 2*deletePadding,
                    image: remove_img.cloneNode(true),
                    x: imgWidth - timestamp.height() - deletePadding,
                    y: timestamp.y() + deletePadding,
                    visible: !element.isAutosave // Hide delete button for autosave
                });

                deleteBtn.on("mouseover", () => {
                    document.body.style.cursor = "pointer";
                });
            
                deleteBtn.on("mouseout", () => {
                    document.body.style.cursor = "auto";
                });

                deleteBtn.on("click tap", () => {
                    if (shouldIgnoreActivation()) {
                        return;
                    }

                    animateBtn(deleteBtn, () => {
                        proceedBtn.onclick = () => {
                            data.splice(i, 1);
                            // Only update saved-games, not autosave
                            persistRegularSaves(data).then(() => {
                                loadgame(config, actionbar, title, fonts, remove_img, click, add, addFunc);
                            }).catch((error) => {
                                errorTracking?.captureError(error, {
                                    message: "[LoadGame] Failed to delete save",
                                    context: { scope: "loadgame", action: "deleteSave" }
                                });
                            });
                            
                            alertWin.close();
                        };
                        alertWin.show();
                    });
                });
    
                // Add background container first, then image (if distinct), then overlays
                if (imageNode === container) {
                    mainContainer.add(container, timebg, timestamp, deleteBtn);
                } else {
                    mainContainer.add(container, imageNode, timebg, timestamp, deleteBtn);
                }
            }
        } else {
            const imgWidth = (mainContainer.width() - 2*gap)/3;
            imgHeight = (9 * imgWidth) / 16;
        
            while (currentIndex < i) {
                const block = new Konva.Group({
                    width: mainContainer.width(),
                    height: imgHeight + gap,
                    y: j*(imgHeight + gap)
                });
    
                for (let k = 0; k < 3; k++) {
                    if (currentIndex < i) {
                        const element = data[currentIndex++];
                        const img = new Image();
                        img.src = element.src;

                        const containerX = k*(imgWidth + gap);
                        const containerY = 0;
                        const container = new Konva.Rect({
                            x: containerX,
                            y: containerY,
                            width: imgWidth,
                            height: imgHeight,
                            fill: element.src ? "black" : config.colors.menu,
                            opacity: element.src ? 1 : 0.5
                        });

                        let imageNode = null;
                        if (element.src) {
                            img.onload = () => {
                                const iw = img.naturalWidth || img.width;
                                const ih = img.naturalHeight || img.height;
                                if (iw && ih) {
                                    const ratio = Math.min(imgWidth / iw, imgHeight / ih);
                                    const newW = iw * ratio;
                                    const newH = ih * ratio;
                                    const offsetX = containerX + (imgWidth - newW) / 2;
                                    const offsetY = containerY + (imgHeight - newH) / 2;
                                    if (imageNode) {
                                        imageNode.width(newW);
                                        imageNode.height(newH);
                                        imageNode.x(offsetX);
                                        imageNode.y(offsetY);
                                        safeBatchDraw();
                                    }
                                }
                            };

                            imageNode = new Konva.Image({
                                x: containerX,
                                y: containerY,
                                width: 0,
                                height: 0,
                                image: img
                            });
                        } else {
                            imageNode = container;
                        }

                        const clickTarget = imageNode || container;
                        clickTarget.on("mouseover", () => {
                            document.body.style.cursor = "pointer";
                        });
                        clickTarget.on("mouseout", () => {
                            document.body.style.cursor = "auto";
                        });
                        clickTarget.on("click tap", () => {
                            if (shouldIgnoreActivation()) {
                                return;
                            }

                            actionbar.close();
                            click(element, clickTarget);
                        });

                        const timebg = new Konva.Rect({
                            width: imgWidth,
                            height: isPortrait ? 40 : 30,
                            x: k*(imgWidth + gap),
                            y: imgHeight - (isPortrait ? 40 : 30),
                            fill: "black",
                            opacity: 0.7
                        });

                        const date = new Date(element.timestamp ?? 0);
                        let time = `${date.getDate()} ${getMonth(date.getMonth())}, ${date.getFullYear()}`;
                        if (element.isAutosave) {
                            time = "Auto Save";
                        }

                        const timestamp = new Konva.Text({
                            align: "center",
                            padding: isPortrait ? 30 : 30,
                            verticalAlign: "middle",
                            width: imgWidth,
                            height: isPortrait ? 40 : 30,
                            x: k*(imgWidth + gap),
                            y: imgHeight - (isPortrait ? 40 : 30),
                            text: time,
                            fontFamily: fonts["other"],
                            fontSize: timestampFontSize,
                            fill: config.colors["timestamp-text"],
                            fillAfterStrokeEnabled: true,
                            wrap: "none",
                            opacity: 0.7
                        });

                        const deletePadding = 4;

                        const deleteBtn = new Konva.Image({
                            width: timestamp.height() - 2*deletePadding,
                            height: timestamp.height() - 2*deletePadding,
                            image: remove_img.cloneNode(true),
                            x: timestamp.x() + imgWidth - timestamp.height() - deletePadding,
                            y: timestamp.y() + deletePadding,
                            visible: !element.isAutosave // Hide delete button for autosave
                        });

                        deleteBtn.on("mouseover", () => {
                            document.body.style.cursor = "pointer";
                        });
                    
                        deleteBtn.on("mouseout", () => {
                            document.body.style.cursor = "auto";
                        });

                        const index = currentIndex - 1;

                        deleteBtn.on("click tap", () => {
                            if (shouldIgnoreActivation()) {
                                return;
                            }

                            animateBtn(deleteBtn, () => {
                                proceedBtn.onclick = () => {
                                    data.splice(index, 1);
                                    persistRegularSaves(data).then(() => {
                                        loadgame(config, actionbar, title, fonts, remove_img, click, add, addFunc);
                                    }).catch((error) => {
                                        errorTracking?.captureError(error, {
                                            message: "[LoadGame] Failed to delete save",
                                            context: { scope: "loadgame", action: "deleteSave" }
                                        });
                                    });

                                    alertWin.close();
                                };
                                alertWin.show();
                            });
                        });
            
                        // Add background container first, then image (if distinct), then overlays
                        if (imageNode === container) {
                            block.add(container, timebg, timestamp, deleteBtn);
                        } else {
                            block.add(container, imageNode, timebg, timestamp, deleteBtn);
                        }
                    } else {
                        break;
                    }
                }
    
                mainContainer.add(block);
                j++;
            }
        }
    } else {
        const message_text = new Konva.Text({
            align: "center",
            padding: 0,
            verticalAlign: "middle",
            width: mainContainer.width(),
            height: mainContainer.height() - actionbar.actionbar_title.height(),
            text: "Nothing Here!",
            fontFamily: fonts["other"],
            fontSize: emptyMessageFontSize,
            fill: config.colors.text,
            opacity: 0.7,
            fillAfterStrokeEnabled: true,
            wrap: "none"
        });

        mainContainer.add(message_text);
    }

    let contentBottom = 0;
    mainContainer.getChildren().forEach((child) => {
        const childBottom = child.y() + child.height();
        if (childBottom > contentBottom) {
            contentBottom = childBottom;
        }
    });
    mainContainer.height(Math.max(1, contentBottom));

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