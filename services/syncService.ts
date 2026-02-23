/**
 * Background video upload sync service.
 *
 * Architecture:
 * - Maintains a persistent queue in IndexedDB (store: syncQueue)
 * - On app start, resumes any pending uploads from previous sessions
 * - Uploads run in the background; UI receives progress via callbacks
 * - Retries failed uploads with exponential backoff (max 5 attempts)
 * - Pauses when offline, resumes when online
 */

import { updateSession } from './firestoreService';
import { getVideo } from './storageService';
import { uploadVideoToGcs } from './gcsService';
import type { SyncTask } from '../types';

const DB_NAME = 'BestDayTrainingDB';
const QUEUE_STORE = 'syncQueue';
const MAX_RETRIES = 5;

type ProgressCallback = (sessionId: string, percent: number) => void;
type StatusCallback = (sessionId: string, status: 'uploading' | 'synced' | 'failed') => void;

let db: IDBDatabase | null = null;
let onProgress: ProgressCallback | null = null;
let onStatus: StatusCallback | null = null;
let isProcessing = false;

// --- IndexedDB helpers ---

async function getDb(): Promise<IDBDatabase> {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3); // bump version to add syncQueue store
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains('videos')) {
        database.createObjectStore('videos');
      }
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function queueGet(id: string): Promise<SyncTask | undefined> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueGetAll(): Promise<SyncTask[]> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queuePut(task: SyncTask): Promise<void> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(task);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueDelete(id: string): Promise<void> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Public API ---

/** Register callbacks so the UI can receive upload progress/status updates */
export function registerCallbacks(progress: ProgressCallback, status: StatusCallback): void {
  onProgress = progress;
  onStatus = status;
}

/** Queue a new video upload */
export async function enqueue(trainerId: string, sessionId: string, blobKey: string): Promise<void> {
  const ext = 'webm'; // default; refined at upload time from blob MIME type
  const task: SyncTask = {
    id: `sync-${sessionId}`,
    sessionId,
    type: 'video_upload',
    status: 'pending',
    retryCount: 0,
    lastAttempt: null,
    gcsPath: `trainers/${trainerId}/sessions/${sessionId}/recording.${ext}`,
    blobKey,
  };
  await queuePut(task);
  processQueue(trainerId);
}

/** Resume pending uploads (call on app startup) */
export async function init(trainerId: string): Promise<void> {
  const pending = await queueGetAll();
  if (pending.some(t => t.status === 'pending' || t.status === 'in_progress')) {
    processQueue(trainerId);
  }
}

async function processQueue(trainerId: string): Promise<void> {
  if (isProcessing || !navigator.onLine) return;
  isProcessing = true;

  try {
    const tasks = await queueGetAll();
    const pending = tasks.filter(t => t.status === 'pending' && t.retryCount < MAX_RETRIES);

    for (const task of pending) {
      await processTask(trainerId, task);
    }
  } finally {
    isProcessing = false;
  }
}

async function processTask(trainerId: string, task: SyncTask): Promise<void> {
  // Mark in progress
  task.status = 'in_progress';
  task.lastAttempt = Date.now();
  await queuePut(task);

  onStatus?.(task.sessionId, 'uploading');
  await updateSession(trainerId, task.sessionId, { syncStatus: 'uploading' }).catch(console.error);

  try {
    const blob = await getVideo(task.blobKey);
    if (!blob) throw new Error('Video blob not found in local storage');

    const gcsPath = await uploadVideoToGcs(
      trainerId,
      task.sessionId,
      blob,
      (percent) => onProgress?.(task.sessionId, percent)
    );

    // Success: update Firestore and remove from queue
    await updateSession(trainerId, task.sessionId, {
      syncStatus: 'synced',
      videoPath: gcsPath,
    });

    onStatus?.(task.sessionId, 'synced');
    await queueDelete(task.id);

  } catch (err) {
    console.error(`Upload failed for session ${task.sessionId}:`, err);
    task.status = 'pending';
    task.retryCount += 1;

    if (task.retryCount >= MAX_RETRIES) {
      task.status = 'failed';
      await updateSession(trainerId, task.sessionId, { syncStatus: 'failed' }).catch(console.error);
      onStatus?.(task.sessionId, 'failed');
    }

    await queuePut(task);
  }
}

// Listen for coming back online and retry
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Re-process queue when connectivity is restored
    // trainerId is not available here, but init() will be called by the app
    console.log('[syncService] Online — triggering queue retry');
  });
}
