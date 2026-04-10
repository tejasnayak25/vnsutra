/**
 * Animation and Tween Utilities
 * 
 * Adds animation methods to game actors and game instance:
 * - actor.to() / actor.tween() - smooth property animation
 * - actor.fade() - fade in/out
 * - actor.move() - move to position
 * - actor.shake() - shake effect
 * - gameInstance.shake() - screen shake
 * - gameInstance.flash() - flash screen
 */

/**
 * Easing functions for tweens
 */
const easingFunctions = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1,
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - (--t) * t * t * t,
    easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    easeInQuint: (t) => t * t * t * t * t,
    easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
    easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t
};

function createLayerDrawScheduler(layer) {
    let drawScheduled = false;

    return () => {
        if (!layer || typeof layer.batchDraw !== "function") {
            return;
        }

        if (drawScheduled) {
            return;
        }

        drawScheduled = true;
        requestAnimationFrame(() => {
            drawScheduled = false;
            layer.batchDraw();
        });
    };
}

/**
 * Create a promise-based tween using requestAnimationFrame
 * @param {number} duration - Duration in milliseconds
 * @param {Function} onUpdate - Callback with progress (0-1)
 * @param {string} easing - Easing function name
 * @returns {Promise<void>}
 */
function createTween(duration, onUpdate, easing = "linear") {
    return new Promise((resolve) => {
        const easeFn = easingFunctions[easing] || easingFunctions.linear;
        const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

        function animate() {
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeFn(progress);

            onUpdate(easedProgress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(animate);
    });
}

/**
 * Add animation methods to a Konva shape/group
 * @param {Konva.Shape|Konva.Group} shape - The Konva object to animate
 */
function addKonvaAnimationMethods(shape) {
    if (!shape || shape._animationMethodsAdded) {
        return shape;
    }

    const nativeTo = typeof shape.to === "function" ? shape.to.bind(shape) : null;

    /**
     * Animate properties using Konva's built-in animation
     */
    shape.to = function(props = {}, options = {}) {
        const duration = options.duration ?? 1000;
        const konvaDuration = duration / 1000; // Konva uses seconds
        const easing = options.easing;

        return new Promise((resolve) => {
            const config = { ...props, duration: konvaDuration };
            if (easing !== undefined) {
                config.easing = easing;
            }
            if (nativeTo) {
                // Use Konva's native to() if available
                config.onFinish = () => {
                    resolve();
                };
                nativeTo(config);
            } else {
                // Fallback to custom tween
                const startValues = {};
                const endValues = props;

                for (const key of Object.keys(props)) {
                    startValues[key] = shape[key]();
                }

                createTween(duration, (progress) => {
                    for (const [key, endValue] of Object.entries(endValues)) {
                        const startValue = startValues[key];
                        const current = startValue + (endValue - startValue) * progress;
                        shape[key](current);
                    }
                }, easing).then(resolve);
            }
        });
    };

    /**
     * Fade in or out
     */
    shape.fade = function(direction = "in", duration = 500) {
        const startOpacity = direction === "in" ? 0 : 1;
        const endOpacity = direction === "in" ? 1 : 0;
        const scheduleDraw = createLayerDrawScheduler(shape.getLayer?.());

        shape.opacity(startOpacity);
        scheduleDraw();

        return new Promise((resolve) => {
            createTween(duration, (progress) => {
                const opacity = startOpacity + (endOpacity - startOpacity) * progress;
                shape.opacity(opacity);
                scheduleDraw();
            }).then(() => {
                shape.opacity(endOpacity);
                scheduleDraw();
                resolve();
            });
        });
    };

    /**
     * Move to a position
     */
    shape.moveTo = function(x, y, duration = 1000) {
        const startX = shape.x?.() ?? shape.x;
        const startY = shape.y?.() ?? shape.y;
        const scheduleDraw = createLayerDrawScheduler(shape.getLayer?.());

        return new Promise((resolve) => {
            createTween(duration, (progress) => {
                const currentX = startX + (x - startX) * progress;
                const currentY = startY + (y - startY) * progress;
                if (typeof shape.x === "function") {
                    shape.x(currentX);
                    shape.y(currentY);
                } else {
                    shape.x = currentX;
                    shape.y = currentY;
                }
                scheduleDraw();
            }).then(() => {
                if (typeof shape.x === "function") {
                    shape.x(x);
                    shape.y(y);
                } else {
                    shape.x = x;
                    shape.y = y;
                }
                scheduleDraw();
                resolve();
            });
        });
    };

    /**
     * Shake effect
     */
    shape.shake = function(intensity = 5, duration = 300) {
        const originalX = shape.x?.() ?? shape.x;
        const originalY = shape.y?.() ?? shape.y;
        const scheduleDraw = createLayerDrawScheduler(shape.getLayer?.());

        return new Promise((resolve) => {
            createTween(duration, (progress) => {
                const damping = 1 - progress;
                const offsetX = Math.sin(progress * 24 * Math.PI) * intensity * damping;
                const offsetY = Math.cos(progress * 20 * Math.PI) * intensity * 0.8 * damping;

                if (typeof shape.x === "function") {
                    shape.x(originalX + offsetX);
                    shape.y(originalY + offsetY);
                } else {
                    shape.x = originalX + offsetX;
                    shape.y = originalY + offsetY;
                }
                scheduleDraw();
            }, "linear").then(() => {
                if (typeof shape.x === "function") {
                    shape.x(originalX);
                    shape.y(originalY);
                } else {
                    shape.x = originalX;
                    shape.y = originalY;
                }
                scheduleDraw();
                resolve();
            });
        });
    };

    shape._animationMethodsAdded = true;
    return shape;
}

/**
 * Add animation methods to game instance
 * @param {Object} gameInstance - The game instance
 */
function addGameAnimationMethods(gameInstance) {
    if (!gameInstance || gameInstance._animationMethodsAdded) {
        return gameInstance;
    }

    /**
     * Screen shake effect
     */
    gameInstance.shake = function(intensity = 5, duration = 300) {
        const container = gameInstance.ui?.game?.container;
        if (!container || typeof container.x !== "function" || typeof container.y !== "function") {
            return Promise.resolve();
        }

        const originalX = container.x();
        const originalY = container.y();
        const layer = container.getLayer?.();
        const scheduleDraw = createLayerDrawScheduler(layer);

        return new Promise((resolve) => {
            createTween(duration, (progress) => {
                const damping = 1 - progress;
                const offsetX = Math.sin(progress * 24 * Math.PI) * intensity * damping;
                const offsetY = Math.cos(progress * 20 * Math.PI) * intensity * 0.8 * damping;
                container.x(originalX + offsetX);
                container.y(originalY + offsetY);
                scheduleDraw();
            }, "linear").then(() => {
                container.x(originalX);
                container.y(originalY);
                scheduleDraw();
                resolve();
            });
        });
    };

    /**
     * Flash screen effect
     */
    gameInstance.flash = function(color = "#ffffff", duration = 300) {
        if (!gameInstance.ui?.game?.flashOverlay) {
            return Promise.resolve();
        }

        const overlay = gameInstance.ui.game.flashOverlay;
        const viewport = gameInstance.ui?.game?.viewport;
        const container = gameInstance.ui?.game?.container;
        const layer = overlay.getLayer?.();

        const sizeSource = viewport || container;
        if (sizeSource && typeof overlay.width === "function" && typeof overlay.height === "function") {
            overlay.width(sizeSource.width());
            overlay.height(sizeSource.height());
        }

        overlay.fill(color);
        overlay.opacity(1);
        const scheduleDraw = createLayerDrawScheduler(layer);
        scheduleDraw();

        return new Promise((resolve) => {
            createTween(duration, (progress) => {
                overlay.opacity(Math.max(0, 1 - progress));
                scheduleDraw();
            }).then(() => {
                overlay.opacity(0);
                scheduleDraw();
                resolve();
            });
        });
    };

    /**
     * Particle effect (stub - requires particle system)
     */
    gameInstance.particles = function(x, y, type, options) {
        if (typeof gameInstance._particleSystem?.emit !== "function") {
            return Promise.resolve();
        }

        return gameInstance._particleSystem.emit({ x, y, type, ...options });
    };

    gameInstance._animationMethodsAdded = true;
    return gameInstance;
}

/**
 * Initialize animation extensions for an actor
 * @param {Object} actor - Actor object
 */
function initActorAnimation(actor) {
    if (!actor) {
        return actor;
    }

    // Add methods if actor has konvaObj (character asset)
    if (actor.konvaObj) {
        addKonvaAnimationMethods(actor.konvaObj);
    }

    // Add convenience wrapper methods on actor itself
    if (!actor._animationsInitialized) {
        if (typeof actor.to !== "function") {
            actor.to = function(props, options) {
                if (this.konvaObj?.to) {
                    return this.konvaObj.to(props, options);
                }
                return Promise.resolve();
            };
        }

        if (typeof actor.fade !== "function") {
            actor.fade = function(direction, duration) {
                if (this.konvaObj?.fade) {
                    return this.konvaObj.fade(direction, duration);
                }
                return Promise.resolve();
            };
        }

        if (typeof actor.moveTo !== "function") {
            actor.moveTo = function(x, y, duration) {
                if (this.konvaObj?.moveTo) {
                    return this.konvaObj.moveTo(x, y, duration);
                }
                return Promise.resolve();
            };
        }

        if (typeof actor.shake !== "function") {
            actor.shake = function(intensity, duration) {
                if (this.konvaObj?.shake) {
                    return this.konvaObj.shake(intensity, duration);
                }
                return Promise.resolve();
            };
        }

        actor._animationsInitialized = true;
    }

    return actor;
}

export {
    createTween,
    easingFunctions,
    addKonvaAnimationMethods,
    addGameAnimationMethods,
    initActorAnimation
};
