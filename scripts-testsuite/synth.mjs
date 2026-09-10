// Physically-modeled piano synthesis + WAV encoder, shared by the fixture
// builder. The synthesis technique (inharmonic partials, hammer attack,
// exponential decay envelope, detuned upper partials) is the SAME one this
// project's own scripts/audit-pitch-processor.mjs already uses as its
// "realistic, not idealized" acoustic model -- reused here rather than
// invented fresh, and documented as synthesized (not an acoustic recording)
// in the final report.

export const SAMPLE_RATE = 44100;

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// One struck note. `time`/`duration` in seconds, relative to buffer start.
function renderStrike(buffer, sampleRate, { midi, time, duration, amplitude = 0.22 }) {
  const startSample = Math.max(0, Math.floor(time * sampleRate));
  const durSamples = Math.floor(duration * sampleRate);
  const tailSamples = Math.floor(0.35 * sampleRate); // let the string ring out
  const endSample = Math.min(buffer.length, startSample + durSamples + tailSamples);
  const frequency = midiToFreq(midi);
  const attackSec = 0.006 + (Math.abs(midi - 60) % 5) * 0.0004;
  const releaseSec = Math.min(0.07, duration * 0.3);
  // Slightly detuned, decaying upper partials -- real string stiffness --
  // rather than a pure harmonic series, so the detector is never tested only
  // against idealized sine harmonics.
  const partials = [1, 0.5, 0.27, 0.15, 0.09, 0.05, 0.03];
  for (let i = startSample; i < endSample; i++) {
    const t = (i - startSample) / sampleRate;
    const age = t;
    const attack = Math.min(1, age / attackSec);
    const bodyDecay = Math.exp(-age / (0.9 + duration * 0.55));
    const release = age > duration - releaseSec
      ? Math.max(0, (duration - age) / releaseSec)
      : 1;
    const envelope = amplitude * attack * bodyDecay * (age > duration ? Math.max(0, 1 - (age - duration) / 0.35) : release);
    let sample = 0;
    partials.forEach((gain, index) => {
      const harmonic = index + 1;
      const inharmonicity = 1 + 0.00013 * harmonic * harmonic;
      sample += gain * Math.sin(2 * Math.PI * frequency * harmonic * inharmonicity * t);
    });
    // A faint hammer-noise transient right at the attack.
    if (age < 0.012) sample += (Math.random() * 2 - 1) * 0.05 * (1 - age / 0.012);
    buffer[i] += envelope * sample;
  }
}

/**
 * Render a full "performance" as one mono Float32 buffer: every expected
 * note struck at its written beat, silence (true rests) elsewhere, plus a
 * low-level room-noise bed so the detector's noise gate is exercised too
 * (a bone-dry, perfectly silent recording is itself unrealistic).
 *
 * `notes`: [{ midis: number[], time: number, duration: number }] -- midis is
 * an array so simultaneous (chord) notes at the same beat render together.
 */
export function renderPerformance(notes, totalSeconds, { seed = 1, amplitude = 0.22 } = {}) {
  const length = Math.ceil(totalSeconds * SAMPLE_RATE) + Math.floor(0.4 * SAMPLE_RATE);
  const buffer = new Float32Array(length);
  const random = makeRandom(seed);
  // Room noise bed.
  for (let i = 0; i < length; i++) buffer[i] += (random() * 2 - 1) * 0.0009;
  for (const note of notes) {
    for (const midi of note.midis) {
      renderStrike(buffer, SAMPLE_RATE, {
        midi,
        time: note.time,
        duration: note.duration,
        amplitude: amplitude / Math.sqrt(note.midis.length),
      });
    }
  }
  // Normalize to a sane peak so different lessons are comparably "played".
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(buffer[i]));
  if (peak > 0) {
    const target = 0.55;
    const gain = target / peak;
    for (let i = 0; i < length; i++) buffer[i] *= gain;
  }
  return buffer;
}

export function encodeWav(float32, sampleRate = SAMPLE_RATE) {
  const numSamples = float32.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buffer.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buffer;
}
