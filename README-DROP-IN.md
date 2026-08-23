# EarTrain core recognition + piano-only v12

Copy this folder over the project root while preserving paths.

Runtime changes:

- `public/audio/pitch-processor.js`: responsive live detection plus lossless PCM capture.
- `public/audio/score-analyzer-worker.js`: whole-take, score-aware final reconciliation.
- `src/audio/scoreAnalysis.ts`: browser worker bridge.
- `src/audio/useDrillAudio.ts`: captures each completed take, waits for the final analyzer, and uses sampled piano for chord cues/success feedback.
- `src/audio/timing.ts`: exact 5.0 treatment for complete, musically clean takes and hardware-latency normalization.
- `src/components/PathwayRouter.tsx`: self-dismissing orientation notice.
- `src/components/ExerciseView.tsx` and `src/components/exercise.css`: one-step-at-a-time chord building UI.
- `src/lib/audio.ts`: removes the pitched synth fallback; failed samples stay silent instead of changing instrument.
- `src/curriculum/types.ts`: documents the piano-only playback contract.

Regression files:

- `scripts/audit-pitch-processor.mjs`
- `scripts/audit-score-analyzer.mjs`
- `scripts/audit-pcm-capture.mjs`
- `scripts/audit-curriculum.mjs`
- `package.json`

Verified commands:

```sh
npm run build
npm run audit:audio
npm run audit:score
npm run audit:curriculum
```
