import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const { DIAGNOSTIC_KEYS, DIAGNOSTIC_REGISTRY, fiveFingerPattern, resolveDiagnosticKey } = await server.ssrLoadModule('/src/diagnostics/registry.ts');
  const { diagnosticReferral } = await server.ssrLoadModule('/src/diagnostics/routing.ts');
  const { diagnosticMusicXML } = await server.ssrLoadModule('/src/diagnostics/notation.ts');
  const { parseLaunch } = await server.ssrLoadModule('/src/integration/oclefBridge.ts');
  const { gradeSequence, pitchToMidi, planForQuestion } = await server.ssrLoadModule('/src/audio/timing.ts');
  const { passesDiagnosticDrill, isClefTranspositionMistake } = await server.ssrLoadModule('/src/diagnostics/AcousticDrill.tsx');
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
  const { diagnosticPlaybackTiming } = await server.ssrLoadModule('/src/diagnostics/playback.ts');
  const originalRandom = Math.random;
  try {
    for (let pattern = 0; pattern < 6; pattern++) {
      Math.random = () => (pattern + .5) / 6;
      const lesson = DIAGNOSTIC_REGISTRY.find(d => d.id === 'octave-displacement').create(DIAGNOSTIC_KEYS[0]);
      assert.equal(lesson.listenRounds.length, 5);
      const answers = lesson.listenRounds.map(round => round.isMatch);
      assert.ok(answers.includes(true) && answers.includes(false));
      assert.ok(answers.some((answer, i) => i > 0 && answer === answers[i - 1]), 'Do not alternate every answer');
      assert.equal(lesson.listenRounds[0].featureCheck.explanation, 'Note 1 is C5, in the 5th octave.');
      for (const [i, round] of lesson.listenRounds.entries()) {
        assert.deepEqual(round.wrongClefPitches.map(pitchToMidi), round.question.expectedSequence.map(p => pitchToMidi(p) - (round.isMatch ? 0 : 12)));
        const durations = round.question.cue.staves[0].notes.map(note => note.duration);
        if (i < 3) assert.ok(durations.every(duration => duration === 'q'));
        else {
          assert.ok(durations.includes(i === 3 ? '8' : '16'));
          const plan = planForQuestion(round.question);
          const timing = diagnosticPlaybackTiming(durations.length, durations);
          assert.equal(plan.totalBeats, 4);
          assert.equal(timing.seconds, 3.2);
          assert.deepEqual(timing.notes.map(note => note.start), plan.expectedNotes.map(note => note.beat * plan.secondsPerBeat));
          const xml = diagnosticMusicXML(round.question, round.notation);
          assert.match(xml, i === 3 ? /<type>eighth<\/type>/ : /<type>16th<\/type>/);
          assert.match(xml, /<beam/);
          assert.equal((xml.match(/<measure number=/g) ?? []).length, 1);
        }
      }
      for (const q of [lesson.question, lesson.transfer]) assert.ok(q.cue.staves[0].notes.every(note => note.duration === 'q'), 'Acoustic passages retain their rhythms');
    }
  } finally { Math.random = originalRandom; }
  assert.match(diagnosticMusicXML(octave.question, octave.notation), /<octave>5<\/octave>/);
  const clef = DIAGNOSTIC_REGISTRY.find(d => d.id === 'mid-line-clef-change').create(DIAGNOSTIC_KEYS[0]);
  assert.match(diagnosticMusicXML(clef.question, clef.notation), /<\/note><attributes><clef><sign>G/);

  // Clef transposition 40%+ threshold verification:
  const bassSeq = ['C3', 'E3', 'G3', 'A3'];
  const fullWrongClef = ['A4', 'C5', 'E5', 'F5'].map(p => ({ midi: pitchToMidi(p) }));
  const halfWrongClef = ['A4', 'C5', 'D2', 'F2'].map(p => ({ midi: pitchToMidi(p) }));
  const quarterWrongClef = ['A4', 'D2', 'F2', 'B2'].map(p => ({ midi: pitchToMidi(p) }));
  const botchedNotes = ['D2', 'F#2', 'G#2', 'B2'].map(p => ({ midi: pitchToMidi(p) }));
  const correctNotes = ['C3', 'E3', 'G3', 'A3'].map(p => ({ midi: pitchToMidi(p) }));

  assert.equal(isClefTranspositionMistake(bassSeq, fullWrongClef, 'bass'), true, '100% wrong clef notes must trigger clef error');
  assert.equal(isClefTranspositionMistake(bassSeq, halfWrongClef, 'bass'), true, '50% (>= 40%) wrong clef notes must trigger clef error');
  assert.equal(isClefTranspositionMistake(bassSeq, quarterWrongClef, 'bass'), false, '25% (< 40%) wrong clef notes must NOT trigger clef error');
  assert.equal(isClefTranspositionMistake(bassSeq, botchedNotes, 'bass'), false, 'Botched notes must NOT trigger clef error');
  assert.equal(isClefTranspositionMistake(bassSeq, correctNotes, 'bass'), false, 'Correct bass notes must NOT trigger clef error');

  // Continuity grading criteria verification:
  const sampleQuestion = DIAGNOSTIC_REGISTRY[0].create(DIAGNOSTIC_KEYS[0]).question;
  const basePlan = planForQuestion(sampleQuestion);
  const seq5 = sampleQuestion.expectedSequence;
  const opt = { plan: basePlan, playStartTime: 10 };

  // 1. Smooth take -> 5.0
  const smoothNotes = seq5.map((p, i) => ({
    midi: pitchToMidi(p),
    time: 10 + i * basePlan.secondsPerBeat,
    clarity: 0.99,
    strength: 2,
  }));
  const smoothGrade = gradeSequence(seq5, smoothNotes, opt);
  assert.equal(smoothGrade.scores.continuity, 5.0, 'Smooth uninterrupted take must receive 5.0 continuity');
  assert.equal(smoothGrade.scores.rhythm, 5.0, 'On-beat take must receive 5.0 rhythm');

  // 2. 1-beat pause -> 4.5 - 4.8
  const pauseNotes = seq5.map((p, i) => ({
    midi: pitchToMidi(p),
    time: 10 + (i >= 2 ? i + 1.0 : i) * basePlan.secondsPerBeat,
    clarity: 0.99,
    strength: 2,
  }));
  const pauseGrade = gradeSequence(seq5, pauseNotes, opt);
  assert.ok(pauseGrade.scores.continuity >= 4.4 && pauseGrade.scores.continuity <= 4.8,
    `1-beat pause should slightly reduce continuity: ${pauseGrade.scores.continuity}`);

  // 3. Stop and hesitation -> 3.0 - 4.3
  const stumbleNotes = [
    { midi: pitchToMidi(seq5[0]), time: 10, clarity: 0.99, strength: 2 },
    { midi: pitchToMidi(seq5[1]), time: 10 + basePlan.secondsPerBeat, clarity: 0.99, strength: 2 },
    { midi: pitchToMidi(seq5[1]) + 1, time: 10 + 1.7 * basePlan.secondsPerBeat, clarity: 0.99, strength: 2 },
    { midi: pitchToMidi(seq5[2]), time: 10 + 2.8 * basePlan.secondsPerBeat, clarity: 0.99, strength: 2 },
    { midi: pitchToMidi(seq5[3]), time: 10 + 3.8 * basePlan.secondsPerBeat, clarity: 0.99, strength: 2 },
  ];
  if (seq5.length > 4) {
    stumbleNotes.push({ midi: pitchToMidi(seq5[4]), time: 10 + 4.8 * basePlan.secondsPerBeat, clarity: 0.99, strength: 2 });
  }
  const stumbleGrade = gradeSequence(seq5, stumbleNotes, opt);
  assert.ok(stumbleGrade.scores.continuity >= 3.0 && stumbleGrade.scores.continuity <= 4.3,
    `Hesitation/stumble should reduce continuity: ${stumbleGrade.scores.continuity}`);

  // 4. Long freeze (>4 beats) -> < 3.0
  const freezeNotes = seq5.map((p, i) => ({
    midi: pitchToMidi(p),
    time: 10 + (i >= 2 ? i + 4.5 : i) * basePlan.secondsPerBeat,
    clarity: 0.99,
    strength: 2,
  }));
  const freezeGrade = gradeSequence(seq5, freezeNotes, opt);
  assert.ok(freezeGrade.scores.continuity < 3.0,
    `Long freeze (>4 beats) must fail continuity (<3.0): ${freezeGrade.scores.continuity}`);

  console.log('Diagnostic audit passed: six problems, 24 keys, continuity grading (smooth, pauses, stumbles, freeze), 40%+ clef threshold and transfer gates.');
} finally { await server.close(); }
