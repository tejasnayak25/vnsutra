/**
 * Vercel serverless entrypoint.
 * Export the Express app instead of calling app.listen().
 */
import { createApp } from "./config.js";

const { app, cleanupOldZips } = createApp();

// Best effort cleanup per cold start.
cleanupOldZips().catch(() => {});

export default app;
