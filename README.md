# EarTrain child-clarity and grading-preservation update

Copy each file over the same relative path in the current EarTrain project.

## Production files

- `src/components/ExerciseView.tsx`
- `src/components/exercise.css`
- `src/components/PathwayRouter.tsx`
- `src/components/ExerciseReport.tsx`
- `src/components/exercise-report.css`
- `src/components/StaffCue.tsx`
- `src/components/AnchorShiftCue.tsx`
- `src/audio/useDrillAudio.ts`
- `src/audio/scoreAnalysis.ts`
- `src/audio/timing.ts`
- `src/lib/audio.ts`
- `src/lib/toneAudio.ts`
- `public/audio/score-analyzer-worker.js`

## Regression test

- `scripts/audit-score-analyzer.mjs`

## Verification performed

- `npm run build`
- `npm run audit:score`
- `npm run audit:curriculum`
- `npm run audit:audio`

All four completed successfully. The extracted handoff source did not contain
the ESLint executable, so `npm run lint` could not be executed; TypeScript
compilation is included in the successful production build.
