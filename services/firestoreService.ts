import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { TrainingSession, Client } from '../types';

// --- Sessions ---

function sessionsRef(trainerId: string) {
  return collection(db, 'trainers', trainerId, 'sessions');
}

/** Strip non-serializable fields before writing to Firestore */
function stripSession(session: TrainingSession): Record<string, any> {
  const { videoUrl, videoBlob, ...rest } = session;
  return rest;
}

export async function saveSession(trainerId: string, session: TrainingSession): Promise<void> {
  const ref = doc(db, 'trainers', trainerId, 'sessions', session.id);
  await setDoc(ref, stripSession(session));
}

export async function updateSession(
  trainerId: string,
  sessionId: string,
  data: Partial<TrainingSession>
): Promise<void> {
  const ref = doc(db, 'trainers', trainerId, 'sessions', sessionId);
  const { videoUrl, videoBlob, ...safe } = data;
  await updateDoc(ref, safe);
}

export async function deleteSession(trainerId: string, sessionId: string): Promise<void> {
  const ref = doc(db, 'trainers', trainerId, 'sessions', sessionId);
  await deleteDoc(ref);
}

export function subscribeSessions(
  trainerId: string,
  callback: (sessions: TrainingSession[]) => void
): Unsubscribe {
  const q = query(sessionsRef(trainerId), orderBy('date', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((d) => ({
      ...d.data(),
      id: d.id,
    })) as TrainingSession[];
    callback(sessions);
  });
}

// --- Clients ---

function clientsRef(trainerId: string) {
  return collection(db, 'trainers', trainerId, 'clients');
}

export async function saveClient(trainerId: string, client: Client): Promise<void> {
  const ref = doc(db, 'trainers', trainerId, 'clients', client.id);
  await setDoc(ref, client);
}

export async function getClients(trainerId: string): Promise<Client[]> {
  const q = query(clientsRef(trainerId), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Client));
}

export async function deleteClient(trainerId: string, clientId: string): Promise<void> {
  const ref = doc(db, 'trainers', trainerId, 'clients', clientId);
  await deleteDoc(ref);
}

/** Ensure a client record exists for a given name. Returns the client ID. */
export async function ensureClient(trainerId: string, clientName: string): Promise<string> {
  const existing = await getClients(trainerId);
  const match = existing.find(
    (c) => c.name.toLowerCase() === clientName.toLowerCase()
  );
  if (match) return match.id;

  const id = `client-${Date.now()}`;
  const newClient: Client = {
    id,
    name: clientName,
    createdAt: new Date().toISOString(),
    notes: '',
    tags: [],
    isActive: true,
    linkedUserId: null,
    email: null,
  };
  await saveClient(trainerId, newClient);
  return id;
}
