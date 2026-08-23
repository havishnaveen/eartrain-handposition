# EarTrain spatial-chord curriculum bundle

Copy the included `src/` directory over the project's `src/` directory,
preserving the folder structure, then run `npm run build`.

Included replacements:

- `src/curriculum/types.ts`
- `src/curriculum/curriculum.ts`
- `src/curriculum/progressiveCurriculum.ts`
- `src/curriculum/telemetry.ts`
- `src/audio/timing.ts`
- `src/audio/useDrillAudio.ts`
- `src/components/PathwayRouter.tsx`
- `src/components/ExerciseView.tsx`
- `src/components/ExerciseReport.tsx`
- `src/components/exercise.css`
- `src/profiles/types.ts`

`StaffCue.tsx` and `public/audio/pitch-processor.js` are intentionally not
replaced: this feature uses the existing worklet message contract, and the
existing VexFlow Dot/annotation behavior remains untouched.

Verified against the provided source with TypeScript + Vite production build,
69 deterministic generated-question checks, state-transition/audio checks,
spatial scoring checks, telemetry reload validation, and desktop/mobile UI
inspection.
