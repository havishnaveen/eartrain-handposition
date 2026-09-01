import { noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import * as ort from 'onnxruntime-web/webgpu';

interface TranscribeRequest {
  type: 'transcribe';
  requestId: string;
  samples: ArrayBuffer;
}

const MODEL_URL = '/models/basic-pitch.onnx';
const WINDOW_SAMPLES = 43_844;
const OVERLAP_SAMPLES = 7_680;
const HOP_SAMPLES = WINDOW_SAMPLES - OVERLAP_SAMPLES;
const OUTPUT_FRAMES = 172;
const OUTPUT_BINS = 88;
const TRIM_FRAMES = 15;
const SAMPLE_RATE = 22_050;
const ANNOTATIONS_FPS = Math.floor(SAMPLE_RATE / 256);
const INPUT_NAME = 'serving_default_input_2:0';
const FRAME_NAME = 'StatefulPartitionedCall:1';
const ONSET_NAME = 'StatefulPartitionedCall:2';

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function post(message: unknown): void {
  self.postMessage(message);
}

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      // WebGPU is the fast path; WASM preserves support on browsers without
      // WebGPU without returning to the former TensorFlow.js CPU backend.
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
    }).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function rows(data: Float32Array, width: number, start: number, end: number): number[][] {
  const result: number[][] = [];
  for (let frame = start; frame < end; frame++) {
    result.push(Array.from(data.subarray(frame * width, (frame + 1) * width)));
  }
  return result;
}

async function transcribe(request: TranscribeRequest): Promise<void> {
  const session = await getSession();
  const audio = new Float32Array(request.samples);
  const paddedLength = Math.max(WINDOW_SAMPLES, audio.length + TRIM_FRAMES * 256);
  const windowCount = Math.max(1, Math.ceil((paddedLength - WINDOW_SAMPLES) / HOP_SAMPLES) + 1);
  const frames: number[][] = [];
  const onsets: number[][] = [];

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const input = new Float32Array(WINDOW_SAMPLES);
    const sourceStart = windowIndex * HOP_SAMPLES - TRIM_FRAMES * 256;
    const copyStart = Math.max(0, sourceStart);
    const copyEnd = Math.min(audio.length, sourceStart + WINDOW_SAMPLES);
    if (copyEnd > copyStart) {
      input.set(audio.subarray(copyStart, copyEnd), copyStart - sourceStart);
    }
    const output = await session.run({
      [INPUT_NAME]: new ort.Tensor('float32', input, [1, WINDOW_SAMPLES, 1]),
    });
    const frameData = output[FRAME_NAME]?.data as Float32Array | undefined;
    const onsetData = output[ONSET_NAME]?.data as Float32Array | undefined;
    if (!frameData || !onsetData) throw new Error('Basic Pitch ONNX outputs are incomplete.');
    const start = windowIndex === 0 ? 0 : TRIM_FRAMES;
    const end = windowIndex === windowCount - 1 ? OUTPUT_FRAMES : OUTPUT_FRAMES - TRIM_FRAMES;
    frames.push(...rows(frameData, OUTPUT_BINS, start, end));
    onsets.push(...rows(onsetData, OUTPUT_BINS, start, end));
    post({
      type: 'transcription-progress',
      requestId: request.requestId,
      progress: (windowIndex + 1) / windowCount,
    });
  }

  const wantedFrames = Math.floor(audio.length * ANNOTATIONS_FPS / SAMPLE_RATE);
  const notes = noteFramesToTime(
    outputToNotesPoly(frames.slice(0, wantedFrames), onsets.slice(0, wantedFrames), 0.32, 0.30, 5),
  ).map((note) => ({
    midi: Math.round(note.pitchMidi),
    startTime: note.startTimeSeconds,
    endTime: note.startTimeSeconds + note.durationSeconds,
    confidence: Math.max(0, Math.min(1, note.amplitude)),
  }));
  post({ type: 'transcription-complete', requestId: request.requestId, notes });
}

void getSession().then(
  () => post({ type: 'ready' }),
  () => post({ type: 'initialization-error' }),
);

self.onmessage = (event: MessageEvent<TranscribeRequest>) => {
  const request = event.data;
  if (request?.type !== 'transcribe' || typeof request.requestId !== 'string') return;
  void transcribe(request).catch(() => {
    post({ type: 'transcription-error', requestId: request.requestId });
  });
};
