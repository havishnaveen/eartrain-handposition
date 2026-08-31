import { createServer } from 'vite';

const server = await createServer({
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

try {
  const { PROGRESSIVE_CONCEPTS } = await server.ssrLoadModule(
    '/src/curriculum/progressiveCurriculum.ts',
  );
  const { makeRandom } = await server.ssrLoadModule('/src/curriculum/positions.ts');
  const rows = PROGRESSIVE_CONCEPTS.flatMap((lesson) =>
    Array.from({ length: 4 }, (_, index) => {
      const question = lesson.generate(
        lesson.index * 100 + index,
        makeRandom(20260828 + lesson.index * 31 + index),
        0.5,
        'normal',
        index + 1,
      );
      return {
        lesson: lesson.index,
        drill: index + 1,
        mode: question.exerciseMode,
        handScope: question.handScope,
        difficulty: question.difficulty,
        keySignature: question.cue.keySignature,
        staffCount: question.cue.staves.length,
        pitches: question.expectedSequence,
        durations: question.cue.staves.flatMap((staff) =>
          staff.notes.map((note) => note.duration)),
        chordTones: question.cue.staves.flatMap((staff) =>
          staff.notes.map((note) => note.keys.length)),
        soundedEvents: question.cue.staves.reduce((sum, staff) =>
          sum + staff.notes.filter((note) => !note.duration.endsWith('r')).length, 0),
        chordEvents: question.cue.staves.reduce((sum, staff) =>
          sum + staff.notes.filter((note) =>
            !note.duration.endsWith('r') && note.keys.length > 1).length, 0),
        proofNotes: question.positionProof?.proofNotes.length ?? 0,
        memoryPreviewSeconds: question.blindMemory?.previewSeconds ?? null,
        shiftMoveBeats: question.anchorShift?.timedShift?.waitBeats ?? null,
        spatialRootSupport: question.spatialChord?.rootSupport ?? null,
        spatialQuality: question.spatialChord?.quality ?? null,
        spatialLayers: question.spatialChord?.context.layers ?? null,
        spatialProgressionLength: question.spatialChord?.context.progression.length ?? null,
      };
    }),
  );
  process.stdout.write(JSON.stringify(rows));
} finally {
  await server.close();
}
