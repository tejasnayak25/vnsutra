import { getGame, getIsPortrait } from "../runtime-state.js";
import errorTracking from "../error-tracking.js";

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
        const item = Object.keys(this.character.outfits).find(this.name);
        if (item) {
            delete this.character.outfits[item];
        }
    }

    /**
     * @param {string} src
     */
    set mood(src) {
        const key = Object.keys(this.moods).find((key) => key.split(".")[0] === src);

        if (key) {
            const previousImage = this.img.image();
            const previousScaleY = this.img.scaleY() || this.img.scaleX() || 1;
            const mood = this.moods[key];

            let nextScale = null;
            if (previousImage && previousImage.height && mood.height) {
                const renderedHeight = previousImage.height * previousScaleY;
                nextScale = renderedHeight / mood.height;
            }

            if (nextScale === null) {
                const { width, height } = getGame().ui.game.container.getAttrs();
                nextScale = getIsPortrait() ? width / mood.width : height / mood.height;
            }

            // preserve visual center when swapping images so actor doesn't "jump"
            const prevImg = previousImage;
            const prevScaleX = this.img.scale().x || previousScaleY || 1;
            const prevScaleY = previousScaleY || this.img.scale().y || this.img.scale().x || 1;
            let prevCenterX = null;
            let prevCenterY = null;
            if (prevImg) {
                prevCenterX = this.img.x() + (prevImg.width * prevScaleX) / 2;
                prevCenterY = this.img.y() + (prevImg.height * prevScaleY) / 2;
            }

            this.img.image(mood);
            this.img.setAttr("origScale", nextScale / (this.character.data.scale || 1));
            this.img.scale({ x: nextScale, y: nextScale });

            if (prevCenterX !== null) {
                const newWidth = mood.width * nextScale;
                const newX = prevCenterX - newWidth / 2;
                const movableWidth = getGame().ui.game.container.width() - newWidth;
                this.img.x(newX);
                // Keep relative position as-is so intentional offscreen offsets (e.g. -0.25) remain stable.
                this.character.data.x = movableWidth ? (newX / movableWidth) : 0;
            } else {
                if (typeof this.character.data.x === "number") {
                    const movableWidth = getGame().ui.game.container.width() - (mood.width * nextScale);
                    this.img.x(this.character.data.x * movableWidth);
                }
            }

            // Align by bottom edge (baseline) to avoid visual vertical jumps
            if (prevCenterY !== null) {
                const newHeight = mood.height * nextScale;
                const prevBottom = this.img.y() + (prevImg.height * prevScaleY);
                const newY = prevBottom - newHeight;
                const containerHeight = getGame().ui.game.container.height();
                this.img.y(newY);
                this.character.data.y = containerHeight ? (newY / containerHeight) : 0;
            } else if (typeof this.character.data.y === "number") {
                this.img.y(this.character.getValue("y", this.character.data.y));
            }
        } else {
            errorTracking?.captureError(`404 - State Not Found! - ${src}`, {
                type: "warning",
                message: "[Outfit] Mood not found",
                context: { scope: "assets", component: "outfit", mood: src }
            });
            throw new Error(`404 - State Not Found! - ${src}`);
        }
    }

    to({ mood = null, duration = 0.5 }) {
        return new Promise((resolve, reject) => {
            const key = Object.keys(this.moods).find((key) => key.split(".")[0] === mood);

            if (key) {
                const previousImage = this.img.image();
                const previousScaleY = this.img.scaleY() || this.img.scaleX() || 1;
                const mood = this.moods[key];

                let nextScale = null;
                if (previousImage && previousImage.height && mood.height) {
                    const renderedHeight = previousImage.height * previousScaleY;
                    nextScale = renderedHeight / mood.height;
                }

                if (nextScale === null) {
                    const { width, height } = getGame().ui.game.container.getAttrs();
                    nextScale = getIsPortrait() ? width / mood.width : height / mood.height;
                }

                // preserve visual center similar to the setter above
                const prevImg = previousImage;
                const prevScaleX = this.img.scale().x || previousScaleY || 1;
                const prevScaleY = previousScaleY || this.img.scale().y || this.img.scale().x || 1;
                let prevCenterX = null;
                let prevCenterY = null;
                if (prevImg) {
                    prevCenterX = this.img.x() + (prevImg.width * prevScaleX) / 2;
                    prevCenterY = this.img.y() + (prevImg.height * prevScaleY) / 2;
                }

                this.img.setAttr("origScale", nextScale / (this.character.data.scale || 1));
                this.img.scale({ x: nextScale, y: nextScale });
                if (this.img.image()) {
                    try {
                        this.img.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
                    } catch (e) {
                        errorTracking?.captureError(e, {
                            message: "[Outfit.to] Cache failed",
                            context: { scope: "assets", component: "outfit" }
                        });
                    }
                }
                if (prevCenterX !== null) {
                    const newWidth = mood.width * nextScale;
                    const newX = prevCenterX - newWidth / 2;
                    const movableWidth = getGame().ui.game.container.width() - newWidth;
                    this.img.x(newX);
                    this.character.data.x = movableWidth ? (newX / movableWidth) : 0;
                } else {
                    if (typeof this.character.data.x === "number") {
                        const movableWidth = getGame().ui.game.container.width() - (mood.width * nextScale);
                        this.img.x(this.character.data.x * movableWidth);
                    }
                }
                if (prevCenterY !== null) {
                    const newHeight = mood.height * nextScale;
                    const prevBottom = this.img.y() + (prevImg.height * prevScaleY);
                    const newY = prevBottom - newHeight;
                    const containerHeight = getGame().ui.game.container.height();
                    this.img.y(newY);
                    this.character.data.y = containerHeight ? (newY / containerHeight) : 0;
                } else if (typeof this.character.data.y === "number") {
                    this.img.y(this.character.getValue("y", this.character.data.y));
                }

                const clone = this.img.clone();

                clone.opacity(0);
                clone.image(mood);
                try {
                    clone.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
                } catch (e) {
                    errorTracking?.captureError(e, {
                        message: "[Outfit.to] Clone cache failed",
                        context: { scope: "assets", component: "outfit" }
                    });
                }

                const parent = this.img.getParent();
                if (!parent) {
                    this.img.image(mood);
                    try {
                        this.img.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
                    } catch (e) {
                        errorTracking?.captureError(e, {
                            message: "[Outfit.to] No-parent cache failed",
                            context: { scope: "assets", component: "outfit" }
                        });
                    }
                    resolve();
                    return;
                }
                parent.add(clone);

                clone.to({
                    opacity: 1,
                    duration: duration,
                    onFinish: () => {
                        this.img.image(mood);
                        try {
                            this.img.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
                        } catch (e) {
                            errorTracking?.captureError(e, {
                                message: "[Outfit.to] onFinish cache failed",
                                context: { scope: "assets", component: "outfit" }
                            });
                        }
                        clone.remove();
                        resolve();
                    }
                });
            } else {
                errorTracking?.captureError(`404 - State Not Found! - ${mood}`, {
                    type: "warning",
                    message: "[Outfit.to] Mood not found",
                    context: { scope: "assets", component: "outfit", mood }
                });
                throw new Error(`404 - State Not Found! - ${mood}`);
            }
        });
    }
}

export { Outfit };
