import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

interface RequestData {
  sessionId: string;
  exerciseId: string;
}

/** Tokenize text into lowercase search terms including partial prefixes */
function buildSearchTerms(name: string, tags: string[]): string[] {
  const nameTokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  const tagTokens = tags.map(t => t.toLowerCase());

  // Add prefix tokens for partial matching (e.g. "squ" matches "squat")
  const prefixes: string[] = [];
  nameTokens.forEach(token => {
    for (let i = 2; i <= token.length; i++) {
      prefixes.push(token.substring(0, i));
    }
  });

  return Array.from(new Set([...nameTokens, ...tagTokens, ...prefixes]));
}

export const addToLibrary = functions.https.onCall(async (data: RequestData, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = context.auth.uid;
  const { sessionId, exerciseId } = data;

  const db = admin.firestore();

  // Get the session to verify ownership
  const sessionRef = db.collection('trainers').doc(uid).collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Session not found');
  }

  const session = sessionSnap.data()!;

  if (session.trainerId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your session');
  }

  // Find the exercise within the session
  const exercise = session.analysis?.exercises?.find((e: any) => e.id === exerciseId);
  if (!exercise) {
    throw new functions.https.HttpsError('not-found', 'Exercise not found in session');
  }

  // Get trainer profile for denormalized name
  const trainerSnap = await db.collection('trainers').doc(uid).get();
  const trainerName = trainerSnap.data()?.displayName || 'Unknown Trainer';

  // Build searchable library entry
  const libraryId = `lib-${sessionId}-${exerciseId}`;
  const libraryRef = db.collection('exerciseLibrary').doc(libraryId);

  // Check if already in library
  const existing = await libraryRef.get();
  if (existing.exists) {
    return { id: libraryId, alreadyExists: true };
  }

  const searchTerms = buildSearchTerms(exercise.name, exercise.tags);

  await libraryRef.set({
    id: libraryId,
    name: exercise.name,
    nameLower: exercise.name.toLowerCase(),
    reps: exercise.reps,
    weight: exercise.weight || null,
    duration: exercise.duration || null,
    cues: exercise.cues,
    tags: exercise.tags,
    tagsLower: exercise.tags.map((t: string) => t.toLowerCase()),
    startTime: exercise.startTime,
    endTime: exercise.endTime,
    sourceSessionId: sessionId,
    sourceTrainerId: uid,
    sourceTrainerName: trainerName,
    clientName: session.clientName,
    sessionDate: session.date,
    clipPath: null,
    clipUrl: null,
    videoPath: session.videoPath || null,
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
    addedBy: uid,
    searchTerms,
  });

  return { id: libraryId, alreadyExists: false };
});
