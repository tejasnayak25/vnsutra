import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const distIndexPath = path.join(rootDir, "dist", "index.html");

async function patchDistHtmlForBundle() {
    const html = await fs.readFile(distIndexPath, "utf8");

    const moduleScriptRegex = /<script\s+type="module"\s+src="\.\/vnsutra_modules\/init\.js"><\/script>/;
    if (!moduleScriptRegex.test(html)) {
        throw new Error("Could not find init module script tag in dist/index.html");
    }

    const patched = html.replace(
        moduleScriptRegex,
        "<script src=\"./vnsutra_modules/app.bundle.js\"></script>"
    );

    await fs.writeFile(distIndexPath, patched, "utf8");

    // eslint-disable-next-line no-console
    console.log("[Build:Bundle] Patched dist/index.html to use app.bundle.js");
}

patchDistHtmlForBundle().catch((error) => {
    console.error("[Build:Bundle] Failed:", error);
    process.exit(1);
});