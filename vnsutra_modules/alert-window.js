class AlertWindow {
    constructor(message, btns, config, type="message", { input, opts } = { input: null, opts: null}) {
        this.win = document.getElementById("alert-win");
        if (!this.win) {
            this.data = { message, btns: btns ?? [], type, input, opts };
            return;
        }

        this.card = this.win.querySelector("#alert-card");
        this._message = this.win.querySelector("#alert-message, #alert-message-text");
        this.input_holder = this.win.querySelector("#alert-input");
        this.choice_holder = this.win.querySelector("#alert-opts");
        this.btns = this.win.querySelector("#alert-btns");
        
        this.color = config.colors.primary;
        this.cardColor = `${config.colors.menu}cc`;
        this.textColor = config.colors.text;

        this.data = {
            message, btns, type, input, opts
        };

        this.win.setAttribute("role", "dialog");
        this.win.setAttribute("aria-modal", "true");
        this.win.setAttribute("aria-live", "polite");
        this.win.setAttribute("aria-hidden", "true");
        this.win.setAttribute("aria-label", "Game dialog");

        this.card.setAttribute("role", "document");
        this.card.setAttribute("tabindex", "-1");

        if (this._message && !this._message.id) {
            this._message.setAttribute("id", "alert-message");
        }
        this.win.setAttribute("aria-labelledby", this._message?.id ?? "alert-message");
    }

    /**
     * @param {string} value 
     */
    set color(value) {
        if (this.card) {
            this.card.style.borderColor = value;
        }
    }

    get color() {
        return this.card.style.borderColor;
    }

    /**
     * @param {string} value 
     */
    set textColor(value) {
        if (this._message) {
            this._message.style.color = value;
        }
    }

    get textColor() {
        return this._message.style.color;
    }

    /**
         * @param {string} value 
         */
    set cardColor(value) {
        if (this.card) {
            this.card.style.backgroundColor = value;
        }
    }

    get cardColor() {
        return this.card.style.backgroundColor;
    }    

    /**
     * @param {string} text 
     */
    set message(text) {
        if (this._message) {
            this._message.innerText = text;
        }
        this.data.message = text;
    }

    show() {
        if (!this.win) {
            return;
        }

        if (this._message) {
            this._message.innerText = this.data.message;
        }
        this.btns.innerHTML = "";
        this.btns.append(...(this.data.btns ?? []));

        if (this.card) {
            this.card.style.maxHeight = "";
            this.card.style.overflow = "";
        }

        if (this.choice_holder) {
            this.choice_holder.style.maxHeight = "";
            this.choice_holder.style.overflowY = "";
            this.choice_holder.style.overflowX = "";
            this.choice_holder.style.minHeight = "";
            this.choice_holder.style.flex = "";
            this.choice_holder.style.paddingRight = "";
            this.choice_holder.style.webkitOverflowScrolling = "";
            this.choice_holder.style.overscrollBehavior = "";
        }

        if(this.data.type === "input") {
            this.input_holder.classList.replace("hidden", "flex");
            this.input_holder.innerHTML = "";
            if (this.data.input) {
                this.data.input.setAttribute("aria-label", this.data.message);
                this.input_holder.append(this.data.input);
            }
        } else {
            this.input_holder.classList.replace("flex", "hidden");
        }

        if(this.data.type === "choice") {
            this.choice_holder.classList.remove("hidden");
            if (this.card) {
                this.card.style.maxHeight = "calc(100vh - 1.5rem)";
                this.card.style.overflow = "hidden";
            }
            this.choice_holder.style.display = "block";
            this.choice_holder.style.flex = "1 1 auto";
            this.choice_holder.style.minHeight = "0";
            this.choice_holder.style.maxHeight = "48vh";
            this.choice_holder.style.overflowY = "auto";
            this.choice_holder.style.overflowX = "hidden";
            this.choice_holder.style.paddingRight = "0.25rem";
            this.choice_holder.style.webkitOverflowScrolling = "touch";
            this.choice_holder.style.overscrollBehavior = "contain";
            this.choice_holder.innerHTML = "";
            if (this.data.opts) {
                this.choice_holder.append(this.data.opts);
            }
        } else {
            this.choice_holder.classList.add("hidden");
            this.choice_holder.style.display = "";
        }

        this.win.classList.replace("hidden", "flex");
        this.win.setAttribute("aria-hidden", "false");

        const firstBtn = this.btns.querySelector("button");
        if (firstBtn) {
            firstBtn.focus();
        } else {
            this.card.focus();
        }
    }

    close() {
        if (!this.win) {
            return;
        }
        this.win.classList.replace("flex", "hidden");
        this.win.setAttribute("aria-hidden", "true");
    }
}

export { AlertWindow };
export default AlertWindow;