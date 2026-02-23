import * as functions from 'firebase-functions';
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'bestday-training-videos';

interface RequestData { path: string }
interface ResponseData { url: string }

export const getSignedUrl = functions.https.onCall(
  async (data: RequestData, context): Promise<ResponseData> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }

    const { path } = data;
    const uid = context.auth.uid;

    // Verify ownership: path must start with trainers/{uid}/ OR be a library clip
    const isOwnContent = path.startsWith(`trainers/${uid}/`);
    const isLibraryClip = path.startsWith('library/clips/');
    if (!isOwnContent && !isLibraryClip) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied to this file');
    }

    const [url] = await storage
      .bucket(BUCKET)
      .file(path)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

    return { url };
  }
);
