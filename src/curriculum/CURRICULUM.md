# Fixed, referral-ready curriculum

The live pathway is both progressive and directly addressable. A student may
start at Lesson 1 and climb normally, or arrive at one lesson because an
instructor identified a specific problem. Therefore each lesson is a complete
four-drill mini-intervention: orient the skill, practise it with support, recall
or transfer it, then apply or verify it.

Difficulty is one continuous 96-drill staircase: the declared challenge rises
across slots and lesson boundaries. Position-orientation lessons deliberately
open with Prove It as a quick placement diagnostic, then provide supported
reading and finish with a second check. That opening check identifies the help
the learner needs; it is not a claim that the position was already taught.

Every normal-reading slot across all 24 lessons is an authored miniature in
`authoredReading.ts`, identified by a stable `materialId`. The notes, rhythm,
rests, hand entries, and accompaniment are reviewed score data; no seed or
random contour chooses them. The sequence begins with one-hand steps and
answers, then introduces call-and-response, held bass, eighth-note pairs,
contrary/parallel motion, dotted rhythm, Alberti figures, and walking bass.
The later scores add chord shells, blocked/broken chord changes, parallel
cadences, Alberti support, and walking bass. Contour pools remain only for
supported position and memory drills.

Difficulty uses a challenge budget, not simultaneous escalation on every axis.
Lessons 1-5 establish quarter-note pulse; Lessons 6-12 add eighth-note
subdivision. Lessons 13-18 retain that rhythm vocabulary while movement and
deep-key placement become the new challenge. Lesson 17 is deliberately a
one-hand, five-event bridge with one closing chord before Lesson 18 adds the
timed B-to-F-sharp move. From Lesson 19 onward, polyphony and independent chord
hearing are the new load.

Hand-shift travel is beat-aligned. Every shift owns one complete, steady 4/4
rest measure: move on beats 1-2, settle on 3-4, and play on the following
downbeat. The metronome never inserts a digital countdown or a stray READY
beat. Both written positions remain visible before Start and throughout the
exercise; only the cursor and active-position emphasis move.

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
Before a standard grand-staff exercise, Prove It runs as two explicit gates:
RIGHT HAND first, then LEFT HAND. The first such exercise explains this sequence
in a blocking acknowledgement rather than presenting both positions at once.

| Lessons | Standalone intervention | Typical direct-referral problems |
| --- | --- | --- |
| 1-4 | C-position foundations, finger mapping, clef reading, then grand-staff coordination | right/left-hand placement, treble or bass recognition, clef differentiation, hand coordination |
| 5-6 | G-major orientation, then fluent use | one-sharp position, key signature, position memory |
| 7-8 | D-major orientation, then fluent use | two-sharp position, turns/skips, position memory |
| 9-10 | A-major orientation, then longer phrases | three-sharp position, subdivision, two-hand stability |
| 11-12 | E-major orientation, then longer phrases | four-sharp position, subdivision, two-hand stability |
| 13-16 | One fixed fifth-shift per lesson, right hand then left hand | exact position pair, dominant/non-dominant hand shift, landing in time |
| 17 | B and F-sharp maps before movement | five/six-sharp placement and finger mapping |
| 18 | B-to-F-sharp shift | advanced exact-pair landing with an instantaneous destination reveal |
| 19-20 | Visible known chord to a nearby same-shape target | chord anchor, shell, reading, simultaneous chord attack |
| 21 | Same-root major/minor middle-tone contrast | chord-quality hearing and spacing |
| 22 | Transfer the visible shape by a fifth | chord-by-ear, anchor matching, shape transfer |
| 23-24 | Transfer nearby shapes, then change the middle tone | independent chord hearing, major/minor contrast, simultaneous attack |

Routing rules:

Lesson 14's G-to-D shift drills use two independent entry gates in order: G
Major first, then D Major. Passing one position never substitutes for proving
the other before the shift begins.

1. `coreProblems` are valid reasons to assign the lesson directly.
2. `supportingProblems` describe useful reinforcement but rank behind a core
   intervention.
3. Every allowed remediation problem must be core to at least one lesson.
4. The four `drillPurposes` must describe the displayed slots in exact order.
5. Curriculum audits must fail if any of these contracts drift.

Remember It uses one short, single-system motif at a time: five or six notes in
the early lessons and no more than eight notes later. The prompt names the
intended hand; paired lessons deliberately alternate right- and left-hand
recall instead of turning one memory drill into an unreadable two-hand piece.

Chord by Ear is physical-piano work. Each ear drill declares an authored,
visible `referencePitches` chord and an intentionally related hidden target.
Lessons 19-20 always begin from visible C major and move to familiar major
chords (G, F, E, then A). Only after those shapes are secure does the sequence
add major/minor contrast, fifth transfers, B-flat, and the deeper B/F-sharp
positions. The reference stays visible while the learner searches; there is
no on-screen keyboard and no Prove-It or numeric report.
