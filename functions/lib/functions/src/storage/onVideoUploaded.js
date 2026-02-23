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
exports.onVideoUploaded = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * GCS object finalize trigger.
 * When a video is fully uploaded to GCS, updates the Firestore session document
 * to mark syncStatus as 'synced' and records the videoPath.
 *
 * Path pattern: trainers/{trainerId}/sessions/{sessionId}/recording.{ext}
 */
exports.onVideoUploaded = functions.storage
    .bucket(process.env.GCS_BUCKET || 'bestday-training-videos')
    .object()
    .onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath)
        return;
    // Match: trainers/{trainerId}/sessions/{sessionId}/recording.(webm|mp4)
    const match = filePath.match(/^trainers\/([^/]+)\/sessions\/([^/]+)\/recording\.(webm|mp4)$/);
    if (!match)
        return;
    const trainerId = match[1];
    const sessionId = match[2];
    const db = admin.firestore();
    const sessionRef = db
        .collection('trainers')
        .doc(trainerId)
        .collection('sessions')
        .doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) {
        console.warn(`Session ${sessionId} not found in Firestore, skipping GCS trigger update`);
        return;
    }
    await sessionRef.update({
        syncStatus: 'synced',
        videoPath: filePath,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Session ${sessionId} marked as synced (path: ${filePath})`);
});
//# sourceMappingURL=onVideoUploaded.js.map