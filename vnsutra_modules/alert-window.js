class AlertWindow {
    constructor(message, btns, config, type="message", { input, opts } = { input: null, opts: null}) {
        this.win = document.getElementById("alert-win");
        this.card = this.win.querySelector("#alert-card");
        this._message = this.win.querySelector("#alert-message");
        this.input_holder = this.win.querySelector("#alert-input");
        this.choice_holder = this.win.querySelector("#alert-opts");
        this.btns = this.win.querySelector("#alert-btns");
        
        this.color = config.colors.primary;
        this.cardColor = config.colors.menu;
        this.textColor = config.colors.text;

        this.data = {
            message, btns, type, input, opts
        }
    }

    /**
     * @param {string} value 
     */
    set color(value) {
        this.card.style.borderColor = value;
    }

    get color() {
        return this.card.style.borderColor;
    }

    /**
     * @param {string} value 
     */
    set textColor(value) {
        this._message.style.color = value;
    }

    get textColor() {
        return this._message.style.color;
    }

    /**
         * @param {string} value 
         */
    set cardColor(value) {
        this.card.style.backgroundColor = value;
    }

    get cardColor() {
        return this.card.style.backgroundColor;
    }    

    /**
     * @param {string} text 
     */
    set message(text) {
        this._message.innerText = text; 
        this.data.message = text;
    }

    show() {
        this._message.innerText = this.data.message;
        this.btns.innerHTML = "";
        this.btns.append(...this.data.btns);

        if(this.data.type === "input") {
            this.input_holder.classList.replace("hidden", "flex");
            this.input_holder.innerHTML = "";
            this.input_holder.append(this.data.input);
        } else {
            this.input_holder.classList.replace("flex", "hidden");
        }

        if(this.data.type === "choice") {
            this.choice_holder.classList.remove("hidden");
            this.choice_holder.innerHTML = "";
            this.choice_holder.append(this.data.opts);
        } else {
            this.choice_holder.classList.add("hidden");
        }

        this.win.classList.replace("hidden", "flex");
    }

    close() {
        this.win.classList.replace("flex", "hidden");
    }
}