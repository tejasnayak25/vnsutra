import "./konva.js";
import { konvaStage } from "./stage.js";
import errorTracking from "./error-tracking.js";

const Konva = globalThis.Konva;

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
                return new Promise((resolve, reject) => {
                    if(blurRadius) {
                        image.to({
                            blurRadius: blurRadius,
                            duration: duration,
                            onUpdate: () => {
                                try {
                                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                } catch (e) {
                                    errorTracking?.captureError(e, {
                                        type: "warning",
                                        message: "[Game] Cache failed in blurRadius onUpdate",
                                        context: { scope: "game", action: "background.blurRadius" }
                                    });
                                }
                            },
                            onFinish: () => {
                                try {
                                    image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                } catch (e) {
                                    errorTracking?.captureError(e, {
                                        type: "warning",
                                        message: "[Game] Cache failed in blurRadius onFinish",
                                        context: { scope: "game", action: "background.blurRadius" }
                                    });
                                }
                                resolve();
                            }
                        });
                    }
                    if(noise) {
                        image.to({
                            noise: noise,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
                    if(pixelSize) {
                        image.to({
                            pixelSize: pixelSize,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
                    if(brightness) {
                        image.to({
                            brightness: brightness,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
                    if(contrast) {
                        image.to({
                            contrast: contrast,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
                    if(hue) {
                        image.to({
                            hue: hue,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
                    if(saturation) {
                        image.to({
                            saturation: saturation,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
                    if(luminance) {
                        image.to({
                            luminance: luminance,
                            duration: duration,
                            onUpdate: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                                resolve();
                            }
                        });
                    }
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