/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The string to escape
 * @returns {string} Escaped HTML-safe string
 */
import { konvaStage } from "../stage.js";
import { storage } from "../storage.js";
import { getConfiguration, getGameSettings, getIsPortrait, getIsAndroid, getActiveLayer, getOpenWindow } from "../runtime-state.js";
import { STORAGE_KEYS } from "../constants.js";
import errorTracking from "../error-tracking.js";

const Konva = globalThis.Konva;
const REDUCE_MOTION_KEY = STORAGE_KEYS.ACCESSIBILITY_REDUCE_MOTION;

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return "";
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}

function loadImg(url) {
    const img = new Image();
    img.src = url;

    return img;
}

function deepEqual(a, b) {
    if (a === b) return true;
  
    if (typeof a !== "object" || typeof b !== "object" || a == null || b == null) {
        return false;
    }
  
    const keysA = Object.keys(a), keysB = Object.keys(b);
  
    if (keysA.length !== keysB.length) return false;
  
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            return false;
        }
    }
  
    return true;
}

function openBar(bar, done = () => {}) {
    const wasVisible = bar?.visible?.() === true;

    if (wasVisible) {
        done();
        return;
    }

    const gameSettings = getGameSettings();
    if (gameSettings && gameSettings[REDUCE_MOTION_KEY]) {
        bar.y(0);
        bar.visible(true);
        const overlayType = bar?.__vnsutraHistoryOverlay;
        if (overlayType) {
            globalThis.dispatchEvent(new CustomEvent("vnsutra:overlay-opened", {
                detail: {
                    overlayType,
                    layer: getActiveLayer(),
                    windowName: getOpenWindow()
                }
            }));
        }
        done();
        return;
    }

    bar.y(konvaStage.height());
    bar.visible(true);
    bar.to({
        y: 0,
        duration: 0.1,
        onFinish: () => {
            const overlayType = bar?.__vnsutraHistoryOverlay;
            if (overlayType) {
                globalThis.dispatchEvent(new CustomEvent("vnsutra:overlay-opened", {
                    detail: {
                        overlayType,
                        layer: getActiveLayer(),
                        windowName: getOpenWindow()
                    }
                }));
            }
            done();
        }
    });
}

function isBarOpen(bar) {
    return bar.visible();
}

function closeBar(bar, done = () => {}) {
    const wasVisible = bar?.visible?.() === true;
    if (!wasVisible) {
        done();
        return;
    }

    const gameSettings = getGameSettings();
    if (gameSettings && gameSettings[REDUCE_MOTION_KEY]) {
        bar.y(konvaStage.height());
        bar.visible(false);
        const overlayType = bar?.__vnsutraHistoryOverlay;
        if (overlayType) {
            globalThis.dispatchEvent(new CustomEvent("vnsutra:overlay-closed", {
                detail: {
                    overlayType,
                    layer: getActiveLayer(),
                    windowName: getOpenWindow()
                }
            }));
        }
        done();
        return;
    }

    bar.to({
        y: konvaStage.height(),
        duration: 0.1,
        onFinish: () => {
            bar.visible(false);
            const overlayType = bar?.__vnsutraHistoryOverlay;
            if (overlayType) {
                globalThis.dispatchEvent(new CustomEvent("vnsutra:overlay-closed", {
                    detail: {
                        overlayType,
                        layer: getActiveLayer(),
                        windowName: getOpenWindow()
                    }
                }));
            }
            done();
        }
    });
}

function animateBtn(btn, done = () => {}) {
    const gameSettings = getGameSettings();
    if (gameSettings && gameSettings[REDUCE_MOTION_KEY]) {
        done();
        return;
    }

    const { x, y, width, height } = btn.getAttrs();

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
    const gameSettings = getGameSettings();
    if (gameSettings && gameSettings[REDUCE_MOTION_KEY]) {
        menu.visible(!menu.visible());
        menu.opacity(1);
        menu.scaleY(1);
        done();
        return;
    }

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
    constructor({ label = "", id = "", variable = "", checked = true, listener = () => {}, updateEnabled = true, align = "center" }, config, container, fonts) {
        this.id = id;
        this.variable = variable;
        this.listener = listener;
        this.updateEnabled = updateEnabled;

        if (!Konva) {
            errorTracking?.captureError("Konva not available", {
                message: "[Switch] Konva not available",
                context: { scope: "ui", component: "switch" }
            });
            const makeStub = () => ({
                on: () => {},
                fire: () => {},
                x: () => 0,
                y: () => 0,
                width: () => 0,
                height: () => 0,
                scale: () => {},
                visible: () => true,
                add: () => {},
                getAttrs: () => ({ x: 0, y: 0, width: 0, height: 0 })
            });
            const makeOpacityStub = () => {
                let opacityValue = Number(checked);
                return {
                    ...makeStub(),
                    opacity: (next) => {
                        if (typeof next !== "undefined") {
                            opacityValue = Number(next);
                        }
                        return opacityValue;
                    }
                };
            };
            this.switchBox = makeStub();
            this.checkIcon = makeOpacityStub();
            this.label = makeStub();
            this.container = makeStub();
            this.init();
            return;
        }

        const [switchWidth, switchHeight] = [23, 23];
        const diagonal = Math.sqrt(Math.pow(switchWidth, 2) + Math.pow(switchHeight, 2));
        const isPortrait = getIsPortrait();
        const isAndroid = getIsAndroid();
        const padding = isPortrait ? 10 : (isAndroid ? 5 : 10);

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

        const checkImg = new Image();
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
            const opacity = this.checked;
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
            fontFamily: fonts["other"],
            fontSize: isPortrait ? 30 : (isAndroid ? 25 :  30),
            fill: config.colors.text,
            fillAfterStrokeEnabled: true
        });

        this.label.on("click touchstart", () => {
            this.checkIcon.fire("click");
        });

        const containerWidth = 2 * padding + diagonal + this.label.x() + this.label.width();

        let containerX = 0;
        if (align === "center") {
            containerX = (container.width() - containerWidth) / 2;
            if (!isPortrait) {
                containerX += 30;
            }
        } else if (align === "left") {
            containerX = 0;
        }

        this.container = new Konva.Group({
            height: 2 * padding + diagonal,
            width: containerWidth,
            x: containerX
        });

        this.container.add(this.switchBox, this.checkIcon, this.label);


        this.init();
    }

    init() {
        storage.getItem(this.id).then((value) => {
            if (value === null) {
                storage.setItem(this.id, this.checked);
            }
        }).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Switch] Failed to initialize from storage",
                context: { scope: "ui", component: "switch", stage: "init" }
            });
        });
    }


    /**
     * @param {boolean} value 
     */
    set checked(value) {
        this.checkIcon.opacity(Number(value));
        if(this.updateEnabled) {
            storage.setItem(this.id, value);
        }
        const gameSettings = getGameSettings();
        if (gameSettings) {
            gameSettings[this.variable] = value;
        }
    }

    get checked() {
        return Boolean(this.checkIcon.opacity());
    }

    update() {
        storage.getItem(this.id).then((value) => {
            if (value === null) {
                value = true;
            }
            this.checkIcon.opacity(Number(value));
            const gameSettings = getGameSettings();
            if (gameSettings) {
                gameSettings[this.variable] = value;
            }
        }).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Switch] Failed to update from storage",
                context: { scope: "ui", component: "switch", stage: "update" }
            });
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
    constructor({ tagName, attributes = {}, children = [], innerText = null, innerHTML = null, trustedHTML = false }) {
        this.tagName = tagName;
        this.attributes = attributes;
        this.children = children;
        this.innerText = innerText;
        this.innerHTML = innerHTML;
        this.trustedHTML = trustedHTML;

        const tag = document.createElement(this.tagName);
        this.tag = tag;
        this.onappend = () => {};
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
        const tag = this.element;
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
            this.tag.innerHTML = this.trustedHTML ? this.innerHTML : escapeHtml(this.innerHTML);
        }
        return this.tag;
    }
}


function getChoiceOptions(options, name, multiSelect = false) {
    let text = "";
    const config = getConfiguration();
    const textColor = config?.colors?.text ?? "#ffffff";
    const idleFillColor = "rgba(255,255,255,0.03)";
    const inputType = multiSelect ? "checkbox" : "radio";
    const inputName = `${name}-${inputType}`;
    const indicatorShape = multiSelect ? "rounded-lg" : "rounded-full";

    for (let i=0;i<options.length;i++) {
        const option = options[i];
        const optionText = escapeHtml(option);
        const optionValue = escapeAttribute(option);
        const optionRadius = multiSelect ? "rounded-xl" : "rounded-2xl";
        text += `
        <li>
            <input type="${inputType}" id="${name}-option-${i}" name="${inputName}" value="${optionValue}" class="hidden peer" ${multiSelect ? "" : "required=\"\""}>
            <label for="${name}-option-${i}" class="choice-card group inline-flex min-h-14 w-full items-center gap-3 ${optionRadius} border px-4 py-3 cursor-pointer transition-all duration-200 ease-out" style="color: rgba(255,255,255,0.78); border-color: rgba(255,255,255,0.18); background-color: ${idleFillColor};">
                <span class="choice-indicator flex h-8 w-8 shrink-0 items-center justify-center ${indicatorShape} border text-xs font-bold transition-all duration-200" aria-hidden="true"></span>
                <div class="block min-w-0 flex-1">
                    <div class="w-full text-sm leading-5 tracking-[0.01em]">${optionText}</div>
                </div>
            </label>
        </li>
        `;
    }

    return text;
}

class ChoiceMenu {
    constructor({ id, options = [], multiSelect = false }) {
        const config = getConfiguration();
        const textColor = config?.colors?.text ?? "#ffffff";
        const mutedBorderColor = "rgba(255,255,255,0.18)";

        const div = new HTMLNode({
            tagName: "div",
            attributes: {
                id: id,
                class: "w-full"
            },
            trustedHTML: true
        });

        div.innerHTML = `
        <div class="flex w-full max-w-full flex-col gap-2">
            <div class="flex items-center justify-between gap-3 px-1 pb-1">
                <div class="min-w-0">
                    <div class="text-xs uppercase tracking-[0.28em] opacity-55">Choice</div>
                    <div class="text-sm opacity-85">${multiSelect ? "Pick any combination" : "Pick one option"}</div>
                </div>
                <div class="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] opacity-80" style="border-color: ${mutedBorderColor}; color: ${textColor};">
                    ${multiSelect ? "Multi-select" : "Single-select"}
                </div>
            </div>
            <ul class="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
                ${getChoiceOptions(options, id, multiSelect)}
            </ul>
        </div>
        `;

        div.onappend = () => {
            const root = document.getElementById(id);
            const inputName = `${id}-${multiSelect ? "checkbox" : "radio"}`;
            const inputs = root.querySelectorAll(`input[name='${inputName}']`);

            const syncChoiceStyles = () => {
                const config = getConfiguration();
                const textColor = config?.colors?.text ?? "#ffffff";
                const primaryColor = config?.colors?.primary ?? "#fbbf24";
                const primaryTextColor = config?.colors?.["primary-text"] ?? "#000000";
                const mutedBorderColor = "rgba(255,255,255,0.18)";
                const idleFillColor = "rgba(255,255,255,0.03)";
                const mutedTextColor = "rgba(255,255,255,0.78)";

                inputs.forEach((input) => {
                    const elem = input.nextElementSibling;
                    if (!elem) {
                        return;
                    }
                    const indicator = elem.querySelector(".choice-indicator");

                    if (input.checked) {
                        elem.style.borderColor = primaryColor;
                        elem.style.color = textColor;
                        elem.style.backgroundColor = `${primaryColor}22`;
                        elem.style.transform = "none";
                        elem.style.boxShadow = `0 0 0 1px ${primaryColor}22`;
                        elem.setAttribute("data-selected", "true");
                        elem.classList.add("active-choice");
                        if (indicator) {
                            indicator.style.borderColor = primaryColor;
                            indicator.style.backgroundColor = primaryColor;
                            indicator.style.color = primaryTextColor;
                            indicator.textContent = multiSelect ? "✓" : "●";
                        }
                    } else {
                        elem.style.borderColor = mutedBorderColor;
                        elem.style.color = mutedTextColor;
                        elem.style.backgroundColor = idleFillColor;
                        elem.style.transform = "none";
                        elem.style.boxShadow = "none";
                        elem.setAttribute("data-selected", "false");
                        elem.classList.remove("active-choice");
                        if (indicator) {
                            indicator.style.borderColor = mutedBorderColor;
                            indicator.style.backgroundColor = "transparent";
                            indicator.style.color = mutedTextColor;
                            indicator.textContent = "";
                        }
                    }
                });
            };

            inputs.forEach((input) => {
                input.addEventListener("change", syncChoiceStyles);
            });

            syncChoiceStyles();
        };

        return div;
    }
}

/**
 * Parse basic markdown to HTML with proper text hierarchy
 * Supports: headings (h1-h3), bold, italic, links, lists, code blocks, paragraphs
 * @param {string} markdown - Markdown content to parse
 * @returns {string} HTML string with semantic markup
 */
function markdownToHtml(markdown) {
    try {
        if (!markdown || typeof markdown !== "string") {
            return "";
        }

        // Split into lines for processing
        const lines = markdown.split("\n");
        const html = [];
        let inList = false;
        let listItems = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines (but track them)
            if (!line) {
                if (inList && listItems.length > 0) {
                    // Don't close list yet, might continue
                }
                continue;
            }

            // Headings: # Header, ## Header, ### Header
            if (line.match(/^#{1,3}\s+/)) {
                if (inList && listItems.length > 0) {
                    html.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join("")}</ul>`);
                    listItems = [];
                    inList = false;
                }
                const level = line.match(/^#+/)[0].length;
                const text = line.replace(/^#+\s+/, "").trim();
                const hLevel = Math.min(level + 1, 4); // h2, h3, h4
                html.push(`<h${hLevel}>${escapeHtml(text)}</h${hLevel}>`);
            }
            // Unordered lists: - item or * item
            else if (line.match(/^[-*]\s+/)) {
                inList = true;
                const text = line.replace(/^[-*]\s+/, "").trim();
                // Process inline formatting within list items
                const formattedText = formatInlineText(text);
                listItems.push(formattedText);
            }
            // Numbered lists: 1. item
            else if (line.match(/^\d+\.\s+/)) {
                if (inList && listItems.length > 0) {
                    html.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join("")}</ul>`);
                    listItems = [];
                }
                inList = false;
                const text = line.replace(/^\d+\.\s+/, "").trim();
                const formattedText = formatInlineText(text);
                html.push(`<ol><li>${formattedText}</li></ol>`);
            }
            // Regular paragraphs
            else {
                if (inList && listItems.length > 0) {
                    html.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join("")}</ul>`);
                    listItems = [];
                    inList = false;
                }
                const formattedText = formatInlineText(line);
                if (formattedText) {
                    html.push(`<p>${formattedText}</p>`);
                }
            }
        }

        // Close any remaining list
        if (inList && listItems.length > 0) {
            html.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join("")}</ul>`);
        }

        return html.join("");
    } catch (error) {
        errorTracking?.captureError(error, {
            type: "markdownParsing",
            message: "Failed to parse markdown",
            context: { markdown: markdown?.substring(0, 100) }
        });
        return "";
    }
}

/**
 * Format inline markdown: **bold**, *italic*, [link](url)
 * @param {string} text - Text to format
 * @returns {string} HTML formatted text
 */
function formatInlineText(text) {
    if (!text) return "";
    
    text = escapeHtml(text);
    
    // Links: [text](url) - must handle escaped html
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>");
    
    // Bold: **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    
    // Italic: *text*
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    
    return text;
}

// Export all utility functions and classes as ES module
export {
    escapeHtml,
    escapeAttribute,
    loadImg,
    deepEqual,
    openBar,
    isBarOpen,
    closeBar,
    animateBtn,
    animateMenu,
    Switch,
    getMonth,
    HTMLNode,
    getChoiceOptions,
    ChoiceMenu,
    markdownToHtml
};

