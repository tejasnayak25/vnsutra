const CACHE_VERSION = "vnsutra-v3";
const PRECACHE_NAME = `${CACHE_VERSION}-precache`;
const RUNTIME_NAME = `${CACHE_VERSION}-runtime`;
const MAX_RUNTIME_ENTRIES = 120;

const PRECACHE_URLS = [
    "/",
    "/index.html",
    "/api",
    "/css/output.css",
    "/game/config.json",
    "/game/manifest.json",
    "/assets/images/logo.png"
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(PRECACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        const valid = new Set([PRECACHE_NAME, RUNTIME_NAME]);
        await Promise.all(cacheNames.map((cacheName) => {
            if (!valid.has(cacheName)) {
                return caches.delete(cacheName);
            }
            return Promise.resolve();
        }));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (!isSameOrigin) {
        return;
    }

    if (isApiRequest(url)) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (isStaticAssetRequest(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    if (isScriptOrStyleRequest(request)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    event.respondWith(networkFirst(request));
});

function isApiRequest(url) {
    return url.pathname.startsWith("/folder") || url.pathname.startsWith("/api");
}

function isScriptOrStyleRequest(request) {
    return request.destination === "script" || request.destination === "style";
}

function isStaticAssetRequest(url) {
    if (url.pathname.startsWith("/assets/")) {
        return true;
    }

    return /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|mp3|wav)$/i.test(url.pathname);
}

async function networkFirst(request) {
    const runtimeCache = await caches.open(RUNTIME_NAME);

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            await runtimeCache.put(request, networkResponse.clone());
            await enforceRuntimeLimit(runtimeCache);
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await runtimeCache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        const precachedResponse = await caches.match(request);
        if (precachedResponse) {
            return precachedResponse;
        }
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
    }
}

async function cacheFirst(request) {
    const runtimeCache = await caches.open(RUNTIME_NAME);
    const cachedResponse = await runtimeCache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
        await runtimeCache.put(request, networkResponse.clone());
        await enforceRuntimeLimit(runtimeCache);
    }
    return networkResponse;
}

async function staleWhileRevalidate(request) {
    const runtimeCache = await caches.open(RUNTIME_NAME);
    const cachedResponse = await runtimeCache.match(request);

    const networkPromise = fetch(request)
        .then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok) {
                await runtimeCache.put(request, networkResponse.clone());
                await enforceRuntimeLimit(runtimeCache);
            }
            return networkResponse;
        })
        .catch(() => cachedResponse);

    return cachedResponse || networkPromise;
}

async function enforceRuntimeLimit(cache) {
    const keys = await cache.keys();
    if (keys.length <= MAX_RUNTIME_ENTRIES) {
        return;
    }

    const staleKeys = keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES);
    await Promise.all(staleKeys.map((key) => cache.delete(key)));
}
