# Fixed, referral-ready curriculum

The live pathway is both progressive and directly addressable. A student may
start at Lesson 1 and climb normally, or arrive at one lesson because an
instructor identified a specific problem. Therefore each lesson is a complete
four-drill mini-intervention: orient the skill, practise it with support, recall
or transfer it, then apply or verify it.

Difficulty is one continuous 96-drill staircase: each displayed slot is harder
than the slot before it, including across lesson boundaries. New hand maps begin
with visible, supported reading before Prove It removes that support; do not put
an unsupported verification ahead of its introduction.

Difficulty uses a challenge budget, not simultaneous escalation on every axis.
Lessons 1-5 establish quarter-note pulse; Lessons 6-12 add eighth-note
subdivision. Lessons 13-18 retain that rhythm vocabulary while movement and
deep-key placement become the new challenge. Lesson 17 is deliberately a
one-hand, five-event bridge with one closing chord before Lesson 18 adds the
timed B-to-F-sharp move. From Lesson 19 onward, polyphony and independent chord
hearing are the new load.

Key-signature copy must describe the five keys actually played. A G-position
pentachord is G-A-B-C-D (the signature is introduced visually, but F-sharp is
outside that hand span); D position first makes F-sharp physical, A position
adds C-sharp, E position uses F-sharp/G-sharp, and B/F-sharp positions carry the
deeper black-key maps. Never claim a drill plays an altered tone it does not
contain.

The source of truth is `LESSONS` plus `LESSON_INTERVENTIONS` in
`progressiveCurriculum.ts`. `CURRICULUM_BLUEPRINT` is the public, audited view.
Do not change order or classification in only one place.

Prove It confirms the position's three anchor notes in order. It does not ask
the student to keep earlier notes held, because acoustic release detection is
too room-dependent for a reliable entry exercise.

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
| 22 | Match the bottom note from an isolated broken example | chord-by-ear, anchor matching, shape transfer |
| 23-24 | Retain and transfer blocked/broken chord shapes across wider roots and registers | independent chord hearing, major/minor contrast, simultaneous attack |

Routing rules:

1. `coreProblems` are valid reasons to assign the lesson directly.
2. `supportingProblems` describe useful reinforcement but rank behind a core
   intervention.
3. Every allowed remediation problem must be core to at least one lesson.
4. The four `drillPurposes` must describe the displayed slots in exact order.
5. Curriculum audits must fail if any of these contracts drift.
