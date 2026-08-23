import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { PROGRESSIVE_CONCEPTS } = await server.ssrLoadModule(
    '/src/curriculum/progressiveCurriculum.ts',
  );
  const { makeRandom, toScientific, LOWEST_MIDI, HIGHEST_MIDI } =
    await server.ssrLoadModule('/src/curriculum/positions.ts');
  const {
    advancePositionProof,
    advanceSpatialChord,
    isClearSamePitchRetrigger,
    proofDetectorWarmupRemaining,
    resolveContextualPitch,
  } = await server.ssrLoadModule('/src/audio/useDrillAudio.ts');
  const {
    beatsForDuration,
    gradeSequence,
    gradeSpatialChord,
    pitchToMidi,
    planForQuestion,
    timingLeniencyForLesson,
  } = await server.ssrLoadModule('/src/audio/timing.ts');
  const {
    DEFAULT_SESSION_QUESTION_CAP,
    createInitialPathwayState,
    generateFor,
    pathwayReducer,
  } = await server.ssrLoadModule('/src/components/PathwayRouter.tsx');
  const { adaptiveProfile, positionKeyOf } = await server.ssrLoadModule(
    '/src/curriculum/telemetry.ts',
  );
  const { timelineXForBeat, scrubberBoundsFromOnsets } = await server.ssrLoadModule(
    '/src/components/StaffCue.tsx',
  );

  const modes = ['reinforce', 'normal', 'stretch'];
  const difficulties = [0, 0.25, 0.5, 0.75, 1];
  const seeds = [1, 17, 20260802];
  const totalLessons = PROGRESSIVE_CONCEPTS.length;
  const diagnostics = {
    strictAccepted: 0,
    expectedRecovered: 0,
    candidatesIgnored: 0,
    pitchRejected: 0,
    contextDisambiguated: 0,
  };
  const summary = [];

  assert.equal(totalLessons, 24, 'The live pathway must contain 24 lessons.');
  assert.ok(timingLeniencyForLesson(1, totalLessons).onBeatWindow >
    timingLeniencyForLesson(totalLessons, totalLessons).onBeatWindow,
  'Timing tolerance must tighten smoothly across the pathway.');

  let globalOrdinal = 0;
  for (const concept of PROGRESSIVE_CONCEPTS) {
    assert.equal(concept.index, summary.length + 1, 'Lesson indices must be contiguous.');
    assert.equal(concept.baseQuestionCount, 3, `Lesson ${concept.index} must have three base drills.`);
    assert.ok(concept.maxQuestionCount >= concept.baseQuestionCount);

    const rhythms = { eighth: 0, sixteenth: 0, plain: 0 };
    const generatedModes = new Set();
    const cleanSignatures = [];

    for (let questionNumber = 1; questionNumber <= concept.maxQuestionCount; questionNumber += 1) {
      for (const mode of modes) {
        for (const difficulty of difficulties) {
          for (const seed of seeds) {
            const ordinal = globalOrdinal + questionNumber - 1;
            const rand = makeRandom(seed + concept.index * 7919 + questionNumber * 131 + ordinal);
            const question = concept.generate(
              ordinal,
              rand,
              difficulty,
              mode,
              questionNumber,
            );
            const staff = question.cue.staves[0];
            const plan = planForQuestion(question, 75);
            generatedModes.add(question.exerciseMode);

            assert.ok(staff, `Lesson ${concept.index}, drill ${questionNumber} needs a staff.`);
            assert.equal(question.handScope, staff.hand,
              `Lesson ${concept.index}, drill ${questionNumber} hand label must match its staff.`);
            assert.ok(question.expectedSequence.length > 0);
            assert.equal(plan.countInLabels.length, plan.beatsPerBar * 2,
              `Lesson ${concept.index}, drill ${questionNumber} needs a two-bar count-in.`);
            assert.deepEqual(
              plan.countInLabels,
              Array.from({ length: plan.beatsPerBar * 2 }, (_, index) =>
                String((index % plan.beatsPerBar) + 1)),
            );

            const totalBeats = staff.notes.reduce(
              (sum, note) => sum + beatsForDuration(note.duration),
              0,
            );
            assert.ok(Math.abs(totalBeats / plan.beatsPerBar - Math.round(totalBeats / plan.beatsPerBar)) < 1e-8,
              `Lesson ${concept.index}, drill ${questionNumber} must fill complete measures.`);
            assert.equal(plan.totalBeats, totalBeats);

            const writtenPitches = staff.notes
              .filter((note) => !note.duration.endsWith('r'))
              .map((note) => toScientific(note.keys[0]));
            assert.deepEqual(writtenPitches, question.expectedSequence,
              `Lesson ${concept.index}, drill ${questionNumber} notation and grading pitches diverged.`);

            const midis = question.expectedSequence.map(pitchToMidi);
            assert.ok(midis.every((midi) => midi !== null && midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI),
              `Lesson ${concept.index}, drill ${questionNumber} exceeds the detector-safe register.`);

            const durations = staff.notes.map((note) => note.duration);
            if (durations.some((duration) => duration.startsWith('16'))) rhythms.sixteenth += 1;
            else if (durations.some((duration) => duration.startsWith('8'))) rhythms.eighth += 1;
            else rhythms.plain += 1;

            if (question.exerciseMode === 'prove-it') {
              assert.ok(question.positionProof, 'Prove It needs a proof specification.');
              const expectedFingers = staff.hand === 'right' ? [1, 2, 3] : [5, 3, 1];
              assert.deepEqual(question.positionProof.proofNotes.map((note) => note.finger), expectedFingers,
                `Lesson ${concept.index}, drill ${questionNumber} has invalid ${staff.hand}-hand proof fingers.`);
            }
            if (question.exerciseMode === 'blind-memory') {
              assert.equal(question.blindMemory?.previewSeconds, 3);
            }
            if (question.exerciseMode === 'anchor-shift') {
              assert.ok(question.anchorShift);
              assert.ok(question.anchorShift.splitIndex > 0 &&
                question.anchorShift.splitIndex < question.expectedSequence.length);
              const roots = [...question.positionLabel.matchAll(/\(([A-G][#b]?-?\d+)\)/g)]
                .map((match) => pitchToMidi(match[1]));
              assert.equal(roots.length, 2);
              assert.equal(roots[1] - roots[0], 7,
                `Lesson ${concept.index}, drill ${questionNumber} must move up a fifth.`);
              assert.ok(positionKeyOf(question.positionLabel).includes('→'));
            }
            if (question.exerciseMode === 'spatial-chord') {
              assert.ok(question.spatialChord);
              assert.deepEqual(question.spatialChord.buildOrder, [0, 2, 1]);
              assert.deepEqual(question.expectedSequence, question.spatialChord.chordPitches);
              assert.equal(question.spatialChord.context.targetChordIndex,
                question.spatialChord.context.progression.length - 1);
            }

            if (mode === 'normal' && difficulty === 0.5 && seed === seeds[0]) {
              cleanSignatures.push(JSON.stringify({
                position: question.positionLabel,
                mode: question.exerciseMode,
                pitches: question.expectedSequence,
                durations,
              }));
            }

            if (question.exerciseMode !== 'spatial-chord') {
              const playStart = 10;
              const perfect = plan.expectedNotes.map((slot, index) => ({
                midi: pitchToMidi(slot.pitch),
                time: playStart + slot.beat * plan.secondsPerBeat,
                clarity: 0.92,
                strength: 2,
                sustain: 1,
                detectorId: index,
                endTime: playStart + (slot.beat + slot.beats) * plan.secondsPerBeat,
                durationConfidence: 0.92,
              }));
              const gradeOptions = {
                plan,
                playStartTime: playStart,
                lessonLevel: concept.index,
                totalLessons,
                anchorShift: question.anchorShift,
              };
              const perfectGrade = gradeSequence(question.expectedSequence, perfect, gradeOptions);
              assert.equal(perfectGrade.passed, true,
                `Perfect performance failed Lesson ${concept.index}, drill ${questionNumber}.`);
              assert.deepEqual(perfectGrade.scores, {
                pitch: 5,
                timing: 5,
                cleanliness: 5,
                overall: 5,
              });

              const silentGrade = gradeSequence(question.expectedSequence, [], gradeOptions);
              assert.equal(silentGrade.scores.pitch, 0);
              assert.equal(silentGrade.scores.cleanliness, 0);
              assert.equal(silentGrade.scores.overall, 0);
              assert.ok(silentGrade.scores.timing === 0 || silentGrade.scores.timing === null);
              assert.equal(silentGrade.passed, false);

              if (perfect.length >= 4) {
                const missIndex = Math.floor(perfect.length / 2);
                const oneMiss = perfect.filter((_, index) => index !== missIndex);
                const missGrade = gradeSequence(question.expectedSequence, oneMiss, gradeOptions);
                assert.ok(missGrade.scores.pitch > 0 && missGrade.scores.overall > 0,
                  `One missed note zeroed Lesson ${concept.index}, drill ${questionNumber}.`);

                const oneOnly = gradeSequence(question.expectedSequence, [perfect[0]], gradeOptions);
                assert.ok(oneOnly.scores.overall < 2,
                  `One heard note scored too highly in Lesson ${concept.index}, drill ${questionNumber}.`);
              }

              if (perfect.length >= 3) {
                const offBeat = perfect.map((note, index) => {
                  const offset = (index % 2 === 0 ? -0.65 : 0.65) * plan.secondsPerBeat;
                  return { ...note, time: note.time + offset, endTime: note.endTime + offset };
                });
                const offBeatGrade = gradeSequence(question.expectedSequence, offBeat, gradeOptions);
                assert.equal(offBeatGrade.passed, false,
                  `Off-beat performance passed Lesson ${concept.index}, drill ${questionNumber}.`);

                const wrongHolds = perfect.map((note) => ({
                  ...note,
                  endTime: note.time + plan.secondsPerBeat * 2.75,
                }));
                const durationGrade = gradeSequence(question.expectedSequence, wrongHolds, gradeOptions);
                assert.equal(durationGrade.passed, false,
                  `Wrong note lengths passed Lesson ${concept.index}, drill ${questionNumber}.`);
              }
            } else {
              const spec = question.spatialChord;
              const targetMidi = spec.chordPitches.map(pitchToMidi);
              const times = [10.4, 11, 11.5];
              const detected = targetMidi.map((midi, index) => ({
                midi,
                time: times[index],
                clarity: 0.92,
                strength: 2,
                sustain: 1,
              }));
              const spatialPerformance = {
                startedAt: 10,
                rootFoundAt: times[0],
                completedAt: times[2],
                rootFound: true,
                foundMidi: targetMidi,
                toneFoundAt: [
                  { midi: targetMidi[0], time: times[0] },
                  { midi: targetMidi[2], time: times[1] },
                  { midi: targetMidi[1], time: times[2] },
                ],
                wrongRootGuesses: 0,
                wrongShapeGuesses: 0,
                totalGuesses: 3,
                timedOut: false,
              };
              const grade = gradeSpatialChord(spec, detected, spatialPerformance);
              assert.equal(grade.passed, true);
              assert.equal(grade.matched, 3);
              assert.equal(grade.scores.pitch, 5);
              assert.equal(grade.scores.cleanliness, 5);
            }
          }
        }
      }
    }

    // Extra adaptive drills may reuse a position but must not repeat the exact
    // position, pitch, rhythm, and mode tuple consecutively.
    for (let index = 1; index < cleanSignatures.length; index += 1) {
      assert.notEqual(cleanSignatures[index], cleanSignatures[index - 1],
        `Lesson ${concept.index} repeats identical adjacent drills.`);
    }
    if (concept.index <= 5) assert.equal(rhythms.eighth + rhythms.sixteenth, 0);
    if (concept.index >= 6 && concept.index <= 12) assert.equal(rhythms.sixteenth, 0);
    if (concept.index >= 6 && concept.index <= 12) assert.ok(rhythms.eighth > 0);
    if (concept.index >= 13 && concept.index <= 18) {
      assert.ok(rhythms.sixteenth > 0 && rhythms.eighth > 0 && rhythms.plain > 0);
    }

    summary.push({
      lesson: concept.index,
      id: concept.id,
      modes: [...generatedModes],
      generatedCases: concept.maxQuestionCount * modes.length * difficulties.length * seeds.length,
    });
    globalOrdinal += concept.baseQuestionCount;
  }

  // Earlier retries must never rotate the teaching order of a later lesson.
  // Lesson 17 is intentionally B (RH), B (LH), then F-sharp (RH); Lesson 24
  // begins D, A, E even if the learner accumulated many adaptive drills.
  for (const ordinalOffset of [0, 1, 17, 93, 240]) {
    const lesson17 = [1, 2, 3].map((questionNumber) =>
      PROGRESSIVE_CONCEPTS[16].generate(
        ordinalOffset + questionNumber,
        makeRandom(ordinalOffset + questionNumber),
        0.5,
        'normal',
        questionNumber,
      ));
    assert.deepEqual(
      lesson17.map((question) => question.positionLabel.replace(/ position.*$/, '')),
      ['B', 'B', 'F#'],
      'Lesson 17 must establish B in both hands before introducing F-sharp.',
    );
    assert.deepEqual(
      lesson17.map((question) => question.handScope),
      ['right', 'left', 'right'],
    );

    const lesson24 = [1, 2, 3].map((questionNumber) =>
      PROGRESSIVE_CONCEPTS[23].generate(
        ordinalOffset + questionNumber,
        makeRandom(ordinalOffset + 100 + questionNumber),
        0.5,
        'normal',
        questionNumber,
      ));
    assert.deepEqual(
      lesson24.map((question) => question.spatialChord.rootPitch.replace(/-?\d+$/, '')),
      ['D', 'A', 'E'],
      'The final base lesson must retain its D-A-E difficulty order.',
    );
  }

  // Proof state is ordered, monotonic, resettable, and cannot complete from a
  // wrong note. This is the pure regression for the former infinite loop.
  const proof = {
    targetMidi: [60, 64, 67],
    acceptWindowSec: 5,
    nextIndex: 0,
    firstHeardAt: null,
  };
  assert.deepEqual(advancePositionProof(proof, 62, 1), { progress: 0, complete: false });
  assert.deepEqual(advancePositionProof(proof, 60, 1.1), { progress: 1, complete: false });
  assert.deepEqual(advancePositionProof(proof, 64, 1.8), { progress: 2, complete: false });
  assert.deepEqual(advancePositionProof(proof, 67, 2.4), { progress: 3, complete: true });
  assert.equal(proofDetectorWarmupRemaining(1000, 1100), 160);
  assert.equal(proofDetectorWarmupRemaining(1000, 1400), 0);

  const sampleSpatialSpec = PROGRESSIVE_CONCEPTS[18].generate(
    54,
    makeRandom(42),
    0.5,
    'normal',
    1,
  ).spatialChord;
  const spatialMidi = sampleSpatialSpec.chordPitches.map(pitchToMidi);
  const activeSpatial = {
    spec: sampleSpatialSpec,
    targetMidi: spatialMidi,
    startedAt: 1,
    rootFoundAt: null,
    completedAt: null,
    foundMidi: new Set(),
    foundAtByMidi: new Map(),
    wrongRootGuesses: 0,
    wrongShapeGuesses: 0,
    totalGuesses: 0,
  };
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[1], 1.1).progress, 0);
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[0], 1.2).rootJustFound, true);
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[1], 1.3).progress, 1,
    'The middle tone must not skip the outer-shell step.');
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[2], 1.5).progress, 2);
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[1], 1.8).complete, true);

  assert.equal(isClearSamePitchRetrigger(
    { time: 1, peakRms: 0.1 },
    { time: 1.08, peakRms: 0.2, gate: 0.03, attackRatio: 2, frameAttackRatio: 1.2, novelty: 0.4 },
  ), false, 'A sub-120ms repeat must be suppressed.');
  assert.equal(isClearSamePitchRetrigger(
    { time: 1, peakRms: 0.1 },
    { time: 1.5, peakRms: 0.09, gate: 0.03, attackRatio: 1.4, frameAttackRatio: 1.2, novelty: 0.4 },
  ), true, 'A clear physical re-attack must remain playable.');

  const recoveryQuestion = PROGRESSIVE_CONCEPTS[5].generate(
    15, makeRandom(9), 0.4, 'normal', 1,
  );
  const recoveryPlan = planForQuestion(recoveryQuestion, 75);
  const recoveryMidi = pitchToMidi(recoveryPlan.expectedNotes[0].pitch);
  const recoveryTime = 10 + recoveryPlan.expectedNotes[0].beat * recoveryPlan.secondsPerBeat;
  assert.equal(resolveContextualPitch(
    recoveryPlan,
    10,
    recoveryMidi + 1,
    recoveryTime,
    new Set(),
    [{ source: 'yin', midi: recoveryMidi, frequency: 440, frames: 4, consensus: 0.8, clarity: 0.8, pitchMad: 0.1 }],
    true,
  ).midi, recoveryMidi, 'A stable expected hypothesis should recover a quiet correct note.');
  assert.equal(resolveContextualPitch(
    recoveryPlan,
    10,
    recoveryMidi + 1,
    recoveryTime,
    new Set(),
    [{ source: 'yin', midi: recoveryMidi + 2, frequency: 440, frames: 4, consensus: 0.8, clarity: 0.8, pitchMad: 0.1 }],
    true,
  ).slot, null, 'Context must never bend a wrong pitch into the score.');

  assert.equal(timelineXForBeat(100, 500, 8, -1), 100);
  assert.equal(timelineXForBeat(100, 500, 8, 4), 300);
  assert.equal(timelineXForBeat(100, 500, 8, 20), 500);
  assert.deepEqual(
    scrubberBoundsFromOnsets([{ beat: 0, x: 100 }, { beat: 7, x: 450 }], 8, 90, 490),
    { startX: 100, endX: 490 },
  );

  // Reducer-level route audit: stale events are ignored and a completed proof
  // unlocks exactly once before the ordinary drill begins.
  let route = createInitialPathwayState({ seed: 20260802, cap: 1000 });
  const firstId = route.current.id;
  assert.equal(pathwayReducer(route, { type: 'PROOF_SUCCESS', questionId: firstId }).status,
    'position-prompt');
  route = pathwayReducer(route, { type: 'PROOF_START', questionId: firstId });
  assert.equal(route.status, 'proving');
  route = pathwayReducer(route, { type: 'PROOF_SUCCESS', questionId: firstId });
  assert.equal(route.status, 'proof-success');
  route = pathwayReducer(route, { type: 'PROOF_UNLOCK', questionId: firstId });
  assert.equal(route.status, 'prompt');
  route = pathwayReducer(route, { type: 'PROOF_UNLOCK', questionId: firstId });
  assert.equal(route.status, 'prompt');
  route = pathwayReducer(route, { type: 'START', questionId: firstId });
  route = pathwayReducer(route, { type: 'PLAY_START', questionId: firstId, now: 1000 });
  route = pathwayReducer(route, { type: 'ANALYSIS_START', questionId: firstId, now: 2000 });
  const firstPlan = planForQuestion(route.current, 75);
  const perfectFirst = firstPlan.expectedNotes.map((slot) => ({
    midi: pitchToMidi(slot.pitch),
    time: 10 + slot.beat * firstPlan.secondsPerBeat,
    clarity: 0.9,
    strength: 2,
    sustain: 1,
    endTime: 10 + (slot.beat + slot.beats) * firstPlan.secondsPerBeat,
    durationConfidence: 0.9,
  }));
  const firstGrade = gradeSequence(route.current.expectedSequence, perfectFirst, {
    plan: firstPlan,
    playStartTime: 10,
    lessonLevel: 1,
    totalLessons,
  });
  route = pathwayReducer(route, {
    type: 'RESOLVE',
    result: firstGrade,
    detected: perfectFirst,
    recognition: diagnostics,
    questionId: firstId,
    now: 5500,
  });
  assert.equal(route.status, 'report');
  route = pathwayReducer(route, { type: 'CONTINUE', difficultyNudge: 0 });
  assert.equal(route.question, 2);
  assert.notEqual(route.current.id, firstId);
  assert.equal(route.status, 'position-prompt');

  // Walk a perfect learner through the complete live reducer. This catches
  // unreachable later lessons, off-by-one lesson changes, stale question IDs,
  // and accidental session caps without relying on UI timing.
  let fullRoute = createInitialPathwayState({
    seed: 20260802,
    cap: DEFAULT_SESSION_QUESTION_CAP,
  });
  let routeGuard = 0;
  while (!fullRoute.finished && routeGuard < DEFAULT_SESSION_QUESTION_CAP + 1) {
    routeGuard += 1;
    const currentPlan = planForQuestion(fullRoute.current, 75);
    const playStart = 100 + routeGuard * 100;
    const performed = currentPlan.expectedNotes.map((slot, index) => ({
      midi: pitchToMidi(slot.pitch),
      time: playStart + slot.beat * currentPlan.secondsPerBeat,
      clarity: 0.94,
      strength: 2,
      sustain: 1,
      detectorId: index,
      endTime: playStart + (slot.beat + slot.beats) * currentPlan.secondsPerBeat,
      durationConfidence: 0.94,
    }));
    const grade = gradeSequence(fullRoute.current.expectedSequence, performed, {
      plan: currentPlan,
      playStartTime: playStart,
      lessonLevel: fullRoute.lesson,
      totalLessons,
      anchorShift: fullRoute.current.anchorShift,
    });
    assert.equal(grade.passed, true,
      `Perfect reducer performance failed at Lesson ${fullRoute.lesson}, drill ${fullRoute.question}.`);
    fullRoute = {
      ...fullRoute,
      status: 'grading',
      listeningStartedAt: playStart * 1000,
    };
    fullRoute = pathwayReducer(fullRoute, {
      type: 'RESOLVE',
      result: grade,
      detected: performed,
      recognition: diagnostics,
      questionId: fullRoute.current.id,
      now: playStart * 1000 + 3500,
    });
    assert.equal(fullRoute.status, 'report');
    fullRoute = pathwayReducer(fullRoute, { type: 'CONTINUE', difficultyNudge: 0 });
  }
  assert.equal(routeGuard, totalLessons * 3,
    'A perfect pathway must contain exactly three drills per lesson.');
  assert.equal(fullRoute.finished, true, 'The complete pathway must terminate.');
  assert.equal(fullRoute.endedOnCap, false, 'Natural completion must not masquerade as a cap stop.');
  assert.equal(fullRoute.lesson, totalLessons, 'The reducer must reach the final lesson.');

  // A struggling learner gets finite extra practice and then advances. This
  // exercises the maximum loop growth and two-attempt retry path that caused
  // the historical Prove It lockup.
  let struggleRoute = createInitialPathwayState({ seed: 17, cap: DEFAULT_SESSION_QUESTION_CAP });
  let struggleGuard = 0;
  while (struggleRoute.lesson === 1 && !struggleRoute.finished && struggleGuard < 30) {
    struggleGuard += 1;
    const failed = gradeSequence(struggleRoute.current.expectedSequence, []);
    struggleRoute = { ...struggleRoute, status: 'grading' };
    struggleRoute = pathwayReducer(struggleRoute, {
      type: 'RESOLVE',
      result: failed,
      detected: [],
      recognition: diagnostics,
      questionId: struggleRoute.current.id,
      now: 10_000 + struggleGuard,
    });
    struggleRoute = pathwayReducer(struggleRoute, { type: 'CONTINUE', difficultyNudge: -0.08 });
  }
  assert.equal(struggleRoute.lesson, 2, 'Maximum remedial practice must still advance to Lesson 2.');
  assert.equal(struggleRoute.questionsServed, PROGRESSIVE_CONCEPTS[0].maxQuestionCount);
  assert.ok(struggleGuard <= PROGRESSIVE_CONCEPTS[0].maxQuestionCount * 2,
    'The retry state machine exceeded its finite two-attempt bound.');

  // Jump directly to a chord lesson and verify every guarded state transition.
  const chordQuestion = generateFor(19, 1, 54, 0.25, route.signal, 20260802);
  route = {
    ...route,
    lesson: 19,
    question: 1,
    loopSize: 3,
    current: chordQuestion,
    status: 'prompt',
    proofCompleted: false,
    report: null,
    finished: false,
  };
  route = pathwayReducer(route, { type: 'CHORD_START', questionId: chordQuestion.id });
  assert.equal(route.status, 'chord-cue');
  route = pathwayReducer(route, { type: 'CHORD_LISTEN', questionId: chordQuestion.id, now: 6000 });
  assert.equal(route.status, 'chord-root');
  route = pathwayReducer(route, { type: 'CHORD_ROOT', questionId: chordQuestion.id });
  assert.equal(route.status, 'chord-build');
  route = pathwayReducer(route, { type: 'ANALYSIS_START', questionId: chordQuestion.id, now: 7000 });
  assert.equal(route.status, 'grading');

  // The adaptive engine uses a bounded recent window and keeps shift pairs
  // separate from single-position practice.
  const attempt = (seq, overall) => ({
    seq, at: seq, conceptId: 'x', conceptIndex: 1, conceptTitle: 'x', phase: 0,
    phaseLabel: 'x', questionId: `x#${seq}`, questionNumber: 1, difficulty: 0.5,
    mode: 'normal', attemptNumber: 1, passed: overall >= 3, timeToAnswerMs: 1000,
    positionLabel: 'C position (C4)', positionKey: 'C',
    scores: { pitch: overall, timing: overall, cleanliness: overall, overall },
    expectedSequence: ['C4'], tempoWindowSec: 2, fingeringInferred: false,
  });
  const history = [1, 2, 3, 4, 5].map((seq) => attempt(seq, 5))
    .concat([6, 7, 8].map((seq) => attempt(seq, 1)));
  const adaptive = adaptiveProfile(history, 3, 3)[0];
  assert.ok(adaptive.difficultyNudge < 0, 'Recent struggles must outweigh stale early success.');
  assert.equal(positionKeyOf('C position (C4) → G position (G4)'), 'C→G');

  const generatedCases = summary.reduce((sum, item) => sum + item.generatedCases, 0);
  console.log(`Curriculum audit passed: ${totalLessons} lessons, ${generatedCases} generated cases.`);
  for (const item of summary) {
    console.log(`  L${String(item.lesson).padStart(2, '0')} ${item.id}: ${item.modes.join(' + ')}`);
  }
  console.log('State, grading, duration, pitch-recovery, telemetry, and scrubber regressions passed.');
} finally {
  await server.close();
}
