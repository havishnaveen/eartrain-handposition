# EarTrain maintainer rules

## Responsive notation fixes are regression-protected

Before editing `StaffCue.tsx`, `exercise.css`, or `anchor-shift-cue.css`, preserve
all of the following. These are fixes for previously reproduced bugs, not
optional styling preferences:

- After VexFlow renders, remove its stale inline SVG `width` and `height`
  styles. Restoring them letterboxes the score and makes notes tiny.
- Keep phone score wrapping beat-aware (`splitNotesIntoSystems`); never split
  mixed rhythms by raw note count.
- Keep full scores readable at 320px and hand-shift cards stacked through
  1100px. Do not reduce the mobile cue heights or label sizes without visual
  checks at 320px, 768/1024px, and 1440px.
- Do not allow score content, instructions, orientation text, or grading
  animation notes to clip or create horizontal page overflow.
- Every non-standard exercise must keep its answer/notation hidden until its
  Start action. Prove It may show only position/hand identity before Start;
  advanced (`matched`) chord-by-ear must not reveal the root name while the
  learner is searching.
- `PositionProof.requireHeld` is the literal `false`. Never restore a cumulative
  or timed hold gate in Prove It; simultaneous-tone proof belongs only to chord exercises.
- Run `npm run build`, `npm run audit:curriculum`, and the relevant audio/score
  audits after touching shared exercise rendering. A change that breaks these
  protections must not be committed.

## Curriculum order is a product contract

Before editing curriculum generation, read `src/curriculum/CURRICULUM.md` and the
`AI MAINTAINERS` comment above `LESSONS` in
`src/curriculum/progressiveCurriculum.ts`.

- The 24 lesson positions and the four displayed drill slots inside every
  lesson are fixed, reviewed teaching sequences. Do not reorder, add, remove,
  randomly substitute, or silently repurpose them.
- Do not use global ordinal, random seed, adaptive mode, or caller-provided
  difficulty to choose live lesson material. A retry may repeat the same named
  slot; it must not mutate the lesson's base sequence.
- Treat every lesson as a standalone intervention. Only attach a remediation
  problem when its complete four-drill set meaningfully teaches that problem.
  Direct referrals must prefer `coreProblems`; `supportingProblems` are not
  valid reasons to displace a better-fit lesson.
- A deliberate curriculum change must update the lesson recipe, intervention
  metadata, `CURRICULUM_BLUEPRINT`, `CURRICULUM_VERSION`, curriculum document,
  and audits together. Run `npm run build`, `npm run audit:curriculum`, and
  `npm run audit:late-chords` before committing.
- Never modify `src/dev/DevLessonJumper.tsx`. It is temporary test tooling and
  explicitly outside curriculum work.

These rules protect instructor links and saved checkpoints as well as the UI;
a seemingly harmless reorder can send a referred student to the wrong skill.

## Piano recognition is evidence-based

- Preserve the `music` microphone hint, disabled browser speech processing,
  mono analysis downmix, and analysis-only piano front end in
  `useDrillAudio.ts`. Never route microphone analysis to the speakers.
- Do not treat gain, score context, one chord tone, or a lingering harmonic as
  proof of a played note. Pitch credit requires independent acoustic onset and
  harmonic evidence; written chords require all tones simultaneously.
- Do not tune detector thresholds from one anecdote. Add the failure as an
  audio regression, then run `npm run audit:audio` and `npm run audit:score`.
- Keep Pitch, Timing, and Cleanliness independent. Correct pitches played with
  poor rhythm must keep Pitch credit and lose Timing; fewer than 60% matched
  notes cannot manufacture a Timing 5; one missed written note cannot earn an
  overall 5 outside the explicitly lenient memory rubric.
- Chord-by-ear plays exactly two piano presentations: the target together,
  then the same notes broken bottom-to-top. Do not add backing layers,
  unrelated lead-in chords, or a progression. The curriculum audit enforces
  this because those sounds previously confused the answer.

## Development controls never ship

- `App.tsx` must gate `DevLessonJumper` behind `import.meta.env.DEV`. The
  protected jumper is deliberately always available to local testers; rendering
  it in production exposes lesson jumping and Prove It bypasses to students.
- After changing app bootstrap or build configuration, run `npm run build` and
  confirm the production bundle contains none of `DEV — Lesson`,
  `Jump to next lesson`, or `Prove It skipped`.
