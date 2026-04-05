import { jest } from "@jest/globals";

function createFakeKonvaImage({
    initialImage = { width: 100, height: 200 },
    initialX = 0,
    initialY = 0,
    initialScale = 1
} = {}) {
    let currentImage = initialImage;
    let currentX = initialX;
    let currentY = initialY;
    let currentScaleX = initialScale;
    let currentScaleY = initialScale;
    const attrs = new Map();

    return {
        image(value) {
            if (typeof value !== "undefined") {
                currentImage = value;
                return this;
            }
            return currentImage;
        },
        x(value) {
            if (typeof value !== "undefined") {
                currentX = value;
                return this;
            }
            return currentX;
        },
        y(value) {
            if (typeof value !== "undefined") {
                currentY = value;
                return this;
            }
            return currentY;
        },
        scale(value) {
            if (value && typeof value === "object") {
                currentScaleX = value.x;
                currentScaleY = value.y;
                return this;
            }
            return { x: currentScaleX, y: currentScaleY };
        },
        scaleX() {
            return currentScaleX;
        },
        scaleY() {
            return currentScaleY;
        },
        setAttr(key, value) {
            attrs.set(key, value);
            return this;
        },
        getAttr(key) {
            return attrs.get(key);
        }
    };
}

describe("Outfit positioning", () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test("preserves negative relative x when mood swap recalculates width", async () => {
        const containerWidth = 1000;
        const containerHeight = 600;

        await jest.unstable_mockModule("../vnsutra_modules/runtime-state.js", () => ({
            getGame: () => ({
                ui: {
                    game: {
                        container: {
                            width: () => containerWidth,
                            height: () => containerHeight,
                            getAttrs: () => ({ width: containerWidth, height: containerHeight })
                        }
                    }
                }
            }),
            getIsPortrait: () => false
        }));

        await jest.unstable_mockModule("../vnsutra_modules/error-tracking.js", () => ({
            default: {
                captureError: jest.fn()
            }
        }));

        const { Outfit } = await import("../vnsutra_modules/assets/outfit.js");

        const img = createFakeKonvaImage({
            initialImage: { width: 100, height: 200 },
            initialX: -100,
            initialY: 100,
            initialScale: 1
        });

        const character = {
            data: { x: -0.25, y: 0.2, scale: 1 },
            outfits: {}
        };

        const outfit = new Outfit(img, "casual", character);
        outfit.moods["happy.png"] = { width: 120, height: 200 };

        outfit.mood = "happy";

        expect(img.x()).toBeLessThan(0);
        expect(character.data.x).toBeLessThan(0);
    });
});
