// Derives the EXACT Question/DrillPlan content the live app will show for
// each test run, by driving the app's own exported pathwayReducer with the
// same action sequence the real UI dispatches (PROOF_SUCCESS/PROOF_UNLOCK,
// START/PLAY_START/ANALYSIS_START/RESOLVE, CHORD_START/CHORD_LISTEN/
// CHORD_DISCOVERED, CONTINUE). This is NOT a re-implementation of the
// content-generation logic -- it calls the project's real, unmodified
// createInitialPathwayState / pathwayReducer / generateFor functions via
// Vite SSR, so whatever a live browser session would generate (given the
// same fixed seed=20260802 default and a clean/no-telemetry adaptive
// profile) is exactly what this script reproduces. No app source is edited.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({
  configFile: new URL('../vite.config.ts', import.meta.url).pathname,
  server: { middlewareMode: true },
  logLevel: 'silent',
});

const PathwayRouterMod = await server.ssrLoadModule('/src/components/PathwayRouter.tsx');
const TimingMod = await server.ssrLoadModule('/src/audio/timing.ts');
const {
  createInitialPathwayState,
  pathwayReducer,
  DEFAULT_SESSION_QUESTION_CAP,
  positionProofsForQuestion,
} = PathwayRouterMod;
const { planForQuestion, pitchToMidi } = TimingMod;

const SEED = 20260802;

function passingResultFor(question) {
  const expectedCount = question.expectedSequence.length;
  return {
    scores: { pitch: 5, timing: 5, cleanliness: 5, overall: 5 },
    passed: true,
    matched: expectedCount,
    expectedCount,
    missed: 0,
    benignExtras: 0,
    echoExtras: 0,
    pedalled: false,
    hesitations: 0,
    hardExtras: 0,
    extras: [],
    firstMissIndex: -1,
    playedNames: question.expectedSequence.slice(),
    rhythm: null,
    transition: null,
    spatialChord: null,
    detail: 'synthetic-fixture-derivation',
  };
}

function advancePastSlot(state, now) {
  const questionId = state.current.id;
  const mode = state.current.exerciseMode;
  if (mode === 'spatial-chord') {
    state = pathwayReducer(state, { type: 'CHORD_START', questionId, now });
    state = pathwayReducer(state, { type: 'CHORD_LISTEN', questionId, now });
    state = pathwayReducer(state, { type: 'CHORD_DISCOVERED', questionId, now });
  } else {
    // A question can carry MORE THAN ONE position proof (e.g. a two-hand
    // "both" position proves the right hand, then the left) -- PROOF_UNLOCK
    // loops back to 'position-prompt' for each one in turn instead of going
    // straight to 'prompt'. Cycle through every proof the real app would.
    const proofCount = positionProofsForQuestion(state.current).length;
    for (let p = 0; p < proofCount && state.status === 'position-prompt'; p++) {
      state = pathwayReducer(state, { type: 'PROOF_START', questionId, now });
      state = pathwayReducer(state, { type: 'PROOF_SUCCESS', questionId, now });
      state = pathwayReducer(state, { type: 'PROOF_UNLOCK', questionId, now });
    }
    state = pathwayReducer(state, { type: 'START', questionId, now });
    state = pathwayReducer(state, { type: 'PLAY_START', questionId, now });
    state = pathwayReducer(state, { type: 'ANALYSIS_START', questionId, now });
    state = pathwayReducer(state, {
      type: 'RESOLVE',
      questionId,
      now,
      result: passingResultFor(state.current),
      detected: [],
      recognition: {},
    });
  }
  state = pathwayReducer(state, { type: 'CONTINUE', difficultyNudge: 0 });
  return state;
}

function describeQuestion(question) {
  const proofs = positionProofsForQuestion(question);
  const base = {
    id: question.id,
    exerciseMode: question.exerciseMode,
    positionLabel: question.positionLabel,
    expectedSequence: question.expectedSequence,
    hasPositionProof: proofs.length > 0,
  };
  if (proofs.length > 0) {
    // A "both hands" position can carry MORE THAN ONE proof (right hand,
    // then left) -- PROOF_UNLOCK cycles back to 'position-prompt' once per
    // proof. Emit the whole ordered list so the harness can inject the
    // correct hand's notes at each cycle instead of only the first.
    base.positionProofs = proofs.map((proof) => ({
      proofNotes: proof.proofNotes,
      proofMidi: proof.proofNotes.map((n) => pitchToMidi(n.pitch)),
      requireHeld: proof.requireHeld,
      acceptWindowMs: proof.acceptWindowMs,
    }));
  }
  if (question.exerciseMode === 'spatial-chord' && question.spatialChord) {
    const sc = question.spatialChord;
    base.spatialChord = {
      chordPitches: sc.chordPitches,
      chordMidi: sc.chordPitches.map((p) => pitchToMidi(p)),
      rootSearchSeconds: sc.rootSearchSeconds,
      shapeSearchSeconds: sc.shapeSearchSeconds,
    };
  } else {
    const plan = planForQuestion(question);
    base.plan = {
      bpm: plan.bpm,
      secondsPerBeat: plan.secondsPerBeat,
      recordSeconds: plan.recordSeconds,
      countInSeconds: plan.countInSeconds,
      guideNote: plan.guideNote,
      expectedNotes: plan.expectedNotes.map((n) => ({ ...n, midi: pitchToMidi(n.pitch) })),
    };
  }
  return base;
}

const RUNS = [
  { lesson: 1, freshLoad: true, slots: 4 },
  { lesson: 13, freshLoad: false, slots: 4 },
  { lesson: 19, freshLoad: false, slots: 4 },
  { lesson: 23, freshLoad: false, slots: 4 },
];

const manifest = { seed: SEED, runs: [] };

for (const run of RUNS) {
  let state = createInitialPathwayState({
    seed: SEED,
    cap: DEFAULT_SESSION_QUESTION_CAP,
    initialLesson: run.lesson,
    initialProofCompleted: !run.freshLoad,
  });
  const slots = [];
  let now = 1000;
  for (let i = 0; i < run.slots; i++) {
    const q = state.current;
    slots.push({
      slot: i + 1,
      statusOnEntry: state.status,
      question: describeQuestion(q),
    });
    now += 20000;
    state = advancePastSlot(state, now);
    // If the pathway/lesson ended early (shouldn't for these 4-slot loops,
    // but guard anyway), stop.
    if (state.finished) break;
  }
  manifest.runs.push({
    lesson: run.lesson,
    freshLoad: run.freshLoad,
    slots,
  });
}

writeFileSync(
  new URL('./fixtures-manifest.json', import.meta.url),
  JSON.stringify(manifest, null, 2),
);
console.log('Wrote fixtures-manifest.json');
for (const run of manifest.runs) {
  console.log(`\nLesson ${run.lesson} (freshLoad=${run.freshLoad}):`);
  for (const s of run.slots) {
    console.log(
      `  slot ${s.slot}: entry=${s.statusOnEntry} mode=${s.question.exerciseMode} expected=${JSON.stringify(s.question.expectedSequence)}`,
    );
  }
}

await server.close();
