let config = {
    assets: "assets/game-assets"
}

class Background {
    constructor(url) {
        let img = loadImg(`./${config.assets}/${url}`);
        return img;
    }
}

let updateObjects = [];

window.addEventListener("game-ui-ready", () => {
    updateObjects.forEach(obj => {
        obj(game);
    });
    updateObjects = [];
});

class Outfit {
    /**
     * 
     * @param {Konva.Image} img 
     * @param {string} name 
     * @param {_Character} character 
     */
    constructor(img, name, character) {
        this.img = img;
        this.name = name;
        this.character = character;
        this.moods = {};
    }

    dispose() {
        this.moods = {};
        let item = Object.keys(this.character.outfits).find(this.name);
        if(item) {
            delete this.character.outfits[item];
        }
    }

    /**
     * @param {string} src 
     */
    set mood(src) {
        let key = Object.keys(this.moods).find(key => key.split(".")[0]  === src);

        if(key) {
            let mood = this.moods[key];
            this.img.image(mood);
            let {width, height} = game.ui.game.container.getAttrs();
            let scale = isMobile ? (width / mood.width) : (height / mood.height);
            this.img.setAttr("origScale", scale);
            this.img.scale({ x: (scale * this.character.data.scale), y: (scale * this.character.data.scale) });
        } else {
            throw new Error(`404 - State Not Found! - ${src}`);
        }
    }

    to({ mood = null, duration = 0.5 }) {
        return new Promise((resolve, reject) => {
            let key = Object.keys(this.moods).find(key => key.split(".")[0]  === mood);

            if(key) {
                let mood = this.moods[key];
                let {width, height} = game.ui.game.container.getAttrs();
                let scale = isMobile ? (width / mood.width) : (height / mood.height);
                this.img.setAttr("origScale", scale);
                this.img.scale({ x: (scale * this.character.data.scale), y: (scale * this.character.data.scale) });
                if(this.img.image()) {
                    this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                }
                if(this.character.data.x) {
                    this.img.x(this.character.getValue("x", this.character.data.x));
                }
                if(this.character.data.y) {
                    this.img.y(this.character.getValue("y", this.character.data.y));
                }
                
                let clone = this.img.clone();

                clone.opacity(0);
                clone.image(mood);
                clone.cache({pixelRatio: 1, imageSmoothingEnabled: true});

                let parent = this.img.getParent();
                parent.add(clone);

                clone.to({
                    opacity: 1,
                    duration: duration,
                    onFinish: () => {
                        this.img.image(mood);
                        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
                        clone.remove();
                        resolve();
                    }
                });

            } else {
                throw new Error(`404 - State Not Found! - ${src}`);
            }
        });
    }
}

class Character {
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
            let img = this.img.image();
            if(img) {
                let movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
                let movableHeight = game.ui.game.container.height() - (img.height * this.img.scale().y);
                this.img.x(this.data.x * movableWidth);
                this.img.y(this.data.y * movableHeight);
            }
        });
    }

    show() {
        if(game) {
            game.ui.game.container.add(this.img);
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    hide() {
        if(game) {
            this.img.remove();
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    fadeIn(duration = 0.5) {
        return new Promise((resolve, reject) => {
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
            if(mood) {
                if(this._outfit) {
                    this._outfit.to({ mood: mood, duration: duration }).then(resolve);
                } else {
                    throw new Error("No outfit set!");
                }
            }
        });
    }

    reset(except = []) {
        let attrs = {};
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
        let value = undefined;
        switch (key) {
            case "x": {
                let img = this.img.image();
                let movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
                value = val * movableWidth;
                break;
            }
            case "y": {
                let movableHeight = game.ui.game.container.height();
                value = val * movableHeight;
                break;
            }
            case "scale": {
                let originalScale = this.img.getAttr("origScale");
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
        let img = this.img.image();
        if(img) {
            let x = this.getValue("x", value);
            this.data.x = value;
            this.img.x(x);
        }
    }

    /**
     * @param {number} value 
     */
    set y(value) {
        let img = this.img.image();
        if(img) {
            let y = this.getValue("y", value);
            this.data.y = value;
            this.img.y(y);
        }
    }

    /**
     * @param {number} value 
     */
    set scale(value) {
        let img = this.img.image();
        if(img) {
            let scale = this.getValue("scale", value);
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
        let filters = this.img.filters();
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

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {boolean} value 
     */
    set invert(value) {
        let filters = this.img.filters();
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

    loadOutfit(outfit) {
        return new Promise((resolve, reject) => {
            fetch(`./folder?path=${encodeURIComponent(`${this.data.folder}/${outfit}`)}`).then(res => res.json()).then((res) => {
                if(res.status === 200) {
                    var zip = new JSZip();

                    let outfit_obj = new Outfit(this.img, outfit, this);

                    let data = res.data;
                    data = base64ToArrayBuffer(data);
                    zip.loadAsync(data)
                    .then(function(zip) {
                        Object.values(zip.files).forEach(async (file) => {
                            let arraybuffer = await file.async("arraybuffer");
                            let blob = new Blob([arraybuffer]);
                            let url = URL.createObjectURL(blob);
                            outfit_obj.moods[file.name] = loadImg(url);
                        });
                    });

                    this.outfits[outfit] = outfit_obj;
                    resolve(outfit_obj);
                } else {
                    throw new Error(`404 - Folder Not Found! - ${this.data.folder}`);
                }
            }).catch(e => {
                throw new Error(`404 - Folder Not Found! - ${this.data.folder}`);
            });
        });
    }
}

class IMG {
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

        let html_img = loadImg(src);
        this.img.image(html_img);
        updateObjects.push((game) => {
            let img = this.img.image();
            if(img) {
                let movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
                let movableHeight = game.ui.game.container.height() - (img.height * this.img.scale().y);
                this.img.x(this.data.x * movableWidth);
                this.img.y(this.data.y * movableHeight);
            }
        });
    }

    show() {
        if(game) {
            game.ui.game.container.add(this.img);
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    hide() {
        if(game) {
            this.img.remove();
        } else {
            throw new Error("Game UI not ready!");
        }
    }

    fadeIn(duration = 0.5) {
        return new Promise((resolve, reject) => {
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
        let value = undefined;
        switch (key) {
            case "x": {
                let img = this.img.image();
                let movableWidth = game.ui.game.container.width() - (img.width * this.img.scale().x);
                value = val * movableWidth;
                break;
            }
            case "y": {
                let movableHeight = game.ui.game.container.height();
                value = val * movableHeight;
                break;
            }
            case "scale": {
                let originalScale = this.img.getAttr("origScale");
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
        let img = this.img.image();
        if(img) {
            let x = this.getValue("x", value);
            this.data.x = value;
            this.img.x(x);
        }
    }

    /**
     * @param {number} value 
     */
    set y(value) {
        let img = this.img.image();
        if(img) {
            let y = this.getValue("y", value);
            this.data.y = value;
            this.img.y(y);
        }
    }

    /**
     * @param {number} value 
     */
    set scale(value) {
        let img = this.img.image();
        if(img) {
            let scale = this.getValue("scale", value);
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
        let filters = this.img.filters();
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

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }

    /**
     * @param {boolean} value 
     */
    set invert(value) {
        let filters = this.img.filters();
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

        this.img.filters(filters);
        this.img.cache({pixelRatio: 1, imageSmoothingEnabled: true});
    }
}

class Music {
    constructor(src) {
        this.src = src;
        fetch(src).then(res => res.blob()).then(res => {
            this.src = URL.createObjectURL(res);
        });
        this.elem = document.getElementById("music");
    }

    play() {
        if(gameSettings['settings-music'] === true) {
            this.elem.src = this.src;
            this.elem.play();
        }
    }

    pause() {
        this.elem.pause();
    }
}

class Sfx {
    constructor(src) {
        this.src = src;
        fetch(src).then(res => res.blob()).then(res => {
            this.src = URL.createObjectURL(res);
        });
        this.elem = document.getElementById("sfx");
    }

    play() {
        if(gameSettings['settings-sfx'] === true) {
            this.elem.src = this.src;
            this.elem.play();
        }
    }

    pause() {
        this.elem.pause();
    }
}

function base64ToArrayBuffer(base64) {
    var binaryString = window.atob(base64);
    var len = binaryString.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}


export { Background, Character, IMG, Music, Sfx }