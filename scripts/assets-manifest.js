import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/**
 * Recursively scan `assetsGameRoot` and build a folder-to-image-files manifest
 * for zero-backend static loading of character outfits.
 * @param {string} assetsGameRoot
 * @returns {Promise<{ version: number, folders: Record<string, string[]> }>}
 */
async function buildAssetsManifest(assetsGameRoot) {
    const folders = {};

    async function walk(dirPath) {
        if (!(await fs.pathExists(dirPath))) {
            return;
        }
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];
        const subdirs = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                subdirs.push(entry.name);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (IMAGE_EXTENSIONS.has(ext)) {
                    files.push(entry.name);
                }
            }
        }

        if (files.length > 0) {
            const rel = path.relative(assetsGameRoot, dirPath).split(path.sep).join("/");
            if (rel) {
                folders[rel] = files.sort((a, b) => a.localeCompare(b));
            }
        }

        subdirs.sort((a, b) => a.localeCompare(b));
        for (const sub of subdirs) {
            await walk(path.join(dirPath, sub));
        }
    }

    await walk(assetsGameRoot);
    return { version: 1, folders };
}

/**
 * Generate and write `assets/assets.manifest.json`.
 * @param {string} [rootDir]
 * @returns {Promise<{ version: number, folders: Record<string, string[]> }>}
 */
async function writeAssetsManifest(rootDir = path.resolve(__dirname, "..")) {
    const assetsGameRoot = path.join(rootDir, "assets", "game-assets");
    const outPath = path.join(rootDir, "assets", "assets.manifest.json");
    const manifest = await buildAssetsManifest(assetsGameRoot);
    await fs.writeJson(outPath, manifest, { spaces: 2 });
    return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    writeAssetsManifest()
        .then((manifest) => {
            const count = Object.keys(manifest.folders).length;
            // eslint-disable-next-line no-console
            console.log(`[Assets Manifest] Indexed ${count} asset folder(s) -> assets/assets.manifest.json`);
        })
        .catch((error) => {
            console.error("[Assets Manifest] Failed:", error);
            process.exit(1);
        });
}

export { buildAssetsManifest, writeAssetsManifest, IMAGE_EXTENSIONS };

