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
exports.getSignedUrl = void 0;
const functions = __importStar(require("firebase-functions"));
const storage_1 = require("@google-cloud/storage");
const storage = new storage_1.Storage();
const BUCKET = process.env.GCS_BUCKET || 'bestday-training-videos';
exports.getSignedUrl = functions.https.onCall(async (data, context) => {
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
});
//# sourceMappingURL=getSignedUrl.js.map