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
  rejected: number;
  expectedAccepted: number;
  expectedCount: number;
  reason: string;
}

const WORKER_URL = '/audio/score-analyzer-worker.js?v=score-aware-pcm-v13-2026-08-22';
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
        finish({
          notes,
          recovered: Number.isFinite(data.recovered) ? data.recovered : 0,
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
