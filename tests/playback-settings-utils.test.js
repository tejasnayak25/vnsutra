import { parseStoredBoolean, parseStoredDelay } from "../vnsutra_modules/playback-settings-utils.js";

describe("Playback Settings Utils", () => {
    it("parses stored booleans from boolean and string values", () => {
        expect(parseStoredBoolean(true, false)).toBe(true);
        expect(parseStoredBoolean(false, true)).toBe(false);
        expect(parseStoredBoolean("true", false)).toBe(true);
        expect(parseStoredBoolean("false", true)).toBe(false);
        expect(parseStoredBoolean(" TrUe ", false)).toBe(true);
    });

    it("falls back for missing or invalid boolean values", () => {
        expect(parseStoredBoolean(null, true)).toBe(true);
        expect(parseStoredBoolean(undefined, false)).toBe(false);
        expect(parseStoredBoolean("not-a-bool", true)).toBe(true);
    });

    it("parses and clamps autoplay delay", () => {
        expect(parseStoredDelay("500", 1000, 10000, 3000)).toBe(1000);
        expect(parseStoredDelay(2500, 1000, 10000, 3000)).toBe(2500);
        expect(parseStoredDelay("25000", 1000, 10000, 3000)).toBe(10000);
    });

    it("falls back when delay is missing or invalid", () => {
        expect(parseStoredDelay(null, 1000, 10000, 3000)).toBe(3000);
        expect(parseStoredDelay("abc", 1000, 10000, 3000)).toBe(3000);
    });
});
