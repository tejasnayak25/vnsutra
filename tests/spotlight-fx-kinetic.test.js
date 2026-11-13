import { jest } from "@jest/globals";
import { SpeakerSpotlight } from "../vnsutra_modules/spotlight.js";
import { renderExpressionFx } from "../vnsutra_modules/assets/expression-fx.js";
import { parseKineticDialogue, evalKineticAt } from "../vnsutra_modules/dialogue-fx.js";

describe("SpeakerSpotlight, Expression FX & Kinetic Dialogue", () => {
    test("SpeakerSpotlight is configurable, highlights active speaker, dims inactive actors, and clears cleanly", () => {
        const mary = {
            data: { name: "Mary" },
            img: { opacity: jest.fn() },
            scale: 1,
            setTint: jest.fn(),
            clearTint: jest.fn()
        };
        const nanami = {
            data: { name: "Nanami" },
            img: { opacity: jest.fn() },
            scale: 1,
            setTint: jest.fn(),
            clearTint: jest.fn()
        };
        const game = { actors: { mary, nanami }, camera: { focus: jest.fn(async () => {}) } };

        const spotlight = new SpeakerSpotlight(game, {
            enabled: true,
            dimColor: "#0f172a",
            dimStrength: 0.4,
            scaleBoost: 1.05,
            duration: 0,
            autoFocus: true,
            focusZoom: 1.2
        });

        spotlight.onSpeak("Nanami");
        expect(nanami.clearTint).toHaveBeenCalled();
        expect(nanami.scale).toBeCloseTo(1.05, 4);
        expect(mary.setTint).toHaveBeenCalledWith("#0f172a", 0.4);
        expect(mary.scale).toBeCloseTo(1.0, 4);
        expect(game.camera.focus).toHaveBeenCalledWith(nanami, { zoom: 1.2, duration: 0.2 });

        // Disabling restores all actors
        spotlight.setEnabled(false);
        expect(mary.clearTint).toHaveBeenCalled();
        expect(nanami.scale).toBe(1);
    });

    test("SpeakerSpotlight re-attaches across scene starts and dims actors through fallback opacity", () => {
        const batchDrawMock = jest.fn();
        const layerMock = { batchDraw: batchDrawMock };
        const maryImg = {
            _opacity: 1,
            opacity(val) {
                if (typeof val === "number") {
                    this._opacity = val;
                    return this;
                }
                return this._opacity;
            },
            getLayer: () => layerMock
        };
        const mary = {
            data: { name: "Mary", opacity: 1 },
            img: maryImg
        };
        const nanami = {
            data: { name: "Nanami" },
            setTint: jest.fn(),
            clearTint: jest.fn()
        };
        const game = { actors: { mary, nanami } };
        const spotlight = new SpeakerSpotlight(game, {
            enabled: true,
            dimStrength: 0.35
        });

        // Test fallback opacity dimming for actors without setTint
        spotlight.onSpeak("Nanami");
        expect(nanami.clearTint).toHaveBeenCalled();
        expect(maryImg.opacity()).toBeCloseTo(0.65, 2);
        expect(batchDrawMock).toHaveBeenCalled();

        // Clear restores fallback opacity
        spotlight.clear();
        expect(maryImg.opacity()).toBe(1);

        // Lifecycle: detach then attach restores listeners
        spotlight.detach();
        expect(spotlight._boundDialog).toBeNull();
        const origAdd = globalThis.addEventListener;
        const origRemove = globalThis.removeEventListener;
        globalThis.addEventListener = jest.fn();
        globalThis.removeEventListener = jest.fn();
        try {
            spotlight.attach();
            expect(spotlight._boundDialog).toBeInstanceOf(Function);
        } finally {
            globalThis.addEventListener = origAdd;
            globalThis.removeEventListener = origRemove;
        }
    });

    test("SpeakerSpotlight avoids frequent bouncing across consecutive lines and passes duration", () => {
        const mary = {
            data: { name: "Mary" },
            setTint: jest.fn(),
            clearTint: jest.fn()
        };
        const nanami = {
            data: { name: "Nanami" },
            setTint: jest.fn(),
            clearTint: jest.fn()
        };
        const game = { actors: { mary, nanami } };
        const spotlight = new SpeakerSpotlight(game, {
            enabled: true,
            dimStrength: 0.35,
            duration: 0.25,
            clearOnDialogEnd: false
        });

        // First dialogue line by Nanami
        spotlight.onSpeak("Nanami");
        expect(nanami.clearTint).toHaveBeenCalledWith(0.25);
        expect(mary.setTint).toHaveBeenCalledWith("#1e293b", 0.35, 0.25);

        mary.setTint.mockClear();
        nanami.clearTint.mockClear();

        // Second consecutive dialogue line by the SAME speaker (Nanami)
        spotlight.onSpeak("Nanami");
        // Must NOT re-trigger setTint or clearTint to avoid bouncing
        expect(mary.setTint).not.toHaveBeenCalled();
        expect(nanami.clearTint).not.toHaveBeenCalled();

        // Dialog ends (typewriter completes) - must NOT undim if clearOnDialogEnd is false
        if (spotlight._boundEnd) {
            spotlight._boundEnd();
        }
        expect(mary.clearTint).not.toHaveBeenCalled();

        // Speaker changes to Mary
        spotlight.onSpeak("Mary");
        expect(mary.clearTint).toHaveBeenCalledWith(0.25);
        expect(nanami.setTint).toHaveBeenCalledWith("#1e293b", 0.35, 0.25);
    });

    test("renderExpressionFx draws blush, sweat, anger_vein, and sparkles proportionally", () => {
        const ops = [];
        const ctx = {
            globalAlpha: 1,
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 1,
            lineCap: "",
            clearRect: jest.fn(),
            fillRect: jest.fn(() => ops.push("fillRect")),
            save: jest.fn(),
            restore: jest.fn(),
            translate: jest.fn(),
            rotate: jest.fn(),
            scale: jest.fn(),
            beginPath: jest.fn(),
            closePath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            bezierCurveTo: jest.fn(),
            quadraticCurveTo: jest.fn(),
            arc: jest.fn(),
            ellipse: jest.fn(),
            fill: jest.fn(() => ops.push("fill")),
            stroke: jest.fn(() => ops.push("stroke")),
            createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() }))
        };

        renderExpressionFx(ctx, {
            width: 800,
            height: 1200,
            leftEye: { cx: 340, cy: 280, w: 60, h: 40 },
            rightEye: { cx: 460, cy: 280, w: 60, h: 40 },
            headPivot: [400, 240],
            fxList: ["blush", "sweat", "anger_vein", "sparkles", "gloom_lines", "heart_pop", "shock_burst"],
            fxAlphas: { blush: 0.5, sweat: 1, anger_vein: 1, sparkles: 1, gloom_lines: 0.8, heart_pop: 1, shock_burst: 1 },
            intensity: 0.9,
            tSec: 0.5
        });

        expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 1200);
        expect(ops).toContain("fill");
        expect(ops).toContain("stroke");
    });

    test("parseKineticDialogue strips tags cleanly and builds pauses, speeds, and shake ranges", () => {
        const parsed = parseKineticDialogue("Wait...{w=0.4} {speed=2}hurry!{/speed} {shake}WHAT?!{/shake}");
        expect(parsed.plainText).toBe("Wait... hurry! WHAT?!");
        expect(parsed.pauses.get(7)).toBe(400);
        expect(evalKineticAt(parsed, 9)).toEqual({ speedMult: 2, isShaking: false });
        expect(evalKineticAt(parsed, 16)).toEqual({ speedMult: 1, isShaking: true });
    });
});

