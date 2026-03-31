function createQuickLoadHandler({
    readSavedGames = async () => [],
    dispatchLoad = () => {},
    onError = () => {}
} = {}) {
    let isQuickLoadInProgress = false;

    return async function loadLatestSnapshot() {
        if (isQuickLoadInProgress) {
            return false;
        }

        isQuickLoadInProgress = true;

        try {
            const games = await readSavedGames();
            if (!Array.isArray(games) || games.length === 0) {
                return false;
            }

            const latest = [...games].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
            dispatchLoad({ ...latest });
            return true;
        } catch (error) {
            onError(error);
            return false;
        } finally {
            isQuickLoadInProgress = false;
        }
    };
}

export { createQuickLoadHandler };
export default { createQuickLoadHandler };