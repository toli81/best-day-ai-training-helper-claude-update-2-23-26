
// This service is deprecated. The application now runs in local-only mode using IndexedDB.
export const isCloudReady = () => false;
export async function uploadVideoToCloud() { return ""; }
export async function downloadVideoFromCloud() { return new Blob(); }
export async function saveManifestToCloud() {}
export async function getManifestFromCloud() { return []; }
export function getPublicUrl() { return ""; }
