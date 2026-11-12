/**
 * VN-Sutra Professional Asset Packager (v3.0)
 * 
 * Features:
 * - BFS Connected-Component Border-Box Detection:
 *   Automatically discovers tight organic boundaries for facial features
 * - Alpha-Contoured Transparent Patches:
 *   Unchanged skin/chin/hair is 100% transparent (alpha=0).
 *   Only modified facial brushstrokes (eyes, brows, mouth) are extracted,
 *   completely eliminating rectangular seams, chin overlap, and double-layering.
 * - Multi-Cluster Head Tilt & Diagonal Eye Support:
 *   Captures full diagonal eye and eyebrow spans without clipping.
 */

import fs from "fs-extra";
import path from "path";
import { PNG } from "pngjs";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHARACTERS_DIR = path.resolve(__dirname, "../assets/game-assets/characters");

function loadPng(filePath) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(new PNG())
            .on("parsed", function () {
                resolve(this);
            })
            .on("error", reject);
    });
}

function savePng(pngInstance, outPath) {
    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(outPath);
        pngInstance.pack().pipe(stream).on("finish", resolve).on("error", reject);
    });
}

/**
 * Connected Component Blob Extraction with Alpha Contouring
 */
function extractFeatureBlobs(basePng, targetPng) {
    const w = Math.min(basePng.width, targetPng.width);
    const h = Math.min(basePng.height, targetPng.height);

    // Anatomical Head Zone: Upper 35% of body
    const headMaxY = Math.floor(h * 0.35);

    // 1. Compute high-confidence stroke difference map
    const diffMap = new Uint8Array(w * headMaxY);
    let diffCount = 0;

    for (let y = 0; y < headMaxY; y++) {
        for (let x = 0; x < w; x++) {
            const idxB = (basePng.width * y + x) << 2;
            const idxT = (targetPng.width * y + x) << 2;

            const aB = basePng.data[idxB + 3];
            const aT = targetPng.data[idxT + 3];

            if (aB < 20 && aT < 20) continue;

            const diff = Math.abs(basePng.data[idxB] - targetPng.data[idxT]) +
                         Math.abs(basePng.data[idxB + 1] - targetPng.data[idxT + 1]) +
                         Math.abs(basePng.data[idxB + 2] - targetPng.data[idxT + 2]);

            // Stroke change threshold (ignores subpixel antialiasing & noise)
            if (diff > 45) {
                diffMap[y * w + x] = 1;
                diffCount++;
            }
        }
    }

    if (diffCount < 40) {
        return []; // No significant facial changes
    }

    // 2. Morphological dilation (radius 2) to connect diagonal strokes (eyebrows/eyelashes)
    const dilated = new Uint8Array(w * headMaxY);
    const DILATE_R = 2;

    for (let y = DILATE_R; y < headMaxY - DILATE_R; y++) {
        for (let x = DILATE_R; x < w - DILATE_R; x++) {
            if (diffMap[y * w + x] === 1) {
                for (let dy = -DILATE_R; dy <= DILATE_R; dy++) {
                    for (let dx = -DILATE_R; dx <= DILATE_R; dx++) {
                        dilated[(y + dy) * w + (x + dx)] = 1;
                    }
                }
            }
        }
    }

    // 3. BFS Connected-Component Labelling
    const visited = new Uint8Array(w * headMaxY);
    const rawBlobs = [];

    for (let y = 0; y < headMaxY; y++) {
        for (let x = 0; x < w; x++) {
            if (dilated[y * w + x] === 1 && visited[y * w + x] === 0) {
                let minX = x, maxX = x, minY = y, maxY = y;
                let count = 0;
                const queue = [x, y];
                visited[y * w + x] = 1;

                let qHead = 0;
                while (qHead < queue.length) {
                    const cx = queue[qHead++];
                    const cy = queue[qHead++];
                    count++;

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    const neighbors = [
                        [cx + 1, cy], [cx - 1, cy],
                        [cx, cy + 1], [cx, cy - 1]
                    ];

                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < w && ny >= 0 && ny < headMaxY) {
                            const nIdx = ny * w + nx;
                            if (dilated[nIdx] === 1 && visited[nIdx] === 0) {
                                visited[nIdx] = 1;
                                queue.push(nx, ny);
                            }
                        }
                    }
                }

                // Filter out tiny dust (< 80 pixels)
                if (count >= 80) {
                    rawBlobs.push({
                        minX, minY, maxX, maxY,
                        w: maxX - minX + 1,
                        h: maxY - minY + 1,
                        count
                    });
                }
            }
        }
    }

    if (rawBlobs.length === 0) return [];

    // 4. Split / categorize into Eyes Zone vs Mouth Zone
    // Eyes are in upper 65% of head zone, Mouth is in lower 35%
    const mouthCutoffY = headMaxY * 0.62;

    const eyeBlobs = rawBlobs.filter(b => b.minY < mouthCutoffY);
    const mouthBlobs = rawBlobs.filter(b => b.minY >= mouthCutoffY);

    const featureGroups = [];

    // Group eye blobs into a combined eye/brow box
    if (eyeBlobs.length > 0) {
        let minX = w, maxX = 0, minY = h, maxY = 0;
        for (const b of eyeBlobs) {
            if (b.minX < minX) minX = b.minX;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxY > maxY) maxY = b.maxY;
        }
        featureGroups.push({
            feature: "eyes",
            bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
        });
    }

    // Group mouth blobs into a tight mouth box (strictly above chin!)
    if (mouthBlobs.length > 0) {
        let minX = w, maxX = 0, minY = h, maxY = 0;
        for (const b of mouthBlobs) {
            if (b.minX < minX) minX = b.minX;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxY > maxY) maxY = b.maxY;
        }
        featureGroups.push({
            feature: "mouth",
            bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
        });
    }

    // 5. Generate ALPHA-CONTOURED patches (Zero skin overwrite!)
    const patches = [];

    for (const group of featureGroups) {
        const pad = 3;
        const pX = Math.max(0, group.bbox.x - pad);
        const pY = Math.max(0, group.bbox.y - pad);
        const pW = Math.min(w - pX, group.bbox.w + pad * 2);
        const pH = Math.min(headMaxY - pY, group.bbox.h + pad * 2);

        const patchPng = new PNG({ width: pW, height: pH });
        patchPng.data.fill(0); // 100% transparent by default

        for (let py = 0; py < pH; py++) {
            const gy = pY + py;
            for (let px = 0; px < pW; px++) {
                const gx = pX + px;
                const dIdx = (pW * py + px) << 2;
                const sIdx = (targetPng.width * gy + gx) << 2;

                // Only copy pixels that are inside the stroke difference mask
                if (dilated[gy * w + gx] === 1) {
                    patchPng.data[dIdx] = targetPng.data[sIdx];
                    patchPng.data[dIdx + 1] = targetPng.data[sIdx + 1];
                    patchPng.data[dIdx + 2] = targetPng.data[sIdx + 2];
                    patchPng.data[dIdx + 3] = targetPng.data[sIdx + 3];
                }
            }
        }

        patches.push({
            feature: group.feature,
            png: patchPng,
            stageBbox: { x: pX, y: pY, w: pW, h: pH }
        });
    }

    return patches;
}

// 2D strip / shelf atlas packer
function packAtlas(patches) {
    if (patches.length === 0) {
        return { atlasPng: new PNG({ width: 1, height: 1 }), atlasMap: {} };
    }

    const PADDING = 4;
    let totalW = 0;
    let maxH = 0;

    for (const p of patches) {
        totalW += p.png.width + PADDING;
        if (p.png.height > maxH) maxH = p.png.height;
    }

    const atlasPng = new PNG({ width: totalW, height: maxH });
    atlasPng.data.fill(0);

    let currentX = 0;
    const atlasMap = {};

    for (const p of patches) {
        const pPng = p.png;
        for (let y = 0; y < pPng.height; y++) {
            for (let x = 0; x < pPng.width; x++) {
                const sIdx = (pPng.width * y + x) << 2;
                const dIdx = (atlasPng.width * y + (currentX + x)) << 2;
                atlasPng.data[dIdx] = pPng.data[sIdx];
                atlasPng.data[dIdx + 1] = pPng.data[sIdx + 1];
                atlasPng.data[dIdx + 2] = pPng.data[sIdx + 2];
                atlasPng.data[dIdx + 3] = pPng.data[sIdx + 3];
            }
        }

        atlasMap[p.id] = {
            id: p.id,
            feature: p.feature,
            atlas: { x: currentX, y: 0, w: pPng.width, h: pPng.height },
            stage: p.stageBbox
        };

        currentX += pPng.width + PADDING;
    }

    return { atlasPng, atlasMap };
}

async function processOutfitFolder(characterName, outfitName, outfitDir) {
    console.log(chalk.cyan(`\nProcessing: [${characterName} / ${outfitName}]`));

    const files = (await fs.readdir(outfitDir))
        .filter(f => f.endsWith(".png") && !f.startsWith("base_") && !f.includes("atlas"));

    if (files.length === 0) {
        console.log(chalk.gray("  No raw sprite images found."));
        return;
    }

    // Determine Base reference image (prefer neutral or smile)
    const baseFileName = files.find(f => /neutral|smile|idle/i.test(f)) || files[0];
    const baseFilePath = path.join(outfitDir, baseFileName);
    const basePng = await loadPng(baseFilePath);

    let totalRawBytes = 0;
    for (const f of files) {
        totalRawBytes += (await fs.stat(path.join(outfitDir, f))).size;
    }

    const uniquePatches = new Map();
    const presets = {};

    for (const file of files) {
        const moodKey = file.replace(".png", "");
        if (file === baseFileName) {
            presets[moodKey] = { eyes: "default", mouth: "default" };
            continue;
        }

        const targetPng = await loadPng(path.join(outfitDir, file));
        
        // Extract tight, alpha-contoured feature blobs!
        const blobs = extractFeatureBlobs(basePng, targetPng);

        if (blobs.length === 0) {
            presets[moodKey] = { eyes: "default", mouth: "default" };
            continue;
        }

        const presetDef = { eyes: "default", mouth: "default" };

        for (const blob of blobs) {
            const patchId = `${blob.feature}_${moodKey}`;

            uniquePatches.set(patchId, {
                id: patchId,
                feature: blob.feature,
                png: blob.png,
                stageBbox: blob.stageBbox
            });

            if (blob.feature === "eyes") presetDef.eyes = patchId;
            if (blob.feature === "mouth") presetDef.mouth = patchId;
        }

        presets[moodKey] = presetDef;
    }

    // Save base_body.png
    const baseBodyPath = path.join(outfitDir, "base_body.png");
    await savePng(basePng, baseBodyPath);

    // Pack into unified atlas
    const patchArray = Array.from(uniquePatches.values());
    const { atlasPng, atlasMap } = packAtlas(patchArray);
    const atlasPath = path.join(outfitDir, "expressions_atlas.png");
    await savePng(atlasPng, atlasPath);

    const baseBytes = (await fs.stat(baseBodyPath)).size;
    const atlasBytes = (await fs.stat(atlasPath)).size;
    const totalPackedBytes = baseBytes + atlasBytes;

    const manifest = {
        character: characterName,
        outfit: outfitName,
        version: "3.0",
        base: {
            file: "base_body.png",
            width: basePng.width,
            height: basePng.height
        },
        atlas: {
            file: "expressions_atlas.png",
            width: atlasPng.width,
            height: atlasPng.height
        },
        patches: atlasMap,
        presets
    };

    const manifestPath = path.join(outfitDir, "character.manifest.json");
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });

    const savings = ((1 - totalPackedBytes / totalRawBytes) * 100).toFixed(1);
    console.log(chalk.green("  ✔ Alpha-Contoured Border-Box Pack Complete!"));
    console.log(chalk.white(`    Raw total:      ${(totalRawBytes / 1024).toFixed(1)} KB`));
    console.log(chalk.white(`    Base Body:      ${(baseBytes / 1024).toFixed(1)} KB`));
    console.log(chalk.white(`    Atlas (${patchArray.length} patches): ${(atlasBytes / 1024).toFixed(1)} KB (${atlasPng.width}x${atlasPng.height}px)`));
    console.log(chalk.bold.yellow(`    Bandwidth Saved: ${savings}% reduction!\n`));
}

async function run() {
    console.log(chalk.bold.blue("===================================================="));
    console.log(chalk.bold.blue("   VN-Sutra Alpha-Contoured Asset Packager (v3.0)   "));
    console.log(chalk.bold.blue("===================================================="));

    if (!await fs.pathExists(CHARACTERS_DIR)) {
        console.error(chalk.red(`Directory not found: ${CHARACTERS_DIR}`));
        process.exit(1);
    }

    const characters = await fs.readdir(CHARACTERS_DIR);

    for (const charName of characters) {
        const charDir = path.join(CHARACTERS_DIR, charName);
        if (!(await fs.stat(charDir)).isDirectory()) continue;

        const outfits = await fs.readdir(charDir);
        for (const outfitName of outfits) {
            const outfitDir = path.join(charDir, outfitName);
            if (!(await fs.stat(outfitDir)).isDirectory()) continue;

            await processOutfitFolder(charName, outfitName, outfitDir);
        }
    }

    console.log(chalk.bold.green("✨ All character outfits packaged with zero double-layering!\n"));
}

run().catch((err) => {
    console.error(chalk.red("Packaging error:"), err);
    process.exit(1);
});
