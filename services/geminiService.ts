// Correct Google GenAI implementation: Move constants/schema before usage, update contents structure, and ensure response property access.
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SessionAnalysis } from "../types";

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing API key – set GEMINI_API_KEY in your .env file.");
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const FLASH_MODEL = 'gemini-2.5-flash';

// Define schema before usage in functions
const SESSION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          startTime: { type: Type.NUMBER },
          endTime: { type: Type.NUMBER },
          reps: { type: Type.STRING },
          cues: { type: Type.ARRAY, items: { type: Type.STRING } },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["name", "startTime", "endTime", "reps", "cues", "tags"]
      }
    },
    summary: { type: Type.STRING },
    trainerCues: { type: Type.ARRAY, items: { type: Type.STRING } },
    protocolRecommendations: { type: Type.STRING },
    transcript: { type: Type.STRING },
    emphasisPercentages: {
      type: Type.OBJECT,
      properties: {
        upperBody: { type: Type.NUMBER },
        lowerBody: { type: Type.NUMBER },
        core: { type: Type.NUMBER },
        fullBody: { type: Type.NUMBER }
      },
      required: ["upperBody", "lowerBody", "core", "fullBody"]
    }
  },
  required: ["exercises", "summary", "trainerCues", "protocolRecommendations", "transcript", "emphasisPercentages"]
};

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Rejects the given promise if it doesn't settle within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Request'): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * High-Precision analysis for short video clips (< 5 mins)
 */
export async function analyzeVideoClip(videoBase64: string, mimeType: string, retryCount = 0): Promise<SessionAnalysis> {
  try {
    const apiCall = getAI().models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          { text: "Analyze this training clip with extreme precision. Count every rep accurately and identify subtle biomechanical cues for form correction. Additionally, provide a full transcript of everything the trainer and athlete said, and calculate the body part emphasis percentages (must sum to 100). Return as JSON." },
          { inlineData: { data: videoBase64, mimeType } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: SESSION_SCHEMA
      }
    });

    const response: GenerateContentResponse = await withTimeout(apiCall, 90_000, 'Video analysis');
    return processAiResponse(response.text);
  } catch (err: any) {
    // If it's a size error, timeout, or network error, App.tsx will catch and use snapshots
    console.error("Video analysis error:", err);
    throw err;
  }
}

/**
 * Audits sessions using a sequence of low-res snapshots.
 * Used for long workouts or as a fallback for large clips.
 */
export async function analyzeSnapshotAudit(snapshots: string[], isHighPrecision = false): Promise<SessionAnalysis> {
  const imageParts = snapshots.map(data => ({
    inlineData: { data, mimeType: "image/jpeg" }
  }));

  const prompt = isHighPrecision 
    ? "Analyze this high-frequency image sequence of a training clip. Provide extreme detail on rep counts and technical form cues. Also provide a summary transcript of the conversation and determine body part emphasis percentages. Return as JSON."
    : "Analyze this workout session sequence. Provide a chronological list of exercises, intensity summary, trainer cues, a full transcript, and body part emphasis percentages. Return as JSON.";

  try {
    const apiCall = getAI().models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          { text: prompt },
          ...imageParts
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: SESSION_SCHEMA
      }
    });

    const response: GenerateContentResponse = await withTimeout(apiCall, 60_000, 'Snapshot audit');
    return processAiResponse(response.text);
  } catch (err: any) {
    console.error("Audit error:", err);
    throw new Error(`Snapshot analysis failed: ${err.message || 'Unknown error'}`);
  }
}

function processAiResponse(text: string | undefined): SessionAnalysis {
  if (!text) throw new Error("AI returned empty results.");
  try {
    const analysis: SessionAnalysis = JSON.parse(text);
    analysis.exercises = analysis.exercises.map((ex, i) => ({
      ...ex,
      id: `ex-${i}-${Date.now()}`
    }));
    return analysis;
  } catch (e) {
    throw new Error("AI response was malformed. Please try again.");
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result.split(',')[1]);
      } else {
        reject(new Error("Encoding failed: Result is not a string"));
      }
    };
    reader.onerror = () => reject(new Error("Encoding failed."));
    reader.readAsDataURL(blob);
  });
}
