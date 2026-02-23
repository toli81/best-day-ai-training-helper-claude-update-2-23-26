/**
 * One-time migration from localStorage/IndexedDB to Firestore/GCS.
 * Runs when a trainer signs in for the first time and local data is detected.
 */
import { saveSession, ensureClient } from './firestoreService';
import { enqueue as enqueueSyncTask } from './syncService';
import { getVideo, getAllSessionIds } from './storageService';
import type { TrainingSession } from '../types';

export interface MigrationStatus {
  total: number;
  done: number;
  current: string;
  failed: string[];
}

export function hasLocalData(): boolean {
  return !!localStorage.getItem('bt_sessions');
}

export function getLocalSessionCount(): number {
  try {
    const raw = localStorage.getItem('bt_sessions');
    if (!raw) return 0;
    const parsed: TrainingSession[] = JSON.parse(raw);
    return parsed.length;
  } catch {
    return 0;
  }
}

/**
 * Migrate all local sessions to Firestore and queue their videos for GCS upload.
 * Reports progress via onProgress callback.
 */
export async function migrateLocalData(
  trainerId: string,
  onProgress: (status: MigrationStatus) => void
): Promise<MigrationStatus> {
  const failed: string[] = [];

  let sessions: TrainingSession[] = [];
  try {
    const raw = localStorage.getItem('bt_sessions');
    if (raw) sessions = JSON.parse(raw);
  } catch {
    return { total: 0, done: 0, current: '', failed };
  }

  if (sessions.length === 0) {
    return { total: 0, done: 0, current: '', failed };
  }

  const total = sessions.length;

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    onProgress({ total, done: i, current: session.clientName, failed });

    try {
      // Stamp trainerId
      const migrated: TrainingSession = { ...session, trainerId, syncStatus: 'local' };

      // Save metadata to Firestore
      await saveSession(trainerId, migrated);
      await ensureClient(trainerId, session.clientName);

      // Check if video blob exists locally; if so, queue for GCS upload
      const blob = await getVideo(session.id).catch(() => null);
      if (blob) {
        await enqueueSyncTask(trainerId, session.id, session.id);
      }
    } catch (err) {
      console.error(`Migration failed for session ${session.id}:`, err);
      failed.push(session.id);
    }
  }

  const result: MigrationStatus = { total, done: total, current: 'Complete', failed };
  onProgress(result);
  return result;
}

/** Clear localStorage session data after confirmed migration */
export function clearLocalSessionData(): void {
  localStorage.removeItem('bt_sessions');
}
