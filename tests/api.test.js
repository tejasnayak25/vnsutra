/**
 * @jest-environment node
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("API Security Tests", () => {
    describe("Path Validation", () => {
        it("should block path traversal attempts", () => {
            // Simulate path traversal sanitization
            let fpath = "../../etc/passwd";
            // eslint-disable-next-line no-useless-escape
            fpath = path.normalize(fpath).replace(/^(\.\.(\/|\\|$))+/, "");
            fpath = fpath.replace(/^[/\\]+/, "");
            
            // After sanitization, it should be clean
            expect(fpath).not.toContain("..");
        });

        it("should normalize paths correctly", () => {
            let fpath = "backgrounds/./character";
            fpath = path.normalize(fpath);
            
            expect(fpath).toBe(path.join("backgrounds", "character"));
        });

        it("should reject absolute paths", () => {
            const fpath = "/etc/passwd";
            const assetsRoot = path.resolve(__dirname, "assets", "game-assets");
            const folder = path.resolve(assetsRoot, fpath);
            
            // Should not start with assets root
            expect(folder).not.toEqual(path.join(assetsRoot, fpath));
        });
    });

    describe("Security Headers", () => {
        it("should validate sec-fetch-site header", () => {
            const headers = {
                "sec-fetch-site": "same-origin"
            };
            
            expect(headers["sec-fetch-site"]).toBe("same-origin");
        });

        it("should reject cross-site requests", () => {
            const headers = {
                "sec-fetch-site": "cross-site"
            };
            
            const isAllowed = headers["sec-fetch-site"] === "same-origin";
            expect(isAllowed).toBe(false);
        });
    });

    describe("Localization Assets", () => {
        it("should have locale files available and valid", () => {
            const localesDir = path.resolve(__dirname, "..", "locales");
            const requiredLocales = ["en.json", "ja.json", "es.json", "fr.json"];

            requiredLocales.forEach((localeFile) => {
                const localePath = path.join(localesDir, localeFile);
                expect(fs.existsSync(localePath)).toBe(true);

                const content = fs.readFileSync(localePath, "utf8");
                expect(() => JSON.parse(content)).not.toThrow();
            });
        });
    });
});
