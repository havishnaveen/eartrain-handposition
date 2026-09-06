import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/audio/chord-capture-processor.js', import.meta.url), 'utf8');
let Processor;
const context = vm.createContext({
  Float32Array, Math, currentTime: 0, sampleRate: 44100,
  AudioWorkletProcessor: class { port = { postMessage() {} }; },
  registerProcessor: (_name, Class) => { Processor = Class; },
});
new vm.Script(source).runInContext(context);
const processor = new Processor();
const messages = [];
const port = { postMessage: (message) => messages.push(message) };
processor.port.onmessage({ data: { type: 'connect', port } });
processor.port.onmessage({ data: { type: 'listen-chord', targetMidi: [48, 60, 64, 67] } });
for (let quantum = 0; quantum < 40; quantum++) {
  context.currentTime = quantum * 128 / 44100;
  processor.process([[Float32Array.from({ length: 128 }, (_, i) => quantum * 128 + i)]]);
}
const chunks = messages.filter((message) => message.type === 'pcm');
assert.equal(chunks.length, 8, 'The audio thread must bound its pending worker queue.');
assert.equal(chunks[0].samples.length, 512);
assert.equal(chunks[0].samples[511], 511, 'Transport must retain the exact PCM samples.');
assert.ok(Math.abs(chunks[1].time - chunks[0].time - 512 / 44100) < 1e-9,
  'Onset timestamps must use the audio clock, not worker delivery time.');
port.onmessage({ data: { type: 'consumed' } });
for (let i = 0; i < 4; i++) processor.process([[new Float32Array(128)]]);
assert.equal(messages.at(-1).sequence, 11, 'Dropped chunks must expose a gap rather than splice unrelated PCM.');
processor.port.onmessage({ data: { type: 'idle' } });
const count = messages.length;
for (let i = 0; i < 8; i++) processor.process([[new Float32Array(128)]]);
assert.equal(messages.length, count, 'Idle must immediately stop capture.');
assert.doesNotMatch(source, /_toneEvidence|_buildSpectrum/, 'Expensive chord DSP must stay off the audio thread.');
const hook = await readFile(new URL('../src/audio/useDrillAudio.ts', import.meta.url), 'utf8');
assert.ok(hook.indexOf('clicks.slice(0, countInBeats)') < hook.indexOf('schedTimerRef.current = window.setInterval'),
  'Both count-in measures must be scheduled before the UI lookahead loop.');
assert.match(hook, /scheduledClickSourcesRef\.current[\s\S]*source\.stop\(\)/,
  'Abort must cancel pre-scheduled clicks.');
console.log('Chord transport audit passed: lossless bounded PCM, audio-clock timestamps, idle cancellation, and pre-scheduled count-in.');
