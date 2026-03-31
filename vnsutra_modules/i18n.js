/**
 * Internationalization (i18n) Module
 * 
 * Provides multi-language support for dialogues and text
 * 
 * Usage:
 * - Initialize: await i18n.loadLanguage('en')
 * - In dialogue: await dialog(character, "@scene1.intro")
 * - Messages starting with '@' are treated as translation keys
 * - Parameter interpolation: "@key" with params { name: "Alice" } replaces {{name}}
 */

import { storage } from "./storage.js";
import { STORAGE_KEYS } from "./constants.js";
import errorTracking from "./error-tracking.js";

/**
 * Internationalization (i18n) manager for language loading and translation.
 */
class I18n {
    /**
     * @param {string} [defaultLang="en"]
     */
    constructor(defaultLang = "en") {
        this.currentLang = defaultLang;
        this.translations = {};
        this.supportedLangs = ["en", "ja", "es", "fr"];
        this.fallbackLang = "en";
        this.localePathTemplate = "locales/{lang}.json";
        this.fetchImpl = (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    }

    /**
     * Configure locale loading behavior.
     * @param {{ path?: string, supported?: string[], fallback?: string }} [options={}]
     * @returns {void}
     */
    configure(options = {}) {
        if (typeof options.path === "string" && options.path.trim().length > 0) {
            this.localePathTemplate = options.path.trim();
        }

        if (Array.isArray(options.supported) && options.supported.length > 0) {
            const normalized = options.supported
                .filter((lang) => typeof lang === "string")
                .map((lang) => lang.trim())
                .filter(Boolean);

            if (normalized.length > 0) {
                this.supportedLangs = [...new Set(normalized)];
            }
        }

        if (typeof options.fallback === "string" && options.fallback.trim().length > 0) {
            this.fallbackLang = options.fallback.trim();
        }
    }

    /**
     * Build the locale file URL/path for a language.
     * @param {string} lang
     * @returns {string}
     */
    resolveLocalePath(lang) {
        const template = this.localePathTemplate || "locales/{lang}.json";
        const encodedLang = encodeURIComponent(lang);

        if (template.includes("{lang}")) {
            return template.replaceAll("{lang}", encodedLang);
        }

        if (template.endsWith("/")) {
            return `${template}${encodedLang}.json`;
        }

        return `${template}/${encodedLang}.json`;
    }

    /**
     * Load language translations from locale JSON file
     * @param {string} lang - Language code (en, ja, es, fr)
     * @returns {Promise<boolean>} - Success status
     */
    async loadLanguage(lang) {
        if (!this.supportedLangs.includes(lang)) {
            console.warn(`[i18n] Language "${lang}" not supported. Supported: ${this.supportedLangs.join(", ")}`);
            lang = this.fallbackLang;
        }

        try {
            if (!this.fetchImpl) {
                throw new Error("Fetch API unavailable");
            }

            const localePath = this.resolveLocalePath(lang);
            const response = await this.fetchImpl(localePath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.translations[lang] = await response.json();
            this.currentLang = lang;
            await storage.setItem(STORAGE_KEYS.PREFERRED_LANGUAGE, lang);
            // eslint-disable-next-line no-console
            console.log(`[i18n] Language loaded: ${lang}`);
            return true;
        } catch (error) {
            errorTracking?.captureError(error, {
                message: `[i18n] Failed to load language "${lang}"`,
                context: { scope: "i18n", language: lang }
            });
            
            // Fallback to English if available
            if (lang !== this.fallbackLang && this.translations[this.fallbackLang]) {
                // eslint-disable-next-line no-console
                console.log(`[i18n] Falling back to ${this.fallbackLang}`);
                this.currentLang = this.fallbackLang;
                return true;
            }
            return false;
        }
    }

    /**
     * Translate a key with optional parameter interpolation
     * @param {string} key - Translation key (scene.dialogue)
     * @param {Object} params - Parameters for {{param}} interpolation
     * @returns {string} - Translated text or key name if not found
     */
    t(key, params = {}) {
        const keys = key.split(".");
        
        // Try to get translation from current language
        let value = this.translations[this.currentLang];
        for (const k of keys) {
            value = value?.[k];
        }

        // Fallback to English if translation missing and not already in English
        if (!value && this.currentLang !== this.fallbackLang) {
            value = this.translations[this.fallbackLang];
            for (const k of keys) {
                value = value?.[k];
            }
        }

        // If still not found, return key as placeholder
        if (!value) {
            console.warn(`[i18n] Missing translation: ${key}`);
            return key;
        }

        // Replace {{param}} with actual values
        let result = String(value);
        Object.entries(params).forEach(([param, val]) => {
            result = result.replace(new RegExp(`{{${param}}}`, "g"), val);
        });

        return result;
    }

    /**
     * Set current language
     * @param {string} lang - Language code
     */
    setLanguage(lang) {
        if (this.supportedLangs.includes(lang)) {
            this.currentLang = lang;
            localStorage.setItem(STORAGE_KEYS.PREFERRED_LANGUAGE, lang);
        }
    }

    /**
     * Get current language
     * @returns {string} - Current language code
     */
    getLanguage() {
        return this.currentLang;
    }

    /**
     * Get list of supported languages
     * @returns {Array<string>} - Array of language codes
     */
    getSupportedLanguages() {
        return [...this.supportedLangs];
    }

    /**
     * Check if text is a translation key (starts with @)
     * @param {*} text - Text to check
     * @returns {boolean}
     */
    isTranslationKey(text) {
        return typeof text === "string" && text.startsWith("@");
    }

    /**
     * Process message - translate if it's a key, return as-is if plain text
     * @param {string} message - Message (plain text or @key)
     * @param {Object} params - Interpolation parameters
     * @returns {string} - Final text
     */
    process(message, params = {}) {
        if (this.isTranslationKey(message)) {
            const key = message.slice(1); // Remove @
            return this.t(key, params);
        }
        return message;
    }
}

// Global instance
export const i18n = new I18n();

// Auto-restore user's preferred language on page load
/**
 * Initialize i18n with preferred language and optional locale configuration.
 * @param {{ ui?: { locales?: { path?: string, supported?: string[], fallback?: string } } } | null} [config=null]
 * @returns {Promise<void>}
 */
export async function initialize(config = null) {
    const localeConfig = config?.ui?.locales;
    if (localeConfig && typeof localeConfig === "object") {
        i18n.configure(localeConfig);
    }

    const savedLang = await storage.getItem(STORAGE_KEYS.PREFERRED_LANGUAGE) || i18n.fallbackLang || "en";
    await i18n.loadLanguage(savedLang);
}

export { I18n };
