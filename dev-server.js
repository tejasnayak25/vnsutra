import { WebSocketServer } from "ws";
import chokidar from "chokidar";

const HOT_RELOAD_PORT = parseInt(process.env.HOT_RELOAD_PORT, 10) || 3001;

const wss = new WebSocketServer({ port: HOT_RELOAD_PORT });

const watcher = chokidar.watch([
    "vnsutra_modules/**/*.js",
    "game/**/*.js",
    "css/output.css",
], {
    // eslint-disable-next-line no-useless-escape
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
});

let reloadTimeout = null;
const DEBOUNCE_MS = 150; // Batch file changes within 150ms into single reload

watcher.on("change", (filePath) => {
    // Clear existing timeout to debounce rapid file changes
    if (reloadTimeout) {
        clearTimeout(reloadTimeout);
    }

    // Schedule reload after debounce period
    reloadTimeout = setTimeout(() => {
        const payload = JSON.stringify({
            type: "reload",
            timestamp: Date.now(),
        });

        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(payload);
            }
        });

        // eslint-disable-next-line no-console
        console.log("[Hot Reload] Reload triggered");
        reloadTimeout = null;
    }, DEBOUNCE_MS);

    // eslint-disable-next-line no-console
    console.log(`[Hot Reload] File changed: ${filePath} (reload scheduled)`);
});

wss.on("connection", () => {
    // eslint-disable-next-line no-console
    console.log("[Hot Reload] Client connected");
});

wss.on("listening", () => {
    // eslint-disable-next-line no-console
    console.log(`[Hot Reload] WebSocket server running on ws://localhost:${HOT_RELOAD_PORT}`);
});

wss.on("error", (error) => {
    console.error("[Hot Reload] Server error:", error);
});

process.on("SIGINT", async () => {
    await watcher.close();
    wss.close(() => process.exit(0));
});
