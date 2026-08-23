# EarTrain soft-note, volume, and scoring fix

Drop-in production files:

- `public/audio/pitch-processor.js`
- `src/audio/useDrillAudio.ts`
- `src/audio/timing.ts`

## What changed

- Soft strikes now enter a score-aware recovery lane at 52% of the adaptive
  room gate. They are accepted only when stable pitch evidence exactly matches
  an unfilled written note in a bounded time window, so lowering the recovery
  floor does not turn room noise into arbitrary graded notes.
- A recovery-only ripple can no longer disarm the strict onset detector. This
  fixes the case where a harmless decay fluctuation immediately before the next
  key caused that real, quieter key strike to disappear.
- A candidate followed by a strict estimate from the same hammer strike is
  promoted to the strict detector identity rather than counted twice. Release
  tracking migrates with it, preventing a false very-short note duration.
- The worklet receives the app's exact click schedule. Click-shaped events are
  never unconditional notes, while simultaneous, strongly harmonic piano
  evidence remains recoverable.
- The metronome output bus is louder and its old pitched woodblock tail is
  replaced with a short high-frequency rim transient. It is easier to hear but
  less able to mask a piano fundamental or imitate a curriculum note.
- The success chime and chord-context layers are louder. Recorded-take replay
  remains at unity gain to avoid digital clipping.
- Timing tolerance is broader and changes smoothly by lesson. Duration remains
  graded when release confidence is sufficient, but uncertain releases cannot
  create an automatic failure.
- The old Overall formula multiplied the visible weighted score by pitch
  coverage, even though missing notes had already lowered Pitch. That hidden
  double penalty was removed. Overall now uses only the three visible category
  scores, with a transparent pitch ceiling that never lowers it below a visible
  category minimum.

For the reported example, Pitch `2.0`, Timing `3.0`, and Cleanliness `3.9` now
produce Overall `2.8`, not `1.5`.

## Validation

- 31/31 acoustic calibration cases passed using real Steinway recordings:
  three dynamics per sampled key, quarter/half/whole-note release tracking,
  three same-key re-articulation gaps, sustained-note de-duplication, and three
  metronome-only bleed levels.
- 216/216 generated curriculum phrases passed across Lessons 1–24 at a very
  soft piano peak with louder metronome bleed mixed into the microphone input.
- Perfect five-note phrase: Pitch 5, Timing 5, Cleanliness 5, Overall 5.
- One missed note: Pitch 4, Timing 5, Cleanliness 5, Overall 4.5.
- 1,331 score combinations verified that Overall remains inside the visible
  category range.
- `pitch-processor.js` passed JavaScript syntax validation.
- All three changed TypeScript/JavaScript units passed isolated compilation.

The source snapshot's supplied dependency folder is incomplete (several
unrelated packages/types are absent), so a whole-project Vite build could not
be used as a meaningful final check in this workspace. The changed files
themselves compile cleanly.
