import { useCallback, useEffect, useState } from 'react';
import type { TrainingSession } from '../types';
import { subscribeSessions } from '../services/firestoreService';
import { getVideo } from '../services/storageService';

/**
 * Real-time listener for the current trainer's sessions in Firestore.
 * Hydrates each session with a local video object URL if available in IndexedDB.
 */
export function useFirestoreSessions(trainerId: string | undefined) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!trainerId) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeSessions(
      trainerId,
      async (firestoreSessions) => {
        // Hydrate with local video blobs from IndexedDB
        const hydrated = await Promise.all(
          firestoreSessions.map(async (session) => {
            try {
              const blob = await getVideo(session.id);
              if (blob) {
                return { ...session, videoUrl: URL.createObjectURL(blob) };
              }
            } catch {
              // Video not in local cache -- that's fine, will use signed URL later
            }
            return session;
          })
        );
        setSessions(hydrated);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useFirestoreSessions] Subscription error:', err);
        setError(err.message || 'Failed to load sessions');
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [trainerId, retryCount]);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  return { sessions, loading, error, retry };
}
