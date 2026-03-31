/**
 * Stage Module - Konva stage and layer initialization
 * 
 * Exports the main Konva stage and transformer layer used throughout the application.
 * Konva is loaded globally via konva.js UMD module.
 */

import errorTracking from "./error-tracking.js";

const Konva = globalThis.Konva;
const docRect = document.body?.getBoundingClientRect?.() ?? { width: 0, height: 0 };

const createFallbackStage = () => ({
    width: () => 0,
    height: () => 0,
    getAttrs: () => ({ width: 0, height: 0 }),
    add: () => {},
    on: () => {},
    off: () => {},
    destroy: () => {}
});

const createFallbackLayer = () => ({
    add: () => {},
    draw: () => {},
    destroy: () => {}
});

if (!Konva) {
    errorTracking?.captureError("Konva not available", {
        message: "[Stage] Konva not available",
        context: { scope: "stage" }
    });
}

const konvaStage = Konva
    ? new Konva.Stage({
        container: "playground",   // id of container <div>
        width: docRect.width,
        height: docRect.height
    })
    : createFallbackStage();

const tr_layer = Konva
    ? new Konva.Layer({
        name: "TransformerLayer"
    })
    : createFallbackLayer();

// Export as ES module
export { konvaStage, tr_layer };
export default konvaStage;