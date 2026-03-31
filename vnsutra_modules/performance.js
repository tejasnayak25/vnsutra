/**
 * Performance Monitoring Module
 * 
 * Tracks FPS, memory usage, and custom metrics.
 * Stores metrics to IndexedDB for persistence.
 */

import { storage } from "./storage.js";
import { STORAGE_KEYS, EVENTS } from "./constants.js";
import errorTracking from "./error-tracking.js";

/**
 * Performance telemetry collector for FPS, memory, and operation timings.
 */
class PerformanceMonitoring {
    /**
     * @param {{
     *  enabled?: boolean,
     *  storageKey?: string,
     *  maxEntries?: number,
     *  memorySampleInterval?: number,
     *  fpsSampleInterval?: number
     * }} [options={}]
     */
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.storageKey = options.storageKey ?? STORAGE_KEYS.PERFORMANCE_LOG;
        this.maxEntries = Number.isFinite(options.maxEntries) ? Math.max(20, Math.floor(options.maxEntries)) : 120;
        this.memorySampleInterval = Number.isFinite(options.memorySampleInterval) ? Math.max(1000, Math.floor(options.memorySampleInterval)) : 5000;
        this.fpsSampleInterval = Number.isFinite(options.fpsSampleInterval) ? Math.max(250, Math.floor(options.fpsSampleInterval)) : 1000;

        this.metrics = {
            loadTime: null,
            fps: [],
            memory: [],
            operations: []
        };

        this.memoryTimer = null;
        this.fpsRafId = null;
        this.lastFpsTime = 0;
        this.frameCount = 0;
        this.isRunning = false;
        // Restore is now async - call restoreAsync() during initialization
    }

    /**
     * Update runtime monitoring configuration.
     * @param {{
     *  enabled?: boolean,
     *  maxEntries?: number,
     *  memorySampleInterval?: number,
     *  fpsSampleInterval?: number
     * }} [options={}]
     * @returns {void}
     */
    configure(options = {}) {
        if (typeof options.enabled === "boolean") {
            this.enabled = options.enabled;
        }

        if (Number.isFinite(options.maxEntries)) {
            this.maxEntries = Math.max(20, Math.floor(options.maxEntries));
        }

        if (Number.isFinite(options.memorySampleInterval)) {
            this.memorySampleInterval = Math.max(1000, Math.floor(options.memorySampleInterval));
        }

        if (Number.isFinite(options.fpsSampleInterval)) {
            this.fpsSampleInterval = Math.max(250, Math.floor(options.fpsSampleInterval));
        }

        this.trimAll();

        if (this.enabled) {
            this.start();
            this.captureLoadTime();
        } else {
            this.stop();
        }
    }

    /** @returns {void} */
    init() {
        if (!this.enabled || this.isRunning) {
            return;
        }

        this.start();
        this.captureLoadTime();
    }

    /** @returns {void} */
    start() {
        if (!this.enabled) {
            return;
        }

        this.stop();
        this.isRunning = true;
        this.startFpsTracking();
        this.startMemoryTracking();
    }

    /** @returns {void} */
    stop() {
        this.isRunning = false;

        if (this.memoryTimer) {
            clearInterval(this.memoryTimer);
            this.memoryTimer = null;
        }

        if (this.fpsRafId) {
            cancelAnimationFrame(this.fpsRafId);
            this.fpsRafId = null;
        }
    }

    /** @returns {void} */
    captureLoadTime() {
        const setLoadMetric = () => {
            try {
                const navigationEntries = performance.getEntriesByType("navigation");
                const navigation = navigationEntries?.[0];

                if (navigation && Number.isFinite(navigation.loadEventEnd)) {
                    const loadTime = Math.max(0, Math.round(navigation.loadEventEnd));
                    this.metrics.loadTime = {
                        value: loadTime,
                        timestamp: Date.now()
                    };
                    this.persist();
                    this.emitUpdate("loadTime", this.metrics.loadTime);
                    return;
                }

                if (performance.timing?.navigationStart && performance.timing?.loadEventEnd) {
                    const loadTime = Math.max(0, performance.timing.loadEventEnd - performance.timing.navigationStart);
                    this.metrics.loadTime = {
                        value: Math.round(loadTime),
                        timestamp: Date.now()
                    };
                    this.persist();
                    this.emitUpdate("loadTime", this.metrics.loadTime);
                }
            } catch (error) {
                errorTracking?.captureError(error, {
                    type: "warning",
                    message: "[Performance] Failed to capture load time",
                    context: { scope: "performance", stage: "loadTime" }
                });
            }
        };

        if (document.readyState === "complete") {
            setLoadMetric();
        } else {
            globalThis.addEventListener("load", setLoadMetric, { once: true });
        }
    }

    /** @returns {void} */
    startFpsTracking() {
        this.lastFpsTime = performance.now();
        this.frameCount = 0;

        const loop = (now) => {
            if (!this.isRunning) {
                return;
            }

            this.frameCount += 1;
            const elapsed = now - this.lastFpsTime;

            if (elapsed >= this.fpsSampleInterval) {
                const fps = (this.frameCount * 1000) / elapsed;
                const sample = {
                    value: Number(fps.toFixed(2)),
                    timestamp: Date.now()
                };
                this.metrics.fps.push(sample);
                this.trim("fps");
                this.persist();
                this.emitUpdate("fps", sample);

                this.frameCount = 0;
                this.lastFpsTime = now;
            }

            this.fpsRafId = requestAnimationFrame(loop);
        };

        this.fpsRafId = requestAnimationFrame(loop);
    }

    /** @returns {void} */
    startMemoryTracking() {
        const sampleMemory = () => {
            if (!this.isRunning) {
                return;
            }

            const memory = performance.memory;
            if (!memory) {
                return;
            }

            const sample = {
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize,
                jsHeapSizeLimit: memory.jsHeapSizeLimit,
                timestamp: Date.now()
            };

            this.metrics.memory.push(sample);
            this.trim("memory");
            this.persist();
            this.emitUpdate("memory", sample);
        };

        sampleMemory();
        this.memoryTimer = setInterval(sampleMemory, this.memorySampleInterval);
    }

    /**
     * Start a named operation timer.
     * @param {string} name
     * @returns {string | { name: string, startTime: number } | null}
     */
    startOperation(name) {
        if (!name || !this.enabled) {
            return null;
        }

        const startMark = `${name}:start:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        try {
            performance.mark(startMark);
            return startMark;
        } catch (error) {
            return {
                name,
                startTime: performance.now()
            };
        }
    }

    /**
     * End a named operation timer and persist a sample.
     * @param {string} name
     * @param {string | { name: string, startTime: number } | null} startHandle
     * @returns {{ name: string, duration: number, timestamp: number } | null}
     */
    endOperation(name, startHandle) {
        if (!name || !startHandle || !this.enabled) {
            return null;
        }

        let duration = null;

        if (typeof startHandle === "string") {
            const endMark = `${name}:end:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
            const measureName = `${name}:measure:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

            try {
                performance.mark(endMark);
                performance.measure(measureName, startHandle, endMark);
                const measures = performance.getEntriesByName(measureName);
                const latest = measures[measures.length - 1];
                duration = latest?.duration ?? null;
                performance.clearMarks(startHandle);
                performance.clearMarks(endMark);
                performance.clearMeasures(measureName);
            } catch (error) {
                duration = null;
            }
        } else if (typeof startHandle === "object" && Number.isFinite(startHandle.startTime)) {
            duration = performance.now() - startHandle.startTime;
        }

        if (!Number.isFinite(duration)) {
            return null;
        }

        const sample = {
            name,
            duration: Number(duration.toFixed(2)),
            timestamp: Date.now()
        };

        this.metrics.operations.push(sample);
        this.trim("operations");
        this.persist();
        this.emitUpdate("operations", sample);
        return sample;
    }

    /**
     * Measure a synchronous or async task by name.
     * @template T
     * @param {string} name
     * @param {() => T | Promise<T>} task
     * @returns {Promise<T>}
     */
    async measure(name, task) {
        if (typeof task !== "function") {
            throw new Error("Performance.measure requires a function task");
        }

        const start = this.startOperation(name);
        try {
            const result = task();
            if (result && typeof result.then === "function") {
                const awaited = await result;
                this.endOperation(name, start);
                return awaited;
            }

            this.endOperation(name, start);
            return result;
        } catch (error) {
            this.endOperation(name, start);
            throw error;
        }
    }

    /**
     * Get all collected metrics.
     * @returns {{
     *  loadTime: {value:number,timestamp:number}|null,
     *  fps: Array<{value:number,timestamp:number}>,
     *  memory: Array<{usedJSHeapSize:number,totalJSHeapSize:number,jsHeapSizeLimit:number,timestamp:number}>,
     *  operations: Array<{name:string,duration:number,timestamp:number}>
     * }}
     */
    getMetrics() {
        return {
            loadTime: this.metrics.loadTime,
            fps: [...this.metrics.fps],
            memory: [...this.metrics.memory],
            operations: [...this.metrics.operations]
        };
    }

    /**
     * Get latest snapshot values for dashboard-style display.
     * @returns {{
     *  loadTime: {value:number,timestamp:number}|null,
     *  fps: {value:number,timestamp:number}|null,
     *  memory: {usedJSHeapSize:number,totalJSHeapSize:number,jsHeapSizeLimit:number,timestamp:number}|null,
     *  operation: {name:string,duration:number,timestamp:number}|null
     * }}
     */
    getSnapshot() {
        const latestFps = this.metrics.fps[this.metrics.fps.length - 1] ?? null;
        const latestMemory = this.metrics.memory[this.metrics.memory.length - 1] ?? null;
        const latestOperation = this.metrics.operations[this.metrics.operations.length - 1] ?? null;

        return {
            loadTime: this.metrics.loadTime,
            fps: latestFps,
            memory: latestMemory,
            operation: latestOperation
        };
    }

    /** @returns {void} */
    clear() {
        this.metrics = {
            loadTime: null,
            fps: [],
            memory: [],
            operations: []
        };
        this.persist();
    }

    /**
     * Trim a single metric collection to maxEntries.
     * @param {"fps"|"memory"|"operations"} type
     * @returns {void}
     */
    trim(type) {
        if (Array.isArray(this.metrics[type]) && this.metrics[type].length > this.maxEntries) {
            this.metrics[type] = this.metrics[type].slice(this.metrics[type].length - this.maxEntries);
        }
    }

    /** @returns {void} */
    trimAll() {
        this.trim("fps");
        this.trim("memory");
        this.trim("operations");
    }

    /**
     * Emit a performance update event.
     * @param {string} metric
     * @param {unknown} payload
     * @returns {void}
     */
    emitUpdate(metric, payload) {
        globalThis.dispatchEvent(new CustomEvent(EVENTS.PERFORMANCE, {
            detail: {
                metric,
                payload
            }
        }));
    }

    /** @returns {void} */
    restore() {
        // Restore is now async - call restoreAsync() instead
    }

    /**
     * Restore persisted metrics from storage.
     * @returns {Promise<void>}
     */
    async restoreAsync() {
        try {
            const raw = await storage.getItem(this.storageKey);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return;
            }

            this.metrics = {
                loadTime: parsed.loadTime ?? null,
                fps: Array.isArray(parsed.fps) ? parsed.fps : [],
                memory: Array.isArray(parsed.memory) ? parsed.memory : [],
                operations: Array.isArray(parsed.operations) ? parsed.operations : []
            };

            this.trimAll();
        } catch (error) {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Performance] Failed to restore metrics",
                context: { scope: "performance", stage: "restore" }
            });
        }
    }

    /** @returns {void} */
    persist() {
        storage.setItem(this.storageKey, JSON.stringify(this.metrics)).catch((error) => {
            errorTracking?.captureError(error, {
                type: "warning",
                message: "[Performance] Failed to persist metrics",
                context: { scope: "performance", stage: "persist" }
            });
        });
    }
}

const performanceMonitor = new PerformanceMonitoring();
performanceMonitor.init();

export { PerformanceMonitoring, performanceMonitor };
export default performanceMonitor;