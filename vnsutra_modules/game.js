class Game {
    constructor(ui) {
        this.ui = ui;
    }

    /**
     * @param {HTMLImageElement} img - Url of the image
     */
    set background(img) {
        let image = this.ui.game.bg;
        if(isMobile) {
            let scale = konvaStage.height()/img.height;
            image.scale({
                x: scale,
                y: scale
            });
        } else {
            let scale = konvaStage.width()/img.width;
            image.scale({
                x: scale,
                y: scale
            });
        }
        image.image(img);
        image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    get background() {
        let image = this.ui.game.bg;
        return {
            /**
             * @param {number} value 
             */
            set blurRadius (value) {
                image.blurRadius(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value 
             */
            set pixelSize (value) {
                image.pixelSize(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value 
             */
            set noise (value) {
                image.noise(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value - [-1, 1] 
             */
            set brightness(value) {
                image.brightness(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value - [-100, 100] 
             */
            set contrast(value) {
                image.contrast(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value - [0, 259]
             */
            set hue(value) {
                image.hue(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value - [-2, 10]
             */
            set saturation(value) {
                image.saturation(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {number} value - [-2, 2]
             */
            set luminance(value) {
                image.luminance(value);
                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
            },
            /**
             * @param {boolean} value 
             */
            set grayscale(value) {
                let filters = image.filters();
                if(value) {
                    let index = filters.indexOf(Konva.Filters.Grayscale);
                    if(index < 0) {
                        filters.push(Konva.Filters.Grayscale);
                    }
                } else {
                    let index = filters.indexOf(Konva.Filters.Grayscale);
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
                let filters = image.filters();
                if(value) {
                    let index = filters.indexOf(Konva.Filters.Invert);
                    if(index < 0) {
                        filters.push(Konva.Filters.Invert);
                    }
                } else {
                    let index = filters.indexOf(Konva.Filters.Invert);
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
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                            },
                            onFinish: () => {
                                image.cache({pixelRatio: 1, imageSmoothingEnabled: true});
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
            }
        }
    }
}