# EarTrain audio reconciliation + Oclef integration foundation

Use the full-source archive when replacing the complete project. If applying
selectively, copy every file in the drop-in archive while preserving its path.

## Audio and grading

- `public/audio/pitch-processor.js`
- `public/audio/score-analyzer-worker.js`
- `src/audio/scoreAnalysis.ts`
- `src/audio/timing.ts`
- `src/audio/useDrillAudio.ts`
- `src/hooks/usePianoAudio.ts`

The live detector now retains provenance for each score-matched event. The
post-take worker reconciles that evidence with raw PCM instead of replacing it.
Only exact written slots with independent PCM support can be restored. Low FFT
floor bins are bounds-safe, quiet watched bass notes have a dedicated recovery
path, and held-note release confirmation requires four consecutive collapse
frames while same-note strike guards survive a questionable release.

## Curriculum and teacher data

- `src/curriculum/types.ts`
- `src/curriculum/progressiveCurriculum.ts`
- `src/curriculum/telemetry.ts`
- `src/components/PathwayRouter.tsx`
- `src/profiles/types.ts`
- `src/profiles/learningProfileStore.ts`
- `src/profiles/reporting.ts`
- `src/profiles/sync.ts`

Every live lesson has a primary remediation problem and searchable problem
tags. Attempts retain those tags plus recognition reconciliation evidence.
Session/exercise lifecycle events and attempts share a retry-safe outbox.

## Passwordless Oclef handoff

- `src/integration/oclefBridge.ts`
- `src/integration/OclefIntegrationGate.tsx`
- `src/App.tsx`
- `src/index.css`
- `docs/oclef-integration-contract.md`
- `docs/learning-profile-architecture.md`
- `supabase/migrations/202608220002_oclef_handoff_and_activity.sql`

The production Oclef endpoint contract is not public. The client is complete
up to that boundary: an opaque single-use `handoff` code is exchanged by a
trusted endpoint, URL claims are never trusted, the active learner is selected
without a second login, a verified remediation assignment chooses the opening
lesson, and committed events are removed from the outbox only after the server
returns their exact idempotency keys.

## Other maintenance

- `vite.config.ts` isolates the VexFlow and data bundles without circular
  chunks.
- The unused legacy microphone hook now actually arms/idles the current
  worklet and uses the same cache-busted processor.
- Audio, score, curriculum, TypeScript, production-build, local render, and
  invalid-handoff fail-closed checks passed.
- ESLint was not available in the supplied shared `node_modules`; TypeScript's
  strict build completed successfully.
