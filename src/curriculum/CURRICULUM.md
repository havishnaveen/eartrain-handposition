# Fixed, referral-ready curriculum

The live pathway is both progressive and directly addressable. A student may
start at Lesson 1 and climb normally, or arrive at one lesson because an
instructor identified a specific problem. Therefore each lesson is a complete
four-drill mini-intervention: orient the skill, practise it with support, recall
or transfer it, then apply or verify it.

The source of truth is `LESSONS` plus `LESSON_INTERVENTIONS` in
`progressiveCurriculum.ts`. `CURRICULUM_BLUEPRINT` is the public, audited view.
Do not change order or classification in only one place.

| Lessons | Standalone intervention | Typical direct-referral problems |
| --- | --- | --- |
| 1-4 | C-position foundations, finger mapping, clef reading, then grand-staff coordination | right/left-hand placement, treble or bass recognition, clef differentiation, hand coordination |
| 5-6 | G-major orientation, then fluent use | one-sharp position, key signature, position memory |
| 7-8 | D-major orientation, then fluent use | two-sharp position, turns/skips, position memory |
| 9-10 | A-major orientation, then longer phrases | three-sharp position, subdivision, two-hand stability |
| 11-12 | E-major orientation, then longer phrases | four-sharp position, subdivision, two-hand stability |
| 13-16 | One fixed fifth-shift per lesson, right hand then left hand | exact position pair, dominant/non-dominant hand shift, landing in time |
| 17 | B and F-sharp maps before movement | five/six-sharp placement and finger mapping |
| 18 | B-to-F-sharp shift | advanced exact-pair landing with a two-second reveal |
| 19-20 | Supplied anchor to complete 1-3-5 chord | chord anchor, shell, reading, simultaneous chord attack |
| 21 | Major/minor middle-tone contrast | chord-quality hearing and spacing |
| 22 | Match an isolated anchor in light texture | chord-by-ear, anchor matching, shape transfer |
| 23-24 | Extract and retain the piano chord in context | background-piano separation and progression-level transfer |

Routing rules:

1. `coreProblems` are valid reasons to assign the lesson directly.
2. `supportingProblems` describe useful reinforcement but rank behind a core
   intervention.
3. Every allowed remediation problem must be core to at least one lesson.
4. The four `drillPurposes` must describe the displayed slots in exact order.
5. Curriculum audits must fail if any of these contracts drift.
