# EarTrain replay, scrubber, rhythm, and soft-note fix

Copy these complete replacement files into the matching project paths.

## 1. Audio replay

- Microphone recording now emits 250 ms chunks instead of relying on one
  fragile final chunk.
- Stop explicitly requests pending data and grading waits for MediaRecorder's
  finalization before the report can appear.
- WebM/Opus, Ogg/Opus, and MP4/AAC MIME variants are selected by browser
  support, and the blob uses the actual chunk MIME type.
- Playback explicitly unmutes, restores full volume, reloads changed object
  URLs, and reports decode/play failures instead of silently doing nothing.

## 2. Scrubber synchronization

- The old code mixed pre-draw TickContext X coordinates with post-draw SVG
  coordinates. That made the scrubber's path longer than the note path and
  made it move too slowly.
- Its start, speed, and endpoint are now derived from the notes'
  post-render `getAbsoluteX()` positions. Beat 3 therefore intersects the
  beat-3 note even when quarter, half, and dotted notes are mixed.

## 3. Rhythm grading

- Lesson 1's on-beat window is now 0.45 beats, tightening smoothly to 0.22
  beats in Lesson 17.
- Start-offset forgiveness is now only 0.18 beats early and 0.06 beats late
  in the pathway, rather than 0.70 to 0.22 beats.
- Rhythm now scores both absolute written onsets and the gaps between
  successive notes, catching rushing, dragging, and alternating early/late
  attacks.
- Regression results at Lesson 1: on-time `5.0`, uniformly half-beat late
  `3.4`, uneven early/late `1.7`.

## 4. Softer-note recognition

- RMS absolute floor: `0.0038` → `0.0015`
- RMS median multiplier: `2.25` → `1.90`
- RMS ceiling multiplier: `1.45` → `1.25`
- Flux threshold: `2.50` → `2.10`
- Stable pitch frames required: `4` → `3`
- YIN admission clarity: `0.50` → `0.42`
- Repeated-note re-articulation thresholds were also relaxed while retaining
  the minimum onset gap and envelope re-attack requirement.

## Duration grading answer

The current engine does **not** measure key release or independently grade
held duration. `DetectedNote` contains an attack time but no release time.
The Timing category grades note attacks against their written beat and now
also grades onset-to-onset gaps. A half note followed by the next note too
early is penalized because the next attack is early; releasing the half note
early but waiting to play the next note is not currently penalized.

The worklet's `sustain` field is room/pedal resonance present at the next
attack. It is not a measured key-hold duration.

## Advanced-rhythm answer

The parser supports `8` and `16` durations, but the active curriculum does
not generate them. `melody.ts` currently emits only quarter, half,
dotted-half, and whole notes and explicitly excludes eighth notes. Therefore
later lessons do **not** currently introduce eighth or sixteenth notes.

## Validation

- Audio-worklet JavaScript syntax passed.
- TypeScript and Vite production build passed.
- Synthetic recorded audio loaded at browser readyState 4, played without an
  error, and advanced its currentTime.
- Pure timing and scrubber-coordinate regressions passed.
- Playback/report rendering was visually inspected in the local browser.
