function registerAbortHandler(setAbortInstruction, onAbort = () => {}) {
    if (typeof setAbortInstruction !== "function") {
        return () => {};
    }

    let active = true;

    const clear = () => {
        if (!active) {
            return;
        }
        active = false;
        setAbortInstruction(() => {});
    };

    setAbortInstruction(() => {
        if (!active) {
            return;
        }
        clear();
        onAbort();
    });

    return clear;
}

function rejectWithAbortCleanup({
    cleanup = () => {},
    closeAlert = () => {},
    setInputFocused = () => {},
    reject = () => {},
    errorMessage = "Operation aborted"
} = {}) {
    cleanup();
    closeAlert();
    setInputFocused(false);
    reject(new Error(errorMessage));
}

export { registerAbortHandler, rejectWithAbortCleanup };
export default { registerAbortHandler, rejectWithAbortCleanup };
