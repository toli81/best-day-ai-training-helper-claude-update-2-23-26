"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToLibrary = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/** Tokenize text into lowercase search terms including partial prefixes */
function buildSearchTerms(name, tags) {
    const nameTokens = name.toLowerCase().split(/\s+/).filter(Boolean);
    const tagTokens = tags.map(t => t.toLowerCase());
    // Add prefix tokens for partial matching (e.g. "squ" matches "squat")
    const prefixes = [];
    nameTokens.forEach(token => {
        for (let i = 2; i <= token.length; i++) {
            prefixes.push(token.substring(0, i));
        }
    });
    return Array.from(new Set([...nameTokens, ...tagTokens, ...prefixes]));
}
exports.addToLibrary = functions.https.onCall(async (data, context) => {
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
    const session = sessionSnap.data();
    if (session.trainerId !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'Not your session');
    }
    // Find the exercise within the session
    const exercise = session.analysis?.exercises?.find((e) => e.id === exerciseId);
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
        tagsLower: exercise.tags.map((t) => t.toLowerCase()),
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
//# sourceMappingURL=addToLibrary.js.map