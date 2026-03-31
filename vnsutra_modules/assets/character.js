import "../jszip.min.js";
import { Outfit } from "./outfit.js";
import { loadImg } from "../ui/utils.js";
import { getGame, getShouldAbortGame } from "../runtime-state.js";
import errorTracking from "../error-tracking.js";

const Konva = globalThis.Konva;
const JSZip = globalThis.JSZip;

let updateObjects = [];

globalThis.addEventListener("game-ui-ready", () => {
    updateObjects.forEach(obj => {
        obj(getGame());
    });
    updateObjects = [];
});
class Character {
    /**
     * @param {{ name?: string, folder?: string, x?: number, y?: number, scale?: number }} options
     */
    constructor({ name = "", folder = "", x = 0, y = 0, scale = 1 }) {
        this.data = {
            name, folder, x, y, scale
        };

        this.outfits = {};
        
        this._outfit = undefined;
        this.img = new Konva.Image({
            filters: [Konva.Filters.Blur, Konva.Filters.Noise, Konva.Filters.Pixelate, Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL],
            blurRadius: 0,
            noise: 0,
            pixelSize: 1
        });
        updateObjects.push((game) => {
            const img = this.img.image();
            if(img) {
                const movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
                const movableHeight = game.ui.game.container.height() - (img.height * this.img.scale().y);
                this.img.x(this.data.x * movableWidth);
                this.img.y(this.data.y * movableHeight);
            }
        });
    }

    show() {
        const game = getGame();
        if(game) {
            game.ui.game.container.add(this.img);
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
            attrs.scaleX = 1;
            attrs.scaleY = 1;
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
            const img = this.img.image();
            const scaleY = this.img.scale().y || this.img.scale().x || 1;
            const imgHeight = img?.height || 0;
            const movableHeight = game.ui.game.container.height() - (imgHeight * scaleY);
            value = val * movableHeight;
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
        const img = this.img.image();
        if(img) {
            const x = this.getValue("x", value);
            this.data.x = value;
            this.img.x(x);
        }
    }

    /**
     * @param {number} value 
     */
    set y(value) {
        const img = this.img.image();
        if(img) {
            const y = this.getValue("y", value);
            this.data.y = value;
            this.img.y(y);
        }
    }

    /**
     * @param {number} value 
     */
    set scale(value) {
        const img = this.img.image();
        if(img) {
            const scale = this.getValue("scale", value);
            this.data.scale = value;
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
            if(getShouldAbortGame()) {
                return;
            }

            const response = await fetch(`./folder?path=${encodeURIComponent(`${this.data.folder}/${outfit}`)}`);
            const res = await response.json();

            if (res.status !== 200) {
                throw new Error(`404 - Folder Not Found! - ${this.data.folder}`);
            }

            const zip = new JSZip();
            const outfit_obj = new Outfit(this.img, outfit, this);

            let data = res.data;
            data = base64ToArrayBuffer(data);
            const loadedZip = await zip.loadAsync(data);

            const files = Object.values(loadedZip.files);
            for (const file of files) {
                const arraybuffer = await file.async("arraybuffer");
                const blob = new Blob([arraybuffer]);
                const url = URL.createObjectURL(blob);
                outfit_obj.moods[file.name] = loadImg(url);
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

        this.img = new Konva.Image({
            filters: [Konva.Filters.Blur, Konva.Filters.Noise, Konva.Filters.Pixelate, Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL],
            blurRadius: 0,
            noise: 0,
            pixelSize: 1
        });

        const html_img = loadImg(src);
        this.img.image(html_img);
        updateObjects.push((game) => {
            const img = this.img.image();
            if(img) {
                const movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
                const movableHeight = game.ui.game.container.height() - (img.height * this.img.scale().y);
                this.img.x(this.data.x * movableWidth);
                this.img.y(this.data.y * movableHeight);
            }
        });
    }

    show() {
        const game = getGame();
        if(game) {
            game.ui.game.container.add(this.img);
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

            let value;
            if(x) {
                value = this.getValue("x", x);
                this.img.to({
                    x: value,
                    duration: duration,
                    onFinish: () => {
                        resolve();
                    }
                });
            }
            if(y) {
                value = this.getValue("y", y);
                this.img.to({
                    y: value,
                    duration: duration,
                    onFinish: () => {
                        resolve();
                    }
                });
            }
            if(scale) {
                value = this.getValue("scale", scale);
                this.img.to({
                    scaleX: value,
                    scaleY: value,
                    duration: duration,
                    onFinish: () => {
                        resolve();
                    }
                });
            }
            if(opacity) {
                this.img.to({
                    opacity: opacity,
                    duration: duration,
                    onFinish: () => {
                        resolve();
                    }
                });
            }
            if(blurRadius) {
                this.img.to({
                    blurRadius: blurRadius,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(noise) {
                this.img.to({
                    noise: noise,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(pixelSize) {
                this.img.to({
                    pixelSize: pixelSize,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(brightness) {
                this.img.to({
                    brightness: brightness,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(contrast) {
                this.img.to({
                    contrast: contrast,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(hue) {
                this.img.to({
                    hue: hue,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(saturation) {
                this.img.to({
                    saturation: saturation,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
            }
            if(luminance) {
                this.img.to({
                    luminance: luminance,
                    duration: duration,
                    onUpdate: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                    },
                    onFinish: () => {
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        resolve();
                    }
                });
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
            const movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
            value = val * movableWidth;
            break;
        }
        case "y": {
            const img = this.img.image();
            const scaleY = this.img.scale().y || this.img.scale().x || 1;
            const imgHeight = img?.height || 0;
            const movableHeight = game.ui.game.container.height() - (imgHeight * scaleY);
            value = val * movableHeight;
            break;
        }
        case "scale": {
            const originalScale = this.img.getAttr("origScale");
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
        const img = this.img.image();
        if(img) {
            const x = this.getValue("x", value);
            this.data.x = value;
            this.img.x(x);
        }
    }

    /**
     * @param {number} value 
     */
    set y(value) {
        const img = this.img.image();
        if(img) {
            const y = this.getValue("y", value);
            this.data.y = value;
            this.img.y(y);
        }
    }

    /**
     * @param {number} value 
     */
    set scale(value) {
        const img = this.img.image();
        if(img) {
            const scale = this.getValue("scale", value);
            this.data.scale = value;
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
}

function base64ToArrayBuffer(base64) {
    const binaryString = globalThis.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export { Character, IMG };

