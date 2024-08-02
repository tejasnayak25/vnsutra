let dataStore = undefined, story_db = undefined;

loadJSON("../game/config.json").then(async (CONFIG) => {
    const db = await openDatabase(CONFIG['project-name']);
    story_db = await openDatabase(`${CONFIG['project-name']}_story`);

    // Exported localStorage-like object
    const myLocalStorage = {
        setItem: (key, value) => addData(db, { key, value }),
        getItem: async (key) => {
            const data = await getData(db, key);
            return data ? data.value : null;
        },
        removeItem: (key) => deleteData(db, key),
        clear: () => clearData(db),
        key: (index) => getKeyAt(db, index),
        get length() {
            return getDataLength(db);
        },
    };
    
    
    dataStore = myLocalStorage;
});