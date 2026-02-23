import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureTrainerProfile(result.user);
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function registerWithEmail(email: string, password: string, displayName: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });
  await ensureTrainerProfile(result.user);
  return result.user;
}

export async function logOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

async function ensureTrainerProfile(user: User): Promise<void> {
  const trainerRef = doc(db, 'trainers', user.uid);
  const snap = await getDoc(trainerRef);
  if (!snap.exists()) {
    await setDoc(trainerRef, {
      displayName: user.displayName || 'Trainer',
      email: user.email,
      photoURL: user.photoURL || null,
      createdAt: new Date().toISOString(),
      settings: {
        defaultMode: 'clip',
        autoSyncEnabled: true,
      },
    });
  }
}
