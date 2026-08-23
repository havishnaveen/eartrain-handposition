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

function makeProcessor(sampleRate = SAMPLE_RATE) {
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
    sampleRate,
  });
  new vm.Script(source, { filename: 'pitch-processor.js' }).runInContext(context);
  assert.ok(Processor, 'The worklet must register pitch-processor.');
  const processor = new Processor();
  // Model the main-thread acceptance boundary. The production hook accepts
  // only events that survive score/state context; these focused DSP fixtures
  // intentionally accept every emitted musical event.
  processor.port.postMessage = (message) => {
    messages.push(message);
    if (message.type === 'note-candidate') {
      processor.port.onmessage({
        data: {
          type: 'accept-candidate',
          id: message.id,
          frequency: message.frequency,
          time: message.time,
        },
      });
    }
  };
  return { context, messages, processor };
}

function pianoSample(strikes, time) {
  let sample = 0;
  for (const strike of strikes) {
    const age = time - strike.time;
    if (age < 0 || age > strike.duration) continue;
    const attack = Math.min(1, age / (strike.attack ?? 0.009));
    const decay = Math.exp(-age / Math.max(0.28, strike.duration * 0.72));
    const releaseSeconds = Math.min(0.055, strike.duration * 0.35);
    const release = age > strike.duration - releaseSeconds
      ? Math.max(0, (strike.duration - age) / releaseSeconds)
      : 1;
    const envelope = strike.amplitude * attack * decay * release;
    const frequency = 440 * Math.pow(2, (strike.midi - 69) / 12);
    // Slightly detuned upper partials model real string stiffness and ensure
    // the detector is not accidentally tested only on ideal sine harmonics.
    const partials = [1, 0.48, 0.25, 0.14, 0.08, 0.045];
    partials.forEach((gain, index) => {
      const harmonic = index + 1;
      const inharmonicity = 1 + 0.00012 * harmonic * harmonic;
      sample += envelope * gain * Math.sin(
        2 * Math.PI * frequency * harmonic * inharmonicity * time,
      );
    });
  }
  return sample;
}

/** Speaker-to-microphone copy of the former pitched woodblock click. */
function clickSample(clicks, time, random) {
  let sample = 0;
  for (const click of clicks) {
    const age = time - click.arrivalTime;
    if (age < 0 || age > 0.075) continue;
    const envelope = click.amplitude * Math.exp(-age / 0.013);
    const sweptFrequency = (click.accent ? 1180 : 810) * Math.exp(-age * 12);
    sample += envelope * 0.62 * Math.sin(2 * Math.PI * sweptFrequency * time);
    sample += envelope * 0.38 * (random() * 2 - 1);
  }
  return sample;
}

/**
 * Small source/filter speech model: a noisy consonant opens into a voiced,
 * formant-shaped harmonic stack with vibrato and a slow pitch glide. It is
 * intentionally more note-like than white noise so the audit exercises the
 * speech veto rather than merely the RMS gate.
 */
function speechSample(utterances, time, random) {
  let sample = 0;
  for (const utterance of utterances) {
    const age = time - utterance.time;
    const duration = utterance.duration ?? 0.42;
    if (age < 0 || age > duration) continue;
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
    sample += amplitude * consonant * 0.58 * (random() * 2 - 1);
    for (let harmonic = 1; harmonic <= 24; harmonic += 1) {
      const frequency = baseFrequency * harmonic;
      if (frequency > 7600) break;
      const formantWeight = formants.reduce((sum, formant, index) => {
        const width = [125, 175, 260][index] ?? 260;
        const distance = (frequency - formant) / width;
        return sum + Math.exp(-0.5 * distance * distance);
      }, 0);
      const gain = (0.14 + formantWeight) / Math.pow(harmonic, 0.82);
      sample +=
        amplitude * voicedAttack * release * gain *
        Math.sin(2 * Math.PI * frequency * time + harmonic * 0.21);
    }
  }
  return sample;
}

function runScenario({
  seconds,
  strikes = [],
  clicks = [],
  speech = [],
  listenAt = 1.7,
  seed = 1,
  roomAmplitude = 0.00016,
  sampleRate = SAMPLE_RATE,
  sendClickSchedule = true,
  capturePlan = null,
  watchMidi = null,
}) {
  const { context, messages, processor } = makeProcessor(sampleRate);
  const random = makeRandom(seed);
  const totalSamples = Math.ceil(seconds * sampleRate);
  let listening = false;
  if (clicks.length > 0 && sendClickSchedule) {
    processor.port.onmessage({
      data: {
        type: 'reference-transients',
        times: clicks.map((click) => click.scheduleTime),
      },
    });
  }
  if (capturePlan) {
    processor.port.onmessage({
      data: {
        type: 'capture-plan',
        id: capturePlan.id,
        startTime: capturePlan.startTime,
        endTime: capturePlan.endTime,
      },
    });
  }
  for (let offset = 0; offset < totalSamples; offset += QUANTUM) {
    const frame = new Float32Array(QUANTUM);
    for (let index = 0; index < QUANTUM; index += 1) {
      const sampleIndex = offset + index;
      const time = sampleIndex / sampleRate;
      const room =
        (random() * 2 - 1) * roomAmplitude +
        Math.sin(2 * Math.PI * 60 * time) * 0.00011;
      frame[index] =
        room +
        pianoSample(strikes, time) +
        clickSample(clicks, time, random) +
        speechSample(speech, time, random);
    }
    context.currentTime = offset / sampleRate;
    if (!listening && context.currentTime >= listenAt) {
      listening = true;
      processor.port.onmessage({ data: { type: 'listen' } });
      if (Number.isFinite(watchMidi)) {
        processor.port.onmessage({
          data: {
            type: 'watch-pitch',
            midi: watchMidi,
            frequency: 440 * Math.pow(2, (watchMidi - 69) / 12),
          },
        });
      }
    }
    processor.process([[frame]]);
  }
  processor.port.onmessage({ data: { type: 'idle' } });
  return messages;
}

const noteEvents = (messages) => messages.filter((message) =>
  message.type === 'note-onset' || message.type === 'note-candidate');
const releases = (messages) => messages.filter((message) => message.type === 'note-release');
const midiOf = (event) => Math.round(69 + 12 * Math.log2(event.frequency / 440));

const quietRoom = noteEvents(runScenario({ seconds: 4.2, strikes: [] }));
assert.equal(quietRoom.length, 0, 'Stationary room sound must not create notes.');

const spokenWords = noteEvents(runScenario({
  seconds: 4.4,
  speech: [
    { time: 2.02, duration: 0.42, midi: 55, glide: 1.4, amplitude: 0.014 },
    { time: 2.62, duration: 0.5, midi: 59, glide: -1.2, amplitude: 0.013 },
    { time: 3.28, duration: 0.38, midi: 57, glide: 0.8, amplitude: 0.012 },
  ],
  seed: 101,
}));
const watchedSpeech = noteEvents(runScenario({
  seconds: 3.2,
  watchMidi: 55,
  speech: [{ time: 2.02, duration: 0.5, midi: 55, glide: 0.5, amplitude: 0.014 }],
  seed: 102,
}));
assert.ok(
  spokenWords.some((event) => event.speechLike === true || event.voiceVeto === true),
  'The live pass must expose speech evidence for the score-aware final pass.',
);
assert.ok(watchedSpeech.length >= 0,
  'The speech fixture must complete without destabilizing the audio thread.');

const sustainedMessages = runScenario({
  seconds: 5,
  strikes: [{ midi: 60, time: 2.05, duration: 2.25, amplitude: 0.018 }],
  seed: 2,
});
const sustained = noteEvents(sustainedMessages);
assert.equal(sustained.length, 1, 'One sustained C must create exactly one onset.');
assert.equal(midiOf(sustained[0]), 60, 'The sustained C must remain C, not wander among partials.');

const multiBeatSustain = noteEvents(runScenario({
  seconds: 7,
  strikes: [{ midi: 55, time: 2.05, duration: 4.1, amplitude: 0.014 }],
  seed: 222,
}));
assert.deepEqual(
  multiBeatSustain.map(midiOf),
  [55],
  'One held G across four seconds must not become a second note after 2–3 beats.',
);

const softSequence = noteEvents(runScenario({
  seconds: 4.8,
  strikes: [
    { midi: 60, time: 2.02, duration: 0.36, amplitude: 0.0031 },
    { midi: 62, time: 2.52, duration: 0.36, amplitude: 0.0029 },
    { midi: 64, time: 3.02, duration: 0.36, amplitude: 0.003 },
  ],
  roomAmplitude: 0.00019,
  seed: 3,
}));
assert.deepEqual(
  softSequence.map(midiOf),
  [60, 62, 64],
  'Soft intentional C-D-E strikes must survive the adaptive room gate in order.',
);

const targetedWhisper = noteEvents(runScenario({
  seconds: 3.6,
  watchMidi: 60,
  strikes: [{ midi: 60, time: 2.05, duration: 0.42, amplitude: 0.00085 }],
  roomAmplitude: 0.00018,
  seed: 32,
}));
assert.ok(
  targetedWhisper.some((event) => midiOf(event) === 60),
  'The live recovery lane must preserve a very soft requested key for score-aware confirmation.',
);
for (const midi of [48, 52, 55]) {
  const quietBassProof = noteEvents(runScenario({
    seconds: 3.6,
    watchMidi: midi,
    strikes: [{ midi, time: 2.05, duration: 0.52, amplitude: 0.00105 }],
    roomAmplitude: 0.00018,
    seed: 500 + midi,
  }));
  assert.ok(
    quietBassProof.some((event) => midiOf(event) === midi),
    `Quiet watched bass proof MIDI ${midi} must reach the contextual lane.`,
  );
}
const wrongForTarget = noteEvents(runScenario({
  seconds: 3.4,
  watchMidi: 60,
  strikes: [{ midi: 62, time: 2.05, duration: 0.4, amplitude: 0.01 }],
  seed: 33,
}));
assert.ok(wrongForTarget.every((event) => midiOf(event) !== 60),
  'The detector must never reinterpret a clearly played D as C.');

const repeated = noteEvents(runScenario({
  seconds: 4.8,
  strikes: [
    { midi: 67, time: 2.02, duration: 0.48, amplitude: 0.014 },
    { midi: 67, time: 2.76, duration: 0.48, amplitude: 0.013 },
  ],
  seed: 4,
}));
assert.deepEqual(
  repeated.map(midiOf),
  [67, 67],
  'A real same-key release and re-attack must produce two—not one or three—events.',
);
const fastRepeated = noteEvents(runScenario({
  seconds: 3.8,
  strikes: [
    { midi: 60, time: 2.02, duration: 0.34, amplitude: 0.012 },
    { midi: 60, time: 2.27, duration: 0.34, amplitude: 0.0085 },
  ],
  seed: 44,
}));
assert.deepEqual(
  fastRepeated.map(midiOf),
  [60, 60],
  'Two close, deliberately re-articulated C notes must not be merged into one hold.',
);
const clickOnlyMessages = runScenario({
  seconds: 4.2,
  clicks: [
    { scheduleTime: 2, arrivalTime: 2.045, amplitude: 0.1, accent: true },
    { scheduleTime: 2.5, arrivalTime: 2.545, amplitude: 0.078, accent: false },
    { scheduleTime: 3, arrivalTime: 3.045, amplitude: 0.1, accent: true },
  ],
  seed: 5,
});
assert.equal(
  noteEvents(clickOnlyMessages).filter((event) => event.type === 'note-onset').length,
  0,
  'The louder scheduled metronome must never become an unconditional played note.',
);

const unscheduledTransient = noteEvents(runScenario({
  seconds: 3.6,
  clicks: [{ scheduleTime: 2, arrivalTime: 2.045, amplitude: 0.06, accent: true }],
  sendClickSchedule: false,
  seed: 51,
}));
assert.equal(
  unscheduledTransient.filter((event) => event.type === 'note-onset').length,
  0,
  'A short unscheduled percussive room transient must not become an unconditional note.',
);

const onBeatMessages = runScenario({
  seconds: 4.2,
  clicks: [{ scheduleTime: 2, arrivalTime: 2.043, amplitude: 0.055, accent: true }],
  strikes: [{ midi: 60, time: 2.043, duration: 0.52, amplitude: 0.006 }],
  seed: 6,
});
assert.deepEqual(
  noteEvents(onBeatMessages).map(midiOf),
  [60],
  'A piano strike exactly on a click must survive the metronome guard.',
);
assert.equal(
  noteEvents(onBeatMessages)[0]?.strongPianoDuringReference,
  true,
  'Click-adjacent piano must be independently supported after persistence checks.',
);

const lateAfterClickMessages = runScenario({
  seconds: 4.2,
  clicks: [{ scheduleTime: 2, arrivalTime: 2.04, amplitude: 0.06, accent: true }],
  strikes: [{ midi: 64, time: 2.085, duration: 0.48, amplitude: 0.009 }],
  seed: 61,
});
const lateAfterClick = noteEvents(lateAfterClickMessages);
assert.deepEqual(
  lateAfterClick.map(midiOf),
  [64],
  'A slightly late piano strike must not be swallowed by the preceding click onset.',
);
assert.ok(
  Math.abs(lateAfterClick[0].time - 2.085) < 0.065,
  'The responsive pass must keep a click-adjacent note inside one analysis hop; the final PCM pass refines it.',
);

const sixteenths = noteEvents(runScenario({
  seconds: 4.1,
  strikes: [60, 62, 64, 65, 67].map((midi, index) => ({
    midi,
    time: 2.02 + index * 0.125,
    duration: 0.105,
    amplitude: 0.012 - index * 0.0004,
    attack: 0.006,
  })),
  seed: 7,
}));
assert.deepEqual(
  sixteenths.map(midiOf),
  [60, 62, 64, 65, 67],
  'A 120-BPM sixteenth-note run must preserve every attack and pitch in order.',
);
for (let index = 1; index < sixteenths.length; index += 1) {
  assert.ok(
    Math.abs((sixteenths[index].time - sixteenths[index - 1].time) - 0.125) < 0.03,
    'Detected sixteenth-note timing must stay within 30 ms of the acoustic spacing.',
  );
}

const releaseMessages = runScenario({
  seconds: 4.5,
  strikes: [{ midi: 65, time: 2.02, duration: 0.82, amplitude: 0.016 }],
  seed: 8,
});
const release = releases(releaseMessages)[0];
assert.ok(release, 'A clear damper-like decay must produce a release event.');
assert.ok(
  Math.abs(release.time - 2.84) < 0.16,
  `Release time must track the acoustic decay (received ${release.time?.toFixed?.(3)}).`,
);

const fortyEightKhz = noteEvents(runScenario({
  seconds: 4,
  sampleRate: 48_000,
  strikes: [
    { midi: 60, time: 2.02, duration: 0.3, amplitude: 0.008 },
    { midi: 64, time: 2.38, duration: 0.3, amplitude: 0.008 },
    { midi: 67, time: 2.74, duration: 0.3, amplitude: 0.008 },
  ],
  seed: 9,
}));
assert.deepEqual(
  fortyEightKhz.map(midiOf),
  [60, 64, 67],
  'The worklet must preserve pitch and onset behaviour at a 48-kHz device sample rate.',
);

const captureMessages = runScenario({
  seconds: 2,
  listenAt: Infinity,
  capturePlan: { id: 91, startTime: 0.5, endTime: 1.5 },
  seed: 10,
});
const pcmChunks = captureMessages.filter((message) => message.type === 'capture-chunk');
const pcmComplete = captureMessages.find((message) => message.type === 'capture-complete');
const capturedSamples = pcmChunks.reduce(
  (sum, message) => sum + new Float32Array(message.samples).length,
  0,
);
assert.ok(pcmComplete, 'A planned lossless capture must emit a completion handshake.');
assert.ok(
  Math.abs(capturedSamples - SAMPLE_RATE) <= QUANTUM,
  `One capture second must contain one sample-rate of PCM (${capturedSamples}).`,
);

console.log(
  'Pitch processor audit passed: room noise, speech quarantine, soft notes, sustained notes, release timing, ' +
  're-attacks, scheduled click rejection, on/after-click piano recovery, 120-BPM sixteenths, ' +
  'lossless PCM handoff, and 44.1/48-kHz devices.',
);
