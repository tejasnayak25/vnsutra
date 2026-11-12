import { jest } from "@jest/globals";
import { WeatherSystem, WEATHER_PRESETS } from "../vnsutra_modules/weather.js";

describe("WeatherSystem (Built-in Stage Particles)", () => {
    test("starts presets, steps particle simulation, stops cleanly, and supports all presets", () => {
        const fakeGame = {
            ui: {
                game: {
                    viewport: { width: () => 800, height: () => 600 }
                }
            }
        };
        const ws = new WeatherSystem(fakeGame);
        const origRaf = globalThis.requestAnimationFrame;
        const origCancel = globalThis.cancelAnimationFrame;
        globalThis.requestAnimationFrame = undefined;

        try {
            for (const preset of Object.keys(WEATHER_PRESETS)) {
                ws.start(preset, { intensity: 0.5 });
                expect(ws.activePreset).toBe(preset);
                expect(ws.particles.length).toBeGreaterThan(0);

                const firstY = ws.particles[0].y;
                ws.step(0.016);
                expect(ws.particles[0].y).not.toBe(firstY);
            }

            ws.start("off");
            expect(ws.activePreset).toBeNull();
            expect(ws.particles).toHaveLength(0);

            ws.dispose();
        } finally {
            globalThis.requestAnimationFrame = origRaf;
            globalThis.cancelAnimationFrame = origCancel;
        }
    });

    test("stops immediately when reduced motion is enabled", async () => {
        jest.resetModules();
        await jest.unstable_mockModule("../vnsutra_modules/runtime-state.js", () => ({
            getGameSettings: () => ({ "accessibility-reduce-motion": true })
        }));
        const { WeatherSystem: MockedWeather } = await import("../vnsutra_modules/weather.js");
        const ws = new MockedWeather({});
        ws.start("rain", { intensity: 1.0 });
        expect(ws.activePreset).toBeNull();
        expect(ws.particles).toHaveLength(0);
    });
});

