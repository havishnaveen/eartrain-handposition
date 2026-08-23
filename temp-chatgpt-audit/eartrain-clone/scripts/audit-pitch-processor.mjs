import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SAMPLE_RATE = 44_100;
const QUANTUM = 128;
const source = await readFile(new URL('../public/audio/pitch-processor.js', import.meta.url), 'utf8');

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeProcessor() {
  const messages = [];
  let Processor = null;
  class MockAudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (message) => messages.push(message),
      };
    }
  }
  const context = vm.createContext({
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    Float32Array,
    Map,
    Math,
    Number,
    Set,
    console,
    currentTime: 0,
    registerProcessor: (_name, ClassDefinition) => {
      Processor = ClassDefinition;
    },
    sampleRate: SAMPLE_RATE,
  });
  new vm.Script(source, { filename: 'pitch-processor.js' }).runInContext(context);
  assert.ok(Processor, 'The worklet must register pitch-processor.');
  return { context, messages, processor: new Processor() };
}

function pianoSample(strikes, time) {
  let sample = 0;
  for (const strike of strikes) {
    const age = time - strike.time;
    if (age < 0 || age > strike.duration) continue;
    const attack = Math.min(1, age / 0.009);
    const decay = Math.exp(-age / Math.max(0.28, strike.duration * 0.72));
    const release = age > strike.duration - 0.055
      ? Math.max(0, (strike.duration - age) / 0.055)
      : 1;
    const envelope = strike.amplitude * attack * decay * release;
    const frequency = 440 * Math.pow(2, (strike.midi - 69) / 12);
    const partials = [1, 0.48, 0.25, 0.14, 0.08];
    partials.forEach((gain, index) => {
      const harmonic = index + 1;
      sample += envelope * gain * Math.sin(2 * Math.PI * frequency * harmonic * time);
    });
  }
  return sample;
}

function runScenario({ seconds, strikes = [], listenAt = 1.7, seed = 1 }) {
  const { context, messages, processor } = makeProcessor();
  const random = makeRandom(seed);
  const totalSamples = Math.ceil(seconds * SAMPLE_RATE);
  let listening = false;
  for (let offset = 0; offset < totalSamples; offset += QUANTUM) {
    const frame = new Float32Array(QUANTUM);
    for (let index = 0; index < QUANTUM; index += 1) {
      const sampleIndex = offset + index;
      const time = sampleIndex / SAMPLE_RATE;
      const room =
        (random() * 2 - 1) * 0.00016 +
        Math.sin(2 * Math.PI * 60 * time) * 0.00011;
      frame[index] = room + pianoSample(strikes, time);
    }
    context.currentTime = offset / SAMPLE_RATE;
    if (!listening && context.currentTime >= listenAt) {
      listening = true;
      processor.port.onmessage({ data: { type: 'listen' } });
    }
    processor.process([[frame]]);
  }
  processor.port.onmessage({ data: { type: 'idle' } });
  return messages.filter((message) =>
    message.type === 'note-onset' || message.type === 'note-candidate');
}

const midiOf = (event) => Math.round(69 + 12 * Math.log2(event.frequency / 440));

const quietRoom = runScenario({ seconds: 4.2, strikes: [] });
assert.equal(quietRoom.length, 0, 'Stationary room sound must not create notes.');

const sustained = runScenario({
  seconds: 5,
  strikes: [{ midi: 60, time: 2.05, duration: 2.25, amplitude: 0.018 }],
  seed: 2,
});
assert.equal(sustained.length, 1, 'One sustained C must create exactly one onset.');
assert.equal(midiOf(sustained[0]), 60, 'The sustained C must remain C, not wandering partials.');

const softSequence = runScenario({
  seconds: 4.8,
  strikes: [
    { midi: 60, time: 2.02, duration: 0.36, amplitude: 0.0038 },
    { midi: 62, time: 2.52, duration: 0.36, amplitude: 0.0036 },
    { midi: 64, time: 3.02, duration: 0.36, amplitude: 0.0037 },
  ],
  seed: 3,
});
assert.deepEqual(
  softSequence.map(midiOf),
  [60, 62, 64],
  'Soft intentional C-D-E strikes must survive the noise gate in order.',
);

const repeated = runScenario({
  seconds: 4.8,
  strikes: [
    { midi: 67, time: 2.02, duration: 0.48, amplitude: 0.014 },
    { midi: 67, time: 2.76, duration: 0.48, amplitude: 0.013 },
  ],
  seed: 4,
});
assert.deepEqual(
  repeated.map(midiOf),
  [67, 67],
  'A real same-key release and re-attack must produce two—not one or three—events.',
);

console.log('Pitch processor audit passed: quiet room, soft notes, sustain stability, and re-attacks.');
