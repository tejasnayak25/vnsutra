/**
 * Main Entry Point (Backward Compatibility)
 * Routes to dev.js or prod.js based on NODE_ENV
 */
const env = process.env.NODE_ENV || "development";

if (env === "production") {
    await import("./prod.js");
} else {
    await import("./dev.js");
}
