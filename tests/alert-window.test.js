import { jest } from "@jest/globals";
import { AlertWindow } from "../vnsutra_modules/alert-window.js";

function createMockElement(id = "", tagName = "div") {
    const classList = new Set();
    const attributes = {};
    const styles = {
        setProperty: jest.fn((k, v) => { styles[k] = v; })
    };
    const children = [];
    const listeners = {};

    return {
        id,
        tagName,
        innerText: "",
        textContent: "",
        innerHTML: "",
        style: styles,
        children,
        classList: {
            add: jest.fn((...cls) => cls.forEach(c => classList.add(c))),
            remove: jest.fn((...cls) => cls.forEach(c => classList.delete(c))),
            contains: jest.fn((cls) => classList.has(cls)),
            replace: jest.fn((oldCls, newCls) => {
                classList.delete(oldCls);
                classList.add(newCls);
            })
        },
        setAttribute: jest.fn((name, val) => { attributes[name] = val; }),
        getAttribute: jest.fn((name) => attributes[name] ?? null),
        addEventListener: jest.fn((type, fn) => {
            listeners[type] = listeners[type] || [];
            listeners[type].push(fn);
        }),
        removeEventListener: jest.fn((type, fn) => {
            if (listeners[type]) {
                listeners[type] = listeners[type].filter(f => f !== fn);
            }
        }),
        dispatchEvent: jest.fn((event) => {
            if (listeners[event.type]) {
                listeners[event.type].forEach(fn => fn(event));
            }
        }),
        focus: jest.fn(),
        append: jest.fn((...nodes) => children.push(...nodes)),
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => []),
        _classListSet: classList,
        _attributes: attributes,
        _listeners: listeners
    };
}

describe("AlertWindow Component", () => {
    let originalDoc;
    let mockWin, mockCard, mockMsg, mockInput, mockOpts, mockBtns;
    let mockAccent, mockHeader, mockIconWrap, mockIcon, mockBadge, mockTitle, mockCloseX, mockQueryBox;

    beforeEach(() => {
        originalDoc = global.document;

        mockWin = createMockElement("alert-win", "section");
        mockWin.classList.add("hidden");

        mockCard = createMockElement("alert-card", "div");
        mockMsg = createMockElement("alert-message", "p");
        mockQueryBox = createMockElement("alert-query-box", "div");
        mockInput = createMockElement("alert-input", "div");
        mockOpts = createMockElement("alert-opts", "div");
        mockBtns = createMockElement("alert-btns", "div");
        mockAccent = createMockElement("alert-accent-line", "div");
        mockHeader = createMockElement("alert-header", "div");
        mockIconWrap = createMockElement("alert-icon-wrap", "div");
        mockIcon = createMockElement("alert-icon", "span");
        mockBadge = createMockElement("alert-badge", "span");
        mockTitle = createMockElement("alert-title", "h3");
        mockCloseX = createMockElement("alert-close-x", "button");

        const elements = {
            "#alert-card": mockCard,
            "#alert-message": mockMsg,
            "#alert-message-text": mockMsg,
            "#alert-query-box": mockQueryBox,
            "#alert-input": mockInput,
            "#alert-opts": mockOpts,
            "#alert-btns": mockBtns,
            "#alert-accent-line": mockAccent,
            "#alert-header": mockHeader,
            "#alert-icon-wrap": mockIconWrap,
            "#alert-icon": mockIcon,
            "#alert-badge": mockBadge,
            "#alert-title": mockTitle,
            "#alert-close-x": mockCloseX
        };

        mockWin.querySelector = jest.fn((sel) => {
            const parts = sel.split(",").map(s => s.trim());
            for (const part of parts) {
                if (elements[part]) return elements[part];
            }
            return null;
        });

        global.document = {
            getElementById: jest.fn((id) => (id === "alert-win" ? mockWin : null))
        };
    });

    afterEach(() => {
        global.document = originalDoc;
        AlertWindow.activeInstance = null;
    });

    it("initializes and sets ARIA dialog attributes", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("Welcome", [], config);

        expect(alertWin.win).toBe(mockWin);
        expect(mockWin.setAttribute).toHaveBeenCalledWith("role", "dialog");
        expect(mockWin.setAttribute).toHaveBeenCalledWith("aria-modal", "true");
        expect(mockWin.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
    });

    it("detects quit/exit contextual headers", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("Are you sure you want to quit?", [], config);
        alertWin.show();

        expect(mockBadge.innerText).toBe("CONFIRMATION");
        expect(mockTitle.innerText).toBe("Quit Game");
    });

    it("detects delete record warning contextual headers", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("Are you sure you want to delete this saved record?", [], config);
        alertWin.show();

        expect(mockBadge.innerText).toBe("WARNING");
        expect(mockTitle.innerText).toBe("Delete Record");
    });

    it("detects system update and orientation contextual headers", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("An update is available!", [], config);
        alertWin.show();
        expect(mockBadge.innerText).toBe("UPDATE");
        expect(mockTitle.innerText).toBe("System Update");

        alertWin.message = "Change orientation to landscape";
        expect(mockBadge.innerText).toBe("DISPLAY");
        expect(mockTitle.innerText).toBe("Change Orientation");
    });

    it("allows custom title and badge override", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("Sample text", [], config);
        alertWin.title = "Save Complete";
        alertWin.badge = "SUCCESS";
        alertWin.show();

        expect(alertWin.title).toBe("Save Complete");
        expect(alertWin.badge).toBe("SUCCESS");
        expect(mockTitle.innerText).toBe("Save Complete");
        expect(mockBadge.innerText).toBe("SUCCESS");
    });

    it("supports dynamic theme color customization", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("Danger prompt", [], config);

        alertWin.color = "#ef4444";
        expect(alertWin.color).toBe("#ef4444");
        expect(mockCard.style.borderColor).toBe("#ef4444");
        expect(mockQueryBox.style.borderLeftColor).toBe("#ef4444");
        expect(mockIconWrap.style.color).toBe("#ef4444");
        expect(mockBadge.style.color).toBe("#ef4444");
    });

    it("toggles visibility during show and close", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const alertWin = new AlertWindow("Visibility test", [], config);

        alertWin.show();
        expect(mockWin.classList.replace).toHaveBeenCalledWith("hidden", "flex");
        expect(mockWin.setAttribute).toHaveBeenCalledWith("aria-hidden", "false");

        // With reduceMotion true, close hides immediately
        globalThis.__vnsutraReduceMotion = true;
        alertWin.close();
        expect(mockWin.classList.replace).toHaveBeenCalledWith("flex", "hidden");
        expect(mockWin.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
        delete globalThis.__vnsutraReduceMotion;
    });

    it("dismiss triggers cancel button click if present", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const cancelBtn = {
            innerText: "Cancel",
            click: jest.fn()
        };
        mockBtns.querySelectorAll = jest.fn(() => [cancelBtn]);

        const alertWin = new AlertWindow("Cancelable", [], config);
        mockWin.classList.contains = jest.fn((cls) => cls === "flex"); // simulate open
        alertWin.dismiss();

        expect(cancelBtn.click).toHaveBeenCalledTimes(1);
    });

    it("handles input prompt type", () => {
        const config = { colors: { primary: "#B88AEF", menu: "#17152F", text: "#F8F2FF" } };
        const mockInputEl = createMockElement("custom-input", "input");

        const alertWin = new AlertWindow("Enter your name", [], config, "input", { input: mockInputEl });
        alertWin.show();

        expect(mockInput.classList.replace).toHaveBeenCalledWith("hidden", "flex");
        expect(mockInputEl.setAttribute).toHaveBeenCalledWith("aria-label", "Enter your name");
        expect(mockInputEl.focus).toHaveBeenCalled();
    });
});
