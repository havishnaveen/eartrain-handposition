"""Independent music21 review of the fixed curriculum's pitch/interval load.

This is an optional maintainer audit: it needs `music21`, while the deployed
React app does not. The always-on JS audit separately enforces the exact 96
difficulty rungs so production builds never depend on Python.
"""

from __future__ import annotations

import json
import statistics
import subprocess
from pathlib import Path

from music21 import interval, pitch


ROOT = Path(__file__).resolve().parents[1]
payload = subprocess.run(
    ["node", "scripts/export-curriculum-for-music21.mjs"],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
)
rows = json.loads(payload.stdout)

last_rung = -1.0
for row in rows:
    rung = float(row["difficulty"])
    if rung <= last_rung:
        raise AssertionError(
            f"Difficulty reversed at lesson {row['lesson']}, drill {row['drill']}: "
            f"{rung:.3f} <= {last_rung:.3f}"
        )
    last_rung = rung

    notes = [pitch.Pitch(name) for name in row["pitches"]]
    semitone_steps = [
        abs(interval.Interval(notes[index - 1], notes[index]).semitones)
        for index in range(1, len(notes))
    ]
    row["pitchSpan"] = max((note.midi for note in notes), default=0) - min(
        (note.midi for note in notes), default=0
    )
    row["meanInterval"] = statistics.fmean(semitone_steps) if semitone_steps else 0

single_hand_rows = [
    row for row in rows
    if row["mode"] != "anchor-shift" and row["handScope"] != "both"
]
if any(row["pitchSpan"] > 24 for row in single_hand_rows):
    raise AssertionError("A non-shift drill spans more than two octaves.")

by_lesson = {
    lesson: [row for row in rows if row["lesson"] == lesson]
    for lesson in range(1, 25)
}

# Independent musical-load guardrails. These inspect the generated score,
# not its declared difficulty number, so changing the label cannot hide a
# real curriculum regression.
if any(row["staffCount"] != 1 for lesson in range(1, 4) for row in by_lesson[lesson]):
    raise AssertionError("Lessons 1-3 must establish one hand/clef at a time.")
if not any(row["staffCount"] == 2 for row in by_lesson[4]):
    raise AssertionError("Lesson 4 must introduce supported grand-staff reading.")

for lesson in range(1, 6):
    if any("16" in duration for row in by_lesson[lesson] for duration in row["durations"]):
        raise AssertionError(f"Lesson {lesson} introduced sixteenths before pulse was stable.")
for lesson in range(13, 19):
    if any("16" in duration for row in by_lesson[lesson] for duration in row["durations"]):
        raise AssertionError(
            f"Lesson {lesson} combined sixteenths with a new movement/deep-key demand."
        )

for lesson in range(1, 17):
    memory = [row for row in by_lesson[lesson] if row["mode"] == "blind-memory"]
    expected = 1 if lesson in {*range(2, 17)} - {3} else 0
    if len(memory) != expected:
        raise AssertionError(f"Lesson {lesson} has {len(memory)} memory drills; expected {expected}.")
    for row in memory:
        note_count = len(row["pitches"])
        if lesson < 9 and not 8 <= note_count <= 9:
            raise AssertionError(f"Lesson {lesson} memory is not an 8-9 note introductory chunk.")
        if lesson >= 9 and not 10 <= note_count <= 12:
            raise AssertionError(f"Lesson {lesson} memory is not a 10-12 note developed chunk.")
        expected_preview = 15 if note_count >= 10 else 10
        if row["memoryPreviewSeconds"] != expected_preview:
            raise AssertionError(f"Lesson {lesson} memory preview does not match its note load.")

# Every post-Lesson-15 written standard includes a real simultaneous chord.
for lesson in range(16, 25):
    for row in (entry for entry in by_lesson[lesson] if entry["mode"] == "standard"):
        if row["chordEvents"] < 1:
            raise AssertionError(f"Lesson {lesson} standard reading lost its chord event.")

# B/F-sharp are an orientation bridge, not a surprise Grade-8-style reading
# jump: one hand, five sounded events, one closing triad, then a 3-note proof.
for row in by_lesson[17]:
    if row["mode"] == "standard":
        if row["handScope"] == "both" or row["soundedEvents"] != 5 or row["chordEvents"] != 1:
            raise AssertionError("Lesson 17 written bridge is no longer compact and one-handed.")
    elif row["proofNotes"] != 3:
        raise AssertionError("Lesson 17 proof must stay a three-anchor check.")

shift_previews = [
    row["shiftPreviewSeconds"]
    for lesson in range(13, 19)
    for row in by_lesson[lesson]
    if row["shiftPreviewSeconds"] is not None
]
if shift_previews != [5, 5, 3.5, 3.5, 2, 2]:
    raise AssertionError(f"Timed-shift preview staircase regressed: {shift_previews}")

spatial = [row for row in rows if row["mode"] == "spatial-chord"]
if any(row["spatialLayers"] != [] or row["spatialProgressionLength"] != 1 for row in spatial):
    raise AssertionError("Chord by ear must remain target-only: blocked chord, then broken notes.")
if any(row["spatialQuality"] != "major" for row in spatial if row["lesson"] < 21):
    raise AssertionError("Minor quality appeared before Lesson 21's middle-tone contrast.")
if any(row["spatialRootSupport"] != "shown" for row in spatial if row["lesson"] < 22):
    raise AssertionError("Unshown anchor appeared before Lesson 22.")
if any(row["spatialRootSupport"] != "matched" for row in spatial if row["lesson"] >= 22):
    raise AssertionError("Independent anchor matching did not begin at Lesson 22.")

print(
    "music21 curriculum audit passed: "
    f"{len(rows)} fixed drills, strictly rising declared difficulty, "
    f"independent score-load guardrails passed, max single-hand span "
    f"{max(row['pitchSpan'] for row in single_hand_rows)} semitones."
)
