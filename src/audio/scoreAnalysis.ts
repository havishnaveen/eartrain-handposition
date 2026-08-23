import type { DetectedNote, DrillPlan } from './timing';
import { pitchToMidi } from './timing';

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

const WORKER_URL = '/audio/score-analyzer-worker.js?v=live-preserving-v15-2026-08-22';
const ANALYSIS_TIMEOUT_MS = 10_000;

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

/**
 * Final invariant: an exact written slot that cleared the live detector and
 * was shown to the student cannot disappear merely because a second FFT pass
 * chose a different local maximum. The worker may refine its time/duration;
 * it may not delete it. Unassigned events, voice, and unsupported harmonic
 * shadows receive no protection and remain subject to offline rejection.
 */
export function preserveConfirmedLiveNotes(
  analyzed: readonly DetectedNote[],
  realtime: readonly DetectedNote[],
): { notes: DetectedNote[]; preserved: number } {
  const notes = [...analyzed];
  const representedSlots = new Set(
    notes
      .map((note) => note.expectedSlot)
      .filter((slot): slot is number => Number.isInteger(slot)),
  );
  let preserved = 0;

  realtime.forEach((note) => {
    const slot = note.expectedSlot;
    if (
      !Number.isInteger(slot) ||
      representedSlots.has(slot as number) ||
      note.scoreContextAccepted !== true ||
      note.voiceVeto === true ||
      note.voiceBurst === true ||
      (note.harmonicShadow === true && note.harmonicIndependentAttack !== true)
    ) return;
    notes.push({ ...note, analysisSource: 'realtime-final-invariant' });
    representedSlots.add(slot as number);
    preserved += 1;
  });

  notes.sort((a, b) => a.time - b.time);
  return { notes, preserved };
}

/**
 * Run score-aware analysis off the UI and audio threads. Failure is always
 * recoverable: callers retain the real-time notes as their fallback.
 */
export function analyzeCapturedTake(
  capture: CapturedPcm,
  plan: DrillPlan,
  playStartTime: number,
  realtime: readonly DetectedNote[],
): Promise<ScoreAnalysisResult> {
  if (
    typeof Worker === 'undefined' ||
    capture.chunks.length === 0 ||
    !Number.isFinite(capture.startTime) ||
    !Number.isFinite(capture.sampleRate)
  ) {
    return Promise.resolve({
      notes: [...realtime],
      recovered: 0,
      livePreserved: 0,
      rejected: 0,
      expectedAccepted: 0,
      expectedCount: plan.expectedNotes.length,
      reason: 'worker-unavailable',
    });
  }

  const samples = combineChunks(capture.chunks);
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
      notes: [...realtime],
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
          : [...realtime];
        const reconciled = preserveConfirmedLiveNotes(notes, realtime);
        finish({
          notes: reconciled.notes,
          recovered: Number.isFinite(data.recovered) ? data.recovered : 0,
          livePreserved: (Number.isFinite(data.livePreserved) ? data.livePreserved : 0) + reconciled.preserved,
          rejected: Math.max(
            0,
            (Number.isFinite(data.rejected) ? data.rejected : 0) - reconciled.preserved,
          ),
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
