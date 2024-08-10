async function loadgame(config, actionbar, title, fonts, remove_img, click = (details, image) => {}, add = false, addFunc = () => {}) {
    actionbar.clear();
    actionbar.title = title;

    actionbar.addBtn.visible(add);

    if(add) {
        actionbar.addBtn.on("click touchstart", () => {
            animateBtn(actionbar.addBtn);
            addFunc();
        });
    } else {
        actionbar.addBtn.off("click touchstart");
    }

    let actionContent = actionbar.actionContent;

    let { width: containerWidth, height: containerHeight } = actionContent.getAttrs();

    let padding = 10, gap = 20;

    let mainContainer = new Konva.Group({
        x: padding,
        width: containerWidth - 2 * padding,
        height: containerHeight
    });

    let i = 0, imgHeight = 0;

    let data = await dataStore.getItem("saved-games");
    if(data && data.length > 0) {
        i = data.length;

        let currentIndex = 0, j=0;

        let closeBtn = document.createElement("button");
        closeBtn.innerText = "Close";
        closeBtn.className = "btn btn-outline hover:bg-inherit";
        closeBtn.style.borderColor = config.colors.text;
        closeBtn.style.color = config.colors.text;
        closeBtn.onclick = () => {
            document.getElementById("alert-win").classList.replace("flex", "hidden");
        }
    
        let proceedBtn = document.createElement("button");
        proceedBtn.innerText = "Proceed";
        proceedBtn.className = "btn hover:bg-inherit border-0";
        proceedBtn.style.backgroundColor = config.colors.primary;
        proceedBtn.style.color = config.colors['primary-text'];
    
        let alertWin = new AlertWindow("Are you sure you want to delete this?", [ closeBtn, proceedBtn ], config);
        alertWin.color = config.colors.primary;

        if(isMobile) {
            let imgWidth = mainContainer.width();
            imgHeight = (konvaStage.height() * imgWidth) / konvaStage.width();

            for (let i = 0; i < data.length; i++) {
                const element = data[i];
            
                let img = new Image();
                img.src = element.src;
    
                let image = new Konva.Image({
                    width: imgWidth,
                    height: imgHeight,
                    y: i*(imgHeight + gap),
                    image: img
                });

                image.on("click touchstart", () => {
                    click(element, image);
                });

                let timebg = new Konva.Rect({
                    width: imgWidth,
                    height: isMobile ? 40 : 30,
                    y: i*(imgHeight + gap) - (isMobile ? 40 : 30) + imgHeight,
                    fill: "black",
                    opacity: 0.7
                });

                let date = new Date(element.timestamp ?? 0);
                let time = `${date.getDate()} ${getMonth(date.getMonth())}, ${date.getFullYear()}`;

                let timestamp = new Konva.Text({
                    align: "center",
                    padding: 30,
                    verticalAlign: "middle",
                    width: imgWidth,
                    height: isMobile ? 40 : 30,
                    y: i*(imgHeight + gap) - (isMobile ? 40 : 30) + imgHeight,
                    text: time,
                    fontFamily: fonts['other'],
                    fontSize: 15,
                    fill: config.colors['timestamp-text'],
                    fillAfterStrokeEnabled: true,
                    wrap: "none",
                    opacity: 0.7
                });

                let deletePadding = 5;

                let deleteBtn = new Konva.Image({
                    width: timestamp.height() - 2*deletePadding,
                    height: timestamp.height() - 2*deletePadding,
                    image: remove_img.cloneNode(true),
                    x: imgWidth - timestamp.height() - deletePadding,
                    y: timestamp.y() + deletePadding
                });

                deleteBtn.on("mouseover", () => {
                    document.body.style.cursor = "pointer";
                });
            
                deleteBtn.on("mouseout", () => {
                    document.body.style.cursor = "auto";
                });

                deleteBtn.on("click touchstart", () => {
                    animateBtn(deleteBtn, () => {
                        proceedBtn.onclick = () => {
                            data.splice(i, 1);
                            dataStore.setItem("saved-games", data).then(() => {
                                loadgame(config, actionbar, title, fonts, remove_img, click, add, addFunc);
                            });
                            
                            alertWin.close();
                        }
                        alertWin.show();
                    });
                });
    
                mainContainer.add(image, timebg, timestamp, deleteBtn);
            }
        } else {
            let imgWidth = (mainContainer.width() - 2*gap)/3;
            imgHeight = (9 * imgWidth) / 16;
        
            while (currentIndex < i) {
                let block = new Konva.Group({
                    width: mainContainer.width(),
                    height: imgHeight + gap,
                    y: j*(imgHeight + gap)
                });
    
                for (let k = 0; k < 3; k++) {
                    if (currentIndex < i) {
                        const element = data[currentIndex++];
                        let img = new Image();
                        img.src = element.src;
            
                        let image = new Konva.Image({
                            width: imgWidth,
                            height: imgHeight,
                            x: k*(imgWidth + gap),
                            image: img
                        });

                        image.on("click touchstart", () => {
                            click(element, image);
                        });

                        let timebg = new Konva.Rect({
                            width: imgWidth,
                            height: isMobile ? 40 : 30,
                            x: k*(imgWidth + gap),
                            y: imgHeight - (isMobile ? 40 : 30),
                            fill: "black",
                            opacity: 0.7
                        });

                        let date = new Date(element.timestamp ?? 0);
                        let time = `${date.getDate()} ${getMonth(date.getMonth())}, ${date.getFullYear()}`;

                        let timestamp = new Konva.Text({
                            align: "center",
                            padding: isMobile ? 30 : 30,
                            verticalAlign: "middle",
                            width: imgWidth,
                            height: isMobile ? 40 : 30,
                            x: k*(imgWidth + gap),
                            y: imgHeight - (isMobile ? 40 : 30),
                            text: time,
                            fontFamily: fonts['other'],
                            fontSize: 15,
                            fill: config.colors['timestamp-text'],
                            fillAfterStrokeEnabled: true,
                            wrap: "none",
                            opacity: 0.7
                        });

                        let deletePadding = 4;

                        let deleteBtn = new Konva.Image({
                            width: timestamp.height() - 2*deletePadding,
                            height: timestamp.height() - 2*deletePadding,
                            image: remove_img.cloneNode(true),
                            x: timestamp.x() + imgWidth - timestamp.height() - deletePadding,
                            y: timestamp.y() + deletePadding
                        });

                        deleteBtn.on("mouseover", () => {
                            document.body.style.cursor = "pointer";
                        });
                    
                        deleteBtn.on("mouseout", () => {
                            document.body.style.cursor = "auto";
                        });

                        let index = currentIndex - 1;

                        deleteBtn.on("click touchstart", () => {
                            animateBtn(deleteBtn, () => {
                                proceedBtn.onclick = () => {
                                    data.splice(index, 1);
                                    dataStore.setItem("saved-games", data).then(() => {
                                        loadgame(config, actionbar, title, fonts, remove_img, click, add, addFunc);
                                    });

                                    alertWin.close();
                                }
                                alertWin.show();
                            });
                        });
            
                        block.add(image, timebg, timestamp, deleteBtn);
                    } else {
                        break;
                    }
                }
    
                mainContainer.add(block);
                j++;
            }
        }
    } else {
        let message_text = new Konva.Text({
            align: "center",
            padding: 0,
            verticalAlign: "middle",
            width: mainContainer.width(),
            height: mainContainer.height() - actionbar.actionbar_title.height(),
            text: "Nothing Here!",
            fontFamily: fonts['other'],
            fontSize: isMobile ? 23 : (isAndroid ? 20 : 23),
            fill: config.colors.text,
            opacity: 0.7,
            fillAfterStrokeEnabled: true,
            wrap: "none"
        });

        mainContainer.add(message_text);
    }

    actionContent.add(mainContainer);
        
    actionbar.scrollbarHeight = i > 0 ? (actionContent.height() / (isMobile ? (i * (imgHeight + gap)) : ((Math.floor(i/3) + 1) * (imgHeight + gap)) )) : 0;

    let scrollbar = actionbar.scrollbar;

    if(actionbar.scrollbarHeight > 0) {
        scrollbar.off("dragmove");
        scrollbar.on("dragmove", () => {
            mainContainer.y(-(actionbar.scrollHeight / actionbar.scrollScale));
        });
    
        actionContent.off("mousedown touchstart");
    
        let {x: minX, y: minY} = actionContent.getAbsolutePosition();
        window.onmousewheel = (e) => {
            if(e.clientX > minX && e.clientY > minY) {
                actionbar.scrollHeight += e.deltaY;
                scrollbar.fire("dragmove");
            }
        };
    
        actionContent.on("mousedown touchstart", (ev) => {
            let startY = actionbar.scrollHeight;
            let y = 0;
    
            if(ev.type === "touchstart") {
                y = ev.evt.touches[0].clientY;
            } else {
                y = ev.evt.y;
            }
    
            actionContent.on("mousemove touchmove", (e) => {
                let y2 = 0;
                if(e.type === "touchmove") {
                    y2 = e.evt.touches[0].clientY;
                } else {
                    y2 = e.evt.y;
                }
    
                actionbar.scrollHeight = startY + (y - y2);
                scrollbar.fire("dragmove");
            });
    
            actionContent.on("mouseup touchend", () => {
                actionContent.off("mousemove mouseup");
            });
        });
    } else {
        scrollbar.off("dragmove");
        actionContent.off("mousedown touchstart");
    }
}