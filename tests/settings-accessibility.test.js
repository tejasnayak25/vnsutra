import { jest } from "@jest/globals";
import { EVENTS } from "../vnsutra_modules/constants.js";

function findGroupByChildText(node, text) {
    if (!node || typeof node.getChildren !== "function") {
        return null;
    }

    const children = node.getChildren();
    const hasTextChild = children.some((child) => (
        child?.getClassName?.() === "Text" && typeof child.text === "function" && child.text() === text
    ));

    if (hasTextChild) {
        return node;
    }

    for (const child of children) {
        const found = findGroupByChildText(child, text);
        if (found) {
            return found;
        }
    }

    return null;
}

function createMockKonva() {
    class MockNode {
        constructor(config = {}) {
            this.attrs = {};
            this.children = [];
            this.listeners = {};
            this.className = this.constructor.name.replace(/^Mock/, "");
            this.nodeType = "Shape";
            this.setAttrs(config);
        }

        _setAttr(attr, value) {
            if (value === undefined || value === null) {
                delete this.attrs[attr];
            } else {
                this.attrs[attr] = value;
            }

            return this;
        }

        setAttr(attr, value) {
            const methodName = `set${attr.charAt(0).toUpperCase()}${attr.slice(1)}`;
            if (typeof this[methodName] === "function") {
                return this[methodName](value);
            }

            return this._setAttr(attr, value);
        }

        setAttrs(config = {}) {
            Object.entries(config).forEach(([key, value]) => {
                const methodName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                if (typeof this[methodName] === "function") {
                    this[methodName](value);
                } else {
                    this._setAttr(key, value);
                }
            });

            return this;
        }

        getAttr(attr) {
            const methodName = `get${attr.charAt(0).toUpperCase()}${attr.slice(1)}`;
            if (typeof this[methodName] === "function") {
                return this[methodName]();
            }

            return this.attrs[attr];
        }

        getAttrs() {
            return { ...this.attrs };
        }

        getClassName() {
            return this.className || this.nodeType;
        }

        getType() {
            return this.nodeType;
        }

        add(...children) {
            this.children.push(...children);
            return this;
        }

        removeChildren() {
            this.children = [];
            return this;
        }

        getChildren() {
            return [...this.children];
        }

        findOne(selector) {
            const matches = (node) => {
                if (!node) {
                    return false;
                }

                if (selector.startsWith(".")) {
                    const className = selector.slice(1);
                    return String(node.attrs.name ?? "").split(/\s+/).includes(className);
                }

                return node.getClassName?.() === selector || node.getType?.() === selector || node.attrs.id === selector;
            };

            const queue = [...this.children];
            while (queue.length > 0) {
                const node = queue.shift();
                if (matches(node)) {
                    return node;
                }
                if (typeof node?.getChildren === "function") {
                    queue.push(...node.getChildren());
                }
            }

            return null;
        }

        on(eventName, handler) {
            this.listeners[eventName] = handler;
            return this;
        }

        off() {
            return this;
        }

        fire(eventName, payload = {}) {
            this.listeners[eventName]?.(payload);
            return this;
        }

        draw() {
            return this;
        }

        batchDraw() {
            return this;
        }

        getLayer() {
            return {
                draw: jest.fn(),
                batchDraw: jest.fn()
            };
        }

        width(value) {
            if (arguments.length > 0) {
                this.attrs.width = value;
                return this;
            }

            return Number(this.attrs.width ?? 0);
        }

        height(value) {
            if (arguments.length > 0) {
                this.attrs.height = value;
                return this;
            }

            if (this.attrs.height !== undefined) {
                return Number(this.attrs.height);
            }

            return Number(this.attrs.fontSize ?? 24) + Number(this.attrs.padding ?? 0);
        }

        x(value) {
            if (arguments.length > 0) {
                this.attrs.x = value;
                return this;
            }

            return Number(this.attrs.x ?? 0);
        }

        y(value) {
            if (arguments.length > 0) {
                this.attrs.y = value;
                return this;
            }

            return Number(this.attrs.y ?? 0);
        }

        scale(value) {
            if (arguments.length > 0) {
                this.attrs.scale = value;
                if (value && typeof value === "object") {
                    if (value.x !== undefined) {
                        this.attrs.scaleX = value.x;
                    }
                    if (value.y !== undefined) {
                        this.attrs.scaleY = value.y;
                    }
                }

                return this;
            }

            return this.attrs.scale ?? {
                x: this.attrs.scaleX ?? 1,
                y: this.attrs.scaleY ?? 1
            };
        }

        scaleX(value) {
            if (arguments.length > 0) {
                this.attrs.scaleX = value;
                return this;
            }

            return Number(this.attrs.scaleX ?? 1);
        }

        scaleY(value) {
            if (arguments.length > 0) {
                this.attrs.scaleY = value;
                return this;
            }

            return Number(this.attrs.scaleY ?? 1);
        }

        visible(value) {
            if (arguments.length > 0) {
                this.attrs.visible = Boolean(value);
                return this;
            }

            return this.attrs.visible !== false;
        }

        opacity(value) {
            if (arguments.length > 0) {
                this.attrs.opacity = value;
                return this;
            }

            return Number(this.attrs.opacity ?? 1);
        }

        text(value) {
            if (arguments.length > 0) {
                this.attrs.text = value;
                return this;
            }

            return this.attrs.text ?? "";
        }

        fontSize(value) {
            if (arguments.length > 0) {
                this.attrs.fontSize = value;
                return this;
            }

            return Number(this.attrs.fontSize ?? 12);
        }

        fontFamily(value) {
            if (arguments.length > 0) {
                this.attrs.fontFamily = value;
                return this;
            }

            return this.attrs.fontFamily ?? "";
        }

        fill(value) {
            if (arguments.length > 0) {
                this.attrs.fill = value;
                return this;
            }

            return this.attrs.fill;
        }

        stroke(value) {
            if (arguments.length > 0) {
                this.attrs.stroke = value;
                return this;
            }

            return this.attrs.stroke;
        }

        shadowColor(value) {
            if (arguments.length > 0) {
                this.attrs.shadowColor = value;
                return this;
            }

            return this.attrs.shadowColor;
        }

        shadowBlur(value) {
            if (arguments.length > 0) {
                this.attrs.shadowBlur = value;
                return this;
            }

            return Number(this.attrs.shadowBlur ?? 0);
        }

        shadowOffset(value) {
            if (arguments.length > 0) {
                this.attrs.shadowOffset = value;
                return this;
            }

            return this.attrs.shadowOffset ?? { x: 0, y: 0 };
        }

        fillAfterStrokeEnabled(value) {
            if (arguments.length > 0) {
                this.attrs.fillAfterStrokeEnabled = Boolean(value);
                return this;
            }

            return Boolean(this.attrs.fillAfterStrokeEnabled);
        }

        strokeWidth(value) {
            if (arguments.length > 0) {
                this.attrs.strokeWidth = value;
                return this;
            }

            return Number(this.attrs.strokeWidth ?? 0);
        }

        cornerRadius(value) {
            if (arguments.length > 0) {
                this.attrs.cornerRadius = value;
                return this;
            }

            return this.attrs.cornerRadius ?? 0;
        }

        align(value) {
            if (arguments.length > 0) {
                this.attrs.align = value;
                return this;
            }

            return this.attrs.align ?? "left";
        }

        verticalAlign(value) {
            if (arguments.length > 0) {
                this.attrs.verticalAlign = value;
                return this;
            }

            return this.attrs.verticalAlign ?? "top";
        }

        wrap(value) {
            if (arguments.length > 0) {
                this.attrs.wrap = value;
                return this;
            }

            return this.attrs.wrap ?? "word";
        }

        padding(value) {
            if (arguments.length > 0) {
                this.attrs.padding = value;
                return this;
            }

            return Number(this.attrs.padding ?? 0);
        }

        lineHeight(value) {
            if (arguments.length > 0) {
                this.attrs.lineHeight = value;
                return this;
            }

            return Number(this.attrs.lineHeight ?? 1);
        }

        clipX(value) {
            if (arguments.length > 0) {
                this.attrs.clipX = value;
                return this;
            }

            return Number(this.attrs.clipX ?? 0);
        }

        clipY(value) {
            if (arguments.length > 0) {
                this.attrs.clipY = value;
                return this;
            }

            return Number(this.attrs.clipY ?? 0);
        }

        clipWidth(value) {
            if (arguments.length > 0) {
                this.attrs.clipWidth = value;
                return this;
            }

            return Number(this.attrs.clipWidth ?? 0);
        }

        clipHeight(value) {
            if (arguments.length > 0) {
                this.attrs.clipHeight = value;
                return this;
            }

            return Number(this.attrs.clipHeight ?? 0);
        }

        draggable(value) {
            if (arguments.length > 0) {
                this.attrs.draggable = Boolean(value);
                return this;
            }

            return Boolean(this.attrs.draggable);
        }

        dragBoundFunc(value) {
            if (arguments.length > 0) {
                this.attrs.dragBoundFunc = value;
                return this;
            }

            return this.attrs.dragBoundFunc;
        }

        name(value) {
            if (arguments.length > 0) {
                this.attrs.name = value;
                return this;
            }

            return this.attrs.name ?? "";
        }

        id(value) {
            if (arguments.length > 0) {
                this.attrs.id = value;
                return this;
            }

            return this.attrs.id ?? "";
        }

        image(value) {
            if (arguments.length > 0) {
                this.attrs.image = value;
                return this;
            }

            return this.attrs.image;
        }

        to() {
            return this;
        }

        destroy() {
            return this;
        }
    }

    class MockText extends MockNode {}
    class MockGroup extends MockNode {}
    class MockRect extends MockNode {}
    class MockLine extends MockNode {}
    class MockCircle extends MockNode {}
    class MockImage extends MockNode {}

    class MockSwitch {
        constructor({ label = "", checked = true } = {}) {
            this.container = new MockGroup({ width: 220, height: 40 });
            this.label = label;
            this.checked = checked;
            this.update = jest.fn();
        }
    }

    class MockHtmlImage {
        constructor() {
            this.src = "";
        }

        cloneNode() {
            const clone = new MockHtmlImage();
            clone.src = this.src;
            return clone;
        }
    }

    return {
        Group: MockGroup,
        Rect: MockRect,
        Text: MockText,
        Line: MockLine,
        Circle: MockCircle,
        Image: MockImage,
        MockSwitch,
        MockHtmlImage
    };
}

describe("Settings accessibility refresh", () => {
    let settings;
    let accessibilityMock;
    let actionbar;
    let openWindowState;
    let listenerRegistry;
    let originalDocument;
    let originalWindow;
    let originalImage;
    let originalKonva;

    beforeEach(async () => {
        jest.resetModules();

        openWindowState = "settings";
        listenerRegistry = new Map();

        const { Group, Rect, Text, Line, Circle, Image, MockSwitch, MockHtmlImage } = createMockKonva();

        originalDocument = global.document;
        originalWindow = global.window;
        originalImage = global.Image;
        originalKonva = global.Konva;

        global.document = {
            body: {
                style: {},
                classList: {
                    toggle: jest.fn(),
                    add: jest.fn(),
                    remove: jest.fn()
                }
            },
            getElementById: jest.fn((id) => {
                if (id === "music" || id === "sfx") {
                    return {
                        paused: true,
                        play: jest.fn(),
                        pause: jest.fn()
                    };
                }

                return null;
            })
        };

        global.window = global;
        global.Image = MockHtmlImage;
        global.Konva = {
            Group,
            Rect,
            Text,
            Line,
            Circle,
            Image
        };

        global.CustomEvent = class CustomEvent {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };

        global.addEventListener = jest.fn((type, handler) => {
            const handlers = listenerRegistry.get(type) ?? [];
            handlers.push(handler);
            listenerRegistry.set(type, handlers);
        });

        global.removeEventListener = jest.fn((type, handler) => {
            const handlers = listenerRegistry.get(type) ?? [];
            listenerRegistry.set(type, handlers.filter((entry) => entry !== handler));
        });

        global.dispatchEvent = jest.fn((event) => {
            const handlers = listenerRegistry.get(event.type) ?? [];
            handlers.forEach((handler) => handler(event));
            return true;
        });

        await jest.unstable_mockModule("../vnsutra_modules/runtime-state.js", () => ({
            getIsPortrait: () => false,
            getIsAndroid: () => false,
            getOpenWindow: () => openWindowState,
            setOpenWindow: (value) => {
                openWindowState = value;
            }
        }));

        await jest.unstable_mockModule("../vnsutra_modules/konva.js", () => ({}));

        accessibilityMock = {
            getSettings: () => ({ fontScale: 1 }),
            setHighContrast: jest.fn(),
            setReduceMotion: jest.fn(),
            setFontScale: jest.fn(),
            increaseFontScale: jest.fn(),
            decreaseFontScale: jest.fn(),
            applyAll: jest.fn(),
            load: jest.fn()
        };

        await jest.unstable_mockModule("../vnsutra_modules/accessibility.js", () => ({
            default: accessibilityMock,
            accessibility: accessibilityMock
        }));

        await jest.unstable_mockModule("../vnsutra_modules/i18n.js", () => ({
            i18n: {
                getSupportedLanguages: () => ["en", "es", "fr", "ja"],
                getLanguage: () => "en",
                loadLanguage: jest.fn(),
                t: (value) => value,
                process: (value) => value,
                isTranslationKey: () => false
            }
        }));

        await jest.unstable_mockModule("../vnsutra_modules/error-tracking.js", () => ({
            default: { captureError: jest.fn() }
        }));

        await jest.unstable_mockModule("../vnsutra_modules/ui/scrollable-content.js", () => ({
            bindActionbarScroll: jest.fn()
        }));

        await jest.unstable_mockModule("../vnsutra_modules/ui/utils.js", () => ({
            Switch: MockSwitch,
            animateBtn: jest.fn(),
            openBar: jest.fn(),
            closeBar: jest.fn(),
            loadImg: jest.fn(() => new MockHtmlImage())
        }));

        ({ default: settings } = await import("../vnsutra_modules/settings.js"));

        actionbar = {
            actionContent: new Group({ width: 960, height: 720 }),
            addBtn: { visible: jest.fn() },
            clear: jest.fn(),
            title: ""
        };
    });

    afterEach(() => {
        if (typeof originalDocument === "undefined") {
            delete global.document;
        } else {
            global.document = originalDocument;
        }

        if (typeof originalWindow === "undefined") {
            delete global.window;
        } else {
            global.window = originalWindow;
        }

        if (typeof originalImage === "undefined") {
            delete global.Image;
        } else {
            global.Image = originalImage;
        }

        if (typeof originalKonva === "undefined") {
            delete global.Konva;
        } else {
            global.Konva = originalKonva;
        }

        delete global.addEventListener;
        delete global.removeEventListener;
        delete global.dispatchEvent;
        delete global.CustomEvent;
    });

    it("rerenders the settings page when accessibility font scale changes", () => {
        const details = settings(
            {
                colors: {
                    primary: "#f59e0b",
                    text: "#f8fafc",
                    menu: "#111827",
                    "menu-border": "#334155",
                    secondary: "#38bdf8",
                    "primary-text": "#0f172a",
                    button: "#1f2937",
                    "button-text": "#f8fafc"
                },
                gui: {
                    button: null,
                    "settings-icon": null,
                    "group-icon": null,
                    "info-icon": null,
                    "vnsutra-label": false
                },
                ui: {
                    "vnsutra-label": false
                }
            },
            actionbar,
            {
                other: "YanoneKaffeesatz",
                title: "LavishlyYours"
            },
            {
                render: jest.fn()
            }
        );

        expect(details).toBeTruthy();

        details.render();
        expect(actionbar.clear).toHaveBeenCalledTimes(1);

        global.dispatchEvent(new global.CustomEvent(EVENTS.ACCESSIBILITY, {
            detail: { fontScale: 1.2 }
        }));

        expect(actionbar.clear).toHaveBeenCalledTimes(2);
        expect(openWindowState).toBe("settings");
    });

    it("updates saved font scale and triggers resize redraw from settings", () => {
        const details = settings(
            {
                colors: {
                    primary: "#f59e0b",
                    text: "#f8fafc",
                    menu: "#111827",
                    "menu-border": "#334155",
                    secondary: "#38bdf8",
                    "primary-text": "#0f172a",
                    button: "#1f2937",
                    "button-text": "#f8fafc"
                },
                gui: {
                    button: null,
                    "settings-icon": null,
                    "group-icon": null,
                    "info-icon": null,
                    "vnsutra-label": false
                },
                ui: {
                    "vnsutra-label": false
                }
            },
            actionbar,
            {
                other: "YanoneKaffeesatz",
                title: "LavishlyYours"
            },
            {
                render: jest.fn()
            }
        );

        expect(details).toBeTruthy();

        details.render();
        global.dispatchEvent.mockClear();

        const increaseButton = findGroupByChildText(details.container, "A+");
        expect(increaseButton).toBeTruthy();

        increaseButton.fire("click touchstart");

        expect(accessibilityMock.increaseFontScale).toHaveBeenCalledWith(0.1);
        expect(global.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "resize" }));
    });
});