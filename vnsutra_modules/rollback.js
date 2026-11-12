/**
 * Instant Mouse-Wheel Rollback & Roll-Forward Manager.
 * Stores lightweight step snapshots so players can rewind dialogue, variables,
 * actor moods/positions, and camera state line-by-line.
 */
class RollbackManager {
    /**
     * @param {{ maxEntries?: number, throttleMs?: number }} [options]
     */
    constructor({ maxEntries = 100, throttleMs = 120 } = {}) {
        this.maxEntries = Math.max(2, Number(maxEntries) || 100);
        this.throttleMs = Math.max(0, Number(throttleMs) || 120);
        this.history = [];
        this.cursor = -1;
        this._lastEventTs = 0;
        this._detachFns = [];
    }

    /**
     * Record a snapshot at the current cursor, truncating any abandoned roll-forward branch.
     * @param {{ sceneName?: string, actionIndex?: number, vars?: Record<string, any>, actors?: Record<string, any>, camera?: any }} snapshot
     */
    capture(snapshot) {
        if (!snapshot || typeof snapshot !== "object") {
            return;
        }
        const clone = typeof globalThis.structuredClone === "function"
            ? globalThis.structuredClone(snapshot)
            : JSON.parse(JSON.stringify(snapshot));

        if (this.cursor < this.history.length - 1) {
            this.history.splice(this.cursor + 1);
        }
        this.history.push(clone);
        if (this.history.length > this.maxEntries) {
            this.history.shift();
        }
        this.cursor = this.history.length - 1;
    }

    canRollback() {
        return this.cursor > 0;
    }

    canRollForward() {
        return this.cursor >= 0 && this.cursor < this.history.length - 1;
    }

    /**
     * Step one entry backward in history and return that snapshot (or `null`).
     */
    stepBack() {
        if (!this.canRollback()) {
            return null;
        }
        this.cursor -= 1;
        return this.history[this.cursor];
    }

    /**
     * Step one entry forward in visited history and return that snapshot (or `null`).
     */
    stepForward() {
        if (!this.canRollForward()) {
            return null;
        }
        this.cursor += 1;
        return this.history[this.cursor];
    }

    /**
     * Restore variables, actor moods/positions, and camera framing from a snapshot.
     * @param {any} snapshot
     * @param {{ vars?: Record<string, any>, actors?: Record<string, any>, camera?: any }} targets
     */
    async applySnapshot(snapshot, { vars = null, actors = null, camera = null } = {}) {
        if (!snapshot) {
            return;
        }

        if (vars && snapshot.vars && typeof snapshot.vars === "object") {
            for (const key of Object.keys(vars)) {
                if (!(key in snapshot.vars)) {
                    delete vars[key];
                }
            }
            Object.assign(vars, snapshot.vars);
        }

        if (actors && snapshot.actors && typeof snapshot.actors === "object") {
            for (const [id, saved] of Object.entries(snapshot.actors)) {
                const actor = actors[id];
                if (!actor || !saved) continue;
                if (typeof saved.x === "number") actor.x = saved.x;
                if (typeof saved.y === "number") actor.y = saved.y;
                if (typeof saved.visible === "boolean") {
                    if (saved.visible) actor.show?.();
                    else actor.hide?.();
                }
                if (saved.outfit && actor.outfits?.[saved.outfit] && actor.outfit !== actor.outfits[saved.outfit]) {
                    actor.outfit = actor.outfits[saved.outfit];
                }
                if (saved.mood && actor.mood !== saved.mood) {
                    if (typeof actor.to === "function") {
                        await actor.to({ mood: saved.mood, duration: 0.22 });
                    } else {
                        actor.mood = saved.mood;
                    }
                }
            }
        }

        if (camera && snapshot.camera && typeof camera.pan === "function") {
            await camera.pan({ ...snapshot.camera, duration: 0.25 });
        }
    }

    /**
     * Attach mouse-wheel (scroll up = back, down = forward) and PageUp/PageDown listeners.
     * @param {EventTarget} [target=globalThis]
     * @param {{ onBack?: () => void, onForward?: () => void }} [handlers]
     */
    attachInputListeners(target = globalThis, { onBack = null, onForward = null } = {}) {
        this.detach();
        if (!target || typeof target.addEventListener !== "function") {
            return;
        }

        const trigger = (fn) => {
            const now = Date.now();
            if (now - this._lastEventTs < this.throttleMs) {
                return;
            }
            this._lastEventTs = now;
            fn?.();
        };

        const onWheel = (e) => {
            if (e.deltaY < 0) {
                trigger(onBack);
            } else if (e.deltaY > 0) {
                trigger(onForward);
            }
        };

        const onKeyDown = (e) => {
            if (e.key === "PageUp") {
                trigger(onBack);
            } else if (e.key === "PageDown") {
                trigger(onForward);
            }
        };

        target.addEventListener("wheel", onWheel, { passive: true });
        target.addEventListener("keydown", onKeyDown);
        this._detachFns.push(
            () => target.removeEventListener("wheel", onWheel),
            () => target.removeEventListener("keydown", onKeyDown)
        );
    }

    detach() {
        for (const fn of this._detachFns) {
            fn();
        }
        this._detachFns.length = 0;
    }

    clear() {
        this.history.length = 0;
        this.cursor = -1;
    }
}

export { RollbackManager };
export default RollbackManager;

