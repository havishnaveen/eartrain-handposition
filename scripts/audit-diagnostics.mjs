import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const { DIAGNOSTIC_KEYS, DIAGNOSTIC_REGISTRY, fiveFingerPattern, resolveDiagnosticKey } = await server.ssrLoadModule('/src/diagnostics/registry.ts');
  const { diagnosticReferral } = await server.ssrLoadModule('/src/diagnostics/routing.ts');
  const { diagnosticMusicXML } = await server.ssrLoadModule('/src/diagnostics/notation.ts');
  const { parseLaunch } = await server.ssrLoadModule('/src/integration/oclefBridge.ts');
  const { gradeSequence, pitchToMidi, planForQuestion } = await server.ssrLoadModule('/src/audio/timing.ts');
  const { passesDiagnosticDrill } = await server.ssrLoadModule('/src/diagnostics/AcousticDrill.tsx');
  assert.equal(DIAGNOSTIC_REGISTRY.length, 6);
  assert.equal(DIAGNOSTIC_KEYS.length, 24);
  assert.equal(new Set(DIAGNOSTIC_KEYS.map(k => k.id)).size, 24);
  for (const key of DIAGNOSTIC_KEYS) {
    assert.equal(resolveDiagnosticKey(key.name).id, key.id);
    assert.equal(resolveDiagnosticKey(key.id).id, key.id);
    const notes = fiveFingerPattern(key).map(pitchToMidi);
    assert.deepEqual(notes.map(n => n - notes[0]), key.minor ? [0, 2, 3, 5, 7] : [0, 2, 4, 5, 7], key.name);
  }
  assert.deepEqual(fiveFingerPattern(resolveDiagnosticKey('D# minor')), ['D#4', 'E#4', 'F#4', 'G#4', 'A#4']);
  assert.deepEqual(fiveFingerPattern(resolveDiagnosticKey('Bb minor')), ['Bb4', 'C5', 'Db5', 'Eb5', 'F5']);
  assert.equal(resolveDiagnosticKey('B major').id, 'b-major');
  assert.equal(diagnosticReferral(null, ''), null);
  assert.equal(diagnosticReferral(null, '?diagnosis=unknown'), null);
  assert.equal(diagnosticReferral(null, '?key=Db%20major').key.name, 'Db major');
  assert.equal(diagnosticReferral(null, '?diagnosis=hand-position&key=unknown').invalidKey, 'unknown');
  assert.equal(diagnosticReferral(null, '?diagnosis=hand-position&key=F%23%20minor').key.name, 'F# minor');
  const identity = { launchId: 'launch-1', studentId: 's', instructorId: 'i', displayName: 'Student', provider: 'reading.oclef.com', externalSubject: 'subject' };
  for (const definition of DIAGNOSTIC_REGISTRY) {
    for (const field of ['diagnosticReason', 'diagnosticCode']) {
      const launch = parseLaunch({ ...identity, [field]: definition.id, key: 'Bb minor' });
      assert.equal(diagnosticReferral(launch, '').definition.id, definition.id);
      assert.equal(launch.key, 'Bb minor');
    }
    const launch = parseLaunch({ ...identity, assignment: { id: 'a', problem: definition.id, key: 'F# minor' } });
    assert.equal(launch.assignment.problem, definition.id);
    assert.equal(diagnosticReferral(launch, '').definition.id, definition.id);
    assert.equal(diagnosticReferral(launch, '').key.name, 'F# minor');
    for (const key of definition.usesKey ? DIAGNOSTIC_KEYS : [DIAGNOSTIC_KEYS[0]]) {
      const lesson = definition.create(key);
      assert.notDeepEqual(lesson.question.expectedSequence, lesson.transfer.expectedSequence);
      assert.ok(lesson.mcq.correct >= 0 && lesson.mcq.correct < lesson.mcq.choices.length);
      assert.ok(lesson.hesitationBefore !== undefined || lesson.mistakePitches.some((p, i) => pitchToMidi(p) !== pitchToMidi(lesson.question.expectedSequence[i])));
      for (const question of [lesson.question, lesson.transfer]) {
        assert.equal(question.positionProof.requireHeld, false);
        assert.equal(question.positionProof.proofNotes.length, 3);
        const plan = planForQuestion(question);
        assert.equal(plan.expectedNotes.length, question.expectedSequence.length);
        const notes = plan.expectedNotes.map(slot => ({ midi: pitchToMidi(slot.pitch), time: 10 + slot.beat * plan.secondsPerBeat, clarity: .99, strength: 2 }));
        const options = { plan, playStartTime: 10, exerciseMode: question.exerciseMode, anchorShift: question.anchorShift };
        const good = gradeSequence(question.expectedSequence, notes, options);
        assert.ok(passesDiagnosticDrill(good, question), `${question.id}: clean take should pass ${JSON.stringify(good.scores)}`);
        assert.equal(passesDiagnosticDrill(gradeSequence(question.expectedSequence, [], options), question), false);
        const octaveWrong = notes.map(note => ({ ...note, midi: note.midi - 12 }));
        assert.equal(passesDiagnosticDrill(gradeSequence(question.expectedSequence, octaveWrong, options), question), false);
        if (question === lesson.question) {
          const demonstratedMistake = notes.map((note, i) => ({ ...note,
            midi: pitchToMidi(lesson.mistakePitches[i]),
            time: note.time + (lesson.hesitationBefore !== undefined && i >= lesson.hesitationBefore ? 2 : 0),
          }));
          assert.equal(passesDiagnosticDrill(gradeSequence(question.expectedSequence, demonstratedMistake, options), question), false, `${question.id}: the demonstrated trap must fail the acoustic gate`);
        }
        if (question.anchorShift) {
          const frozen = notes.map((note, i) => ({ ...note, time: note.time + (i >= question.anchorShift.splitIndex ? 2 : 0) }));
          const result = gradeSequence(question.expectedSequence, frozen, options);
          assert.equal(result.scores.pitch, 5, 'A delayed transition must preserve pitch credit');
          assert.equal(passesDiagnosticDrill(result, question), false, 'A two-second stumble must not complete the movement lesson');
        }
      }
    }
  }
  const accidental = DIAGNOSTIC_REGISTRY.find(d => d.id === 'accidental-carryover').create(DIAGNOSTIC_KEYS[0]);
  const score = diagnosticMusicXML(accidental.question, accidental.notation);
  assert.equal((score.match(/<accidental>sharp<\/accidental>/g) ?? []).length, 1, 'Do not reprint the carry-over sharp');
  assert.equal((score.match(/<alter>1<\/alter>/g) ?? []).length, 2, 'Both first-measure Cs sound sharp');
  const octave = DIAGNOSTIC_REGISTRY.find(d => d.id === 'octave-displacement').create(DIAGNOSTIC_KEYS[0]);
  assert.match(diagnosticMusicXML(octave.question, octave.notation), /octave-shift type="down"/);
  const clef = DIAGNOSTIC_REGISTRY.find(d => d.id === 'mid-line-clef-change').create(DIAGNOSTIC_KEYS[0]);
  assert.match(diagnosticMusicXML(clef.question, clef.notation), /<\/note><attributes><clef><sign>G/);
  console.log('Diagnostic audit passed: six problems, 24 keys, handoff parsing, routing, notation, correct/incorrect takes and transfer gates.');
} finally { await server.close(); }
