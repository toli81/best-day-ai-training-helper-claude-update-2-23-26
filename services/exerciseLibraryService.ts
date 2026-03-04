import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from './firebaseConfig';
import type { LibraryExercise } from '../types';

const functions = getFunctions(app);

// --- Search ---

/**
 * Search the shared exercise library.
 * Uses pre-computed searchTerms array for Firestore-native keyword search.
 * For multi-word queries, the first token is used for the Firestore query,
 * then remaining tokens filter client-side.
 */
export async function searchLibrary(searchQuery: string, tagFilter?: string): Promise<LibraryExercise[]> {
  const colRef = collection(db, 'exerciseLibrary');
  const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

  let q;

  if (tokens.length > 0) {
    q = query(
      colRef,
      where('searchTerms', 'array-contains', tokens[0]),
      orderBy('addedAt', 'desc'),
      limit(100)
    );
  } else if (tagFilter) {
    q = query(
      colRef,
      where('tagsLower', 'array-contains', tagFilter.toLowerCase()),
      orderBy('addedAt', 'desc'),
      limit(100)
    );
  } else {
    q = query(colRef, orderBy('addedAt', 'desc'), limit(100));
  }

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map(d => ({ ...(d.data() as Omit<LibraryExercise, 'id'>), id: d.id } as LibraryExercise));

  // Client-side filter for additional tokens (multi-word search)
  if (tokens.length > 1) {
    results = results.filter(ex =>
      tokens.every(token => ex.searchTerms.includes(token))
    );
  }

  // Client-side tag filter
  if (tagFilter) {
    results = results.filter(ex =>
      ex.tagsLower.includes(tagFilter.toLowerCase())
    );
  }

  return results;
}

/** Subscribe to the full library (real-time, latest 200 entries) */
export function subscribeLibrary(
  callback: (exercises: LibraryExercise[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'exerciseLibrary'),
    orderBy('addedAt', 'desc'),
    limit(200)
  );
  return onSnapshot(q, snapshot => {
    const exercises = snapshot.docs.map(d => ({ ...(d.data() as Omit<LibraryExercise, 'id'>), id: d.id } as LibraryExercise));
    callback(exercises);
  });
}

// --- Thumbnail capture ---

/**
 * Capture a single video frame as a base64 JPEG thumbnail.
 * Creates a hidden video element, seeks to the given time, and draws to canvas.
 */
export function captureVideoFrame(videoUrl: string, timeSeconds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Failed to load video for thumbnail'));
    });

    video.addEventListener('loadedmetadata', () => {
      const seekTo = Math.min(timeSeconds, video.duration - 0.1);
      video.currentTime = Math.max(0, seekTo);
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const base64 = dataUrl.split(',')[1];
        cleanup();
        resolve(base64);
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    // Timeout safety
    setTimeout(() => { cleanup(); reject(new Error('Thumbnail capture timed out')); }, 10000);

    video.src = videoUrl;
  });
}

// --- Add to library ---

interface AddToLibraryResult { id: string; alreadyExists: boolean }

export async function addExerciseToLibrary(
  sessionId: string,
  exerciseId: string,
  thumbnailBase64?: string
): Promise<AddToLibraryResult> {
  const fn = httpsCallable<{ sessionId: string; exerciseId: string; thumbnailBase64?: string }, AddToLibraryResult>(
    functions, 'addToLibrary'
  );
  const result = await fn({ sessionId, exerciseId, thumbnailBase64 });
  return result.data;
}

// --- Collect all unique tags from the library ---
export async function getLibraryTags(): Promise<string[]> {
  const q = query(collection(db, 'exerciseLibrary'), orderBy('addedAt', 'desc'), limit(200));
  const snapshot = await getDocs(q);
  const tagSet = new Set<string>();
  snapshot.docs.forEach(d => {
    const data = d.data();
    (data.tags as string[] || []).forEach(t => tagSet.add(t));
  });
  return Array.from(tagSet).sort();
}
