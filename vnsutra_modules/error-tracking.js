import storage from "./storage.js";
import { STORAGE_KEYS } from "./constants.js";

/**
 * Lightweight client-side error collection and optional reporting.
 */
class ErrorTracking {
    /**
     * @param {{
     *  storageKey?: string,
     *  maxEntries?: number,
     *  endpoint?: string | null,
     *  enableReporting?: boolean,
     *  projectName?: string,
     *  release?: string,
     *  environment?: string
     * }} [options={}]
     */
    constructor(options = {}) {
        this.storageKey = options.storageKey ?? STORAGE_KEYS.ERROR_LOG;
        this.maxEntries = Number.isFinite(options.maxEntries) ? Math.max(10, options.maxEntries) : 100;
        this.endpoint = options.endpoint ?? null;
        this.enableReporting = Boolean(options.enableReporting);
        this.projectName = options.projectName ?? "vnsutra";
        this.release = options.release ?? "unknown";
        this.environment = options.environment ?? ((globalThis?.location?.hostname ?? "") === "localhost" ? "development" : "production");
        this.isInitialized = false;
        this.logs = this.loadLogs();
    }

    /**
     * Update runtime error tracking configuration.
     * @param {{
     *  maxEntries?: number,
     *  endpoint?: string,
     *  enableReporting?: boolean,
     *  projectName?: string,
     *  release?: string,
     *  environment?: string
     * }} [options={}]
     * @returns {void}
     */
    configure(options = {}) {
        if (typeof options.maxEntries === "number" && Number.isFinite(options.maxEntries)) {
            this.maxEntries = Math.max(10, Math.floor(options.maxEntries));
            this.trimLogs();
            this.persistLogs();
        }

        if (typeof options.endpoint === "string") {
            this.endpoint = options.endpoint.trim() || null;
        }

        if (typeof options.enableReporting === "boolean") {
            this.enableReporting = options.enableReporting;
        }

        if (typeof options.projectName === "string" && options.projectName.trim()) {
            this.projectName = options.projectName.trim();
        }

        if (typeof options.release === "string" && options.release.trim()) {
            this.release = options.release.trim();
        }

        if (typeof options.environment === "string" && options.environment.trim()) {
            this.environment = options.environment.trim();
        }
    }

    /**
     * Attach global listeners for error and unhandled rejection events.
     * @returns {void}
     */
    init() {
        if (this.isInitialized) {
            return;
        }

        if (typeof globalThis.addEventListener !== "function") {
            this.isInitialized = true;
            return;
        }

        globalThis.addEventListener("error", (event) => {
            this.capture({
                type: "error",
                message: event?.message,
                stack: event?.error?.stack,
                source: event?.filename,
                line: event?.lineno,
                column: event?.colno,
                context: {
                    kind: "window.error"
                }
            });
        });

        globalThis.addEventListener("unhandledrejection", (event) => {
            const normalized = this.normalizeReason(event?.reason);
            this.capture({
                type: "unhandledrejection",
                message: normalized.message,
                stack: normalized.stack,
                context: {
                    kind: "window.unhandledrejection"
                }
            });
        });

        this.isInitialized = true;
    }

    /**
     * Normalize unhandled rejection reasons to a serializable shape.
     * @param {unknown} reason
     * @returns {{ message: string, stack: string | null }}
     */
    normalizeReason(reason) {
        if (reason instanceof Error) {
            return {
                message: reason.message,
                stack: reason.stack
            };
        }

        if (typeof reason === "string") {
            return {
                message: reason,
                stack: null
            };
        }

        try {
            return {
                message: JSON.stringify(reason),
                stack: null
            };
        } catch (error) {
            return {
                message: "Unhandled rejection (unserializable reason)",
                stack: null
            };
        }
    }

    /**
     * Normalize unknown error input into a serializable shape.
     * @param {unknown} error
     * @returns {{ message: string, stack: string | null, name: string | null }}
     */
    normalizeError(error) {
        if (error instanceof Error) {
            return {
                message: error.message,
                stack: error.stack ?? null,
                name: error.name ?? null
            };
        }

        if (typeof error === "string") {
            return {
                message: error,
                stack: null,
                name: null
            };
        }

        try {
            return {
                message: JSON.stringify(error),
                stack: null,
                name: null
            };
        } catch {
            return {
                message: "Unknown error",
                stack: null,
                name: null
            };
        }
    }

    /**
     * Capture an Error-like value with normalized metadata.
     * @param {unknown} error
     * @param {{ type?: string, message?: string, context?: Record<string, unknown> }} [options={}]
     * @returns {void}
     */
    captureError(error, { type = "error", message, context = {} } = {}) {
        const normalized = this.normalizeError(error);
        const nextContext = { ...context };
        if (normalized.name && !Object.prototype.hasOwnProperty.call(nextContext, "errorName")) {
            nextContext.errorName = normalized.name;
        }
        if (normalized.message && !Object.prototype.hasOwnProperty.call(nextContext, "errorMessage")) {
            nextContext.errorMessage = normalized.message;
        }

        this.capture({
            type,
            message: message ?? normalized.message,
            stack: normalized.stack,
            context: nextContext
        });
    }

    /**
     * Capture and persist an error entry.
     * @param {{
     *  type?: string,
     *  message?: string,
     *  stack?: string | null,
     *  source?: string | null,
     *  line?: number | null,
     *  column?: number | null,
     *  context?: Record<string, unknown>
     * }} [payload={}]
     * @returns {void}
     */
    capture({ type = "error", message = "Unknown error", stack = null, source = null, line = null, column = null, context = {} } = {}) {
        const entry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            type,
            message: String(message ?? "Unknown error"),
            stack: stack ?? null,
            source: source ?? null,
            line: Number.isFinite(line) ? line : null,
            column: Number.isFinite(column) ? column : null,
            project: this.projectName,
            release: this.release,
            environment: this.environment,
            url: globalThis?.location?.href ?? null,
            context
        };

        this.logs.push(entry);
        this.trimLogs();
        this.persistLogs();

        console.warn("[ErrorTracking] Captured", entry.type, entry.message, entry);

        if (this.enableReporting && this.endpoint) {
            this.report(entry);
        }
    }

    /**
     * Send an error entry to the remote endpoint.
     * @param {Record<string, unknown>} entry
     * @returns {Promise<void>}
     */
    async report(entry) {
        try {
            await fetch(this.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(entry)
            });
        } catch (error) {
            console.warn("[ErrorTracking] Failed to report error:", error);
        }
    }

    /**
     * Get a copy of tracked logs.
     * @returns {Array<Record<string, unknown>>}
     */
    getLogs() {
        return [...this.logs];
    }

    /** @returns {void} */
    clearLogs() {
        this.logs = [];
        this.persistLogs();
    }

    /**
     * Enable or disable remote reporting.
     * @param {boolean} enabled
     * @returns {void}
     */
    setReporting(enabled) {
        this.enableReporting = Boolean(enabled);
    }

    /**
     * Set reporting endpoint URL.
     * @param {string | null | undefined} endpoint
     * @returns {void}
     */
    setEndpoint(endpoint) {
        this.endpoint = typeof endpoint === "string" ? (endpoint.trim() || null) : null;
    }

    /**
     * Return in-memory logs placeholder for sync restore path.
     * @returns {Array<Record<string, unknown>>}
     */
    loadLogs() {
        // Logs are now loaded asynchronously via storage
        // Return empty array - actual loading happens in init()
        return [];
    }

    /**
     * Load logs from persistent storage.
     * @returns {Promise<Array<Record<string, unknown>>>}
     */
    async loadLogsAsync() {
        try {
            const raw = await storage.getItem(this.storageKey);
            if (!raw) {
                return [];
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed;
        } catch (error) {
            console.warn("[ErrorTracking] Failed to load logs:", error);
            return [];
        }
    }

    /** @returns {void} */
    persistLogs() {
        storage.setItem(this.storageKey, JSON.stringify(this.logs)).catch((error) => {
            console.warn("[ErrorTracking] Failed to save logs:", error);
        });
    }

    /** @returns {void} */
    trimLogs() {
        if (this.logs.length > this.maxEntries) {
            this.logs = this.logs.slice(this.logs.length - this.maxEntries);
        }
    }

    /**
     * Create a compact unique id for an error entry.
     * @returns {string}
     */
    generateId() {
        return `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
}

const errorTracking = new ErrorTracking();
errorTracking.init();

export { ErrorTracking, errorTracking };
export default errorTracking;