import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url';
import modelWeightsUrl from '@spotify/basic-pitch/model/group1-shard1of1.bin?url';
import type { DetectedNote, DrillPlan } from './timing';
import { pitchToMidi } from './timing';

export interface SpotifyNote {
  midi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  amplitude: number;
}

let enginePromise: Promise<{
  evaluate(samples: Float32Array): Promise<SpotifyNote[]>;
}> | null = null;

async function createEngine() {
  const [basicPitchModule, tf] = await Promise.all([
    import('@spotify/basic-pitch'),
    import('@tensorflow/tfjs'),
  ]);
  let response: Response;
  try {
    response = await fetch(modelJsonUrl);
  } catch (error) {
    throw new Error('Basic Pitch model metadata could not be fetched.', { cause: error });
  }
  if (!response.ok) throw new Error(`Basic Pitch model metadata failed: ${response.status}`);
  const modelDefinition = await response.json() as {
    modelTopology?: object;
    weightsManifest?: Array<{ weights?: unknown[] }>;
  };
  if (!modelDefinition.modelTopology || !modelDefinition.weightsManifest?.[0]?.weights) {
    throw new Error('Basic Pitch model manifest is missing its weights.');
  }
  const weightsResponse = await fetch(modelWeightsUrl);
  if (!weightsResponse.ok) {
    throw new Error(`Basic Pitch model weights failed: ${weightsResponse.status}`);
  }
  const modelArtifacts = {
    modelTopology: modelDefinition.modelTopology,
    weightSpecs: modelDefinition.weightsManifest.flatMap((group) => group.weights ?? []),
    weightData: await weightsResponse.arrayBuffer(),
  } as Parameters<typeof tf.io.fromMemory>[0];
  const engine = new basicPitchModule.BasicPitch(
    tf.loadGraphModel(tf.io.fromMemory(modelArtifacts)),
  );
  try {
    await engine.model;
  } catch (error) {
    throw new Error('Basic Pitch model weights could not be loaded.', { cause: error });
  }
  return {
    async evaluate(samples: Float32Array): Promise<SpotifyNote[]> {
      const frames: number[][] = [];
      const onsets: number[][] = [];
      const contours: number[][] = [];
      await engine.evaluateModel(
        samples,
        (nextFrames, nextOnsets, nextContours) => {
          frames.push(...nextFrames);
          onsets.push(...nextOnsets);
          contours.push(...nextContours);
        },
        () => undefined,
      );
      const events = basicPitchModule.outputToNotesPoly(
        frames,
        onsets,
        0.32,
        0.30,
        5,
      );
      return basicPitchModule.noteFramesToTime(events).map((note) => ({
        midi: Math.round(note.pitchMidi),
        startTimeSeconds: note.startTimeSeconds,
        durationSeconds: note.durationSeconds,
        amplitude: note.amplitude,
      }));
    },
  };
}

function getEngine() {
  if (!enginePromise) {
    enginePromise = createEngine().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

/** Load the local model after microphone setup, before the grading screen. */
export async function warmBasicPitch(): Promise<void> {
  await getEngine();
}

async function resampleForBasicPitch(
  samples: Float32Array,
  sampleRate: number,
): Promise<Float32Array> {
  const targetRate = 22_050;
  if (Math.abs(sampleRate - targetRate) < 1) return samples;
  const frameCount = Math.max(1, Math.ceil(samples.length * targetRate / sampleRate));
  const context = new OfflineAudioContext(1, frameCount, targetRate);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0).slice();
}

/**
 * Add only score-supported notes that the primary piano detector missed.
 * Basic Pitch is independent evidence, not permission to snap arbitrary room
 * noise to the score and never permission to duplicate an existing onset.
 */
export function mergeSpotifyRecoveries(
  primary: readonly DetectedNote[],
  spotify: readonly SpotifyNote[],
  plan: DrillPlan,
  captureStartTime: number,
  playStartTime: number,
): { notes: DetectedNote[]; recovered: number } {
  const merged = [...primary];
  const usedSpotify = new Set<number>();
  const coveredPrimary = new Set<number>();
  const slots = plan.expectedNotes.map((slot) => ({
    ...slot,
    midi: pitchToMidi(slot.pitch),
    expectedTime: playStartTime + slot.beat * plan.secondsPerBeat,
  }));
  const matchWindow = Math.max(0.32, Math.min(0.9, plan.secondsPerBeat * 0.9));

  slots.forEach((slot) => {
    if (slot.midi === null) return;
    const primaryIndex = primary.findIndex((note, index) => (
      !coveredPrimary.has(index) &&
      note.midi === slot.midi &&
      Math.abs(note.time - slot.expectedTime) <= matchWindow
    ));
    if (primaryIndex >= 0) {
      coveredPrimary.add(primaryIndex);
      return;
    }

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    spotify.forEach((note, index) => {
      if (usedSpotify.has(index) || note.midi !== slot.midi || note.amplitude < 0.22) return;
      const absoluteTime = captureStartTime + note.startTimeSeconds;
      const distance = Math.abs(absoluteTime - slot.expectedTime);
      if (distance <= matchWindow && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    if (bestIndex < 0) return;
    usedSpotify.add(bestIndex);
    const recovered = spotify[bestIndex];
    merged.push({
      midi: recovered.midi,
      time: captureStartTime + recovered.startTimeSeconds,
      endTime: captureStartTime + recovered.startTimeSeconds + recovered.durationSeconds,
      clarity: Math.max(0.62, recovered.amplitude),
      strength: Math.max(0.001, recovered.amplitude),
      analysisSource: 'offline-recovered',
      analysisConfidence: Math.max(0, Math.min(1, recovered.amplitude)),
      detectorLane: 'offline-recovered',
      durationConfidence: 0.82,
    });
  });

  merged.sort((a, b) => a.time - b.time);
  return { notes: merged, recovered: usedSpotify.size };
}

export async function analyzeWithBasicPitch(
  samples: Float32Array,
  sampleRate: number,
): Promise<SpotifyNote[]> {
  if (typeof OfflineAudioContext === 'undefined') return [];
  const resampled = await resampleForBasicPitch(samples, sampleRate);
  return (await getEngine()).evaluate(resampled);
}
