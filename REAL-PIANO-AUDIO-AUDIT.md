# EarTrain real-piano audio audit

Date: 2026-08-16

## Production changes

- `public/audio/pitch-processor.js`
  - Rejects broadband metronome transients without raising the quiet-note gate.
  - Downgrades click-over-sustain estimator conflicts to contextual candidates.
  - Prevents weak residual-only estimates from becoming unconditional notes.
  - Distinguishes natural piano decay from a real damper/key release.
  - Preserves confident release timing while other strings are ringing.
- `src/audio/useDrillAudio.ts`
  - Recovers an exact, score-timed soft re-articulation only when the attack has physical evidence.
  - Keeps the stricter rule for unscored/random same-pitch events.
  - Clears duplicate protection only for the detector id whose string actually released.

No microphone-injection or test-only hook is included in the production bundle.

## Acoustic corpus

The piano signal is not synthesized. The audit uses University of Iowa Musical
Instrument Samples recordings of a Steinway & Sons Model B at `pp`, including
seven exact recorded keys. Remaining curriculum pitches are produced by sample-
rate transposition of the nearest recorded Steinway key; no oscillator generates
the piano signal. A room-noise bed is taken from the recordings themselves.

The app's actual woodblock-style metronome is rendered separately and mixed into
the microphone signal to test speaker-to-microphone bleed.

## Results

- Curriculum: **216 / 216 passed** at the quiet stress level.
  - Prove It: 43 / 43
  - Blind Memory: 68 / 68
  - Anchor & Shift: 42 / 42
  - Spatial Chord: 63 / 63
- Coverage: all 24 lessons and all 9 generated variants per lesson.
- Calibration: **31 / 31 passed**.
  - 21 exact-key soft/medium/loud Steinway cases.
  - One held note produced one onset, not two.
  - Same-key re-articulations at 200 ms, 320 ms, and 800 ms produced exactly two onsets.
  - Three metronome-only leakage levels produced zero accepted notes.
  - Quarter, half, and whole-note releases were measured within 34 ms of the rendered damper edge.
- Existing detector regression audit: passed.
- JavaScript syntax check: passed.
- Isolated TypeScript check for `useDrillAudio.ts` and its imports: passed.

The supplied source folder's dependency tree is incomplete (several original
packages and type packages are absent), so a full Vite production build could
not be run in this sandbox. This is independent of the two changed files; their
direct syntax/type checks pass.

## Limits

This is a deterministic DSP regression test, not a claim that every laptop,
microphone, piano, room, and speaker placement is now proven. The corpus is much
stronger than oscillator-only testing because it exercises real hammer attacks,
inharmonic partials, natural string decay, room noise, quiet dynamics, fast
re-articulation, and metronome overlap. Production telemetry should still retain
recognition diagnostics so future real-device misses can become permanent cases
in this corpus.
