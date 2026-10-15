# Fixed diagnostic batches

All seven side lessons, including Clef Confusion, have six numbered batches of exactly three exercises. Each batch starts with one microphone-scored playing exercise. All students see the same notes, rhythms, prompts, options, and order. Dates, identities, performance, and legacy need settings do not select or shuffle content. Clef Confusion's original full-lesson stages remain available through All Lessons.

## Reviewed pathway

| Batch | Exercise 1 | Exercise 2 | Exercise 3 | Rhythm |
| --- | --- | --- | --- | --- |
| 1 | Play | Read the target note/finger | Spot the mismatch | Quarter notes |
| 2 | Play | Spot the mismatch | Identify the cause | Quarter notes |
| 3 | Play | Read the target note/finger | Spot the mismatch | Eighth-note pairs |
| 4 | Play | Identify the cause | Spot the mismatch | Eighth-note pairs |
| 5 | Play | Spot the mismatch | Identify the cause | Sixteenth-note groups |
| 6 | Play | Spot the mismatch | Read the target note/finger | Sixteenth-note groups |

Every first Right/Wrong judgment is Wrong. Every batch contains error recognition. Guided questions and retries belong to the same exercise and do not add to the count of three.

| Side lesson | Batches 1 → 6 |
| --- | --- |
| Key signatures | G major → F major → D major → B♭ major → A major → E♭ major; signature tones recur in both measures, with higher-register transfer from batch 3 |
| Clef confusion | Bass → treble → bass → treble → bass → treble; read each phrase in its printed clef |
| Accidental carryover | F♯ → B♭ → C♯ → E♭ → G♯ → A♭; first exercise retains an accidental within a bar, next two test its reset |
| Register reading | Six distinct groups of C-major turns and arches in the fifth octave; whole-phrase, second-measure, then single-note displacement |
| Mid-line clef changes | Both hands in all exercises; lower staff moves from bass to treble at measure 2 while the upper staff continues in treble; increasingly detailed rhythms |
| Finger-to-note reading | C4, D4, E4, C5, D5, E5 five-note positions; written fingers track each pitch |
| Crossing continuity | G, D, A, G, D, A major fragments with a written 3-to-thumb transition; increasingly subtle interruptions |

`src/stations/generator.ts` contains the explicit 18 melodic contours and six question-kind recipes. Each phrase fills two 4/4 measures. Scale fragments, arches, and turns replace random note walks. Playback, notation, and microphone scoring derive from the same pitches and durations. Both hands share the same beat timeline. Audio does not claim to verify physical fingering.

Playing uses the existing AcousticDrill microphone and grading engine. A failed first take prompts a short check using the same score, then one retry. Key-signature checks use the actual first missed note from grading: a missed signature note prompts recognition of the signature, not an assumption about barline resets. Rhythm-only failures receive rhythm feedback rather than a false signature diagnosis. Correct takes skip remediation. Clues and retries remain within the playing slot; they never expand a batch beyond three exercises. No recording or example autoplays, and this flow does not send premature teacher notifications.

## Flow and reset behavior

Opening or reselecting a batch starts at question 1 with fresh choices and attempts, including after a reload. Batch number is retained in the URL. The tester offers batches 1–6 beside the existing practice-mode option. Old saved daily results cannot reopen a completion screen: fixed batches use a separate versioned storage key.

The final question's feedback leads directly to the next batch, with the counter reset to 1/3. Batch 6 finishes back at the standard curriculum. There is no separate batch-completion card or score summary.

`ready → answering → feedback → record → next question/batch`

An initial mistake follows `answering → clue → clue-feedback → retry → feedback`. The original notation, prompt, choices, and selected incorrect answer remain visible through the follow-up. Playback is always explicit. Exhausted choices are disabled; final feedback reveals the correct answer. Correct feedback retains the established morphing checkmark.

Per-attempt IDs and phase guards reject delayed actions from older attempts. Browser storage retains the current attempt's evidence, but does not resume it on a fresh opening. The former adaptive/mastery utilities are not used to select, skip, retire, or reorder these batches.

## Verification

`npm run audit:stations` checks all 126 exercises and exactly one playing slot per batch, phrase uniqueness, fixed order, notation duration, two-hand timeline alignment, audio/answer agreement, first-Wrong behavior, identity/date independence, retries, resets, and stale-event rejection. Synthetic correct performances must pass the real grading function; missed signature notes must trigger a follow-up about the actual note. Build, diagnostic/curriculum, audio, and score audits protect surrounding lessons.
