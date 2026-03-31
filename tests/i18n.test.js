import { jest } from "@jest/globals";
import { I18n } from "../vnsutra_modules/i18n.js";
import { storage } from "../vnsutra_modules/storage.js";

describe("I18n remote locale loading", () => {
    let originalFetch;
    let originalSetItem;

    beforeEach(() => {
        originalFetch = global.fetch;
        originalSetItem = storage.setItem;
        storage.setItem = jest.fn(async () => {});
    });

    afterEach(() => {
        global.fetch = originalFetch;
        storage.setItem = originalSetItem;
    });

    it("loads locale from a remote template path", async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            async json() {
                return { ui: { languageName: "Français" } };
            }
        }));

        const i18n = new I18n();
        i18n.configure({
            path: "https://cdn.example.com/locales/{lang}.json",
            supported: ["en", "fr"],
            fallback: "en"
        });

        await expect(i18n.loadLanguage("fr")).resolves.toBe(true);
        expect(global.fetch).toHaveBeenCalledWith("https://cdn.example.com/locales/fr.json");
    });

    it("loads locale from a base path without token", async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            async json() {
                return { ui: { languageName: "Español" } };
            }
        }));

        const i18n = new I18n();
        i18n.configure({
            path: "https://cdn.example.com/i18n",
            supported: ["en", "es"],
            fallback: "en"
        });

        await expect(i18n.loadLanguage("es")).resolves.toBe(true);
        expect(global.fetch).toHaveBeenCalledWith("https://cdn.example.com/i18n/es.json");
    });
});
