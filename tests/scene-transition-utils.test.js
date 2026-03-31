import {
    buildLoadEventSignature,
    buildSceneStartSignature,
    isRapidDuplicate
} from "../vnsutra_modules/scene-transition-utils.js";

describe("Scene Transition Utils", () => {
    it("builds stable load-event signature", () => {
        const signature = buildLoadEventSignature({
            scene: "start",
            timestamp: 100,
            id: 55,
            isAutosave: true,
            state: { instruction_count: 9 }
        });

        expect(signature).toBe("start|100|55|9|1");
    });

    it("builds scene-start signature with safe defaults", () => {
        expect(buildSceneStartSignature("intro", {})).toBe("intro||");
        expect(buildSceneStartSignature(null, null)).toBe("||");
    });

    it("detects rapid duplicates inside a time window", () => {
        const duplicate = isRapidDuplicate({
            signature: "sceneA|1|",
            lastSignature: "sceneA|1|",
            lastAt: 1000,
            now: 1190,
            windowMs: 250
        });

        const notDuplicate = isRapidDuplicate({
            signature: "sceneA|1|",
            lastSignature: "sceneA|1|",
            lastAt: 1000,
            now: 1300,
            windowMs: 250
        });

        expect(duplicate).toBe(true);
        expect(notDuplicate).toBe(false);
    });
});
