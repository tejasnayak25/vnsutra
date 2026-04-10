import "./konva.js";
import { konvaStage } from "./stage.js";
import errorTracking from "./error-tracking.js";

const Konva = globalThis.Konva;
const pendingBackgroundCacheRafs = new WeakMap();

function scheduleBackgroundCache(image, action = "background") {
    if (!image || typeof image.cache !== "function") {
        return;
    }

    if (pendingBackgroundCacheRafs.has(image)) {
        return;
    }

    const rafId = requestAnimationFrame(() => {
        pendingBackgroundCacheRafs.delete(image);
        try {
            image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
        } catch (e) {
            errorTracking?.captureError(e, {
                type: "warning",
                message: "[Game] Cache scheduling failed",
                context: { scope: "game", action }
            });
        }
    });

    pendingBackgroundCacheRafs.set(image, rafId);
}

class Game {
    constructor(ui) {
        this.ui = ui;
        this._backgroundRequestId = 0;
    }

    /**
     * @param {HTMLImageElement} img - Url of the image
     */
    set background(img) {
        const image = this.ui.game.bg;
        const requestId = ++this._backgroundRequestId;
        image.image(img);

        const applyCoverScale = () => {
            if (requestId !== this._backgroundRequestId) {
                return;
            }

            const sourceWidth = img?.naturalWidth || img?.width || 0;
            const sourceHeight = img?.naturalHeight || img?.height || 0;
            const viewportWidth = this.ui?.game?.viewport?.width?.();
            const viewportHeight = this.ui?.game?.viewport?.height?.();
            const stageWidth = viewportWidth || this.ui?.game?.container?.width?.() || konvaStage.width();
            const stageHeight = viewportHeight || this.ui?.game?.container?.height?.() || konvaStage.height();

            if (!sourceWidth || !sourceHeight || !stageWidth || !stageHeight) {
                return;
            }

            const scale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight);

            image.scale({
                x: scale,
                y: scale
            });

            image.x((stageWidth - (sourceWidth * scale)) / 2);
            image.y((stageHeight - (sourceHeight * scale)) / 2);

            try {
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            } catch (e) {
                errorTracking?.captureError(e, {
                    message: "[Game.background] Cache failed",
                    context: {
                        scope: "game",
                        action: "background",
                        imageState: {
                            hasImage: !!image.image(),
                            parent: !!image.getParent(),
                            stage: !!image.getStage()
                        }
                    }
                });
            }
        };

        if ((img?.naturalWidth || img?.width) && (img?.naturalHeight || img?.height)) {
            applyCoverScale();
            return;
        }

        // If the image isn't ready yet, apply cover scaling as soon as it loads.
        const onLoad = () => {
            img?.removeEventListener?.("load", onLoad);
            img?.removeEventListener?.("error", onError);
            applyCoverScale();
        };

        const onError = (event) => {
            img?.removeEventListener?.("load", onLoad);
            img?.removeEventListener?.("error", onError);
            errorTracking?.captureError(event?.error || "Background image failed to load", {
                type: "warning",
                message: "[Game.background] Failed to load background image",
                context: { scope: "game", action: "background" }
            });
        };

        img?.addEventListener?.("load", onLoad, { once: true });
        img?.addEventListener?.("error", onError, { once: true });
    }

    /**
     * Properties
     */
    get background() {
        const image = this.ui.game.bg;
        return {
            /**
             * @param {number} value 
             */
            set blurRadius (value) {
                image.blurRadius(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for blurRadius",
                        context: { scope: "game", action: "background.blurRadius" }
                    });
                }
            },
            /**
             * @param {number} value - Default: 1
             */
            set pixelSize (value) {
                image.pixelSize(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for pixelSize",
                        context: { scope: "game", action: "background.pixelSize" }
                    });
                }
            },
            /**
             * @param {number} value 
             */
            set noise (value) {
                image.noise(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for noise",
                        context: { scope: "game", action: "background.noise" }
                    });
                }
            },
            /**
             * @param {number} value - [-1, 1] 
             */
            set brightness(value) {
                image.brightness(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for brightness",
                        context: { scope: "game", action: "background.brightness" }
                    });
                }
            },
            /**
             * @param {number} value - [-100, 100] 
             */
            set contrast(value) {
                image.contrast(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for contrast",
                        context: { scope: "game", action: "background.contrast" }
                    });
                }
            },
            /**
             * @param {number} value - [0, 259]
             */
            set hue(value) {
                image.hue(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for hue",
                        context: { scope: "game", action: "background.hue" }
                    });
                }
            },
            /**
             * @param {number} value - [-2, 10]
             */
            set saturation(value) {
                image.saturation(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for saturation",
                        context: { scope: "game", action: "background.saturation" }
                    });
                }
            },
            /**
             * @param {number} value - [-2, 2]
             */
            set luminance(value) {
                image.luminance(value);
                try {
                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                } catch (e) {
                    errorTracking?.captureError(e, {
                        type: "warning",
                        message: "[Game] Cache failed for luminance",
                        context: { scope: "game", action: "background.luminance" }
                    });
                }
            },
            /**
             * @param {boolean} value 
             */
            set grayscale(value) {
                const filters = image.filters();
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

                image.filters(filters);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {boolean} value 
             */
            set invert(value) {
                const filters = image.filters();
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

                image.filters(filters);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            to: ({blurRadius = null, noise = null, pixelSize = null, brightness = null, contrast = null, hue = null, saturation = null, luminance = null, duration = 0.5}) => {
                return new Promise((resolve) => {
                    const nextAttrs = {};

                    if (blurRadius !== null && blurRadius !== undefined) nextAttrs.blurRadius = blurRadius;
                    if (noise !== null && noise !== undefined) nextAttrs.noise = noise;
                    if (pixelSize !== null && pixelSize !== undefined) nextAttrs.pixelSize = pixelSize;
                    if (brightness !== null && brightness !== undefined) nextAttrs.brightness = brightness;
                    if (contrast !== null && contrast !== undefined) nextAttrs.contrast = contrast;
                    if (hue !== null && hue !== undefined) nextAttrs.hue = hue;
                    if (saturation !== null && saturation !== undefined) nextAttrs.saturation = saturation;
                    if (luminance !== null && luminance !== undefined) nextAttrs.luminance = luminance;

                    if (Object.keys(nextAttrs).length === 0) {
                        resolve();
                        return;
                    }

                    image.to({
                        ...nextAttrs,
                        duration,
                        onUpdate: () => {
                            scheduleBackgroundCache(image, "background.to.onUpdate");
                        },
                        onFinish: () => {
                            scheduleBackgroundCache(image, "background.to.onFinish");
                            resolve();
                        }
                    });
                });
            },
            reset: (except = []) => {
                const attrs = {};
                if(!except.includes("blurRadius")) attrs.blurRadius = 0;
                if(!except.includes("noise")) attrs.noise = 0;
                if(!except.includes("pixelSize")) attrs.pixelSize = 1;
                if(!except.includes("brightness")) attrs.brightness = 0;
                if(!except.includes("contrast")) attrs.contrast = 0;
                if(!except.includes("hue")) attrs.hue = 0;
                if(!except.includes("saturation")) attrs.saturation = 0;
                if(!except.includes("luminance")) attrs.luminance = 0;
                image.setAttrs(attrs);
                if(!except.includes("grayscale")) this.background.grayscale = false;
                if(!except.includes("invert")) this.background.invert = false;
            }
        };
    }
}

export { Game };
export default Game;