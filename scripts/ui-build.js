import path from "path";
import chokidar from "chokidar";
import { fileURLToPath } from "url";
import { compileUiDirectory } from "./ui-layout-compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourceDir = path.join(rootDir, "ui");
const outputDir = path.join(rootDir, "game", ".ui-cache");
const watchMode = process.argv.includes("--watch");

async function runCompilation() {
    const artifacts = await compileUiDirectory({
        inputRootDir: sourceDir,
        outputDir
    });

    console.info(`[UI Build] Generated ${artifacts.length} artifact(s) in game/.ui-cache.`);
}

async function main() {
    await runCompilation();

    if (!watchMode) {
        return;
    }

    const watchPattern = path.join(sourceDir, "**", "*.{xml,css}");
    const watcher = chokidar.watch(watchPattern, {
        ignoreInitial: true
    });

    let timer = null;

    const scheduleRebuild = () => {
        if (timer) {
            clearTimeout(timer);
        }

        timer = setTimeout(async () => {
            try {
                await runCompilation();
            } catch (error) {
                console.error("[UI Build] Rebuild failed:", error);
            }
        }, 80);
    };

    watcher.on("add", scheduleRebuild);
    watcher.on("change", scheduleRebuild);
    watcher.on("unlink", scheduleRebuild);
    watcher.on("unlinkDir", scheduleRebuild);

    console.info("[UI Build] Watching ui/** for XML/CSS changes...");
}

main().catch((error) => {
    console.error("[UI Build] Failed:", error);
    process.exit(1);
});
