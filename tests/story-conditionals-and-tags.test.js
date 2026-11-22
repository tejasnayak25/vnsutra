import { evaluateCondition } from "../vnsutra_modules/story-script-runner.js";
import { parseKineticDialogue } from "../vnsutra_modules/dialogue-fx.js";

describe("Story Conditionals & Rich Text Tags", () => {
    describe("Rich Text Dialogue Tags", () => {
        it("strips formatting tags from plainText while preserving timing and recording styles", () => {
            const raw = "Welcome to {b}VN-Sutra{/b}! This is {i}italic{/i} and {color=#ff4444}red text{/color}.";
            const parsed = parseKineticDialogue(raw);

            expect(parsed.plainText).toBe("Welcome to VN-Sutra! This is italic and red text.");
            expect(parsed.styles).toEqual([
                { start: 11, end: 19, bold: true },
                { start: 29, end: 35, italic: true },
                { start: 40, end: 48, color: "#ff4444" }
            ]);
        });

        it("supports size tags alongside kinetic tags", () => {
            const raw = "{shake}{size=1.5}SHOUT!{/size}{/shake} Now whisper: {size=0.8}secret{/size}";
            const parsed = parseKineticDialogue(raw);

            expect(parsed.plainText).toBe("SHOUT! Now whisper: secret");
            expect(parsed.shakes).toEqual([{ start: 0, end: 6 }]);
            expect(parsed.styles).toEqual([
                { start: 0, end: 6, size: 1.5 },
                { start: 20, end: 26, size: 0.8 }
            ]);
        });
    });

    describe("evaluateCondition logic", () => {
        it("evaluates single truthy / falsy / not conditions", () => {
            const testTruthy = { op: "truthy", value: { fromVar: "hasFlashlight" } };
            expect(evaluateCondition(testTruthy, { hasFlashlight: false })).toBe(false);
            expect(evaluateCondition(testTruthy, { hasFlashlight: true })).toBe(true);
            expect(evaluateCondition(testTruthy, {})).toBe(false);

            const testNot = { op: "not", test: testTruthy };
            expect(evaluateCondition(testNot, { hasFlashlight: true })).toBe(false);
            expect(evaluateCondition(testNot, { hasFlashlight: false })).toBe(true);
        });

        it("evaluates compound AND expressions", () => {
            const andTest = {
                op: "and",
                conditions: [
                    { left: { fromVar: "score" }, op: ">=", right: 10 },
                    { left: { fromVar: "hasKey" }, op: "===", right: true }
                ]
            };

            expect(evaluateCondition(andTest, { score: 9, hasKey: true })).toBe(false);
            expect(evaluateCondition(andTest, { score: 10, hasKey: false })).toBe(false);
            expect(evaluateCondition(andTest, { score: 10, hasKey: true })).toBe(true);
            expect(evaluateCondition(andTest, { score: 15, hasKey: true })).toBe(true);
        });

        it("evaluates compound OR expressions", () => {
            const orTest = {
                op: "or",
                conditions: [
                    { left: { fromVar: "score" }, op: ">=", right: 10 },
                    { left: { fromVar: "vip" }, op: "===", right: true }
                ]
            };

            expect(evaluateCondition(orTest, { score: 5, vip: false })).toBe(false);
            expect(evaluateCondition(orTest, { score: 12, vip: false })).toBe(true);
            expect(evaluateCondition(orTest, { score: 3, vip: true })).toBe(true);
        });
    });
});
