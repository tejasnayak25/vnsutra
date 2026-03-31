/**
 * DisclaimerWindow - Modal component using AlertWindow design
 * Updates colors and content from config and markdown
 */
class DisclaimerWindow {
    constructor(config) {
        this.config = config;
        this.modal = document.getElementById("disclaimer-modal");
        this.card = document.getElementById("disclaimer-card");
        this.title = document.getElementById("disclaimer-title");
        this.body = document.getElementById("disclaimer-body");
        this.button = document.getElementById("disclaimer-btn");
    }

    /**
     * Show the disclaimer modal with content
     * @param {string} html - HTML content to display
     * @returns {Promise<boolean>} - Resolves when user acknowledges
     */
    show(html) {
        return new Promise((resolve) => {
            if (!this.modal || !this.card) return resolve(false);

            // Apply theme colors to card
            this.card.style.backgroundColor = `${this.config.colors.menu}cc`; // Semi-transparent
            this.card.style.borderTopColor = this.config.colors.primary;

            // Update title color
            this.title.style.color = this.config.colors.primary;

            // Update content
            this.body.innerHTML = html;
            this.body.style.color = this.config.colors.text;

            // Apply theme colors to content elements
            this.body.querySelectorAll("h2, h4").forEach(el => {
                el.style.color = this.config.colors.primary;
            });
            this.body.querySelectorAll("h3").forEach(el => {
                el.style.color = this.config.colors.secondary;
            });
            this.body.querySelectorAll("a").forEach(el => {
                el.style.color = this.config.colors.secondary;
            });

            // Update button
            this.button.style.backgroundColor = this.config.colors.primary;
            this.button.style.color = this.config.colors["primary-text"];
            this.button.textContent = "I Understand";

            // Handle button click
            const handleClick = () => {
                this.close();
                this.button.removeEventListener("click", handleClick);
                resolve(true);
            };
            this.button.addEventListener("click", handleClick);

            // Show modal
            this.modal.classList.remove("hidden");
            this.modal.classList.add("flex", "absolute", "top-0", "w-full", "h-full", "items-center", "justify-center", "p-3");
            this.card.focus();
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

            // Apply theme colors to card
            this.card.style.backgroundColor = `${this.config.colors.menu}cc`; // Semi-transparent
            this.card.style.borderTopColor = this.config.colors.primary;

            // Update title color
            this.title.textContent = "Error";
            this.title.style.color = this.config.colors.primary;

            // Update content
            this.body.innerHTML = `<p style="color: #ef4444; font-weight: 500; margin: 0 0 0.5rem 0;">${message}</p><p style="color: ${this.config.colors.text}; opacity: 0.7; font-size: 0.875rem; margin: 0.5rem 0 0 0;">You may proceed.</p>`;
            this.body.style.color = this.config.colors.text;

            // Update button
            this.button.style.backgroundColor = this.config.colors.primary;
            this.button.style.color = this.config.colors["primary-text"];
            this.button.textContent = "Continue";

            // Handle button click
            const handleClick = () => {
                this.close();
                this.button.removeEventListener("click", handleClick);
                resolve(true);
            };
            this.button.addEventListener("click", handleClick);

            // Show modal
            this.modal.classList.remove("hidden");
            this.modal.classList.add("flex", "absolute", "top-0", "w-full", "h-full", "items-center", "justify-center", "p-3");
            this.card.focus();
        });
    }

    /**
     * Close the disclaimer modal
     */
    close() {
        if (this.modal) {
            this.modal.classList.add("hidden");
        }
    }
}

export default DisclaimerWindow;
