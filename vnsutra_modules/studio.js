import {
    getGame,
    getActiveScene,
    getInstructionCount,
    getGameSessionId,
    getState
} from "./runtime-state.js";

const LIGHTING_NAMES = ["day", "sunset", "night", "dramatic", "noir"];
const WEATHER_NAMES = ["rain", "snow", "cherry_blossoms", "embers", "off"];

function isLocalDevHost(hostname = globalThis.location?.hostname || "") {
    if (!hostname) return true; // file:// or headless unit tests
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname.endsWith(".local");
}

/**
 * Determine whether Dev Studio overlay should auto-open from URL (`?studio=true`) or storage.
 * Locked to local/dev hosts so production deployments cannot expose studio controls.
 * @param {string} [search]
 * @param {string} [hostname]
 * @returns {boolean}
 */
function isStudioEnabled(search = globalThis.location?.search || "", hostname = globalThis.location?.hostname || "") {
    if (!isLocalDevHost(hostname)) {
        return false;
    }
    try {
        const params = new URLSearchParams(search);
        if (params.get("studio") === "true" || params.get("studio") === "1") {
            return true;
        }
        return globalThis.localStorage?.getItem?.("vnsutra:studio") === "1";
    } catch {
        return false;
    }
}

/**
 * Format a `.vn` `@camera.pan` command string from camera state.
 * @param {{ x?: number, y?: number, zoom?: number, rotation?: number }} [camState]
 * @returns {string}
 */
function formatCameraCommand(camState = {}) {
    const x = Math.round(Number(camState.x) || 0);
    const y = Math.round(Number(camState.y) || 0);
    const zoom = Number((Number(camState.zoom) || 1).toFixed(2));
    const rot = Number((Number(camState.rotation) || 0).toFixed(1));
    return `@camera.pan x=${x} y=${y} zoom=${zoom} rotation=${rot} duration=0.8`;
}

/**
 * Format a `.vn` `@camera.lighting` command string.
 * @param {string} preset
 * @returns {string}
 */
function formatLightingCommand(preset = "day") {
    return `@camera.lighting preset="${preset}"`;
}

/**
 * Lightweight collapsible In-Browser VN-Sutra Dev Studio (`?studio=true`).
 */
class StudioOverlay {
    /**
     * @param {{ actors?: Record<string, any> }} [options]
     */
    constructor({ actors = {} } = {}) {
        this.actors = actors;
        this.root = null;
        this._refreshTimer = null;
        this._collapsed = false;
        this._status = "";
    }

    mount(doc = globalThis.document) {
        if (!doc?.createElement || !doc?.body || this.root) {
            return this.root;
        }

        const root = doc.createElement("aside");
        root.id = "vnsutra-studio-overlay";
        root.setAttribute("style", [
            "position:fixed", "top:12px", "right:12px", "z-index:99999",
            "width:310px", "max-height:85vh", "overflow:auto",
            "background:rgba(15,23,42,0.92)", "color:#e2e8f0",
            "border:1px solid rgba(56,189,248,0.4)", "border-radius:10px",
            "padding:10px 12px", "font:12px/1.4 system-ui,sans-serif",
            "box-shadow:0 12px 32px rgba(0,0,0,0.45)", "backdrop-filter:blur(8px)"
        ].join(";"));

        root.innerHTML = [
            "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;\">",
            "<strong style=\"color:#38bdf8;letter-spacing:.03em;\">VN-Sutra Studio</strong>",
            "<div style=\"display:flex;gap:6px;\">",
            "<button type=\"button\" data-act=\"toggle\" style=\"background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:2px 7px;cursor:pointer;\">_</button>",
            "<button type=\"button\" data-act=\"close\" style=\"background:#1e293b;color:#f87171;border:1px solid #334155;border-radius:5px;padding:2px 7px;cursor:pointer;\">×</button>",
            "</div></div>",
            "<div data-body>",
            "<div data-meta style=\"background:#0f172a;padding:6px 8px;border-radius:6px;margin-bottom:8px;font-family:monospace;font-size:11px;\"></div>",
            "<div style=\"display:flex;gap:6px;margin-bottom:8px;\">",
            "<button type=\"button\" data-act=\"rb-back\" style=\"flex:1;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:4px;cursor:pointer;\">↶ Rollback</button>",
            "<button type=\"button\" data-act=\"rb-fwd\" style=\"flex:1;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:4px;cursor:pointer;\">↷ Forward</button>",
            "</div>",
            "<div style=\"margin-bottom:8px;\">",
            "<div style=\"color:#94a3b8;font-weight:600;margin-bottom:4px;\">Camera (2D Bounded)</div>",
            "<label style=\"display:flex;justify-content:space-between;\">Zoom <span data-zval>1.00x</span></label>",
            "<input type=\"range\" data-cam=\"zoom\" min=\"1\" max=\"2.5\" step=\"0.05\" value=\"1\" style=\"width:100%;\">",
            "<label style=\"display:flex;justify-content:space-between;\">Pan X <span data-xval>0</span></label>",
            "<input type=\"range\" data-cam=\"x\" min=\"-0.3\" max=\"0.3\" step=\"0.02\" value=\"0\" style=\"width:100%;\">",
            "<label style=\"display:flex;justify-content:space-between;\">Pan Y <span data-yval>0</span></label>",
            "<input type=\"range\" data-cam=\"y\" min=\"-0.25\" max=\"0.25\" step=\"0.02\" value=\"0\" style=\"width:100%;\">",
            "<div style=\"display:flex;gap:6px;margin-top:4px;\">",
            "<button type=\"button\" data-act=\"cam-reset\" style=\"flex:1;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:4px;cursor:pointer;\">Reset</button>",
            "<button type=\"button\" data-act=\"cam-copy\" style=\"flex:1;background:#0369a1;color:#fff;border:0;border-radius:5px;padding:4px;cursor:pointer;\">Copy .vn</button>",
            "</div></div>",
            "<div style=\"margin-bottom:8px;\">",
            "<div style=\"color:#94a3b8;font-weight:600;margin-bottom:4px;\">Ambient Lighting</div>",
            "<div style=\"display:flex;flex-wrap:wrap;gap:4px;\" data-lights></div>",
            "</div>",
            "<div>",
            "<div style=\"color:#94a3b8;font-weight:600;margin-bottom:4px;\">Stage Wipes</div>",
            "<div style=\"display:flex;flex-wrap:wrap;gap:4px;\" data-wipes></div>",
            "</div>",
            "<div style=\"margin-top:8px;\">",
            "<div style=\"color:#94a3b8;font-weight:600;margin-bottom:4px;\">Weather Particles</div>",
            "<div style=\"display:flex;flex-wrap:wrap;gap:4px;\" data-weather></div>",
            "</div>",
            "<div data-status style=\"margin-top:8px;color:#38bdf8;font-size:11px;min-height:14px;\"></div>",
            "</div>"
        ].join("");

        const lightsBox = root.querySelector("[data-lights]");
        for (const preset of LIGHTING_NAMES) {
            const b = doc.createElement("button");
            b.type = "button";
            b.textContent = preset;
            b.dataset.light = preset;
            b.setAttribute("style", "background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 7px;cursor:pointer;");
            lightsBox.appendChild(b);
        }

        const wipesBox = root.querySelector("[data-wipes]");
        for (const w of ["wipe-left", "iris", "blinds", "fade"]) {
            const b = doc.createElement("button");
            b.type = "button";
            b.textContent = w;
            b.dataset.wipe = w;
            b.setAttribute("style", "background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 7px;cursor:pointer;");
            wipesBox.appendChild(b);
        }

        const weatherBox = root.querySelector("[data-weather]");
        for (const w of WEATHER_NAMES) {
            const b = doc.createElement("button");
            b.type = "button";
            b.textContent = w;
            b.dataset.weather = w;
            b.setAttribute("style", "background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 7px;cursor:pointer;");
            weatherBox.appendChild(b);
        }

        const applyCamSliders = () => {
            const zoom = Number(root.querySelector("[data-cam=\"zoom\"]").value);
            const x = Number(root.querySelector("[data-cam=\"x\"]").value);
            const y = Number(root.querySelector("[data-cam=\"y\"]").value);
            root.querySelector("[data-zval]").textContent = `${zoom.toFixed(2)}x`;
            root.querySelector("[data-xval]").textContent = `${Math.round(x * 100)}%`;
            root.querySelector("[data-yval]").textContent = `${Math.round(y * 100)}%`;
            getGame()?.camera?.pan?.({ x, y, zoom, duration: 0.2 });
        };

        root.addEventListener("input", (e) => {
            if (e.target?.dataset?.cam) applyCamSliders();
        });

        root.addEventListener("click", (e) => {
            const act = e.target?.dataset?.act;
            const light = e.target?.dataset?.light;
            const wipe = e.target?.dataset?.wipe;
            const weather = e.target?.dataset?.weather;
            const game = getGame();
            if (act === "close") {
                this.dispose();
            } else if (act === "toggle") {
                this._collapsed = !this._collapsed;
                root.querySelector("[data-body]").style.display = this._collapsed ? "none" : "block";
            } else if (act === "cam-reset") {
                root.querySelector("[data-cam=\"zoom\"]").value = "1";
                root.querySelector("[data-cam=\"x\"]").value = "0";
                root.querySelector("[data-cam=\"y\"]").value = "0";
                applyCamSliders();
                game?.camera?.reset?.({ duration: 0.35 });
            } else if (act === "cam-copy") {
                const cmd = formatCameraCommand(game?.camera?.state);
                globalThis.navigator?.clipboard?.writeText?.(cmd)?.catch?.(() => {});
                this.setStatus(`Copied: ${cmd}`);
            } else if (act === "rb-back") {
                const snap = game?.rollback?.stepBack?.();
                if (snap) game.rollback.applySnapshot(snap, { vars: getState(), actors: this.actors, camera: game.camera });
            } else if (act === "rb-fwd") {
                const snap = game?.rollback?.stepForward?.();
                if (snap) game.rollback.applySnapshot(snap, { vars: getState(), actors: this.actors, camera: game.camera });
            } else if (light) {
                game?.camera?.setLighting?.(light, undefined, Object.values(this.actors));
                const cmd = formatLightingCommand(light);
                globalThis.navigator?.clipboard?.writeText?.(cmd)?.catch?.(() => {});
                this.setStatus(`Lighting: ${light} (copied .vn)`);
            } else if (wipe) {
                game?.transitionEffect?.({ type: wipe, duration: 600, color: "#000000" });
            } else if (weather) {
                if (weather === "off") game?.weather?.stop?.();
                else game?.weather?.start?.(weather, { intensity: 0.7 });
                const cmd = weather === "off" ? "weather: off" : `weather: ${weather} intensity=0.7`;
                globalThis.navigator?.clipboard?.writeText?.(cmd)?.catch?.(() => {});
                this.setStatus(`Weather: ${weather} (copied .vn)`);
            }
        });

        doc.body.appendChild(root);
        this.root = root;
        this.refresh();
        this._refreshTimer = setInterval(() => this.refresh(), 500);
        return root;
    }

    setStatus(msg) {
        this._status = msg;
        const el = this.root?.querySelector?.("[data-status]");
        if (el) el.textContent = msg;
    }

    refresh() {
        const meta = this.root?.querySelector?.("[data-meta]");
        if (!meta) return;
        const game = getGame();
        const rb = game?.rollback;
        const varsCount = Object.keys(getState() || {}).length;
        meta.textContent = `scene=${getActiveScene() || "-"} | instr=${getInstructionCount()} | sess=${getGameSessionId()} | vars=${varsCount} | rb=${rb ? `${rb.cursor + 1}/${rb.history.length}` : "-"}`;
    }

    dispose() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
        this.root?.remove?.();
        this.root = null;
    }
}

export { StudioOverlay, isStudioEnabled, formatCameraCommand, formatLightingCommand, LIGHTING_NAMES };
export default StudioOverlay;
