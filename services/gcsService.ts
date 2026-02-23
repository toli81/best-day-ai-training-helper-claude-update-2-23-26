import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebaseConfig';

const functions = getFunctions(app);

// --- Signed URL for download ---

interface SignedUrlRequest { path: string }
interface SignedUrlResponse { url: string }

export async function getSignedDownloadUrl(gcsPath: string): Promise<string> {
  const fn = httpsCallable<SignedUrlRequest, SignedUrlResponse>(functions, 'getSignedUrl');
  const result = await fn({ path: gcsPath });
  return result.data.url;
}

// --- Resumable upload to GCS ---

interface UploadUrlRequest { path: string; contentType: string }
interface UploadUrlResponse { uploadUri: string }

export async function getResumableUploadUri(gcsPath: string, contentType: string): Promise<string> {
  const fn = httpsCallable<UploadUrlRequest, UploadUrlResponse>(functions, 'getUploadUrl');
  const result = await fn({ path: gcsPath, contentType });
  return result.data.uploadUri;
}

/**
 * Upload a Blob to GCS using a resumable upload URI.
 * Reports progress as 0–100 via onProgress callback.
 * Retryable: caller can retry on network failure.
 */
export async function uploadBlobResumable(
  uploadUri: string,
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<void> {
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
  const totalSize = blob.size;
  let offset = 0;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = blob.slice(offset, end);

    const response = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
        'Content-Type': blob.type || 'video/webm',
      },
      body: chunk,
    });

    // 308 = Resume Incomplete (more chunks needed)
    // 200/201 = Upload complete
    if (!response.ok && response.status !== 308) {
      throw new Error(`GCS upload failed at chunk ${offset}-${end}: ${response.status} ${response.statusText}`);
    }

    offset = end;
    onProgress?.(Math.round((offset / totalSize) * 100));
  }
}

/**
 * Full upload flow: request upload URI then stream the blob.
 */
export async function uploadVideoToGcs(
  trainerId: string,
  sessionId: string,
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const gcsPath = `trainers/${trainerId}/sessions/${sessionId}/recording.${ext}`;
  const uploadUri = await getResumableUploadUri(gcsPath, blob.type || 'video/webm');
  await uploadBlobResumable(uploadUri, blob, onProgress);
  return gcsPath;
}
