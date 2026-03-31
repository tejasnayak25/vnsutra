function withCacheBust(url, enabled) {
    if (!enabled) {
        return url;
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${Date.now()}`;
}

function deepEqualByJson(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

function createRemoteSceneLoader({
    baseUrl = "",
    extension = ".json",
    cacheBust = true,
    transformScene = null,
    onSceneUpdated = null,
    fetchImpl = (typeof fetch === "function" ? fetch.bind(globalThis) : null)
} = {}) {
    const cache = new Map();
    const timers = new Map();

    if (!fetchImpl) {
        return {
            async getScene() { return null; },
            async refreshScene() { return null; },
            setScene() {},
            removeScene() {},
            startPolling() { return false; },
            stopPolling() {},
            clear() {}
        };
    }

    const buildUrl = (sceneName) => {
        const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        const normalizedExt = extension.startsWith(".") ? extension : `.${extension}`;
        return `${normalizedBase}/${sceneName}${normalizedExt}`;
    };

    const normalizeScene = async (sceneName, payload) => {
        if (typeof transformScene === "function") {
            return transformScene(sceneName, payload);
        }
        return payload;
    };

    const fetchScene = async (sceneName, { force = false } = {}) => {
        if (!sceneName) {
            return null;
        }

        if (!force && cache.has(sceneName)) {
            return cache.get(sceneName);
        }

        const url = withCacheBust(buildUrl(sceneName), cacheBust || force);
        const response = await fetchImpl(url);
        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        const normalized = await normalizeScene(sceneName, payload);
        cache.set(sceneName, normalized);
        return normalized;
    };

    return {
        async getScene(sceneName) {
            return fetchScene(sceneName, { force: false });
        },
        async refreshScene(sceneName) {
            const previous = cache.get(sceneName);
            const next = await fetchScene(sceneName, { force: true });
            if (next && !deepEqualByJson(previous, next) && typeof onSceneUpdated === "function") {
                onSceneUpdated(sceneName, next, previous);
            }
            return next;
        },
        setScene(sceneName, sceneDefinition) {
            if (!sceneName) {
                return;
            }
            const previous = cache.get(sceneName);
            cache.set(sceneName, sceneDefinition);
            if (!deepEqualByJson(previous, sceneDefinition) && typeof onSceneUpdated === "function") {
                onSceneUpdated(sceneName, sceneDefinition, previous);
            }
        },
        removeScene(sceneName) {
            cache.delete(sceneName);
        },
        startPolling(sceneName, intervalMs = 5000) {
            if (!sceneName || intervalMs <= 0 || timers.has(sceneName)) {
                return false;
            }

            const timer = setInterval(() => {
                this.refreshScene(sceneName).catch(() => {});
            }, intervalMs);
            timers.set(sceneName, timer);
            return true;
        },
        stopPolling(sceneName) {
            const timer = timers.get(sceneName);
            if (timer) {
                clearInterval(timer);
                timers.delete(sceneName);
            }
        },
        clear() {
            for (const [sceneName, timer] of timers.entries()) {
                clearInterval(timer);
                timers.delete(sceneName);
            }
            cache.clear();
        }
    };
}

export { createRemoteSceneLoader };
export default { createRemoteSceneLoader };
