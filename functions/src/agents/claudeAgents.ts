/**
 * Best Day AI — Phase 2: Claude Agents
 *
 * REPORT_GENERATOR — Claude Sonnet: reads specialist results (PT_EXPERT + AUDIO_ANALYST),
 *                    synthesizes insights, and produces the final SessionAnalysis.
 *
 * This is a text-only call — no video, no images.
 * Cost: ~$0.01–0.05 per session total.
 *
 * FILE: functions/src/agents/claudeAgents.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import type { ExerciseIndex } from './repCounterAgent';
import type { PtExpertResult } from './specialistAgents';
import type { AudioAnalystResult } from './audioAnalystAgent';

// ── Output Types ─────────────────────────────────────────────────────────────

export interface ReportResult {
  agentId: 'REPORT';
  model: string;
  engine: 'claude';
  sessionAnalysis: GeneratedSessionAnalysis;
  processingTimeMs: number;
  completedAt: admin.firestore.Timestamp;
}

export interface GeneratedSessionAnalysis {
  exercises: GeneratedExercise[];
  transcript: string;
  summary: string;
  trainerCues: string[];
  protocolRecommendations: string;
  emphasisPercentages: {
    upperBody: number;
    lowerBody: number;
    core: number;
    fullBody: number;
  };
}

export interface GeneratedExercise {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  reps: string;
  weight: string;
  duration: string;
  cues: string[];
  tags: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = functions.config().anthropic?.api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing ANTHROPIC_API_KEY. Set it with: firebase functions:config:set anthropic.api_key="sk-ant-..."'
    );
  }
  return new Anthropic({ apiKey });
}

function safeParseJson<T>(text: string, agentName: string): T {
  // Strip markdown code fences if Claude wraps output in them
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.error(`[${agentName}] JSON parse failed. Raw (first 500 chars):`, cleaned.substring(0, 500));
    throw new Error(`${agentName}: Claude returned invalid JSON`);
  }
}

// ── REPORT_GENERATOR Agent ────────────────────────────────────────────────────

export async function runReportGenerator(jobId: string): Promise<void> {
  const startTime = Date.now();
  const db = admin.firestore();

  console.log(`[REPORT] Starting for job ${jobId}`);

  try {
    const jobRef = db.collection('analysisJobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) throw new Error(`Job ${jobId} not found`);

    const job = jobSnap.data()!;
    const exerciseIndex = job.exerciseIndex as ExerciseIndex;
    const trainerId: string = job.trainerId;
    const sessionId: string = job.sessionId;

    // Read specialist results directly (no consensus step)
    const [ptSnap, audioSnap] = await Promise.all([
      jobRef.collection('agentResults').doc('PT_EXPERT').get(),
      jobRef.collection('agentResults').doc('AUDIO_ANALYST').get(),
    ]);

    const ptResult = ptSnap.exists ? (ptSnap.data() as PtExpertResult) : null;
    const audioResult = audioSnap.exists ? (audioSnap.data() as AudioAnalystResult) : null;

    const prompt = buildReportPrompt(exerciseIndex, ptResult, audioResult);

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: `You are generating a structured training session analysis report for a personal trainer. You must first SYNTHESIZE the specialist agent outputs into unified coaching insights, then FORMAT them into the required JSON report structure. Always respond with valid JSON only — no markdown, no explanation.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    const parsed = safeParseJson<GeneratedSessionAnalysis>(rawText, 'REPORT');

    // Validate and merge with base exercise data from ExerciseIndex
    const finalAnalysis = mergeWithExerciseIndex(parsed, exerciseIndex);

    // Write the final report to the session document (+ freeze originalAnalysis)
    await db
      .collection('trainers').doc(trainerId)
      .collection('sessions').doc(sessionId)
      .update({
        analysis: finalAnalysis,
        originalAnalysis: finalAnalysis,
        status: 'complete',
        analysisStatus: 'draft_ready',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Update the job document
    await jobRef.update({
      status: 'draft_ready',
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Store the report result for reference
    await jobRef.collection('agentResults').doc('REPORT').set({
      agentId: 'REPORT',
      model: 'claude-sonnet-4-5',
      engine: 'claude',
      sessionAnalysis: finalAnalysis,
      processingTimeMs: Date.now() - startTime,
      completedAt: admin.firestore.Timestamp.now(),
    } as ReportResult);

    console.log(`[REPORT] Done for job ${jobId} — analysis written to session ${sessionId} in ${Date.now() - startTime}ms`);
  } catch (err: any) {
    console.error(`[REPORT] Failed for job ${jobId}:`, err.message);
    // Mark the job as failed so the UI can show a retry option
    await db.collection('analysisJobs').doc(jobId).update({
      status: 'failed',
      error: `REPORT_GENERATOR failed: ${err.message}`,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    throw err;
  }
}

function buildReportPrompt(
  exerciseIndex: ExerciseIndex,
  ptResult: PtExpertResult | null,
  audioResult: AudioAnalystResult | null,
): string {
  // ── PT_EXPERT data ──────────────────────────────────────────────────────
  const ptSection = ptResult && !(ptResult as any).error && ptResult.exerciseAnalyses?.length > 0
    ? JSON.stringify(ptResult.exerciseAnalyses, null, 2)
    : 'PT_EXPERT data not available.';

  // ── AUDIO_ANALYST data ──────────────────────────────────────────────────
  const audioUseable = audioResult?.useable === true;
  const audioSection = audioUseable
    ? `Audio was USEABLE (quality: ${audioResult!.audioQuality}).
Trainer cues extracted:
${JSON.stringify(audioResult!.exerciseCues, null, 2)}

Full transcription: ${audioResult!.fullTranscription ?? 'none'}
Session summary: ${audioResult!.sessionSummary ?? 'none'}`
    : `Audio was NOT useable (quality: ${audioResult?.audioQuality ?? 'unknown'}). Ignore audio data entirely.`;

  const transcript = audioUseable ? (audioResult!.fullTranscription || '') : '';

  // ── Session data from ExerciseIndex ─────────────────────────────────────
  const exerciseSummaryText = exerciseIndex.exerciseSummary.map(ex => {
    const segs = exerciseIndex.segments.filter(s =>
      ex.segmentIds.includes(s.segmentId)
    );
    const weights = [...new Set(segs.map(s => s.weight).filter(Boolean))];
    const restTimes = segs
      .map(s => s.restAfterSeconds)
      .filter((r): r is number => r != null);
    const avgRest = restTimes.length > 0
      ? Math.round(restTimes.reduce((a, b) => a + b, 0) / restTimes.length)
      : null;

    return `${ex.exerciseName}: ${ex.totalSets} sets, ${ex.totalReps ?? ex.totalHoldTime + 's hold'} total, weights=[${weights.join(', ') || 'bodyweight'}], avgRest=${avgRest ?? 'unknown'}s, confidence=${(ex.averageConfidence * 100).toFixed(0)}%`;
  }).join('\n');

  const exerciseNames = exerciseIndex.exerciseSummary.map(e => e.exerciseName);

  return `You are synthesizing specialist agent outputs and generating a complete training session analysis report.

═══════════════════════════════════════════════════════════
SESSION OVERVIEW
═══════════════════════════════════════════════════════════
Exercises: ${exerciseNames.join(', ')}
Session Duration: ${Math.round(exerciseIndex.totalSessionDuration / 60)} minutes
Active Time: ${Math.round(exerciseIndex.totalActiveTime / 60)} minutes
Rest Time: ${Math.round(exerciseIndex.totalRestTime / 60)} minutes
Body Emphasis: Upper ${exerciseIndex.emphasisPercentages.upperBody}% | Lower ${exerciseIndex.emphasisPercentages.lowerBody}% | Core ${exerciseIndex.emphasisPercentages.core}% | Full Body ${exerciseIndex.emphasisPercentages.fullBody}%

Exercise Summary:
${exerciseSummaryText}

═══════════════════════════════════════════════════════════
PT_EXPERT (Physical Therapist — watched video for form)
═══════════════════════════════════════════════════════════
${ptSection}

═══════════════════════════════════════════════════════════
AUDIO_ANALYST (listened to trainer coaching audio)
═══════════════════════════════════════════════════════════
${audioSection}

═══════════════════════════════════════════════════════════
YOUR TASK — SYNTHESIZE + GENERATE REPORT
═══════════════════════════════════════════════════════════

STEP 1: SYNTHESIZE specialist outputs into unified coaching insights:
- For EACH exercise, merge PT_EXPERT form cues with AUDIO_ANALYST verbal cues (if audio was useable) into 3-5 PRIORITY coaching cues. Prioritize corrective cues over reinforcing ones.
- Generate a 2-3 sentence SESSION SUMMARY describing what was trained, overall quality, and key coaching themes.
- Produce 3-6 session-level TRAINER DIRECTIVES (not exercise-specific — session-level priorities).
- Write PROTOCOL RECOMMENDATIONS: load progression, volume, rest, programming notes based on the session data above.
- If audio was NOT useable, synthesize from PT_EXPERT and session data only — do not mention the gap.

STEP 2: FORMAT into the required JSON structure below.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════

Return JSON with EXACTLY this structure:

{
  "exercises": [
    {
      "id": "<segmentId from ExerciseIndex>",
      "name": "<exerciseName>",
      "startTime": <number — seconds>,
      "endTime": <number — seconds>,
      "reps": "<e.g. '10' or '30s hold'>",
      "weight": "<e.g. '135 lbs' or 'bodyweight'>",
      "duration": "<e.g. '45s'>",
      "cues": ["cue 1", "cue 2", "cue 3"],
      "tags": ["tag1", "tag2"]
    }
  ],
  "transcript": "<full trainer transcription, or empty string if unavailable>",
  "summary": "<2-3 sentence professional session narrative for the trainer's records>",
  "trainerCues": ["directive 1", "directive 2", "directive 3"],
  "protocolRecommendations": "<programming notes paragraph>",
  "emphasisPercentages": {
    "upperBody": <number>,
    "lowerBody": <number>,
    "core": <number>,
    "fullBody": <number>
  }
}

Rules:
- "exercises" must contain ONE entry per SEGMENT (set) from the ExerciseIndex — not per unique exercise. Each set is its own entry.
- "cues" for each exercise: use the synthesized priority cues for that exercise name. Repeat the same cues across sets of the same exercise.
- "transcript": use "${transcript ? 'the full trainer transcription below' : 'empty string — no audio available'}"
- "summary": professional, specific (mention the exercises, intensity, key coaching themes)
- "trainerCues": the top 3-6 session-level priorities
- "protocolRecommendations": programming direction based on session data (load, volume, rest patterns)
- "emphasisPercentages": carry forward exactly from the session data above

${transcript ? `\nTrainer Audio Transcript:\n${transcript.substring(0, 3000)}` : ''}

Return ONLY valid JSON. No markdown, no explanation.

═══════════════════════════════════════════════════════════
EXERCISE INDEX (for reference — use these IDs and timestamps)
═══════════════════════════════════════════════════════════
${JSON.stringify(exerciseIndex.segments.map(s => ({
    segmentId: s.segmentId,
    exerciseName: s.exerciseName,
    startTime: s.startTime,
    endTime: s.endTime,
    setNumber: s.setNumber,
    reps: s.movementType === 'isometric'
      ? `${s.holdTimeSeconds}s hold`
      : String((s.fullReps || 0) + (s.partialReps || 0)),
    weight: s.weight,
    setDurationSeconds: s.setDurationSeconds,
    movementType: s.movementType,
    tags: s.tags,
    bodyParts: s.bodyParts,
  })), null, 2)}`;
}

/**
 * Merge Claude's generated analysis with the raw ExerciseIndex to ensure
 * all segments are present and timestamps are accurate.
 */
function mergeWithExerciseIndex(
  generated: GeneratedSessionAnalysis,
  exerciseIndex: ExerciseIndex,
): GeneratedSessionAnalysis {
  // Build a lookup of generated exercises by segmentId
  const generatedById = new Map(
    (generated.exercises || []).map(e => [e.id, e])
  );

  // Build exercise-level cues lookup by name (for fallback)
  const cuesByName = new Map<string, string[]>();
  for (const ex of (generated.exercises || [])) {
    if (!cuesByName.has(ex.name)) cuesByName.set(ex.name, ex.cues);
  }

  // Rebuild exercises from ExerciseIndex segments (source of truth for timestamps)
  const exercises: GeneratedExercise[] = exerciseIndex.segments.map(seg => {
    const gen = generatedById.get(seg.segmentId);
    const reps = seg.movementType === 'isometric'
      ? `${seg.holdTimeSeconds ?? 0}s hold`
      : String((seg.fullReps || 0) + (seg.partialReps || 0));

    return {
      id: seg.segmentId,
      name: seg.exerciseName,
      startTime: seg.startTime,
      endTime: seg.endTime,
      reps: gen?.reps ?? reps,
      weight: gen?.weight ?? seg.weight,
      duration: gen?.duration ?? `${seg.setDurationSeconds}s`,
      cues: gen?.cues ?? cuesByName.get(seg.exerciseName) ?? [],
      tags: gen?.tags ?? [...seg.tags, ...seg.bodyParts, seg.movementType],
    };
  });

  return {
    exercises,
    transcript: generated.transcript ?? '',
    summary: generated.summary ?? '',
    trainerCues: generated.trainerCues ?? [],
    protocolRecommendations: generated.protocolRecommendations ?? '',
    emphasisPercentages: exerciseIndex.emphasisPercentages, // always use the source of truth
  };
}
