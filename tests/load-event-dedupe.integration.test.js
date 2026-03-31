import { buildSavedGameEntry } from "../vnsutra_modules/save-utils.js";
import { buildLoadEventSignature, isRapidDuplicate } from "../vnsutra_modules/scene-transition-utils.js";

describe("Load Event Dedupe Integration", () => {
    it("marks immediate repeated load payloads as rapid duplicates", () => {
        const entry = buildSavedGameEntry({
            id: 77,
            scene: "scene2",
            timestamp: 1700000000000,
            state: { history: { "scene2-1": "line" } },
            instructionCount: 14
        });

        const signature = buildLoadEventSignature(entry);

        const firstAttemptDuplicate = isRapidDuplicate({
            signature,
            lastSignature: null,
            lastAt: 0,
            now: 1000,
            windowMs: 300
        });

        const immediateRetryDuplicate = isRapidDuplicate({
            signature,
            lastSignature: signature,
            lastAt: 1000,
            now: 1200,
            windowMs: 300
        });

        const delayedRetryDuplicate = isRapidDuplicate({
            signature,
            lastSignature: signature,
            lastAt: 1000,
            now: 1405,
            windowMs: 300
        });

        expect(firstAttemptDuplicate).toBe(false);
        expect(immediateRetryDuplicate).toBe(true);
        expect(delayedRetryDuplicate).toBe(false);
    });
});
