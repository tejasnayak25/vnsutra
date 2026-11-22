/**
 * Parse inline kinetic dialogue tags:
 * - `{w=0.4}` or `{wait=0.4}`: Pause typewriter at current position (seconds)
 * - `{speed=2}...{/speed}`: Speed multiplier within range
 * - `{shake}...{/shake}`: Shakes text/message while typing this segment
 * - `{shake=screen}` or `{shake:screen}`: Triggers camera screen shake
 * - `{hop}` or `{hop=150}`: Triggers active speaker hop animation
 * - `{fx=blush}`: Triggers speaker procedural expression overlay (`blush`, `sweat`, `sparkles`, `anger_vein`)
 * - `{mood=surprised}`: Switches speaker mood/expression mid-dialogue
 *
 * @param {string} rawText
 * @param {{ naturalPunctuation?: boolean }} [options]
 * @returns {{
 *   plainText: string,
 *   pauses: Map<number, number>,
 *   speeds: Array<{ start: number, end: number, mult: number }>,
 *   shakes: Array<{ start: number, end: number }>,
 *   actions: Map<number, Array<{ type: string, [key: string]: any }>>
 * }}
 */
function parseKineticDialogue(rawText = "", { naturalPunctuation = true } = {}) {
    const src = String(rawText ?? "");
    const pauses = new Map();
    const speeds = [];
    const shakes = [];
    const styles = [];
    const actions = new Map();
    let plainText = "";

    const addAction = (idx, act) => {
        if (!actions.has(idx)) {
            actions.set(idx, []);
        }
        actions.get(idx).push(act);
    };

    const speedStack = [];
    const styleStack = [];
    let shakeStart = null;
    const tagRegex = /\{(w=[0-9.]+|wait=[0-9.]+|speed=[0-9.]+|\/speed|shake(?::screen|=screen)?|\/shake|hop(?:=[0-9]+)?|\/hop|fx=[a-zA-Z0-9_,]+|mood=[a-zA-Z0-9_-]+|b|\/b|i|\/i|u|\/u|color=[^}]+|\/color|size=[0-9.]+|\/size)\}/gi;
    let lastIdx = 0;
    let match;

    while ((match = tagRegex.exec(src)) !== null) {
        if (match.index > lastIdx) {
            plainText += src.slice(lastIdx, match.index);
        }
        const tag = match[1].toLowerCase();
        if (tag === "/hop") {
            // Self-closing / paired tag convenience; no-op on closing tag
        } else if (tag.startsWith("w=") || tag.startsWith("wait=")) {
            const val = tag.startsWith("w=") ? tag.slice(2) : tag.slice(5);
            const sec = Math.max(0, Number(val) || 0);
            if (sec > 0) {
                pauses.set(plainText.length, (pauses.get(plainText.length) || 0) + Math.round(sec * 1000));
            }
        } else if (tag.startsWith("speed=")) {
            const mult = Math.min(8, Math.max(0.15, Number(tag.slice(6)) || 1));
            speedStack.push({ start: plainText.length, mult });
        } else if (tag === "/speed" && speedStack.length > 0) {
            const open = speedStack.pop();
            speeds.push({ start: open.start, end: plainText.length, mult: open.mult });
        } else if (tag === "b") {
            styleStack.push({ type: "b", start: plainText.length });
        } else if (tag === "/b") {
            const idx = styleStack.findLastIndex?.((s) => s.type === "b") ?? -1;
            if (idx !== -1) {
                const [open] = styleStack.splice(idx, 1);
                styles.push({ start: open.start, end: plainText.length, bold: true });
            }
        } else if (tag === "i") {
            styleStack.push({ type: "i", start: plainText.length });
        } else if (tag === "/i") {
            const idx = styleStack.findLastIndex?.((s) => s.type === "i") ?? -1;
            if (idx !== -1) {
                const [open] = styleStack.splice(idx, 1);
                styles.push({ start: open.start, end: plainText.length, italic: true });
            }
        } else if (tag === "u") {
            styleStack.push({ type: "u", start: plainText.length });
        } else if (tag === "/u") {
            const idx = styleStack.findLastIndex?.((s) => s.type === "u") ?? -1;
            if (idx !== -1) {
                const [open] = styleStack.splice(idx, 1);
                styles.push({ start: open.start, end: plainText.length, underline: true });
            }
        } else if (tag.startsWith("color=")) {
            const color = match[1].slice(6).trim();
            styleStack.push({ type: "color", start: plainText.length, color });
        } else if (tag === "/color") {
            const idx = styleStack.findLastIndex?.((s) => s.type === "color") ?? -1;
            if (idx !== -1) {
                const [open] = styleStack.splice(idx, 1);
                styles.push({ start: open.start, end: plainText.length, color: open.color });
            }
        } else if (tag.startsWith("size=")) {
            const size = Number(tag.slice(5)) || 1;
            styleStack.push({ type: "size", start: plainText.length, size });
        } else if (tag === "/size") {
            const idx = styleStack.findLastIndex?.((s) => s.type === "size") ?? -1;
            if (idx !== -1) {
                const [open] = styleStack.splice(idx, 1);
                styles.push({ start: open.start, end: plainText.length, size: open.size });
            }
        } else if (tag === "shake" && shakeStart === null) {
            shakeStart = plainText.length;
        } else if (tag === "/shake" && shakeStart !== null) {
            shakes.push({ start: shakeStart, end: plainText.length });
            shakeStart = null;
        } else if (tag === "shake:screen" || tag === "shake=screen") {
            addAction(plainText.length, { type: "screenShake", intensity: 10, duration: 0.35 });
        } else if (tag.startsWith("hop")) {
            const str = tag.includes("=") ? Number(tag.split("=")[1]) || 210 : 210;
            addAction(plainText.length, { type: "hop", strength: str });
        } else if (tag.startsWith("fx=")) {
            const list = tag.slice(3).split(",").map((s) => s.trim()).filter(Boolean);
            addAction(plainText.length, { type: "fx", fxList: list });
        } else if (tag.startsWith("mood=")) {
            const mood = tag.slice(5).trim();
            addAction(plainText.length, { type: "mood", mood });
        }
        lastIdx = tagRegex.lastIndex;
    }

    if (lastIdx < src.length) {
        plainText += src.slice(lastIdx);
    }
    while (speedStack.length > 0) {
        const open = speedStack.pop();
        speeds.push({ start: open.start, end: plainText.length, mult: open.mult });
    }
    while (styleStack.length > 0) {
        const open = styleStack.pop();
        if (open.type === "b") styles.push({ start: open.start, end: plainText.length, bold: true });
        else if (open.type === "i") styles.push({ start: open.start, end: plainText.length, italic: true });
        else if (open.type === "u") styles.push({ start: open.start, end: plainText.length, underline: true });
        else if (open.type === "color") styles.push({ start: open.start, end: plainText.length, color: open.color });
        else if (open.type === "size") styles.push({ start: open.start, end: plainText.length, size: open.size });
    }
    if (shakeStart !== null) {
        shakes.push({ start: shakeStart, end: plainText.length });
    }

    if (naturalPunctuation) {
        for (let i = 0; i < plainText.length; i++) {
            if (plainText.slice(i, i + 3) === "...") {
                if (!pauses.has(i + 3)) {
                    pauses.set(i + 3, 240);
                }
                i += 2;
                continue;
            }
            if (plainText[i] === "…") {
                if (!pauses.has(i + 1)) {
                    pauses.set(i + 1, 240);
                }
                continue;
            }
            if (plainText[i] === "!" || plainText[i] === "?") {
                let j = i;
                while (j < plainText.length && (plainText[j] === "!" || plainText[j] === "?")) {
                    j++;
                }
                if (!pauses.has(j)) {
                    pauses.set(j, 170);
                }
                i = j - 1;
                continue;
            }
            if (plainText[i] === "," || plainText[i] === ";") {
                if (i + 1 >= plainText.length || /\s/.test(plainText[i + 1])) {
                    if (!pauses.has(i + 1)) {
                        pauses.set(i + 1, 80);
                    }
                }
                continue;
            }
            if (plainText[i] === ".") {
                const isDecimal = i > 0 && i + 1 < plainText.length && /\d/.test(plainText[i - 1]) && /\d/.test(plainText[i + 1]);
                const isEllipsis = (i + 1 < plainText.length && plainText[i + 1] === ".") || (i > 0 && plainText[i - 1] === ".");
                if (!isDecimal && !isEllipsis) {
                    if (i + 1 >= plainText.length || /\s/.test(plainText[i + 1])) {
                        if (!pauses.has(i + 1)) {
                            pauses.set(i + 1, 140);
                        }
                    }
                }
            }
        }
    }

    return { plainText, pauses, speeds, shakes, styles, actions };
}

/**
 * Compute speed multiplier, shake state, and triggered actions at character index `idx`.
 * @param {{
 *   speeds: Array<{ start: number, end: number, mult: number }>,
 *   shakes: Array<{ start: number, end: number }>,
 *   actions?: Map<number, Array<{ type: string, [key: string]: any }>>
 * }} parsed
 * @param {number} idx
 * @returns {{ speedMult: number, isShaking: boolean, actions: Array<{ type: string, [key: string]: any }> }}
 */
function evalKineticAt(parsed, idx) {
    let speedMult = 1;
    if (parsed?.speeds) {
        for (const seg of parsed.speeds) {
            if (idx >= seg.start && idx < seg.end) {
                speedMult = seg.mult;
            }
        }
    }
    let isShaking = false;
    if (parsed?.shakes) {
        for (const seg of parsed.shakes) {
            if (idx >= seg.start && idx < seg.end) {
                isShaking = true;
                break;
            }
        }
    }
    const acts = (parsed?.actions?.get?.(idx) || []).slice();
    return { speedMult, isShaking, actions: acts };
}

export { parseKineticDialogue, evalKineticAt };
