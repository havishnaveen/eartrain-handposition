# Oclef → EarTrain integration contract

This repository now contains the client boundary and durable data model. The
private Oclef API is not publicly documented, so the two server endpoints below
are the only adapters that must be connected once Oclef supplies its contract.
The public Oclef page advertises teacher score review, recording review,
feedback, and skill guidance; EarTrain records the score and diagnostic inputs
needed for those teacher workflows without storing raw microphone audio.

## Passwordless student launch

Oclef redirects to:

```text
https://eartrain-clone.vercel.app/?handoff=OPAQUE_SINGLE_USE_CODE
```

The browser POSTs that opaque value to
`VITE_OCLEF_HANDOFF_EXCHANGE_URL` (default
`/api/integration/oclef/exchange`). It never parses identity claims out of the
URL. The exchange service must:

1. redeem the code once;
2. verify issuer, audience (`eartrain-web`), expiry, redirect URI, and the Oclef
   client binding;
3. map Oclef's opaque student and teacher subjects to EarTrain UUIDs;
4. return the resolved launch below plus a short-lived, student-scoped sync
   token; and
5. reject replayed, expired, wrong-audience, or revoked codes.

Successful response:

```json
{
  "launch": {
    "launchId": "launch_opaque",
    "studentId": "eartrain-student-uuid",
    "instructorId": "eartrain-instructor-uuid",
    "displayName": "Student display name",
    "provider": "reading.oclef.com",
    "externalSubject": "opaque-oclef-subject",
    "sourceApp": "reading.oclef.com",
    "assignment": {
      "id": "assignment_opaque",
      "problem": "bass-clef-recognition",
      "recommendedLessonIndex": 3,
      "questionCap": 6,
      "returnUrl": "https://reading.oclef.com/approved-path"
    },
    "checkpoint": null
  },
  "syncToken": "short-lived-student-scoped-token",
  "expiresAt": 1787426400000,
  "ingestUrl": "https://reading.oclef.com/api/eartrain/events"
}
```

Only a server-verified `assignment.problem` enters curriculum routing. Raw
`studentId`, `lesson`, or `problem` query parameters are not authentication and
are intentionally ignored. Return URLs are allow-listed to EarTrain/Oclef
origins to prevent an open redirect.

## Event ingestion

The durable outbox POSTs to `VITE_OCLEF_ATTEMPT_INGEST_URL` or the `ingestUrl`
returned above:

```http
Authorization: Bearer <short-lived scoped token>
Content-Type: application/json
```

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "kind": "attempt",
      "event": { "id": "event_attempt_..." },
      "student": {},
      "session": {},
      "attempt": {},
      "checkpoint": {}
    },
    {
      "kind": "activity",
      "event": { "id": "event_activity_..." },
      "student": {},
      "session": {},
      "activity": {}
    }
  ]
}
```

The server transactionally upserts by `event.id`, updates the checkpoint, and
returns only committed IDs:

```json
{ "acceptedEventIds": ["event_attempt_...", "event_activity_..."] }
```

The browser removes only those IDs from its outbox. Network loss, tab closure,
or a duplicate POST therefore cannot erase or double-award student credit.

## Teacher-facing data now retained

- learner, instructor, external subject, assignment, launch, and session IDs;
- lesson problem taxonomy and all applicable remediation tags;
- pitch/timing/cleanliness/overall scores and pass state;
- expected sequence, position/register, hand mode, key/mode, and difficulty;
- matches, misses, extras, echo classification, releases, duration accuracy,
  anchor-shift and chord-building evidence;
- recognition diagnostics, including offline recovery and live-note
  preservation; and
- session/exercise viewed, started, completed, and session-completed events.

Audio recordings remain local to the report replay and are not uploaded by
this contract. Recording upload should be a separate, consented feature with
its own retention policy rather than being hidden inside score sync.

## Deployment adapter checklist

1. Obtain Oclef's issuer/exchange endpoint, client credentials or public keys,
   opaque student/teacher subject mapping, and assignment taxonomy mapping.
2. Implement the exchange and event-ingest endpoints using the response shapes
   above.
3. Apply both Supabase migrations in `supabase/migrations/`.
4. Set `VITE_OCLEF_HANDOFF_EXCHANGE_URL` and
   `VITE_OCLEF_ATTEMPT_INGEST_URL` if the endpoints are not same-origin.
5. Allow-list the exact EarTrain redirect URI at Oclef.
6. Test replay, expiry, wrong audience, revoked assignment, offline retry, and
   duplicate event delivery before enabling production redirects.

The flow follows the authorization-code security properties in RFC 9700: the
browser receives an opaque code rather than an access token, the code is
single-use and audience/client-bound, and arbitrary redirect targets are not
trusted.
