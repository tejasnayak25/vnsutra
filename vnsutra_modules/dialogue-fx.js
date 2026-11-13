/**
 * Parse inline kinetic dialogue tags (`{w=0.4}`, `{speed=2}...{/speed}`, `{shake}...{/shake}`)
 * into clean display text and a per-index timeline for typewriter pacing & emphasis.
 * @param {string} rawText
 * @returns {{ plainText: string, pauses: Map<number, number>, speeds: Array<{ start: number, end: number, mult: number }>, shakes: Array<{ start: number, end: number }> }}
 */
function parseKineticDialogue(rawText = "") {
    const src = String(rawText ?? "");
    const pauses = new Map();
    const speeds = [];
    const shakes = [];
    let plainText = "";

    const speedStack = [];
    let shakeStart = null;
    const tagRegex = /\{(w=[0-9.]+|speed=[0-9.]+|\/speed|shake|\/shake)\}/gi;
    let lastIdx = 0;
    let match;

    while ((match = tagRegex.exec(src)) !== null) {
        if (match.index > lastIdx) {
            plainText += src.slice(lastIdx, match.index);
        }
        const tag = match[1].toLowerCase();
        if (tag.startsWith("w=")) {
            const sec = Math.max(0, Number(tag.slice(2)) || 0);
            if (sec > 0) {
                pauses.set(plainText.length, (pauses.get(plainText.length) || 0) + Math.round(sec * 1000));
            }
        } else if (tag.startsWith("speed=")) {
            const mult = Math.min(8, Math.max(0.15, Number(tag.slice(6)) || 1));
            speedStack.push({ start: plainText.length, mult });
        } else if (tag === "/speed" && speedStack.length > 0) {
            const open = speedStack.pop();
            speeds.push({ start: open.start, end: plainText.length, mult: open.mult });
        } else if (tag === "shake" && shakeStart === null) {
            shakeStart = plainText.length;
        } else if (tag === "/shake" && shakeStart !== null) {
            shakes.push({ start: shakeStart, end: plainText.length });
            shakeStart = null;
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
    if (shakeStart !== null) {
        shakes.push({ start: shakeStart, end: plainText.length });
    }

    return { plainText, pauses, speeds, shakes };
}

/**
 * Compute speed multiplier and shake state at character index `idx`.
 * @param {{ speeds: Array<{ start: number, end: number, mult: number }>, shakes: Array<{ start: number, end: number }> }} parsed
 * @param {number} idx
 * @returns {{ speedMult: number, isShaking: boolean }}
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
    return { speedMult, isShaking };
}

export { parseKineticDialogue, evalKineticAt };
