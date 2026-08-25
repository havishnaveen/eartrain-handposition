import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SAMPLE_RATE = 44_100;
const workerSource = await readFile(
  new URL('../public/audio/score-analyzer-worker.js', import.meta.url),
  'utf8',
);

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function synthesize({
  seconds,
  strikes = [],
  clicks = [],
  ambientTones = [],
  speech = [],
  seed = 1,
  room = 0.0002,
}) {
  const samples = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
  const random = makeRandom(seed);
  for (let index = 0; index < samples.length; index++) {
    const time = index / SAMPLE_RATE;
    let value =
      (random() * 2 - 1) * room +
      Math.sin(2 * Math.PI * 60 * time) * 0.00012;
    ambientTones.forEach(({ midi, amplitude }) => {
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      value += amplitude * Math.sin(2 * Math.PI * frequency * time);
    });
    strikes.forEach((strike) => {
      const age = time - strike.time;
      if (age < 0 || age > strike.duration) return;
      const attack = Math.min(1, age / (strike.attack ?? 0.007));
      const releaseLength = Math.min(0.055, strike.duration * 0.35);
      const release = age > strike.duration - releaseLength
        ? Math.max(0, (strike.duration - age) / releaseLength)
        : 1;
      const envelope = strike.amplitude * attack * Math.exp(-age / 0.65) * release;
      const frequency = 440 * Math.pow(2, (strike.midi - 69) / 12) *
        Math.pow(2, (strike.detuneCents ?? 0) / 1200);
      [1, 0.47, 0.24, 0.13, 0.075, 0.04].forEach((gain, partialIndex) => {
        const harmonic = partialIndex + 1;
        const stiffness = 1 + harmonic * harmonic * (strike.stiffness ?? 0.0001);
        value += envelope * gain * Math.sin(
          2 * Math.PI * frequency * harmonic * stiffness * time,
        );
      });
    });
    clicks.forEach((clickTime) => {
      const age = time - clickTime;
      if (age < 0 || age > 0.035) return;
      value += 0.025 * Math.exp(-age / 0.007) * (random() * 2 - 1);
    });
    speech.forEach((utterance) => {
      const age = time - utterance.time;
      const duration = utterance.duration ?? 0.42;
      if (age < 0 || age > duration) return;
      const consonant = Math.max(0, 1 - age / 0.042);
      const voicedAge = Math.max(0, age - 0.024);
      const voicedAttack = Math.min(1, voicedAge / 0.055);
      const release = age > duration - 0.075
        ? Math.max(0, (duration - age) / 0.075)
        : 1;
      const progress = age / duration;
      const baseMidi = (utterance.midi ?? 57) + (utterance.glide ?? 1.1) * progress;
      const baseFrequency =
        440 * Math.pow(2, (baseMidi - 69) / 12) *
        (1 + 0.008 * Math.sin(2 * Math.PI * 5.1 * age));
      const formants = utterance.formants ?? [700, 1220, 2550];
      const amplitude = utterance.amplitude ?? 0.014;
      value += amplitude * consonant * 0.58 * (random() * 2 - 1);
      for (let harmonic = 1; harmonic <= 24; harmonic += 1) {
        const frequency = baseFrequency * harmonic;
        if (frequency > 7600) break;
        const formantWeight = formants.reduce((sum, formant, formantIndex) => {
          const width = [125, 175, 260][formantIndex] ?? 260;
          const distance = (frequency - formant) / width;
          return sum + Math.exp(-0.5 * distance * distance);
        }, 0);
        const gain = (0.14 + formantWeight) / Math.pow(harmonic, 0.82);
        value +=
          amplitude * voicedAttack * release * gain *
          Math.sin(2 * Math.PI * frequency * time + harmonic * 0.21);
      }
    });
    samples[index] = value;
  }
  return samples;
}

function runWorker({ samples, expected, playStartTime = 1, secondsPerBeat = 0.5, realtime = [] }) {
  const messages = [];
  const self = {
    onmessage: null,
    postMessage: (message) => messages.push(message),
  };
  const context = vm.createContext({
    Array,
    ArrayBuffer,
    Error,
    Float32Array,
    Float64Array,
    Infinity,
    Map,
    Math,
    Number,
    Set,
    String,
    self,
  });
  new vm.Script(workerSource, { filename: 'score-analyzer-worker.js' }).runInContext(context);
  assert.equal(typeof self.onmessage, 'function', 'The score worker must register an onmessage handler.');
  self.onmessage({
    data: {
      type: 'analyze',
      requestId: 'audit',
      samples: samples.buffer,
      sampleRate: SAMPLE_RATE,
      captureStartTime: 0,
      playStartTime,
      plan: {
        secondsPerBeat,
        totalBeats: expected.length,
        expectedNotes: expected,
      },
      realtime,
    },
  });
  const result = messages.find((message) => message.type === 'analysis-complete');
  assert.ok(result, `Worker failed: ${messages.find((message) => message.type === 'analysis-error')?.message}`);
  return result;
}

const expectedCde = [60, 62, 64].map((midi, index) => ({ midi, beat: index, beats: 1 }));
const softCde = synthesize({
  seconds: 3.2,
  room: 0.00022,
  clicks: [1, 1.5, 2],
  strikes: [60, 62, 64].map((midi, index) => ({
    midi,
    time: 1 + index * 0.5,
    duration: 0.34,
    amplitude: 0.00095,
  })),
  seed: 2,
});
const softResult = runWorker({ samples: softCde, expected: expectedCde });
assert.deepEqual(
  Array.from(softResult.notes, (note) => note.midi),
  [60, 62, 64],
  'Lossless score-aware analysis must recover quiet C-D-E under metronome bleed.',
);

const upperBMajor = synthesize({
  seconds: 3.2,
  room: 0.0002,
  strikes: [71, 75, 78].map((midi, index) => ({
    midi,
    time: 1 + index * 0.5,
    duration: 0.4,
    amplitude: 0.00115,
    detuneCents: 14,
    stiffness: 0.0006,
  })),
  seed: 71,
});
const upperBMajorResult = runWorker({
  samples: upperBMajor,
  expected: [71, 75, 78].map((midi, index) => ({ midi, beat: index, beats: 1 })),
});
assert.deepEqual(
  Array.from(upperBMajorResult.notes, (note) => note.midi),
  [71, 75, 78],
  'Offline grading must recover detuned, inharmonic B4-D#5-F#5 notes.',
);

// The real-time UI can establish a strict, score-matched note from several
// independent pitch frames even when the offline local-maximum search lands
// one FFT frame away. That note must not vanish from the final report, but
// raw metadata alone is insufficient: the PCM below still contains the key.
const borderlineLiveTake = synthesize({
  seconds: 2.4,
  room: 0.0002,
  strikes: [{ midi: 55, time: 1, duration: 0.62, amplitude: 0.0009 }],
  seed: 2026,
});
const borderlineLiveResult = runWorker({
  samples: borderlineLiveTake,
  expected: [{ midi: 55, beat: 0, beats: 1 }],
  realtime: [{
    midi: 55,
    time: 1.01,
    clarity: 0.72,
    strength: 1.8,
    expectedSlot: 0,
    detectorLane: 'strict',
    scoreContextAccepted: true,
    pianoAttackConfidence: 0.58,
    consensus: 0.75,
    pitchMad: 0.08,
    voiceVeto: false,
    voiceBurst: false,
    harmonicShadow: false,
  }],
});
assert.deepEqual(
  Array.from(borderlineLiveResult.notes, (note) => note.midi),
  [55],
  'A PCM-supported strict bass note shown live must remain in the final grade.',
);
assert.ok(
  borderlineLiveResult.livePreserved === 1 ||
    borderlineLiveResult.notes[0]?.analysisSource === 'reconciled',
  'The final lane must explicitly reconcile or preserve the live bass note.',
);

// Once the strict live detector has already assigned a note to the exact
// written slot, the offline pass may refine it but must never silently erase
// it merely because a lossy/downsampled PCM frame is borderline.
const exactLiveSlotResult = runWorker({
  samples: synthesize({ seconds: 2.2, room: 0.00018, seed: 20260822 }),
  expected: [{ midi: 60, beat: 0, beats: 1 }],
  realtime: [{
    midi: 60,
    time: 1,
    clarity: 0.78,
    strength: 2.1,
    expectedSlot: 0,
    detectorLane: 'strict',
    scoreContextAccepted: true,
    pianoAttackConfidence: 0.69,
    consensus: 0.82,
    pitchMad: 0.06,
    voiceVeto: false,
    voiceBurst: false,
    harmonicShadow: false,
  }],
});
assert.deepEqual(
  Array.from(exactLiveSlotResult.notes, (note) => [note.midi, note.expectedSlot]),
  [[60, 0]],
  'An exact strict note displayed live must remain assigned to its written slot in the report.',
);

// Repeated written pitches are separate musical events. Matching by MIDI and
// proximity alone used to let the first event steal the second event's slot.
const repeatedPitchResult = runWorker({
  samples: synthesize({
    seconds: 2.8,
    room: 0.0002,
    strikes: [
      { midi: 60, time: 1, duration: 0.22, amplitude: 0.004 },
      { midi: 60, time: 1.5, duration: 0.22, amplitude: 0.004 },
    ],
    seed: 6060,
  }),
  expected: [
    { midi: 60, beat: 0, beats: 1 },
    { midi: 60, beat: 1, beats: 1 },
  ],
  realtime: [
    {
      midi: 60, time: 1, clarity: 0.8, strength: 2.4,
      expectedSlot: 0, detectorLane: 'strict', scoreContextAccepted: true,
      pianoAttackConfidence: 0.72, consensus: 0.85, pitchMad: 0.05,
      voiceVeto: false, voiceBurst: false, harmonicShadow: false,
    },
    {
      midi: 60, time: 1.5, clarity: 0.79, strength: 2.3,
      expectedSlot: 1, detectorLane: 'strict', scoreContextAccepted: true,
      pianoAttackConfidence: 0.71, consensus: 0.84, pitchMad: 0.06,
      voiceVeto: false, voiceBurst: false, harmonicShadow: false,
    },
  ],
});
assert.deepEqual(
  Array.from(repeatedPitchResult.notes, (note) => note.expectedSlot).sort((a, b) => a - b),
  [0, 1],
  'Back-to-back equal pitches must retain two distinct written-slot assignments.',
);

const quietBassC = synthesize({
  seconds: 2.4,
  room: 0.0002,
  strikes: [{ midi: 48, time: 1, duration: 0.62, amplitude: 0.0013 }],
  seed: 2048,
});
assert.deepEqual(
  Array.from(runWorker({
    samples: quietBassC,
    expected: [{ midi: 48, beat: 0, beats: 1 }],
    realtime: [{
      midi: 48,
      time: 1.01,
      clarity: 0.7,
      strength: 1.6,
      expectedSlot: 0,
      detectorLane: 'context-recovery',
      scoreContextAccepted: true,
      pianoAttackConfidence: 0.46,
      consensus: 0.68,
      pitchMad: 0.12,
      voiceVeto: false,
      voiceBurst: false,
      harmonicShadow: false,
    }],
  }).notes, (note) => note.midi),
  [48],
  'The final analyzer must preserve a PCM-confirmed quiet C3 recovery.',
);

const silence = synthesize({ seconds: 3.2, clicks: [1, 1.5, 2], seed: 3 });
const inventedRealtime = [
  { midi: 60, time: 1.01, clarity: 0.6, strength: 2 },
  { midi: 67, time: 1.51, clarity: 0.7, strength: 3 },
];
const silenceResult = runWorker({
  samples: silence,
  expected: expectedCde,
  realtime: inventedRealtime,
});
assert.equal(
  silenceResult.notes.length,
  0,
  'Clicks and room noise must not preserve invented real-time notes.',
);

const spokenTake = synthesize({
  seconds: 3.2,
  speech: [
    { time: 0.98, duration: 0.44, midi: 60, glide: 1.3, amplitude: 0.014 },
    { time: 1.52, duration: 0.46, midi: 57, glide: -1.1, amplitude: 0.013 },
    { time: 2.05, duration: 0.4, midi: 64, glide: 0.9, amplitude: 0.012 },
  ],
  seed: 303,
});
const spokenResult = runWorker({
  samples: spokenTake,
  expected: expectedCde,
  realtime: [
    { midi: 60, time: 1.01, clarity: 0.65, strength: 3 },
    { midi: 57, time: 1.55, clarity: 0.62, strength: 3 },
    { midi: 64, time: 2.06, clarity: 0.66, strength: 3 },
  ],
});
assert.equal(
  spokenResult.notes.length,
  0,
  'Speech-like consonant-to-vowel events must not survive final score analysis.',
);

const pitchedRoom = synthesize({
  seconds: 3.2,
  clicks: [1, 1.5, 2],
  ambientTones: [{ midi: 60, amplitude: 0.0012 }],
  seed: 31,
});
const pitchedRoomResult = runWorker({
  samples: pitchedRoom,
  expected: expectedCde,
  realtime: [{ midi: 60, time: 1, clarity: 0.7, strength: 3 }],
});
assert.equal(
  pitchedRoomResult.notes.length,
  0,
  'A steady pitched background tone must not become a fresh piano attack.',
);

const missingMiddle = synthesize({
  seconds: 3.2,
  strikes: [
    { midi: 60, time: 1, duration: 0.34, amplitude: 0.007 },
    { midi: 64, time: 2, duration: 0.34, amplitude: 0.007 },
  ],
  clicks: [1, 1.5, 2],
  seed: 4,
});
const missingResult = runWorker({ samples: missingMiddle, expected: expectedCde });
assert.deepEqual(
  Array.from(missingResult.notes, (note) => note.midi),
  [60, 64],
  'Score context must recover evidence, never manufacture an acoustically absent middle note.',
);

const overtoneOnly = synthesize({
  seconds: 3.2,
  strikes: [{ midi: 60, time: 1, duration: 1.7, amplitude: 0.009 }],
  seed: 404,
});
const overtoneOnlyResult = runWorker({
  samples: overtoneOnly,
  expected: [
    { midi: 60, beat: 0, beats: 3 },
    { midi: 67, beat: 1, beats: 1 },
  ],
});
assert.deepEqual(
  Array.from(overtoneOnlyResult.notes, (note) => note.midi),
  [60],
  'The third partial of one held C must not be hallucinated as a newly struck G.',
);

const overtoneWithRealAttack = synthesize({
  seconds: 3.2,
  strikes: [
    { midi: 60, time: 1, duration: 1.7, amplitude: 0.009 },
    { midi: 67, time: 1.5, duration: 0.5, amplitude: 0.0048 },
  ],
  seed: 405,
});
const overtoneWithRealAttackResult = runWorker({
  samples: overtoneWithRealAttack,
  expected: [
    { midi: 60, beat: 0, beats: 3 },
    { midi: 67, beat: 1, beats: 1 },
  ],
});
assert.deepEqual(
  Array.from(overtoneWithRealAttackResult.notes, (note) => note.midi),
  [60, 67],
  'A real soft G hammer attack over a held C must survive harmonic-shadow rejection.',
);

const wrongMiddle = synthesize({
  seconds: 3.2,
  strikes: [60, 66, 64].map((midi, index) => ({
    midi,
    time: 1 + index * 0.5,
    duration: 0.34,
    amplitude: 0.007,
  })),
  clicks: [1, 1.5, 2],
  seed: 41,
});
const wrongResult = runWorker({ samples: wrongMiddle, expected: expectedCde });
assert.deepEqual(
  Array.from(wrongResult.notes, (note) => note.midi),
  [60, 66, 64],
  'A confident wrong middle key must be reported as played, not bent into the expected pitch.',
);

const sustained = synthesize({
  seconds: 3.5,
  strikes: [{ midi: 60, time: 1, duration: 1.65, amplitude: 0.007 }],
  seed: 5,
});
const sustainResult = runWorker({
  samples: sustained,
  expected: [{ midi: 60, beat: 0, beats: 3 }],
});
assert.equal(sustainResult.notes.length, 1, 'A long held note must be retained once.');
assert.ok(
  sustainResult.notes[0].lastSustainTime - sustainResult.notes[0].time > 1.15,
  'The offline pass must prove continued harmonic sustain beyond one second.',
);

const heldAgainstRepeatPlan = runWorker({
  samples: sustained,
  expected: [
    { midi: 60, beat: 0, beats: 1 },
    { midi: 60, beat: 1, beats: 1 },
  ],
});
assert.equal(
  heldAgainstRepeatPlan.notes.length,
  1,
  'One held C must not satisfy two back-to-back written C attacks.',
);

const repeatedC = synthesize({
  seconds: 3.1,
  strikes: [
    { midi: 60, time: 1, duration: 0.82, amplitude: 0.007 },
    { midi: 60, time: 1.5, duration: 0.48, amplitude: 0.0048 },
  ],
  seed: 55,
});
const repeatedCResult = runWorker({
  samples: repeatedC,
  expected: [
    { midi: 60, beat: 0, beats: 1 },
    { midi: 60, beat: 1, beats: 1 },
  ],
});
assert.deepEqual(
  Array.from(repeatedCResult.notes, (note) => note.midi),
  [60, 60],
  'A softer second C with a fresh hammer attack must remain two notes even while the first rings.',
);

const rapidExpected = [60, 62, 64, 65, 67].map((midi, index) => ({
  midi,
  beat: index * 0.25,
  beats: 0.25,
}));
const rapid = synthesize({
  seconds: 2.6,
  strikes: rapidExpected.map((slot) => ({
    midi: slot.midi,
    time: 1 + slot.beat * 0.5,
    duration: 0.1,
    amplitude: 0.008,
    attack: 0.004,
  })),
  seed: 6,
});
const rapidResult = runWorker({ samples: rapid, expected: rapidExpected });
assert.deepEqual(
  Array.from(rapidResult.notes, (note) => note.midi),
  [60, 62, 64, 65, 67],
  'The multi-pass analyzer must keep every 120-BPM sixteenth in order.',
);

const lateStrikeTime = 1.12;
const lateStrike = synthesize({
  seconds: 2.4,
  strikes: [{ midi: 60, time: lateStrikeTime, duration: 0.4, amplitude: 0.005 }],
  seed: 7,
});
const lateResult = runWorker({
  samples: lateStrike,
  expected: [{ midi: 60, beat: 0, beats: 1 }],
});
assert.equal(lateResult.notes.length, 1, 'A late correct pitch must still be identified.');
assert.ok(
  Math.abs(lateResult.notes[0].time - lateStrikeTime) < 0.025,
  `Offline recovery must preserve timing error instead of snapping to the score (${lateResult.notes[0].time}).`,
);

console.log(
  'Score analyzer audit passed: quiet recovery, speech/click/steady-tone rejection, ' +
  'missing-note honesty, independent wrong-note identification, long sustain, ' +
  'same-pitch hold/re-attack separation, honest off-beat timing, and 120-BPM sixteenths.',
);
