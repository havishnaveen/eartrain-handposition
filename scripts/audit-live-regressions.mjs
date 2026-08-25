import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(join(tmpdir(), 'eartrain-live-audit-'));
const server = await createServer({
  cacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { gradeSequence } = await server.ssrLoadModule('/src/audio/timing.ts');
  const { polyphonicTargetsForPlan } = await server.ssrLoadModule(
    '/src/audio/useDrillAudio.ts',
  );

  const sequentialPlan = {
    expectedNotes: [
      { pitch: 'C4', beat: 0, beats: 1 },
      { pitch: 'E4', beat: 1, beats: 1 },
      { pitch: 'G4', beat: 2, beats: 1 },
    ],
  };
  assert.deepEqual(polyphonicTargetsForPlan(sequentialPlan), [],
    'A melody must never arm the polyphonic chord detector.');
  assert.deepEqual(polyphonicTargetsForPlan({
    expectedNotes: sequentialPlan.expectedNotes.map((slot) => ({ ...slot, beat: 0 })),
  }), [60, 64, 67], 'A genuine simultaneous chord must retain polyphonic support.');

  const expected = ['C4', 'D4', 'E4', 'F4'];
  const perfect = [60, 62, 64, 65].map((midi, index) => ({
    midi,
    time: 10 + index * 0.5,
    clarity: 0.92,
    strength: 2,
  }));
  const flooded = [
    ...perfect,
    ...Array.from({ length: 24 }, (_, index) => ({
      ...perfect[0],
      time: perfect[0].time + 0.08 * (index + 1),
      detectorLane: 'strict',
      pianoAttackConfidence: 0.82,
      frameAttackRatio: 1.31,
      novelty: 0.68,
    })),
  ].sort((a, b) => a.time - b.time);
  const grade = gradeSequence(expected, flooded, { exerciseMode: 'blind-memory' });
  assert.equal(grade.passed, false, 'Dozens of played extra notes must force a retry.');
  assert.ok(grade.scores.pitch < 2, 'Extra notes must reduce pitch precision, not only cleanliness.');
  assert.equal(grade.scores.cleanliness, 0, 'Dozens of played extras must be completely unclean.');
  assert.ok(grade.scores.overall < 2, 'A performance full of extra notes must score as incorrect.');
  assert.match(grade.detail, /too many extra notes/i,
    'The retry must explain that the played pattern contained too many notes.');

  const acousticEchoes = [
    ...perfect,
    ...Array.from({ length: 18 }, (_, index) => ({
      ...perfect[0],
      time: perfect[0].time + 0.08 * (index + 1),
      clarity: 0.44,
      strength: 0.48,
      analysisSource: 'offline-recovered',
    })),
  ].sort((a, b) => a.time - b.time);
  const echoGrade = gradeSequence(expected, acousticEchoes);
  assert.equal(echoGrade.scores.pitch, 5,
    'Weak acoustic repeats must not lower pitch precision as played errors.');

  const oneMissMemory = gradeSequence(expected, perfect.slice(0, -1), {
    exerciseMode: 'blind-memory',
  });
  assert.equal(oneMissMemory.passed, true,
    'One omitted memory note should still demonstrate pattern recognition.');
  assert.ok(oneMissMemory.scores.overall < 5 && oneMissMemory.scores.overall >= 4.5,
    'A recognized-but-incomplete memory pattern must pass without receiving 5.0.');

  const oneMissStandard = gradeSequence(expected, perfect.slice(0, -1));
  assert.ok(oneMissStandard.scores.overall >= 4 && oneMissStandard.scores.overall < 5,
    'One missed note in an otherwise clean four-note take should score near 4, never 3 or 5.');

  const pcmRecovered = perfect.map((note, index) => index === 2
    ? {
        ...note,
        analysisSource: 'offline-recovered',
        analysisConfidence: 0.85,
      }
    : note);
  const recoveredGrade = gradeSequence(expected, pcmRecovered);
  assert.ok(recoveredGrade.scores.overall >= 4.5 && recoveredGrade.scores.overall < 5,
    'A strongly PCM-supported soft note should retain high credit without manufacturing 5.0.');

  console.log('Live regression audit passed: detector isolation, honest misses, PCM recovery, and played-extra grading.');
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
