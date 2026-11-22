const ICONS = {
    confirm: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9a2.25 2.25 0 114.5 0c0 1.5-1.5 2-2.25 2.5m0 3v.5" />
    </svg>`,
    danger: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 18h.01" />
    </svg>`,
    history: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>`,
    input: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>`,
    choice: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>`,
    system: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>`,
    info: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v.01M12 11.25v4.5" />
    </svg>`
};

class AlertWindow {
    static activeInstance = null;

    constructor(message, btns, config = {}, type = "message", { input, opts } = { input: null, opts: null }) {
        this.win = document.getElementById("alert-win");
        if (!this.win) {
            this.data = { message, btns: btns ?? [], type, input, opts };
            return;
        }

        this.card = this.win.querySelector("#alert-card");
        this._message = this.win.querySelector("#alert-message, #alert-message-text");
        this.messageWrap = this.win.querySelector("#alert-message-wrap");
        this.queryBox = this.win.querySelector("#alert-query-box");
        this.input_holder = this.win.querySelector("#alert-input");
        this.choice_holder = this.win.querySelector("#alert-opts");
        this.btns = this.win.querySelector("#alert-btns");
        this.accentLine = this.win.querySelector("#alert-accent-line");
        this.header = this.win.querySelector("#alert-header");
        this.iconWrap = this.win.querySelector("#alert-icon-wrap");
        this.iconElem = this.win.querySelector("#alert-icon");
        this.badgeElem = this.win.querySelector("#alert-badge");
        this.titleElem = this.win.querySelector("#alert-title");
        this.closeX = this.win.querySelector("#alert-close-x");

        this.config = config || {};
        this._customTitle = null;
        this._customBadge = null;

        const primary = this.config?.colors?.primary || "#B88AEF";
        const menu = this.config?.colors?.menu || "#17152F";
        const text = this.config?.colors?.text || "#F8F2FF";

        this.color = primary;
        this.cardColor = menu ? `${menu}f2` : "rgba(20, 17, 38, 0.95)";
        this.textColor = text;

        this.data = {
            message,
            btns,
            type,
            input,
            opts
        };

        this.win.setAttribute("role", "dialog");
        this.win.setAttribute("aria-modal", "true");
        this.win.setAttribute("aria-live", "polite");
        this.win.setAttribute("aria-hidden", "true");
        this.win.setAttribute("aria-label", "Game dialog");

        if (this.card) {
            this.card.setAttribute("role", "document");
            this.card.setAttribute("tabindex", "-1");
        }

        if (this._message && !this._message.id) {
            this._message.setAttribute("id", "alert-message");
        }
        this.win.setAttribute("aria-labelledby", this.titleElem?.id || this._message?.id || "alert-message");

        // Backdrop click dismissal
        this._handleBackdropClick = (e) => {
            if (e.target === this.win) {
                this.dismiss();
            }
        };
        this.win.removeEventListener("click", this._handleBackdropClick);
        this.win.addEventListener("click", this._handleBackdropClick);

        // Top-right X button dismissal
        if (this.closeX) {
            this.closeX.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dismiss();
            };
        }
    }

    /**
     * @param {string} value
     */
    set color(value) {
        this._color = value;
        if (this.card) {
            this.card.style.borderColor = value;
        }
        if (this.accentLine) {
            this.accentLine.style.background = `linear-gradient(90deg, transparent, ${value}, transparent)`;
        }
        if (this.iconWrap) {
            this.iconWrap.style.color = value;
            this.iconWrap.style.borderColor = `${value}40`;
            this.iconWrap.style.backgroundColor = `${value}18`;
        }
        if (this.badgeElem) {
            this.badgeElem.style.color = value;
        }
        if (this.queryBox) {
            this.queryBox.style.borderLeftColor = value;
        }
        if (this.win?.style?.setProperty) {
            this.win.style.setProperty("--alert-color", value);
            this.win.style.setProperty("--alert-glow", `${value}30`);
        }
    }

    get color() {
        return this._color || this.card?.style.borderColor || "";
    }

    /**
     * @param {string} value
     */
    set textColor(value) {
        this._textColor = value;
        if (this._message) {
            this._message.style.color = value;
        }
    }

    get textColor() {
        return this._textColor || this._message?.style.color || "";
    }

    /**
     * @param {string} value
     */
    set cardColor(value) {
        this._cardColor = value;
        if (this.card) {
            this.card.style.backgroundColor = value;
        }
    }

    get cardColor() {
        return this._cardColor || this.card?.style.backgroundColor || "";
    }

    /**
     * @param {string} text
     */
    set message(text) {
        if (this._message) {
            this._message.innerText = text;
        }
        this.data.message = text;
        this.updateContextualHeader(text, this.data.type);
    }

    get message() {
        return this.data.message;
    }

    set title(text) {
        this._customTitle = text;
        if (this.titleElem) {
            this.titleElem.innerText = text;
        }
    }

    get title() {
        return this._customTitle || this.titleElem?.innerText || "";
    }

    set badge(text) {
        this._customBadge = text;
        if (this.badgeElem) {
            this.badgeElem.innerText = text;
        }
    }

    get badge() {
        return this._customBadge || this.badgeElem?.innerText || "";
    }

    updateContextualHeader(message, type) {
        if (!this.titleElem || !this.badgeElem || !this.iconElem) return;

        let detectedBadge = "NOTICE";
        let detectedTitle = "Confirmation";
        let detectedIcon = "confirm";
        const msg = String(message || "").trim();
        const lower = msg.toLowerCase();

        if (type === "input") {
            detectedBadge = "INPUT";
            detectedTitle = "User Input";
            detectedIcon = "input";
        } else if (type === "choice") {
            detectedBadge = "DECISION";
            detectedTitle = "Story Prompt";
            detectedIcon = "choice";
        } else if (lower.includes("delete") || lower.includes("remove")) {
            detectedBadge = "WARNING";
            detectedTitle = "Delete Record";
            detectedIcon = "danger";
        } else if (lower.includes("quit") || lower.includes("exit")) {
            detectedBadge = "CONFIRMATION";
            detectedTitle = lower.includes("quit") ? "Quit Game" : "Exit Game";
            detectedIcon = "confirm";
        } else if (lower.includes("orientation")) {
            detectedBadge = "DISPLAY";
            detectedTitle = "Change Orientation";
            detectedIcon = "system";
        } else if (lower.includes("update")) {
            detectedBadge = "UPDATE";
            detectedTitle = "System Update";
            detectedIcon = "system";
        } else if (msg.includes("\n") || lower.includes("history")) {
            detectedBadge = "LOG";
            detectedTitle = "Dialogue History";
            detectedIcon = "history";
        }

        this.badgeElem.innerText = this._customBadge || detectedBadge;
        this.titleElem.innerText = this._customTitle || detectedTitle;
        this.iconElem.innerHTML = ICONS[detectedIcon] || ICONS.confirm;
    }

    dismiss() {
        if (!this.win || this.win.classList.contains("hidden")) {
            return;
        }

        const buttons = Array.from(this.btns?.querySelectorAll("button") || []);
        const cancelBtn = buttons.find((btn) => {
            const txt = (btn.innerText || btn.textContent || "").trim().toLowerCase();
            return txt === "cancel" || txt === "close" || txt === "no";
        });

        if (cancelBtn) {
            cancelBtn.click();
        } else {
            this.close();
        }
    }

    show() {
        if (!this.win) {
            return;
        }

        AlertWindow.activeInstance = this;

        if (this._message) {
            this._message.innerText = this.data.message;
        }
        this.updateContextualHeader(this.data.message, this.data.type);

        const isHistory = !this.data.type || (this.data.type === "message" && (String(this.data.message || "").split("\n").length > 3 || String(this.data.message || "").toLowerCase().includes("history")));
        if (this.queryBox) {
            if (isHistory) {
                this.queryBox.className = "w-full p-2 text-sm leading-relaxed";
                this.queryBox.style.borderLeftColor = "transparent";
                if (this._message) {
                    this._message.className = "text-sm sm:text-base leading-relaxed text-[#F8F2FF]/85 font-normal whitespace-pre-line";
                }
            } else {
                this.queryBox.className = "w-full px-4 py-3 sm:px-5 sm:py-3.5 rounded-xl bg-white/[0.05] border border-white/10 border-l-4 shadow-inner transition-all duration-200";
                this.queryBox.style.borderLeftColor = this._color || this.config?.colors?.primary || "#B88AEF";
                if (this._message) {
                    this._message.className = "text-base sm:text-lg font-semibold text-white leading-relaxed whitespace-pre-line tracking-wide";
                }
            }
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

        const isExpandedMode = this.data.type === "choice" || (typeof this.data.message === "string" && this.data.message.includes("\n"));
        if (this.card) {
            if (isExpandedMode) {
                this.card.classList.remove("max-w-md");
                this.card.classList.add("max-w-xl");
            } else {
                this.card.classList.remove("max-w-xl");
                this.card.classList.add("max-w-md");
            }
        }

        if (this.data.type === "input") {
            this.input_holder.classList.replace("hidden", "flex");
            this.input_holder.innerHTML = "";
            if (this.data.input) {
                this.data.input.setAttribute("aria-label", this.data.message);
                this.input_holder.append(this.data.input);
            }
        } else {
            this.input_holder.classList.replace("flex", "hidden");
        }

        if (this.data.type === "choice") {
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

        // Show window and trigger entrance animation
        this.win.classList.replace("hidden", "flex");
        this.win.setAttribute("aria-hidden", "false");

        const reduceMotion = typeof globalThis !== "undefined" && Boolean(globalThis.__vnsutraReduceMotion);
        if (reduceMotion) {
            this.win.classList.remove("opacity-0");
            this.win.classList.add("opacity-100");
            if (this.card) {
                this.card.classList.remove("scale-95", "opacity-0", "translate-y-2");
                this.card.classList.add("scale-100", "opacity-100", "translate-y-0");
            }
        } else {
            const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
            raf(() => {
                this.win.classList.remove("opacity-0");
                this.win.classList.add("opacity-100");
                if (this.card) {
                    this.card.classList.remove("scale-95", "opacity-0", "translate-y-2");
                    this.card.classList.add("scale-100", "opacity-100", "translate-y-0");
                }
            });
        }

        if (this.data.type === "input" && this.data.input) {
            this.data.input.focus();
        } else {
            const firstBtn = this.btns.querySelector("button");
            if (firstBtn) {
                firstBtn.focus();
            } else if (this.card) {
                this.card.focus();
            }
        }
    }

    close() {
        if (!this.win) {
            return;
        }

        if (AlertWindow.activeInstance === this) {
            AlertWindow.activeInstance = null;
        }

        const doHide = () => {
            this.win.classList.replace("flex", "hidden");
            this.win.setAttribute("aria-hidden", "true");
            this.win.classList.remove("opacity-100");
            this.win.classList.add("opacity-0");
            if (this.card) {
                this.card.classList.remove("scale-100", "opacity-100", "translate-y-0");
                this.card.classList.add("scale-95", "opacity-0", "translate-y-2");
            }
        };

        const reduceMotion = typeof globalThis !== "undefined" && Boolean(globalThis.__vnsutraReduceMotion);
        if (reduceMotion || typeof window === "undefined" || !this.win.classList.contains("flex")) {
            doHide();
            return;
        }

        this.win.classList.remove("opacity-100");
        this.win.classList.add("opacity-0");
        if (this.card) {
            this.card.classList.remove("scale-100", "opacity-100", "translate-y-0");
            this.card.classList.add("scale-95", "opacity-0", "translate-y-2");
        }

        setTimeout(() => {
            if (this.win.classList.contains("opacity-0")) {
                doHide();
            }
        }, 180);
    }
}

export { AlertWindow };
export default AlertWindow;
