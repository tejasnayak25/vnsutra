/**
 * Stage Module - Konva stage and layer initialization
 * 
 * Exports the main Konva stage and transformer layer used throughout the application.
 * Konva is loaded globally via konva.js UMD module.
 */

import errorTracking from "./error-tracking.js";

const Konva = globalThis.Konva;

function getInitialStageRect() {
    const viewport = globalThis.visualViewport;
    const bodyRect = document.body?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
    const docRect = document.documentElement?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
    const innerWidth = Number(globalThis.innerWidth) || 0;
    const innerHeight = Number(globalThis.innerHeight) || 0;
    const viewportWidth = Number(viewport?.width) || 0;
    const viewportHeight = Number(viewport?.height) || 0;

    const width = Math.max(
        Math.round(bodyRect.width) || 0,
        Math.round(docRect.width) || 0,
        Math.round(viewportWidth),
        Math.round(innerWidth)
    );
    const height = Math.max(
        Math.round(bodyRect.height) || 0,
        Math.round(docRect.height) || 0,
        Math.round(viewportHeight),
        Math.round(innerHeight)
    );

    return { width, height };
}

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
        width: getInitialStageRect().width,
        height: getInitialStageRect().height
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