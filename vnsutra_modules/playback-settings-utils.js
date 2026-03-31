function parseStoredBoolean(value, fallback = false) {
    if (value === null || value === undefined) {
        return fallback;
    }

    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
            return true;
        }
        if (normalized === "false") {
            return false;
        }
    }

    return fallback;
}

function parseStoredDelay(value, min, max, fallback) {
    if (value === null || value === undefined) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, parsed));
}

export { parseStoredBoolean, parseStoredDelay };
export default { parseStoredBoolean, parseStoredDelay };
