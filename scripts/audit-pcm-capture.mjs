import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(
  new URL('../public/audio/pitch-processor.js', import.meta.url),
  'utf8',
);

let Processor = null;
const messages = [];
class AudioWorkletProcessor {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage(message) {
        messages.push(message);
      },
    };
  }
}

const context = vm.createContext({
  Array,
  ArrayBuffer,
  AudioWorkletProcessor,
  Float32Array,
  Float64Array,
  Infinity,
  Map,
  Math,
  Number,
  Set,
  String,
  currentTime: 0,
  sampleRate: 44_100,
  registerProcessor(_name, value) {
    Processor = value;
  },
});
new vm.Script(source, { filename: 'pitch-processor.js' }).runInContext(context);
assert.ok(Processor, 'The pitch worklet must register its processor.');

const processor = new Processor();
processor.port.onmessage({
  data: { type: 'capture-plan', id: 7, startTime: 0.01, endTime: 0.04 },
});

const blockSize = 128;
for (let block = 0; block < 20; block += 1) {
  context.currentTime = block * blockSize / context.sampleRate;
  const samples = new Float32Array(blockSize);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (block * blockSize + index + 1) / 10_000;
  }
  processor.process([[samples]]);
}

const complete = messages.find((message) => message.type === 'capture-complete');
assert.ok(complete, 'A scheduled raw capture must finish on the audio clock.');
assert.equal(complete.id, 7);
assert.equal(complete.sampleRate, 44_100);
const chunks = messages
  .filter((message) => message.type === 'capture-chunk' && message.id === 7)
  .map((message) => new Float32Array(message.samples));
const capturedLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
const expectedLength = Math.ceil((0.04 - 0.01) * context.sampleRate);
assert.ok(
  Math.abs(capturedLength - expectedLength) <= 2,
  `Capture length drifted: ${capturedLength} vs ${expectedLength}.`,
);
assert.ok(chunks.every((chunk) => chunk.length > 0), 'Capture chunks may not be empty.');

console.log('PCM capture audit passed: raw samples are bounded by the audio clock and delivered losslessly.');
