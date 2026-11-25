const DYNAMIC_KEYS = new Set(["x", "y", "width", "height", "fontSize", "strokeWidth", "cornerRadius", "opacity"]);

const NODE_TYPE_MAP = Object.freeze({
    view: "Group",
    rect: "Rect",
    text: "Text",
    image: "Image",
    "nine-slice": "Shape",
    nineslice: "Shape"
});

function parseSliceAttr(sliceVal) {
    if (Array.isArray(sliceVal) && sliceVal.length === 4) {
        return sliceVal.map((v) => Math.max(0, Number(v) || 0));
    }
    if (Array.isArray(sliceVal) && sliceVal.length === 2) {
        const [v, h] = sliceVal.map((x) => Math.max(0, Number(x) || 0));
        return [v, h, v, h];
    }
    if (typeof sliceVal === "number") {
        const n = Math.max(0, sliceVal);
        return [n, n, n, n];
    }
    if (typeof sliceVal === "string") {
        const parts = sliceVal.trim().split(/\s+/).map((p) => Math.max(0, parseFloat(p) || 0));
        if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
        if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
        if (parts.length >= 4) return [parts[0], parts[1], parts[2], parts[3]];
    }
    return [20, 20, 20, 20];
}

function createNineSliceShape(Konva, nodeAttrs, nodePlan) {
    let sourceImage = null;
    const initialSlices = parseSliceAttr(nodeAttrs.slice ?? nodePlan.attrs?.slice ?? [20, 20, 20, 20]);

    const shapeAttrs = { ...nodeAttrs };
    delete shapeAttrs.slice;
    delete shapeAttrs.src;

    const shape = new Konva.Shape({
        ...shapeAttrs,
        sceneFunc: function(context, shapeNode) {
            if (!sourceImage) {
                return;
            }
            const img = sourceImage;
            const sw = img.naturalWidth || img.width;
            const sh = img.naturalHeight || img.height;
            if (!sw || !sh) return;

            const [t, r, b, l] = shapeNode._nineSliceBorders || initialSlices;
            const dw = shapeNode.width();
            const dh = shapeNode.height();
            if (dw <= 0 || dh <= 0) return;

            const sCenterW = Math.max(0, sw - l - r);
            const sCenterH = Math.max(0, sh - t - b);
            const dCenterW = Math.max(0, dw - l - r);
            const dCenterH = Math.max(0, dh - t - b);

            const ctx = context._context || context;

            // 1. Top-Left Corner
            if (l > 0 && t > 0) {
                ctx.drawImage(img, 0, 0, l, t, 0, 0, l, t);
            }
            // 2. Top-Center Edge
            if (sCenterW > 0 && t > 0 && dCenterW > 0) {
                ctx.drawImage(img, l, 0, sCenterW, t, l, 0, dCenterW, t);
            }
            // 3. Top-Right Corner
            if (r > 0 && t > 0) {
                ctx.drawImage(img, sw - r, 0, r, t, dw - r, 0, r, t);
            }
            // 4. Middle-Left Edge
            if (l > 0 && sCenterH > 0 && dCenterH > 0) {
                ctx.drawImage(img, 0, t, l, sCenterH, 0, t, l, dCenterH);
            }
            // 5. Middle-Center Fill
            if (sCenterW > 0 && sCenterH > 0 && dCenterW > 0 && dCenterH > 0) {
                ctx.drawImage(img, l, t, sCenterW, sCenterH, l, t, dCenterW, dCenterH);
            }
            // 6. Middle-Right Edge
            if (r > 0 && sCenterH > 0 && dCenterH > 0) {
                ctx.drawImage(img, sw - r, t, r, sCenterH, dw - r, t, r, dCenterH);
            }
            // 7. Bottom-Left Corner
            if (l > 0 && b > 0) {
                ctx.drawImage(img, 0, sh - b, l, b, 0, dh - b, l, b);
            }
            // 8. Bottom-Center Edge
            if (sCenterW > 0 && b > 0 && dCenterW > 0) {
                ctx.drawImage(img, l, sh - b, sCenterW, b, l, dh - b, dCenterW, b);
            }
            // 9. Bottom-Right Corner
            if (r > 0 && b > 0) {
                ctx.drawImage(img, sw - r, sh - b, r, b, dw - r, dh - b, r, b);
            }
        }
    });

    shape._nineSliceBorders = initialSlices;
    shape.setNineSliceImage = (img) => {
        sourceImage = img;
        shape.boundImage = img;
        if (typeof shape.getLayer === "function") {
            shape.getLayer()?.batchDraw?.();
        }
    };
    shape.setSlices = (newSlices) => {
        shape._nineSliceBorders = parseSliceAttr(newSlices);
        if (typeof shape.getLayer === "function") {
            shape.getLayer()?.batchDraw?.();
        }
    };

    return shape;
}

function bindNineSliceSource(node, src) {
    if (!node || !src) return;
    if (typeof node.getAttr === "function" && node.getAttr(INTERNAL_IMAGE_SRC_ATTR) === src) {
        return;
    }
    if (typeof node.setAttr === "function") {
        node.setAttr(INTERNAL_IMAGE_SRC_ATTR, src);
    }
    const ImageCtor = globalThis.Image;
    if (typeof ImageCtor !== "function") return;
    const img = new ImageCtor();
    img.onload = () => {
        if (typeof node.setNineSliceImage === "function") {
            node.setNineSliceImage(img);
        }
    };
    img.src = src;
}

const INTERNAL_IMAGE_SRC_ATTR = "__uiLayoutImageSrc";

function resolveBaseDimension(base, context) {
    if (base === "parentWidth") {
        return Number(context.parentWidth) || 0;
    }

    if (base === "parentHeight") {
        return Number(context.parentHeight) || 0;
    }

    if (base === "stageWidth") {
        return Number(context.stageWidth) || 0;
    }

    if (base === "stageHeight") {
        return Number(context.stageHeight) || 0;
    }

    return 0;
}

function resolveExpressionTerm(term, context) {
    if (!term || typeof term !== "object") {
        return 0;
    }

    if (term.kind === "static") {
        return Number(term.value) || 0;
    }

    if (term.kind === "percent") {
        const baseValue = resolveBaseDimension(term.base, context);
        return baseValue * ((Number(term.value) || 0) / 100);
    }

    if (term.kind === "viewport") {
        const axis = term.axis === "height" ? "stageHeight" : "stageWidth";
        const viewportValue = Number(context[axis]) || 0;
        return viewportValue * ((Number(term.value) || 0) / 100);
    }

    if (term.kind === "calc") {
        const left = resolveExpressionTerm(term.left, context);
        const right = resolveExpressionTerm(term.right, context);
        return term.op === "-" ? left - right : left + right;
    }

    return 0;
}

export function evaluateDynamicValue(dynamicValue, context) {
    return resolveExpressionTerm(dynamicValue, context);
}

export function resolvePlanNodeAttrs(nodePlan, context) {
    const isPortrait = Boolean(context.isPortrait);
    const isAndroid = Boolean(context.isAndroid || context.isMobile);
    const isMobile = Boolean(context.isMobile || context.isAndroid);

    // Base static attrs
    const attrs = { ...(nodePlan.attrs || {}) };

    // Base dynamic expressions
    for (const [attrName, dynamicExpr] of Object.entries(nodePlan.dynamic || {})) {
        if (!DYNAMIC_KEYS.has(attrName)) {
            continue;
        }
        attrs[attrName] = evaluateDynamicValue(dynamicExpr, context);
    }

    const applyOverrides = (overrideAttrs, overrideDynamic) => {
        if (overrideAttrs) {
            Object.assign(attrs, overrideAttrs);
        }

        if (!overrideDynamic) {
            return;
        }

        for (const [attrName, dynamicExpr] of Object.entries(overrideDynamic)) {
            if (!DYNAMIC_KEYS.has(attrName)) {
                continue;
            }
            attrs[attrName] = evaluateDynamicValue(dynamicExpr, context);
        }
    };

    // Orientation overrides
    applyOverrides(
        isPortrait ? nodePlan.portraitAttrs : nodePlan.landscapeAttrs,
        isPortrait ? nodePlan.portraitDynamic : nodePlan.landscapeDynamic
    );

    // Platform overrides
    if (isAndroid || isMobile) {
        applyOverrides(nodePlan.androidAttrs, nodePlan.androidDynamic);
        applyOverrides(nodePlan.mobileAttrs, nodePlan.mobileDynamic);
    }

    // Combo overrides (most specific)
    if ((isAndroid || isMobile) && isPortrait) {
        applyOverrides(nodePlan.androidPortraitAttrs, nodePlan.androidPortraitDynamic);
        applyOverrides(nodePlan.mobilePortraitAttrs, nodePlan.mobilePortraitDynamic);
    }

    if ((isAndroid || isMobile) && !isPortrait) {
        applyOverrides(nodePlan.androidLandscapeAttrs, nodePlan.androidLandscapeDynamic);
        applyOverrides(nodePlan.mobileLandscapeAttrs, nodePlan.mobileLandscapeDynamic);
    }

    return attrs;
}

// Build the per-node context, substituting parent's resolved dimensions.
function buildNodeContext(nodePlan, rootContext, resolvedDimsById) {
    if (!nodePlan.parentId || !resolvedDimsById.has(nodePlan.parentId)) {
        return rootContext;
    }
    const parentDims = resolvedDimsById.get(nodePlan.parentId);
    return {
        ...rootContext,
        parentWidth: parentDims.width,
        parentHeight: parentDims.height
    };
}

function resolveKonvaEventName(eventKey) {
    if (!eventKey || !eventKey.startsWith("on")) {
        return null;
    }

    const normalized = eventKey.slice(2).toLowerCase();

    if (normalized === "click") {
        return "click tap";
    }

    if (normalized === "mouseover") {
        return "mouseover";
    }

    if (normalized === "mouseout") {
        return "mouseout";
    }

    if (normalized === "touchstart") {
        return "touchstart";
    }

    return normalized;
}

function getImageSrcFromAttrs(attrs) {
    if (!attrs || typeof attrs.src !== "string") {
        return null;
    }

    const src = attrs.src.trim();
    return src.length > 0 ? src : null;
}

function stripImageSrcAttr(attrs) {
    if (!attrs || !Object.prototype.hasOwnProperty.call(attrs, "src")) {
        return attrs;
    }

    const nextAttrs = { ...attrs };
    delete nextAttrs.src;
    return nextAttrs;
}

function bindImageSource(node, src) {
    if (!node || typeof node.image !== "function" || !src) {
        return;
    }

    if (typeof node.getAttr === "function" && node.getAttr(INTERNAL_IMAGE_SRC_ATTR) === src) {
        return;
    }

    if (typeof node.setAttr === "function") {
        node.setAttr(INTERNAL_IMAGE_SRC_ATTR, src);
    }

    const ImageCtor = globalThis.Image;
    if (typeof ImageCtor !== "function") {
        return;
    }

    const img = new ImageCtor();
    img.onload = () => {
        node.image(img);
        if (typeof node.getLayer === "function") {
            node.getLayer()?.batchDraw?.();
        }
    };
    img.src = src;
}

export function createKonvaNodesFromPlan({
    Konva,
    plan,
    context,
    eventHandlers = {}
}) {
    if (!Konva) {
        throw new Error("createKonvaNodesFromPlan requires a Konva reference.");
    }

    if (!plan || !Array.isArray(plan.nodes)) {
        throw new Error("createKonvaNodesFromPlan requires a valid render plan.");
    }

    const nodesById = new Map();
    const rootNodes = [];
    const resolvedDimsById = new Map();

    for (const nodePlan of plan.nodes) {
        const isNineSlice = nodePlan.type === "nine-slice" || nodePlan.type === "nineslice";
        const konvaType = isNineSlice ? "Shape" : NODE_TYPE_MAP[nodePlan.type];
        if (!konvaType || typeof Konva[konvaType] !== "function") {
            throw new Error(`Unsupported plan node type: ${nodePlan.type}`);
        }

        const nodeContext = buildNodeContext(nodePlan, context, resolvedDimsById);
        const resolvedAttrs = resolvePlanNodeAttrs(nodePlan, nodeContext);
        const imageSrc = (nodePlan.type === "image" || isNineSlice) ? getImageSrcFromAttrs(resolvedAttrs) : null;
        const nodeAttrs = {
            ...(konvaType !== "Group" ? { perfectDrawEnabled: false } : {}),
            ...(imageSrc ? stripImageSrcAttr(resolvedAttrs) : resolvedAttrs),
            id: nodePlan.id
        };

        // Record resolved dimensions so children can use them as their parent context
        resolvedDimsById.set(nodePlan.id, {
            width: typeof resolvedAttrs.width === "number" ? resolvedAttrs.width : (nodeContext.parentWidth || 0),
            height: typeof resolvedAttrs.height === "number" ? resolvedAttrs.height : (nodeContext.parentHeight || 0)
        });

        const node = isNineSlice
            ? createNineSliceShape(Konva, nodeAttrs, nodePlan)
            : new Konva[konvaType](nodeAttrs);

        if (imageSrc) {
            if (isNineSlice) {
                bindNineSliceSource(node, imageSrc);
            } else {
                bindImageSource(node, imageSrc);
            }
        }

        for (const [eventKey, handlerName] of Object.entries(nodePlan.events || {})) {
            const eventName = resolveKonvaEventName(eventKey);
            const handler = eventHandlers[handlerName];

            if (!eventName || typeof handler !== "function") {
                continue;
            }

            node.on(eventName, (evt) => handler(evt, node, nodePlan));
        }

        nodesById.set(nodePlan.id, {
            node,
            plan: nodePlan
        });
    }

    for (const nodePlan of plan.nodes) {
        const current = nodesById.get(nodePlan.id);
        if (!current) {
            continue;
        }

        if (!nodePlan.parentId) {
            rootNodes.push(current.node);
            continue;
        }

        const parent = nodesById.get(nodePlan.parentId);
        if (!parent) {
            rootNodes.push(current.node);
            continue;
        }

        parent.node.add(current.node);
    }

    return {
        rootNodes,
        nodesById
    };
}

export function reflowPlanNodes({
    plan,
    nodesById,
    context
}) {
    if (!plan || !Array.isArray(plan.nodes) || !nodesById) {
        return;
    }

    const resolvedDimsById = new Map();

    for (const nodePlan of plan.nodes) {
        const entry = nodesById.get(nodePlan.id);
        if (!entry) {
            continue;
        }

        const nodeContext = buildNodeContext(nodePlan, context, resolvedDimsById);
        const attrs = resolvePlanNodeAttrs(nodePlan, nodeContext);
        const isNineSlice = nodePlan.type === "nine-slice" || nodePlan.type === "nineslice";
        const imageSrc = (nodePlan.type === "image" || isNineSlice) ? getImageSrcFromAttrs(attrs) : null;
        const nextAttrs = imageSrc ? stripImageSrcAttr(attrs) : attrs;

        entry.node.setAttrs(nextAttrs);
        if (imageSrc) {
            if (isNineSlice) {
                bindNineSliceSource(entry.node, imageSrc);
            } else {
                bindImageSource(entry.node, imageSrc);
            }
        }

        resolvedDimsById.set(nodePlan.id, {
            width: typeof attrs.width === "number" ? attrs.width : (nodeContext.parentWidth || 0),
            height: typeof attrs.height === "number" ? attrs.height : (nodeContext.parentHeight || 0)
        });
    }
}
