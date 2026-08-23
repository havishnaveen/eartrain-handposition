# EarTrain score-aware audio overhaul

Replace the files in this bundle at their matching project paths. The two new
runtime files are required:

- `public/audio/score-analyzer-worker.js`
- `src/audio/scoreAnalysis.ts`

The detector now has two complementary stages:

1. `pitch-processor.js` performs low-latency interaction, harmonic sustain
   tracking, metronome rejection, and lossless PCM capture.
2. `score-analyzer-worker.js` reanalyzes that PCM away from the audio/UI
   threads. Expected pitches receive time-local recovery; unexpected pitches
   require independent YIN and strict open-world confirmation.

`useDrillAudio.ts` automatically falls back to the real-time result if lossless
capture or the worker is unavailable. Offline outcomes are added to recognition
diagnostics as `offlineRecovered`, `offlineRejected`,
`offlineExpectedAccepted`, and `offlineAnalysisReason`.

Run verification with:

```sh
npm run build
npm run audit:curriculum
node scripts/audit-pitch-processor.mjs
node scripts/audit-score-analyzer.mjs
```

The audit fixtures are regression tests, not a substitute for labeled real-piano
recordings. Production calibration should measure recall and false positives by
microphone/device class while preserving the conservative unexpected-note gate.
