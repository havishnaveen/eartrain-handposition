# EarTrain maintainer rules

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
