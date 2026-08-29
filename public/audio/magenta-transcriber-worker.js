/* Magenta Onsets & Frames runs only here. Never move neural inference to UI. */
const TF_URL = '/vendor/magenta/tf.min.js';
const MAGENTA_URL = '/vendor/magenta/transcription.js';
const CHECKPOINT = 'https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni_q2';
const TARGET_RATE = 16000;
const FRAME_LENGTH = 2048;
const HOP_LENGTH = 512;
const MEL_BINS = 229;

let modelPromise = null;
let melWeights = null;

function initialize() {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    // Magenta's bundled environment guard rejects workers even when callers
    // use `transcribeFromMelSpec` (which needs no OfflineAudioContext). Shadow
    // only that feature test; raw-audio decoding remains outside this worker.
    try { Object.defineProperty(self, 'WorkerGlobalScope', { value: undefined }); } catch { /* noop */ }
    // The UMD bundle eagerly allocates one decoder context even though this
    // lane supplies mel frames directly. A non-decoding stub lets the module
    // load without pretending Web Audio exists in a worker.
    self.OfflineAudioContext = class OfflineAudioContextStub {
      constructor(_channels, _length, sampleRate) { this.sampleRate = sampleRate; }
      decodeAudioData() { return Promise.reject(new Error('Audio decoding is disabled in the transcription worker')); }
    };
    // TFJS 2.x resolves its fetch adapter through `window` even in a worker.
    // The worker global already supplies the standards-compatible fetch API.
    self.window = self;
    importScripts(TF_URL);
    self.tf.setPlatform('eartrain-worker', {
      fetch: (...args) => self.fetch(...args),
      now: () => self.performance.now(),
      encode: (text, encoding) => {
        if (encoding !== 'utf-8' && encoding !== 'utf8') throw new Error(`Unsupported encoding: ${encoding}`);
        return new TextEncoder().encode(text);
      },
      decode: (bytes, encoding) => {
        if (encoding !== 'utf-8' && encoding !== 'utf8') throw new Error(`Unsupported encoding: ${encoding}`);
        return new TextDecoder().decode(bytes);
      },
    });
    importScripts(MAGENTA_URL);
    const Constructor = self.transcription?.OnsetsAndFrames;
    if (!Constructor || !self.tf) throw new Error('Magenta transcription bundle unavailable');
    const model = new Constructor(CHECKPOINT, 250);
    await model.initialize();
    return model;
  })();
  return modelPromise;
}

function resampleLinear(samples, sourceRate) {
  if (sourceRate === TARGET_RATE) return samples;
  const length = Math.max(1, Math.round(samples.length * TARGET_RATE / sourceRate));
  const output = new Float32Array(length);
  const ratio = sourceRate / TARGET_RATE;
  for (let index = 0; index < length; index += 1) {
    const source = index * ratio;
    const left = Math.min(samples.length - 1, Math.floor(source));
    const right = Math.min(samples.length - 1, left + 1);
    const blend = source - left;
    output[index] = samples[left] * (1 - blend) + samples[right] * blend;
  }
  return output;
}

function buildMelWeights() {
  const spectrumBins = FRAME_LENGTH / 2 + 1;
  const hzToMel = (hz) => 1127 * Math.log(1 + hz / 700);
  const melToHz = (mel) => 700 * (Math.exp(mel / 1127) - 1);
  const lowMel = hzToMel(30);
  const highMel = hzToMel(TARGET_RATE / 2);
  const edges = Array.from({ length: MEL_BINS + 2 }, (_, index) =>
    melToHz(lowMel + (highMel - lowMel) * index / (MEL_BINS + 1))
  );
  const values = new Float32Array(spectrumBins * MEL_BINS);
  for (let bin = 0; bin < spectrumBins; bin += 1) {
    const hz = bin * TARGET_RATE / FRAME_LENGTH;
    for (let mel = 0; mel < MEL_BINS; mel += 1) {
      const left = edges[mel];
      const center = edges[mel + 1];
      const right = edges[mel + 2];
      const weight = hz <= left || hz >= right
        ? 0
        : hz <= center
          ? (hz - left) / Math.max(1e-9, center - left)
          : (right - hz) / Math.max(1e-9, right - center);
      values[bin * MEL_BINS + mel] = Math.max(0, weight);
    }
  }
  return self.tf.tensor2d(values, [spectrumBins, MEL_BINS]);
}

async function melSpectrogram(samples, sourceRate) {
  const resampled = resampleLinear(samples, sourceRate);
  const tensor = self.tf.tensor1d(resampled);
  if (!melWeights) melWeights = buildMelWeights();
  const mel = self.tf.tidy(() => {
    const stft = self.tf.signal.stft(
      tensor,
      FRAME_LENGTH,
      HOP_LENGTH,
      FRAME_LENGTH,
      self.tf.signal.hannWindow,
    );
    const power = self.tf.square(self.tf.abs(stft));
    return self.tf.matMul(power, melWeights).add(1e-6).log().mul(10 / Math.LN10);
  });
  tensor.dispose();
  const values = await mel.array();
  mel.dispose();
  return values;
}

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type === 'initialize') {
    try {
      await initialize();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'initialization-error', message: String(error?.stack || error?.message || error) });
    }
    return;
  }
  if (data.type !== 'transcribe' || typeof data.requestId !== 'string') return;
  try {
    const model = await initialize();
    const samples = new Float32Array(data.samples);
    const mel = await melSpectrogram(samples, Number(data.sampleRate) || 48000);
    const sequence = await model.transcribeFromMelSpec(mel, 4);
    const notes = (sequence.notes || []).map((note) => ({
      midi: Number(note.pitch),
      startTime: Number(note.startTime) || 0,
      endTime: Number(note.endTime) || Number(note.startTime) || 0,
      confidence: Math.min(1, Math.max(0.35, (Number(note.velocity) || 64) / 127)),
    }));
    self.postMessage({ type: 'transcription-complete', requestId: data.requestId, notes });
  } catch (error) {
    self.postMessage({ type: 'transcription-error', requestId: data.requestId, message: String(error?.message || error) });
  }
};
