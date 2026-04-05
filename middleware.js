import { rewrite } from "@vercel/edge";

export const config = {
    matcher: ["/:path*"],
};

export default async function middleware(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const headers = request.headers;

    const fetchDest = headers.get("sec-fetch-dest") || "";
    const fetchMode = headers.get("sec-fetch-mode") || "";
    const fetchSite = headers.get("sec-fetch-site") || "";

    if (pathname.endsWith("/middleware.js") || pathname === "/middleware.js") {
        return new Response("Not Found", { status: 404 });
    }

    const allowedRootFiles = ["/service-worker.js"];
    const isRootFile = /^\/[^/]+\.[^/]+$/.test(pathname);
    if (isRootFile && !allowedRootFiles.includes(pathname)) {
        return new Response("Not Found", { status: 404 });
    }

    // Allow API/serverless endpoints used in production.
    if (pathname.startsWith("/api") || pathname === "/folder") {
        return rewrite(request.url);
    }

    // Harden JS delivery: block document-style access and allow script-like fetch destinations.
    if (pathname.toLowerCase().endsWith(".js")) {
        const ext = ".js";
        const isJs = ext === ".js" && fetchDest === "script";
        const isSameOrigin = fetchSite === "same-origin";
        const isWorker = fetchDest === "worker";
        const isServiceWorker = fetchDest === "serviceworker";
        const isEmpty = fetchDest === "empty";

        const isNavigation = fetchMode === "navigate" || fetchDest === "document";
        if (isNavigation) {
            return new Response("Forbidden", { status: 403 });
        }

        // If browser sends Sec-Fetch headers, only allow same-origin and script-like destinations.
        if (fetchDest && !(isJs || isWorker || isServiceWorker || isEmpty)) {
            return new Response("Forbidden", { status: 403 });
        }

        if (fetchSite && !isSameOrigin) {
            return new Response("Forbidden", { status: 403 });
        }
    }
  
    return rewrite(request.url);
}
