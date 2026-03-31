import { getActiveLayer, getGameKeyboardActions } from "./runtime-state.js";

class KeyboardControls {
    constructor() {
        this.isBound = false;
        this.keydownHandler = this.handleKeydown.bind(this);
    }

    bind() {
        if (this.isBound) {
            return;
        }

        document.addEventListener("keydown", this.keydownHandler);
        this.isBound = true;
    }

    isTextInputTarget(target) {
        if (!target) {
            return false;
        }

        return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    }

    handleKeydown(event) {
        // Skip synthetic events to prevent infinite recursion
        if (event._synthetic) {
            return;
        }

        if (this.isTextInputTarget(event.target)) {
            return;
        }

        const isGameLayer = getActiveLayer() === "game";

        if ((event.key === "Enter" || event.key === " ") && isGameLayer) {
            event.preventDefault();
            const syntheticEvent = new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            // Mark as synthetic to prevent re-handling
            Object.defineProperty(syntheticEvent, "_synthetic", { value: true, enumerable: false });
            document.body.dispatchEvent(syntheticEvent);
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            const alertWin = document.getElementById("alert-win");
            const isAlertVisible = alertWin && !alertWin.classList.contains("hidden");

            if (isAlertVisible) {
                alertWin.classList.replace("flex", "hidden");
                return;
            }

            const actions = getGameKeyboardActions();
            actions?.toggleMenu?.();
            return;
        }

        if (event.key.toLowerCase() === "h") {
            event.preventDefault();
            const actions = getGameKeyboardActions();
            actions?.showHistory?.();
            return;
        }

        if (event.ctrlKey && event.key.toLowerCase() === "s") {
            event.preventDefault();
            const actions = getGameKeyboardActions();
            actions?.quickSave?.();
            return;
        }

        if (event.ctrlKey && event.key.toLowerCase() === "l") {
            event.preventDefault();
            const actions = getGameKeyboardActions();
            actions?.quickLoad?.();
            return;
        }

        if (event.ctrlKey && event.key.toLowerCase() === "f") {
            event.preventDefault();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }
    }
}

const keyboardControls = new KeyboardControls();

// Export as ES module
export { keyboardControls, KeyboardControls };
export default keyboardControls;