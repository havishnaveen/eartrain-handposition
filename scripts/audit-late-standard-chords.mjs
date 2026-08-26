import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const auditCacheDir = await mkdtemp(join(tmpdir(), 'eartrain-late-chords-'));
const server = await createServer({
  cacheDir: auditCacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { PROGRESSIVE_CONCEPTS } = await server.ssrLoadModule(
    '/src/curriculum/progressiveCurriculum.ts',
  );
  const { makeRandom, toScientific } = await server.ssrLoadModule(
    '/src/curriculum/positions.ts',
  );
  const { planForQuestion, pitchToMidi } = await server.ssrLoadModule(
    '/src/audio/timing.ts',
  );
  const {
    findCompletePolyphonicGroup,
    polyphonicSlotGroupsForPlan,
    polyphonicTargetsForPlan,
  } = await server.ssrLoadModule('/src/audio/useDrillAudio.ts');

  for (const lesson of PROGRESSIVE_CONCEPTS.filter(({ index }) => index >= 16 && index <= 19)) {
    const questions = Array.from(
      { length: lesson.maxQuestionCount },
      (_, index) => index + 1,
    ).map((questionNumber) => lesson.generate(
      lesson.index * 10 + questionNumber,
      makeRandom(20260824 + lesson.index + questionNumber),
      0.5,
      'normal',
      questionNumber,
    ));
    const standard = questions.filter(({ exerciseMode }) => exerciseMode === 'standard');
    assert.ok(standard.length > 0, `Lesson ${lesson.index} needs a normal exercise.`);
    assert.ok(
      questions.slice(0, lesson.baseQuestionCount)
        .some(({ exerciseMode }) => exerciseMode === 'standard'),
      `Lesson ${lesson.index} needs a normal exercise in its base lesson loop.`,
    );

    standard.forEach((question) => {
      const chordNotes = question.cue.staves
        .flatMap((staff) => staff.notes)
        .filter((note) => !note.duration.endsWith('r') && note.keys.length >= 2);
      assert.ok(chordNotes.length >= 1, `Lesson ${lesson.index} normal exercise needs chords.`);
      if (lesson.index === 17) {
        const sounded = question.cue.staves.flatMap((staff) => staff.notes)
          .filter((note) => !note.duration.endsWith('r'));
        assert.equal(sounded.length, 5, 'Lesson 17 must stay at a short late-Level-5 phrase length.');
        assert.equal(sounded.at(-1).keys.length, 3, 'Lesson 17 introduces its only chord at the end.');
        assert.ok(sounded.slice(0, -1).every((note) => note.keys.length === 1),
          'Lesson 17 must build from single notes before its final chord.');
      }
      assert.deepEqual(
        question.cue.staves.flatMap((staff) => staff.notes)
          .filter((note) => !note.duration.endsWith('r'))
          .flatMap((note) => note.keys.map(toScientific)),
        question.expectedSequence,
        `Lesson ${lesson.index} chord notation must match grading pitches.`,
      );

      const plan = planForQuestion(question, 75);
      assert.equal(plan.guideNote, false, 'A written chord must not become a sequential guide run.');
      const groups = polyphonicSlotGroupsForPlan(plan);
      chordNotes.forEach((note) => {
        const wanted = note.keys.map(toScientific).map(pitchToMidi);
        assert.ok(wanted.every((midi) => polyphonicTargetsForPlan(plan).includes(midi)));
        const group = groups.find((candidate) =>
          candidate.slots.length === wanted.length &&
          wanted.every((midi) => candidate.slots.some((slot) => slot.midi === midi))
        );
        assert.ok(group, 'Every chord tone must be scheduled in one polyphonic score group.');
        assert.equal(
          findCompletePolyphonicGroup(plan, new Set([wanted[0]]), group.beat, new Set()),
          null,
          'One chord tone must never satisfy a written chord.',
        );
        assert.equal(
          findCompletePolyphonicGroup(plan, new Set([wanted[0] - 1]), group.beat, new Set()),
          null,
          'An unrelated key must never satisfy a written chord.',
        );
        assert.ok(
          findCompletePolyphonicGroup(plan, new Set(wanted), group.beat, new Set()),
          'The complete simultaneous chord must satisfy its written stack.',
        );
      });
    });
  }

  const switchExpectations = new Map([
    [14, { landingNotes: 4, waitSeconds: 0 }],
    [15, { landingNotes: 4, waitSeconds: 5 }],
    [18, { landingNotes: 5, waitSeconds: 2 }],
  ]);
  for (const [lessonIndex, expected] of switchExpectations) {
    const lesson = PROGRESSIVE_CONCEPTS[lessonIndex - 1];
    const question = lesson.generate(
      lessonIndex * 100 + 1,
      makeRandom(20260826 + lessonIndex),
      0.5,
      'normal',
      1,
    );
    assert.equal(question.exerciseMode, 'anchor-shift');
    assert.equal(
      question.cue.staves[0].notes.length - question.anchorShift.splitIndex,
      expected.landingNotes,
      `Lesson ${lessonIndex} must use its gradual destination-phrase length.`,
    );
    assert.equal(
      question.anchorShift.timedShift?.waitSeconds ?? 0,
      expected.waitSeconds,
      `Lesson ${lessonIndex} must use its gradual reveal time.`,
    );
  }

  const dedicatedChordRoots = PROGRESSIVE_CONCEPTS
    .filter(({ index }) => index >= 19 && index <= 24)
    .map((lesson) => lesson.generate(
      lesson.index * 100 + 1,
      makeRandom(303000 + lesson.index),
      0.5,
      'normal',
      1,
    ).spatialChord.rootPitch.replace(/-?\d+$/, ''));
  assert.ok(new Set(dedicatedChordRoots).size >= 4,
    `Dedicated chord lessons must rotate starting roots, received ${dedicatedChordRoots.join(', ')}.`);

  console.log('Late curriculum audit passed: readable switch phrases, varied chord roots, and simultaneous late-reading chords.');
} finally {
  await server.close();
  await rm(auditCacheDir, { recursive: true, force: true });
}
