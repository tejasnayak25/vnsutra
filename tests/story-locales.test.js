import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localeFiles = ["en.json", "es.json", "fr.json", "ja.json"];

const requiredStringPaths = [
    "scene1.hello",
    "scene1.intro",
    "scene1.introduction",
    "scene1.namePrompt",
    "scene1.defaultName",
    "scene1.correctGuess",
    "scene1.wrongGuess",
    "scene1.maryIntro",
    "scene1.question",
    "scene1.wrongAnswer",
    "scene1.rightAnswer",
    "scene1.question2",
    "scene2.makeScenes",
    "scene2.addAssets",
    "scene2.movement",
    "scene2.question",
    "scene2.characters",
    "scene2.charactersFollowup",
    "scene2.grayscale",
    "scene2.grayscaleReset",
    "scene2.bgGrayscale",
    "scene2.bgGrayscaleReset",
    "scene2.explanation",
    "scene2.docs",
    "scene2.goodbye",
    "scene3.return",
    "scene3.named",
    "scene3.characters",
    "scene3.effects",
    "scene3.flow",
    "scene3.recap",
    "scene3.nextStepPrompt",
    "scene3.nextDocs",
    "scene3.nextChapters",
    "scene3.nextReplay",
    "scene3.final"
];

const requiredArrayPaths = [
    ["scene1.answerOptions", 2],
    ["scene2.tourOptions", 3],
    ["scene3.nextStepOptions", 3]
];

function getValueByPath(source, pathText) {
    return pathText.split(".").reduce((current, key) => current?.[key], source);
}

describe("Demo locale coverage", () => {
    for (const localeFile of localeFiles) {
        it(`includes all required demo translations in ${localeFile}`, () => {
            const localePath = path.join(__dirname, "..", "locales", localeFile);
            const locale = JSON.parse(fs.readFileSync(localePath, "utf8"));

            for (const keyPath of requiredStringPaths) {
                const value = getValueByPath(locale, keyPath);
                expect(typeof value).toBe("string");
                expect(value.trim().length).toBeGreaterThan(0);
            }

            for (const [keyPath, expectedLength] of requiredArrayPaths) {
                const value = getValueByPath(locale, keyPath);
                expect(Array.isArray(value)).toBe(true);
                expect(value).toHaveLength(expectedLength);
                value.forEach((entry) => {
                    expect(typeof entry).toBe("string");
                    expect(entry.trim().length).toBeGreaterThan(0);
                });
            }
        });
    }
});