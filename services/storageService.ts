
const DB_NAME = 'BestDayTrainingDB';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

function deleteDB(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // resolve anyway so we can attempt a fresh open
    req.onblocked = () => resolve();
  });
}

function openDBInternal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function initDB(): Promise<IDBDatabase> {
  try {
    return await openDBInternal();
  } catch (err: any) {
    if (err?.name === 'VersionError') {
      // Stored DB is at a higher version than requested (leftover from a previous build).
      // Safe to wipe it — local blobs are just a cache; the source of truth is GCS/Firestore.
      console.warn('[IndexedDB] Version mismatch — deleting stale database and recreating at v1.');
      await deleteDB();
      return openDBInternal();
    }
    throw new Error(err?.message || 'Failed to open IndexedDB');
  }
}

export async function saveVideo(id: string, blob: Blob): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message || 'Failed to save video to IndexedDB'));
  });
}

export async function getVideo(id: string): Promise<Blob | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error(request.error?.message || 'Failed to get video from IndexedDB'));
  });
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message || 'Failed to delete video from IndexedDB'));
  });
}

export async function getAllSessionIds(): Promise<string[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(new Error(request.error?.message || 'Failed to get session IDs from IndexedDB'));
  });
}
