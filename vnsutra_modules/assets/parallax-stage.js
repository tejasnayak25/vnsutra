/**
 * ParallaxStage Module - Production .vnstage Parallax Background Asset
 * 
 * Supports binary `.vnstage` packages containing packed multi-tier background layers
 * (underlay sky, infilled base plate, standalone midground/foreground props)
 * and an embedded WebP texture atlas.
 * 
 * Seamlessly integrates with Konva, CameraController, and StoryScriptRunner.
 */

import { getGame } from "../runtime-state.js";
import errorTracking from "../error-tracking.js";

const VNSTAGE_MAGICS = [
    [0x56, 0x4e, 0x53, 0x54], // "VNST"
    [0x56, 0x4e, 0x42, 0x47], // "VNBG" (legacy/backwards-compatible)
    [0x56, 0x4e, 0x53, 0x47]  // "VNSG" (topology format)
];
const VNSTAGE_HEADER_BYTES = 12;
const VNSTAGE_SUPPORTED_VERSION = 1;

/**
 * Check if a 4-byte header matches any recognized VNSTAGE magic.
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function matchMagic(bytes) {
    if (!bytes || bytes.byteLength < 4) return false;
    return VNSTAGE_MAGICS.some(m => 
        bytes[0] === m[0] && bytes[1] === m[1] && bytes[2] === m[2] && bytes[3] === m[3]
    );
}

/**
 * Parse a binary .vnstage ArrayBuffer into manifest metadata + embedded atlas bytes.
 * Binary layout (little-endian, 12-byte header):
 *   [0..3]  "VNST" (or "VNBG" / "VNSG") magic
 *   [4..5]  uint16 version (1)
 *   [6..7]  uint16 flags (0)
 *   [8..11] uint32 jsonLength
 *   [12..]  UTF-8 manifest JSON
 *   [..]    Raw WebP texture atlas image bytes
 * 
 * @param {ArrayBuffer | ArrayBufferView} input
 * @returns {{ version: number, flags: number, manifest: Record<string, any>, atlasBytes: Uint8Array }}
 */
function parseVnStageBuffer(input) {
    if (!input) {
        throw new Error("[ParallaxStage] Empty .vnstage buffer");
    }

    let bytes;
    if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
    } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
        throw new TypeError("[ParallaxStage] Expected ArrayBuffer or TypedArray for .vnstage");
    }

    if (bytes.byteLength < VNSTAGE_HEADER_BYTES) {
        throw new Error(`[ParallaxStage] Truncated .vnstage header (${bytes.byteLength} bytes)`);
    }

    if (!matchMagic(bytes)) {
        throw new Error("[ParallaxStage] Invalid .vnstage magic header (expected VNST, VNBG, or VNSG)");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint16(4, true);
    if (version !== VNSTAGE_SUPPORTED_VERSION) {
        throw new Error(`[ParallaxStage] Unsupported .vnstage version: ${version}`);
    }

    const flags = view.getUint16(6, true);
    const jsonLen = view.getUint32(8, true);
    const jsonEnd = VNSTAGE_HEADER_BYTES + jsonLen;

    if (jsonLen === 0 || jsonEnd > bytes.byteLength) {
        throw new Error(`[ParallaxStage] Invalid manifest length (${jsonLen}) in .vnstage`);
    }

    const jsonText = new TextDecoder("utf-8").decode(bytes.subarray(VNSTAGE_HEADER_BYTES, jsonEnd));
    const manifest = JSON.parse(jsonText);
    const atlasBytes = bytes.slice(jsonEnd);

    return { version, flags, manifest, atlasBytes };
}

/**
 * Decode WebP atlas bytes into an ImageBitmap or HTMLImageElement.
 * @param {Uint8Array} atlasBytes
 * @returns {Promise<ImageBitmap | HTMLImageElement>}
 */
async function decodeAtlasImage(atlasBytes) {
    if (!atlasBytes || atlasBytes.byteLength === 0) {
        throw new Error("[ParallaxStage] Missing embedded atlas image bytes");
    }
    const blob = new Blob([atlasBytes], { type: "image/webp" });

    if (typeof globalThis.createImageBitmap === "function") {
        try {
            return await globalThis.createImageBitmap(blob);
        } catch {
            // Fall back to Image constructor if createImageBitmap fails
        }
    }

    return new Promise((resolve, reject) => {
        if (typeof globalThis.Image !== "function") {
            // Headless / mock environment fallback
            resolve({
                width: 2048,
                height: 2048,
                naturalWidth: 2048,
                naturalHeight: 2048
            });
            return;
        }
        const img = new globalThis.Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err instanceof Error ? err : new Error("[ParallaxStage] Failed to decode WebP atlas"));
        };
        img.src = url;
    });
}

/**
 * ParallaxStage - Multi-plane production background stage asset loaded from .vnstage.
 */
class ParallaxStage {
    /**
     * @param {Object} [config]
     * @param {string} [config.id]
     * @param {string} [config.url]
     * @param {number} [config.overscan=0.06] - Uniform stage overscan margin (default 6%)
     */
    constructor(config = {}) {
        this.id = config.id || "unnamed_stage";
        this.url = config.url || null;
        this.overscan = config.overscan !== undefined ? Number(config.overscan) : 0.06;
        this.manifest = null;
        this.atlasImage = null;
        this.nodes = [];
        this.mounted = false;
        this.game = null;
        this.activePlanes = [];
    }

    /**
     * Load .vnstage package from URL or ArrayBuffer.
     * @param {string | ArrayBuffer | ArrayBufferView} source
     * @returns {Promise<ParallaxStage>}
     */
    async load(source = null) {
        const input = source || this.url;
        if (!input) {
            throw new Error("[ParallaxStage] No source URL or ArrayBuffer provided to load()");
        }

        let buffer;
        if (typeof input === "string") {
            const clean = input.replace(/^\/+/, "");
            const candidates = [];

            const aliasMap = {
                "apartment_stage": "apartment_exterior.vnstage",
                "apartment_stage.vnstage": "apartment_exterior.vnstage",
                "futon_stage": "futon_room.vnstage",
                "futon_stage.vnstage": "futon_room.vnstage"
            };

            const addCandidatesFor = (target) => {
                if (target.startsWith("./") || target.startsWith("/") || target.startsWith("http")) {
                    candidates.push(target);
                    if (target.includes("apartment_stage")) {
                        candidates.push(target.replace("apartment_stage", "apartment_exterior"));
                    }
                    if (target.includes("futon_stage")) {
                        candidates.push(target.replace("futon_stage", "futon_room"));
                    }
                } else if (target.includes("/")) {
                    candidates.push(`./assets/game-assets/${target}`);
                    candidates.push(`./assets/game-assets/backgrounds/${target}`);
                    candidates.push(`./${target}`);
                } else {
                    const withExt = target.endsWith(".vnstage") ? target : `${target}.vnstage`;
                    candidates.push(`./assets/game-assets/backgrounds/${withExt}`);
                    candidates.push(`./assets/game-assets/${withExt}`);
                    candidates.push(`./backgrounds/${withExt}`);
                    candidates.push(`./${withExt}`);
                }
            };

            addCandidatesFor(input);
            const aliased = aliasMap[clean] || aliasMap[clean.endsWith(".vnstage") ? clean : `${clean}.vnstage`];
            if (aliased) {
                addCandidatesFor(aliased);
            } else if (clean.endsWith("_stage")) {
                addCandidatesFor(clean.replace(/_stage$/, ""));
            }

            let loaded = false;
            for (const cand of candidates) {
                try {
                    const res = await fetch(cand);
                    if (res && res.ok) {
                        buffer = await res.arrayBuffer();
                        loaded = true;
                        break;
                    }
                } catch {
                    // Try next candidate
                }
            }

            if (!loaded) {
                // Node fs fallback for headless execution / test environments
                if (typeof process !== "undefined" && process?.versions?.node) {
                    try {
                        const fs = await import("node:fs");
                        const path = await import("node:path");
                        for (const cand of candidates) {
                            const p = path.resolve(cand.replace(/^\.\//, ""));
                            if (fs.existsSync(p)) {
                                buffer = fs.readFileSync(p).buffer;
                                loaded = true;
                                break;
                            }
                        }
                    } catch {
                        // ignore and fall through
                    }
                }
            }

            if (!loaded || !buffer) {
                throw new Error(`[ParallaxStage] Failed to fetch ${candidates[0]} (tried: ${candidates.join(", ")})`);
            }
        } else {
            buffer = input;
        }

        const parsed = parseVnStageBuffer(buffer);
        this.manifest = parsed.manifest;
        this.atlasImage = await decodeAtlasImage(parsed.atlasBytes);
        return this;
    }

    /**
     * Mount stage layers into the active Konva scene and connect to CameraController.
     * @param {any} [gameInstance]
     * @param {Object} [options]
     * @param {boolean} [options.keepDefaultBgVisible=false]
     * @returns {Array<Object>} Mounted plane descriptors
     */
    mount(gameInstance = null, options = {}) {
        this.game = gameInstance || getGame();
        if (!this.manifest || !this.atlasImage) {
            throw new Error("[ParallaxStage] Cannot mount uninitialized stage; call load() first");
        }

        this.unmount();

        const KonvaLib = globalThis.Konva;
        const viewportWidth = this.game?.ui?.game?.viewport?.width?.();
        const viewportHeight = this.game?.ui?.game?.viewport?.height?.();
        const stageWidth = viewportWidth || this.game?.ui?.game?.container?.width?.() || 1280;
        const stageHeight = viewportHeight || this.game?.ui?.game?.container?.height?.() || 720;

        const overscan = this.overscan;
        const targetW = stageWidth * (1 + overscan);
        const targetH = stageHeight * (1 + overscan);

        const sceneW = this.manifest.dimensions?.width || 1280;
        const sceneH = this.manifest.dimensions?.height || 720;
        const scale = Math.max(targetW / sceneW, targetH / sceneH);

        const originX = (stageWidth - sceneW * scale) / 2;
        const originY = (stageHeight - sceneH * scale) / 2;

        const bgGroup = this.game?.ui?.game?.bgGroup || this.game?.ui?.game?.camera || this.game?.ui?.game?.container;
        const foreGroup = this.game?.ui?.game?.foreGroup || this.game?.ui?.game?.camera || this.game?.ui?.game?.container;

        // Hide default static background unless requested to keep visible during transition
        if (!options.keepDefaultBgVisible) {
            const defaultBg = this.game?.ui?.game?.bg;
            if (defaultBg && typeof defaultBg.visible === "function") {
                defaultBg.visible(false);
            }
        }

        const rawLayers = this.manifest.layers || [];
        // Sort layers into exact back-to-front draw order:
        // 1. Underlay (Sky) -> deepest in bgGroup (order: 10)
        // 2. Base (Infilled scenery) -> in bgGroup above sky (order: 50)
        // 3. Midground props -> in bgGroup above base, sorted ascending by depth (order: 100 + depth * 100)
        // 4. Overlay props -> in foreGroup in front of actors, sorted ascending by depth (order: 1000 + depth * 100)
        const layers = [...rawLayers].sort((a, b) => {
            const getOrder = (l) => {
                if (l.role === "underlay") return 10;
                if (l.role === "base") return 50;
                if (l.role === "overlay" || (Number(l.depth) || 0) > 0.85) {
                    return 1000 + (Number(l.depth) || 1.0) * 100;
                }
                return 100 + (Number(l.depth) || 0.5) * 100;
            };
            return getOrder(a) - getOrder(b);
        });

        const activePlanes = [];
        this.nodes = [];

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            const sRect = layer.screenRect || { x: 0, y: 0, w: sceneW, h: sceneH };
            const aRect = layer.atlasRect || { x: 0, y: 0, w: sceneW, h: sceneH };
            const depth = layer.depth !== undefined ? Number(layer.depth) : 1.0;
            const role = layer.role || (depth > 0.85 ? "overlay" : "base");

            const baseX = originX + sRect.x * scale;
            const baseY = originY + sRect.y * scale;
            const nodeW = sRect.w * scale;
            const nodeH = sRect.h * scale;

            let node = null;
            if (KonvaLib?.Image) {
                node = new KonvaLib.Image({
                    id: layer.id || `vnstage-layer-${i}`,
                    image: this.atlasImage,
                    crop: {
                        x: aRect.x,
                        y: aRect.y,
                        width: aRect.w,
                        height: aRect.h
                    },
                    x: baseX,
                    y: baseY,
                    width: nodeW,
                    height: nodeH,
                    opacity: layer.opacity !== undefined ? Number(layer.opacity) : 1,
                    listening: false
                });

                // Tiers: Foreground hero framing props (depth > 0.85 / overlay) go to foreGroup in front of actors;
                // Underlay & Base ground plate go to bgGroup behind actors.
                if ((depth > 0.85 || role === "overlay") && foreGroup?.add) {
                    foreGroup.add(node);
                } else if (bgGroup?.add) {
                    bgGroup.add(node);
                }
            } else {
                // Mock / fallback node for testing
                let curX = baseX;
                let curY = baseY;
                node = {
                    id: layer.id,
                    x: (v) => (v !== undefined ? (curX = v) : curX),
                    y: (v) => (v !== undefined ? (curY = v) : curY),
                    destroy: () => {}
                };
                if ((depth > 0.85 || role === "overlay") && foreGroup?.add) {
                    foreGroup.add(node);
                } else if (bgGroup?.add) {
                    bgGroup.add(node);
                }
            }

            // Compute balanced tiltFactor with smooth, cohesive depth progression:
            // Underlay sky (0.28x), Infilled base (0.55x), Midground/Foreground props (0.58x - 0.78x).
            // Tightly coupled range eliminates visual shearing and corner reverse-drag.
            let tiltFactor = depth;
            if (role === "underlay") {
                tiltFactor = 0.28;
            } else if (role === "base") {
                tiltFactor = 0.55;
            } else {
                tiltFactor = 0.55 + depth * 0.24;
            }

            this.nodes.push(node);
            activePlanes.push({
                id: layer.id || `plane-${i}`,
                node,
                depth,
                tiltFactor,
                baseX,
                baseY,
                role
            });
        }

        this.activePlanes = activePlanes;
        this.mounted = true;

        // Connect with CameraController
        if (this.game?.camera) {
            this.game.camera.setPlanes(this.activePlanes);
        }

        const activeLayer = bgGroup?.getLayer?.() || foreGroup?.getLayer?.();
        activeLayer?.batchDraw?.();

        return this.activePlanes;
    }

    /**
     * Unmount all stage layers and restore default background.
     */
    unmount() {
        if (this.nodes.length > 0) {
            for (const node of this.nodes) {
                if (node && typeof node.destroy === "function") {
                    node.destroy();
                }
            }
            this.nodes = [];
        }

        this.activePlanes = [];
        this.mounted = false;

        const defaultBg = this.game?.ui?.game?.bg;
        if (defaultBg && typeof defaultBg.visible === "function") {
            defaultBg.visible(true);
        }

        if (this.game?.camera) {
            this.game.camera.setPlanes([]);
        }
    }

    /**
     * Smoothly fade in all stage layers.
     * @param {number} [duration=0.5]
     */
    fadeIn(duration = 0.5) {
        if (!this.nodes.length) return;
        const KonvaLib = globalThis.Konva;
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const targetOpacity = this.manifest?.layers?.[i]?.opacity !== undefined ? Number(this.manifest.layers[i].opacity) : 1;
            if (node && typeof node.to === "function" && KonvaLib?.Tween) {
                node.opacity(0);
                node.to({ opacity: targetOpacity, duration, easing: KonvaLib.Easings?.EaseInOut || KonvaLib.Easings?.Linear });
            } else if (node && typeof node.opacity === "function") {
                node.opacity(targetOpacity);
            }
        }
    }

    /**
     * Smoothly fade out all stage layers.
     * @param {number} [duration=0.5]
     */
    fadeOut(duration = 0.5) {
        if (!this.nodes.length) return;
        const KonvaLib = globalThis.Konva;
        for (const node of this.nodes) {
            if (node && typeof node.to === "function" && KonvaLib?.Tween) {
                node.to({ opacity: 0, duration });
            } else if (node && typeof node.opacity === "function") {
                node.opacity(0);
            }
        }
    }

    destroy() {
        this.unmount();
        this.atlasImage = null;
        this.manifest = null;
    }
}

export {
    VNSTAGE_MAGICS,
    VNSTAGE_HEADER_BYTES,
    VNSTAGE_SUPPORTED_VERSION,
    parseVnStageBuffer,
    decodeAtlasImage,
    ParallaxStage
};
export default ParallaxStage;
