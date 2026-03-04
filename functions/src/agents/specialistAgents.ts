/**
 * Best Day AI — Phase 2: Specialist Agents
 *
 * PT_EXPERT  — Gemini watches the video; analyses form, mechanics, injury risk
 *
 * Stores results in analysisJobs/{jobId}/agentResults/{agentId}.
 *
 * FILE: functions/src/agents/specialistAgents.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';
import type { ExerciseIndex } from './repCounterAgent';

// ── Output Types ─────────────────────────────────────────────────────────────

export interface PtExpertResult {
  agentId: 'PT_EXPERT';
  model: string;
  engine: 'gemini';
  exerciseAnalyses: PtExerciseAnalysis[];
  processingTimeMs: number;
  completedAt: admin.firestore.Timestamp;
}

export interface PtExerciseAnalysis {
  exerciseName: string;
  formNotes: string[];         // specific mechanics observed
  cuesToGiveClient: string[];  // 3-5 actionable cues for the trainer to give the client
  injuryFlags: string[];       // biomechanical risks
  formGrade: 'A' | 'B' | 'C' | 'D';
}

// ── Gemini Schemas ────────────────────────────────────────────────────────────

const PT_EXPERT_SCHEMA = {
  type: 'object',
  properties: {
    exerciseAnalyses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exerciseName:       { type: 'string' },
          formNotes:          { type: 'array', items: { type: 'string' } },
          cuesToGiveClient:   { type: 'array', items: { type: 'string' } },
          injuryFlags:        { type: 'array', items: { type: 'string' } },
          formGrade:          { type: 'string' },
        },
        required: ['exerciseName', 'formNotes', 'cuesToGiveClient', 'injuryFlags', 'formGrade'],
      },
    },
  },
  required: ['exerciseAnalyses'],
};

// ── Prompt Builders ───────────────────────────────────────────────────────────

function buildPtExpertPrompt(exerciseIndex: ExerciseIndex): string {
  // Build a timestamp guide so Gemini knows exactly where to look
  const timestampGuide = exerciseIndex.segments
    .map(seg => {
      const start = formatSeconds(seg.startTime);
      const end = formatSeconds(seg.endTime);
      const reps = seg.movementType === 'isometric'
        ? `${seg.holdTimeSeconds}s hold`
        : `${(seg.fullReps || 0) + (seg.partialReps || 0)} reps`;
      const formFlag = seg.formBreakdownAtRep != null
        ? ` ⚠ form breakdown at rep ${seg.formBreakdownAtRep}`
        : '';
      return `  [${start}–${end}] ${seg.exerciseName} — Set ${seg.setNumber} — ${reps} @ ${seg.weight}${formFlag}`;
    })
    .join('\n');

  const flaggedNote = exerciseIndex.flaggedForReview.length > 0
    ? `\n\nFLAGGED FOR REVIEW by indexer: ${exerciseIndex.flaggedForReview.join(', ')}`
    : '';

  return `You are an expert Physical Therapist and movement specialist working inside a personal training video analysis system.

A video indexing AI (REP_COUNTER) has already watched this session and produced a structured exercise index. You must now watch the same video and provide deep FORM ANALYSIS for each exercise the client performed.

═══════════════════════════════════════════════════════════
EXERCISE TIMESTAMP GUIDE — Focus on these windows only
═══════════════════════════════════════════════════════════
${timestampGuide}${flaggedNote}

═══════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════

For EACH exercise listed above, watch the corresponding video window and provide:

1. FORM NOTES — Specific observations about mechanics (e.g. "Knee tracks inward on the eccentric phase of Squat Set 2 rep 4", "Lumbar extension maintained throughout Romanian Deadlift Set 1"). Be precise about WHICH set and rep if relevant.

2. CUES TO GIVE CLIENT — 3-5 actionable, short coaching cues the trainer should communicate to the client during or after this exercise. These should be corrective (if form issues exist) or reinforcing (if form is good). Write them as direct instructions to the client (e.g. "Drive your knees out on the way down", "Brace your core before each rep").

3. INJURY FLAGS — Any movements that create joint stress, compensation patterns, or injury risk. If none, return an empty array.

4. FORM GRADE — A (excellent), B (good), C (needs work), D (significant issues).

═══════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════
- CLIENT ONLY. Ignore trainer demonstrations.
- One analysis object per UNIQUE exercise (not per set). Combine observations from all sets.
- Be specific. "Knees caving at bottom of squat" is useful. "Form could be better" is not.
- If a set is obscured or off-camera, note it in formNotes and reduce your confidence.
- Never fabricate observations for segments you cannot clearly see.

Return ONLY valid JSON matching the schema. No markdown, no preamble.`;
}

export function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── PT_EXPERT Agent ───────────────────────────────────────────────────────────

export async function runPtExpert(
  jobId: string,
  videoBase64: string,
  videoMimeType: string,
  exerciseIndex: ExerciseIndex,
): Promise<void> {
  const startTime = Date.now();
  const db = admin.firestore();
  const apiKey = functions.config().gemini?.api_key || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.5-pro';

  console.log(`[PT_EXPERT] Starting for job ${jobId} — ${exerciseIndex.segments.length} segments`);

  try {
    const prompt = buildPtExpertPrompt(exerciseIndex);

    const response = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { data: videoBase64, mimeType: videoMimeType } },
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: PT_EXPERT_SCHEMA,
      },
    });

    const text = response.text ?? '';
    if (!text) throw new Error('PT_EXPERT: Gemini returned empty response');

    let parsed: { exerciseAnalyses: PtExerciseAnalysis[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[PT_EXPERT] Parse failed, raw:', text.substring(0, 400));
      throw new Error('PT_EXPERT: Gemini returned invalid JSON');
    }

    const result: PtExpertResult = {
      agentId: 'PT_EXPERT',
      model,
      engine: 'gemini',
      exerciseAnalyses: parsed.exerciseAnalyses || [],
      processingTimeMs: Date.now() - startTime,
      completedAt: admin.firestore.Timestamp.now(),
    };

    await db.collection('analysisJobs').doc(jobId)
      .collection('agentResults').doc('PT_EXPERT')
      .set(result);

    console.log(`[PT_EXPERT] Done for job ${jobId} — ${result.exerciseAnalyses.length} analyses in ${result.processingTimeMs}ms`);
  } catch (err: any) {
    console.error(`[PT_EXPERT] Failed for job ${jobId}:`, err.message);
    // Store error but don't throw — specialists are non-blocking
    await db.collection('analysisJobs').doc(jobId)
      .collection('agentResults').doc('PT_EXPERT')
      .set({
        agentId: 'PT_EXPERT',
        engine: 'gemini',
        error: err.message,
        exerciseAnalyses: [],
        processingTimeMs: Date.now() - startTime,
        completedAt: admin.firestore.Timestamp.now(),
      });
  }
}
