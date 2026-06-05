import { db } from '../db/database';

const DB_NAME = 'invest_brain_redundancy';
const STORE_NAME = 'sqlite_backups';
const BACKUP_KEY = 'latest';

/**
 * Open the backup IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function openBackupDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e) => {
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      reject(new Error(`Failed to open backup IndexedDB: ${e.target.error}`));
    };
  });
}

/**
 * Automatically trigger SQLite export and save to IndexedDB
 */
export async function triggerAutoBackup() {
  try {
    const exportResult = await db.exportDB();
    if (!exportResult || !exportResult.success) {
      console.warn('[AutoBackup] DB export was not successful:', exportResult);
      return;
    }

    const idb = await openBackupDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const backupObject = {
        timestamp: Date.now(),
        format: exportResult.format || 'binary',
        data: exportResult.data, // ArrayBuffer/Uint8Array or JSON string
      };

      const putRequest = store.put(backupObject, BACKUP_KEY);

      putRequest.onsuccess = () => {
        const timeStr = new Date().toISOString();
        localStorage.setItem('ib_last_autobackup_time', timeStr);
        console.log(`[AutoBackup] Database backed up to IndexedDB at ${timeStr}`);
        resolve();
      };

      putRequest.onerror = (e) => {
        reject(new Error(`Failed to save backup to IndexedDB: ${e.target.error}`));
      };
    });
  } catch (err) {
    console.error('[AutoBackup] Automatic backup failed:', err);
  }
}

/**
 * Restore SQLite database from the latest IndexedDB backup
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function restoreAutoBackup() {
  try {
    const idb = await openBackupDB();
    const backupObject = await new Promise((resolve, reject) => {
      const transaction = idb.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(BACKUP_KEY);

      getRequest.onsuccess = () => {
        resolve(getRequest.result);
      };

      getRequest.onerror = (e) => {
        reject(new Error(`Failed to read backup from IndexedDB: ${e.target.error}`));
      };
    });

    if (!backupObject || !backupObject.data) {
      throw new Error('未找到任何自动备份数据。');
    }

    // Import database from backup
    const importResult = await db.importDB(backupObject.data);
    if (!importResult || !importResult.success) {
      throw new Error(importResult ? importResult.error : '导入备份数据库失败');
    }

    console.log('[AutoBackup] Database restored from IndexedDB successfully');
    return {
      success: true,
      message: `成功恢复至 ${new Date(backupObject.timestamp).toLocaleString()} 的备份数据`,
    };
  } catch (err) {
    console.error('[AutoBackup] Database restore failed:', err);
    throw err;
  }
}

/**
 * Check if a backup exists in IndexedDB
 * @returns {Promise<{exists: boolean, timestamp: number|null}>}
 */
export async function hasBackup() {
  try {
    const idb = await openBackupDB();
    const backupObject = await new Promise((resolve, reject) => {
      const transaction = idb.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(BACKUP_KEY);

      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = (e) => reject(e.target.error);
    });

    if (backupObject && backupObject.data) {
      return { exists: true, timestamp: backupObject.timestamp || null };
    }
    return { exists: false, timestamp: null };
  } catch (err) {
    console.warn('[AutoBackup] hasBackup check failed:', err);
    return { exists: false, timestamp: null };
  }
}

