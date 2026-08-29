import type { DetectedNote, DrillPlan } from './timing';
import { pitchToMidi } from './timing';
import type { SpotifyNote } from './basicPitchAnalysis';

export interface CapturedPcm {
  id: number;
  chunks: Float32Array[];
  sampleRate: number;
  startTime: number;
  endTime: number;
}

export interface ScoreAnalysisResult {
  notes: DetectedNote[];
  recovered: number;
  /** Strict notes retained after the live/PCM lanes were reconciled. */
  livePreserved: number;
  rejected: number;
  expectedAccepted: number;
  expectedCount: number;
  reason: string;
}

const WORKER_URL = '/audio/score-analyzer-worker.js?v=physical-evidence-v17-2026-08-26';
const ANALYSIS_TIMEOUT_MS = 10_000;
// This lane is optional and pre-warmed during microphone setup. On a cold or
// resource-constrained device, skip it instead of making grading look frozen.
const BASIC_PITCH_TIMEOUT_MS = 4_500;

function settleWithin<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(value);
    };
    const timer = globalThis.setTimeout(() => finish(fallback), timeoutMs);
    promise.then(finish, () => finish(fallback));
  });
}

function combineChunks(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    combined.set(chunk, offset);
    offset += chunk.length;
  });
  return combined;
}

function isDetectedNote(value: unknown): value is DetectedNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Partial<DetectedNote>;
  return (
    Number.isFinite(note.midi) &&
    Number.isFinite(note.time) &&
    Number.isFinite(note.clarity) &&
    Number.isFinite(note.strength)
  );
}

/** Conservative emergency path when whole-take PCM analysis is unavailable. */
export function credibleRealtimeFallback(
  realtime: readonly DetectedNote[],
): DetectedNote[] {
  return realtime.filter((note) => {
    if (note.detectorLane === 'polyphonic') return true;
    if (
      note.detectorLane !== 'strict' ||
      note.voiceVeto === true ||
      note.voiceBurst === true ||
      (note.harmonicShadow === true && note.harmonicIndependentAttack !== true)
    ) return false;
    const gate = Math.max(0.0005, Number(note.gate) || 0);
    return (
      (Number(note.peakRms) || 0) >= gate * 1.02 &&
      (Number(note.pianoAttackConfidence) || 0) >= 0.56 &&
      (Number(note.consensus) || 0) >= 0.68 &&
      (Number(note.clarity) || 0) >= 0.55 &&
      (Number(note.frameAttackRatio) || 0) >= 0.98 &&
      (Number(note.novelty) || 0) >= 0.2
    );
  });
}

/** Run score-aware analysis off the UI and audio threads. */
function analyzeWithWorker(
  capture: CapturedPcm,
  plan: DrillPlan,
  playStartTime: number,
  realtime: readonly DetectedNote[],
  samples: Float32Array,
): Promise<ScoreAnalysisResult> {
  if (
    typeof Worker === 'undefined' ||
    capture.chunks.length === 0 ||
    !Number.isFinite(capture.startTime) ||
    !Number.isFinite(capture.sampleRate)
  ) {
    return Promise.resolve({
      notes: credibleRealtimeFallback(realtime),
      recovered: 0,
      livePreserved: 0,
      rejected: 0,
      expectedAccepted: 0,
      expectedCount: plan.expectedNotes.length,
      reason: 'worker-unavailable',
    });
  }

  const requestId = `${capture.id}:${Date.now()}:${samples.length}`;

  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker | null = null;
    const finish = (result: ScoreAnalysisResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker?.terminate();
      resolve(result);
    };
    const fallback = (reason: string): ScoreAnalysisResult => ({
      notes: credibleRealtimeFallback(realtime),
      recovered: 0,
      livePreserved: 0,
      rejected: 0,
      expectedAccepted: 0,
      expectedCount: plan.expectedNotes.length,
      reason,
    });
    const timeout = window.setTimeout(
      () => finish(fallback('analysis-timeout')),
      ANALYSIS_TIMEOUT_MS,
    );

    try {
      worker = new Worker(WORKER_URL);
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.requestId !== requestId) return;
        if (data.type === 'analysis-error') {
          finish(fallback('analysis-error'));
          return;
        }
        if (data.type !== 'analysis-complete') return;
        const notes: DetectedNote[] = Array.isArray(data.notes)
          ? (data.notes as unknown[])
              .filter(isDetectedNote)
              .sort((a: DetectedNote, b: DetectedNote) => a.time - b.time)
          : credibleRealtimeFallback(realtime);
        finish({
          notes,
          recovered: Number.isFinite(data.recovered) ? data.recovered : 0,
          livePreserved: Number.isFinite(data.livePreserved) ? data.livePreserved : 0,
          rejected: Number.isFinite(data.rejected) ? data.rejected : 0,
          expectedAccepted: Number.isFinite(data.expectedAccepted) ? data.expectedAccepted : 0,
          expectedCount: Number.isFinite(data.expectedCount)
            ? data.expectedCount
            : plan.expectedNotes.length,
          reason: typeof data.reason === 'string' ? data.reason : 'analyzed',
        });
      };
      worker.onerror = () => finish(fallback('worker-error'));
      worker.postMessage({
        type: 'analyze',
        requestId,
        samples: samples.buffer,
        sampleRate: capture.sampleRate,
        captureStartTime: capture.startTime,
        playStartTime,
        plan: {
          secondsPerBeat: plan.secondsPerBeat,
          totalBeats: plan.totalBeats,
          expectedNotes: plan.expectedNotes.map((slot) => ({
            midi: pitchToMidi(slot.pitch),
            beat: slot.beat,
            beats: slot.beats,
          })),
        },
        realtime: realtime.map((note) => ({ ...note })),
      }, [samples.buffer]);
    } catch {
      finish(fallback('worker-construction-error'));
    }
  });
}

/**
 * Reconcile the purpose-built low-latency detector with Spotify Basic Pitch's
 * independent whole-take transcription. The neural lane may recover a real
 * soft/high note, but only in the matching written slot; it cannot invent
 * score credit or replace the responsive live detector.
 */
export async function analyzeCapturedTake(
  capture: CapturedPcm,
  plan: DrillPlan,
  playStartTime: number,
  realtime: readonly DetectedNote[],
): Promise<ScoreAnalysisResult> {
  const samples = combineChunks(capture.chunks);
  const workerPromise = analyzeWithWorker(
    capture,
    plan,
    playStartTime,
    realtime,
    samples.slice(),
  );
  // The neural lane is supplemental. A slow model load or unavailable WebGL
  // backend must never freeze the grading screen; the purpose-built worker
  // remains authoritative and completes independently.
  const spotifyPromise = settleWithin<SpotifyNote[]>(
    import('./basicPitchAnalysis')
      .then(({ analyzeWithBasicPitch }) => analyzeWithBasicPitch(samples, capture.sampleRate))
      .catch(() => []),
    [],
    BASIC_PITCH_TIMEOUT_MS,
  );

  const [workerResult, spotifyNotes] = await Promise.all([workerPromise, spotifyPromise]);
  if (spotifyNotes.length === 0) return workerResult;
  const { mergeSpotifyRecoveries } = await import('./basicPitchAnalysis');
  const merged = mergeSpotifyRecoveries(
    workerResult.notes,
    spotifyNotes,
    plan,
    capture.startTime,
    playStartTime,
  );
  return {
    ...workerResult,
    notes: merged.notes,
    recovered: workerResult.recovered + merged.recovered,
    expectedAccepted: Math.min(
      workerResult.expectedCount,
      workerResult.expectedAccepted + merged.recovered,
    ),
    reason: merged.recovered > 0
      ? `${workerResult.reason}+spotify-basic-pitch`
      : workerResult.reason,
  };
}
