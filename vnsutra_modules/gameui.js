async function gameUI(config, fonts, navigate) {
    let game_layer = new Konva.Layer();

    let { width, height } = konvaStage.getAttrs();

    let topbar_container = new Konva.Group({
        width: width,
        height: isMobile ? 50 : (isAndroid ? 40 : 50)
    });

    let topbar_rect = new Konva.Rect({
        width: width,
        height: topbar_container.height(),
        fill: config.colors.menu
    });

    let topbar_border = new Konva.Rect({
        width: width,
        height: 2,
        fill: config.colors.primary,
        y: topbar_container.height() - 2
    });

    topbar_container.add(topbar_rect, topbar_border);

    let topbarHeight = topbar_container.height();

    let topbarInnerHeight = topbarHeight - topbar_border.height();

    let backicon = new Image();
    backicon.src = config.gui['back-icon'];

    let backPadding = 5;
    let backBtn = new Konva.Image({
        width: topbarInnerHeight - 2*backPadding,
        height: topbarInnerHeight - 2*backPadding,
        x: backPadding,
        y: backPadding,
        image: backicon.cloneNode(true)
    });

    backBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    backBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

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

    let alertWin = new AlertWindow("Are you sure you want to exit?", [ closeBtn, proceedBtn ], config);
    alertWin.color = config.colors.primary;

    backBtn.on("click touchstart", () => {
        animateBtn(backBtn);

        proceedBtn.onclick = () => {
            navigate("home", {});
            alertWin.close();
        }

        alertWin.message = "Are you sure you want to exit?";
        alertWin.show();
    });


    let close_square_img = new Image();
    close_square_img.src = config.gui['close-icon'];

    let add_img = new Image();
    add_img.src = config.gui['add-icon'];

    let load_win = actionBar(config, new Konva.Group(), width, height, fonts, close_square_img, add_img);

    let menuBtn;

    let remove_img = new Image();
    remove_img.src = config.gui['remove-icon'];

    let menuItems = [
        {
            name: "Save Game",
            icon: config.gui['save-icon'],
            onclick: (element) => {
                loadgame(config, load_win, "Save Game", fonts, remove_img, (details, image) => {
                    proceedBtn.onclick = async () => {
                        let url = game_layer.findOne("#game-box").toDataURL({ imageSmoothingEnabled: true, width: width, height: (height-topbarHeight) });

                        dataStore.getItem("saved-games").then((games) => {
                            let index = games.findIndex(item => item.id === details.id);
                            let id = Date.now();
                            games[index] = {
                                id: id,
                                scene: activeScene,
                                timestamp: id,
                                src: url
                            }

                            dataStore.setItem("saved-games", games).then(() => {
                                element.onclick(element);
                            });
                        });

                        alertWin.close();
                    }

                    alertWin.message = "Are you sure you want to overwrite this game?";
                    alertWin.show();
                }, true, () => {
                    let url = game_layer.findOne("#game-box").toDataURL({ imageSmoothingEnabled: true, width: width, height: (height-topbarHeight) });

                    dataStore.getItem("saved-games").then((games) => {
                        let id = Date.now();
                        if(games === null) {
                            games = [];
                        }
                        games.push({
                            id: id,
                            scene: activeScene,
                            timestamp: id,
                            src: url
                        });

                        dataStore.setItem("saved-games", games).then(() => {
                            element.onclick(element);
                        });
                    });
                });
                if(!isBarOpen(load_win.actionrect)) {
                    openBar(load_win.actionrect);
                }
            }
        }, {
            name: "Load Game",
            icon: config.gui['load-icon'],
            onclick: () => {
                loadgame(config, load_win, "Load Game", fonts, remove_img, (details) => {
                    proceedBtn.onclick = () => {
                        alertWin.close();
                        closeBar(load_win.actionrect);
                        window.dispatchEvent(new CustomEvent("load-game", {detail: { scene: details.scene }}));
                    }

                    alertWin.message = "Are you sure you want to quit the active game?";
                    alertWin.show();
                });
                openBar(load_win.actionrect);
            }
        },
        {
            name: "Screenshot",
            icon: config.gui['screenshot-icon'],
            onclick: () => {
                menuBtn.fire("click");
                setTimeout(() => {
                    game_layer.toBlob({ imageSmoothingEnabled: true }).then(blob => {
                        let a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `${config.title}_screenshot_${Date.now()}`;
                        a.click();
                    });
                }, 500);
            }
        }
    ];

    let mobilePadding = isMobile ? 10 : 0;
    let menuHolder = new Konva.Group({
        height: isMobile ? ((menuItems.length * topbarInnerHeight) + 2*mobilePadding) : topbarInnerHeight,
        y: isMobile ? topbarInnerHeight : 0,
        visible: !isMobile
    });

    if(isMobile) {
        let menuBg = new Konva.Rect({
            fill: config.colors.menu,
            id: "game-menu-bg"
        });

        menuHolder.add(menuBg);
    }

    let btns_height = [], btns_width = [];

    let iconPadding = 10;

    for (let j = 0; j < menuItems.length; j++) {
        const element = menuItems[j];

        let img = new Image();
        img.src = element.icon;

        let btn_img = new Konva.Image({
            width: topbarInnerHeight - 2*iconPadding,
            height: topbarInnerHeight - 2*iconPadding,
            x: iconPadding,
            y: iconPadding,
            image: img
        });
        
        let btn_text = new Konva.Text({
            align: "left",
            padding: (topbarInnerHeight - (isMobile ? 23 : (isAndroid ? 20 : 23)))/2,
            x: btn_img.width() + iconPadding,
            verticalAlign: "middle",
            text: element.name,
            fontFamily: fonts['other'],
            fontSize: isMobile ? 23 : (isMobile ? 23 : (isAndroid ? 20 : 23)),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
            wrap: "word"
        });


        let x = 0;

        if(btns_width.length > 0) {
            x = btns_width.reduce((prev, current, index) => {
                return prev + current;
            });
        }

        let btnHolder = new Konva.Group({
            width: btn_img.width() + iconPadding + btn_text.width(),
            height: topbarInnerHeight,
            x: isMobile ? mobilePadding : x,
            y: isMobile ? ((j * topbarInnerHeight)) + mobilePadding : 0
        });

        btnHolder.on("mouseover", () => {
            document.body.style.cursor = "pointer";
        });
    
        btnHolder.on("mouseout", () => {
            document.body.style.cursor = "auto";
        });

        btnHolder.on("click touchstart", () => {
            animateBtn(btnHolder);
            if(element.onclick.length > 0) {
                element.onclick(element);
            } else {
                element.onclick();
            }
            if(isMobile) {
                menuBtn.fire("click");
            }
        });

        btnHolder.add(btn_img, btn_text);

        menuHolder.add(btnHolder);

        btns_width.push(btnHolder.width());
        btns_height.push(btnHolder.height());
    }

    let menuWidth = 0;

    if(isMobile) {
        menuWidth = btns_width.reduce((prev, current, index) => {
            return prev > current ? prev : current;
        });
    } else {
        menuWidth = btns_width.reduce((prev, current, index) => {
            return prev + current;
        });
    }

    menuHolder.width(menuWidth + 2*mobilePadding);
    menuHolder.x(width - menuHolder.width());

    if(isMobile) {
        let menuBg = menuHolder.findOne("#game-menu-bg");
        menuBg.width(menuHolder.width());
        menuBg.height(menuHolder.height());
    }


    let menuicon = new Image();
    menuicon.src = config.gui['menu-icon'];

    menuBtn = new Konva.Image({
        width: topbarInnerHeight - 2*backPadding,
        height: topbarInnerHeight - 2*backPadding,
        x: width - (topbarInnerHeight - backPadding),
        y: backPadding,
        image: menuicon.cloneNode(true),
        visible: isMobile
    });

    menuBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    menuBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

    menuBtn.on("click touchstart", () => {
        animateBtn(menuBtn);
        animateMenu(menuHolder);
    });

    topbar_container.add(backBtn, menuHolder, menuBtn);

    let game_container = new Konva.Group({
        width: width,
        height: height - topbarHeight,
        y: topbarHeight,
        id: "game-box"
    });

    let gameHeight = game_container.height();

    let dialogPadding = 20;

    let dialogContainer = new Konva.Group({
        width: width,
        height: 180,
        y: gameHeight - 180,
        id: "dialog-box"
    });

    let dialogContainerBG = new Konva.Rect({
        width: width,
        height: dialogContainer.height(),
        fill: config.colors.menu,
        id: "dialog-bg"
    });

    dialogContainer.add(dialogContainerBG);

    let name_text = new Konva.Text({
        align: config["game-ui"].dialog.title.align,
        padding: isMobile ? 20 : (isAndroid ? 10 : 20),
        verticalAlign: "middle",
        width: dialogContainer.width(),
        text: "Alex",
        fontFamily: fonts['other'],
        fontSize: isMobile ? 23 : (isAndroid ? 20 : 23),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "none",
        textDecoration: "underline",
        id: "dialog-name"
    });

    let dialogContainerWidth = dialogContainer.width();

    let dialog_text = new Konva.Text({
        align: config["game-ui"].dialog.speech.align,
        verticalAlign: "middle",
        padding: isMobile ? 10 : (isAndroid ? 5 : 10),
        width: isMobile ? (dialogContainerWidth - 30) : (dialogContainerWidth - 100),
        x: isMobile ? 15 : 50,
        y: name_text.height(),
        text: "",
        fontFamily: fonts['other'],
        fontSize: isMobile ? 20 : (isAndroid ? 18 : 20),
        lineHeight: 1.5,
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "word",
        id: "dialog-message"
    });
    
    dialogContainer.height(name_text.height() + dialog_text.height() + 2*dialogPadding);
    dialogContainer.y(gameHeight);
    dialogContainerBG.height(dialogContainer.height());

    dialogContainer.add(name_text, dialog_text);

    let game_rect = new Konva.Group({
        width: width,
        height: gameHeight - dialogContainer.height(),
        id: "game-container",
        clipWidth: width,
        clipHeight: gameHeight
    });

    let game_bg = new Konva.Image({
        id: "game-bg",
        filters: [Konva.Filters.Blur, Konva.Filters.Noise, Konva.Filters.Pixelate, Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL],
        noise: 0,
        blurRadius: 0,
        pixelSize: 1
    });

    dialog_text.on('update', () => {
        let height = name_text.height() + dialog_text.height() + 2*dialogPadding;
        dialogContainerBG.to({
            height: height,
            duration: 0.2
        });
        dialogContainer.to({
            height: height,
            y: gameHeight - height,
            duration: 0.2
        });

        game_rect.to({
            height: gameHeight - height,
            duration: 0.2
        });
    });

    game_rect.add(game_bg);

    game_container.add(game_rect, dialogContainer);

    let endGroup = new Konva.Group({
        id: "end-group",
        width: width,
        height: game_container.height(),
        visible: false
    });

    let endRect = new Konva.Rect({
        width: width,
        height: endGroup.height(),
        fill: config.colors.menu
    });

    let endText = new Konva.Text({
        align: "center",
        padding: 0,
        verticalAlign: "middle",
        width: width,
        height: endGroup.height(),
        text: "The End",
        fontFamily: fonts['other'],
        fontSize: isMobile ? 40 : (isAndroid ? 35 : 40),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "none"
    });

    endGroup.add(endRect, endText);

    game_container.add(endGroup);

    game_layer.add(game_container, topbar_container, load_win.actionrect);

    if(isMobile) {
        game_container.on("click touchstart", () => {
            if(menuHolder.visible()) {
                menuBtn.fire("click");
            }
        });
    }

    return ({
        layer: game_layer,
        game: {
            container: game_layer.findOne("#game-container"),
            bg: game_layer.findOne("#game-bg"),
            end: game_layer.findOne("#end-group")
        },
        dialog: {
            box: game_layer.findOne("#dialog-box"),
            bg: game_layer.findOne("#dialog-bg"),
            name: game_layer.findOne("#dialog-name"),
            message: game_layer.findOne("#dialog-message")
        }
    });
}