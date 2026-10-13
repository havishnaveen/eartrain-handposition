# Daily Diagnostic Stations

## Product contract

An assigned weakness gets one saved three-question batch per learner and local calendar date. A clue and one retry belong to the original question; they never expand the batch. Completing a station offers the next assigned, due station. Once all due stations are complete, the day is finished. Full practice remains available without altering the daily record.

Clef Swap is excluded from this framework. Mid-line clef recognition is a separate reading station. No station opens the microphone or claims that audio proves physical fingering.

## Domain architecture

The session manager owns immutable daily assignments, a guarded question state machine, the evidence ledger, and scheduling. The assembler consumes learner/date/topic, telemetry-derived archetype, and recent phrase fingerprints. Its output is exactly three semantic questions. Both notation and playback are generated from that semantic model; incorrect examples differ only in the targeted error.

| Component | Responsibility |
| --- | --- |
| Triad policy | Select ear, visual, classification, or balanced composition |
| Musical generator | Vary keys, register, contours, rhythms, ordering and distractors |
| Session manager | Freeze material at Start, resume attempts, reject stale actions |
| Evidence ledger | Preserve first choices, clues, retries, replay counts and active decision time |
| Graduation scheduler | Recompute consecutive-day mastery and retention due dates |
| Practice controls | Switch daily/full modes without transferring full-practice results into mastery |

## State machine

`ready → answering → feedback → record → next question / complete`

An incorrect first answer or requested clue takes the alternate path:

`answering → clue → clue-feedback → retry → feedback → record`

The retry ends the attempt whether correct or incorrect. Exhausted answer buttons are disabled and the correct answer is revealed. Guided checks refer to the exact note or event, use plain options, and contain no media. Scores remain hidden before Start. Listening answers require a successful user-initiated playback. Sample-loading failures consume no attempt. No playback starts automatically.

Each write carries the session and expected question ID. Phase guards, completed-session guards, and browser Web Locks prevent duplicate grading and stale-tab actions from advancing another question. Snapshots are saved after every transition. A page reload preserves a used clue and a failed first attempt.

## Adaptive policy

Initial exploration uses one visual check, one concept question and one listening judgment. The five most recent completed sessions within fourteen days guide subsequent composition:

- Auditory mistakes favor three audio judgments.
- Visual errors or slow accurate reading favor two notation checks and one error-diagnosis question.
- Accurate listening with poor conceptual diagnosis, or recurring root-cause errors, favors two judgments and one root-cause question.
- Otherwise, balanced exploration continues.

Every three-question batch includes at least one mistake-spotting or error-diagnosis question, regardless of archetype. Ear questions progress from quarter-note phrases to eighth-note and sixteenth-note contexts. Crossing hesitations shrink from 0.8 to 0.4 to 0.2 seconds. Every batch's first Right/Wrong judgment is Wrong; subsequent examples need not alternate.

The diagnostic tester contains the sole visible mode option: “All exercises” or “Three-question batches.” Exercises reuse the established diagnostic layout, colors, buttons and feedback styles. There is no separate station header, focus selector, assignment panel, timing display or persistence footer. Scheduling, adaptive selection and saved progress remain internal.

Response speed is measured as visible decision time, excluding loading and playback. Speed influences practice selection, not the exact graduation rule. There is no speed-pressure countdown.

## Determinism and freshness

A versioned learner/date/topic/archetype seed drives a stable PRNG. Non-ear question order is shuffled; ear ordering preserves increasing subtlety. Keys cycle through distinct slots. Candidate phrases are rejected if their sounding pitch sequence and rhythmic sequence occurred during the preceding seven calendar days, across assigned topics. Changing finger labels or question wording cannot disguise a repeated phrase. Failure to find a fresh phrase is explicit rather than silently accepting a duplicate.

The saved batch is authoritative after Start. Midnight does not replace an in-progress question. Reloading on a new date opens the new date's batch; an older session completed after its assigned date cannot count as a perfect day. A stored IANA timezone defines all calendar boundaries, including daylight-saving transitions.

## Persistence schema

```text
StudentStationState
  schemaVersion, revision, timeZone
  assignments: Topic[]
  preferences: Topic → adaptive | audio | visual
  sessions: date/topic → DailySession
  summaries: date/topic → completed evidence
  progress: Topic → active | maintenance, streak, masteredOn, nextDue

DailySession
  id, date, topic, seed, archetype, need
  questions: exactly [Question, Question, Question]
  results: 0..3 QuestionResult
  run: guarded phase + current choices/hints/playback evidence
  startedAt, completedAt

QuestionResult
  questionId, kind, firstChoice, finalChoice
  firstAttemptCorrect, correct, hintsUsed, guidedCorrect
  attempts, responseMs, replayCount, completedAt
```

The implementation stores progress per verified integration learner or active local learner profile, never a learner ID supplied in a query parameter. Full musical snapshots are retained for three weeks; compact daily summaries preserve graduation history. Corrupt storage is not overwritten. Blocked/full storage produces a visible temporary-progress warning.

This is browser-local persistence, not cross-device synchronization or tamper-proof assessment. The storage adapter isolates that deployment choice. A multi-device rollout should replace it with an authenticated, server-authoritative transactional store, keeping learner timezone, generation version and idempotency key server-side. No credentials, recordings or teacher notifications are stored or sent by this framework.

## Graduation and retention

Only exactly three unhinted first-attempt successes completed on the assigned date count as a perfect day. Two adjacent perfect dates graduate a station; skipped days, hints, initial errors and late completion cannot qualify. Repeated writes recompute the same progress rather than adding another success.

A mastered station is omitted from primary rotation. Its deterministic next check is 7–14 calendar days later. Passing retention reschedules it; any non-perfect retention session restores active daily practice. Overdue retention stations remain due until completed. Full-practice performance neither grants nor revokes mastery.

## Verification

The station audit generates 3,240 examples across all supported topics and archetypes over 45 dates. It checks seven-day freshness, deterministic regeneration, triad composition, first Wrong judgments, notation measure duration, audio/answer agreement, reload recovery, stale actions, exact graduation, skipped-day failures, hints, retention and storage failures. Shared curriculum and audio/score regression audits remain required alongside the production build.
