/**
 * Production Server Entry Point
 * Features: Security headers, caching, minimal logging
 */
import dotenv from "dotenv";
import { createApp } from "./config.js";

dotenv.config();

const PORT = process.env.PORT || 10000;
const { app, cleanupOldZips } = createApp();

// Production middleware: Security headers
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    
    // Cache static assets for 1 week
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/i)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    } else {
        // Don't cache HTML
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
    
    next();
});

// Production middleware: Minimal logging (errors only)
app.use((req, res, next) => {
    res.on("finish", () => {
        if (res.statusCode >= 400) {
            console.error(`[${res.statusCode}] ${req.method} ${req.path}`);
        }
    });
    next();
});

// Run cleanup on startup
cleanupOldZips();

// Schedule cleanup every hour
setInterval(cleanupOldZips, 60 * 60 * 1000);

// Production error handler: Don't expose stack traces
app.use((err, req, res, _next) => {
    console.error("[Production Error]", err.message);
    res.status(err.status || 500).json({
        status: err.status || 500,
        error: "Internal server error"
    });
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`VN-Sutra running on port ${PORT}`);
});
