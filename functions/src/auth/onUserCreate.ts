import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const db = admin.firestore();
  const trainerRef = db.collection('trainers').doc(user.uid);

  await trainerRef.set({
    displayName: user.displayName || 'Trainer',
    email: user.email || '',
    photoURL: user.photoURL || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    settings: {
      defaultMode: 'clip',
      autoSyncEnabled: true,
    },
  });
});
