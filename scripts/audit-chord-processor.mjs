import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const sampleRate = 44_100;
const quantum = 128;
const source = await readFile(new URL('../public/audio/chord-processor.js', import.meta.url), 'utf8');

function run(targetMidi, playedMidi = [], gainsByMidi = {}) {
  const messages = [];
  let Processor;
  class MockAudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, postMessage: (message) => messages.push(message) };
    }
  }
  const context = vm.createContext({
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    Float32Array,
    Map,
    Math,
    Number,
    Set,
    currentTime: 0,
    sampleRate,
    registerProcessor: (name, ClassDefinition) => {
      assert.equal(name, 'chord-processor');
      Processor = ClassDefinition;
    },
  });
  new vm.Script(source, { filename: 'chord-processor.js' }).runInContext(context);
  const processor = new Processor();
  processor.port.onmessage({ data: { type: 'listen-chord', targetMidi } });

  let randomState = 17;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const duration = 1.35;
  for (let offset = 0; offset < duration * sampleRate; offset += quantum) {
    const frame = new Float32Array(quantum);
    for (let index = 0; index < quantum; index++) {
      const time = (offset + index) / sampleRate;
      let sample = (random() * 2 - 1) * 0.00012;
      if (time >= 0.24) {
        const age = time - 0.24;
        const envelope = Math.min(1, age / 0.012) * Math.exp(-age / 1.9) * 0.014;
        for (const midi of playedMidi) {
          const toneGain = gainsByMidi[midi] ?? 1;
          const fundamental = 440 * 2 ** ((midi - 69) / 12);
          for (let harmonic = 1; harmonic <= 5; harmonic++) {
            const stretched = fundamental * harmonic * (1 + 0.00012 * harmonic * harmonic);
            sample += envelope * toneGain * (1 / harmonic ** 1.15) *
              Math.sin(2 * Math.PI * stretched * time + midi * 0.07);
          }
        }
      }
      frame[index] = sample;
    }
    context.currentTime = offset / sampleRate;
    processor.process([[frame]]);
  }
  return messages;
}

for (const chord of [[48, 52, 55], [60, 64, 67], [59, 63, 66], [71, 75, 78]]) {
  const messages = run(chord, chord);
  assert.ok(messages.some((message) => message.type === 'chord-ready'));
  const found = new Set(messages.filter((message) => message.type === 'chord-tones').flatMap((message) => message.midi));
  assert.deepEqual([...found].sort((a, b) => a - b), chord,
    `The polyphonic analyzer must recover every simultaneous tone in ${chord.join('-')}.`);
  chord.forEach((midi) => {
    const reports = messages.filter((message) =>
      message.type === 'chord-tones' && message.midi.includes(midi)).length;
    assert.ok(reports >= 1, `Held MIDI ${midi} must be reported.`);
    assert.ok(reports <= chord.length,
      `Held MIDI ${midi} must not be emitted repeatedly as fake new attacks.`);
  });
  assert.ok(
    messages.filter((message) => message.type === 'chord-tones').length <= chord.length + 1,
    `One held chord must produce bounded presence edges, not a stream of repeated notes.`,
  );
}

assert.ok(
  run([60, 64, 67], [60, 64, 67], { 60: 1, 64: 0.42, 67: 0.55 })
    .filter((message) => message.type === 'chord-tones')
    .some((message) => [60, 64, 67].every((midi) => message.midi.includes(midi))),
  'A loud root must not hide softly played inner and upper chord tones.',
);

const cMajor = [60, 64, 67];
for (const played of [[60], [64], [67], [60, 64], [60, 67], [64, 67]]) {
  const toneMessages = run(cMajor, played)
    .filter((message) => message.type === 'chord-tones');
  assert.equal(
    toneMessages.some((message) => cMajor.every((midi) => message.midi.includes(midi))),
    false,
    `${played.join('-')} must never be promoted to a complete C-major chord.`,
  );
  const reported = new Set(toneMessages.flatMap((message) => message.midi));
  assert.ok(
    [...reported].every((midi) => played.includes(midi)),
    `${played.join('-')} manufactured an unplayed target tone.`,
  );
}

assert.deepEqual(
  run(cMajor, [59])
    .filter((message) => message.type === 'chord-tones')
    .flatMap((message) => message.midi),
  [],
  'An unrelated B must not satisfy any part of C major.',
);

assert.equal(
  run([60, 64, 67]).filter((message) => message.type === 'chord-tones').length,
  0,
  'Room noise must not produce chord tones.',
);

console.log('Chord processor audit passed: full triads, partial-chord rejection, unrelated-note rejection, and bounded holds.');
