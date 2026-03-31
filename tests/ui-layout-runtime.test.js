import { createKonvaNodesFromPlan, evaluateDynamicValue, resolvePlanNodeAttrs } from "../vnsutra_modules/ui-layout/runtime.js";

describe("ui-layout runtime", () => {
    test("evaluates calc/percent/viewport expressions", () => {
        const context = {
            stageWidth: 1000,
            stageHeight: 600,
            parentWidth: 300,
            parentHeight: 200
        };

        const result = evaluateDynamicValue({
            kind: "calc",
            op: "+",
            left: { kind: "percent", value: 10, base: "parentWidth" },
            right: { kind: "viewport", axis: "height", value: 1 }
        }, context);

        expect(result).toBeCloseTo(36);
    });

    test("merges static and dynamic attrs", () => {
        const attrs = resolvePlanNodeAttrs({
            attrs: { text: "Menu", fill: "#fff" },
            dynamic: {
                x: { kind: "percent", value: 20, base: "parentWidth" },
                y: { kind: "percent", value: 50, base: "parentHeight" }
            }
        }, {
            stageWidth: 1200,
            stageHeight: 700,
            parentWidth: 400,
            parentHeight: 300
        });

        expect(attrs).toEqual({
            text: "Menu",
            fill: "#fff",
            x: 80,
            y: 150
        });
    });

    test("applies portrait overrides when context.isPortrait is true", () => {
        const nodePlan = {
            attrs: { fill: "#fff" },
            dynamic: { width: { kind: "percent", value: 25, base: "parentWidth" } },
            portraitAttrs: { visible: false, width: 0 }
        };

        const landscape = resolvePlanNodeAttrs(nodePlan, {
            stageWidth: 1200,
            stageHeight: 700,
            parentWidth: 1200,
            parentHeight: 700,
            isPortrait: false
        });

        const portrait = resolvePlanNodeAttrs(nodePlan, {
            stageWidth: 400,
            stageHeight: 700,
            parentWidth: 400,
            parentHeight: 700,
            isPortrait: true
        });

        expect(landscape.width).toBe(300);
        expect(landscape.visible).toBeUndefined();
        expect(portrait.visible).toBe(false);
        expect(portrait.width).toBe(0);
    });

    test("applies android-landscape override on top of landscape", () => {
        const nodePlan = {
            attrs: {},
            dynamic: { width: { kind: "percent", value: 25, base: "parentWidth" } },
            landscapeAttrs: { opacity: 0.9 },
            androidAttrs: { opacity: 0.85 },
            androidLandscapeAttrs: { opacity: 0.75, width: 10 }
        };

        const androidLandscape = resolvePlanNodeAttrs(nodePlan, {
            stageWidth: 1200,
            stageHeight: 700,
            parentWidth: 1200,
            parentHeight: 700,
            isPortrait: false,
            isAndroid: true
        });

        expect(androidLandscape.width).toBe(10);
        expect(androidLandscape.opacity).toBe(0.75);
    });

    test("resolves percent against parentWidth not stageWidth", () => {
        const attrs = resolvePlanNodeAttrs({
            attrs: {},
            dynamic: { width: { kind: "percent", value: 50, base: "parentWidth" } }
        }, {
            stageWidth: 1200,
            stageHeight: 700,
            parentWidth: 800,
            parentHeight: 600
        });

        expect(attrs.width).toBe(400);
    });

    test("preserves declarative ids on created Konva nodes", () => {
        class MockNode {
            constructor(attrs = {}) {
                this.attrs = { ...attrs };
                this.children = [];
            }

            add(child) {
                this.children.push(child);
            }

            on() {
                return undefined;
            }
        }

        const Konva = {
            Group: MockNode,
            Rect: MockNode,
            Text: MockNode,
            Image: MockNode
        };

        const plan = {
            nodes: [
                {
                    id: "dialog-message",
                    type: "text",
                    parentId: null,
                    attrs: {
                        text: "Hello"
                    },
                    dynamic: {},
                    events: {}
                }
            ]
        };

        const { nodesById } = createKonvaNodesFromPlan({
            Konva,
            plan,
            context: {
                stageWidth: 1200,
                stageHeight: 700,
                parentWidth: 1200,
                parentHeight: 700
            }
        });

        expect(nodesById.get("dialog-message").node.attrs.id).toBe("dialog-message");
    });

    test("hydrates image nodes from declarative src", () => {
        class MockNode {
            constructor(attrs = {}) {
                this.attrs = { ...attrs };
                this.children = [];
            }

            add(child) {
                this.children.push(child);
            }

            on() {
                return undefined;
            }

            setAttrs(attrs) {
                Object.assign(this.attrs, attrs);
            }

            setAttr(name, value) {
                this.attrs[name] = value;
            }

            getAttr(name) {
                return this.attrs[name];
            }

            getLayer() {
                return {
                    batchDraw() {
                        return undefined;
                    }
                };
            }
        }

        class MockImageNode extends MockNode {
            image(img) {
                this.boundImage = img;
            }
        }

        const Konva = {
            Group: MockNode,
            Rect: MockNode,
            Text: MockNode,
            Image: MockImageNode
        };

        const originalImage = globalThis.Image;

        class FakeImage {
            set src(value) {
                this._src = value;
                if (typeof this.onload === "function") {
                    this.onload();
                }
            }

            get src() {
                return this._src;
            }
        }

        globalThis.Image = FakeImage;

        try {
            const plan = {
                nodes: [
                    {
                        id: "hero",
                        type: "image",
                        parentId: null,
                        attrs: {
                            src: "./assets/images/hero.png",
                            width: 100,
                            height: 80
                        },
                        dynamic: {},
                        events: {}
                    }
                ]
            };

            const { nodesById } = createKonvaNodesFromPlan({
                Konva,
                plan,
                context: {
                    stageWidth: 1200,
                    stageHeight: 700,
                    parentWidth: 1200,
                    parentHeight: 700
                }
            });

            const hero = nodesById.get("hero").node;
            expect(hero.attrs.src).toBeUndefined();
            expect(hero.boundImage).toBeDefined();
            expect(hero.boundImage.src).toBe("./assets/images/hero.png");
        } finally {
            globalThis.Image = originalImage;
        }
    });
});
