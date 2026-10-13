import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const E = await server.ssrLoadModule('/src/stations/engine.ts');
  const { assembleTriad } = await server.ssrLoadModule('/src/stations/generator.ts');
  const { STATION_TOPICS, isStationTopic } = await server.ssrLoadModule('/src/stations/types.ts');
  const { StationStore, decodeSnapshot } = await server.ssrLoadModule('/src/stations/store.ts');
  assert.equal(isStationTopic('clef-transposition'), false);
  assert.equal(E.calendarDate(Date.parse('2026-10-11T01:00Z'), 'America/Los_Angeles'), '2026-10-10');
  assert.equal(E.addDays('2026-03-08', 1), '2026-03-09');
  const expected = { ear: ['audio', 'audio', 'audio'], visual: ['cause', 'visual', 'visual'], balanced: ['audio', 'rule', 'visual'], classification: ['audio', 'audio', 'cause'] };
  let examples = 0;
  for (const topic of STATION_TOPICS) for (const archetype of Object.keys(expected)) {
    let history = E.emptyData('UTC');
    for (let day = 0; day < 45; day++) {
      const date = E.addDays('2026-09-01', day), recent = E.recentFingerprints(history, date);
      const triad = assembleTriad('audit-student', date, topic.id, archetype, recent);
      assert.deepEqual(triad, assembleTriad('audit-student', date, topic.id, archetype, recent));
      assert.equal(triad.length, 3);
      assert(triad.some(q => q.kind === 'audio' || q.kind === 'cause'));
      assert.deepEqual(triad.map(q => q.kind).sort(), [...expected[archetype]].sort());
      const firstAudio = triad.find(q => q.kind === 'audio');
      if (firstAudio) assert.equal(firstAudio.choices[firstAudio.correct], 'Wrong');
      for (const q of triad) {
        assert(!recent.has(q.fingerprint));
        assert.equal(new Set(q.choices).size, q.choices.length);
        assert.equal(q.question.positionProof.requireHeld, false);
        if (q.topic === 'octave-displacement') assert(['C', 'D', 'E', 'F'].includes(q.question.expectedSequence[q.targetIndex][0]));
        const measures = [...q.musicXML.matchAll(/<measure[^>]*>(.*?)<\/measure>/g)];
        assert.equal(measures.length, 2);
        for (const measure of measures) assert.equal([...measure[1].matchAll(/<duration>(\d+)<\/duration>/g)].reduce((n, m) => n + Number(m[1]), 0), 16);
        if (q.audio) {
          assert.equal(q.audio.durations.length, q.question.expectedSequence.length);
          const matches = JSON.stringify(q.audio.pitches) === JSON.stringify(q.question.expectedSequence) && q.audio.hesitationBefore === undefined;
          if (q.kind === 'audio') assert.equal(q.choices[q.correct], matches ? 'Right' : 'Wrong');
        }
        examples++;
      }
      history.sessions[`${date}/${topic.id}`] = E.createSession(date, topic.id, 'adaptive', archetype, 'test', triad);
    }
  }
  const topic = 'key-signature';
  const adaptive = E.emptyData('UTC');
  const prior = E.createSession('2026-10-01', topic, 'adaptive', 'balanced', 'test', assembleTriad('s', '2026-10-01', topic, 'balanced', new Set()));
  prior.completedAt = Date.parse('2026-10-01T12:00Z');
  prior.results = prior.questions.map(q => ({ kind: q.kind, firstAttemptCorrect: q.kind !== 'audio', responseMs: 4000 }));
  adaptive.sessions[prior.id] = prior;
  assert.equal(E.chooseArchetype(adaptive, topic, 'adaptive', '2026-10-02'), 'ear');
  prior.results.forEach(r => { r.firstAttemptCorrect = r.kind !== 'rule'; });
  assert.equal(E.chooseArchetype(adaptive, topic, 'adaptive', '2026-10-02'), 'classification');
  prior.results.forEach(r => { r.firstAttemptCorrect = r.kind !== 'visual'; });
  assert.equal(E.chooseArchetype(adaptive, topic, 'adaptive', '2026-10-02'), 'visual');
  assert.equal(E.chooseArchetype(adaptive, topic, 'audio', '2026-10-02'), 'ear');
  assert.equal(E.chooseArchetype(adaptive, topic, 'visual', '2026-10-02'), 'visual');
  const session = date => E.createSession(date, topic, 'visual', 'visual', 'seed', assembleTriad('s', date, topic, 'visual', new Set()));
  const complete = (date, mistake = false, hint = false) => {
    let s = session(date);
    for (let i = 0; i < 3; i++) {
      const q = s.questions[i], now = Date.parse(`${date}T12:00:00Z`);
      assert.equal(E.transition(s, { type: 'answer', choice: q.correct, responseMs: 1 }), s);
      s = E.transition(s, { type: 'start', now });
      if (q.audio) s = E.transition(s, { type: 'heard', replayCount: 1 });
      if (i === 0 && (mistake || hint)) {
        s = E.transition(s, hint ? { type: 'hint', responseMs: 3000 } : { type: 'answer', choice: (q.correct + 1) % q.choices.length, responseMs: 3000 });
        s = E.transition(s, { type: 'guided', choice: q.clue.correct });
        s = E.transition(s, { type: 'retry' });
        if (q.audio) s = E.transition(s, { type: 'heard', replayCount: 2 });
      }
      s = E.transition(s, { type: 'answer', choice: q.correct, responseMs: 4000 });
      s = E.transition(s, { type: 'record', now });
    }
    assert.equal(E.transition(s, { type: 'record', now: Date.now() }), s);
    return s;
  };
  let data = E.emptyData('UTC'); data.assignments = [topic];
  data = E.applyProgress(data, complete('2026-10-01'), 's');
  assert.equal(data.progress[topic].streak, 1);
  data = E.applyProgress(data, complete('2026-10-03'), 's');
  assert.equal(data.progress[topic].status, 'active'); // calendar gap
  data = E.applyProgress(data, complete('2026-10-04'), 's');
  assert.equal(data.progress[topic].status, 'maintenance');
  const due = data.progress[topic].nextDue;
  assert(due >= '2026-10-11' && due <= '2026-10-18');
  assert.deepEqual(E.dailyQueue(data, '2026-10-05', 's'), []);
  assert.deepEqual(E.dailyQueue(data, due, 's'), [topic]);
  assert.deepEqual(E.applyProgress(data, complete('2026-10-04'), 's').progress, data.progress);
  data = E.applyProgress(data, complete(due, true), 's');
  assert.equal(data.progress[topic].status, 'active');
  data = E.applyProgress(data, complete(E.addDays(due, 1), false, true), 's');
  assert.equal(data.progress[topic].streak, 0);
  const late = complete('2026-10-20'); late.completedAt = Date.parse('2026-10-21T00:01Z');
  assert.equal(E.applyProgress(data, late, 's').progress[topic].streak, 0);
  const memory = new Map(), storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const store = new StationStore('persistence', storage, 'UTC');
  const opened = store.open(topic, 'visual');
  await store.dispatch(opened.id, opened.questions[0].id, { type: 'start', now: Date.now() });
  const reload = new StationStore('persistence', storage, 'UTC');
  assert.equal(reload.open(topic, 'audio').need, 'visual');
  await reload.dispatch(opened.id, opened.questions[0].id, { type: 'answer', choice: opened.questions[0].correct, responseMs: 4000 });
  await reload.dispatch(opened.id, opened.questions[0].id, { type: 'record', now: Date.now() });
  await reload.dispatch(opened.id, opened.questions[0].id, { type: 'start', now: Date.now() });
  assert.equal(reload.data.sessions[opened.id].run.phase, 'ready'); // stale ID cannot advance next question
  const audioSession = E.createSession('2026-10-10', topic, 'audio', 'ear', 'test', assembleTriad('s', '2026-10-10', topic, 'ear', new Set()));
  const startedAudio = E.transition(audioSession, { type: 'start', now: Date.now() });
  assert.equal(E.transition(startedAudio, { type: 'answer', choice: audioSession.questions[0].correct, responseMs: 1000 }), startedAudio);
  assert.equal(E.transition(startedAudio, { type: 'hint', responseMs: 1000 }), startedAudio);
  assert.equal(E.transition(startedAudio, { type: 'heard', replayCount: 1 }).run.heard, true);
  assert.equal(decodeSnapshot(memory.get(store.key), 'UTC').sessions[opened.id].results.length, 1);
  assert.throws(() => decodeSnapshot('{broken', 'UTC'));
  const broken = new StationStore('broken', { getItem: () => '{bad', setItem: () => { throw new Error('should never overwrite'); } }, 'UTC');
  assert(broken.warning); broken.open(topic, 'visual');
  const blocked = new StationStore('blocked', { getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'UTC');
  blocked.open(topic, 'visual'); assert(blocked.warning);
  console.log(`Station audit passed: ${examples} generated examples; freshness, answer keys, exact triads, persistence, guarded flow, graduation and retention.`);
} finally { await server.close(); }
