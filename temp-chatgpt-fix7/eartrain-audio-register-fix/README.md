# EarTrain sustained-note + register fix

Drop each file into the matching path in the React/Vite project:

- `public/audio/pitch-processor.js`
- `src/audio/useDrillAudio.ts`
- `src/components/ExerciseView.tsx`
- `src/components/exercise.css`

## What changed

- Prove It now derives a child-friendly register label from the generated anchor pitch: `Middle C`, `Bass C`, or `Treble C` (and the equivalent label for other position roots).
- The worklet now separates a physical piano attack from sustain/release fluctuations using short-term RMS rise plus normalized spectral novelty.
- The first-onset adaptive guard is bounded, so one large startup transient cannot hide following quiet notes for several seconds.
- The amplitude gate is slightly more sensitive while remaining tied to the measured room floor.
- Pitch subtraction uses a true pre-attack spectrum rather than a spectrum that already contains the hammer transient.
- The pitch vote window is limited so the following note cannot be assigned to an earlier sustain ripple.
- The worklet URL is versioned to prevent a browser or CDN from retaining the old detector after deployment.

## Verification performed

- Production TypeScript/Vite build: passed.
- AudioWorklet syntax check: passed.
- One five-second resonant sustained C: exactly one C onset.
- Very soft C-D-E-F-G phrase: all five notes, no extras.
- Pedalled/overlapping C-D-E-F-G phrase: all five notes, no extras.
- Three deliberate repeated C strikes: exactly three C onsets.
- Low room-noise/hum model: zero note onsets.
- Register sweep C3-G3-C4-G4-C5 at mixed soft dynamics: all five pitches correct.

The synthetic cases run the real `AudioWorkletProcessor` inside Chromium, rather than a separate reimplementation of the detector.
