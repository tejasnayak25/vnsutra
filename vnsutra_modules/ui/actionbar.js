function actionBar(config, siderect, width, height, fonts, close_square_img, add_img) {
    let actionrect = new Konva.Group({
        width: isMobile ? width : (width - siderect.width()),
        height: height,
        x: isMobile ? 0 : siderect.width(),
        visible: false
    });

    let actionbar = new Konva.Rect({
        width: isMobile ? width : (width - siderect.width()),
        height: height,
        fill: config.colors.menu,
        opacity: isMobile ? config.ui.mobile.sidebar.opacity : config.ui.sidebar.opacity
    });

    let actionbar_border = new Konva.Rect({
        width: actionbar.width(),
        height: 6,
        fill: config.colors.primary
    });

    let actionbar_title = new Konva.Text({
        align: "left",
        verticalAlign: "middle",
        padding: isMobile ? 30 : (isAndroid ? 40 : 60),
        width: actionbar.width(),
        height: isMobile ? 90 : (isAndroid ? 60 : 95),
        text: "Action Menu",
        fontFamily: fonts['other'],
        fontSize: isMobile ? 30 : (isAndroid ? 25 : 30),
        fill: config.colors.text,
        fillAfterStrokeEnabled: true
    });

    let borderPadding = isMobile ? 30 : (isAndroid ? 20 : 30);

    let actionbar_title_border = new Konva.Rect({
        x: borderPadding,
        y: actionbar_title.height() - 10,
        height: 2,
        width: actionbar.width() - 2*borderPadding,
        fill: config.colors["menu-border"]
    });

    let closeActionMenuBtn = new Konva.Image({
        width: isMobile ? 50 : (isAndroid ? 30 : 40),
        height: isMobile ? 50 : (isAndroid ? 30 : 40),
        x: actionrect.width() - (isMobile ? 70 : (isAndroid ? 70 : 90)),
        y: isMobile ? 15 : (isAndroid ? 15 : 25),
        image: close_square_img.cloneNode(true)
    });

    let addBtn = new Konva.Image({
        width: isMobile ? 55 : (isAndroid ? 35 : 45),
        height: isMobile ? 55 : (isAndroid ? 35 : 45),
        x: actionrect.width() - closeActionMenuBtn.width() - (isMobile ? 70 : (isAndroid ? 70 : 90)) - 15,
        y: isMobile ? 13 : (isAndroid ? 13 : 23),
        image: add_img.cloneNode(true),
        visible: false
    });

    addBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    addBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

    closeActionMenuBtn.on("mouseover", () => {
        document.body.style.cursor = "pointer";
    });

    closeActionMenuBtn.on("mouseout", () => {
        document.body.style.cursor = "auto";
    });

    closeActionMenuBtn.on("click touchstart", () => {
        animateBtn(closeActionMenuBtn);
        closeBar(actionrect);
    });

    let padding = 30;

    let contentWidth = actionrect.width() - 2*padding;
    let contentHeight = height - actionbar_title.height() - 2*padding;
    let actionContent = new Konva.Group({
        width: contentWidth,
        height: contentHeight,
        x: padding,
        y: actionbar_title.height() + padding,
        id: "action-content",
        clipX: 0,
        clipY: 0,
        clipWidth: contentWidth,
        clipHeight: contentHeight
    });

    let scrollContainer = new Konva.Group({
        width: 4,
        height: contentHeight,
        x: contentWidth + padding,
        y: actionContent.y()
    });

    let scrollbarBg = new Konva.Rect({
        width: 4,
        height: contentHeight,
        fill: config.colors.primary,
        opacity: 0.5
    });

    scrollContainer.add(scrollbarBg);

    let scrollbar = new Konva.Rect({
        width: 4,
        height: scrollContainer.height(),
        fill: config.colors.primary,
        draggable: true
    });

    scrollbar.dragBoundFunc(function(pos){
        let actionHeight = actionbar_title.height();
        let totalHeight = actionHeight + actionContent.height() + padding;
        if(pos.y < actionHeight + padding) {
            pos.y = actionHeight + padding;
        } else if(pos.y > (totalHeight - scrollbar.height())) {
            pos.y = totalHeight - scrollbar.height();
        }
        return {
          x: this.absolutePosition().x,
          y: pos.y
        };
    });

    scrollbar.on("mouseover", () => {
        scrollbar.fill(config.colors.secondary);
    });

    scrollbar.on("mouseout", () => {
        scrollbar.fill(config.colors.primary);
    });

    scrollContainer.add(scrollbar);

    actionrect.add(actionbar, actionbar_border, actionbar_title, actionbar_title_border, addBtn, closeActionMenuBtn, actionContent, scrollContainer);

    return ({
        addBtn,
        actionrect,
        actionContent,
        actionbar_title,
        scrollbar,
        scrollContainer,
        scrollScale: 1,
        /**
         * @param {string} value 
         */
        set title(value) {
            actionbar_title.text(value);
        },
        /**
         * @param {number} value 
         */
        set scrollbarHeight(value) {
            if(value > 1) {
                value = 0;
            }
            this.scrollScale = value;
            scrollbar.height(value * scrollContainer.height());

            if(value === 0) {
                scrollbarBg.visible(false);
            } else {
                scrollbarBg.visible(true);
            }
        },
        get scrollbarHeight() {
            return scrollbar.height()/scrollContainer.height();
        },
        /**
         * @param {number} value 
         */
        set scrollHeight(value) {
            if(value < 0) {
                value = 0;
            } else if(value > (scrollContainer.height() - scrollbar.height())) {
                value = (scrollContainer.height() - scrollbar.height());
            }
            scrollbar.y(value);
        },
        get scrollHeight() {
            return scrollbar.y();
        },
        clear() {
            actionbar_title.text("");
            actionContent.removeChildren();
            this.scrollbarHeight = 0;
        }
    });
}