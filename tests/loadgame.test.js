import { jest } from "@jest/globals";
import { storage } from "../vnsutra_modules/storage.js";
import autoSave from "../vnsutra_modules/autosave.js";

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

        setAttrs(config = {}) {
            Object.entries(config).forEach(([key, value]) => {
                this._setAttr(key, value);
            });
            return this;
        }

        getAttrs() {
            return { ...this.attrs };
        }

        getClassName() {
            return this.className || this.nodeType;
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

        on(eventName, handler) {
            const names = String(eventName).trim().split(/\s+/);
            names.forEach((name) => {
                this.listeners[name] = handler;
            });
            return this;
        }

        off() {
            return this;
        }

        fire(eventName, payload = {}) {
            this.listeners[eventName]?.(payload);
            return this;
        }

        visible(value) {
            if (arguments.length > 0) {
                this.attrs.visible = Boolean(value);
                return this;
            }
            return this.attrs.visible !== false;
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
            return Number(this.attrs.height ?? 20);
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

        text(value) {
            if (arguments.length > 0) {
                this.attrs.text = value;
                return this;
            }
            return this.attrs.text ?? "";
        }

        getStage() {
            return { id: "mock-stage" };
        }

        getLayer() {
            return {
                draw: jest.fn(),
                batchDraw: jest.fn()
            };
        }

        to() {
            return {
                destroy: jest.fn()
            };
        }

        moveToBottom() {
            return this;
        }

        moveUp() {
            return this;
        }

        destroy() {
            return this;
        }
    }

    class MockText extends MockNode { }
    class MockGroup extends MockNode { }
    class MockRect extends MockNode { }
    class MockLine extends MockNode { }
    class MockCircle extends MockNode { }
    class MockPath extends MockNode { }
    class MockImage extends MockNode { }

    return {
        Node: MockNode,
        Text: MockText,
        Group: MockGroup,
        Rect: MockRect,
        Line: MockLine,
        Circle: MockCircle,
        Path: MockPath,
        Image: MockImage
    };
}

function findNodeByText(node, text) {
    if (!node) return null;
    if (typeof node.text === "function" && node.text() === text) {
        return node;
    }
    if (typeof node.getChildren === "function") {
        for (const child of node.getChildren()) {
            const found = findNodeByText(child, text);
            if (found) return found;
        }
    }
    return null;
}

function findNodeByName(node, name) {
    if (!node) return null;
    if (node.attrs?.name === name) {
        return node;
    }
    if (typeof node.getChildren === "function") {
        for (const child of node.getChildren()) {
            const found = findNodeByName(child, name);
            if (found) return found;
        }
    }
    return null;
}

describe("LoadGame / SaveGame Page", () => {
    let originalKonva;
    let loadgame;

    beforeAll(async () => {
        globalThis.window = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };
        globalThis.document = {
            body: { style: {} },
            getElementById: jest.fn(() => null),
            createElement: jest.fn(() => ({
                classList: { replace: jest.fn() },
                style: {},
                onclick: null,
                innerText: "",
                className: ""
            }))
        };
        originalKonva = globalThis.Konva;
        globalThis.Konva = createMockKonva();
        const module = await import("../vnsutra_modules/loadgame.js");
        loadgame = module.loadgame;
    });

    afterAll(() => {
        globalThis.Konva = originalKonva;
    });

    const createMockActionbar = () => {
        const actionContent = new globalThis.Konva.Group({ width: 800, height: 600 });
        const scrollbar = new globalThis.Konva.Rect({ width: 8, height: 100 });
        const addBtn = new globalThis.Konva.Rect({ width: 40, height: 40 });
        return {
            actionContent,
            scrollbar,
            addBtn,
            clear: jest.fn(),
            close: jest.fn((cb) => cb?.()),
            title: ""
        };
    };

    const mockConfig = {
        colors: {
            primary: "#B88AEF",
            secondary: "#F2A9D5",
            gold: "#F6C66B",
            text: "#F8F2FF",
            "timestamp-text": "#D8CCE8"
        }
    };

    const mockFonts = {
        other: { name: "Inter" }
    };

    beforeEach(async () => {
        jest.spyOn(storage, "getItem").mockResolvedValue([]);
        jest.spyOn(storage, "setItem").mockResolvedValue(true);
        jest.spyOn(autoSave, "load").mockResolvedValue(null);
    });

    it("renders empty state card when no saved records exist in load mode", async () => {
        const actionbar = createMockActionbar();
        const click = jest.fn();

        await loadgame(mockConfig, actionbar, "Load Game", mockFonts, null, click, false);

        const emptyTitle = findNodeByText(actionbar.actionContent, "No Saved Chronicles Found");
        expect(emptyTitle).toBeTruthy();
    });

    it("renders create-new-save card in save mode (add = true) and keeps window open", async () => {
        const actionbar = createMockActionbar();
        const addFunc = jest.fn();

        await loadgame(mockConfig, actionbar, "Save Game", mockFonts, null, jest.fn(), true, addFunc);

        const newSaveCard = findNodeByName(actionbar.actionContent, "new-save-card");
        expect(newSaveCard).toBeTruthy();

        const newCardTitle = findNodeByText(newSaveCard, "CREATE NEW SAVE");
        expect(newCardTitle).toBeTruthy();

        newSaveCard.fire("click");
        expect(actionbar.close).not.toHaveBeenCalled();
        expect(addFunc).toHaveBeenCalled();
    });

    it("renders autosave and regular save cards with proper badges", async () => {
        jest.spyOn(autoSave, "load").mockResolvedValue({
            id: "auto-1",
            timestamp: Date.now(),
            scene: "start"
        });
        jest.spyOn(storage, "getItem").mockResolvedValue([
            { id: "save-1", timestamp: Date.now() - 1000, scene: "scene2" }
        ]);

        const actionbar = createMockActionbar();
        const click = jest.fn();

        await loadgame(mockConfig, actionbar, "Load Game", mockFonts, null, click, false);

        const autoBadge = findNodeByText(actionbar.actionContent, "✦ AUTO SAVE");
        expect(autoBadge).toBeTruthy();

        const regularBadge = findNodeByText(actionbar.actionContent, "✦ SAVE 01");
        expect(regularBadge).toBeTruthy();
    });

    it("invokes click handler and closes actionbar when a save card is selected", async () => {
        const testSave = { id: "save-42", timestamp: Date.now(), scene: "start" };
        jest.spyOn(storage, "getItem").mockResolvedValue([testSave]);

        const actionbar = createMockActionbar();
        const click = jest.fn();

        await loadgame(mockConfig, actionbar, "Load Game", mockFonts, null, click, false);

        const saveCard = findNodeByName(actionbar.actionContent, "save-slot-save-42");
        expect(saveCard).toBeTruthy();

        saveCard.fire("click");
        expect(actionbar.close).toHaveBeenCalled();
        expect(click).toHaveBeenCalledWith(expect.objectContaining({ id: "save-42" }), saveCard);
    });
});
