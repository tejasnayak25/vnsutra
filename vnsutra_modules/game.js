import "https://unpkg.com/konva@10.0.0-1/konva.min.js";
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
            image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
        this._parallaxPlanes = [];
        this._currentStage = null;
        this._currentBackgroundAsset = null;
        this._bgCrossfadeNode = null;
        this._bgTransitionTween = null;
    }

    /**
     * @param {HTMLImageElement|string} img - Url or image object
     */
    set background(img) {
        this._currentBackgroundAsset = img;
        this.changeBackground(img, { duration: 0.35 });
    }

    /**
     * Current background image or asset.
     */
    get currentBackground() {
        return this._currentBackgroundAsset || this.ui?.game?.bg?.image?.();
    }

    /**
     * Smoothly change background with crossfade transition.
     * @param {HTMLImageElement|Object|string} img
     * @param {Object} [options]
     * @param {number} [options.duration=0.4] - Duration in seconds (0 for immediate)
     * @param {string} [options.transition="crossfade"]
     * @returns {Promise<void>}
     */
    async changeBackground(img, options = {}) {
        this._currentBackgroundAsset = img;
        const requestId = ++this._backgroundRequestId;
        const duration = options.duration !== undefined ? Number(options.duration) : 0.4;
        const KonvaLib = globalThis.Konva || Konva;
        const image = this.ui?.game?.bg;
        const bgGroup = this.ui?.game?.bgGroup || image?.getParent?.();

        if (!image) {
            this.clearParallaxBackground();
            return;
        }

        // Cancel existing transition tween if running
        if (this._bgTransitionResolve) {
            this._bgTransitionResolve();
            this._bgTransitionResolve = null;
        }
        if (this._bgTransitionTween) {
            try {
                this._bgTransitionTween.destroy();
            } catch (_) { /* ignore */ }
            this._bgTransitionTween = null;
        }
        if (this._bgCrossfadeNode) {
            try {
                this._bgCrossfadeNode.destroy();
            } catch (_) { /* ignore */ }
            this._bgCrossfadeNode = null;
        }

        // Wait for image dimensions if it's an HTMLImageElement not yet loaded
        if (img && typeof img.addEventListener === "function") {
            const hasDimensions = (img.naturalWidth || img.width) && (img.naturalHeight || img.height);
            if (!hasDimensions) {
                await new Promise((resolve) => {
                    const onDone = () => {
                        img.removeEventListener("load", onDone);
                        img.removeEventListener("error", onDone);
                        resolve();
                    };
                    img.addEventListener("load", onDone, { once: true });
                    img.addEventListener("error", onDone, { once: true });
                    setTimeout(resolve, 350);
                });
            }
        }

        if (requestId !== this._backgroundRequestId) {
            return;
        }

        // Calculate geometry with cover scaling
        const sourceWidth = img?.naturalWidth || img?.width || 0;
        const sourceHeight = img?.naturalHeight || img?.height || 0;
        const viewportWidth = this.ui?.game?.viewport?.width?.();
        const viewportHeight = this.ui?.game?.viewport?.height?.();
        const stageWidth = viewportWidth || this.ui?.game?.container?.width?.() || this.ui?.stage?.width?.() || 1280;
        const stageHeight = viewportHeight || this.ui?.game?.container?.height?.() || this.ui?.stage?.height?.() || 720;

        let scale = 1;
        let posX = 0;
        let posY = 0;
        if (sourceWidth > 0 && sourceHeight > 0 && stageWidth > 0 && stageHeight > 0) {
            scale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight);
            posX = (stageWidth - (sourceWidth * scale)) / 2;
            posY = (stageHeight - (sourceHeight * scale)) / 2;
        }

        const applyTargetAttributes = (node) => {
            if (!node) return;
            if (typeof node.image === "function") node.image(img);
            if (typeof node.scale === "function") node.scale({ x: scale, y: scale });
            if (typeof node.x === "function") node.x(posX);
            if (typeof node.y === "function") node.y(posY);
            if (typeof node.opacity === "function") node.opacity(1);
            if (typeof node.visible === "function") node.visible(true);
            try {
                node.cache?.({ pixelRatio: 1, imageSmoothingEnabled: true });
            } catch (e) {
                // Ignore cache error in headless/mock
            }
        };

        const hasExistingImage = Boolean(image.image?.() && (typeof image.visible !== "function" || image.visible()));
        const hasParallax = Boolean((this._parallaxPlanes && this._parallaxPlanes.length > 0) || this._currentStage);

        // Immediate switch if: duration <= 0, or no existing bg/parallax (initial first load), or no Konva.Image/Tween
        if (duration <= 0 || (!hasExistingImage && !hasParallax) || !KonvaLib?.Image || !KonvaLib?.Tween || !bgGroup?.add) {
            this.clearParallaxBackground();
            applyTargetAttributes(image);
            bgGroup?.getLayer?.()?.batchDraw?.();
            return;
        }

        // Smooth crossfade:
        // Create an overlay image in bgGroup above image with opacity 0, tween to 1
        const crossfadeNode = new KonvaLib.Image({
            id: "game-bg-crossfade",
            image: img,
            x: posX,
            y: posY,
            scaleX: scale,
            scaleY: scale,
            opacity: 0,
            listening: false
        });

        this._bgCrossfadeNode = crossfadeNode;
        bgGroup.add(crossfadeNode);
        bgGroup.getLayer?.()?.batchDraw?.();

        // Also fade out old parallax stage if one was active
        const oldStage = this._currentStage;
        if (oldStage && typeof oldStage.fadeOut === "function") {
            oldStage.fadeOut(duration);
        }

        await new Promise((resolve) => {
            this._bgTransitionResolve = resolve;
            const tween = new KonvaLib.Tween({
                node: crossfadeNode,
                duration,
                opacity: 1,
                easing: KonvaLib.Easings?.EaseInOut || KonvaLib.Easings?.Linear,
                onFinish: () => {
                    this._bgTransitionResolve = null;
                    if (requestId === this._backgroundRequestId) {
                        applyTargetAttributes(image);
                        this.clearParallaxBackground();
                        if (this._bgCrossfadeNode === crossfadeNode) {
                            try { crossfadeNode.destroy(); } catch (_) { /* ignore */ }
                            this._bgCrossfadeNode = null;
                        }
                        this._bgTransitionTween = null;
                        bgGroup?.getLayer?.()?.batchDraw?.();
                    } else {
                        try { crossfadeNode.destroy(); } catch (_) { /* ignore */ }
                    }
                    resolve();
                }
            });

            this._bgTransitionTween = tween;
            tween.play();
        });
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
            set blurRadius(value) {
                image.blurRadius(value);
                try {
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
            set pixelSize(value) {
                image.pixelSize(value);
                try {
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
            set noise(value) {
                image.noise(value);
                try {
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
                    image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
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
                if (value) {
                    const index = filters.indexOf(Konva.Filters.Grayscale);
                    if (index < 0) {
                        filters.push(Konva.Filters.Grayscale);
                    }
                } else {
                    const index = filters.indexOf(Konva.Filters.Grayscale);
                    if (index >= 0) {
                        filters.splice(index, 1);
                    }
                }

                image.filters(filters);
                image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
            },
            /**
             * @param {boolean} value 
             */
            set invert(value) {
                const filters = image.filters();
                if (value) {
                    const index = filters.indexOf(Konva.Filters.Invert);
                    if (index < 0) {
                        filters.push(Konva.Filters.Invert);
                    }
                } else {
                    const index = filters.indexOf(Konva.Filters.Invert);
                    if (index >= 0) {
                        filters.splice(index, 1);
                    }
                }

                image.filters(filters);
                image.cache({ pixelRatio: 1, imageSmoothingEnabled: true });
            },
            to: ({ blurRadius = null, noise = null, pixelSize = null, brightness = null, contrast = null, hue = null, saturation = null, luminance = null, duration = 0.5 }) => {
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
                if (!except.includes("blurRadius")) attrs.blurRadius = 0;
                if (!except.includes("noise")) attrs.noise = 0;
                if (!except.includes("pixelSize")) attrs.pixelSize = 1;
                if (!except.includes("brightness")) attrs.brightness = 0;
                if (!except.includes("contrast")) attrs.contrast = 0;
                if (!except.includes("hue")) attrs.hue = 0;
                if (!except.includes("saturation")) attrs.saturation = 0;
                if (!except.includes("luminance")) attrs.luminance = 0;
                image.setAttrs(attrs);
                if (!except.includes("grayscale")) this.background.grayscale = false;
                if (!except.includes("invert")) this.background.invert = false;
            }
        };
    }

    /**
     * Configure a 2.5D multi-plane parallax background.
     * @param {Array<Object>|Object} planesOrConfig - Array of plane descriptors or shorthand config
     * @param {Object} [options]
     */
    setParallaxBackground(planesOrConfig, options = {}) {
        this.clearParallaxBackground();
        const KonvaLib = globalThis.Konva || Konva;

        let rawPlanes = [];
        let mergedOptions = { ...options };

        if (Array.isArray(planesOrConfig)) {
            rawPlanes = planesOrConfig;
        } else if (planesOrConfig && typeof planesOrConfig === "object") {
            if (Array.isArray(planesOrConfig.planes)) {
                rawPlanes = planesOrConfig.planes;
                mergedOptions = { ...planesOrConfig, ...options };
            } else {
                // Shorthand object e.g. { far: img1, mid: img2, near: img3, fore: img4 }
                const depths = { far: 0.2, mid: 0.6, near: 1.0, fore: 1.5 };
                for (const [key, val] of Object.entries(planesOrConfig)) {
                    if (val && depths[key] !== undefined) {
                        rawPlanes.push({ image: val, depth: depths[key], id: key });
                    }
                }
            }
        }

        if (rawPlanes.length === 0) {
            return [];
        }

        const viewportWidth = this.ui?.game?.viewport?.width?.();
        const viewportHeight = this.ui?.game?.viewport?.height?.();
        const stageWidth = viewportWidth || this.ui?.game?.container?.width?.() || konvaStage?.width?.() || 1280;
        const stageHeight = viewportHeight || this.ui?.game?.container?.height?.() || konvaStage?.height?.() || 720;
        const overscan = mergedOptions.overscan !== undefined ? Number(mergedOptions.overscan) : 0.15;

        const bgGroup = this.ui?.game?.bgGroup || this.ui?.game?.camera || this.ui?.game?.container;
        const foreGroup = this.ui?.game?.foreGroup || this.ui?.game?.camera || this.ui?.game?.container;
        const defaultBg = this.ui?.game?.bg;

        // Hide default bg if multi-plane is overriding it
        if (defaultBg && typeof defaultBg.visible === "function") {
            defaultBg.visible(false);
        }

        const activePlanes = [];

        for (let i = 0; i < rawPlanes.length; i++) {
            const p = rawPlanes[i];
            const img = p.image || p.asset || p.src || null;
            const depth = p.depth !== undefined ? Number(p.depth) : (0.2 + i * 0.4);
            const id = p.id || `parallax-plane-${i}-${depth}`;
            const opacity = p.opacity !== undefined ? Number(p.opacity) : 1;

            let node = null;
            let baseX = 0;
            let baseY = 0;

            if (KonvaLib?.Image) {
                const targetW = stageWidth * (1 + overscan);
                const targetH = stageHeight * (1 + overscan);
                const sourceW = img?.naturalWidth || img?.width || stageWidth;
                const sourceH = img?.naturalHeight || img?.height || stageHeight;
                const scale = Math.max(targetW / sourceW, targetH / sourceH);

                baseX = (stageWidth - sourceW * scale) / 2;
                baseY = (stageHeight - sourceH * scale) / 2;

                const filters = [];
                if (p.blur && KonvaLib.Filters?.Blur) {
                    filters.push(KonvaLib.Filters.Blur);
                }

                node = new KonvaLib.Image({
                    id,
                    image: img,
                    x: baseX,
                    y: baseY,
                    scaleX: scale,
                    scaleY: scale,
                    opacity,
                    filters,
                    blurRadius: p.blur || 0,
                    listening: false
                });

                if (p.blur) {
                    try {
                        node.cache({ pixelRatio: 1 });
                    } catch {
                        // ignore cache error in headless/mock
                    }
                }

                // Foreground planes (depth > 1.0) go to foreGroup in front of actors;
                // background planes (depth <= 1.0) go to bgGroup behind actors.
                if (depth > 1.0 && foreGroup?.add) {
                    foreGroup.add(node);
                } else if (bgGroup?.add) {
                    bgGroup.add(node);
                }
            } else {
                // Mock / fallback node for tests
                node = {
                    id,
                    x: (v) => (v !== undefined ? (baseX = v) : baseX),
                    y: (v) => (v !== undefined ? (baseY = v) : baseY),
                    destroy: () => {}
                };
            }

            activePlanes.push({
                id,
                node,
                depth,
                baseX,
                baseY,
                image: img,
                opacity
            });
        }

        this._parallaxPlanes = activePlanes;

        // Sync with camera controller
        if (this.camera) {
            this.camera.setPlanes(this._parallaxPlanes);
            if (mergedOptions.mouseTilt !== false) {
                this.camera.initParallaxTracking(this.ui?.game?.container);
            }
        }

        return this._parallaxPlanes;
    }

    /**
     * Clear all multi-plane parallax layers and restore single background.
     */
    clearParallaxBackground() {
        if (this._currentStage) {
            this._currentStage.destroy();
            this._currentStage = null;
        }

        if (this._parallaxPlanes && this._parallaxPlanes.length > 0) {
            for (const p of this._parallaxPlanes) {
                if (p.node && typeof p.node.destroy === "function") {
                    p.node.destroy();
                }
            }
            this._parallaxPlanes = [];
        }

        const defaultBg = this.ui?.game?.bg;
        if (defaultBg && typeof defaultBg.visible === "function") {
            defaultBg.visible(true);
        }

        if (this.camera) {
            this.camera.setPlanes([]);
        }
    }

    /**
     * Load and mount a .vnstage production parallax background stage bundle.
     * @param {string | Object | ArrayBuffer} stageOrUrl
     * @param {Object} [options]
     * @param {number} [options.duration=0.4]
     * @returns {Promise<any>}
     */
    async loadStage(stageOrUrl, options = {}) {
        const requestId = ++this._backgroundRequestId;
        const duration = options.duration !== undefined ? Number(options.duration) : 0.4;
        const oldStage = this._currentStage;
        const oldPlanes = this._parallaxPlanes ? [...this._parallaxPlanes] : [];

        let stage = null;
        if (stageOrUrl && typeof stageOrUrl.mount === "function") {
            stage = stageOrUrl;
            if (!stage.manifest) {
                await stage.load();
            }
        } else {
            const { ParallaxStage } = await import("./assets/parallax-stage.js");
            stage = new ParallaxStage(options);
            await stage.load(stageOrUrl);
        }

        if (requestId !== this._backgroundRequestId) {
            stage?.destroy?.();
            return null;
        }

        const KonvaLib = globalThis.Konva || Konva;
        const hasExisting = Boolean(oldStage || oldPlanes.length > 0 || (this.ui?.game?.bg?.image?.() && (typeof this.ui?.game?.bg?.visible !== "function" || this.ui?.game?.bg?.visible())));

        if (duration > 0 && hasExisting && KonvaLib?.Tween && typeof stage.fadeIn === "function") {
            // Mount new stage with existing background visible during fade
            stage.mount(this, { keepDefaultBgVisible: true });
            this._currentStage = stage;
            this._parallaxPlanes = stage.activePlanes || [];

            // Fade in new stage
            stage.fadeIn(duration);

            // Fade out old stage or old planes
            if (oldStage && oldStage !== stage && typeof oldStage.fadeOut === "function") {
                oldStage.fadeOut(duration);
            }
            if (oldPlanes.length > 0) {
                for (const p of oldPlanes) {
                    if (p.node && typeof p.node.to === "function" && KonvaLib?.Tween) {
                        p.node.to({ opacity: 0, duration });
                    }
                }
            }

            // Fade out default static background if it was visible
            const defaultBg = this.ui?.game?.bg;
            if (defaultBg && (typeof defaultBg.visible !== "function" || defaultBg.visible()) && typeof defaultBg.to === "function") {
                defaultBg.to({
                    opacity: 0,
                    duration,
                    onFinish: () => {
                        if (typeof defaultBg.visible === "function") defaultBg.visible(false);
                        if (typeof defaultBg.opacity === "function") defaultBg.opacity(1);
                    }
                });
            }

            // Wait for transition duration
            await new Promise((resolve) => setTimeout(resolve, duration * 1000));

            // Clean up old stage & planes
            if (oldStage && oldStage !== stage) {
                oldStage.destroy();
            }
            for (const p of oldPlanes) {
                if (p.node && typeof p.node.destroy === "function") {
                    p.node.destroy();
                }
            }
        } else {
            // Instant swap
            this.clearParallaxBackground();
            stage.mount(this);
            this._currentStage = stage;
            this._parallaxPlanes = stage.activePlanes || [];
        }

        // Bring characters to the front of all background and foreground stage layers
        if (options.charactersInFront !== false) {
            this.bringCharactersToFront();
        }

        if (options.mouseTilt !== false && this.camera) {
            this.camera.initParallaxTracking(this.ui?.game?.container);
        }

        return stage;
    }

    /**
     * Bring character/actor layer to the front of all stage background and foreground layers.
     */
    bringCharactersToFront() {
        const gameRect = this.ui?.game?.container;
        const lighting = this.ui?.game?.lightingOverlay;
        if (gameRect && typeof gameRect.moveToTop === "function") {
            gameRect.moveToTop();
            if (lighting && typeof lighting.moveToTop === "function") {
                lighting.moveToTop();
            }
        }
    }

    /**
     * Retrieve active parallax plane records.
     * @returns {Array<Object>}
     */
    getParallaxPlanes() {
        return [...this._parallaxPlanes];
    }
}

export { Game };
export default Game;