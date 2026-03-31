const DYNAMIC_KEYS = new Set(["x", "y", "width", "height", "fontSize", "strokeWidth", "cornerRadius", "opacity"]);

const NODE_TYPE_MAP = Object.freeze({
    view: "Group",
    rect: "Rect",
    text: "Text",
    image: "Image"
});

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
    const isAndroid = Boolean(context.isAndroid);

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
    if (isAndroid) {
        applyOverrides(nodePlan.androidAttrs, nodePlan.androidDynamic);
    }

    // Combo overrides (most specific)
    if (isAndroid && isPortrait) {
        applyOverrides(nodePlan.androidPortraitAttrs, nodePlan.androidPortraitDynamic);
    }

    if (isAndroid && !isPortrait) {
        applyOverrides(nodePlan.androidLandscapeAttrs, nodePlan.androidLandscapeDynamic);
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
        const konvaType = NODE_TYPE_MAP[nodePlan.type];
        if (!konvaType || typeof Konva[konvaType] !== "function") {
            throw new Error(`Unsupported plan node type: ${nodePlan.type}`);
        }

        const nodeContext = buildNodeContext(nodePlan, context, resolvedDimsById);
        const resolvedAttrs = resolvePlanNodeAttrs(nodePlan, nodeContext);
        const imageSrc = nodePlan.type === "image" ? getImageSrcFromAttrs(resolvedAttrs) : null;
        const nodeAttrs = {
            ...(imageSrc ? stripImageSrcAttr(resolvedAttrs) : resolvedAttrs),
            id: nodePlan.id
        };

        // Record resolved dimensions so children can use them as their parent context
        resolvedDimsById.set(nodePlan.id, {
            width: typeof resolvedAttrs.width === "number" ? resolvedAttrs.width : (nodeContext.parentWidth || 0),
            height: typeof resolvedAttrs.height === "number" ? resolvedAttrs.height : (nodeContext.parentHeight || 0)
        });

        const node = new Konva[konvaType](nodeAttrs);
        if (imageSrc) {
            bindImageSource(node, imageSrc);
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
        const imageSrc = nodePlan.type === "image" ? getImageSrcFromAttrs(attrs) : null;
        const nextAttrs = imageSrc ? stripImageSrcAttr(attrs) : attrs;

        entry.node.setAttrs(nextAttrs);
        if (imageSrc) {
            bindImageSource(entry.node, imageSrc);
        }

        resolvedDimsById.set(nodePlan.id, {
            width: typeof attrs.width === "number" ? attrs.width : (nodeContext.parentWidth || 0),
            height: typeof attrs.height === "number" ? attrs.height : (nodeContext.parentHeight || 0)
        });
    }
}
