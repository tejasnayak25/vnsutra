import { getInstructionCount, getState, getGameSettings } from "../runtime-state.js";

class Sfx {
    /**
     * @param {string} src
     */
    constructor(src) {
        this.src = src;
        fetch(src)
            .then((res) => res.blob())
            .then((res) => {
                this.src = URL.createObjectURL(res);
            });
        this.elem = document.getElementById("sfx");
    }

    play() {
        const gameSettings = getGameSettings();
        const state = getState();
        const currentInstructionCount = getInstructionCount();
        const id = currentInstructionCount + 1;
        if ((state.instruction_count ?? 0) > id) return;

        if (gameSettings["settings-sfx"] === true) {
            this.elem.src = this.src;
            this.elem.play();
        }
    }

    pause() {
        this.elem.pause();
    }
}

export { Sfx };
