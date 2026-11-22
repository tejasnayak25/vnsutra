import { getIsAndroid, getIsPortrait } from "./runtime-state.js";

/**
 * DisclaimerWindow - Elegant modal component matching AlertWindow design system
 * Dark amethyst aesthetic, glassmorphism backdrop, fluid transitions & accessibility
 */
class DisclaimerWindow {
    constructor(config) {
        this.config = config || {};
        this.modal = document.getElementById("disclaimer-modal");
        this.card = document.getElementById("disclaimer-card");
        this.title = document.getElementById("disclaimer-title");
        this.badge = document.getElementById("disclaimer-badge");
        this.body = document.getElementById("disclaimer-body");
        this.button = document.getElementById("disclaimer-btn");
        this.closeX = document.getElementById("disclaimer-close-x");
        this.accentLine = document.getElementById("disclaimer-accent-line");
        this.iconWrap = document.getElementById("disclaimer-icon-wrap");
        this.iconElem = document.getElementById("disclaimer-icon");
        this._isClosing = false;
        this._currentResolve = null;
    }

    applyLayout() {
        if (!this.modal || !this.card) {
            return;
        }

        const isAndroidLandscape = getIsAndroid() && !getIsPortrait();
        const bodyWrap = document.getElementById("disclaimer-body-wrap");
        if (bodyWrap) {
            bodyWrap.style.maxHeight = isAndroidLandscape ? "38vh" : "52vh";
        }
        if (this.card) {
            this.card.style.maxWidth = isAndroidLandscape ? "min(88vw, 32rem)" : "min(92vw, 36rem)";
        }
    }

    /**
     * Show the disclaimer modal with content
     * @param {string} html - HTML content to display
     * @returns {Promise<boolean>} - Resolves when user acknowledges
     */
    show(html) {
        return new Promise((resolve) => {
            if (!this.modal || !this.card) return resolve(false);

            this._isClosing = false;
            this._currentResolve = resolve;

            const primaryColor = this.config?.colors?.primary || "#B88AEF";
            const secondaryColor = this.config?.colors?.secondary || "#F2A9D5";
            const textColor = this.config?.colors?.text || "#F8F2FF";

            this.applyLayout();

            // Accent & Header Elements
            if (this.accentLine) {
                this.accentLine.style.background = `linear-gradient(to right, transparent, ${primaryColor}, transparent)`;
            }
            if (this.iconWrap) {
                this.iconWrap.style.color = primaryColor;
                this.iconWrap.style.borderColor = "rgba(255, 255, 255, 0.12)";
            }
            if (this.badge) {
                this.badge.style.color = primaryColor;
                this.badge.textContent = "Content Advisory";
            }
            if (this.title) {
                this.title.style.color = "#FFFFFF";
                this.title.textContent = "Disclaimer & Guidelines";
            }

            // Body Content
            if (this.body) {
                this.body.innerHTML = html;
                this.body.style.color = "rgba(248, 242, 255, 0.88)";

                // Style markdown elements with theme palette
                this.body.querySelectorAll("h2, h4").forEach(el => {
                    el.style.color = primaryColor;
                });
                this.body.querySelectorAll("h3").forEach(el => {
                    el.style.color = secondaryColor;
                });
                this.body.querySelectorAll("a").forEach(el => {
                    el.style.color = secondaryColor;
                    el.setAttribute("target", "_blank");
                    el.setAttribute("rel", "noopener noreferrer");
                });
            }

            // Action Button
            if (this.button) {
                this.button.textContent = "I Understand & Proceed";
                this.button.style.background = `linear-gradient(135deg, ${primaryColor}, #A470E0)`;
                this.button.style.color = "#141126";
            }

            const complete = () => {
                cleanupListeners();
                this.close().then(() => {
                    if (this._currentResolve) {
                        const cb = this._currentResolve;
                        this._currentResolve = null;
                        cb(true);
                    }
                });
            };

            const handleBtnClick = (e) => {
                e?.preventDefault?.();
                complete();
            };

            const handleCloseXClick = (e) => {
                e?.preventDefault?.();
                complete();
            };

            const handleBackdropClick = (e) => {
                if (e.target === this.modal) {
                    complete();
                }
            };

            const handleKeyDown = (e) => {
                if (e.key === "Escape" || e.key === "Enter") {
                    e.preventDefault();
                    complete();
                }
            };

            const cleanupListeners = () => {
                this.button?.removeEventListener("click", handleBtnClick);
                this.closeX?.removeEventListener("click", handleCloseXClick);
                this.modal?.removeEventListener("click", handleBackdropClick);
                document.removeEventListener("keydown", handleKeyDown);
            };

            this.button?.addEventListener("click", handleBtnClick);
            this.closeX?.addEventListener("click", handleCloseXClick);
            this.modal?.addEventListener("click", handleBackdropClick);
            document.addEventListener("keydown", handleKeyDown);

            // Show modal & trigger entrance animation
            this.modal.classList.remove("hidden");
            this.modal.classList.add("flex");
            this.modal.setAttribute("aria-hidden", "false");

            const reduceMotion = typeof globalThis !== "undefined" && Boolean(globalThis.__vnsutraReduceMotion);
            if (reduceMotion) {
                this.modal.classList.remove("opacity-0");
                this.modal.classList.add("opacity-100");
                this.card.classList.remove("scale-95", "opacity-0");
                this.card.classList.add("scale-100", "opacity-100");
                this.button?.focus?.();
            } else {
                const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
                raf(() => {
                    this.modal.classList.remove("opacity-0");
                    this.modal.classList.add("opacity-100");
                    this.card.classList.remove("scale-95", "opacity-0");
                    this.card.classList.add("scale-100", "opacity-100");
                    this.button?.focus?.();
                });
            }
        });
    }

    /**
     * Show error state
     * @param {string} message - Error message
     * @returns {Promise<boolean>} - Resolves when user acknowledges
     */
    showError(message) {
        return new Promise((resolve) => {
            if (!this.modal || !this.card) return resolve(false);

            this._isClosing = false;
            this._currentResolve = resolve;

            const primaryColor = this.config?.colors?.primary || "#B88AEF";

            this.applyLayout();

            if (this.badge) {
                this.badge.style.color = "#F6C66B";
                this.badge.textContent = "Notice";
            }
            if (this.title) {
                this.title.style.color = "#FFFFFF";
                this.title.textContent = "Notice";
            }

            if (this.body) {
                this.body.innerHTML = `
                    <p style="color: #F6C66B; font-weight: 600; margin-bottom: 0.5rem;">${message}</p>
                    <p style="color: rgba(248, 242, 255, 0.70); font-size: 0.875rem; margin: 0;">You may proceed to the game.</p>
                `;
            }

            if (this.button) {
                this.button.textContent = "Continue";
                this.button.style.background = `linear-gradient(135deg, ${primaryColor}, #A470E0)`;
                this.button.style.color = "#141126";
            }

            const complete = () => {
                cleanupListeners();
                this.close().then(() => {
                    if (this._currentResolve) {
                        const cb = this._currentResolve;
                        this._currentResolve = null;
                        cb(true);
                    }
                });
            };

            const handleBtnClick = (e) => {
                e?.preventDefault?.();
                complete();
            };

            const cleanupListeners = () => {
                this.button?.removeEventListener("click", handleBtnClick);
                this.closeX?.removeEventListener("click", complete);
                this.modal?.removeEventListener("click", complete);
            };

            this.button?.addEventListener("click", handleBtnClick);
            this.closeX?.addEventListener("click", complete);
            this.modal?.addEventListener("click", complete);

            this.modal.classList.remove("hidden");
            this.modal.classList.add("flex");
            this.modal.setAttribute("aria-hidden", "false");

            const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
            raf(() => {
                this.modal.classList.remove("opacity-0");
                this.modal.classList.add("opacity-100");
                this.card.classList.remove("scale-95", "opacity-0");
                this.card.classList.add("scale-100", "opacity-100");
                this.button?.focus?.();
            });
        });
    }

    /**
     * Close the disclaimer modal with smooth fade/scale-down animation
     * @returns {Promise<void>}
     */
    close() {
        return new Promise((resolve) => {
            if (!this.modal || !this.card) {
                resolve();
                return;
            }

            if (this._isClosing) {
                resolve();
                return;
            }
            this._isClosing = true;

            const reduceMotion = typeof globalThis !== "undefined" && Boolean(globalThis.__vnsutraReduceMotion);
            if (reduceMotion) {
                this.modal.classList.remove("opacity-100");
                this.modal.classList.add("opacity-0");
                this.card.classList.remove("scale-100", "opacity-100");
                this.card.classList.add("scale-95", "opacity-0");
                this.modal.classList.replace("flex", "hidden");
                this.modal.setAttribute("aria-hidden", "true");
                this._isClosing = false;
                resolve();
            } else {
                this.modal.classList.remove("opacity-100");
                this.modal.classList.add("opacity-0");
                this.card.classList.remove("scale-100", "opacity-100");
                this.card.classList.add("scale-95", "opacity-0");

                setTimeout(() => {
                    this.modal.classList.replace("flex", "hidden");
                    this.modal.setAttribute("aria-hidden", "true");
                    this._isClosing = false;
                    resolve();
                }, 200);
            }
        });
    }
}

export default DisclaimerWindow;
export { DisclaimerWindow };
