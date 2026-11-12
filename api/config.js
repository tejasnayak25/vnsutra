/**
 * Express App Configuration
 * Shared setup for both development and production
 */
import path from "path";
import fs from "fs";
import express from "express";
import { fileURLToPath } from "url";
import { buildAssetsManifest } from "../scripts/assets-manifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Legacy no-op retained for server lifecycle compatibility (static manifest replaced /folder zipping).
 */
async function cleanupOldZips() {
    // Intentionally empty: /folder zipping has been replaced by AOT assets.manifest.json.
}

export function createApp() {
    const app = express();
    const rootDir = path.join(__dirname, "..");
    const distPath = path.join(rootDir, "dist");
    const useDist = process.env.NODE_ENV === "production" && fs.existsSync(distPath);

    // Live asset manifest in development so newly added character PNGs work immediately
    if (!useDist) {
        app.get("/assets/assets.manifest.json", async (req, res) => {
            try {
                const manifest = await buildAssetsManifest(path.join(rootDir, "assets", "game-assets"));
                res.json(manifest);
            } catch (error) {
                console.error("Error generating live asset manifest:", error);
                res.status(500).json({ error: "Failed to build asset manifest" });
            }
        });
    }

    // Static file serving
    app.use(express.static(__dirname));
    app.use("/locales", express.static(path.join(rootDir, "locales")));

    if (useDist) {
        app.use(express.static(distPath));
    } else {
        app.use(express.static(rootDir));
    }

    // Routes
    app.route("/")
        .get(async (req, res) => {
            if (useDist) {
                return res.sendFile(path.join(distPath, "index.html"));
            }
            const homeFile = path.join(__dirname, "home.html");
            if (req.query.studio === "true" || req.query.studio === "1") {
                try {
                    const html = await fs.promises.readFile(homeFile, "utf8");
                    const studioTag = "<script type=\"module\">import { StudioOverlay } from \"/vnsutra_modules/studio.js\"; window.addEventListener(\"game-started\", () => { if (!window.__vnsutraStudio) { const s = new StudioOverlay(); s.mount(); window.__vnsutraStudio = s; } });</script>";
                    return res.type("html").send(html.replace("</body>", `${studioTag}\n</body>`));
                } catch {
                    return res.sendFile(homeFile);
                }
            }
            return res.sendFile(homeFile);
        });

    return { app, cleanupOldZips };
}

export { __dirname };
