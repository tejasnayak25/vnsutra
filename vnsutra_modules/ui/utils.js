function loadImg(url) {
    let img = new Image();
    img.src = url;

    return img;
}

function deepEqual(a, b) {
    if (a === b) return true;
  
    if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) {
      return false;
    }
  
    let keysA = Object.keys(a), keysB = Object.keys(b);
  
    if (keysA.length !== keysB.length) return false;
  
    for (let key of keysA) {
      if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
        return false;
      }
    }
  
    return true;
  }

function openBar(bar, done = () => {}) {
    bar.y(konvaStage.height());
    bar.visible(true);
    bar.to({
        y: 0,
        duration: 0.1,
        onFinish: () => {
            done();
        }
    });
}

function isBarOpen(bar) {
    return bar.visible();
}

function closeBar(bar, done = () => {}) {
    bar.to({
        y: konvaStage.height(),
        duration: 0.1,
        onFinish: () => {
            bar.visible(false);
            done();
        }
    });
}

function animateBtn(btn, done = () => {}) {
    let { x, y, width, height } = btn.getAttrs();

    btn.to({
        scaleX: 0.96,
        scaleY: 0.96,
        x: x - width*(-0.04)/2,
        y: y - height*(-0.04)/2,
        duration: 0.05,
        onFinish: () => {
            btn.to({
                scaleX: 1,
                scaleY: 1,
                x: x,
                y: y,
                duration: 0.05,
                onFinish: () => {
                    done();
                }
            });
        },
    });
}

function animateMenu(menu, done = () => {}) {
    if(menu.visible()) {
        menu.to({
            scaleY: 0,
            opacity: 0,
            duration: 0.02,
            onFinish: () => {
                menu.visible(false);
                done();
            }
        });
    } else {
        menu.visible(true);
        menu.scaleY(0);
        menu.opacity(0);
        menu.to({
            scaleY: 1,
            opacity: 1,
            duration: 0.02,
            onFinish: () => {
                done();
            }
        });
    }
}

class Switch {
    constructor({ label = "", id = "", variable = "", checked = true, listener = (value) => {} }, config, container, fonts) {
        this.id = id;
        this.variable = variable;
        this.listener = listener;

        let [switchWidth, switchHeight] = [23, 23];
        let diagonal = Math.sqrt(Math.pow(switchWidth, 2) + Math.pow(switchHeight, 2));
        let padding = isMobile ? 10 : (isAndroid ? 5 : 10);

        this.switchBox = new Konva.Rect({
            width: switchWidth,
            height: switchHeight,
            x: padding + diagonal/2,
            y: padding,
            rotation: 45,
            strokeWidth: 3,
            stroke: config.colors.primary,
            fillAfterStrokeEnabled: true
        });

        let checkImg = new Image();
        checkImg.src = config.gui["check-icon"];

        this.checkIcon = new Konva.Image({
            width: diagonal,
            height: diagonal,
            x: padding,
            y: padding,
            image: checkImg,
            opacity: Number(checked)
        });

        this.checkIcon.on("click touchstart", () => {
            let opacity = this.checked;
            this.checked = !opacity;
            this.listener(!opacity);
        });

        this.checkIcon.on("mouseover", () => {
            document.body.style.cursor = "pointer";
        });

        this.checkIcon.on("mouseout", () => {
            document.body.style.cursor = "auto";
        });

        this.label = new Konva.Text({
            align: "left",
            verticalAlign: "middle",
            height: diagonal,
            x: padding + diagonal + 15,
            y: padding,
            text: label,
            fontFamily: fonts['other'],
            fontSize: isMobile ? 30 : (isAndroid ? 25 :  30),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true
        });

        this.label.on("click touchstart", () => {
            this.checkIcon.fire("click");
        });

        let containerWidth = 2 * padding + diagonal + this.label.x() + this.label.width();

        let containerX = ((container.width() - containerWidth)/2);

        this.container = new Konva.Group({
            height: 2 * padding + diagonal,
            width: containerWidth,
            x: isMobile ? containerX : containerX + 30
        });

        this.container.add(this.switchBox, this.checkIcon, this.label);


        this.init();
    }

    init() {
        dataStore.getItem(this.id).then((value) => {
            if(value === null) {
                dataStore.setItem(this.id, this.checked);
            }
        });
    }


    /**
     * @param {boolean} value 
     */
    set checked(value) {
        this.checkIcon.opacity(Number(value));
        dataStore.setItem(this.id, value);
        gameSettings[this.variable] = value;
    }

    get checked() {
        return Boolean(this.checkIcon.opacity());
    }

    update() {
        dataStore.getItem(this.id).then((value) => {
            if(value === null) {
                value = true;
            }
            this.checkIcon.opacity(Number(value));
            gameSettings[this.variable] = value;
        });
    }
}

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function getMonth(month = 0) {
    return monthNames[month];
}


class HTMLNode {
    constructor({ tagName, attributes = {}, children = [], innerText = null, innerHTML = null }) {
        this.tagName = tagName;
        this.attributes = attributes;
        this.children = children;
        this.innerText = innerText;
        this.innerHTML = innerHTML;

        let tag = document.createElement(this.tagName);
        this.tag = tag;
        this.onappend = () => {}
    }

    append(...nodes) {
        this.children.push(...nodes);
    }

    _onappend() {
        this.onappend();
        for (const child of this.children) {
            child._onappend();
        }
    }

    get outerHTML() {
        let tag = this.element;
        return tag.outerHTML;
    }

    get element() {
        Object.entries(this.attributes).forEach(([ key, value ]) => {
            this.tag.setAttribute(key, value);
        });
        if(this.innerText) {
            this.tag.innerText = this.innerText;
        }
        for (const i of this.children) {
            this.tag.append(i.element);
        }
        if(this.innerHTML) {
            this.tag.innerHTML = this.innerHTML;
        }
        return this.tag;
    }
}


function getRadioOptions(options, name) {
    let text = '';

    for (let i=0;i<options.length;i++) {
        let option = options[i];
        text += `
        <li>
            <input type="radio" id="${name}-option-${i}" name="${name}-radio" value="${option}" class="hidden peer" required="">
            <label for="${name}-option-${i}" class="inline-flex items-center justify-between w-full p-3 px-4 border-2 rounded-full cursor-pointer" style="color: ${configuration.colors.text}; border-color: ${configuration.colors.text};"> 
                <div class="block">
                    <div class="w-full text-sm">${option}</div>
                </div>
            </label>
        </li>
        `;
    }

    return text;
}

class LongTextRadio {
    constructor({ label, id, placeholder = "", options = [], onchange = (e, input) => {}, disabled = false }) {
        let div = new HTMLNode({
            tagName: "div",
            attributes: {
                id: id,
                class: "p-3 w-full"
            }
        });

        div.innerHTML = `
        <div class="relative flex w-full max-w-full flex-col">
            <ul class="flex flex-col w-full gap-3">
                ${getRadioOptions(options, id)}
            </ul>
        </div>
        `;

        div.onappend = () => {
            document.getElementById(id).querySelectorAll(`input[name='${id}-radio']`).forEach(radio => {
                let elem = radio.nextElementSibling;
                elem.onclick = () => {
                    if(document.getElementById(id).querySelector(".active-choice")) {
                        let activeChoice = document.getElementById(id).querySelector(".active-choice");
                        activeChoice.style.borderColor = configuration.colors.text;
                        activeChoice.classList.remove("active-choice");
                    }

                    elem.style.borderColor = configuration.colors.primary;
                    elem.classList.add("active-choice");
                }
            });
        }

        return div;
    }
}