// Empirical harness: walks the real curriculum's anchor-shift ("Move Your
// Hand") questions and grades REALISTIC synthetic performances at the shift
// boundary — small onset jitter everywhere, a swept range of hand-shift
// durations, and a simulated missed boundary-note detection — to find and
// fix the false-negative bug where objectively correct, humanly-timed play
// scores far below what it should.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(join(tmpdir(), 'eartrain-vite-anchor-'));
const server = await createServer({
  cacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

// Deterministic small PRNG for reproducible "realistic" jitter.
function makeJitter(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff; // [0,1)
  };
}

try {
  const { PROGRESSIVE_CONCEPTS, CURRICULUM_BLUEPRINT } = await server.ssrLoadModule(
    '/src/curriculum/progressiveCurriculum.ts',
  );
  const { gradeSequence, planForQuestion, pitchToMidi } = await server.ssrLoadModule(
    '/src/audio/timing.ts',
  );
  const { makeRandom } = await server.ssrLoadModule('/src/curriculum/positions.ts');

  const BPM = 78; // realistic mid-range practice tempo
  const rnd = makeJitter(1337);
  const jitterMs = (spreadMs) => (rnd() * 2 - 1) * spreadMs; // +/- spreadMs

  let trialsRun = 0;
  let failuresAtOrAboveScore4_5 = 0; // realistic-correct trials that SHOULD score high
  const rows = [];

  function buildPerformance(plan, splitIndex, expectedSequence, opts) {
    const {
      preJitterMs = 60,
      postJitterMs = 60,
      transitionSeconds,
      dropBoundaryNote = null, // 'firstTo' | 'lastFrom' | null
    } = opts;
    const playStart = 100;
    const idealTime = (slot) => playStart + slot.beat * plan.secondsPerBeat;
    const notes = [];
    let prevTime = -Infinity;
    for (let i = 0; i < plan.expectedNotes.length; i++) {
      const slot = plan.expectedNotes[i];
      let time;
      if (i < splitIndex) {
        time = idealTime(slot) + jitterMs(preJitterMs) / 1000;
      } else if (i === splitIndex) {
        // Anchored to the actual lastFrom time below (post-hoc adjustment).
        time = idealTime(slot);
      } else {
        time = idealTime(slot) + jitterMs(postJitterMs) / 1000;
      }
      // Keep strictly increasing so we never invert order within a half.
      if (i !== splitIndex) time = Math.max(time, prevTime + 0.02);
      notes.push({
        midi: pitchToMidi(expectedSequence[i]),
        time,
        endTime: time + plan.secondsPerBeat * (slot.beats ?? 1),
        clarity: 0.9 + rnd() * 0.08,
        strength: 1.6 + rnd() * 0.8,
        sustain: 1,
        durationConfidence: 0.85 + rnd() * 0.1,
        detectorLane: 'strict',
        detectorId: i,
      });
      if (i !== splitIndex) prevTime = time;
    }
    // Now pin the transition precisely: firstTo.time = lastFrom.time + transitionSeconds
    const lastFrom = notes[splitIndex - 1];
    const idealLandingTime = idealTime(plan.expectedNotes[splitIndex]);
    notes[splitIndex].time = lastFrom.time + transitionSeconds;
    notes[splitIndex].endTime = notes[splitIndex].time +
      plan.secondsPerBeat * (plan.expectedNotes[splitIndex].beats ?? 1);
    // A real student who takes longer (or less) than ideal to land still
    // plays the REST of the landing phrase at the normal tempo, offset from
    // where their hand actually came down — not compressed/stretched to
    // catch up with the idealized absolute beat grid. Anchor every later
    // note to the actual landing time plus its own ideal offset from it.
    const landingDrift = notes[splitIndex].time - idealLandingTime;
    prevTime = notes[splitIndex].time;
    for (let i = splitIndex + 1; i < notes.length; i++) {
      const driftedIdeal = idealTime(plan.expectedNotes[i]) + landingDrift + jitterMs(postJitterMs) / 1000;
      notes[i].time = Math.max(driftedIdeal, prevTime + 0.02);
      notes[i].endTime = notes[i].time +
        plan.secondsPerBeat * (plan.expectedNotes[i].beats ?? 1);
      prevTime = notes[i].time;
    }
    if (dropBoundaryNote === 'firstTo') notes.splice(splitIndex, 1);
    else if (dropBoundaryNote === 'lastFrom') notes.splice(splitIndex - 1, 1);
    return { notes, playStart };
  }

  function runTrial(label, lessonIndex, question, expectedSequence, plan, splitIndex, opts) {
    const { notes, playStart } = buildPerformance(plan, splitIndex, expectedSequence, opts);
    const grade = gradeSequence(expectedSequence, notes, {
      plan,
      playStartTime: playStart,
      lessonLevel: lessonIndex,
      totalLessons: CURRICULUM_BLUEPRINT.length,
      anchorShift: question.anchorShift,
      exerciseMode: 'anchor-shift',
    });
    trialsRun += 1;
    rows.push({
      lesson: lessonIndex,
      label,
      transitionSec: opts.transitionSeconds?.toFixed(3) ?? 'n/a',
      allowedExtraBeats: question.anchorShift.allowedExtraBeats.toFixed(3),
      writtenGapBeats: grade.transition?.writtenGapBeats ?? null,
      transMeasured: grade.transition?.measured ?? null,
      transScore: grade.transition?.score ?? null,
      pitch: grade.scores.pitch,
      timing: grade.scores.timing,
      clean: grade.scores.cleanliness,
      overall: grade.scores.overall,
      passed: grade.passed,
    });
    return grade;
  }

  console.log(
    'lesson | label | allowedExtraBeats | writtenGapBeats | transSec | trans | pitch | timing | clean | overall | passed',
  );

  for (const lesson of PROGRESSIVE_CONCEPTS) {
    // Generate a handful of anchor-shift questions for lessons that use it.
    for (let rep = 0; rep < 6; rep++) {
      const rand = makeRandom(999 + lesson.index * 7919 + rep * 131);
      const q = lesson.generate(rep, rand, 0.5, 'normal', rep + 1);
      if (q.exerciseMode !== 'anchor-shift' || !q.anchorShift) continue;
      const plan = planForQuestion(q, BPM);
      const splitIndex = q.anchorShift.splitIndex;
      const secondsPerBeat = plan.secondsPerBeat;
      const allowedExtraSec = q.anchorShift.allowedExtraBeats * secondsPerBeat;
      const writtenGapBeats = plan.expectedNotes[splitIndex].beat -
        plan.expectedNotes[splitIndex - 1].beat;
      const writtenGapSec = writtenGapBeats * secondsPerBeat;

      const sweeps = [
        { label: 'exact-written-gap (idealized)', frac: 0.0 },
        { label: '25% of allowed extra', frac: 0.25 },
        { label: '50% of allowed extra', frac: 0.5 },
        { label: '75% of allowed extra', frac: 0.75 },
        { label: '95% of allowed extra', frac: 0.95 },
        { label: '105% of allowed extra (slightly over)', frac: 1.05 },
        { label: '150% of allowed extra', frac: 1.5 },
        { label: '300% of allowed extra (genuinely late)', frac: 3.0 },
      ];

      for (const sweep of sweeps) {
        const transitionSeconds = writtenGapSec + allowedExtraSec * sweep.frac;
        const grade = runTrial(
          sweep.label, lesson.index, q, q.expectedSequence, plan, splitIndex,
          { transitionSeconds, preJitterMs: 60, postJitterMs: 60 },
        );
        // Track false negatives: realistic-correct play (up to 95% of the
        // allowed window) that fails to score near-full marks.
        if (sweep.frac <= 0.95 && grade.scores.overall < 4.5) {
          failuresAtOrAboveScore4_5 += 1;
          console.log(`  !! FALSE NEGATIVE lesson ${lesson.index} "${sweep.label}": overall=${grade.scores.overall} transition=${JSON.stringify(grade.transition)}`);
        }
      }

      // (c) simulated missed boundary-note detection at the hand landing.
      for (const drop of ['firstTo', 'lastFrom']) {
        const grade = runTrial(
          `dropped boundary note (${drop})`, lesson.index, q, q.expectedSequence, plan, splitIndex,
          { transitionSeconds: writtenGapSec + allowedExtraSec * 0.4, dropBoundaryNote: drop },
        );
        console.log(`  boundary-drop lesson ${lesson.index} (${drop}): overall=${grade.scores.overall} pitch=${grade.scores.pitch} timing=${grade.scores.timing} transition=${JSON.stringify(grade.transition)}`);
      }
    }
  }

  for (const r of rows) {
    console.log(
      `${r.lesson} | ${r.label} | ${r.allowedExtraBeats} | ${r.writtenGapBeats} | ${r.transitionSec} | ${r.transScore} | ${r.pitch} | ${r.timing} | ${r.clean} | ${r.overall} | ${r.passed}`,
    );
  }

  console.log(`\nTotal trials: ${trialsRun}`);
  console.log(`False negatives (realistic-correct <=95% of window, overall<4.5): ${failuresAtOrAboveScore4_5}`);

  assert.equal(
    failuresAtOrAboveScore4_5, 0,
    'Realistic-but-correct anchor-shift performances must not score below 4.5 overall.',
  );

  // Sanity: a genuinely bad transition must still score low.
  const badRows = rows.filter((r) => r.label.includes('300%'));
  for (const r of badRows) {
    assert.ok(r.overall <= 3.5, `A 3x-over-allowance transition must still score low (lesson ${r.lesson} got ${r.overall}).`);
  }

  console.log('\naudit-anchor-shift-realistic: PASS');
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
