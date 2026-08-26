import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(join(tmpdir(), 'eartrain-live-audit-'));
const server = await createServer({
  cacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { gradeSequence, gradeSpatialChord } = await server.ssrLoadModule('/src/audio/timing.ts');
  const {
    advanceSpatialChord,
    formatDetectedNoteGroups,
    hasCredibleAcousticAttack,
    polyphonicTargetsForPlan,
    updateSpatialChordPresence,
  } = await server.ssrLoadModule(
    '/src/audio/useDrillAudio.ts',
  );
  const { credibleRealtimeFallback } = await server.ssrLoadModule(
    '/src/audio/scoreAnalysis.ts',
  );

  assert.equal(hasCredibleAcousticAttack({
    peakRms: 0.00026,
    gate: 0.0005,
    pianoAttackConfidence: 0.72,
    attackBandCoverage: 3,
    stableFrames: 5,
    consensus: 0.8,
    clarity: 0.8,
    frameAttackRatio: 1.08,
    novelty: 0.4,
  }, 'candidate'), false,
  'A pitch-like room fluctuation below the physical level floor must not enter score context.');
  assert.equal(hasCredibleAcousticAttack({
    peakRms: 0.0012,
    gate: 0.0005,
    pianoAttackConfidence: 0.7,
    attackBandCoverage: 4,
    stableFrames: 6,
    consensus: 0.82,
    clarity: 0.72,
    frameAttackRatio: 1.05,
    novelty: 0.35,
    referenceTransient: true,
  }, 'candidate'), true,
  'A stable piano attack coincident with a click must survive the reference-transient guard.');
  assert.deepEqual(credibleRealtimeFallback([{
    midi: 60,
    time: 1,
    clarity: 0.9,
    strength: 2,
    detectorLane: 'context-recovery',
    scoreContextAccepted: true,
  }]), [],
  'If PCM analysis fails, score-context-only recovery must not become a graded note.');

  const sequentialPlan = {
    expectedNotes: [
      { pitch: 'C4', beat: 0, beats: 1 },
      { pitch: 'E4', beat: 1, beats: 1 },
      { pitch: 'G4', beat: 2, beats: 1 },
    ],
  };
  assert.deepEqual(polyphonicTargetsForPlan(sequentialPlan), [],
    'A melody must never arm the polyphonic chord detector.');
  assert.deepEqual(polyphonicTargetsForPlan({
    expectedNotes: sequentialPlan.expectedNotes.map((slot) => ({ ...slot, beat: 0 })),
  }), [60, 64, 67], 'A genuine simultaneous chord must retain polyphonic support.');
  assert.deepEqual(
    formatDetectedNoteGroups([
      { midi: 60, time: 1, clarity: 1, strength: 1 },
      { midi: 64, time: 1.001, clarity: 1, strength: 1 },
      { midi: 67, time: 1.002, clarity: 1, strength: 1 },
    ]),
    ['Chord: C4 + E4 + G4'],
    'A detected chord must be displayed as one simultaneous chord, not random note labels.',
  );

  const chordSpec = {
    chordName: 'C Major',
    hand: 'right',
    quality: 'major',
    rootPitch: 'C4',
    chordPitches: ['C4', 'E4', 'G4'],
    intervals: [4, 7],
    rootSupport: 'shown',
    buildOrder: [0, 1, 2],
    context: {
      targetInstrument: 'piano',
      layers: [],
      progression: [['C4', 'E4', 'G4']],
      targetChordIndex: 0,
      secondsPerChord: 1,
      targetRepeats: 1,
    },
    rootSearchSeconds: 4,
    shapeSearchSeconds: 8,
    maxWrongGuesses: 4,
  };
  const activeChord = {
    spec: chordSpec,
    targetMidi: [60, 64, 67],
    startedAt: 1,
    rootFoundAt: null,
    completedAt: null,
    foundMidi: new Set(),
    foundAtByMidi: new Map(),
    wrongRootGuesses: 0,
    wrongShapeGuesses: 0,
    totalGuesses: 0,
    polyphonicWrongMidi: new Set(),
  };
  assert.equal(advanceSpatialChord(activeChord, 59, 1.1).progress, 0,
    'An unrelated B must not advance C major.');
  assert.equal(activeChord.wrongRootGuesses, 1,
    'An unrelated B must be recorded as a wrong guess.');
  assert.equal(updateSpatialChordPresence(activeChord, new Set([60]), 1.2).progress, 1,
    'A lone C may find the anchor but must not complete C major.');
  assert.equal(updateSpatialChordPresence(activeChord, new Set(), 1.4).progress, 0,
    'Released chord tones must be removed from current progress.');
  assert.equal(updateSpatialChordPresence(activeChord, new Set([60, 64, 67]), 1.6).complete, false,
    'Even one full spectral frame must wait for the simultaneous hold confirmation.');
  const unconfirmedChord = gradeSpatialChord(chordSpec, [], {
    startedAt: 1,
    rootFoundAt: 1.2,
    completedAt: null,
    rootFound: true,
    foundMidi: [60, 64, 67],
    wrongRootGuesses: 0,
    wrongShapeGuesses: 0,
    totalGuesses: 3,
    timedOut: true,
  });
  assert.equal(unconfirmedChord.passed, false,
    'Three accumulated target names without a confirmed concurrent hold must fail.');

  const expected = ['C4', 'D4', 'E4', 'F4'];
  const perfect = [60, 62, 64, 65].map((midi, index) => ({
    midi,
    time: 10 + index * 0.5,
    clarity: 0.92,
    strength: 2,
  }));
  const flooded = [
    ...perfect,
    ...Array.from({ length: 24 }, (_, index) => ({
      ...perfect[0],
      time: perfect[0].time + 0.08 * (index + 1),
      detectorLane: 'strict',
      pianoAttackConfidence: 0.82,
      frameAttackRatio: 1.31,
      novelty: 0.68,
    })),
  ].sort((a, b) => a.time - b.time);
  const grade = gradeSequence(expected, flooded, { exerciseMode: 'blind-memory' });
  assert.equal(grade.passed, false, 'Dozens of played extra notes must force a retry.');
  assert.ok(grade.scores.pitch < 2, 'Extra notes must reduce pitch precision, not only cleanliness.');
  assert.equal(grade.scores.cleanliness, 0, 'Dozens of played extras must be completely unclean.');
  assert.ok(grade.scores.overall < 2, 'A performance full of extra notes must score as incorrect.');
  assert.match(grade.detail, /too many extra notes/i,
    'The retry must explain that the played pattern contained too many notes.');

  const oneRoomArtifact = gradeSequence(expected, [{
    midi: 60,
    time: 10,
    clarity: 0.9,
    strength: 1,
  }]);
  assert.equal(oneRoomArtifact.scores.timing, 0,
    'One accidental room detection must not receive Timing credit.');
  assert.equal(oneRoomArtifact.scores.cleanliness, 0,
    'One accidental room detection must not look like a clean performance.');

  const acousticEchoes = [
    ...perfect,
    ...Array.from({ length: 18 }, (_, index) => ({
      ...perfect[0],
      time: perfect[0].time + 0.08 * (index + 1),
      clarity: 0.44,
      strength: 0.48,
      analysisSource: 'offline-recovered',
    })),
  ].sort((a, b) => a.time - b.time);
  const echoGrade = gradeSequence(expected, acousticEchoes);
  assert.equal(echoGrade.scores.pitch, 5,
    'Weak acoustic repeats must not lower pitch precision as played errors.');

  const oneMissMemory = gradeSequence(expected, perfect.slice(0, -1), {
    exerciseMode: 'blind-memory',
  });
  assert.equal(oneMissMemory.passed, true,
    'One omitted memory note should still demonstrate pattern recognition.');
  assert.ok(oneMissMemory.scores.overall < 5 && oneMissMemory.scores.overall >= 4.5,
    'A recognized-but-incomplete memory pattern must pass without receiving 5.0.');

  const oneMissStandard = gradeSequence(expected, perfect.slice(0, -1));
  assert.ok(oneMissStandard.scores.overall >= 4 && oneMissStandard.scores.overall < 5,
    'One missed note in an otherwise clean four-note take should score near 4, never 3 or 5.');

  const pcmRecovered = perfect.map((note, index) => index === 2
    ? {
        ...note,
        analysisSource: 'offline-recovered',
        analysisConfidence: 0.85,
      }
    : note);
  const recoveredGrade = gradeSequence(expected, pcmRecovered);
  assert.ok(recoveredGrade.scores.overall >= 4.5 && recoveredGrade.scores.overall < 5,
    'A strongly PCM-supported soft note should retain high credit without manufacturing 5.0.');

  console.log('Live regression audit passed: detector isolation, honest misses, PCM recovery, and played-extra grading.');
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
