/**
 * Origin Private File System (OPFS) Utilities
 * Handles saving and reading local files (images, pdfs) without a backend.
 */

/**
 * Save a File to OPFS
 * @param {File} file 
 * @param {string} prefix - Optional folder prefix
 * @returns {Promise<string>} The relative path to the saved file
 */
export async function saveFileToOPFS(file, prefix = 'uploads') {
  if (!navigator.storage || !navigator.storage.getDirectory) {
    throw new Error('OPFS is not supported in this browser/mode.');
  }

  const root = await navigator.storage.getDirectory();
  
  // Try to create directory
  let dirHandle = root;
  try {
    dirHandle = await root.getDirectoryHandle(prefix, { create: true });
  } catch (e) {
    console.warn('Could not create directory, using root');
  }

  const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  
  // Write the file
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();

  return `${prefix}/${filename}`;
}

/**
 * Get an object URL for a file stored in OPFS
 * @param {string} path - The path returned by saveFileToOPFS
 * @returns {Promise<string>} Blob URL (needs to be revoked when done)
 */
export async function getFileUrlFromOPFS(path) {
  if (!path || !navigator.storage || !navigator.storage.getDirectory) {
    return null;
  }

  const parts = path.split('/');
  const root = await navigator.storage.getDirectory();
  
  try {
    let currentHandle = root;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    
    const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch (err) {
    console.error('Failed to read file from OPFS:', err);
    return null;
  }
}
