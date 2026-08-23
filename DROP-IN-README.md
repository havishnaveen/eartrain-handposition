# EarTrain Prove It personalized hold errors

Copy these four files over the matching paths in the current EarTrain source:

- `src/audio/useDrillAudio.ts`
- `src/components/ExerciseView.tsx`
- `src/components/PathwayRouter.tsx`
- `scripts/audit-curriculum.mjs`

## Behavior

- A failed cumulative hold resets Prove It and shows `TRY AGAIN`.
- The message names the exact hand, finger, and registered key that was not held.
- If multiple keys were released, the message names all of them.
- Failures are covered after the first key, after the second key, and during the final 520 ms three-key verification.
- A correct first key immediately clears the message and begins the next attempt.
- Existing release grace periods, recognition thresholds, Prove It sequence, and UI layout are unchanged.

## Validation

Passed against the supplied source:

- `npm run build`
- `npm run audit:curriculum` — 24 lessons, 9,720 generated cases, including every release combination at all three Prove It hold stages
- `npm run audit:audio`
- `npm run audit:score`

Real piano/microphone testing is still recommended because physical release behavior depends on the instrument, room, and microphone.
