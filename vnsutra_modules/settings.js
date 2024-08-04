function settings(config, actionbar, fonts, credit_details) {
    let actionContent = actionbar.actionContent;

    actionbar.addBtn.visible(false);
    
    let { width: containerWidth, height: containerHeight } = actionContent.getAttrs();

    let padding = 30, gap = 30;

    let mainContainer = new Konva.Group({
        x: padding,
        width: containerWidth - 2 * padding,
        height: containerHeight
    });
    
    let textAnimation = new Switch({ label: "Text Animation", id: "text-animation", variable: "text_animation", checked: true, listener: (value) => {} }, config, mainContainer, fonts);

    let music = new Switch({ label: "Music", id: "settings-music", variable: "settings-music", checked: true, listener: (value) => {
        let elem = document.getElementById("music");
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
    
    let sfx = new Switch({ label: "Sound Effects", id: "settings-sfx", variable: "settings-sfx", checked: true, listener: (value) => {
        let elem = document.getElementById("sfx");
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

    music.container.y(textAnimation.container.height() + gap);
    sfx.container.y(music.container.y() + music.container.height() + gap);


    let btnimage = new Image();
    
    if(config.gui.button) {
        btnimage.src = config.gui.button;
    }

    let btns = [ 
        { name: 'Support', onclick: () => {
            window.open(config['support-url'], "_system");
        } },
        { name: 'Credits', onclick: () => {
            credit_details.render();
            openBar(actionbar.actionrect);
        } },
        { name: 'About', onclick: () => {
            window.open(config['about-url'], "_system");
        } }
    ];

    let btny = sfx.container.y() + sfx.container.height() + gap + 15;

    let btns_holder = new Konva.Group({
        width: isMobile ? containerWidth - 60 : 200,
        height: btns.length * (isMobile ? 70 : (isAndroid ? 50 : 70)),
        x: isMobile ? 0 : (containerWidth - 200)/2,
        y: btny
    });

    let btn_height = isMobile ? 70 : (isAndroid ? 60 : 80);

    for (let i = 0; i < btns.length; i++) {
        const btn = btns[i];

        let btn_group = new Konva.Group({
            width: btns_holder.width(),
            height: (isMobile ? 50 : (isAndroid ? 40 : 50)),
            y: i * btn_height
        });

        btn_group.on("mouseover", () => {
            btn_group.scale({ x: 1.05, y: 1.05 });
            let widthdiff = btn_group.width()*(0.05);
            let heightdiff = btn_group.height()*(0.05);
            btn_group.x(0 - widthdiff/2);
            btn_group.y( i*btn_height - heightdiff/2 );
            document.body.style.cursor = "pointer";
        });

        btn_group.on("mouseout", () => {
            btn_group.scale({ x: 1, y: 1 });
            btn_group.x(0);
            btn_group.y(i*btn_height);
            document.body.style.cursor = "auto";
        });

        let btn_rect = new Konva.Rect({
            width: btn_group.width(),
            height: btn_group.height()
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

    let version_text = new Konva.Text({
        align: "center",
        padding: isMobile ? 60 : 30,
        verticalAlign: "middle",
        width: isMobile ? mainContainer.width() : containerWidth,
        height: isMobile ? 80 : (isAndroid ? 60 : 70),
        y: btny + btns_holder.height() + (isMobile ? 0 : gap),
        text: `Version: ${config.version}`,
        fontFamily: fonts['other'],
        fontSize: isMobile ? 27 : (isAndroid ? 25 : 27),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true,
        wrap: "word"
    });

    let copyright_text = new Konva.Text({
        align: "center",
        padding: 30,
        verticalAlign: "middle",
        width: isMobile ? mainContainer.width() : containerWidth,
        y: version_text.y() + version_text.height() - (isMobile ? 20 : 0),
        text: config.copyright,
        fontFamily: fonts['other'],
        fontSize: isMobile ? 30 : (isAndroid ? 25 : 30),
        fill: config.colors.primary,
        fillAfterStrokeEnabled: true,
        lineHeight: 1.5,
        wrap: "word"
    });

    let label_text = new Konva.Text({
        align: "center",
        padding: 30,
        verticalAlign: "middle",
        width: isMobile ? mainContainer.width() : containerWidth,
        y:copyright_text.y() +copyright_text.height() - (isMobile ? 20 : 0),
        text: `Built with VN-Sutra`,
        fontFamily: fonts['other'],
        fontSize: isMobile ? 30 : (isAndroid ? 25 : 30),
        fill: config.colors.primary,
        fillAfterStrokeEnabled: true,
        wrap: "word"
    });


    mainContainer.add(textAnimation.container, music.container, sfx.container, btns_holder, version_text, copyright_text);

    if(config.ui['vnsutra-label']) {
        mainContainer.add(label_text);
        mainContainer.height(label_text.y() + label_text.height());
    } else {
        mainContainer.height(version_text.y() + version_text.height());
    }

    textAnimation.update();
    music.update();
    sfx.update();

    function render() {
        actionbar.clear();
        actionbar.title = "Settings";

        textAnimation.update();
        music.update();
        sfx.update();

        actionContent.add(mainContainer);

        actionbar.scrollbarHeight = actionContent.height() / mainContainer.height();

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

    return ({
        container: mainContainer,
        render
    });
}