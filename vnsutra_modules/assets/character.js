import { Outfit } from "./outfit.js";
import { loadImg } from "../ui/utils.js";
import { getGame, getShouldAbortGame } from "../runtime-state.js";
import errorTracking from "../error-tracking.js";

const Konva = globalThis.Konva;
let assetsManifestPromise = null;

/**
 * Fetch and cache the static AOT asset manifest (`./assets/assets.manifest.json`).
 * @returns {Promise<{ version?: number, folders?: Record<string, string[]> }>}
 */
function getAssetsManifest() {
    if (!assetsManifestPromise) {
        assetsManifestPromise = fetch("./assets/assets.manifest.json")
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`${response.status} - Asset manifest not found`);
                }
                return response.json();
            })
            .catch((error) => {
                assetsManifestPromise = null;
                throw error;
            });
    }
    return assetsManifestPromise;
}

/**
 * Clear the cached asset manifest promise (useful for tests or hot reloads).
 */
function clearAssetsManifestCache() {
    assetsManifestPromise = null;
}

/**
 * Normalize a character folder + outfit into a relative POSIX key matching `assets.manifest.json`.
 * @param {string} folder
 * @param {string} outfit
 * @returns {string}
 */
function normalizeOutfitFolderPath(folder, outfit) {
    const raw = `${folder || ""}/${outfit || ""}`
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(/^(\.\.?\/)+/, "")
        .replace(/^\/+/, "")
        .replace(/^assets\/game-assets\//, "")
        .replace(/\/+$/, "");
    return raw;
}

const repositionObjects = new Set(); // Persistent list for repositioning on every game-ui-ready (for fullscreen/resize)

globalThis.addEventListener("game-ui-ready", () => {
    const game = getGame();
    // Persistent repositioning for fullscreen/resize transitions
    repositionObjects.forEach(obj => {
        obj(game);
    });
});
class Character {
    /**
     * @param {{ name?: string, folder?: string, x?: number, y?: number, scale?: number }} options
     */
    constructor({ name = "", folder = "", x = 0, y = 0, scale = 1 }) {
        this._defaultScale = scale;
        this.data = {
            name, folder, x, y, scale
        };

        this.outfits = {};
        
        this._outfit = undefined;
        this._initialized = false; // Track if initial positioning has been applied
        this._disposed = false;
        this.img = new Konva.Image({
            filters: [Konva.Filters.Blur, Konva.Filters.Noise, Konva.Filters.Pixelate, Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL],
            blurRadius: 0,
            noise: 0,
            pixelSize: 1
        });
        // Use persistent repositioning list so y position updates on fullscreen/resize
        this._repositionCallback = (game) => {
            if (this._disposed) {
                return;
            }
            const img = this.img.image();
            if(img && this.img.getParent()) {
                // Recalculate position for current container dimensions
                // This handles fullscreen/resize transitions where dimensions change
                const scaleX = this.img.scale().x || 1;
                const containerWidth = game.ui.game.container.width();
                const containerHeight = game.ui.game.container.height();
                const movableWidth = containerWidth - (img.width * scaleX);
                // For x: relative to movableWidth; for y: relative to containerHeight
                const pixelX = this.data.x * movableWidth;
                const pixelY = this.data.y * containerHeight;
                this.img.x(pixelX);
                this.img.y(pixelY);
            }
        };
        repositionObjects.add(this._repositionCallback);
    }

    dispose() {
        this._disposed = true;
        if (this._repositionCallback) {
            repositionObjects.delete(this._repositionCallback);
        }
    }

    _ensureValidKonvaNode() {
        if (this.img?._isDestroyed) {
            const Konva = globalThis.Konva;
            if (!Konva?.Image) return;
            const oldAttrs = this.img.attrs ? { ...this.img.attrs } : {};
            delete oldAttrs.id;
            this.img = new Konva.Image({
                ...oldAttrs,
                image: this._outfit?.img || null
            });
        }
    }

    show() {
        const game = getGame();
        if(game) {
            this._ensureValidKonvaNode();
            if (this.img.getParent() !== game.ui.game.container) {
                game.ui.game.container.add(this.img);
            }
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    hide() {
        const game = getGame();
        if(game) {
            this.img.remove();
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    fadeIn(duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                this._ensureValidKonvaNode();
                this.img.opacity(0);
                if (this.img.getParent() !== game.ui.game.container) {
                    game.ui.game.container.add(this.img);
                }
                this.img.to({
                    opacity: 1,
                    duration: duration,
                    onFinish: () => {
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    fadeOut(duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                if (duration <= 0) {
                    this.img.opacity(0);
                    this.img.remove();
                    this.img.getLayer()?.batchDraw?.();
                    resolve();
                    return;
                }
                this.img.to({
                    opacity: 0,
                    duration: duration,
                    onFinish: () => {
                        this.img.remove();
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    slideIn(x = 0, duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                this._ensureValidKonvaNode();
                this.img.opacity(0);
                if (this.img.getParent() !== game.ui.game.container) {
                    game.ui.game.container.add(this.img);
                }
                // Apply stored y position if set before image was loaded
                if(typeof this.data.y === "number") {
                    this.img.y(this.getValue("y", this.data.y));
                }
                if (duration <= 0) {
                    this.img.opacity(1);
                    this.img.x(this.getValue("x", x));
                    this.data.x = x;
                    this.img.getLayer()?.batchDraw?.();
                    resolve();
                    return;
                }
                this.img.to({
                    opacity: 1,
                    x: this.getValue("x", x),
                    duration: duration,
                    onFinish: () => {
                        this.data.x = x;
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    slideOut(x = 1.25, duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                if (duration <= 0) {
                    this.img.opacity(0);
                    this.img.remove();
                    this.img.getLayer()?.batchDraw?.();
                    resolve();
                    return;
                }
                this.img.to({
                    opacity: 0,
                    x: this.getValue("x", x),
                    duration: duration,
                    onFinish: () => {
                        this.data.x = x;
                        this.img.remove();
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    to({ x = null, y = null, scale = null, opacity = null, blurRadius = null, noise = null, pixelSize = null, brightness = null, contrast = null, hue = null, saturation = null, luminance = null, mood = null, duration = 0.5 }) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            if (duration <= 0) {
                if (x !== null) { this.img.x(this.getValue("x", x)); this.data.x = x; }
                if (y !== null) { this.img.y(this.getValue("y", y)); this.data.y = y; }
                if (scale !== null) {
                    const value = this.getValue("scale", scale);
                    this.img.scaleX(value);
                    this.img.scaleY(value);
                    this.data.scale = scale;
                }
                if (opacity !== null) { this.img.opacity(opacity); this.data.opacity = opacity; }
                if (blurRadius !== null && typeof this.img.blurRadius === "function") this.img.blurRadius(blurRadius);
                if (noise !== null && typeof this.img.noise === "function") this.img.noise(noise);
                if (pixelSize !== null && typeof this.img.pixelSize === "function") this.img.pixelSize(pixelSize);
                if (brightness !== null && typeof this.img.brightness === "function") this.img.brightness(brightness);
                if (contrast !== null && typeof this.img.contrast === "function") this.img.contrast(contrast);
                if (hue !== null && typeof this.img.hue === "function") this.img.hue(hue);
                if (saturation !== null && typeof this.img.saturation === "function") this.img.saturation(saturation);
                if (luminance !== null && typeof this.img.luminance === "function") this.img.luminance(luminance);
                if (mood !== null) this.mood = mood;
                this.img.getLayer()?.batchDraw?.();
                resolve();
                return;
            }

            let pending = 0;
            let settled = false;

            const complete = () => {
                if (settled) {
                    return;
                }

                pending -= 1;
                if (pending <= 0) {
                    settled = true;
                    resolve();
                }
            };

            const fail = (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                reject(error);
            };

            const queueTween = (attrs, onUpdate = null) => {
                pending += 1;
                this.img.to({
                    ...attrs,
                    duration,
                    onUpdate: onUpdate
                        ? () => {
                            onUpdate();
                        }
                        : undefined,
                    onFinish: () => {
                        complete();
                    }
                });
            };

            if (x !== null) {
                queueTween({ x: this.getValue("x", x) });
            }

            if (y !== null) {
                queueTween({ y: this.getValue("y", y) });
            }

            if (scale !== null) {
                const value = this.getValue("scale", scale);
                queueTween({ scaleX: value, scaleY: value });
            }

            if (opacity !== null) {
                queueTween({ opacity: opacity });
            }

            if (blurRadius !== null) {
                queueTween({ blurRadius: blurRadius }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (noise !== null) {
                queueTween({ noise: noise }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (pixelSize !== null) {
                queueTween({ pixelSize: pixelSize }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (brightness !== null) {
                queueTween({ brightness: brightness }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (contrast !== null) {
                queueTween({ contrast: contrast }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (hue !== null) {
                queueTween({ hue: hue }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (saturation !== null) {
                queueTween({ saturation: saturation }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (luminance !== null) {
                queueTween({ luminance: luminance }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (mood !== null) {
                if(this._outfit) {
                    pending += 1;
                    this._outfit
                        .to({ mood: mood, duration: duration })
                        .then(() => {
                            complete();
                        })
                        .catch((error) => {
                            fail(error);
                        });
                } else {
                    fail(new Error("No outfit set!"));
                    return;
                }
            }

            if (pending === 0 && !settled) {
                settled = true;
                resolve();
            }
        });
    }

    reset(except = []) {
        const attrs = {};
        if(!except.includes("x")) attrs.x = 0;
        if(!except.includes("y")) attrs.y = 0;
        if(!except.includes("scale")) {
            this.data.scale = this._defaultScale;
            const origScale = this.img?.getAttr?.("origScale") || 1;
            const effectiveScale = this.data.scale * origScale;
            attrs.scaleX = effectiveScale;
            attrs.scaleY = effectiveScale;
        }
        if(!except.includes("opacity")) attrs.opacity = 1;
        if(!except.includes("blurRadius")) attrs.blurRadius = 0;
        if(!except.includes("noise")) attrs.noise = 0;
        if(!except.includes("pixelSize")) attrs.pixelSize = 1;
        if(!except.includes("brightness")) attrs.brightness = 0;
        if(!except.includes("contrast")) attrs.contrast = 0;
        if(!except.includes("hue")) attrs.hue = 0;
        if(!except.includes("saturation")) attrs.saturation = 0;
        if(!except.includes("luminance")) attrs.luminance = 0;
        this.img.setAttrs(attrs);
        if(!except.includes("grayscale")) this.grayscale = false;
        if(!except.includes("invert")) this.invert = false;
    }

    /**
     * 
     * @param {'x' | 'y' | 'scale'} key 
     * @param {number} val 
     * @returns {number}
     */
    getValue(key = "x", val) {
        const game = getGame();
        let value = undefined;
        switch (key) {
        case "x": {
            const img = this.img.image();
            const scaleX = this.img.scale().x || 1;
            const imgWidth = img?.width || 0;
            const movableWidth = game.ui.game.container.width() - (imgWidth * scaleX);
            value = val * movableWidth;
            break;
        }
        case "y": {
            const containerHeight = game.ui.game.container.height();
            const pixelY = val * containerHeight;
            value = pixelY;
            break;
        }
        case "scale": {
            const originalScale = this.img.getAttr("origScale") || 1;
            value = val * originalScale;
            break;
        }
        default: {
            throw new Error("Invalid Key!");
        };
        }

        return value;
    }

    /**
     * @param {number} value 
     */
    set opacity(value) {
        this.data.opacity = value;
        this.img.opacity(value);
    }

    /**
     * @param {number} value 
     */
    set x(value) {
        this.data.x = value;
        const img = this.img.image();
        if(img) {
            const x = this.getValue("x", value);
            this.img.x(x);
        }
    }

    /**
     * @param {number} value 
     */
    set y(value) {
        this.data.y = value;
        const img = this.img.image();
        if(img) {
            const y = this.getValue("y", value);
            this.img.y(y);
        }
    }

    get scale() {
        return this.data.scale;
    }

    /**
     * @param {number} value 
     */
    set scale(value) {
        this.data.scale = value;
        const img = this.img.image();
        if(img) {
            const scale = this.getValue("scale", value);
            this.img.scale({ x: scale, y: scale });
        }
    }

    /**
     * @param {number} value 
     */
    set blurRadius(value) {
        this.data.blurRadius = value;
        this.img.blurRadius(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value 
     */
    set noise(value) {
        this.data.noise = value;
        this.img.noise(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value 
     */
    set pixelSize(value) {
        this.data.pixelSize = value;
        this.img.pixelSize(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-1, 1] 
     */
    set brightness(value) {
        this.data.brightness = value;
        this.img.brightness(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-100, 100] 
     */
    set contrast(value) {
        this.data.contrast = value;
        this.img.contrast(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [0, 259]
     */
    set hue(value) {
        this.data.hue = value;
        this.img.hue(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-2, 10]
     */
    set saturation(value) {
        this.data.saturation = value;
        this.img.saturation(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-2, 2]
     */
    set luminance(value) {
        this.data.luminance = value;
        this.img.luminance(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {boolean} value 
     */
    set grayscale(value) {
        const filters = this.img.filters();
        if(value) {
            const index = filters.indexOf(Konva.Filters.Grayscale);
            if(index < 0) {
                filters.push(Konva.Filters.Grayscale);
            }
        } else {
            const index = filters.indexOf(Konva.Filters.Grayscale);
            if(index >= 0) {
                filters.splice(index, 1);
            }
        }

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {boolean} value 
     */
    set invert(value) {
        const filters = this.img.filters();
        if(value) {
            const index = filters.indexOf(Konva.Filters.Invert);
            if(index < 0) {
                filters.push(Konva.Filters.Invert);
            }
        } else {
            const index = filters.indexOf(Konva.Filters.Invert);
            if(index >= 0) {
                filters.splice(index, 1);
            }
        }

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * Apply ambient lighting or spotlight dimming tint.
     * @param {string} [color="#ffffff"]
     * @param {number} [strength=0.35]
     * @param {number} [duration=0]
     */
    setTint(color = "#ffffff", strength = 0.35, duration = 0) {
        const s = Math.min(1, Math.max(0, Number(strength) || 0));
        this._tint = { color: color || "#ffffff", strength: s };
        const baseOpacity = typeof this.data.opacity === "number" ? this.data.opacity : 1;
        const targetOpacity = s > 0 ? Math.max(0.35, baseOpacity * (1 - s * 0.75)) : baseOpacity;
        const dur = Number(duration) || 0;

        if (dur > 0 && typeof this.img?.to === "function" && this.img?.getParent?.()) {
            this.img.to({
                opacity: targetOpacity,
                duration: dur,
                onFinish: () => {
                    this.img.getLayer()?.batchDraw?.();
                }
            });
        } else {
            this.img.opacity(targetOpacity);
            this.img.getLayer()?.batchDraw?.();
        }
    }

    clearTint(duration = 0) {
        this.setTint("#ffffff", 0, duration);
    }

    /**
     * Trigger vertical spring hop impulse.
     * @param {number} [strength=20]
     */
    hop(strength = 20) {
        if (!this.img || typeof this.img.to !== "function") return;
        const curY = this.img.y();
        const str = Math.abs(Number(strength) || 20);
        this.img.to({
            y: curY - str,
            duration: 0.12,
            onFinish: () => {
                this.img.to({
                    y: curY,
                    duration: 0.14
                });
            }
        });
    }

    setFx(list = [], options = {}) {
        this._fx = { list: Array.isArray(list) ? list : (list ? [list] : []), ...options };
    }

    clearFx() {
        this.setFx([]);
    }

    /**
     * @param {Outfit} value - Outfit
     */
    set outfit(value) {
        this._outfit = value;
    }

    get outfit() {
        return this._outfit;
    }

    /**
     * @param {string} src 
     */
    set mood(src) {
        if(this._outfit) {
            this._outfit.mood = src;
            this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
        } else {
            throw new Error("No outfit set!");
        }
    }

    /**
     * Loads a character outfit package and caches its mood images.
     * @param {string} outfit
     * @returns {Promise<Outfit>}
     */
    async loadOutfit(outfit) {
        try {
            if (getShouldAbortGame()) {
                return;
            }

            const folderPath = normalizeOutfitFolderPath(this.data.folder, outfit);
            const manifest = await getAssetsManifest();
            const files = manifest?.folders?.[folderPath];

            if (!Array.isArray(files) || files.length === 0) {
                throw new Error(`404 - Folder Not Found! - ${this.data.folder}`);
            }

            const outfit_obj = new Outfit(this.img, outfit, this);
            for (const fileName of files) {
                const url = `./assets/game-assets/${folderPath}/${encodeURIComponent(fileName)}`;
                outfit_obj.moods[fileName] = loadImg(url);
            }

            this.outfits[outfit] = outfit_obj;
            return outfit_obj;
        } catch (error) {
            errorTracking?.captureError(error, {
                message: "[Character] Failed to load outfit",
                context: {
                    scope: "assets",
                    component: "character",
                    outfit,
                    folder: this.data.folder
                }
            });
            throw error;
        }
    }
}

class IMG {
    /**
     * @param {{ src: string, x?: number, y?: number, scale?: number }} options
     */
    constructor({ src, x = 0, y = 0, scale = 1 }) {
        this.data = {
            src, x, y, scale
        };

        this._initialized = false; // Track if initial positioning has been applied
        this._disposed = false;

        this.img = new Konva.Image({
            filters: [Konva.Filters.Blur, Konva.Filters.Noise, Konva.Filters.Pixelate, Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL],
            blurRadius: 0,
            noise: 0,
            pixelSize: 1
        });

        const html_img = loadImg(src);
        this.img.image(html_img);
        // Use persistent repositioning list so position updates on fullscreen/resize
        this._repositionCallback = (game) => {
            if (this._disposed) {
                return;
            }
            const img = this.img.image();
            if(img && this.img.getParent()) {
                // Recalculate position for current container dimensions
                // This handles fullscreen/resize transitions where dimensions change
                const scaleX = this.img.scale().x || 1;
                const containerWidth = game.ui.game.container.width();
                const containerHeight = game.ui.game.container.height();
                const movableWidth = containerWidth - (img.width * scaleX);
                // For x: relative to movableWidth; for y: relative to containerHeight
                const pixelX = this.data.x * movableWidth;
                const pixelY = this.data.y * containerHeight;
                this.img.x(pixelX);
                this.img.y(pixelY);
                this._initialized = true;
            }
        };
        repositionObjects.add(this._repositionCallback);
    }

    dispose() {
        this._disposed = true;
        if (this._repositionCallback) {
            repositionObjects.delete(this._repositionCallback);
        }
    }

    _ensureValidKonvaNode() {
        if (this.img?._isDestroyed) {
            const Konva = globalThis.Konva;
            if (!Konva?.Image) return;
            const oldAttrs = this.img.attrs ? { ...this.img.attrs } : {};
            delete oldAttrs.id;
            this.img = new Konva.Image({
                ...oldAttrs,
                image: this.imageObj || null
            });
        }
    }

    show() {
        const game = getGame();
        if(game) {
            this._ensureValidKonvaNode();
            if (this.img.getParent() !== game.ui.game.container) {
                game.ui.game.container.add(this.img);
            }
            // Apply stored position if set before image was loaded
            if(typeof this.data.x === "number") {
                this.img.x(this.getValue("x", this.data.x));
            }
            if(typeof this.data.y === "number") {
                this.img.y(this.getValue("y", this.data.y));
            }
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    hide() {
        const game = getGame();
        if(game) {
            this.img.remove();
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    fadeIn(duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                this.img.opacity(0);
                game.ui.game.container.add(this.img);
                // Apply stored position if set before image was loaded
                if(typeof this.data.x === "number") {
                    this.img.x(this.getValue("x", this.data.x));
                }
                if(typeof this.data.y === "number") {
                    this.img.y(this.getValue("y", this.data.y));
                }
                this.img.to({
                    opacity: 1,
                    duration: duration,
                    onFinish: () => {
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    fadeOut(duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                if (duration <= 0) {
                    this.img.opacity(0);
                    this.img.remove();
                    this.img.getLayer()?.batchDraw?.();
                    resolve();
                    return;
                }
                this.img.to({
                    opacity: 0,
                    duration: duration,
                    onFinish: () => {
                        this.img.remove();
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    slideIn(x = 0, duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            const game = getGame();
            if(game) {
                this.img.opacity(0);
                game.ui.game.container.add(this.img);
                // Apply stored y position if set before image was loaded
                if(typeof this.data.y === "number") {
                    this.img.y(this.getValue("y", this.data.y));
                }
                if (duration <= 0) {
                    this.img.opacity(1);
                    this.img.x(this.getValue("x", x));
                    this.data.x = x;
                    this.img.getLayer()?.batchDraw?.();
                    resolve();
                    return;
                }
                this.img.to({
                    opacity: 1,
                    x: this.getValue("x", x),
                    duration: duration,
                    onFinish: () => {
                        this.data.x = x;
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    slideOut(x = 1.25, duration = 0.5) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }
            
            const game = getGame();
            if(game) {
                if (duration <= 0) {
                    this.img.opacity(0);
                    this.img.remove();
                    this.img.getLayer()?.batchDraw?.();
                    resolve();
                    return;
                }
                this.img.to({
                    opacity: 0,
                    x: this.getValue("x", x),
                    duration: duration,
                    onFinish: () => {
                        this.data.x = x;
                        this.img.remove();
                        resolve();
                    }
                });
            } else {
                throw new Error("Game UI not ready!");
            }
        });
    }

    to({ x = null, y = null, scale = null, opacity = null, blurRadius = null, noise = null, pixelSize = null, brightness = null, contrast = null, hue = null, saturation = null, luminance = null, duration = 0.5 }) {
        return new Promise((resolve, reject) => {
            if(getShouldAbortGame()) {
                resolve();
                return;
            }

            let pending = 0;
            let settled = false;

            const complete = () => {
                if (settled) {
                    return;
                }

                pending -= 1;
                if (pending <= 0) {
                    settled = true;
                    resolve();
                }
            };

            const queueTween = (attrs, onUpdate = null) => {
                pending += 1;
                this.img.to({
                    ...attrs,
                    duration,
                    onUpdate: onUpdate
                        ? () => {
                            onUpdate();
                        }
                        : undefined,
                    onFinish: () => {
                        complete();
                    }
                });
            };

            if (x !== null) {
                queueTween({ x: this.getValue("x", x) });
            }
            if (y !== null) {
                queueTween({ y: this.getValue("y", y) });
            }
            if (scale !== null) {
                const value = this.getValue("scale", scale);
                queueTween({ scaleX: value, scaleY: value });
            }
            if (opacity !== null) {
                queueTween({ opacity: opacity });
            }
            if (blurRadius !== null) {
                queueTween({ blurRadius: blurRadius }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (noise !== null) {
                queueTween({ noise: noise }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (pixelSize !== null) {
                queueTween({ pixelSize: pixelSize }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (brightness !== null) {
                queueTween({ brightness: brightness }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (contrast !== null) {
                queueTween({ contrast: contrast }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (hue !== null) {
                queueTween({ hue: hue }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (saturation !== null) {
                queueTween({ saturation: saturation }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }
            if (luminance !== null) {
                queueTween({ luminance: luminance }, () => {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                });
            }

            if (pending === 0 && !settled) {
                settled = true;
                resolve();
            }
        });
    }

    /**
     * 
     * @param {'x' | 'y' | 'scale'} key 
     * @param {number} val 
     * @returns {number}
     */
    getValue(key = "x", val) {
        const game = getGame();
        let value = undefined;
        switch (key) {
        case "x": {
            const img = this.img.image();
            const scaleX = this.img.scale().x || 1;
            const imgWidth = img?.width || 0;
            const movableWidth = game.ui.game.container.width() - (imgWidth * scaleX);
            value = val * movableWidth;
            break;
        }
        case "y": {
            const containerHeight = game.ui.game.container.height();
            value = val * containerHeight;
            break;
        }
        case "scale": {
            const originalScale = this.img.getAttr("origScale") || 1;
            value = val * originalScale;
            break;
        }
        default: {
            throw new Error("Invalid Key!");
        };
        }

        return value;
    }

    /**
     * @param {number} value 
     */
    set opacity(value) {
        this.data.opacity = value;
        this.img.opacity(value);
    }

    /**
     * @param {number} value 
     */
    set x(value) {
        this.data.x = value;
        const img = this.img.image();
        if(img) {
            const x = this.getValue("x", value);
            this.img.x(x);
        }
    }

    /**
     * @param {number} value 
     */
    set y(value) {
        this.data.y = value;
        const img = this.img.image();
        if(img) {
            const y = this.getValue("y", value);
            this.img.y(y);
        }
    }

    get scale() {
        return this.data.scale;
    }

    /**
     * @param {number} value 
     */
    set scale(value) {
        this.data.scale = value;
        const img = this.img.image();
        if(img) {
            const scale = this.getValue("scale", value);
            this.img.scale({ x: scale, y: scale });
        }
    }

    /**
     * @param {number} value 
     */
    set blurRadius(value) {
        this.data.blurRadius = value;
        this.img.blurRadius(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value 
     */
    set noise(value) {
        this.data.noise = value;
        this.img.noise(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value 
     */
    set pixelSize(value) {
        this.data.pixelSize = value;
        this.img.pixelSize(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-1, 1] 
     */
    set brightness(value) {
        this.data.brightness = value;
        this.img.brightness(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-100, 100] 
     */
    set contrast(value) {
        this.data.contrast = value;
        this.img.contrast(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [0, 259]
     */
    set hue(value) {
        this.data.hue = value;
        this.img.hue(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-2, 10]
     */
    set saturation(value) {
        this.data.saturation = value;
        this.img.saturation(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {number} value - [-2, 2]
     */
    set luminance(value) {
        this.data.luminance = value;
        this.img.luminance(value);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {boolean} value 
     */
    set grayscale(value) {
        const filters = this.img.filters();
        if(value) {
            const index = filters.indexOf(Konva.Filters.Grayscale);
            if(index < 0) {
                filters.push(Konva.Filters.Grayscale);
            }
        } else {
            const index = filters.indexOf(Konva.Filters.Grayscale);
            if(index >= 0) {
                filters.splice(index, 1);
            }
        }

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {boolean} value 
     */
    set invert(value) {
        const filters = this.img.filters();
        if(value) {
            const index = filters.indexOf(Konva.Filters.Invert);
            if(index < 0) {
                filters.push(Konva.Filters.Invert);
            }
        } else {
            const index = filters.indexOf(Konva.Filters.Invert);
            if(index >= 0) {
                filters.splice(index, 1);
            }
        }

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * Apply ambient lighting or spotlight dimming tint.
     * @param {string} [color="#ffffff"]
     * @param {number} [strength=0.35]
     * @param {number} [duration=0]
     */
    setTint(color = "#ffffff", strength = 0.35, duration = 0) {
        const s = Math.min(1, Math.max(0, Number(strength) || 0));
        this._tint = { color: color || "#ffffff", strength: s };
        const baseOpacity = typeof this.data.opacity === "number" ? this.data.opacity : 1;
        const targetOpacity = s > 0 ? Math.max(0.35, baseOpacity * (1 - s * 0.75)) : baseOpacity;
        const dur = Number(duration) || 0;

        if (dur > 0 && typeof this.img?.to === "function" && this.img?.getParent?.()) {
            this.img.to({
                opacity: targetOpacity,
                duration: dur,
                onFinish: () => {
                    this.img.getLayer()?.batchDraw?.();
                }
            });
        } else {
            this.img.opacity(targetOpacity);
            this.img.getLayer()?.batchDraw?.();
        }
    }

    clearTint(duration = 0) {
        this.setTint("#ffffff", 0, duration);
    }

    /**
     * Trigger vertical spring hop impulse.
     * @param {number} [strength=20]
     */
    hop(strength = 20) {
        if (!this.img || typeof this.img.to !== "function") return;
        const curY = this.img.y();
        const str = Math.abs(Number(strength) || 20);
        this.img.to({
            y: curY - str,
            duration: 0.12,
            onFinish: () => {
                this.img.to({
                    y: curY,
                    duration: 0.14
                });
            }
        });
    }

    setFx(list = [], options = {}) {
        this._fx = { list: Array.isArray(list) ? list : (list ? [list] : []), ...options };
    }

    clearFx() {
        this.setFx([]);
    }
}

export { Character, IMG, clearAssetsManifestCache, normalizeOutfitFolderPath };

