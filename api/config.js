/**
 * Express App Configuration
 * Shared setup for both development and production
 */
import path from "path";
import fs from "fs";
import express from "express";
import archiver from "archiver";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const zipDir = process.env.ZIP_DIR || path.join("/tmp", "zipfiles");
const ZIP_TTL = (parseInt(process.env.ZIP_TTL_HOURS) || 24) * 60 * 60 * 1000;
const MAX_ZIP_SIZE = (parseInt(process.env.MAX_ZIP_SIZE_MB) || 100) * 1024 * 1024;

// Ensure zip directory exists
if (!fs.existsSync(zipDir)) {
    fs.mkdirSync(zipDir, { recursive: true });
}

/**
 * Clean up old zip files to prevent disk space issues
 */
async function cleanupOldZips() {
    try {
        if (!fs.existsSync(zipDir)) {
            return;
        }

        const files = await fs.promises.readdir(zipDir);
        const now = Date.now();
        let totalSize = 0;

        const fileStats = await Promise.all(
            files.map(async (file) => {
                try {
                    const filePath = path.join(zipDir, file);
                    const stats = await fs.promises.stat(filePath);
                    return { file, filePath, mtime: stats.mtime.getTime(), size: stats.size };
                } catch (err) {
                    console.error(`Error getting stats for ${file}:`, err.message);
                    return null;
                }
            })
        );

        const validFiles = fileStats.filter(f => f !== null);
        validFiles.sort((a, b) => a.mtime - b.mtime);

        for (const { filePath, mtime, size } of validFiles) {
            totalSize += size;
            const age = now - mtime;

            if (age > ZIP_TTL) {
                try {
                    await fs.promises.unlink(filePath);
                    // eslint-disable-next-line no-console
                    console.log(`[Zip Cleanup] Deleted old zip (${(age / 1000 / 60 / 60).toFixed(1)}h old): ${path.basename(filePath)}`);
                } catch (err) {
                    console.error(`[Zip Cleanup] Failed to delete ${filePath}:`, err.message);
                }
            } else if (totalSize > MAX_ZIP_SIZE) {
                try {
                    await fs.promises.unlink(filePath);
                    totalSize -= size;
                    // eslint-disable-next-line no-console
                    console.log(`[Zip Cleanup] Deleted zip to reduce size: ${path.basename(filePath)}`);
                } catch (err) {
                    console.error(`[Zip Cleanup] Failed to delete ${filePath}:`, err.message);
                }
            }
        }
    } catch (error) {
        console.error("[Zip Cleanup] Error during cleanup:", error.message);
    }
}

function zipFile(source_dir, dest) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(dest);
        const archive = archiver("zip");

        output.on("close", function () {
            // eslint-disable-next-line no-console
            console.log(archive.pointer() + " total bytes");
            // eslint-disable-next-line no-console
            console.log("archiver has been finalized and the output file descriptor has closed.");
            resolve();
        });

        archive.on("error", function(err) {
            reject(err);
        });

        archive.pipe(output);
        archive.directory(source_dir, false);
        archive.finalize();
    });
}

export function createApp() {
    const app = express();
    const distPath = path.join(__dirname, "..", "dist");
    const useDist = process.env.NODE_ENV === "production" && fs.existsSync(distPath);

    // Static file serving
    app.use(express.static(__dirname));
    app.use("/locales", express.static(path.join(__dirname, "..", "locales")));

    if (useDist) {
        app.use(express.static(distPath));
    } else {
        app.use(express.static(path.join(__dirname, "..")));
    }

    // Routes
    app.route("/")
        .get((req, res) => {
            const homeFile = useDist
                ? path.join(distPath, "index.html")
                : path.join(__dirname, "home.html");
            res.sendFile(homeFile);
        });

    app.route("/folder")
        .get(async (req, res) => {
            try {
                if (req.headers["sec-fetch-site"] !== "same-origin") {
                    return res.status(403).json({
                        status: 403,
                        error: "Forbidden"
                    });
                }

                if (!req.query.path) {
                    return res.status(400).json({
                        status: 400,
                        error: "Missing path parameter"
                    });
                }

                let fpath = decodeURIComponent(req.query.path);
                // eslint-disable-next-line no-useless-escape
                fpath = path.normalize(fpath).replace(/^(\.\.(\/|\\|$))+/, "");
                fpath = fpath.replace(/^[/\\]+/, "");

                const assetsRoot = path.resolve(__dirname, "..", "assets", "game-assets");
                const folder = path.resolve(assetsRoot, fpath);

                if (!folder.startsWith(assetsRoot)) {
                    return res.status(403).json({
                        status: 403,
                        error: "Access denied"
                    });
                }

                const relativePath = path.relative(assetsRoot, folder);
                if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
                    return res.status(403).json({
                        status: 403,
                        error: "Invalid path"
                    });
                }

                try {
                    await fs.promises.access(folder);
                } catch (err) {
                    return res.status(404).json({
                        status: 404,
                        error: "Path not found"
                    });
                }

                const stats = await fs.promises.stat(folder);

                if (!stats.isDirectory()) {
                    return res.status(400).json({
                        status: 400,
                        error: "Path is not a directory"
                    });
                }

                const zipName = fpath.split(path.sep).join("_");
                const zipPath = path.join(zipDir, `${zipName}.zip`);

                try {
                    await fs.promises.access(zipPath);
                } catch (err) {
                    await zipFile(folder, zipPath);
                }

                const data = await fs.promises.readFile(zipPath, { encoding: "base64" });

                res.json({
                    status: 200,
                    data: data
                });

            } catch (error) {
                console.error("Error processing folder request:", error);
                res.status(500).json({
                    status: 500,
                    error: "Internal server error"
                });
            }
        });

    return { app, cleanupOldZips };
}

export { zipFile, __dirname };
