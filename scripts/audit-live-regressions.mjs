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
  const {
    calculateOverallScore,
    capOverallByWeakestCategory,
    alignPitchSequences,
    gradeSequence,
    gradeSpatialChord,
    planFor,
  } = await server.ssrLoadModule('/src/audio/timing.ts');

  const oneMissAlignment = alignPitchSequences(
    [60, 62, 64, 65, 67],
    [60, 62, 65, 67].map((midi) => ({ midi })),
    (midi) => midi,
  );
  assert.equal(oneMissAlignment.filter(({ kind }) => kind === 'miss').length, 1,
    'One missed pitch must remain one miss after sequence re-synchronization.');
  assert.deepEqual(
    oneMissAlignment.filter(({ kind }) => kind === 'match').map(({ expectedIndex }) => expectedIndex),
    [0, 1, 3, 4],
    'Alignment must resume at the next correct pitch instead of cascading misses.');
  const {
    advanceSpatialChord,
    formatDetectedNoteGroups,
    hasCredibleAcousticAttack,
    polyphonicTargetsForPlan,
    findCompletePolyphonicGroup,
    updateSpatialChordPresence,
  } = await server.ssrLoadModule(
    '/src/audio/useDrillAudio.ts',
  );
  const { credibleRealtimeFallback, spotifyPianoConsensus, withPitchOrderSlotHints } = await server.ssrLoadModule(
    '/src/audio/scoreAnalysis.ts',
  );

  const heldBassPlan = planFor({ timeSignature: '4/4', staves: [
    { clef: 'treble', hand: 'right', notes: ['e/4', 'f/4', 'g/4', 'a/4'].map((key) => ({ keys: [key], duration: 'q' })) },
    { clef: 'bass', hand: 'left', notes: [{ keys: ['c/3'], duration: 'w' }] },
  ] }, ['E4', 'C3', 'F4', 'G4', 'A4'], 75);
  assert.deepEqual(polyphonicTargetsForPlan(heldBassPlan).sort((a, b) => a - b), [48, 64, 65, 67, 69],
    'Every melody attack above a held bass needs independent polyphonic analysis.');
  const openingSlots = new Set(heldBassPlan.expectedNotes.flatMap((slot, index) => slot.beat === 0 ? [index] : []));
  assert.equal(findCompletePolyphonicGroup(heldBassPlan, new Set([48, 65]), 1, openingSlots)?.beat, 1,
    'A held LH bass must not veto the next correct RH attack.');
  assert.equal(findCompletePolyphonicGroup(heldBassPlan, new Set([48, 65, 66]), 1, openingSlots), null,
    'An unrelated new tone must still fail the complete-group check.');
  const phasePlan = planFor({ timeSignature: '4/4', staves: [
    { clef: 'treble', hand: 'right', notes: ['c/4', 'd/4', 'e/4', 'f/4'].map((key) => ({ keys: [key], duration: 'q' })) },
  ] }, ['C4', 'D4', 'E4', 'F4'], 75);
  for (const offset of [-0.5, 0, 0.5]) {
    const take = [60, 62, 64, 65].map((midi, index) => ({ midi,
      time: 10 + (index + offset) * phasePlan.secondsPerBeat,
      clarity: 0.95, strength: 2,
    }));
    const result = gradeSequence(['C4', 'D4', 'E4', 'F4'], take,
      { plan: phasePlan, playStartTime: 10, lessonLevel: 1, totalLessons: 24 });
    assert.equal(result.scores.pitch, 5);
    if (offset === 0) assert.equal(result.scores.timing, 5);
    else assert.ok(result.scores.timing <= 2.5,
      `Half-beat displacement must score at most 2.5, received ${result.scores.timing}.`);
  }

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
  const sampleWeightedOverall = calculateOverallScore(
    3.1,
    0,
    5,
    { pitch: 0.43, timing: 0.42, cleanliness: 0.15 },
  );
  assert.equal(capOverallByWeakestCategory(sampleWeightedOverall, 3.1, 0, 5), 1.5,
    'One zero category should lower Overall substantially without collapsing it to 0.9.');
  assert.deepEqual(credibleRealtimeFallback([{
    midi: 60,
    time: 1,
    clarity: 0.9,
    strength: 2,
    detectorLane: 'context-recovery',
    scoreContextAccepted: true,
  }]), [],
  'If PCM analysis fails, score-context-only recovery must not become a graded note.');

  const corroboratedRecovery = spotifyPianoConsensus({
    notes: [{
      midi: 60,
      time: 1,
      clarity: 0.92,
      strength: 3,
      expectedSlot: 0,
      analysisSource: 'offline-recovered',
      analysisConfidence: 0.9,
      analysisSnr: 3,
      analysisContrast: 1.4,
      analysisRise: 1.4,
      analysisPersistence: 12,
      analysisPostFlatness: 0.5,
      analysisSpeechLike: false,
    }],
    recovered: 1,
    livePreserved: 0,
    rejected: 0,
    expectedAccepted: 1,
    expectedCount: 1,
    reason: 'analyzed',
  }, [], [{ midi: 60, time: 1, endTime: 1.8, confidence: 0.9 }]);
  assert.equal(corroboratedRecovery.notes.length, 1,
    'Spotify plus independent PCM hammer evidence must recover a correct missed live onset.');
  const uncorroboratedRecovery = spotifyPianoConsensus({
    ...corroboratedRecovery,
    notes: corroboratedRecovery.notes.map((note) => ({
      ...note,
      analysisRise: 1.01,
      analysisPersistence: 2,
    })),
  }, [], [{ midi: 60, time: 1, endTime: 1.8, confidence: 0.9 }]);
  assert.deepEqual(uncorroboratedRecovery.notes, [],
    'Spotify may not manufacture score credit without independent PCM hammer evidence.');

  const pcmValidatedLiveNote = {
    midi: 60,
    time: 1,
    clarity: 0.72,
    strength: 1.8,
    expectedSlot: 0,
    detectorLane: 'context-recovery',
    scoreContextAccepted: true,
    voiceVeto: false,
    voiceBurst: false,
  };
  const validatedLiveConsensus = spotifyPianoConsensus({
    notes: [{
      ...pcmValidatedLiveNote,
      analysisSource: 'reconciled',
      analysisConfidence: 0.48,
      analysisSnr: 1.6,
      analysisContrast: 1.08,
      analysisRise: 1.12,
      analysisPersistence: 8,
      analysisPostFlatness: 0.7,
      analysisSpeechLike: false,
    }],
    recovered: 0,
    livePreserved: 0,
    rejected: 0,
    expectedAccepted: 1,
    expectedCount: 1,
    reason: 'analyzed',
  }, [pcmValidatedLiveNote], null);
  assert.deepEqual(validatedLiveConsensus.notes.map((note) => note.midi), [60],
    'A note shown live and independently validated by the PCM worker must survive without Magenta.');

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
  assert.deepEqual(
    formatDetectedNoteGroups([
      { midi: 67, time: 1, clarity: 0.9, strength: 1, peakRms: 0.02, gate: 0.01 },
      { midi: 67, time: 1.55, clarity: 0.91, strength: 0.9, peakRms: 0.016, gate: 0.01,
        frameAttackRatio: 1.02, novelty: 0.08 },
      { midi: 67, time: 2.1, clarity: 0.92, strength: 1.1, peakRms: 0.023, gate: 0.01,
        frameAttackRatio: 1.32, novelty: 0.52 },
    ]),
    ['G4', 'G4'],
    'A sustain estimate must not re-log, while a new flux/envelope attack must re-arm the feed.',
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
  assert.ok(oneMissMemory.scores.overall < 5,
    'A recognized-but-incomplete memory pattern must pass without receiving 5.0.');

  const oneMissStandard = gradeSequence(expected, perfect.slice(0, -1));
  assert.ok(oneMissStandard.scores.overall >= 4 && oneMissStandard.scores.overall < 5,
    'One missed note in an otherwise clean four-note take should score near 4, never 3 or 5.');

  const timedPlan = {
    bpm: 120,
    secondsPerBeat: 0.5,
    beatsPerBar: 4,
    totalBeats: 4,
    notes: expected.map((pitch) => ({ pitch, beats: 1, isRest: false })),
    expectedNotes: expected.map((pitch, beat) => ({ pitch, beat, beats: 1 })),
    tailBeats: 1,
    recordSeconds: 2.5,
    countInLabels: ['1', '2', '3', '4', '1', '2', '3', '4'],
    countInSeconds: 4,
    guideNote: false,
  };
  const tinyPhaseError = perfect.map((note) => ({
    ...note,
    time: note.time + timedPlan.secondsPerBeat / 64,
  }));
  const tinyPhaseGrade = gradeSequence(expected, tinyPhaseError, {
    plan: timedPlan,
    playStartTime: 10,
    lessonLevel: 12,
    totalLessons: 24,
  });
  assert.equal(tinyPhaseGrade.scores.timing, 5,
    'A 1/64-beat onset displacement should remain inside full timing credit.');

  const halfBeatPhaseError = perfect.map((note) => ({
    ...note,
    time: note.time + timedPlan.secondsPerBeat / 2,
  }));
  const halfBeatPhaseGrade = gradeSequence(expected, halfBeatPhaseError, {
    plan: timedPlan,
    playStartTime: 10,
    lessonLevel: 12,
    totalLessons: 24,
  });
  assert.ok((halfBeatPhaseGrade.scores.timing ?? 5) <= 4,
    `Even spacing cannot hide a phrase played consistently halfway between beats: ${JSON.stringify(halfBeatPhaseGrade.scores)}`);

  const eighthExpected = ['C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4'];
  const eighthPlan = {
    ...timedPlan,
    totalBeats: 4,
    expectedNotes: eighthExpected.map((pitch, index) => ({ pitch, beat: index * 0.5, beats: 0.5 })),
  };
  const rushedEighths = [60, 62, 64, 65, 67, 65, 64, 62].map((midi, index) => ({
    midi,
    time: 10 + index * 0.25 * timedPlan.secondsPerBeat,
    clarity: 0.94,
    strength: 2,
  }));
  const rushedEighthGrade = gradeSequence(eighthExpected, rushedEighths, {
    plan: eighthPlan,
    playStartTime: 10,
    lessonLevel: 10,
    totalLessons: 24,
  });
  assert.equal(rushedEighthGrade.scores.pitch, 5,
    'Rushing a subdivision must not erase correctly detected pitches.');
  assert.ok((rushedEighthGrade.scores.timing ?? 5) <= 4,
    `Eighth notes played at double speed must lose Timing credit: ${JSON.stringify(rushedEighthGrade.scores)}`);

  const badlyDistortedRhythm = perfect.map((note, index) => ({
    ...note,
    time: [10, 10.9, 11, 11.9][index],
  }));
  const badRhythmGrade = gradeSequence(expected, badlyDistortedRhythm, {
    plan: timedPlan,
    playStartTime: 10,
    lessonLevel: 1,
    totalLessons: 24,
  });
  assert.equal(badRhythmGrade.scores.pitch, 5,
    'Correct notes must remain a perfect Pitch result even when rhythm is poor.');
  assert.ok((badRhythmGrade.scores.timing ?? 5) <= 4.5,
    'Alternating rushed and late notes must affect Timing without making pitch grading stricter.');
  assert.ok(badRhythmGrade.scores.overall <= 4.5,
    'Poor rhythm must lower Overall without triggering a catastrophic score.');

  const grosslyDistortedRhythm = perfect.map((note, index) => ({
    ...note,
    time: [10, 11.05, 11.1, 12.15][index],
  }));
  const grossRhythmGrade = gradeSequence(expected, grosslyDistortedRhythm, {
    plan: timedPlan,
    playStartTime: 10,
    lessonLevel: 12,
    totalLessons: 24,
  });
  assert.equal(grossRhythmGrade.scores.pitch, 5,
    'Gross rhythm errors must never lower correct Pitch credit.');
  assert.ok((grossRhythmGrade.scores.timing ?? 5) <= 2,
    `A severely broken pulse must not receive Timing 5: ${JSON.stringify(grossRhythmGrade.scores)}`);

  const correctedWrongPitch = gradeSequence(expected, [
    perfect[0],
    { ...perfect[1], midi: 63, time: 10.32, detectorLane: 'strict', pianoAttackConfidence: 0.9 },
    ...perfect.slice(1),
  ]);
  assert.ok(correctedWrongPitch.scores.pitch <= 4.2,
    `A confidently played wrong pitch must remain visible in Pitch: ${JSON.stringify(correctedWrongPitch.scores)}`);

  const offBeatStrictNotes = badlyDistortedRhythm.map((note) => ({
    ...note,
    detectorLane: 'strict',
    scoreContextAccepted: false,
  }));
  const hintedOffBeatNotes = withPitchOrderSlotHints(timedPlan, offBeatStrictNotes);
  assert.deepEqual(hintedOffBeatNotes.map((note) => note.expectedSlot), [0, 1, 2, 3],
    'Correct strict attacks must reach their written PCM slots by pitch order, not beat proximity.');
  assert.deepEqual(offBeatStrictNotes.map((note) => note.expectedSlot), [undefined, undefined, undefined, undefined],
    'Pitch-order reconciliation must not mutate the responsive live event stream.');

  const oneCorrectPitchRetrigger = gradeSequence(expected, [
    perfect[0],
    { ...perfect[0], time: 10.22, detectorLane: 'strict', pianoAttackConfidence: 0.8 },
    ...perfect.slice(1),
  ]);
  assert.equal(oneCorrectPitchRetrigger.scores.pitch, 5,
    'One correct-key retrigger belongs to rhythm/cleanliness and must not turn Pitch into 3.x.');

  const playedExtra = {
    midi: 59,
    time: 10.42,
    clarity: 0.25,
    strength: 0.42,
    detectorLane: 'strict',
    pianoAttackConfidence: 0.84,
    frameAttackRatio: 1.3,
    novelty: 0.7,
  };
  const messyTakeGrade = gradeSequence(
    expected,
    [...badlyDistortedRhythm, playedExtra].sort((a, b) => a.time - b.time),
    {
      plan: timedPlan,
      playStartTime: 10,
      lessonLevel: 1,
      totalLessons: 24,
    },
  );
  assert.ok((messyTakeGrade.scores.timing ?? 5) <= 4.5,
    'A played extra note must not erase the detected timing errors.');
  assert.ok(messyTakeGrade.scores.cleanliness <= 4,
    'One independently verified extra key must materially lower Cleanliness.');
  assert.ok(messyTakeGrade.scores.pitch < 5,
    'A played wrong key followed by a correction must remain visible in Pitch precision.');
  assert.ok(messyTakeGrade.scores.overall <= 4.5,
    `Bad rhythm plus a played extra must remain visible without a catastrophic score: ${JSON.stringify(messyTakeGrade.scores)}`);
  assert.ok(messyTakeGrade.extras.some((extra) => extra.midi === 59 && extra.kind !== 'faint'),
    'A low-clarity event with independent hammer evidence must not be dismissed as room noise.');

  const moderatelyUnevenRhythm = perfect.map((note, index) => ({
    ...note,
    time: note.time + [0, 0.45, 0, 0.45][index] * timedPlan.secondsPerBeat,
  }));
  const moderateRhythmGrade = gradeSequence(expected, moderatelyUnevenRhythm, {
    plan: timedPlan,
    playStartTime: 10,
    lessonLevel: 1,
    totalLessons: 24,
  });
  assert.ok(
    (moderateRhythmGrade.scores.timing ?? 0) >= 3.8 &&
      (moderateRhythmGrade.scores.timing ?? 5) <= 5,
    `Moderately uneven rhythm was punished too harshly: ${JSON.stringify(moderateRhythmGrade.scores)}`,
  );
  assert.ok(moderateRhythmGrade.scores.overall >= 4.3,
    'Correct notes with moderate rhythm errors should remain clearly above a 3/5 overall.');

  const shiftExpected = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const shiftPlan = {
    ...timedPlan,
    totalBeats: 8,
    notes: shiftExpected.map((pitch) => ({ pitch, beats: 1, isRest: false })),
    expectedNotes: shiftExpected.map((pitch, beat) => ({ pitch, beat, beats: 1 })),
  };
  const oneBoundaryDropout = shiftExpected.flatMap((pitch, index) => index === 4 ? [] : [{
    midi: [60, 62, 64, 65, 67, 69, 71, 72][index],
    time: 10 + index * 0.5,
    clarity: 0.92,
    strength: 2,
  }]);
  const ordinaryBoundaryGrade = gradeSequence(shiftExpected, oneBoundaryDropout, {
    plan: shiftPlan,
    playStartTime: 10,
    lessonLevel: 14,
    totalLessons: 24,
  });
  const unmeasuredShiftGrade = gradeSequence(shiftExpected, oneBoundaryDropout, {
    plan: shiftPlan,
    playStartTime: 10,
    lessonLevel: 14,
    totalLessons: 24,
    anchorShift: {
      fromPositionName: 'G Major',
      toPositionName: 'D Major',
      splitIndex: 4,
      allowedExtraBeats: 0.6,
    },
  });
  assert.equal(unmeasuredShiftGrade.transition?.measured, false,
    'The regression fixture must leave one shift boundary attack unmeasured.');
  assert.equal(unmeasuredShiftGrade.scores.timing, ordinaryBoundaryGrade.scores.timing,
    'Missing shift-boundary evidence must not inject a synthetic zero into Timing.');

  const tooLittleTimingEvidence = gradeSequence(expected, perfect.slice(0, 2), {
    plan: timedPlan,
    playStartTime: 10,
    lessonLevel: 1,
    totalLessons: 24,
  });
  assert.equal(tooLittleTimingEvidence.scores.timing, 0,
    'Too little rhythm evidence must score zero instead of displaying Not Scored.');

  const pcmRecovered = perfect.map((note, index) => index === 2
    ? {
        ...note,
        analysisSource: 'offline-recovered',
        analysisConfidence: 0.85,
      }
    : note);
  const recoveredGrade = gradeSequence(expected, pcmRecovered);
  assert.equal(recoveredGrade.scores.pitch, 5,
    'Spotify plus independent PCM hammer evidence must receive full pitch credit.');

  console.log('Live regression audit passed: detector isolation, honest misses, PCM recovery, and played-extra grading.');
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
