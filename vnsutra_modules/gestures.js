import { EVENTS } from "./constants.js";

/**
 * Touch gesture controller for swipe detection and dispatch.
 */
class Gestures {
    /**
     * @param {{ minDistance?: number, maxOffAxis?: number }} [options={}]
     */
    constructor(options = {}) {
        this.minDistance = options.minDistance ?? 45;
        this.maxOffAxis = options.maxOffAxis ?? 80;
        this.handlers = {
            left: [],
            right: [],
            up: [],
            down: []
        };

        this.startX = 0;
        this.startY = 0;
        this.startTime = 0;
        this.target = null;

        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
    }

    /**
     * Register a handler for a direction.
     * @param {"left"|"right"|"up"|"down"} direction
     * @param {(detail: {dx:number,dy:number,duration:number}) => void} handler
     * @returns {void}
     */
    on(direction, handler) {
        if (!this.handlers[direction] || typeof handler !== "function") {
            return;
        }

        this.handlers[direction].push(handler);
    }

    /**
     * Remove a previously registered handler.
     * @param {"left"|"right"|"up"|"down"} direction
     * @param {(detail: {dx:number,dy:number,duration:number}) => void} handler
     * @returns {void}
     */
    off(direction, handler) {
        if (!this.handlers[direction]) {
            return;
        }

        this.handlers[direction] = this.handlers[direction].filter((fn) => fn !== handler);
    }

    /**
     * Remove all handlers for all directions.
     * @returns {void}
     */
    clearHandlers() {
        Object.keys(this.handlers).forEach((direction) => {
            this.handlers[direction] = [];
        });
    }

    /**
     * Emit a gesture event and notify direction handlers.
     * @param {"left"|"right"|"up"|"down"} direction
     * @param {{dx:number,dy:number,duration:number}} detail
     * @returns {void}
     */
    emit(direction, detail) {
        const handlers = this.handlers[direction] ?? [];
        handlers.forEach((handler) => {
            try {
                handler(detail);
            } catch (error) {
                console.warn("[Gestures] handler failed:", error);
            }
        });

        globalThis.dispatchEvent(new CustomEvent(EVENTS.GESTURE, {
            detail: { direction, ...detail }
        }));
    }

    /**
     * Attach gesture listeners to a target element.
     * @param {HTMLElement | null} target
     * @returns {void}
     */
    attach(target) {
        if (!target || this.target === target) {
            return;
        }

        this.detach();
        this.target = target;
        this.target.addEventListener("touchstart", this.onTouchStart, { passive: true });
        this.target.addEventListener("touchend", this.onTouchEnd, { passive: true });
    }

    /**
     * Detach gesture listeners from the active target.
     * @returns {void}
     */
    detach() {
        if (!this.target) {
            return;
        }

        this.target.removeEventListener("touchstart", this.onTouchStart);
        this.target.removeEventListener("touchend", this.onTouchEnd);
        this.target = null;
    }

    /**
     * Internal touchstart handler.
     * @param {TouchEvent} event
     * @returns {void}
     */
    onTouchStart(event) {
        const touch = event.changedTouches?.[0];
        if (!touch) {
            return;
        }

        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.startTime = Date.now();
    }

    /**
     * Internal touchend handler.
     * @param {TouchEvent} event
     * @returns {void}
     */
    onTouchEnd(event) {
        const touch = event.changedTouches?.[0];
        if (!touch) {
            return;
        }

        const dx = touch.clientX - this.startX;
        const dy = touch.clientY - this.startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (Math.max(absX, absY) < this.minDistance) {
            return;
        }

        const detail = {
            dx,
            dy,
            duration: Date.now() - this.startTime
        };

        if (absX > absY) {
            if (absY > this.maxOffAxis) {
                return;
            }
            this.emit(dx < 0 ? "left" : "right", detail);
            return;
        }

        if (absX > this.maxOffAxis) {
            return;
        }
        this.emit(dy < 0 ? "up" : "down", detail);
    }
}

const gestures = new Gestures();

export { Gestures, gestures };
export default gestures;
