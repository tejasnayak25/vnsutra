function buildLoadEventSignature(detail = {}) {
    const scene = typeof detail.scene === "string" ? detail.scene : "";
    const timestamp = detail.timestamp ?? "";
    const id = detail.id ?? "";
    const instruction = detail?.state?.instruction_count ?? "";
    const autosave = detail?.isAutosave === true ? "1" : "0";
    return `${scene}|${timestamp}|${id}|${instruction}|${autosave}`;
}

function buildSceneStartSignature(sceneName, state = {}) {
    const scene = typeof sceneName === "string" ? sceneName.trim() : "";
    const instruction = state?.instruction_count ?? "";
    const checkpoint = state?.checkpoint ?? "";
    return `${scene}|${instruction}|${checkpoint}`;
}

function isRapidDuplicate({ signature, lastSignature, lastAt = 0, now = Date.now(), windowMs = 250 } = {}) {
    if (!signature) {
        return false;
    }

    return signature === lastSignature && (now - lastAt) < windowMs;
}

export { buildLoadEventSignature, buildSceneStartSignature, isRapidDuplicate };
export default { buildLoadEventSignature, buildSceneStartSignature, isRapidDuplicate };
