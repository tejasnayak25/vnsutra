import { EVENTS } from "./constants.js";
import { getGameSettings, getGame } from "./runtime-state.js";

const DEFAULT_SPOTLIGHT_CONFIG = {
    enabled: true,
    dimColor: "#1e293b",
    dimStrength: 0.32,
    scaleBoost: 1.0,
    duration: 0.25,
    autoFocus: false,
    focusZoom: 1.15,
    clearOnDialogEnd: false
};

/**
 * Configurable Persona-style Speaker Spotlight controller.
 * Highlights the active speaker and subtly dims inactive actors.
 */
class SpeakerSpotlight {
    /**
     * @param {any} gameInstance
     * @param {Partial<typeof DEFAULT_SPOTLIGHT_CONFIG>} [options]
     */
    constructor(gameInstance, options = {}) {
        this.game = gameInstance;
        this.config = { ...DEFAULT_SPOTLIGHT_CONFIG, ...(options || {}) };
        this._baseScales = new WeakMap();
        this._activeSpeaker = null;
        this._boundDialog = null;
        this._boundEnd = null;
    }

    configure(options = {}) {
        Object.assign(this.config, options || {});
        if (!this.config.enabled) {
            this.clear();
        }
        return this.config;
    }

    setEnabled(enabled) {
        return this.configure({ enabled: Boolean(enabled) });
    }

    _getActors() {
        const game = this.game || getGame?.();
        return Object.values(game?.actors || {}).filter(Boolean);
    }

    _applyActorState(actor, isSpeaker, hasSpeaker) {
        if (!actor) return;
        const reduceMotion = Boolean(getGameSettings?.()?.["accessibility-reduce-motion"]);
        const dur = reduceMotion ? 0 : (Number(this.config.duration) || 0);

        if (typeof actor.setTint === "function") {
            if (hasSpeaker && !isSpeaker && this.config.dimStrength > 0) {
                if (dur > 0) {
                    actor.setTint(this.config.dimColor, this.config.dimStrength, dur);
                } else {
                    actor.setTint(this.config.dimColor, this.config.dimStrength);
                }
            } else {
                if (dur > 0) {
                    actor.clearTint?.(dur);
                } else {
                    actor.clearTint?.();
                }
            }
        } else if (actor.img?.opacity) {
            const baseOpacity = typeof actor.data?.opacity === "number" ? actor.data.opacity : 1;
            const targetOpacity = (hasSpeaker && !isSpeaker) ? Math.max(0.35, baseOpacity * (1 - this.config.dimStrength)) : baseOpacity;
            if (dur > 0 && typeof actor.img.to === "function" && actor.img?.getParent?.()) {
                actor.img.to({
                    opacity: targetOpacity,
                    duration: dur,
                    onFinish: () => {
                        actor.img.getLayer?.()?.batchDraw?.();
                    }
                });
            } else {
                actor.img.opacity(targetOpacity);
                actor.img.getLayer?.()?.batchDraw?.();
            }
        }

        if (actor.img && typeof actor.scale === "number") {
            const boostVal = Number(this.config.scaleBoost) || 1.0;
            if (boostVal !== 1.0 || this._baseScales.has(actor)) {
                if (!this._baseScales.has(actor)) {
                    this._baseScales.set(actor, actor.scale);
                }
                const baseScale = this._baseScales.get(actor) ?? actor.scale;
                const boost = (hasSpeaker && isSpeaker && !reduceMotion) ? boostVal : 1;
                const targetScale = baseScale * boost;
                if (Math.abs(actor.scale - targetScale) > 0.001) {
                    if (typeof actor.to === "function" && !reduceMotion && dur > 0) {
                        actor.to({ scale: targetScale, duration: dur }).catch?.(() => {});
                    } else {
                        actor.scale = targetScale;
                    }
                }
            }
        }
    }

    onSpeak(speakerName) {
        if (!this.config.enabled) {
            return;
        }
        const target = typeof speakerName === "string" ? speakerName.trim().toLowerCase() : "";
        const hasSpeaker = Boolean(target);

        // If the same speaker is already active, maintain spotlight state without re-triggering transitions
        if (hasSpeaker && this._activeSpeaker === target) {
            return;
        }

        const actors = this._getActors();
        this._activeSpeaker = target || null;

        let matchedActor = null;
        for (const actor of actors) {
            const actorName = String(actor?.data?.name || "").trim().toLowerCase();
            const isSpeaker = hasSpeaker && actorName === target;
            if (isSpeaker) matchedActor = actor;
            this._applyActorState(actor, isSpeaker, hasSpeaker);
        }

        if (this.config.autoFocus && matchedActor && this.game?.camera?.focus) {
            this.game.camera.focus(matchedActor, {
                zoom: this.config.focusZoom,
                duration: Math.max(0.2, this.config.duration)
            }).catch?.(() => {});
        }
    }

    clear({ duration = null } = {}) {
        this._activeSpeaker = null;
        const reduceMotion = Boolean(getGameSettings?.()?.["accessibility-reduce-motion"]);
        const dur = reduceMotion ? 0 : (duration !== null ? Number(duration) || 0 : (Number(this.config.duration) || 0));

        for (const actor of this._getActors()) {
            if (typeof actor.clearTint === "function") {
                if (dur > 0) {
                    actor.clearTint(dur);
                } else {
                    actor.clearTint();
                }
            } else if (actor?.img?.opacity) {
                const baseOpacity = typeof actor.data?.opacity === "number" ? actor.data.opacity : 1;
                if (dur > 0 && typeof actor.img.to === "function" && actor.img?.getParent?.()) {
                    actor.img.to({
                        opacity: baseOpacity,
                        duration: dur,
                        onFinish: () => {
                            actor.img.getLayer?.()?.batchDraw?.();
                        }
                    });
                } else {
                    actor.img.opacity(baseOpacity);
                    actor.img.getLayer?.()?.batchDraw?.();
                }
            }
            if (this._baseScales.has(actor)) {
                actor.scale = this._baseScales.get(actor);
                this._baseScales.delete(actor);
            }
        }
    }

    attach() {
        this.detach();
        if (!this.game) {
            this.game = getGame?.();
        }
        if (typeof globalThis.addEventListener !== "function") return;
        this._boundDialog = (ev) => {
            if (!this.config.enabled) return;
            this.onSpeak(ev?.detail?.speaker || null);
        };
        this._boundEnd = () => {
            if (!this.config.enabled || !this.config.clearOnDialogEnd) return;
            this.clear();
        };
        globalThis.addEventListener(EVENTS.DIALOG, this._boundDialog);
        globalThis.addEventListener(EVENTS.DIALOG_END, this._boundEnd);
    }

    detach() {
        if (typeof globalThis.removeEventListener === "function") {
            if (this._boundDialog) globalThis.removeEventListener(EVENTS.DIALOG, this._boundDialog);
            if (this._boundEnd) globalThis.removeEventListener(EVENTS.DIALOG_END, this._boundEnd);
        }
        this._boundDialog = null;
        this._boundEnd = null;
    }

    dispose() {
        this.detach();
        this.clear({ duration: 0 });
    }
}

export { SpeakerSpotlight, DEFAULT_SPOTLIGHT_CONFIG };
export default SpeakerSpotlight;
