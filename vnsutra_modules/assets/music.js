import { getInstructionCount, getState, getGameSettings } from "../runtime-state.js";

class Music {
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
        this.elem = document.getElementById("music");
    }

    play() {
        const gameSettings = getGameSettings();
        const state = getState();
        const currentInstructionCount = getInstructionCount();
        const id = currentInstructionCount + 1;
        if ((state.instruction_count ?? 0) > id) return;

        if (gameSettings["settings-music"] === true) {
            this.elem.src = this.src;
            this.elem.play();
        }
    }

    pause() {
        this.elem.pause();
    }
}

export { Music };
