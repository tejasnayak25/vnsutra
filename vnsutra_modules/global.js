import { getConfiguration } from "./runtime-state.js";

/**
 * Helper to detect development environment
 */
function isDevelopment() {
    return globalThis.location.hostname === "localhost" || 
           globalThis.location.hostname === "127.0.0.1" ||
           globalThis.location.hostname === "0.0.0.0";
}

/**
 * Optional: Disable development tools when not in dev mode
 * This prevents unauthorized access to game internals in production
 * Enabled only when configuration explicitly allows it
 */
function initializeSecuritySettings() {
    // Check if dev tools blocking is explicitly enabled in config
    const config = getConfiguration();
    const shouldDisableDevTools = config?.security?.disableDevTools && !isDevelopment();
    const shouldDisableContextMenu = config?.security?.disableContextMenu && !isDevelopment();
    
    if (shouldDisableContextMenu) {
        document.oncontextmenu = (e) => {
            e.preventDefault();
        };
    }
    
    if (shouldDisableDevTools) {
        document.addEventListener("keydown", (e) => {
            // Block F12
            if (e.key === "F12") {
                e.preventDefault();
            }
            // Block Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && e.key === "I") {
                e.preventDefault();
            }
            // Block Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && e.key === "J") {
                e.preventDefault();
            }
            // Block Ctrl+Shift+C (Element Inspector)
            if (e.ctrlKey && e.shiftKey && e.key === "C") {
                e.preventDefault();
            }
        });
    }
}

export { isDevelopment, initializeSecuritySettings };