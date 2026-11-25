import { jest } from "@jest/globals";
import chapters from "../vnsutra_modules/chapters.js";

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

        opacity(value) {
            if (arguments.length > 0) {
                this.attrs.opacity = value;
                return this;
            }
            return Number(this.attrs.opacity ?? 1);
        }

        visible(value) {
            if (arguments.length > 0) {
                this.attrs.visible = Boolean(value);
                return this;
            }
            return this.attrs.visible !== false;
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

    return {
        Node: MockNode,
        Text: MockText,
        Group: MockGroup,
        Rect: MockRect,
        Line: MockLine,
        Circle: MockCircle,
        Path: MockPath
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

describe("Chapters Page", () => {
    let originalKonva;
    let chaptersPage;

    beforeAll(async () => {
        globalThis.window = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };
        globalThis.document = {
            body: { style: {} }
        };
        originalKonva = globalThis.Konva;
        globalThis.Konva = createMockKonva();
        const module = await import("../vnsutra_modules/chapters-page.js");
        chaptersPage = module.chaptersPage;
    });

    afterAll(() => {
        globalThis.Konva = originalKonva;
    });

    const createMockActionbar = () => {
        const actionContent = new globalThis.Konva.Group({ width: 800, height: 600 });
        const scrollbar = new globalThis.Konva.Rect({ width: 8, height: 100 });
        return {
            actionContent,
            scrollbar,
            addBtn: { visible: jest.fn() },
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
        },
        ui: {
            chapters: {
                title: "Chapter Map"
            }
        }
    };

    const mockFonts = {
        other: { name: "Inter" }
    };

    it("renders empty state message when no chapters exist", async () => {
        await chapters.configure({ enabled: true, mode: "all", chapters: [] });
        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, actionbar, mockFonts, navigate);
        page.render();

        const emptyText = findNodeByText(page.container, "No chapters configured yet.");
        expect(emptyText).toBeTruthy();
    });

    it("renders hero progress banner and chapter cards with correct status", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"], description: "The beginning." },
            { id: "ch-2", title: "Rising Tension", scenes: ["scene2"], description: "Plot deepens." },
            { id: "notice-1", type: "notice", title: "Special Bulletin", description: "Demo note.", status: "completed" }
        ];

        await chapters.configure({ enabled: true, mode: "progressive", chapters: sampleChapters });
        chapters.startChapter("ch-1");

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, actionbar, mockFonts, navigate);
        page.render();

        // 1. Hero progress banner should exist
        const heroTitle = findNodeByText(page.container, "ROUTE PROGRESS & MILESTONES");
        expect(heroTitle).toBeTruthy();

        // Active chapter label
        const activeText = findNodeByText(page.container, "Active: Chapter 1 • Introduction");
        expect(activeText).toBeTruthy();

        // 2. Chapter cards rendered
        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card1).toBeTruthy();

        // Chapter 1 is current -> Action label should be "Continue"
        const continueBtnText = findNodeByText(card1, "Continue");
        expect(continueBtnText).toBeTruthy();

        // Chapter 2 is locked in progressive mode -> Action label should be "Locked"
        const card2 = findNodeByName(page.container, "chapter-card-ch-2");
        expect(card2).toBeTruthy();
        const lockedBtnText = findNodeByText(card2, "Locked");
        expect(lockedBtnText).toBeTruthy();

        // Notice card should show notice bulletin
        const noticeCard = findNodeByName(page.container, "chapter-card-notice-1");
        expect(noticeCard).toBeTruthy();
        const noticeBulletin = findNodeByText(noticeCard, "Informational route bulletin");
        expect(noticeBulletin).toBeTruthy();
    });

    it("triggers navigation when an unlocked chapter card is clicked", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, actionbar, mockFonts, navigate);
        page.render();

        const card = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card).toBeTruthy();

        // Fire click on unlocked card
        card.fire("click");

        expect(actionbar.close).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith("game", {
            scene: "start",
            chapterId: "ch-1"
        });
    });

    it("does not trigger navigation when a locked chapter is clicked", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Second Chapter", scenes: ["scene2"] }
        ];

        await chapters.configure({ enabled: true, mode: "progressive", chapters: sampleChapters });

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, actionbar, mockFonts, navigate);
        page.render();

        const card2 = findNodeByName(page.container, "chapter-card-ch-2");
        expect(card2).toBeTruthy();

        card2.fire("click");

        expect(navigate).not.toHaveBeenCalled();
    });

    it("handles hover mouseover and mouseout events safely", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, actionbar, mockFonts, navigate);
        page.render();

        const card = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card).toBeTruthy();

        expect(() => {
            card.fire("mouseover");
            card.fire("mouseout");
        }).not.toThrow();
    });

    it("starts the track line from the first chapter in vertical layout without hero connector", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Second Chapter", scenes: ["scene2"] },
            { id: "ch-3", title: "Third Chapter", scenes: ["scene3"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, actionbar, mockFonts, navigate);
        page.render();

        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card1).toBeTruthy();

        // page.container is mainContainer, which contains the hero banner, cards, and track connector lines
        const trackLines = page.container.children.filter((c) => c.className === "Line" && Array.isArray(c.attrs?.points));

        // For 3 chapters, there should be exactly 2 track connector lines (ch1->ch2, ch2->ch3)
        expect(trackLines.length).toBe(2);

        // Every track line must start at or below card1's top Y position (starting from first chapter node)
        trackLines.forEach((line) => {
            const startY = line.attrs.points[1];
            expect(startY).toBeGreaterThanOrEqual(card1.attrs.y);
        });
    });

    it("makes the hero header banner full width on mobile in vertical layout", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Second Chapter", scenes: ["scene2"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const portraitActionbar = {
            actionContent: new globalThis.Konva.Group({ width: 360, height: 640 }),
            scrollbar: new globalThis.Konva.Rect({ width: 8, height: 100 }),
            addBtn: { visible: jest.fn() },
            clear: jest.fn(),
            close: jest.fn((cb) => cb?.()),
            title: ""
        };
        const navigate = jest.fn();

        const page = chaptersPage(mockConfig, portraitActionbar, mockFonts, navigate);
        page.render();

        const heroBanner = findNodeByName(page.container, "chapters-hero-banner");
        expect(heroBanner).toBeTruthy();

        // In mobile vertical layout, hero banner must start at x = 0 and match mainContainer width
        expect(heroBanner.attrs.x).toBe(0);
        expect(heroBanner.attrs.width).toBe(page.container.width());

        // Chapter cards below remain aligned with the rail at cardX > 0
        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card1).toBeTruthy();
        expect(card1.attrs.x).toBeGreaterThan(heroBanner.attrs.x);
    });

    it("renders horizontal single-row timeline layout when configured by developer", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Rising Tension", scenes: ["scene2"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const horizontalConfig = {
            ...mockConfig,
            ui: {
                ...mockConfig.ui,
                chapters: {
                    ...mockConfig.ui.chapters,
                    layout: "horizontal"
                }
            }
        };

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(horizontalConfig, actionbar, mockFonts, navigate);
        page.render();

        const heroTitle = findNodeByText(page.container, "ROUTE PROGRESS & MILESTONES");
        expect(heroTitle).toBeTruthy();

        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card1).toBeTruthy();

        card1.fire("click");
        expect(actionbar.close).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith("game", {
            scene: "start",
            chapterId: "ch-1"
        });
    });

    it("renders horizontal 2-row timeline layout when configured by developer", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Rising Tension", scenes: ["scene2"] },
            { id: "ch-3", title: "Climax", scenes: ["scene3"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const dualRowConfig = {
            ...mockConfig,
            ui: {
                ...mockConfig.ui,
                chapters: {
                    ...mockConfig.ui.chapters,
                    layout: "2-row"
                }
            }
        };

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(dualRowConfig, actionbar, mockFonts, navigate);
        page.render();

        const heroTitle = findNodeByText(page.container, "ROUTE PROGRESS & MILESTONES");
        expect(heroTitle).toBeTruthy();

        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        const card2 = findNodeByName(page.container, "chapter-card-ch-2");
        const card3 = findNodeByName(page.container, "chapter-card-ch-3");
        expect(card1).toBeTruthy();
        expect(card2).toBeTruthy();
        expect(card3).toBeTruthy();

        card2.fire("click");
        expect(navigate).toHaveBeenCalledWith("game", {
            scene: "scene2",
            chapterId: "ch-2"
        });
    });

    it("prevents 2-row layout from overlapping header banner on mobile portrait", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Rising Tension", scenes: ["scene2"] },
            { id: "ch-3", title: "Climax", scenes: ["scene3"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const dualRowConfig = {
            ...mockConfig,
            ui: {
                ...mockConfig.ui,
                chapters: {
                    ...mockConfig.ui.chapters,
                    layout: "2-row"
                }
            }
        };

        // Mobile portrait dimensions (e.g. 360 x 640)
        const portraitActionbar = {
            actionContent: new globalThis.Konva.Group({ width: 360, height: 640 }),
            scrollbar: new globalThis.Konva.Rect({ width: 8, height: 100 }),
            addBtn: { visible: jest.fn() },
            clear: jest.fn(),
            close: jest.fn((cb) => cb?.()),
            title: ""
        };
        const navigate = jest.fn();

        const page = chaptersPage(dualRowConfig, portraitActionbar, mockFonts, navigate);
        page.render();

        const scrollGroup = findNodeByName(page.container, "chapters-scroll-content");
        expect(scrollGroup).toBeTruthy();

        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        const card2 = findNodeByName(page.container, "chapter-card-ch-2");
        expect(card1).toBeTruthy();
        expect(card2).toBeTruthy();

        // Cards must have compact mobile portrait dimensions
        expect(card1.attrs.width).toBe(270);
        expect(card1.attrs.height).toBe(155);

        // Header clearance check: top row card absolute Y must be comfortably below banner
        const heroGroup = findNodeByName(page.container, "chapters-hero-banner");
        expect(heroGroup).toBeTruthy();
        const bannerBottom = (heroGroup.attrs.y || 0) + (heroGroup.attrs.height || 0);
        const card1AbsoluteY = scrollGroup.attrs.y + card1.attrs.y;

        expect(card1AbsoluteY).toBeGreaterThan(bannerBottom + 16);
        expect(card2.attrs.y).toBeGreaterThan(card1.attrs.y);
    });

    it("renders adventure-map timeline layout when configured by developer", async () => {
        const sampleChapters = [
            { id: "ch-1", title: "Introduction", scenes: ["start"] },
            { id: "ch-2", title: "Mountain Shrine", scenes: ["scene2"] }
        ];

        await chapters.configure({ enabled: true, mode: "all", chapters: sampleChapters });

        const adventureConfig = {
            ...mockConfig,
            ui: {
                ...mockConfig.ui,
                chapters: {
                    ...mockConfig.ui.chapters,
                    layout: "adventure-map"
                }
            }
        };

        const actionbar = createMockActionbar();
        const navigate = jest.fn();

        const page = chaptersPage(adventureConfig, actionbar, mockFonts, navigate);
        page.render();

        const heroTitle = findNodeByText(page.container, "ROUTE PROGRESS & MILESTONES");
        expect(heroTitle).toBeTruthy();

        const card1 = findNodeByName(page.container, "chapter-card-ch-1");
        expect(card1).toBeTruthy();

        const scenePill = findNodeByText(card1, "1 Scene");
        expect(scenePill).toBeTruthy();

        const actionBtn1 = findNodeByName(card1, "action-btn-ch-1");
        expect(actionBtn1).toBeTruthy();

        card1.fire("click");
        expect(navigate).toHaveBeenCalledWith("game", {
            scene: "start",
            chapterId: "ch-1"
        });
    });
});
