import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const E = await server.ssrLoadModule('/src/stations/engine.ts');
  const { fixedBatch, BATCH_COUNT, BATCH_KINDS } = await server.ssrLoadModule('/src/stations/generator.ts');
  const { STATION_TOPICS, isStationTopic } = await server.ssrLoadModule('/src/stations/types.ts');
  const { StationStore, decodeSnapshot } = await server.ssrLoadModule('/src/stations/store.ts');
  const { planForQuestion, gradeSequence, pitchToMidi } = await server.ssrLoadModule('/src/audio/timing.ts');
  const { passesDiagnosticDrill } = await server.ssrLoadModule('/src/diagnostics/AcousticDrill.tsx');
  const { playingFollowUp } = await server.ssrLoadModule('/src/stations/playingFeedback.ts');
  assert.equal(isStationTopic('clef-transposition'), true);
  let examples = 0;
  for (const { id: topic } of STATION_TOPICS) {
    const seen = new Set();
    for (let batch = 1; batch <= BATCH_COUNT; batch++) {
      const triad = fixedBatch(topic, batch);
      assert.deepEqual(triad, fixedBatch(topic, batch));
      assert.equal(triad.length, 3);
      assert.equal(triad.filter(q => q.kind === 'play').length, 1);
      assert.equal(triad[0].kind, 'play');
      assert.deepEqual(triad.map(q => q.kind), BATCH_KINDS[batch - 1]);
      const firstAudio = triad.find(q => q.kind === 'audio');
      assert.equal(firstAudio.choices[firstAudio.correct], 'Wrong');
      for (const q of triad) {
        assert(!seen.has(q.fingerprint), `Repeated phrase: ${topic} batch ${batch}`);
        seen.add(q.fingerprint);
        assert.equal(new Set(q.choices).size, q.choices.length);
        assert.equal(q.question.positionProof.requireHeld, false);
        const measures = [...q.musicXML.matchAll(/<measure[^>]*>(.*?)<\/measure>/g)];
        assert.equal(measures.length, topic === 'mid-line-clef-change' ? 4 : 2);
        for (const measure of measures) assert.equal([...measure[1].matchAll(/<duration>(\d+)<\/duration>/g)].reduce((n, m) => n + Number(m[1]), 0), 16);
        if (q.audio) {
          assert.equal(q.audio.durations.length, q.question.expectedSequence.length);
          const matches = JSON.stringify(q.audio.pitches) === JSON.stringify(q.question.expectedSequence) && q.audio.hesitationBefore === undefined;
          if (q.kind === 'audio') assert.equal(q.choices[q.correct], matches ? 'Right' : 'Wrong');
          else assert.equal(matches, false);
        }
        if (topic === 'key-signature') {
          assert(/[b#]/.test(q.question.expectedSequence[q.targetIndex]));
          assert(!q.musicXML.includes('<accidental>'), 'No redundant local accidentals');
        }
        const plan = planForQuestion(q.question, 75);
        assert.equal(plan.expectedNotes.length, q.question.expectedSequence.length);
        if (topic === 'mid-line-clef-change') {
          assert.equal(q.question.handScope, 'both'); assert.equal(q.question.cue.staves.length, 2);
          assert(q.musicXML.includes('<group-symbol>brace</group-symbol>'));
          for (let n = 0; n < plan.expectedNotes.length; n += 2) {
            assert.equal(plan.expectedNotes[n].beat, plan.expectedNotes[n + 1].beat);
            assert.equal(q.question.expectedSequence[n], q.question.cue.staves[0].notes[n / 2].keys[0].replace('/', '').replace(/^./, c => c.toUpperCase()));
            assert.equal(q.question.expectedSequence[n + 1], q.question.cue.staves[1].notes[n / 2].keys[0].replace('/', '').replace(/^./, c => c.toUpperCase()));
          }
        }
        if (q.kind === 'play') {
          const notes = plan.expectedNotes.map((n, i) => ({ midi: pitchToMidi(n.pitch), time: 10 + n.beat * .8, endTime: 10 + (n.beat + n.beats * .9) * .8, clarity: 1, strength: 1, expectedSlot: i }));
          const report = gradeSequence(q.question.expectedSequence, notes, { plan, playStartTime: 10, exerciseMode: 'standard' });
          assert(passesDiagnosticDrill(report, q.question), `Correct playing should pass: ${topic}/${batch}: ${report.detail}`);
          if (topic === 'mid-line-clef-change') {
            const oneHand = gradeSequence(q.question.expectedSequence, notes.filter((_, i) => i % 2 === 0), { plan, playStartTime: 10, exerciseMode: 'standard' });
            assert(!passesDiagnosticDrill(oneHand, q.question), 'Playing only the upper staff must not pass a two-hand exercise');
          }
          if (topic === 'key-signature') {
            const wrong = notes.map((n, i) => i === 0 ? { ...n, midi: pitchToMidi(q.question.expectedSequence[0].replace(/[#b]/, '')) } : n);
            const failed = gradeSequence(q.question.expectedSequence, wrong, { plan, playStartTime: 10, exerciseMode: 'standard' });
            assert(!passesDiagnosticDrill(failed, q.question));
            const clue = playingFollowUp(q, failed);
            assert(clue.prompt.includes('Note 1')); assert(!clue.prompt.includes('barline'));
            assert(clue.explanation.includes('key signature'));
          }
        }
        examples++;
      }
    }
  }
  assert.throws(() => fixedBatch('key-signature', 7));
  const memory = new Map(), storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const store = new StationStore('student-a', storage, 'UTC');
  const other = new StationStore('student-b', undefined, 'UTC');
  const now = Date.parse('2026-10-13T12:00Z');
  const opened = store.open('key-signature', 'visual', now, 1);
  const same = other.open('key-signature', 'audio', Date.parse('2027-03-01T12:00Z'), 1);
  const content = s => s.questions.map(({ id, ...q }) => q);
  assert.deepEqual(content(opened), content(same), 'Identity, need and date must not change exercises');
  let s = opened;
  for (let i = 0; i < 3; i++) {
    const q = s.questions[i];
    s = E.transition(s, { type: 'start', now });
    if (q.kind === 'play') {
      assert.equal(E.transition(s, { type: 'answer', choice: q.correct, responseMs: 10 }), s);
      s = E.transition(s, { type: 'performance', correct: false, firstAttemptCorrect: false, attempts: 2, guidedCorrect: false, now });
      assert.equal(s.results.length, 1); assert.equal(s.results[0].firstAttemptCorrect, false);
      continue;
    }
    if (q.audio) {
      assert.equal(E.transition(s, { type: 'answer', choice: q.correct, responseMs: 10 }), s);
      s = E.transition(s, { type: 'heard', replayCount: 1 });
    }
    if (i === 1) {
      const wrong = (q.correct + 1) % q.choices.length;
      s = E.transition(s, { type: 'answer', choice: wrong, responseMs: 100 });
      assert.equal(s.run.phase, 'clue'); assert.equal(s.run.finalChoice, wrong);
      s = E.transition(s, { type: 'guided', choice: (q.clue.correct + 1) % q.clue.choices.length });
      s = E.transition(s, { type: 'retry' });
      s = E.transition(s, { type: 'answer', choice: wrong, responseMs: 100 });
      assert.equal(s.run.phase, 'feedback');
      assert.equal(E.transition(s, { type: 'answer', choice: q.correct, responseMs: 100 }), s);
    } else s = E.transition(s, { type: 'answer', choice: q.correct, responseMs: 100 });
    s = E.transition(s, { type: 'record', now });
  }
  assert(s.completedAt); assert.equal(s.results.length, 3);
  assert.equal(E.transition(s, { type: 'record', now }), s);
  await store.dispatch(opened.id, opened.questions[0].id, { type: 'start', now });
  await store.dispatch(opened.id, opened.questions[0].id, { type: 'performance', correct: true, firstAttemptCorrect: true, attempts: 1, guidedCorrect: null, now });
  assert.equal(store.data.sessions[opened.id].results.length, 1);
  const reset = store.open('key-signature', 'adaptive', now, 1);
  assert.equal(reset.results.length, 0); assert.equal(reset.run.phase, 'ready');
  await store.dispatch(opened.id, opened.questions[0].id, { type: 'start', now });
  assert.equal(store.data.sessions[reset.id].run.phase, 'ready', 'Old attempts cannot mutate reset batches');
  assert.deepEqual(content(reset), content(opened));
  assert.equal(decodeSnapshot(memory.get(store.key), 'UTC').sessions[reset.id].results.length, 0);
  const next = store.open('key-signature', 'adaptive', now, 2);
  assert.equal(next.results.length, 0); assert.notDeepEqual(content(next), content(reset));
  assert.throws(() => decodeSnapshot('{broken', 'UTC'));
  console.log(`Station audit passed: ${examples} fixed exercises; shared sequence, unique phrases, answer/audio/notation agreement, retry limits, resets and stale-event protection.`);
} finally { await server.close(); }
