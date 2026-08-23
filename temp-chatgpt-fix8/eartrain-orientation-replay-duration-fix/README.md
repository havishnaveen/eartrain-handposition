# EarTrain orientation, replay, recognition, and duration update

Replace each project file with the matching file in this bundle. Every file is complete; these are not partial patches.

## First-time orientation pointers

- The register badge is larger and higher contrast.
- The first move away from the middle register shows a short `New piano area` pointer.
- The first left-hand lesson shows a `Hand change` pointer.
- The first lesson using both RH and LH shows a `Both hands now` pointer.
- Each pointer has an `Okay` acknowledgement and is shown only once across sessions.
- Acknowledgements are stored under `eartrain.orientation-cues.v1` in local storage. Delete only that key when intentionally retesting the onboarding sequence.

## Replay

- The microphone take is recorded as one continuous encoded segment instead of concatenated 250ms fragments.
- Explicit 128kbps audio is requested where supported, with a Safari-safe fallback.
- The replay playhead and waveform animate imperatively; the complete React/VexFlow report no longer rerenders about 22 times per second.

## Recognition and duration

- Quiet notes still use the sensitive adaptive amplitude gate.
- Pitch acceptance now requires three stable estimates, 50% semitone consensus, tighter spread/MAD, and 0.25 clarity.
- The AudioWorklet emits a later `note-release` event when it observes a confident multi-frame damper/key-release energy collapse.
- Duration grading prefers these real acoustic hold times, including the final note and early staccato releases.
- When pedal or overlapping resonance makes key-up acoustically unknowable, release confidence is capped below the grading threshold. The app falls back rather than inventing a duration penalty.
- A same-key physical re-articulation can still close the previous duration reliably.

## Verification

- TypeScript + Vite production build: passed.
- AudioWorklet syntax check: passed.
- 5.2-second resonant held C: one C onset; release measured at 5.21s.
- Very quiet C-D-E-F-G: exactly five correct onsets and five releases.
- 0.23-second staccato C-D-E-F-G: all five shortened holds measured.
- Overlapping pedalled C-D-E-F-G: exactly five intended pitches, no random extras; ambiguous key releases excluded from duration grading.
- Room-noise/hum rejection remains intact, with stricter pitch consensus than the prior version.
