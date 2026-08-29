import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const auditCacheDir = await mkdtemp(join(tmpdir(), 'eartrain-vite-audit-'));
const server = await createServer({
  cacheDir: auditCacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const {
    CURRICULUM_BLUEPRINT,
    PROGRESSIVE_CONCEPTS,
    lessonsForProblem,
    openingLessonForProblem,
  } = await server.ssrLoadModule(
    '/src/curriculum/progressiveCurriculum.ts',
  );
  const { REMEDIATION_PROBLEMS } = await server.ssrLoadModule('/src/curriculum/types.ts');
  const { makeRandom, toScientific, LOWEST_MIDI, HIGHEST_MIDI } =
    await server.ssrLoadModule('/src/curriculum/positions.ts');
  const {
    advancePositionProof,
    advanceSpatialChord,
    isClearSamePitchRetrigger,
    proofDetectorWarmupRemaining,
    resolveContextualPitch,
    updateSpatialChordPresence,
  } = await server.ssrLoadModule('/src/audio/useDrillAudio.ts');
  const {
    beatsForDuration,
    gradeSequence,
    gradeSpatialChord,
    metronomeBeatPositions,
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
  const {
    timelineXForBeat,
    scrubberBoundsFromOnsets,
    shiftRegionFromOnsets,
    splitNotesIntoSystems,
  } = await server.ssrLoadModule(
    '/src/components/StaffCue.tsx',
  );

  const mixedRhythmSystems = splitNotesIntoSystems(
    [
      { keys: ['c/4'], duration: 'q' },
      { keys: ['d/4'], duration: '8' },
      { keys: ['e/4'], duration: '8' },
      { keys: ['f/4'], duration: 'h' },
      { keys: ['g/4'], duration: 'q' },
    ],
    4,
  );
  assert.deepEqual(
    mixedRhythmSystems.map((system) => system.map(({ duration }) => duration)),
    [['q', '8', '8', 'h'], ['q']],
    'Responsive score wrapping must follow measured beats, not raw note count.',
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
  assert.deepEqual(
    PROGRESSIVE_CONCEPTS.map(({ index, phase, title, focus }) => ({ index, phase, title, focus })),
    [
      { index: 1, phase: 0, title: 'Meet C position', focus: 'Set the right hand once and use all five fingers.' },
      { index: 2, phase: 0, title: 'Shape a right-hand phrase', focus: 'Read steps, turns, and gentle repeats without moving the hand.' },
      { index: 3, phase: 0, title: 'Meet the left hand', focus: 'Learn bass-clef C position before adding any sharps.' },
      { index: 4, phase: 0, title: 'White-key phrases', focus: 'Alternate hands while the pitch language stays familiar.' },
      { index: 5, phase: 1, title: 'G major: one sharp', focus: 'Read the one-sharp signature while placing G-A-B-C-D on familiar white keys.' },
      { index: 6, phase: 1, title: 'Sing in G major', focus: 'Keep the G-position tonic map stable through complete tonal phrases.' },
      { index: 7, phase: 1, title: 'D major: two sharps', focus: 'Make F-sharp physical inside D-E-F-sharp-G-A while reading the two-sharp signature.' },
      { index: 8, phase: 1, title: 'Shape D-major melodies', focus: 'Keep F-sharp secure through turns, repeats, and gentle skips in D position.' },
      { index: 9, phase: 2, title: 'A major: three sharps', focus: 'Transfer black-key awareness to C-sharp inside the A five-finger map.' },
      { index: 10, phase: 2, title: 'Flow through A major', focus: 'Keep the A-position C-sharp stable through a longer phrase.' },
      { index: 11, phase: 2, title: 'E major: four sharps', focus: 'Coordinate F-sharp and G-sharp inside a calm, compact E-position path.' },
      { index: 12, phase: 2, title: 'Color E-major phrases', focus: 'Keep both black keys secure through repeated ideas and skips in E position.' },
      { index: 13, phase: 3, title: 'Leap from C to G', focus: 'Release one known position and land a fifth away without searching.' },
      { index: 14, phase: 3, title: 'Leap from G to D', focus: 'Move between one- and two-sharp hand maps in time.' },
      { index: 15, phase: 4, title: 'Leap from D to A', focus: 'Transfer the same tactile shape into a three-sharp landing.' },
      { index: 16, phase: 4, title: 'Leap from A to E', focus: 'Keep orientation while moving into a four-sharp position.' },
      { index: 17, phase: 5, title: 'Map B and F-sharp', focus: 'Place both new hand maps before asking the hand to jump between them.' },
      { index: 18, phase: 5, title: 'Move from B to F-sharp', focus: 'Move only after both five- and six-sharp hand maps have been established.' },
      { index: 19, phase: 6, title: 'Anchor, then build', focus: 'Start from a supplied root, add the third, then complete the chord with the fifth.' },
      { index: 20, phase: 6, title: 'Complete the chord frame', focus: 'Build every chord in the familiar 1-3-5 order.' },
      { index: 21, phase: 6, title: 'Move the middle tone', focus: 'Hear how the third changes while the root-to-third-to-fifth order stays familiar.' },
      { index: 22, phase: 6, title: 'Match an isolated anchor', focus: 'Find the bottom note from the broken example, then rebuild the chord in 1-3-5 order.' },
      { index: 23, phase: 7, title: 'Retain the heard shape', focus: 'Keep all three chord tones after the blocked and broken examples, then rebuild them together.' },
      { index: 24, phase: 7, title: 'Transfer the heard shape', focus: 'Rebuild major and minor shapes across the widest root and register range without visual note clues.' },
    ],
    'The deployed 24-lesson pathway must match the approved phase structure.',
  );
  assert.ok(timingLeniencyForLesson(1, totalLessons).onBeatWindow >
    timingLeniencyForLesson(totalLessons, totalLessons).onBeatWindow,
  'Timing tolerance must tighten smoothly across the pathway.');
  assert.deepEqual(
    CURRICULUM_BLUEPRINT.map(({ drills }) => drills),
    [
      ['standard', 'standard', 'prove-it', 'prove-it'],
      ['standard', 'prove-it', 'blind-memory', 'standard'],
      ['standard', 'standard', 'prove-it', 'prove-it'],
      ['standard', 'prove-it', 'blind-memory', 'standard'],
      ['standard', 'prove-it', 'blind-memory', 'prove-it'],
      ['standard', 'blind-memory', 'standard', 'prove-it'],
      ['standard', 'prove-it', 'blind-memory', 'prove-it'],
      ['standard', 'blind-memory', 'standard', 'prove-it'],
      ['standard', 'prove-it', 'blind-memory', 'prove-it'],
      ['standard', 'blind-memory', 'standard', 'prove-it'],
      ['standard', 'prove-it', 'blind-memory', 'prove-it'],
      ['standard', 'blind-memory', 'standard', 'prove-it'],
      ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'],
      ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'],
      ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'],
      ['anchor-shift', 'chord-reading', 'blind-memory', 'anchor-shift'],
      ['standard', 'prove-it', 'standard', 'prove-it'],
      ['anchor-shift', 'chord-reading', 'blind-memory', 'anchor-shift'],
      ['spatial-chord', 'chord-reading', 'spatial-chord', 'chord-reading'],
      ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'],
      ['spatial-chord', 'chord-reading', 'chord-reading', 'spatial-chord'],
      ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'],
      ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'],
      ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'],
    ],
    'Every lesson must keep its reviewed four-drill teaching order.',
  );

  const curriculumDifficultyRungs = CURRICULUM_BLUEPRINT.flatMap((lesson) =>
    lesson.drills.map((_, drillIndex) => Math.min(1, lesson.difficultyBase + drillIndex * 0.012)));
  curriculumDifficultyRungs.slice(1).forEach((difficulty, index) => {
    assert.ok(difficulty > curriculumDifficultyRungs[index],
      `Difficulty must rise at every drill boundary; rung ${index + 2} went backward.`);
  });

  for (const lesson of PROGRESSIVE_CONCEPTS) {
    const blueprint = CURRICULUM_BLUEPRINT[lesson.index - 1];
    assert.equal(lesson.learningOutcome, blueprint.learningOutcome);
    assert.deepEqual(lesson.coreProblems, blueprint.coreProblems);
    assert.deepEqual(lesson.problemTags, blueprint.problemTags);
    assert.deepEqual(lesson.drillPurposes, blueprint.drillPurposes);
    assert.equal(lesson.primaryProblem, lesson.coreProblems[0]);
    assert.equal(lesson.drillPurposes.length, 4,
      `Lesson ${lesson.index} must explain all four fixed drill slots.`);
    assert.ok(lesson.drillPurposes.every((purpose) => purpose.trim().length >= 12),
      `Lesson ${lesson.index} has an empty or vague drill purpose.`);
    assert.equal(new Set(lesson.problemTags).size, lesson.problemTags.length,
      `Lesson ${lesson.index} contains duplicate remediation tags.`);
  }

  for (const problem of REMEDIATION_PROBLEMS) {
    const candidates = lessonsForProblem(problem);
    assert.ok(candidates.length > 0, `${problem} has no targeted lesson.`);
    assert.ok(candidates[0].coreProblems.includes(problem),
      `${problem} routes to incidental reinforcement instead of a core intervention.`);
    assert.equal(openingLessonForProblem(problem), candidates[0].index,
      `${problem} opening route disagrees with its best-fit intervention.`);
  }

  const baseQuestionsFor = (lessonIndex) => Array.from({ length: 4 }, (_, index) =>
    PROGRESSIVE_CONCEPTS[lessonIndex - 1].generate(
      lessonIndex * 100 + index,
      makeRandom(20260827 + lessonIndex * 17 + index),
      0.5,
      'normal',
      index + 1,
    ));
  const clefLesson = baseQuestionsFor(4);
  for (const question of [clefLesson[0], clefLesson[3]]) {
    assert.equal(question.exerciseMode, 'standard');
    assert.equal(question.handScope, 'both');
    assert.deepEqual(new Set(question.cue.staves.map(({ clef }) => clef)), new Set(['treble', 'bass']),
      'The clef-differentiation intervention must show a real grand staff.');
  }
  for (let lessonIndex = 5; lessonIndex <= 12; lessonIndex += 1) {
    assert.ok(baseQuestionsFor(lessonIndex).every(({ exerciseMode }) => exerciseMode !== 'spatial-chord'),
      `Lesson ${lessonIndex} must not interrupt key/phrase remediation with unrelated chord-by-ear work.`);
  }
  for (let lessonIndex = 13; lessonIndex <= 18; lessonIndex += 1) {
    if (lessonIndex === 17) continue;
    const questions = baseQuestionsFor(lessonIndex);
    assert.equal(questions[0].exerciseMode, 'anchor-shift');
    assert.equal(questions[0].handScope, 'right');
    assert.equal(questions[3].exerciseMode, 'anchor-shift');
    assert.equal(questions[3].handScope, 'left');
  }
  for (let lessonIndex = 19; lessonIndex <= 24; lessonIndex += 1) {
    const questions = baseQuestionsFor(lessonIndex);
    assert.ok(questions.every(({ exerciseMode }) =>
      exerciseMode === 'standard' || exerciseMode === 'spatial-chord'),
    `Lesson ${lessonIndex} must spend all four slots on chord reading or chord-by-ear.`);
    assert.equal(questions.filter(({ exerciseMode }) => exerciseMode === 'spatial-chord').length, 2,
      `Lesson ${lessonIndex} needs exactly two ear-chord applications.`);
  }
  for (const lessonIndex of [21, 22, 23, 24]) {
    const qualities = baseQuestionsFor(lessonIndex)
      .flatMap(({ spatialChord }) => spatialChord ? [spatialChord.quality] : []);
    assert.deepEqual(qualities, ['major', 'minor'],
      `Lesson ${lessonIndex} must contrast major and minor in its two ear drills.`);
  }

  let globalOrdinal = 0;
  const shiftPhaseRhythms = { eighth: 0, sixteenth: 0, plain: 0 };
  for (const concept of PROGRESSIVE_CONCEPTS) {
    assert.equal(concept.index, summary.length + 1, 'Lesson indices must be contiguous.');
    assert.equal(concept.baseQuestionCount, 4, `Lesson ${concept.index} must have four base drills.`);
    assert.ok(concept.maxQuestionCount >= concept.baseQuestionCount);

    const rhythms = { eighth: 0, sixteenth: 0, plain: 0 };
    const generatedModes = new Set();
    const cleanSignatures = new Map();

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
            if (question.handScope === 'both') {
              assert.deepEqual(
                new Set(question.cue.staves.map((candidate) => candidate.hand)),
                new Set(['right', 'left']),
                `Lesson ${concept.index}, drill ${questionNumber} says both hands without both staves.`,
              );
            } else {
              assert.equal(question.handScope, staff.hand,
                `Lesson ${concept.index}, drill ${questionNumber} hand label must match its staff.`);
            }
            assert.ok(question.expectedSequence.length > 0);
            assert.equal(plan.countInLabels.length, plan.beatsPerBar * 2,
              `Lesson ${concept.index}, drill ${questionNumber} needs a two-bar count-in.`);
            assert.deepEqual(
              plan.countInLabels,
              Array.from({ length: plan.beatsPerBar * 2 }, (_, index) =>
                String((index % plan.beatsPerBar) + 1)),
            );

            const staffBeatTotals = question.cue.staves.map((cueStaff) => cueStaff.notes.reduce(
              (sum, note) => sum + beatsForDuration(note.duration),
              0,
            ));
            const totalBeats = Math.max(...staffBeatTotals);
            assert.ok(staffBeatTotals.every((beats) => (
              Math.abs(beats / plan.beatsPerBar - Math.round(beats / plan.beatsPerBar)) < 1e-8
            )), `Lesson ${concept.index}, drill ${questionNumber} must fill complete measures.`);
            const timedWaitBeats = (question.anchorShift?.timedShift?.waitSeconds ?? 0) /
              plan.secondsPerBeat;
            assert.ok(Math.abs(plan.totalBeats - totalBeats - timedWaitBeats) < 1e-8,
              `Lesson ${concept.index}, drill ${questionNumber} timeline must include its exact shift pause.`);

            if (question.exerciseMode === 'anchor-shift') {
              const stagedReveal = concept.index >= 15;
              const expectedWaitSeconds = concept.index === 15 ? 5 : concept.index === 16 ? 3.5 : 2;
              if (!stagedReveal) {
                assert.equal(question.anchorShift?.timedShift, undefined,
                  `Lesson ${concept.index} must preserve the original always-visible switch.`);
                assert.equal(plan.timedShift, undefined);
              } else {
                assert.equal(question.anchorShift?.timedShift?.waitSeconds, expectedWaitSeconds,
                  `Lesson ${concept.index} must use its progressive phrase-reveal window.`);
                assert.equal(question.anchorShift?.timedShift?.revealSecond, true);
                assert.equal(plan.timedShift?.waitSeconds, expectedWaitSeconds);
                assert.ok(question.instruction.includes('newly revealed'));
              }
              const splitIndex = question.anchorShift.splitIndex;
              const writtenSplitBeat = staff.notes.slice(0, splitIndex).reduce(
                (sum, note) => sum + beatsForDuration(note.duration),
                0,
              );
              if (plan.timedShift) {
                assert.ok(Math.abs(plan.timedShift.startBeat - writtenSplitBeat) < 1e-8);
                assert.ok(Math.abs(
                  plan.expectedNotes[splitIndex].beat - plan.timedShift.endBeat,
                ) < 1e-8, 'The second staff must start only after the full reveal window.');
                const clickBeats = metronomeBeatPositions(plan);
                assert.ok(clickBeats.every((beat) => (
                  beat < plan.timedShift.startBeat || beat >= plan.timedShift.endBeat
                )), 'The metronome must be silent throughout the phrase-reveal window.');
                assert.ok(clickBeats.some((beat) => (
                  Math.abs(beat - plan.timedShift.endBeat) < 1e-8
                )), 'The metronome must resume exactly with the second staff.');
              }
            }

            const writtenPitches = question.cue.staves.length === 1
              ? staff.notes
                .filter((note) => !note.duration.endsWith('r'))
                .flatMap((note) => note.keys.map(toScientific))
              : Array.from(
                { length: Math.max(...question.cue.staves.map((cueStaff) => cueStaff.notes.length)) },
                (_, noteIndex) => question.cue.staves.flatMap((cueStaff) => {
                  const note = cueStaff.notes[noteIndex];
                  return note && !note.duration.endsWith('r') ? note.keys.map(toScientific) : [];
                }),
              ).flat();
            assert.deepEqual(writtenPitches, question.expectedSequence,
              `Lesson ${concept.index}, drill ${questionNumber} notation and grading pitches diverged.`);

            const midis = question.expectedSequence.map(pitchToMidi);
            assert.ok(midis.every((midi) => midi !== null && midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI),
              `Lesson ${concept.index}, drill ${questionNumber} exceeds the detector-safe register.`);

            const durations = staff.notes.map((note) => note.duration);
            const materialSignature = JSON.stringify({
              position: question.positionLabel,
              mode: question.exerciseMode,
              pitches: question.expectedSequence,
              durations,
              progression: question.spatialChord?.context.progression ?? null,
            });
            const existingSignature = cleanSignatures.get(questionNumber);
            if (existingSignature === undefined) cleanSignatures.set(questionNumber, materialSignature);
            else assert.equal(materialSignature, existingSignature,
              `Lesson ${concept.index}, drill ${questionNumber} changed with seed, mode, or adaptive difficulty.`);
            const blueprint = CURRICULUM_BLUEPRINT[concept.index - 1];
            const localRep = (questionNumber - 1) % concept.baseQuestionCount;
            assert.equal(
              question.difficulty,
              Math.min(1, blueprint.difficultyBase + localRep * 0.012),
              `Lesson ${concept.index}, drill ${questionNumber} left its fixed difficulty rung.`,
            );
            if (durations.some((duration) => duration.startsWith('16'))) rhythms.sixteenth += 1;
            else if (durations.some((duration) => duration.startsWith('8'))) rhythms.eighth += 1;
            else rhythms.plain += 1;

            if (question.exerciseMode === 'prove-it') {
              assert.ok(question.positionProof, 'Prove It needs a proof specification.');
              const expectedFingers = staff.hand === 'right' ? [1, 3, 5] : [5, 3, 1];
              assert.deepEqual(question.positionProof.proofNotes.map((note) => note.finger), expectedFingers,
                `Lesson ${concept.index}, drill ${questionNumber} has invalid ${staff.hand}-hand proof fingers.`);
              assert.equal(question.positionProof.requireHeld, false,
                `Lesson ${concept.index}, drill ${questionNumber} must use sequential anchor notes.`);
              assert.equal(question.positionProof.acceptWindowMs, 5500,
                `Lesson ${concept.index}, drill ${questionNumber} must use the gently widened proof window.`);
            }
            if (question.exerciseMode === 'blind-memory') {
              const noteCount = question.expectedSequence.length;
              assert.ok(noteCount >= 8 && noteCount <= 15,
                `Memory drill length ${noteCount} is outside the chunking range.`);
              const expectedPreview = noteCount >= 10 ? 15 : 10;
              assert.equal(question.blindMemory?.previewSeconds, expectedPreview);
              assert.match(question.instruction, new RegExp(`${expectedPreview} seconds`));
              assert.match(question.instruction, /pattern/i);
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
              assert.ok(
                beatsForDuration(staff.notes[question.anchorShift.splitIndex - 1].duration) >= 1 &&
                  beatsForDuration(staff.notes[question.anchorShift.splitIndex].duration) >= 1,
                `Lesson ${concept.index}, drill ${questionNumber} puts a fast subdivision across the hand shift.`,
              );
            }
            if (question.exerciseMode === 'spatial-chord') {
              assert.ok(question.spatialChord);
              assert.deepEqual(question.spatialChord.buildOrder, [0, 1, 2]);
              assert.deepEqual(
                question.expectedSequence,
                question.spatialChord.buildOrder.map(
                  (index) => question.spatialChord.chordPitches[index],
                ),
              );
              assert.equal(question.spatialChord.context.targetChordIndex,
                question.spatialChord.context.progression.length - 1);
              const progression = question.spatialChord.context.progression;
              assert.deepEqual(question.spatialChord.context.layers, [],
                'Chord by ear must not reintroduce confusing accompaniment layers.');
              assert.deepEqual(progression, [question.spatialChord.chordPitches],
                'Chord by ear must contain only the target chord; live audio adds its broken form.');
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
                exerciseMode: question.exerciseMode,
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

              const offlineOnlyFinish = perfect.map((note, index) => (
                index === perfect.length - 1
                  ? { ...note, analysisSource: 'offline-recovered' }
                  : note
              ));
              const offlineOnlyGrade = gradeSequence(
                question.expectedSequence,
                offlineOnlyFinish,
                gradeOptions,
              );
              assert.equal(offlineOnlyGrade.matched, perfect.length,
                'Offline recovery should retain partial credit for a supported quiet note.');
              if (question.exerciseMode !== 'blind-memory') {
                assert.ok(offlineOnlyGrade.scores.pitch < 5 && offlineOnlyGrade.scores.overall < 5,
                  `A note missed by the live detector incorrectly produced 5.0 in Lesson ${concept.index}.`);
              }

              const humanPerfect = perfect.map((note, index) => {
                const attackJitter = (index % 2 === 0 ? -0.12 : 0.12) * plan.secondsPerBeat;
                const releaseJitter = (index % 3 === 0 ? 0.18 : -0.18) * plan.secondsPerBeat;
                return {
                  ...note,
                  time: note.time + attackJitter,
                  endTime: note.endTime + attackJitter + releaseJitter,
                };
              });
              const humanPerfectGrade = gradeSequence(
                question.expectedSequence,
                humanPerfect,
                gradeOptions,
              );
              assert.equal(
                humanPerfectGrade.scores.timing,
                5,
                `Normal human/device jitter lost full timing credit in Lesson ${concept.index}.`,
              );
              const latencyShifted = humanPerfect.map((note) => ({
                ...note,
                time: note.time + plan.secondsPerBeat * 0.52,
                endTime: note.endTime + plan.secondsPerBeat * 0.52,
              }));
              const latencyShiftedGrade = gradeSequence(
                question.expectedSequence,
                latencyShifted,
                gradeOptions,
              );
              assert.equal(
                latencyShiftedGrade.scores.timing,
                5,
                `Fixed device latency was mistaken for bad rhythm in Lesson ${concept.index}.`,
              );

              // A fluent human phrase is a timing category, not a laboratory
              // sequence of identical timestamps. Smooth push/pull inside the
              // visible beat must retain 5.0 across the whole curriculum.
              const fluentOffsets = [-0.22, -0.08, 0.1, 0.22, 0.08, -0.1, -0.2, -0.04, 0.14];
              const fluentTake = perfect.map((note, index) => {
                const onsetOffset = fluentOffsets[index % fluentOffsets.length] * plan.secondsPerBeat;
                const releaseOffset = (index % 2 === 0 ? 0.2 : -0.2) * plan.secondsPerBeat;
                return {
                  ...note,
                  time: note.time + onsetOffset,
                  endTime: note.endTime + onsetOffset + releaseOffset,
                };
              });
              const fluentGrade = gradeSequence(
                question.expectedSequence,
                fluentTake,
                gradeOptions,
              );
              assert.equal(
                fluentGrade.scores.timing,
                5,
                `Musically fluent timing lost mastery credit in Lesson ${concept.index}.`,
              );
              assert.equal(
                fluentGrade.scores.overall,
                5,
                `A fluent, complete performance showed a 4.x Overall in Lesson ${concept.index}.`,
              );

              // Release tracking is room-dependent. An ambiguous estimate is
              // diagnostic only and must not turn exact attacks into 4.x.
              const uncertainReleases = perfect.map((note) => ({
                ...note,
                endTime: note.time + plan.secondsPerBeat * 2.75,
                durationConfidence: 0.7,
              }));
              const uncertainReleaseGrade = gradeSequence(
                question.expectedSequence,
                uncertainReleases,
                gradeOptions,
              );
              assert.equal(
                uncertainReleaseGrade.scores.timing,
                5,
                `Ambiguous release evidence lowered Timing in Lesson ${concept.index}.`,
              );
              assert.equal(
                uncertainReleaseGrade.scores.overall,
                5,
                `Ambiguous release evidence lowered Overall in Lesson ${concept.index}.`,
              );

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
                if (question.exerciseMode !== 'blind-memory') {
                  assert.ok(missGrade.scores.pitch < 5 && missGrade.scores.overall < 5,
                    `One missed note incorrectly earned 5.0 in Lesson ${concept.index}, drill ${questionNumber}.`);
                }

                const oneOnly = gradeSequence(question.expectedSequence, [perfect[0]], gradeOptions);
                assert.ok(oneOnly.scores.overall < 2,
                  `One heard note scored too highly in Lesson ${concept.index}, drill ${questionNumber}.`);
              }

              if (perfect.length >= 3) {
                // The axes must stay independent: a corrected wrong key costs
                // Cleanliness, but cannot also demote exact matched-note timing.
                const correctedWrongKey = [
                  perfect[0],
                  {
                    ...perfect[0],
                    midi: perfect[0].midi + 1,
                    time: perfect[0].time + plan.secondsPerBeat * 0.35,
                    endTime: undefined,
                  },
                  ...perfect.slice(1),
                ];
                const correctedWrongGrade = gradeSequence(
                  question.expectedSequence,
                  correctedWrongKey,
                  gradeOptions,
                );
                assert.equal(correctedWrongGrade.scores.pitch, 5,
                  `A corrected extra corrupted Pitch in Lesson ${concept.index}.`);
                assert.equal(correctedWrongGrade.scores.timing, 5,
                  `A corrected extra was penalised again in Timing in Lesson ${concept.index}.`);
                assert.ok(correctedWrongGrade.scores.cleanliness < 5,
                  `A corrected extra was not isolated to Cleanliness in Lesson ${concept.index}.`);

                const offBeat = perfect.map((note, index) => {
                  const offset = (index % 2 === 0 ? -0.65 : 0.65) * plan.secondsPerBeat;
                  return { ...note, time: note.time + offset, endTime: note.endTime + offset };
                });
                const offBeatGrade = gradeSequence(question.expectedSequence, offBeat, gradeOptions);
                assert.ok((offBeatGrade.scores.timing ?? 5) < 4.5,
                  `Off-beat performance was not identified in Lesson ${concept.index}, drill ${questionNumber}.`);

                const wrongHolds = perfect.map((note) => ({
                  ...note,
                  endTime: note.time + plan.secondsPerBeat * 2.75,
                }));
                const durationGrade = gradeSequence(question.expectedSequence, wrongHolds, gradeOptions);
                assert.ok((durationGrade.scores.timing ?? 5) < 4.5,
                  `Wrong note lengths were not identified in Lesson ${concept.index}, drill ${questionNumber}.`);
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
              assert.equal(grade.scores.timing, 5,
                'A clean chord built comfortably inside its search windows should earn 5.0.');
              assert.equal(grade.scores.cleanliness, 5);
              const exploratoryGrade = gradeSpatialChord(spec, detected, {
                ...spatialPerformance,
                wrongRootGuesses: spec.maxWrongGuesses + 3,
                wrongShapeGuesses: spec.maxWrongGuesses + 2,
                totalGuesses: spec.maxWrongGuesses * 2 + 8,
              });
              assert.equal(exploratoryGrade.passed, true,
                'A completed guided chord must not fail because the child explored first.');
              assert.ok(exploratoryGrade.spatialChord.efficiencyScore < grade.spatialChord.efficiencyScore,
                'Exploration should remain available to instructor telemetry.');
            }
          }
        }
      }
    }

    const baseModes = [1, 2, 3, 4].map((questionNumber) => concept.generate(
      globalOrdinal + questionNumber - 1,
      makeRandom(5000 + concept.index * 10 + questionNumber),
      0.5,
      'normal',
      questionNumber,
    ).exerciseMode);
    const expectedModes = CURRICULUM_BLUEPRINT[concept.index - 1].drills.map((kind) =>
      kind === 'chord-reading' ? 'standard' : kind,
    );
    assert.deepEqual(baseModes, expectedModes,
      `Lesson ${concept.index} did not follow its fixed drill blueprint.`);
    assert.ok(new Set(baseModes).size >= 2,
      `Lesson ${concept.index} needs at least two complementary exercise formats.`);
    for (let questionNumber = 5; questionNumber <= concept.maxQuestionCount; questionNumber += 1) {
      const repeatedFrom = ((questionNumber - 1) % concept.baseQuestionCount) + 1;
      assert.equal(cleanSignatures.get(questionNumber), cleanSignatures.get(repeatedFrom),
        `Lesson ${concept.index}'s remedial drill ${questionNumber} must repeat its named blueprint slot.`);
    }
    if (concept.index >= 5 && concept.index <= 12) {
      assert.ok(generatedModes.has('blind-memory') && generatedModes.has('standard'),
        `Lesson ${concept.index} must mix memory with complementary reading work.`);
      assert.equal(baseModes.filter((mode) => mode === 'blind-memory').length, 1,
        `Lesson ${concept.index} should contain exactly one memory drill in its base loop.`);
    }
    if (concept.index <= 5) assert.equal(rhythms.eighth + rhythms.sixteenth, 0);
    if (concept.index >= 6 && concept.index <= 12) assert.equal(rhythms.sixteenth, 0);
    if (concept.index >= 6 && concept.index <= 12) assert.ok(rhythms.eighth > 0);
    if (concept.index >= 13 && concept.index <= 18) {
      assert.equal(rhythms.sixteenth, 0,
        `Lesson ${concept.index} must not combine a new movement/key demand with sixteenths.`);
      assert.ok(rhythms.plain > 0 && rhythms.eighth > 0,
        `Lesson ${concept.index} must mix a simple-pulse drill with a subdivision drill.`);
      shiftPhaseRhythms.eighth += rhythms.eighth;
      shiftPhaseRhythms.sixteenth += rhythms.sixteenth;
      shiftPhaseRhythms.plain += rhythms.plain;
    }

    summary.push({
      lesson: concept.index,
      id: concept.id,
      modes: [...generatedModes],
      generatedCases: concept.maxQuestionCount * modes.length * difficulties.length * seeds.length,
    });
    globalOrdinal += concept.baseQuestionCount;
  }
  assert.ok(
    shiftPhaseRhythms.eighth > 0 &&
    shiftPhaseRhythms.plain > 0,
    'The shift phase must deliberately retain quarters while using only established eighths.',
  );

  // Earlier retries must never rotate the teaching order of a later lesson.
  // Lesson 17 is intentionally B (RH/LH), then F-sharp (RH/LH), regardless
  // of earlier repeats or the session seed.
  for (const ordinalOffset of [0, 1, 17, 93, 240]) {
    const lesson17 = [1, 2, 3, 4].map((questionNumber) =>
      PROGRESSIVE_CONCEPTS[16].generate(
        ordinalOffset + questionNumber,
        makeRandom(ordinalOffset + questionNumber),
        0.5,
        'normal',
        questionNumber,
      ));
    assert.deepEqual(
      lesson17.map((question) => question.positionLabel.replace(/ position.*$/, '')),
      ['B', 'B', 'F#', 'F#'],
      'Lesson 17 must establish B in both hands before F-sharp in both hands.',
    );
    assert.deepEqual(
      lesson17.map((question) => question.handScope),
      ['right', 'left', 'right', 'left'],
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
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[2], 1.3).progress, 1,
    'The fifth must not skip the middle-tone step.');
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[1], 1.5).progress, 2);
  assert.equal(advanceSpatialChord(activeSpatial, spatialMidi[2], 1.8).complete, false,
    'Sequential tone discovery must never prove a simultaneous chord.');
  assert.equal(
    updateSpatialChordPresence(activeSpatial, new Set(spatialMidi), 1.9).progress,
    3,
    'A simultaneous target set may arm final hold verification.',
  );

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
    [{
      source: 'yin', midi: recoveryMidi, frequency: 440, frames: 4,
      consensus: 0.8, clarity: 0.8, pitchMad: 0.1, tuningErrorCents: 0,
      pitchRange: 0.12, maxPitchStep: 0.08, pitchSlope: 0.1,
    }],
    true,
  ).midi, recoveryMidi, 'A stable expected hypothesis should recover a quiet correct note.');
  assert.equal(resolveContextualPitch(
    recoveryPlan,
    10,
    recoveryMidi + 1,
    recoveryTime,
    new Set(),
    [{
      source: 'yin', midi: recoveryMidi + 2, frequency: 440, frames: 4,
      consensus: 0.8, clarity: 0.8, pitchMad: 0.1, tuningErrorCents: 0,
      pitchRange: 0.12, maxPitchStep: 0.08, pitchSlope: 0.1,
    }],
    true,
  ).slot, null, 'Context must never bend a wrong pitch into the score.');

  assert.equal(timelineXForBeat(100, 500, 8, -1), 100);
  assert.equal(timelineXForBeat(100, 500, 8, 4), 300);
  assert.equal(timelineXForBeat(100, 500, 8, 20), 500);
  assert.deepEqual(
    scrubberBoundsFromOnsets([{ beat: 0, x: 100 }, { beat: 7, x: 450 }], 8, 90, 490),
    { startX: 100, endX: 490 },
  );
  assert.deepEqual(
    shiftRegionFromOnsets(
      [{ beat: 0, x: 100 }, { beat: 1, x: 160 }, { beat: 2, x: 220 }, { beat: 3, x: 280 }],
      2,
    ),
    { startX: 169, endX: 211, centerX: 190 },
  );

  // Reducer-level route audit: stale events are ignored and a completed proof
  // unlocks exactly once before the ordinary drill begins.
  let route = createInitialPathwayState({ seed: 20260802, cap: 1000 });
  assert.equal(route.status, 'prompt',
    'The pathway must open on the supported standard drill, not an assessment gate.');
  const proofQuestion = generateFor(1, 3, 2, route.difficulty, route.signal, route.seed);
  route = {
    ...route,
    question: 3,
    ordinal: 2,
    current: proofQuestion,
    status: 'position-prompt',
    proofCompleted: false,
  };
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
  assert.equal(route.question, 4);
  assert.notEqual(route.current.id, firstId);
  assert.equal(route.status, 'position-prompt');

  // Blind Memory has one guarded path: prompt -> preview -> count-in -> play.
  // Repeated/stale actions must not skip the preview or restart it underneath
  // an active take.
  const memoryQuestion = generateFor(5, 3, 12, 0.25, route.signal, 20260802);
  const laterMemoryQuestion = generateFor(12, 2, 44, 0.5, route.signal, 20260812);
  assert.equal(laterMemoryQuestion.exerciseMode, 'blind-memory');
  assert.equal(laterMemoryQuestion.blindMemory?.previewSeconds, 15);
  const laterMemoryPlan = planForQuestion(laterMemoryQuestion, 75);
  const memoryTimingTake = laterMemoryPlan.expectedNotes.map((slot, index) => ({
    midi: pitchToMidi(slot.pitch),
    time: 10 + (slot.beat + [0, 0.9, 0.12, 0.94, 0.16, 0.98][index % 6]) *
      laterMemoryPlan.secondsPerBeat,
    clarity: 0.92,
    strength: 2,
  }));
  const sharedMemoryGradeOptions = {
    plan: laterMemoryPlan,
    playStartTime: 10,
    lessonLevel: 12,
    totalLessons,
  };
  const memoryTimingGrade = gradeSequence(
    laterMemoryQuestion.expectedSequence,
    memoryTimingTake,
    { ...sharedMemoryGradeOptions, exerciseMode: 'blind-memory' },
  );
  const standardTimingGrade = gradeSequence(
    laterMemoryQuestion.expectedSequence,
    memoryTimingTake,
    { ...sharedMemoryGradeOptions, exerciseMode: 'standard' },
  );
  assert.equal(memoryTimingGrade.scores.pitch, 5,
    'Memory timing leniency must never change note accuracy.');
  assert.ok(
    (memoryTimingGrade.scores.timing ?? 0) > (standardTimingGrade.scores.timing ?? 0),
    `Blind Memory should grade the same notes less harshly for rhythm and timing: ${JSON.stringify({
      memory: memoryTimingGrade.scores,
      standard: standardTimingGrade.scores,
      rhythm: memoryTimingGrade.rhythm,
    })}`,
  );
  const perfectMemoryTake = laterMemoryPlan.expectedNotes.map((slot) => ({
    midi: pitchToMidi(slot.pitch),
    time: 10 + slot.beat * laterMemoryPlan.secondsPerBeat,
    clarity: 0.92,
    strength: 2,
  }));
  const missedMemoryTake = perfectMemoryTake.filter(
    (_, index) => index !== Math.floor(perfectMemoryTake.length / 2),
  );
  const missedMemoryGrade = gradeSequence(
    laterMemoryQuestion.expectedSequence,
    missedMemoryTake,
    { ...sharedMemoryGradeOptions, exerciseMode: 'blind-memory' },
  );
  assert.equal(missedMemoryGrade.missed, 1);
  assert.ok(
    missedMemoryGrade.scores.pitch >= 4.5 && missedMemoryGrade.scores.pitch < 5,
    'One omitted memory note should recognize the chunk without being reported as perfect pitch.',
  );
  assert.ok(
    missedMemoryGrade.scores.overall >= 4.5 && missedMemoryGrade.scores.overall < 5,
    'A recognized memory chunk with one omission should pass strongly, but not receive 5.0.',
  );
  const wrongMemoryTake = perfectMemoryTake.map((note, index) => (
    index === Math.floor(perfectMemoryTake.length / 2)
      ? { ...note, midi: note.midi + 1 }
      : note
  ));
  const wrongMemoryGrade = gradeSequence(
    laterMemoryQuestion.expectedSequence,
    wrongMemoryTake,
    { ...sharedMemoryGradeOptions, exerciseMode: 'blind-memory' },
  );
  assert.ok(wrongMemoryGrade.scores.pitch < 5,
    'Memory leniency must not turn a wrong note into pattern mastery.');
  let memoryRoute = {
    ...route,
    lesson: 5,
    question: 3,
    loopSize: 4,
    current: memoryQuestion,
    status: 'prompt',
    proofCompleted: false,
    report: null,
    finished: false,
  };
  assert.equal(memoryQuestion.exerciseMode, 'blind-memory');
  assert.equal(pathwayReducer(memoryRoute, {
    type: 'MEMORY_START', questionId: 'stale-question',
  }).status, 'prompt');
  memoryRoute = pathwayReducer(memoryRoute, {
    type: 'MEMORY_START', questionId: memoryQuestion.id,
  });
  assert.equal(memoryRoute.status, 'memory-preview');
  assert.equal(pathwayReducer(memoryRoute, {
    type: 'PLAY_START', questionId: memoryQuestion.id, now: 1,
  }).status, 'memory-preview', 'The memory preview cannot be skipped by a premature audio callback.');
  memoryRoute = pathwayReducer(memoryRoute, { type: 'START', questionId: memoryQuestion.id });
  assert.equal(memoryRoute.status, 'leadin');
  memoryRoute = pathwayReducer(memoryRoute, {
    type: 'PLAY_START', questionId: memoryQuestion.id, now: 1000,
  });
  assert.equal(memoryRoute.status, 'listening');
  assert.equal(pathwayReducer(memoryRoute, {
    type: 'MEMORY_START', questionId: memoryQuestion.id,
  }).status, 'listening', 'A live memory take must not restart its preview timer.');

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
    if (fullRoute.current.exerciseMode === 'anchor-shift') {
      assert.equal(grade.scores.overall, 5,
        'A perfect hand-position switch must retain full mastery credit.');
      assert.equal(grade.transition?.score, 5,
        'The planned movement window must not count as extra transition delay.');
      const waitSeconds = fullRoute.current.anchorShift.timedShift?.waitSeconds;
      if (waitSeconds) {
        const splitIndex = fullRoute.current.anchorShift.splitIndex;
        const unpausedTake = performed.map((note, index) => (
          index >= splitIndex ? { ...note, time: note.time - waitSeconds } : note
        ));
        const unpausedGrade = gradeSequence(fullRoute.current.expectedSequence, unpausedTake, {
          plan: currentPlan,
          playStartTime: playStart,
          lessonLevel: fullRoute.lesson,
          totalLessons,
          anchorShift: fullRoute.current.anchorShift,
        });
        assert.ok((unpausedGrade.scores.timing ?? 5) < 5,
          'Playing the second staff before its reveal window ends must not receive perfect timing.');
      }
    }
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
    assert.equal(
      fullRoute.status,
      fullRoute.current.exerciseMode === 'spatial-chord' ? 'chord-complete' : 'report',
    );
    fullRoute = pathwayReducer(fullRoute, { type: 'CONTINUE', difficultyNudge: 0 });
  }
  assert.equal(routeGuard, totalLessons * 4,
    'A perfect pathway must contain exactly four drills per lesson.');
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
    loopSize: 4,
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
  const chordMidi = chordQuestion.spatialChord.chordPitches.map(pitchToMidi);
  const chordTimes = [20.3, 20.8, 21.25];
  const chordDetected = chordMidi.map((midi, index) => ({
    midi,
    time: chordTimes[index],
    clarity: 0.92,
    strength: 2,
    sustain: 1,
  }));
  const chordResult = gradeSpatialChord(chordQuestion.spatialChord, chordDetected, {
    startedAt: 20,
    rootFoundAt: chordTimes[0],
    completedAt: chordTimes[2],
    rootFound: true,
    foundMidi: chordMidi,
    toneFoundAt: [
      { midi: chordMidi[0], time: chordTimes[0] },
      { midi: chordMidi[2], time: chordTimes[1] },
      { midi: chordMidi[1], time: chordTimes[2] },
    ],
    wrongRootGuesses: 0,
    wrongShapeGuesses: 0,
    totalGuesses: 3,
    timedOut: false,
  });
  route = pathwayReducer(route, {
    type: 'RESOLVE',
    result: chordResult,
    detected: chordDetected,
    recognition: diagnostics,
    questionId: chordQuestion.id,
    now: 7200,
  });
  assert.equal(route.status, 'chord-complete',
    'Chord by Ear must use its simple completion screen instead of the scored report.');
  route = pathwayReducer(route, { type: 'CONTINUE', difficultyNudge: 0 });
  assert.equal(route.question, 2, 'Chord completion must advance exactly once.');

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
  await rm(auditCacheDir, { recursive: true, force: true });
}
