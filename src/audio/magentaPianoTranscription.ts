import type { CapturedPcm } from './scoreAnalysis';

export interface PianoTranscriptNote {
  midi: number;
  time: number;
  endTime: number;
  confidence: number;
}

interface WorkerTranscriptNote {
  midi: number;
  startTime: number;
  endTime: number;
  confidence: number;
}

const WORKER_URL = '/audio/magenta-transcriber-worker.js?v=onsets-frames-q2-v1';
const MODEL_READY_WAIT_MS = 450;
const TRANSCRIPTION_TIMEOUT_MS = 5_500;

let worker: Worker | null = null;
let readyPromise: Promise<boolean> | null = null;
let resolveReady: ((ready: boolean) => void) | null = null;
let requestSequence = 0;
const pending = new Map<string, (notes: WorkerTranscriptNote[] | null) => void>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  readyPromise = new Promise((resolve) => { resolveReady = resolve; });
  try {
    worker = new Worker(WORKER_URL);
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'ready') {
        resolveReady?.(true);
        resolveReady = null;
        return;
      }
      if (data?.type === 'initialization-error') {
        resolveReady?.(false);
        resolveReady = null;
        return;
      }
      if (typeof data?.requestId !== 'string') return;
      const finish = pending.get(data.requestId);
      if (!finish) return;
      pending.delete(data.requestId);
      finish(data.type === 'transcription-complete' && Array.isArray(data.notes) ? data.notes : null);
    };
    worker.onerror = () => {
      resolveReady?.(false);
      resolveReady = null;
      pending.forEach((finish) => finish(null));
      pending.clear();
    };
    worker.postMessage({ type: 'initialize' });
    return worker;
  } catch {
    worker = null;
    resolveReady?.(false);
    resolveReady = null;
    return null;
  }
}

function timeout<T>(milliseconds: number, value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), milliseconds));
}

/** Warm the quantized solo-piano model outside the browser UI thread. */
export function warmPianoTranscriber(): Promise<boolean> {
  return ensureWorker() ? (readyPromise ?? Promise.resolve(false)) : Promise.resolve(false);
}

function combineCapture(capture: CapturedPcm): Float32Array {
  const length = capture.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  capture.chunks.forEach((chunk) => {
    samples.set(chunk, offset);
    offset += chunk.length;
  });
  return samples;
}

/** Magenta confirms independent PCM evidence; it never creates score credit. */
export async function transcribePianoCapture(
  capture: CapturedPcm,
): Promise<PianoTranscriptNote[] | null> {
  const activeWorker = ensureWorker();
  if (!activeWorker) return null;
  const ready = await Promise.race([
    readyPromise ?? Promise.resolve(false),
    timeout(MODEL_READY_WAIT_MS, false),
  ]);
  if (!ready) return null;
  const samples = combineCapture(capture);
  if (samples.length === 0) return [];
  const requestId = `magenta:${++requestSequence}:${samples.length}`;
  const result = new Promise<WorkerTranscriptNote[] | null>((resolve) => {
    pending.set(requestId, resolve);
    activeWorker.postMessage({
      type: 'transcribe',
      requestId,
      samples: samples.buffer,
      sampleRate: capture.sampleRate,
    }, [samples.buffer]);
  });
  const notes = await Promise.race([
    result,
    timeout<null>(TRANSCRIPTION_TIMEOUT_MS, null),
  ]);
  if (!notes) {
    pending.delete(requestId);
    return null;
  }
  return notes.map((note) => ({
    midi: Math.round(note.midi),
    time: capture.startTime + Math.max(0, note.startTime),
    endTime: capture.startTime + Math.max(note.startTime, note.endTime),
    confidence: Math.min(1, Math.max(0.35, note.confidence)),
  }));
}
