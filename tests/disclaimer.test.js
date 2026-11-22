import { jest } from "@jest/globals";
import { DisclaimerWindow } from "../vnsutra_modules/disclaimer.js";

function createMockElement(id = "", tagName = "div") {
    const classList = new Set();
    const attributes = {};
    const styles = {};
    const listeners = {};

    return {
        id,
        tagName,
        innerText: "",
        textContent: "",
        innerHTML: "",
        style: styles,
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
        querySelectorAll: jest.fn(() => []),
        _listeners: listeners
    };
}

describe("DisclaimerWindow Component", () => {
    let mockElements;
    const mockConfig = {
        colors: {
            primary: "#B88AEF",
            secondary: "#F2A9D5",
            menu: "#17152F",
            text: "#F8F2FF"
        }
    };

    beforeEach(() => {
        mockElements = {
            "disclaimer-modal": createMockElement("disclaimer-modal"),
            "disclaimer-card": createMockElement("disclaimer-card"),
            "disclaimer-title": createMockElement("disclaimer-title"),
            "disclaimer-badge": createMockElement("disclaimer-badge"),
            "disclaimer-body": createMockElement("disclaimer-body"),
            "disclaimer-body-wrap": createMockElement("disclaimer-body-wrap"),
            "disclaimer-btn": createMockElement("disclaimer-btn"),
            "disclaimer-close-x": createMockElement("disclaimer-close-x"),
            "disclaimer-accent-line": createMockElement("disclaimer-accent-line"),
            "disclaimer-icon-wrap": createMockElement("disclaimer-icon-wrap"),
            "disclaimer-icon": createMockElement("disclaimer-icon")
        };

        globalThis.document = {
            getElementById: jest.fn((id) => mockElements[id] || null),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };
    });

    it("initializes and mounts elements from DOM correctly", () => {
        const disclaimer = new DisclaimerWindow(mockConfig);
        expect(disclaimer.modal).toBe(mockElements["disclaimer-modal"]);
        expect(disclaimer.card).toBe(mockElements["disclaimer-card"]);
        expect(disclaimer.button).toBe(mockElements["disclaimer-btn"]);
    });

    it("displays disclaimer content and resolves when user acknowledges", async () => {
        const disclaimer = new DisclaimerWindow(mockConfig);
        const sampleHtml = "<h2>Notice</h2><p>Content for testing.</p>";

        const showPromise = disclaimer.show(sampleHtml);

        expect(disclaimer.body.innerHTML).toBe(sampleHtml);
        expect(disclaimer.title.textContent).toBe("Disclaimer & Guidelines");
        expect(disclaimer.button.textContent).toBe("I Understand & Proceed");
        expect(disclaimer.modal.classList.remove).toHaveBeenCalledWith("hidden");
        expect(disclaimer.modal.classList.add).toHaveBeenCalledWith("flex");

        // Simulate click on I Understand button
        const btnClickHandler = disclaimer.button._listeners["click"]?.[0];
        expect(btnClickHandler).toBeDefined();
        btnClickHandler();

        const result = await showPromise;
        expect(result).toBe(true);
    });

    it("displays error fallback message gracefully", async () => {
        const disclaimer = new DisclaimerWindow(mockConfig);
        const errorPromise = disclaimer.showError("Failed to load disclaimer content.");

        expect(disclaimer.title.textContent).toBe("Notice");
        expect(disclaimer.badge.textContent).toBe("Notice");
        expect(disclaimer.button.textContent).toBe("Continue");

        // Simulate acknowledging error
        const btnClickHandler = disclaimer.button._listeners["click"]?.[0];
        expect(btnClickHandler).toBeDefined();
        btnClickHandler();

        const result = await errorPromise;
        expect(result).toBe(true);
    });
});
