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
    })),
  ].sort((a, b) => a.time - b.time);
  const grade = gradeSequence(expected, flooded, { exerciseMode: 'blind-memory' });
  assert.equal(grade.passed, false, 'Dozens of duplicate detections must force a retry.');
  assert.ok(grade.scores.overall <= 3, 'A detector flood must never receive 5/5.');
  assert.match(grade.detail, /repeated or unexpected detections/i,
    'The retry must identify a detection problem rather than blame the student.');

  console.log('Live regression audit passed: melody/chord isolation and duplicate-flood grading.');
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
