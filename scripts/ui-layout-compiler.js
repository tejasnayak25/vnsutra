import path from "path";
import crypto from "crypto";
import fs from "fs-extra";

export const UI_LAYOUT_ENGINE_VERSION = "0.1.0";

const SUPPORTED_NODE_TYPES = new Set(["view", "rect", "text", "image"]);

const STYLE_TO_KONVA_ATTR = Object.freeze({
    x: "x",
    left: "x",
    y: "y",
    top: "y",
    width: "width",
    height: "height",
    fill: "fill",
    "background-color": "fill",
    stroke: "stroke",
    "border-color": "stroke",
    "stroke-width": "strokeWidth",
    "border-width": "strokeWidth",
    "corner-radius": "cornerRadius",
    "border-radius": "cornerRadius",
    opacity: "opacity",
    text: "text",
    "font-size": "fontSize",
    "font-family": "fontFamily",
    "font-weight": "fontStyle",
    "font-style": "fontStyle",
    "text-align": "align",
    "vertical-align": "verticalAlign",
    align: "align",
    padding: "padding",
    wrap: "wrap",
    "scale-x": "scaleX",
    "scale-y": "scaleY",
    src: "src",
    "fill-after-stroke-enabled": "fillAfterStrokeEnabled",
    visible: "visible",
    "z-index": "zIndex"
});

const DYNAMIC_ATTRS = new Set([
    "x",
    "y",
    "width",
    "height",
    "fontSize",
    "strokeWidth",
    "cornerRadius",
    "opacity"
]);

function splitClassNames(classAttr = "") {
    if (!classAttr) {
        return [];
    }

    return classAttr
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseAttributes(attrSource) {
    const attrs = {};
    const attrRegex = /([:@A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;

    while ((match = attrRegex.exec(attrSource)) !== null) {
        const [, rawName, doubleQuoted, singleQuoted] = match;
        attrs[rawName] = doubleQuoted ?? singleQuoted ?? "";
    }

    return attrs;
}

export function parseXmlLayout(xmlSource) {
    const source = String(xmlSource || "")
        .replace(/<\?xml[\s\S]*?\?>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

    if (!source) {
        throw new Error("UI layout XML is empty.");
    }

    const tagRegex = /<[^>]+>/g;
    const stack = [];
    let rootNode = null;
    let match;

    while ((match = tagRegex.exec(source)) !== null) {
        const tagToken = match[0];

        if (/^<!/.test(tagToken)) {
            continue;
        }

        if (/^<\//.test(tagToken)) {
            const closingTag = tagToken.slice(2, -1).trim().toLowerCase();
            const openNode = stack.pop();

            if (!openNode || openNode.tag !== closingTag) {
                throw new Error(`Malformed XML layout: unexpected closing tag </${closingTag}>.`);
            }

            continue;
        }

        const selfClosing = /\/>$/.test(tagToken);
        const inner = tagToken.slice(1, tagToken.length - (selfClosing ? 2 : 1)).trim();

        if (!inner) {
            continue;
        }

        const splitIndex = inner.search(/\s/);
        const rawTag = splitIndex === -1 ? inner : inner.slice(0, splitIndex);
        const tag = rawTag.toLowerCase();
        const attrSource = splitIndex === -1 ? "" : inner.slice(splitIndex + 1);

        const node = {
            tag,
            attrs: parseAttributes(attrSource),
            children: []
        };

        if (stack.length > 0) {
            stack[stack.length - 1].children.push(node);
        } else if (rootNode) {
            throw new Error("Malformed XML layout: multiple root nodes are not supported.");
        } else {
            rootNode = node;
        }

        if (!selfClosing) {
            stack.push(node);
        }
    }

    if (!rootNode) {
        throw new Error("Malformed XML layout: no root node found.");
    }

    if (stack.length > 0) {
        throw new Error("Malformed XML layout: unclosed tag detected.");
    }

    return rootNode;
}

function parseSelectorPart(part) {
    const trimmed = part.trim();
    const token = {
        tag: null,
        id: null,
        classes: [],
        universal: false
    };

    if (!trimmed || trimmed === "*") {
        token.universal = true;
        return token;
    }

    const tagMatch = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*/);
    if (tagMatch) {
        token.tag = tagMatch[0].toLowerCase();
    }

    const idMatch = trimmed.match(/#([A-Za-z0-9_-]+)/);
    if (idMatch) {
        token.id = idMatch[1];
    }

    const classRegex = /\.([A-Za-z0-9_-]+)/g;
    let classMatch;
    while ((classMatch = classRegex.exec(trimmed)) !== null) {
        token.classes.push(classMatch[1]);
    }

    return token;
}

function computeSelectorSpecificity(parts) {
    let idCount = 0;
    let classCount = 0;
    let tagCount = 0;

    for (const part of parts) {
        if (part.id) {
            idCount += 1;
        }

        classCount += part.classes.length;

        if (part.tag) {
            tagCount += 1;
        }
    }

    return idCount * 100 + classCount * 10 + tagCount;
}

function parseSelector(selectorText) {
    const parts = selectorText
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(parseSelectorPart);

    if (parts.length === 0) {
        throw new Error(`Invalid selector: "${selectorText}".`);
    }

    return {
        raw: selectorText,
        parts,
        specificity: computeSelectorSpecificity(parts)
    };
}

function parseDeclarations(blockSource) {
    const declarations = {};

    for (const chunk of blockSource.split(";")) {
        const trimmed = chunk.trim();
        if (!trimmed) {
            continue;
        }

        const separatorIndex = trimmed.indexOf(":");
        if (separatorIndex === -1) {
            continue;
        }

        const property = trimmed.slice(0, separatorIndex).trim().toLowerCase();
        const value = trimmed.slice(separatorIndex + 1).trim();

        if (!property || !value) {
            continue;
        }

        declarations[property] = value;
    }

    return declarations;
}

export function parseCssStyles(cssSource, options = {}) {
    const strict = options.strict !== false;
    const source = String(cssSource || "").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [];
    let ruleOrder = 0;

    // Extract conditional blocks by tracking brace depth.
    function extractAtBlocks(src) {
        const atRegex = /@(android-landscape|android-portrait|portrait|landscape|android)\s*\{/gi;
        const blocks = [];
        let match;

        while ((match = atRegex.exec(src)) !== null) {
            const condition = match[1].toLowerCase();
            let depth = 1;
            let i = match.index + match[0].length;

            while (i < src.length && depth > 0) {
                if (src[i] === "{") depth++;
                else if (src[i] === "}") depth--;
                i++;
            }

            blocks.push({
                condition,
                content: src.slice(match.index + match[0].length, i - 1),
                start: match.index,
                end: i
            });
            atRegex.lastIndex = i;
        }

        return blocks;
    }

    // Parse a flat CSS block (no nesting) into rules tagged with an optional condition.
    function parseRulesBlock(blockSource, condition) {
        const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
        let match;

        while ((match = ruleRegex.exec(blockSource)) !== null) {
            const selectorSource = match[1].trim();
            const declarationSource = match[2];

            if (!selectorSource) {
                continue;
            }

            const selectorList = selectorSource
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
                .map(parseSelector);

            const declarations = parseDeclarations(declarationSource);

            for (const prop of Object.keys(declarations)) {
                if (!STYLE_TO_KONVA_ATTR[prop] && strict) {
                    throw new Error(`Unsupported CSS property "${prop}" in UI layout stylesheet.`);
                }
            }

            if (selectorList.length === 0 || Object.keys(declarations).length === 0) {
                continue;
            }

            rules.push({ selectors: selectorList, declarations, order: ruleOrder, condition: condition ?? null });
            ruleOrder += 1;
        }
    }

    const atBlocks = extractAtBlocks(source);

    // Remove @blocks from source so the base rule pass doesn't see them.
    let baseSource = source;
    for (const block of [...atBlocks].reverse()) {
        baseSource = baseSource.slice(0, block.start) + baseSource.slice(block.end);
    }

    parseRulesBlock(baseSource, null);

    for (const block of atBlocks) {
        parseRulesBlock(block.content, block.condition);
    }

    return rules;
}

function selectorPartMatchesNode(selectorPart, nodeContext) {
    if (!selectorPart || !nodeContext) {
        return false;
    }

    if (selectorPart.universal) {
        return true;
    }

    if (selectorPart.tag && selectorPart.tag !== nodeContext.tag) {
        return false;
    }

    if (selectorPart.id && selectorPart.id !== nodeContext.id) {
        return false;
    }

    for (const className of selectorPart.classes) {
        if (!nodeContext.classSet.has(className)) {
            return false;
        }
    }

    return true;
}

function selectorMatchesNode(selector, nodeContext) {
    const parts = selector.parts;
    let partIndex = parts.length - 1;
    let currentNode = nodeContext;

    if (!selectorPartMatchesNode(parts[partIndex], currentNode)) {
        return false;
    }

    partIndex -= 1;

    while (partIndex >= 0) {
        let foundMatch = false;
        currentNode = currentNode.parent;

        while (currentNode) {
            if (selectorPartMatchesNode(parts[partIndex], currentNode)) {
                foundMatch = true;
                break;
            }

            currentNode = currentNode.parent;
        }

        if (!foundMatch) {
            return false;
        }

        partIndex -= 1;
    }

    return true;
}

function resolvePercentBase(attrName) {
    if (attrName === "x" || attrName === "width") {
        return "parentWidth";
    }

    if (attrName === "y" || attrName === "height") {
        return "parentHeight";
    }

    return "parentWidth";
}

function parseNumericUnitTerm(rawValue, attrName) {
    const value = rawValue.trim();

    if (!value) {
        return null;
    }

    if (/^-?\d*\.?\d+$/.test(value)) {
        const numberValue = Number(value);
        if (Number.isFinite(numberValue)) {
            return {
                kind: "static",
                value: numberValue
            };
        }
    }

    const unitMatch = value.match(/^(-?\d*\.?\d+)(px|%|vw|vh)$/i);
    if (!unitMatch) {
        return null;
    }

    const numericValue = Number(unitMatch[1]);
    const unit = unitMatch[2].toLowerCase();

    if (!Number.isFinite(numericValue)) {
        return null;
    }

    if (unit === "px") {
        return {
            kind: "static",
            value: numericValue
        };
    }

    if (unit === "%") {
        return {
            kind: "percent",
            value: numericValue,
            base: resolvePercentBase(attrName)
        };
    }

    return {
        kind: "viewport",
        axis: unit === "vw" ? "width" : "height",
        value: numericValue
    };
}

function splitCalcExpression(calcBody) {
    let depth = 0;

    for (let index = 1; index < calcBody.length; index += 1) {
        const char = calcBody[index];

        if (char === "(") {
            depth += 1;
            continue;
        }

        if (char === ")") {
            depth -= 1;
            continue;
        }

        if ((char === "+" || char === "-") && depth === 0) {
            return {
                left: calcBody.slice(0, index).trim(),
                op: char,
                right: calcBody.slice(index + 1).trim()
            };
        }
    }

    return null;
}

function compileExpression(rawValue, attrName) {
    const value = String(rawValue || "").trim();

    if (!value) {
        return null;
    }

    const calcMatch = value.match(/^calc\((.+)\)$/i);
    if (calcMatch) {
        const split = splitCalcExpression(calcMatch[1].trim());
        if (!split) {
            return null;
        }

        const left = parseNumericUnitTerm(split.left, attrName);
        const right = parseNumericUnitTerm(split.right, attrName);

        if (!left || !right) {
            return null;
        }

        if (left.kind === "static" && right.kind === "static") {
            return {
                staticValue: split.op === "+" ? left.value + right.value : left.value - right.value
            };
        }

        return {
            dynamicValue: {
                kind: "calc",
                op: split.op,
                left,
                right
            }
        };
    }

    const term = parseNumericUnitTerm(value, attrName);
    if (!term) {
        return null;
    }

    if (term.kind === "static") {
        return {
            staticValue: term.value
        };
    }

    return {
        dynamicValue: term
    };
}

function normalizeFontStyle(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();

    if (!value) {
        return "normal";
    }

    if (value === "normal" || value === "bold" || value === "italic" || value === "bold italic") {
        return value;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 600) {
        return "bold";
    }

    return "normal";
}

function coerceLiteralValue(rawValue, attrName) {
    const value = String(rawValue || "").trim();

    if (value.length === 0) {
        return "";
    }

    if (attrName === "visible" || attrName === "fillAfterStrokeEnabled") {
        return value === "true";
    }

    if (attrName === "fontStyle") {
        return normalizeFontStyle(value);
    }

    if (attrName === "zIndex") {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }

    const pxMatch = value.match(/^(-?\d*\.?\d+)px$/i);
    if (pxMatch) {
        const numeric = Number(pxMatch[1]);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && !Number.isNaN(numericValue)) {
        return numericValue;
    }

    return value;
}

function compileAttrValue(rawValue, attrName) {
    if (DYNAMIC_ATTRS.has(attrName)) {
        const expression = compileExpression(rawValue, attrName);
        if (expression) {
            return expression;
        }
    }

    return {
        staticValue: coerceLiteralValue(rawValue, attrName)
    };
}

function applyCompiledValue(targetAttrs, targetDynamic, attrName, compiledValue) {
    if (Object.prototype.hasOwnProperty.call(compiledValue, "dynamicValue")) {
        delete targetAttrs[attrName];
        targetDynamic[attrName] = compiledValue.dynamicValue;
        return;
    }

    delete targetDynamic[attrName];
    targetAttrs[attrName] = compiledValue.staticValue;
}

function mapStylePropertyToKonvaAttr(propName) {
    return STYLE_TO_KONVA_ATTR[String(propName || "").toLowerCase()] || null;
}

function createNodeContexts(xmlNode, parentContext, state) {
    const rawId = xmlNode.attrs.id;
    const baseId = rawId || `${xmlNode.tag}-${state.autoId}`;
    const safeBaseId = String(baseId || "node").trim() || "node";
    const occurrence = (state.idCounts[safeBaseId] || 0) + 1;
    state.idCounts[safeBaseId] = occurrence;
    const nodeId = occurrence === 1 ? safeBaseId : `${safeBaseId}-${occurrence}`;

    state.autoId += 1;

    const classNames = splitClassNames(xmlNode.attrs.class || "");
    const context = {
        id: nodeId,
        tag: xmlNode.tag,
        attrs: xmlNode.attrs,
        classNames,
        classSet: new Set(classNames),
        parent: parentContext,
        children: []
    };

    if (parentContext) {
        parentContext.children.push(context);
    }

    state.nodes.push(context);

    for (const child of xmlNode.children) {
        createNodeContexts(child, context, state);
    }

    return context;
}

function resolveStylesForNode(nodeContext, rules) {
    const resolved = new Map();

    for (const rule of rules) {
        for (const selector of rule.selectors) {
            if (!selectorMatchesNode(selector, nodeContext)) {
                continue;
            }

            for (const [propName, rawValue] of Object.entries(rule.declarations)) {
                const existing = resolved.get(propName);
                if (!existing || selector.specificity > existing.specificity || (selector.specificity === existing.specificity && rule.order >= existing.order)) {
                    resolved.set(propName, {
                        value: rawValue,
                        specificity: selector.specificity,
                        order: rule.order
                    });
                }
            }
        }
    }

    const computed = {};
    for (const [propName, detail] of resolved.entries()) {
        computed[propName] = detail.value;
    }

    return computed;
}

export function compileUiLayout({
    screen,
    xmlSource,
    cssSource,
    strictCss = true
}) {
    if (!screen) {
        throw new Error("compileUiLayout requires a screen name.");
    }

    const xmlTree = parseXmlLayout(xmlSource);
    const cssRules = parseCssStyles(cssSource, { strict: strictCss });
    const baseRules = cssRules.filter((r) => r.condition === null || r.condition === undefined);
    const portraitRules = cssRules.filter((r) => r.condition === "portrait");
    const landscapeRules = cssRules.filter((r) => r.condition === "landscape");
    const androidRules = cssRules.filter((r) => r.condition === "android");
    const androidPortraitRules = cssRules.filter((r) => r.condition === "android-portrait");
    const androidLandscapeRules = cssRules.filter((r) => r.condition === "android-landscape");

    const state = {
        nodes: [],
        idCounts: {},
        autoId: 1
    };

    createNodeContexts(xmlTree, null, state);

    const compiledNodes = [];

    for (const nodeContext of state.nodes) {
        if (!SUPPORTED_NODE_TYPES.has(nodeContext.tag)) {
            throw new Error(`Unsupported node type "${nodeContext.tag}" in screen "${screen}".`);
        }

        const attrs = {};
        const dynamic = {};
        const events = {};

        for (const [rawName, rawValue] of Object.entries(nodeContext.attrs)) {
            if (rawName === "id" || rawName === "class") {
                continue;
            }

            if (/^on[A-Za-z]/.test(rawName)) {
                events[rawName] = rawValue;
                continue;
            }

            const mappedAttrName = mapStylePropertyToKonvaAttr(rawName) || rawName;
            const compiledValue = compileAttrValue(rawValue, mappedAttrName);
            applyCompiledValue(attrs, dynamic, mappedAttrName, compiledValue);
        }

        const styleMap = resolveStylesForNode(nodeContext, baseRules);

        for (const [propName, rawValue] of Object.entries(styleMap)) {
            const mappedAttrName = mapStylePropertyToKonvaAttr(propName);
            if (!mappedAttrName) {
                continue;
            }

            const compiledValue = compileAttrValue(rawValue, mappedAttrName);
            applyCompiledValue(attrs, dynamic, mappedAttrName, compiledValue);
        }

        // Compile orientation-specific overrides
        const portraitAttrs = {};
        const portraitDynamic = {};
        const landscapeAttrs = {};
        const landscapeDynamic = {};
        const androidAttrs = {};
        const androidDynamic = {};
        const androidPortraitAttrs = {};
        const androidPortraitDynamic = {};
        const androidLandscapeAttrs = {};
        const androidLandscapeDynamic = {};

        for (const [styleMap2, oAttrs, oDynamic] of [
            [resolveStylesForNode(nodeContext, portraitRules), portraitAttrs, portraitDynamic],
            [resolveStylesForNode(nodeContext, landscapeRules), landscapeAttrs, landscapeDynamic],
            [resolveStylesForNode(nodeContext, androidRules), androidAttrs, androidDynamic],
            [resolveStylesForNode(nodeContext, androidPortraitRules), androidPortraitAttrs, androidPortraitDynamic],
            [resolveStylesForNode(nodeContext, androidLandscapeRules), androidLandscapeAttrs, androidLandscapeDynamic]
        ]) {
            for (const [propName, rawValue] of Object.entries(styleMap2)) {
                const mappedAttrName = mapStylePropertyToKonvaAttr(propName);
                if (!mappedAttrName) {
                    continue;
                }
                const compiledValue = compileAttrValue(rawValue, mappedAttrName);
                applyCompiledValue(oAttrs, oDynamic, mappedAttrName, compiledValue);
            }
        }

        compiledNodes.push({
            id: nodeContext.id,
            type: nodeContext.tag,
            parentId: nodeContext.parent ? nodeContext.parent.id : null,
            classes: nodeContext.classNames,
            attrs,
            dynamic,
            ...(Object.keys(portraitAttrs).length > 0 ? { portraitAttrs } : {}),
            ...(Object.keys(portraitDynamic).length > 0 ? { portraitDynamic } : {}),
            ...(Object.keys(landscapeAttrs).length > 0 ? { landscapeAttrs } : {}),
            ...(Object.keys(landscapeDynamic).length > 0 ? { landscapeDynamic } : {}),
            ...(Object.keys(androidAttrs).length > 0 ? { androidAttrs } : {}),
            ...(Object.keys(androidDynamic).length > 0 ? { androidDynamic } : {}),
            ...(Object.keys(androidPortraitAttrs).length > 0 ? { androidPortraitAttrs } : {}),
            ...(Object.keys(androidPortraitDynamic).length > 0 ? { androidPortraitDynamic } : {}),
            ...(Object.keys(androidLandscapeAttrs).length > 0 ? { androidLandscapeAttrs } : {}),
            ...(Object.keys(androidLandscapeDynamic).length > 0 ? { androidLandscapeDynamic } : {}),
            events
        });
    }

    const sourceHash = crypto
        .createHash("sha256")
        .update(String(xmlSource || ""))
        .update("\n---\n")
        .update(String(cssSource || ""))
        .digest("hex");

    return {
        engineVersion: UI_LAYOUT_ENGINE_VERSION,
        screen,
        hash: `sha256:${sourceHash}`,
        nodeCount: compiledNodes.length,
        nodes: compiledNodes
    };
}

function createContentHash(content) {
    return crypto
        .createHash("sha256")
        .update(String(content || ""))
        .digest("hex");
}

export async function compileUiDirectory({ inputRootDir, outputDir }) {
    await fs.ensureDir(outputDir);

    if (!(await fs.pathExists(inputRootDir))) {
        await fs.writeJson(path.join(outputDir, "manifest.json"), {
            engineVersion: UI_LAYOUT_ENGINE_VERSION,
            generatedAt: new Date().toISOString(),
            artifacts: []
        }, { spaces: 4 });

        return [];
    }

    const directoryEntries = await fs.readdir(inputRootDir, { withFileTypes: true });
    const screenDirs = directoryEntries.filter((entry) => entry.isDirectory());
    const artifacts = [];

    for (const screenDir of screenDirs) {
        const screenName = screenDir.name;
        const fullScreenDir = path.join(inputRootDir, screenName);
        const layoutPath = path.join(fullScreenDir, "layout.xml");
        const stylePath = path.join(fullScreenDir, "styles.css");

        const hasLayout = await fs.pathExists(layoutPath);
        const hasStyles = await fs.pathExists(stylePath);

        if (!hasLayout || !hasStyles) {
            continue;
        }

        const xmlSource = await fs.readFile(layoutPath, "utf8");
        const cssSource = await fs.readFile(stylePath, "utf8");

        const plan = compileUiLayout({
            screen: screenName,
            xmlSource,
            cssSource,
            strictCss: true
        });

        const outputFileName = `${screenName}.ui.json`;
        const outputPath = path.join(outputDir, outputFileName);

        await fs.writeJson(outputPath, plan, { spaces: 4 });

        artifacts.push({
            screen: screenName,
            file: outputFileName,
            hash: plan.hash,
            xmlHash: `sha256:${createContentHash(xmlSource)}`,
            cssHash: `sha256:${createContentHash(cssSource)}`,
            nodeCount: plan.nodeCount
        });
    }

    await fs.writeJson(path.join(outputDir, "manifest.json"), {
        engineVersion: UI_LAYOUT_ENGINE_VERSION,
        generatedAt: new Date().toISOString(),
        artifacts
    }, { spaces: 4 });

    return artifacts;
}
