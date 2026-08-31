import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url';
import modelWeightsUrl from '@spotify/basic-pitch/model/group1-shard1of1.bin?url';
import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from '@spotify/basic-pitch';
import * as tf from '@tensorflow/tfjs';

interface TranscribeRequest {
  type: 'transcribe';
  requestId: string;
  samples: ArrayBuffer;
}

let enginePromise: Promise<BasicPitch> | null = null;

function post(message: unknown): void {
  self.postMessage(message);
}

async function createEngine(): Promise<BasicPitch> {
  const [modelResponse, weightsResponse] = await Promise.all([
    fetch(modelJsonUrl),
    fetch(modelWeightsUrl),
  ]);
  if (!modelResponse.ok || !weightsResponse.ok) {
    throw new Error('Spotify Basic Pitch model assets could not be loaded.');
  }
  const definition = await modelResponse.json() as {
    modelTopology?: object;
    weightsManifest?: Array<{ weights?: unknown[] }>;
  };
  if (!definition.modelTopology || !definition.weightsManifest?.[0]?.weights) {
    throw new Error('Spotify Basic Pitch model manifest is incomplete.');
  }
  await tf.setBackend('cpu');
  await tf.ready();
  const model = tf.loadGraphModel(tf.io.fromMemory({
    modelTopology: definition.modelTopology,
    weightSpecs: definition.weightsManifest.flatMap((group) => group.weights ?? []),
    weightData: await weightsResponse.arrayBuffer(),
  } as Parameters<typeof tf.io.fromMemory>[0]));
  const engine = new BasicPitch(model);
  await engine.model;
  return engine;
}

function getEngine(): Promise<BasicPitch> {
  if (!enginePromise) {
    enginePromise = createEngine().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

void getEngine().then(
  () => post({ type: 'ready' }),
  () => post({ type: 'initialization-error' }),
);

self.onmessage = (event: MessageEvent<TranscribeRequest>) => {
  const request = event.data;
  if (request?.type !== 'transcribe' || typeof request.requestId !== 'string') return;
  void getEngine().then(async (engine) => {
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await engine.evaluateModel(
      new Float32Array(request.samples),
      (nextFrames, nextOnsets) => {
        frames.push(...nextFrames);
        onsets.push(...nextOnsets);
      },
      (progress) => post({
        type: 'transcription-progress',
        requestId: request.requestId,
        progress,
      }),
    );
    const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.32, 0.30, 5))
      .map((note) => ({
        midi: Math.round(note.pitchMidi),
        startTime: note.startTimeSeconds,
        endTime: note.startTimeSeconds + note.durationSeconds,
        confidence: Math.max(0, Math.min(1, note.amplitude)),
      }));
    post({ type: 'transcription-complete', requestId: request.requestId, notes });
  }).catch(() => {
    post({ type: 'transcription-error', requestId: request.requestId });
  });
};
