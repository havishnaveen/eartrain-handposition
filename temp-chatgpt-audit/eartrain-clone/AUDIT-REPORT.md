# EarTrain full-curriculum regression audit

Audit date: 2026-08-13

## Coverage

- 24 lessons and all 72 clean-run drills.
- 9,720 generated variants across normal, reinforce, and stretch modes; five
  difficulty points; three deterministic seeds; and every adaptive drill slot.
- Perfect, silent, one-miss, one-note-only, deliberately off-beat, and
  deliberately wrong-duration performances.
- Prove It, Blind Memory, Anchor & Shift, and Spatial Chord state machines.
- Full perfect pathway completion and the maximum two-attempt remedial loop.
- VexFlow rendering of all 72 base drills in a real browser.
- Pitch-worklet signal tests for room noise, soft notes, a sustained note, and
  a physical same-key re-attack.

## Regressions corrected

- The standalone default session cap no longer ends the pathway after 15
  drills. It can now reach all 24 lessons, including maximum adaptive growth.
- Natural completion now wins over an exact-length safety cap instead of being
  reported as an early cap exit.
- Later lesson order no longer rotates when earlier lessons add remedial reps.
  Lesson 17 always establishes B with RH and LH before F-sharp; Lesson 24 keeps
  its intended D-A-E base order.
- Left-hand Prove It uses mirrored 5-3-1 fingering.
- Prove It does not highlight the first requested note until detector warm-up
  is complete and the worklet is actually listening.
- Every Anchor & Shift destination is an ascending perfect fifth. Higher-key
  drills no longer become accidental descending fourths after octave clamping.
- The detector/engraving ceiling includes C-sharp6, required by the B4 to
  F-sharp5 position shift.
- Timing and duration are part of pass/fail, with lesson-progressive thresholds;
  they are no longer report-only scores.
- Dotted rhythms now draw their dot as well as using dotted playback timing.
- Adaptive telemetry uses a bounded recent history and keeps shift pairs such
  as C to G separate from single-position C practice.

## Repeatable checks

```sh
npm run build
npm run audit:curriculum
npm run audit:audio
```

For visual engraving inspection during development, run `npm run dev` and open
`/audit.html`. It renders the three base drills from every lesson on one page.
