# Diagnostic remediation

This is an independent four-stage pathway. It does not change the 24-lesson
curriculum, shared exercise components, microphone hook, DSP, score analysis,
or inference workers. The retired DevLessonJumper remains unmounted.

## Entry points

Use `?diagnosis=<id>`. For hand position, also supply `key`, for example:

```text
/?diagnosis=hand-position&key=F%23%20minor
/?diagnosis=accidental-carryover
/?dev=diagnostics
```

| Registry ID | Lesson |
| --- | --- |
| `clef-transposition` | Bass/treble swap |
| `octave-displacement` | 8va register |
| `accidental-carryover` | Accidental through the measure |
| `hand-position` | All 12 major and 12 natural-minor five-finger patterns |
| `mid-line-clef-change` | Bass-to-treble change within a measure |
| `cross-over-under` | Ascending thumb-under and descending finger-over |

Musical keys accept names (`Db major`, `F# minor`), stable IDs
(`d-flat-major`, `f-sharp-minor`), and Unicode accidentals. A bare tonic means
major. Encode `#` as `%23` in URLs. A recognized musical `key` alone opens hand
position. Unrecognized problems fall back to the standard curriculum; an
unrecognized key on a hand-position referral asks for a key instead of silently
teaching a different one. A hand-position referral without a key defaults to C major.

Verified handoff responses may carry:

```json
{
  "assignment": {
    "id": "assignment-id",
    "problem": "hand-position",
    "key": "Bb minor"
  }
}
```

Alternatively put `diagnosticReason` or `diagnosticCode` and `key` on
`session.launch`. These fields survive both exchange parsing and cached-session
restoration. Routing considers the URL diagnosis, assignment problem, launch
reason, then launch code; the first recognized diagnostic wins. URL key takes
precedence over assignment key and launch key. Query parameters never provide
student identity or bypass handoff authentication.

The existing Oclef exchange and ingestion service contract still applies; this
change does not implement a new issuer, API-key exchange server, or partner
authentication endpoint. See `oclef-integration-contract.md`. Live handoff
validation requires the partner service and a valid issued code. Diagnostic
results currently govern this local lesson flow; no new partner event schema
or persistent diagnostic-mastery claim is introduced.

## Learning flow

1. Listen to sampled acoustic piano while following the score. Judgment stays
   disabled until playback finishes. A wrong answer receives an explanation and
   highlights the divergent score notes. A playback failure cannot count as listening.
2. Answer the child-friendly concept question with a visual tip. Wrong answers
   invite another try; a correct answer unlocks piano practice.
3. Prove the three starting anchors sequentially using the existing Prove It
   microphone gate, then play the corrected phrase through `useDrillAudio`.
4. Prove the transfer position and play a different phrase with the same trap.
   A successful transfer completes this practice, not a claim of permanent mastery.

Every acoustic take uses the unchanged plan and score functions. Advancement
requires the engine's passing result, all written notes matched, no hard wrong
extras, timing at least 3/5, and an on-time measured transition for hand shifts.
The individual pitch, timing, and cleanliness scores are never rewritten.
Failed takes repeat with the physical gate. Fingerings are teaching cues, not
claims that a microphone can identify fingers.

C major and A minor contain no black keys in these five-note patterns. Their
discrimination example uses a neighboring white-key error. Other keys use a
black-to-natural slip. Spellings such as E# remain musically correct while the
visual map identifies the actual white/black piano key.

Notation is isolated in `diagnosticMusicXML` / `DiagnosticScore`: sounding
pitches remain in each Question, MusicXML renders the 8va bracket, clef changes
occur before the specified note, and repeated accidentals are suppressed until
needed again. Existing `AnchorShiftCue` renders the acoustic movement drills.
The current application's orange-and-white shell and existing exercise styling
are reused without alteration.

## Tester

The collapsible bottom bar mounts only in a development build or with
`?dev=diagnostics`. Select any problem, all 24 keys, or stages 1–4. Stage jumps
to piano practice still enter Prove It. Return to Standard Curriculum remounts
the ordinary pathway. `[` and `]` cycle problems, or keys when Hand Position is
selected; `1`–`4` jump stages. Shortcuts ignore form controls, focused buttons,
editable content, modifier keys, and held-key repeats. Switching lessons or
stages unmounts the old microphone/playback owner to cancel in-flight work.

## Add a problem

Append a `DiagnosticDefinition` to `DIAGNOSTIC_REGISTRY` in
`src/diagnostics/registry.ts`, providing a unique ID, label, optional aliases,
and a factory returning its metadata, demonstration error, MCQ, visual tip,
practice Question, transfer Question, and notation settings. Routing and tester
menus enumerate the registry. Keep every Question's sequential position proof
and exact expected pitches. The current diagnostic notation supports one hand,
quarter-note phrases in 4/4, a clef change, key signatures, and an octave-up line;
extend that isolated adapter when a future lesson requires another notation form.

## Verification

```sh
npm run build
npm run audit:diagnostics
npm run audit:curriculum
npm run audit:audio
npm run audit:score
npm run dev -- --host 127.0.0.1 --port 5190
node scripts/audit-diagnostics-browser.mjs
AUDIT_URL=http://127.0.0.1:5190 node scripts/audit-proof-browser.mjs
# In a separate terminal, with the production build above:
npm run preview -- --host 127.0.0.1 --port 5191
AUDIT_URL=http://127.0.0.1:5191 node scripts/audit-diagnostics-acoustic.mjs
```

The browser acoustic fixture injects synthetic piano-like PCM into a real
MediaStream and exercises the actual microphone hook. It is not a substitute
for testing an acoustic piano in Safari on the student's iPad.
