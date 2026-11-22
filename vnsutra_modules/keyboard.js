import { getActiveLayer, getGameKeyboardActions } from "./runtime-state.js";

function isTextInputTarget(target) {
    if (!target) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    const tag = target.tagName ? target.tagName.toUpperCase() : "";
    if (tag === "TEXTAREA") {
        return true;
    }

    if (tag === "INPUT") {
        const textTypes = ["text", "password", "email", "number", "search", "tel", "url"];
        const inputType = (target.type || "text").toLowerCase();
        return textTypes.includes(inputType);
    }

    return false;
}

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
        return isTextInputTarget(target);
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
            if (event.target && typeof event.target.blur === "function" && event.target !== document.body) {
                event.target.blur();
            }
            const KeyboardEventCtor = typeof KeyboardEvent !== "undefined"
                ? KeyboardEvent
                : (globalThis.KeyboardEvent || class {
                    constructor(type, init = {}) {
                        this.type = type;
                        Object.assign(this, init);
                    }
                });
            const syntheticEvent = new KeyboardEventCtor("keydown", {
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
            if (typeof window !== "undefined" && window.dispatchEvent && window !== document.body) {
                window.dispatchEvent(syntheticEvent);
            }
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            const alertWin = document.getElementById("alert-win");
            const isAlertVisible = alertWin && !alertWin.classList.contains("hidden");

            if (isAlertVisible) {
                const buttons = Array.from(alertWin.querySelectorAll("#alert-btns button") || []);
                const cancelBtn = buttons.find((btn) => {
                    const txt = (btn.innerText || btn.textContent || "").trim().toLowerCase();
                    return txt === "cancel" || txt === "close" || txt === "no";
                });
                if (cancelBtn) {
                    cancelBtn.click();
                } else if (buttons[0]) {
                    buttons[0].click();
                } else {
                    alertWin.classList.replace("flex", "hidden");
                }
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
export { keyboardControls, KeyboardControls, isTextInputTarget };
export default keyboardControls;