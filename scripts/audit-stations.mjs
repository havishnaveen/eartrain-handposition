import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const E = await server.ssrLoadModule('/src/stations/engine.ts');
  const { fixedBatch, BATCH_COUNT, BATCH_KINDS } = await server.ssrLoadModule('/src/stations/generator.ts');
  const { STATION_TOPICS, isStationTopic } = await server.ssrLoadModule('/src/stations/types.ts');
  const { StationStore, decodeSnapshot } = await server.ssrLoadModule('/src/stations/store.ts');
  assert.equal(isStationTopic('clef-transposition'), false);
  let examples = 0;
  for (const { id: topic } of STATION_TOPICS) {
    const seen = new Set();
    for (let batch = 1; batch <= BATCH_COUNT; batch++) {
      const triad = fixedBatch(topic, batch);
      assert.deepEqual(triad, fixedBatch(topic, batch));
      assert.equal(triad.length, 3);
      assert.deepEqual(triad.map(q => q.kind), BATCH_KINDS[batch - 1]);
      const firstAudio = triad.find(q => q.kind === 'audio');
      assert.equal(firstAudio.choices[firstAudio.correct], 'Wrong');
      for (const q of triad) {
        assert(!seen.has(q.fingerprint), `Repeated phrase: ${topic} batch ${batch}`);
        seen.add(q.fingerprint);
        assert.equal(new Set(q.choices).size, q.choices.length);
        assert.equal(q.question.positionProof.requireHeld, false);
        const measures = [...q.musicXML.matchAll(/<measure[^>]*>(.*?)<\/measure>/g)];
        assert.equal(measures.length, 2);
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
    if (q.audio) {
      assert.equal(E.transition(s, { type: 'answer', choice: q.correct, responseMs: 10 }), s);
      s = E.transition(s, { type: 'heard', replayCount: 1 });
    }
    if (i === 0) {
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
  await store.dispatch(opened.id, opened.questions[0].id, { type: 'answer', choice: opened.questions[0].correct, responseMs: 100 });
  await store.dispatch(opened.id, opened.questions[0].id, { type: 'record', now });
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
