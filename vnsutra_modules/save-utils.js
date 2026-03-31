function mergeLoadEntries(savedGames = [], autosaveData = null, { includeAutosave = true } = {}) {
    const regularSaves = Array.isArray(savedGames) ? [...savedGames] : [];

    if (!includeAutosave || !autosaveData) {
        return regularSaves;
    }

    return [{ ...autosaveData, isAutosave: true }, ...regularSaves];
}

function toPersistedSaves(entries = []) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries.filter((item) => item && !item.isAutosave);
}

function cloneStateForSave(state = {}) {
    if (typeof globalThis.structuredClone === "function") {
        return globalThis.structuredClone(state);
    }

    try {
        return JSON.parse(JSON.stringify(state));
    } catch {
        return {};
    }
}

function buildSavedGameEntry({ id, scene = null, src = "", state = {}, instructionCount = 0, timestamp = id, chapterId = null } = {}) {
    const snapshotState = cloneStateForSave(state ?? {});
    snapshotState.instruction_count = instructionCount;

    return {
        id,
        scene,
        chapterId,
        timestamp,
        src,
        state: snapshotState
    };
}

function toAutosavePayload(entry = {}) {
    if (!entry || typeof entry !== "object") {
        return {
            scene: null,
            chapterId: null,
            timestamp: null,
            src: null,
            state: {}
        };
    }

    const { scene = null, chapterId = null, timestamp = null, src = null, state = {} } = entry;

    return {
        scene,
        chapterId,
        timestamp,
        src,
        state
    };
}

export { mergeLoadEntries, toPersistedSaves, cloneStateForSave, buildSavedGameEntry, toAutosavePayload };
export default { mergeLoadEntries, toPersistedSaves, cloneStateForSave, buildSavedGameEntry, toAutosavePayload };
