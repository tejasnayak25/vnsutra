import errorTracking from "./error-tracking.js";

class DynamicSprites {
    constructor(character) {
        this.character = character;
        this.states = {};
        this.activeState = null;
    }

    define(state, { outfit = null, mood = null } = {}) {
        if (!state) {
            return;
        }

        this.states[state] = { outfit, mood };
    }

    defineMany(definitions = {}) {
        Object.keys(definitions).forEach((state) => {
            this.define(state, definitions[state]);
        });
    }

    async preloadOutfits() {
        const outfitNames = new Set(
            Object.values(this.states)
                .map((state) => state.outfit)
                .filter(Boolean)
        );

        const jobs = [...outfitNames].map(async (outfitName) => {
            if (this.character.outfits[outfitName]) {
                return;
            }
            await this.character.loadOutfit(outfitName);
        });

        await Promise.all(jobs);
    }

    async apply(state, { duration = 0.35 } = {}) {
        const selected = this.states[state];
        if (!selected) {
            errorTracking?.captureError(`Sprite state not defined: ${state}`, {
                type: "warning",
                message: "[DynamicSprites] Sprite state not defined",
                context: { scope: "assets", component: "dynamic-sprites", state }
            });
            throw new Error(`Sprite state not defined: ${state}`);
        }

        if (selected.outfit) {
            if (!this.character.outfits[selected.outfit]) {
                await this.character.loadOutfit(selected.outfit);
            }
            this.character.outfit = this.character.outfits[selected.outfit];
        }

        if (selected.mood) {
            await this.character.to({ mood: selected.mood, duration });
        }

        this.activeState = state;
        return selected;
    }

    getCurrentState() {
        return this.activeState;
    }
}

export { DynamicSprites };
export default DynamicSprites;
