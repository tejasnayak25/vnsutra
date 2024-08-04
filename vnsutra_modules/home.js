async function home(config, fonts, navigate) {
    let home_layer = new Konva.Layer();

    let width = konvaStage.width(),
    height = konvaStage.height();

    let img = new Image();
    img.src = isMobile ? config.ui.mobile.poster.url : config.ui.poster.url;

    let image = new Konva.Image({
        image: img,
        opacity: isMobile ? config.ui.mobile.poster.opacity : config.ui.poster.opacity
    });

    img.onload = () => {
        let scale = isMobile ? (height / img.height) : (width / img.width);

        image.scale({ x: scale, y: scale });

        image.offsetX(isMobile ? img.width * config.ui.mobile['poster-offset'] : 0);
    }

    home_layer.add(image);

    let siderect = new Konva.Group({
        width: isMobile ? width : (isAndroid ? 180 : 250),
        height: height,
        visible: isMobile ? false : true
    });

    let sidebarBorder = new Konva.Rect({
        fill: config.colors.primary,
        width: isMobile ? 0 : 1,
        height: height,
        x: siderect.width() - 1
    });

    let sidebar = new Konva.Rect({
        width: isMobile ? width : siderect.width(),
        height: height,
        fill: config.colors.menu,
        opacity: isMobile ? config.ui.mobile.sidebar.opacity : config.ui.sidebar.opacity
    });

    let sidebar_border = new Konva.Rect({
        width: sidebar.width(),
        height: 6,
        fill: config.colors.primary
    });

    let sidebar_title = new Konva.Text({
        align: "center",
        verticalAlign: "middle",
        width: sidebar.width(),
        height: isMobile ? 90 : (isAndroid ? 60 : 95),
        text: "Menu",
        fontFamily: fonts['other'],
        fontSize: isMobile ? 30 : (isAndroid ? 25 : 30),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true
    });

    let borderPadding = isMobile ? 30 : (isAndroid ? 20 : 30);

    let sidebar_title_border = new Konva.Rect({
        x: borderPadding,
        y: sidebar_title.height() - 10,
        height: 2,
        width: sidebar.width() - 2*borderPadding,
        fill: config.colors["menu-border"]
    });

    let close_square_img = new Image();
    close_square_img.src = config.gui['close-icon'];

    let closeMenuBtn = new Konva.Image({
        width: isMobile ? 50 : 40,
        height: isMobile ? 50 : 40,
        x: siderect.width() - (isMobile ? 70 : 55),
        y: isMobile ? 15 : 15,
        image: close_square_img.cloneNode(true),
        visible: isMobile ? true : false
    });

    closeMenuBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    closeMenuBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

    closeMenuBtn.on("click touchstart", () => {
        animateBtn(closeMenuBtn);
        closeBar(siderect);
    });

    let add_img = new Image();
    add_img.src = config.gui['add-icon'];

    let actionbar = actionBar(config, siderect, width, height, fonts, close_square_img, add_img);

    let credit_details = credits(config, actionbar, fonts);

    let settings_details = settings(config, actionbar, fonts, credit_details);
    
    let optsGroup = new Konva.Group({
        width: sidebar.width(),
        height: sidebar.height() - sidebar_title.height() - sidebar_title_border.height(),
        y: sidebar_title.height() + sidebar_title_border.height()
    });

    let remove_img = new Image();
    remove_img.src = config.gui['remove-icon'];

    let closeBtn = document.createElement("button");
    closeBtn.innerText = "Cancel";
    closeBtn.className = "btn btn-outline hover:bg-inherit";
    closeBtn.style.borderColor = config.colors.text;
    closeBtn.style.color = config.colors.text;
    closeBtn.onclick = () => {
        document.getElementById("alert-win").classList.replace("flex", "hidden");
    }

    let proceedBtn = document.createElement("button");
    proceedBtn.innerText = "Exit";
    proceedBtn.className = "btn hover:bg-inherit border-0";
    proceedBtn.style.backgroundColor = config.colors.primary;
    proceedBtn.style.color = config.colors['primary-text'];

    let alertWin = new AlertWindow("Are you sure you want to quit?", [ closeBtn, proceedBtn ], config);
    alertWin.color = config.colors.primary;

    let opts = [
        { name: 'New Game', onclick: (btnHolder) => {
            if(isMobile) {
                closeBar(siderect);
            }
            navigate("game", {});
            btnHolder.fire("mouseout");
        } },
        { name: 'Load Game', onclick: (btnHolder) => {
            loadgame(config, actionbar, "Load Game", fonts, remove_img, (details) => {
                if(isMobile) {
                    closeBar(siderect);
                }
                closeBar(actionbar.actionrect);
                navigate("game", { scene: details.scene });
                btnHolder.fire("mouseout");
            });
            openBar(actionbar.actionrect);
        } },
        { name: 'Settings', onclick: () => {
            settings_details.render();
            openBar(actionbar.actionrect);
        } },
        { name: 'Credits', onclick: () => {
            credit_details.render();
            openBar(actionbar.actionrect);
        } },
        { name: 'Exit', onclick: () => {
            proceedBtn.onclick = () => {
                alertWin.close();
                exitApp();
            }
            alertWin.show();
        } }
    ];

    for (let j = 0; j < opts.length; j++) {
        const opt = opts[j];

        let opt_group = new Konva.Group({
            width: sidebar.width(),
            height: isMobile ? 80 : (isAndroid ? 55 : 70),
            y: j * (isMobile ? 80 : (isAndroid ? 55 : 70))
        });
        
        let opt_text = new Konva.Text({
            align: "left",
            padding: isMobile ? 60 : (isAndroid ? 20 : 30),
            verticalAlign: "middle",
            width: sidebar.width(),
            height: isMobile ? 80 : (isAndroid ? 55 : 70),
            text: opt.name,
            fontFamily: fonts['other'],
            fontSize: isMobile ? 30 : (isAndroid ? 25 : 30),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true
        });

        opt_group.on("mouseover", () => {
            opt_text.to({
                x: isMobile ? 60 : 30,
                duration: 0.1
            });
            document.body.style.cursor = "pointer";
        });

        opt_group.on("mouseout", () => {
            opt_text.to({
                x: 0,
                duration: 0.1
            });
            document.body.style.cursor = "auto";
        });

        opt_group.on("click touchstart", () => {
            opt_text.to({
                scaleX: 1.04,
                duration: 0.05,
                onFinish: () => {
                    opt_text.to({
                        scaleX: 1,
                        duration: 0.05
                    });
                },
            });

            if(opt.onclick) {
                if(opt.onclick.length > 0) {
                    opt.onclick(opt_group);
                } else {
                    opt.onclick();
                }
            }
        });

        opt_group.add(opt_text);
        optsGroup.add(opt_group);
    }

    siderect.add(sidebar, sidebar_border, sidebar_title, sidebar_title_border, closeMenuBtn, sidebarBorder, optsGroup);

    let main_group = new Konva.Group({
        width: isMobile ? width : (width - siderect.width()),
        height: height,
        x: isMobile ? 0 : siderect.width()
    });

    let title_group = new Konva.Group({
        width: main_group.width(),
        y: isMobile ? ((height/5) / config.ui.mobile.title.scale) : height - 260,
    })

    let title = new Konva.Text({
        align: isMobile ? "center" : config.ui.title.align,
        width: title_group.width(),
        padding: isMobile ? 0 : (isAndroid ? 30 : 60),
        text: config.title,
        fontFamily: fonts['title'],
        fontSize: isMobile ? 50 : (isAndroid ? 50 : 90),
        fill: config.ui.title.color,
        fillAfterStrokeEnabled: true,
        x: isMobile ? -(title_group.width() * (config.ui.mobile.title.scale - 1))/2 : 0,
        y: isMobile ? -(title_group.height() * (config.ui.mobile.title.scale - 1))/2 : 0,
        scale: {
            x: isMobile ? config.ui.mobile.title.scale : 1,
            y: isMobile ? config.ui.mobile.title.scale : 1
        },
        wrap: "word"
    });

    let subtitle = new Konva.Text({
        align: isMobile ? "center" : config.ui.title.align,
        width: title_group.width(),
        padding: isMobile ? 60 : (isAndroid ? 30 : 60),
        y: isMobile ? (80 * title.scaleX() - 80) : (title.y() + title.height() + 20 - (isAndroid ? 60 : 120)),
        text: config.subtitle || "",
        fontFamily: fonts['other'],
        fontSize: isMobile ? 30 : (isAndroid ? 25 : 30),
        fill: config.ui.title.color,
        fillAfterStrokeEnabled: true,
        wrap: "word"
    });

    if(!isMobile) {
        title_group.y(height - (subtitle.y() + subtitle.height()));
    } else {
        title_group.y((height/2) - ((title.height()*title.scaleX()) + subtitle.height()))
    }

    title_group.add(title, subtitle);

    let btnimage = new Image();
    
    if(config.gui.button) {
        btnimage.src = config.gui.button;
    }

    let btns = isMobile ? [ 
        { name: 'New Game', onclick: () => {
            navigate("game", {});
        } },
        { name: 'Load Game', onclick: () => {
            loadgame(config, actionbar, "Load Game", fonts, remove_img, (details) => {
                navigate("game", { scene: details.scene });
                closeBar(actionbar.actionrect);
            });
            openBar(actionbar.actionrect);
        } },
        { name: 'More', onclick: () => {
            openBar(siderect);
        } }
    ] : [];

    let btny = main_group.height() - (btns.length * 60 + 20);

    let btns_holder = new Konva.Group({
        width: width - 60,
        height: btns.length * 50,
        x: 30,
        y: btny
    });

    for (let i = 0; i < btns.length; i++) {
        const btn = btns[i];

        let btn_group = new Konva.Group({
            width: btns_holder.width(),
            height: 50,
            y: i * 60
        });

        btn_group.on("mouseover", () => {
            btn_group.scale({ x: 1.05, y: 1.05 });
            let widthdiff = btn_group.width()*(0.05);
            let heightdiff = btn_group.height()*(0.05);
            btn_group.x(0 - widthdiff/2);
            btn_group.y( i*60 - heightdiff/2 );
            document.body.style.cursor = "pointer";
        });

        btn_group.on("mouseout", () => {
            btn_group.scale({ x: 1, y: 1 });
            btn_group.x(0);
            btn_group.y(i*60);
            document.body.style.cursor = "auto";
        });

        let btn_rect = new Konva.Rect({
            width: btn_group.width(),
            height: 50
        });

        let btn_img;
        
        if(config.gui.button !== null) {
            btn_img = new Konva.Image({
                width: btn_group.width(),
                height: btn_rect.height(),
                image: btnimage
            });
        } else {
            btn_img = new Konva.Rect({
                width: btn_group.width(),
                height: btn_rect.height(),
                fill: config.colors.button ?? config.colors.primary,
                cornerRadius: btn_group.width()/2
            });
        }


        let btntext = new Konva.Text({
            align: "center",
            width: btn_group.width(),
            y: btn_rect.height() / 2 - 10,
            text: btn.name,
            fontFamily: fonts['other'],
            fontSize: 25,
            fill: config.colors['button-text'],
            fillAfterStrokeEnabled: true
        });

        btn_group.on("click touchstart", () => {
            btntext.to({
                scaleX: 1.04,
                duration: 0.05,
                onFinish: () => {
                    btntext.to({
                        scaleX: 1,
                        duration: 0.05
                    });
                },
            });

            btn.onclick();
        });

        btn_group.add(btn_img);
        btn_group.add(btn_rect);
        btn_group.add(btntext);

        btns_holder.add(btn_group);
    }

    main_group.add(title_group, btns_holder);


    home_layer.add(main_group);
    home_layer.add(siderect, actionbar.actionrect);

    return ({
        layer: home_layer
    });
}