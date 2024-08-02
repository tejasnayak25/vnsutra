// Function to open the IndexedDB database
function openDatabase(dbName) {

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        // Event handlers for database creation and upgrade
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create an object store with auto-incrementing key
            const objectStore = db.createObjectStore("DataStore", { keyPath: "key" });

            // You can create indexes for efficient data retrieval
            // objectStore.createIndex("key", "key", { unique: true });
        };

        // Event handlers for successful and failed database opening
        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            reject(`Error opening database: ${event.target.error}`);
        };
    });
}

// Function to check if key exists in the IndexedDB
async function keyExists(db, key) {
    const transaction = db.transaction("DataStore", "readonly");
    const objectStore = transaction.objectStore("DataStore");

    return new Promise((resolve, reject) => {
        const getRequest = objectStore.getKey(key);

        getRequest.onsuccess = () => {
            resolve(getRequest.result !== undefined);
        };

        getRequest.onerror = () => {
            reject("Error checking if key exists");
        };
    });
}

// Function to add data to the IndexedDB
function addData(db, data) {
    return new Promise(async (resolve, reject) => {
        // Add data to the object store
        let exists = await keyExists(db, data['key']);

        let addRequest;

        if(exists) {
            addRequest = await updateData(db, data['key'], data);

            resolve(addRequest);
        } else {
            const transaction = db.transaction("DataStore", "readwrite");
            const objectStore = transaction.objectStore("DataStore");
            
            addRequest = objectStore.add(data);

            addRequest.onsuccess = () => {
                resolve("Data added successfully");
            };
    
            addRequest.onerror = (event) => {
                reject(`Error adding data: ${event.target.error}`);
            };
        }
    });
}

// Function to retrieve data from the IndexedDB
function getData(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("DataStore", "readonly");
        const objectStore = transaction.objectStore("DataStore");

        // Retrieve data using the key
        const getRequest = objectStore.get(id);

        getRequest.onsuccess = (event) => {
            const result = event.target.result;
            resolve(result);
        };

        getRequest.onerror = (event) => {
            reject(`Error getting data: ${event.target.error}`);
        };
    });
}

// Function to update data in the IndexedDB
function updateData(db, id, newData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("DataStore", "readwrite");
        const objectStore = transaction.objectStore("DataStore");

        // Get the existing data first
        const getRequest = objectStore.get(id);

        getRequest.onsuccess = (event) => {
            const existingData = event.target.result;

            if (existingData) {
                // Merge the existing data with the new data
                const updatedData = { ...existingData, ...newData };

                // Delete the existing data using the key
                objectStore.delete(id);

                // Put the updated data back into the object store
                const putRequest = objectStore.put(updatedData);

                putRequest.onsuccess = () => {
                    resolve("Data updated successfully");
                };

                putRequest.onerror = (event) => {
                    reject(`Error updating data: ${event.target.error}`);
                };
            } else {
                reject(`Data with ID ${id} not found`);
            }
        };

        getRequest.onerror = (event) => {
            reject(`Error getting data: ${event.target.error}`);
        };
    });
}

// Function to delete data from the IndexedDB
function deleteData(db, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("DataStore", "readwrite");
        const objectStore = transaction.objectStore("DataStore");

        // Delete data using the key
        const deleteRequest = objectStore.delete(id);

        deleteRequest.onsuccess = () => {
            resolve("Data deleted successfully");
        };

        deleteRequest.onerror = (event) => {
            reject(`Error deleting data: ${event.target.error}`);
        };
    });
}

async function clearData(db) {
    const transaction = db.transaction("DataStore", "readwrite");
    const objectStore = transaction.objectStore("DataStore");
    objectStore.clear();
    return "All data cleared successfully";
}

// Function to get the key at a particular index in the IndexedDB
async function getKeyAt(db, index) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("DataStore", "readonly");
        const objectStore = transaction.objectStore("DataStore");
        const request = objectStore.openCursor();

        let currentIndex = 0;

        request.onsuccess = (event) => {
            const cursor = event.target.result;

            if (cursor) {
                if (currentIndex === index) {
                    // Found the cursor at the desired index
                    resolve(cursor.key);
                } else {
                    // Move to the next item
                    cursor.continue();
                    currentIndex++;
                }
            } else {
                // No cursor found at the specified index
                resolve(null);
            }
        };

        request.onerror = () => {
            reject("Error getting key at index");
        };
    });
}

// Function to get the length of the data in the IndexedDB
async function getDataLength(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("DataStore", "readonly");
        const objectStore = transaction.objectStore("DataStore");
        const request = objectStore.count();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject("Error getting data length");
        };
    });
}