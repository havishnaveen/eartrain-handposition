# EarTrain foundation fixes — 2026-08-22

Copy the `public`, `src`, and optional `scripts` folders over the matching
folders at the root of the current EarTrain project.

Implemented in this bundle:

- Prove It uses RH fingers 1–3–5 (LH remains 5–3–1).
- Prove It requires cumulative holding: hold the first key, add the middle,
  then add the outside key without releasing the earlier fingers.
- Harmonic/overtone shadows are quarantined in the live detector and verified
  against an independent hammer attack in the lossless full-take analyzer.
- The two-measure count-in copy is explicit and slightly larger.
- The staff cursor remains visible and frozen at the start during count-in.
- Timing normalizes fixed audio-device latency, grades relative rhythm more
  strongly, and confidence-weights acoustic release estimates.
- Melody reports show only Overall, Pitch, Timing, Cleanliness, and one short
  summary. Full diagnostics continue to be saved to telemetry.
- Worklet/worker cache versions are bumped so browsers load the new DSP files.

Verification completed:

- `npm run build`
- `npm run audit:audio`
- `npm run audit:score`
- `npm run audit:curriculum` (24 lessons; 9,720 generated cases)

The two files under `scripts/` are regression-audit updates. They are useful
to retain but are not required in the production browser bundle.
