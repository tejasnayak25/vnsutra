function credits(config, actionbar, fonts) {
    let actionContent = actionbar.actionContent;

    actionbar.addBtn.visible(false);

    let { width: containerWidth } = actionContent.getAttrs();

    let mainContainer = new Konva.Group({
        width: containerWidth
    });

    let oddheight = 0, rowheight = 0;
    Object.entries(config.credits).forEach(([key, value], index, arr) => {
        let container = new Konva.Group({
            width: isMobile ? containerWidth : ((containerWidth/2) - 10),
            x: isMobile ? 0 : (index % 2 === 0 ? 0 : (containerWidth/2) + 10),
            y: isMobile ? index * 100 : (index % 2 === 0 ? ((index/2) * 100) : (((index-1)/2) * 100))
        });

        let gap = 10;

        let key_text = new Konva.Text({
            align: "center",
            padding: 0,
            verticalAlign: "middle",
            width: container.width(),
            text: key,
            fontFamily: fonts['other'],
            fontSize: isMobile ? 25 : (isAndroid ? 20 : 25),
            fill: config.colors.primary,
            fillAfterStrokeEnabled: true,
            wrap: "word"
        });

        let value_text = new Konva.Text({
            align: "center",
            padding: 0,
            verticalAlign: "middle",
            width: container.width(),
            y: key_text.height() + gap,
            text: value,
            fontFamily: fonts['other'],
            fontSize: isMobile ? 23 : (isAndroid ? 18 : 23),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true,
            wrap: "word"
        });

        container.height(value_text.y() + value_text.height());

        let containerHeight = container.height() + 30;
        container.y(isMobile ? index * containerHeight : (index % 2 === 0 ? ((index/2) * containerHeight) : (((index-1)/2) * containerHeight)));

        container.add(key_text, value_text);

        mainContainer.add(container);

        let height = mainContainer.height() + containerHeight;
        if(!isMobile) {
            if(index % 2 === 0) {
                height = mainContainer.height() + containerHeight;
                oddheight = containerHeight;
                rowheight = mainContainer.height();
            } else {
                if(containerHeight > oddheight) {
                    height = rowheight + containerHeight;
                } else {
                    height = rowheight + oddheight;
                }
                oddheight = 0;
                rowheight = 0;
            }
        }
        mainContainer.height(isMobile ? height : height);
    });

    function render() {
        actionbar.clear();
        actionbar.title = "Credits";

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