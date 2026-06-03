/**
 * IndexedDB Utilities (Replaces OPFS)
 * Handles saving and reading local files (images, pdfs) without a backend.
 * Rewritten to use IndexedDB because iOS Safari does not support OPFS createWritable in main thread.
 */

const DB_NAME = 'investBrainFiles';
const STORE_NAME = 'files';

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save a File to IndexedDB (keeps OPFS naming for compatibility)
 * @param {File} file 
 * @param {string} prefix - Optional folder prefix
 * @returns {Promise<string>} The relative path to the saved file
 */
export async function saveFileToOPFS(file, prefix = 'uploads') {
  const db = await getDB();
  const filename = `${prefix}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Store the file blob with the filename as key
    const request = store.put(file, filename);
    
    request.onsuccess = () => resolve(filename);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get an object URL for a file stored in IndexedDB (keeps OPFS naming for compatibility)
 * @param {string} path - The path returned by saveFileToOPFS
 * @returns {Promise<string>} Blob URL (needs to be revoked when done)
 */
export async function getFileUrlFromOPFS(path) {
  if (!path) return null;
  
  try {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(path);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(URL.createObjectURL(request.result));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to read file from IndexedDB:', err);
    return null;
  }
}

