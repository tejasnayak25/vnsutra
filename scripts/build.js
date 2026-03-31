import path from "path";
import fs from "fs-extra";
import { minify } from "terser";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { exec } from "child_process";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const execAsync = promisify(exec);

const copyTargets = [
    "assets",
    "game",
    "locales",
    "vnsutra_modules",
    "api/home.html",
    "service-worker.js",
    "README.MD",
    "vercel.json",
    ".env.example",
];

const skipMinifyPatterns = [".min.js", "konva.js", "jszip.min.js"];

function shouldMinifyJs(filePath) {
    const fileName = path.basename(filePath);
    return !skipMinifyPatterns.some((pattern) => fileName.includes(pattern));
}

async function listJsFiles(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listJsFiles(fullPath)));
            continue;
        }

        if (entry.isFile() && fullPath.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

async function minifyJavaScriptInDist() {
    const jsFiles = await listJsFiles(distDir);

    for (const filePath of jsFiles) {
        if (!shouldMinifyJs(filePath)) {
            continue;
        }

        try {
            const source = await fs.readFile(filePath, "utf8");
            const result = await minify(source, {
                compress: true,
                mangle: true,
                format: {
                    comments: false,
                },
            });

            if (result.code) {
                await fs.writeFile(filePath, result.code, "utf8");
            }
        } catch (error) {
            console.warn(`[Build] Skipped minify for ${path.relative(rootDir, filePath)}: ${error.message}`);
        }
    }
}

async function minifyCss() {
    const sourceCssPath = path.join(rootDir, "css", "output.css");
    const distCssDir = path.join(distDir, "css");
    const distCssPath = path.join(distCssDir, "output.css");

    await fs.ensureDir(distCssDir);
    
    try {
        await execAsync("npm run build:css", {
            cwd: rootDir
        });
        const css = await fs.readFile(sourceCssPath, "utf8");
        await fs.writeFile(distCssPath, css, "utf8");
    } catch (error) {
        const css = await fs.readFile(sourceCssPath, "utf8");
        console.warn(`[Build] CSS minification failed: ${error.message}. Using existing compiled CSS output.`);
        await fs.writeFile(distCssPath, css, "utf8");
    }
}

async function copyProjectFiles() {
    for (const target of copyTargets) {
        const sourcePath = path.join(rootDir, target);
        const distTarget = target === "api/home.html" ? "index.html" : target;
        const destinationPath = path.join(distDir, distTarget);

        await fs.copy(sourcePath, destinationPath);
    }
}

async function build() {
    // eslint-disable-next-line no-console
    console.log("[Build] Starting production build...");

    await fs.emptyDir(distDir);
    await copyProjectFiles();
    await minifyJavaScriptInDist();
    await minifyCss();

    // eslint-disable-next-line no-console
    console.log("[Build] Build complete: dist/");
}

build().catch((error) => {
    console.error("[Build] Build failed:", error);
    process.exit(1);
});
