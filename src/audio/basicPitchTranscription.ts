import BasicPitchWorker from './basicPitchTranscriber.worker.ts?worker';
import type { CapturedPcm } from './scoreAnalysis';

export interface SpotifyPianoNote {
  midi: number;
  time: number;
  endTime: number;
  confidence: number;
}

interface WorkerNote {
  midi: number;
  startTime: number;
  endTime: number;
  confidence: number;
}

const MODEL_READY_WAIT_MS = 1_200;
const TRANSCRIPTION_TIMEOUT_MS = 5_500;
const TARGET_SAMPLE_RATE = 22_050;

let worker: Worker | null = null;
let readyPromise: Promise<boolean> | null = null;
let resolveReady: ((ready: boolean) => void) | null = null;
let requestSequence = 0;
const pending = new Map<string, {
  finish: (notes: WorkerNote[] | null) => void;
  onProgress?: (progress: number) => void;
}>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  readyPromise = new Promise((resolve) => { resolveReady = resolve; });
  try {
    worker = new BasicPitchWorker();
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'ready' || data?.type === 'initialization-error') {
        resolveReady?.(data.type === 'ready');
        resolveReady = null;
        return;
      }
      if (typeof data?.requestId !== 'string') return;
      const request = pending.get(data.requestId);
      if (!request) return;
      if (data.type === 'transcription-progress') {
        request.onProgress?.(Math.max(0, Math.min(1, Number(data.progress) || 0)));
        return;
      }
      pending.delete(data.requestId);
      request.finish(
        data.type === 'transcription-complete' && Array.isArray(data.notes)
          ? data.notes
          : null,
      );
    };
    worker.onerror = () => {
      resolveReady?.(false);
      resolveReady = null;
      pending.forEach(({ finish }) => finish(null));
      pending.clear();
    };
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

async function resample(samples: Float32Array, sampleRate: number): Promise<Float32Array> {
  if (Math.abs(sampleRate - TARGET_SAMPLE_RATE) < 1) return samples;
  if (typeof OfflineAudioContext === 'undefined') {
    const length = Math.max(1, Math.round(samples.length * TARGET_SAMPLE_RATE / sampleRate));
    const result = new Float32Array(length);
    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    for (let index = 0; index < length; index++) {
      const source = index * ratio;
      const left = Math.min(samples.length - 1, Math.floor(source));
      const right = Math.min(samples.length - 1, left + 1);
      const blend = source - left;
      result[index] = samples[left] * (1 - blend) + samples[right] * blend;
    }
    return result;
  }
  const frameCount = Math.max(1, Math.ceil(samples.length * TARGET_SAMPLE_RATE / sampleRate));
  const context = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  const transferableSamples = new Float32Array(samples.length);
  transferableSamples.set(samples);
  buffer.copyToChannel(transferableSamples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0).slice();
}

/** Warm Spotify Basic Pitch in its worker without delaying microphone setup. */
export function warmBasicPitch(): Promise<boolean> {
  return ensureWorker() ? (readyPromise ?? Promise.resolve(false)) : Promise.resolve(false);
}

/** Whole-take Spotify transcription. It never executes model inference on the UI thread. */
export async function transcribeWithBasicPitch(
  capture: CapturedPcm,
  onProgress?: (progress: number) => void,
): Promise<SpotifyPianoNote[] | null> {
  const activeWorker = ensureWorker();
  if (!activeWorker) return null;
  const ready = await Promise.race([
    readyPromise ?? Promise.resolve(false),
    timeout(MODEL_READY_WAIT_MS, false),
  ]);
  if (!ready) return null;
  const samples = await resample(combineCapture(capture), capture.sampleRate);
  if (samples.length === 0) return [];
  const requestId = `spotify:${++requestSequence}:${samples.length}`;
  const result = new Promise<WorkerNote[] | null>((resolve) => {
    pending.set(requestId, { finish: resolve, onProgress });
    activeWorker.postMessage({
      type: 'transcribe',
      requestId,
      samples: samples.buffer,
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
    confidence: Math.max(0, Math.min(1, note.confidence)),
  }));
}
