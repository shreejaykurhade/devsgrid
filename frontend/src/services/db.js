const DB_NAME = 'DevsGridDB';
const STORE_NAME = 'session_store';
const DB_VERSION = 1;

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(`IndexedDB error: ${event.target.errorCode}`);
        };
    });
};

export const saveSession = async (fileBuffer, fileName) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const item = {
            id: 'current_session',
            fileBuffer,
            fileName,
            timestamp: Date.now()
        };
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = () => reject("Failed to save session");
    });
};

export const loadSession = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('current_session');

        request.onsuccess = () => {
            const result = request.result;
            if (!result) {
                resolve(null);
                return;
            }
            // Check expiry (15 mins = 900,000 ms)
            const now = Date.now();
            if (now - result.timestamp > 900000) {
                // Expired
                clearSession(); // Fire and forget clearing
                resolve(null);
            } else {
                resolve(result);
            }
        };

        request.onerror = () => reject("Failed to load session");
    });
};

export const clearSession = async () => {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete('current_session');
};
