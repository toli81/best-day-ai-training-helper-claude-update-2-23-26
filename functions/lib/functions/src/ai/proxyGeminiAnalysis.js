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
exports.proxyGeminiAnalysis = void 0;
const functions = __importStar(require("firebase-functions"));
const genai_1 = require("@google/genai");
// Schema mirrors the client-side geminiService.ts schema
const ANALYSIS_SCHEMA = {
    type: 'object',
    properties: {
        exercises: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    startTime: { type: 'number' },
                    endTime: { type: 'number' },
                    reps: { type: 'string' },
                    weight: { type: 'string' },
                    duration: { type: 'string' },
                    cues: { type: 'array', items: { type: 'string' } },
                    tags: { type: 'array', items: { type: 'string' } },
                },
                required: ['id', 'name', 'startTime', 'endTime', 'reps', 'cues', 'tags'],
            },
        },
        transcript: { type: 'string' },
        summary: { type: 'string' },
        trainerCues: { type: 'array', items: { type: 'string' } },
        protocolRecommendations: { type: 'string' },
        emphasisPercentages: {
            type: 'object',
            properties: {
                upperBody: { type: 'number' },
                lowerBody: { type: 'number' },
                core: { type: 'number' },
                fullBody: { type: 'number' },
            },
            required: ['upperBody', 'lowerBody', 'core', 'fullBody'],
        },
    },
    required: ['exercises', 'transcript', 'summary', 'trainerCues', 'protocolRecommendations', 'emphasisPercentages'],
};
exports.proxyGeminiAnalysis = functions
    .runWith({ timeoutSeconds: 300, memory: '1GB' })
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const apiKey = functions.config().gemini?.api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError('internal', 'Gemini API key not configured');
    }
    const ai = new genai_1.GoogleGenAI({ apiKey });
    const { mode, videoBase64, videoMimeType, snapshots } = data;
    try {
        let contents;
        if (videoBase64 && videoMimeType) {
            // Direct video analysis
            contents = [
                {
                    inlineData: { data: videoBase64, mimeType: videoMimeType },
                },
                { text: buildVideoPrompt(mode) },
            ];
        }
        else if (snapshots && snapshots.length > 0) {
            // Snapshot-based audit
            const imageParts = snapshots.map(b64 => ({
                inlineData: { data: b64, mimeType: 'image/jpeg' },
            }));
            contents = [...imageParts, { text: buildSnapshotPrompt(mode) }];
        }
        else {
            throw new functions.https.HttpsError('invalid-argument', 'Must provide videoBase64 or snapshots');
        }
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents,
            config: {
                responseMimeType: 'application/json',
                responseSchema: ANALYSIS_SCHEMA,
            },
        });
        const text = response.text ?? '';
        if (!text)
            throw new Error('Empty response from Gemini');
        return JSON.parse(text);
    }
    catch (err) {
        console.error('Gemini proxy error:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Gemini analysis failed');
    }
});
function buildVideoPrompt(mode) {
    return `Analyze this ${mode === 'clip' ? 'exercise clip' : 'full workout session'} video.
Identify every distinct exercise set performed.
For each exercise provide: name, startTime/endTime in seconds, rep count, weight if visible,
coaching cues on form, relevant tags (muscle groups, equipment, movement pattern).
Also provide an overall session transcript, summary, top 3 trainer coaching directives,
protocol recommendations, and body-part emphasis percentages (must sum to 100).
Return as structured JSON matching the schema exactly.`;
}
function buildSnapshotPrompt(mode) {
    return `These are sequential snapshots from a ${mode === 'clip' ? 'short exercise clip' : 'full workout session'}.
Analyze each snapshot to identify exercises being performed.
Provide the same structured analysis as if watching the full video.
Estimate timestamps based on snapshot order and typical exercise durations.
Return as structured JSON matching the schema exactly.`;
}
//# sourceMappingURL=proxyGeminiAnalysis.js.map