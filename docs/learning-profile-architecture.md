# Learning profile architecture

Curriculum v15 treats Chord by Ear as an ungraded, microphone-free spatial
discovery: the learner hears a nearby reference, then a hidden target and its
broken form. Move Your Hand always displays both positions; early transitions
retain a counted move window plus a READY beat.

## What is collected now

Every completed attempt is written twice, and lightweight usage events are
written to the same durable outbox:

1. The existing `eartrain.telemetry.v1` history remains intact for the current
   adaptive engine.
2. `eartrain.learning-data.v1` stores the same attempt under a learner,
   practice session, curriculum version, stable event ID, and sync outbox.

Existing telemetry is migrated idempotently on startup. No score is deleted and
reloading cannot create duplicate credit. Raw microphone recordings are not
placed in the profile database; reports retain scores and grading evidence only.

Each of the 24 lessons also carries a stable primary remediation problem plus
searchable problem tags. A verified external assignment can therefore request
`bass-clef-recognition`, `register-placement`, `hand-shift`, or another skill
without coupling Oclef to EarTrain lesson titles.

## Identity model

Instructors are authenticated Supabase users. Students are `student_profiles`,
not auth users. This avoids forcing a five-year-old to manage credentials.
`student_external_identities` maps a student to an opaque subject from
`reading.oclef.com` without relying on names or email addresses.

## Future redirect flow

1. An instructor launches a student from reading.oclef.com.
2. reading.oclef.com creates a short-lived, single-use signed launch token.
3. EarTrain sends that token to a Supabase Edge Function.
4. The function verifies signature, audience, expiry, and the hashed access
   grant, then returns a resolved student launch context and scoped session.
5. `activateResolvedLaunch()` selects the student and continues from the saved
   checkpoint. The browser never trusts a raw `student_id` query parameter.

## Sync contract

Each attempt has a stable client event ID. The future sync worker sends
`getSyncBatch()` results and the backend upserts by `event_id`. Only after a
successful transaction does it call `acknowledgeSynced()`. Network retries are
therefore safe and cannot double-count scores, advancement, or credit.

The included Supabase migration creates the normalized tables, indexes, RLS
policies, checkpoints, external identity links, and hashed access-grant table
needed by that flow.
