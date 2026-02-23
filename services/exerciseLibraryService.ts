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

// --- Add to library ---

interface AddToLibraryResult { id: string; alreadyExists: boolean }

export async function addExerciseToLibrary(
  sessionId: string,
  exerciseId: string
): Promise<AddToLibraryResult> {
  const fn = httpsCallable<{ sessionId: string; exerciseId: string }, AddToLibraryResult>(
    functions, 'addToLibrary'
  );
  const result = await fn({ sessionId, exerciseId });
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
