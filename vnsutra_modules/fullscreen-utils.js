function isFullscreenActive(doc = (typeof document !== "undefined" ? document : null)) {
    if (!doc) {
        return false;
    }

    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
}

async function restoreFullscreenIfNeeded({
    wasFullscreenBefore = false,
    userExitedFullscreen = false,
    doc = (typeof document !== "undefined" ? document : null),
    timeoutMs = 300,
    onError
} = {}) {
    if (!doc || !doc.documentElement) {
        return;
    }

    // Global suppression flag: when set, callers (like app exit) don't want
    // fullscreen to be re-enabled automatically.
    if (globalThis.__vnsutraSuppressFullscreenRestore) {
        return;
    }

    if (!wasFullscreenBefore || userExitedFullscreen || isFullscreenActive(doc)) {
        return;
    }

    await new Promise((resolveNextFrame) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(resolveNextFrame);
            return;
        }
        setTimeout(resolveNextFrame, 0);
    });

    try {
        const fullscreenPromise = doc.documentElement.requestFullscreen?.();
        if (fullscreenPromise && typeof fullscreenPromise.then === "function") {
            await Promise.race([
                fullscreenPromise.catch(() => {}),
                new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs))
            ]);
        }
    } catch (error) {
        if (typeof onError === "function") {
            onError(error);
        }
    }
}

export { isFullscreenActive, restoreFullscreenIfNeeded };
export default { isFullscreenActive, restoreFullscreenIfNeeded };
