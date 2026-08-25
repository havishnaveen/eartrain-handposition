import type {
  AnchorShiftSpec,
  CueSpec,
  ExerciseMode,
  Question,
  SpatialChordSpec,
} from '../curriculum/types';

/**
 * Timing and grading. All pure — no audio, no React — so the beat maths and
 * the matcher can be tested without a browser.
 */

export const DEFAULT_BPM = 75;

/** Beats per written duration. 'r' suffix marks a rest and times the same. */
const DURATION_BEATS: Record<string, number> = {
  w: 4,
  h: 2,
  q: 1,
  '8': 0.5,
  '16': 0.25,
};

export function beatsForDuration(duration: string): number {
  const base = duration.replace(/r$/, '').replace(/d$/, '');
  const beats = DURATION_BEATS[base] ?? 1;
  return duration.endsWith('d') ? beats * 1.5 : beats;
}

export interface PlannedNote {
  /** Index into the cue's note array. */
  cueIndex: number;
  /** Beat offset from the downbeat. */
  beat: number;
  beats: number;
  isRest: boolean;
  /** Scientific pitch, or null for a rest. */
  pitch: string | null;
}

export interface ExpectedNoteSlot {
  /** Scientific pitch expected from the student. */
  pitch: string;
  /** Written onset, measured from the drill downbeat. */
  beat: number;
  /** Written length. Guide-note runs use one beat per played note. */
  beats: number;
}

export interface DrillPlan {
  bpm: number;
  secondsPerBeat: number;
  /** Beats in a bar — drives the count-in length and the beat display. */
  beatsPerBar: number;
  notes: PlannedNote[];
  /** Every played note, including notes implied by a guide-note cue. */
  expectedNotes: ExpectedNoteSlot[];
  /** Elapsed timeline beats, including any silent timed-shift window. */
  totalBeats: number;
  /** Grace beats after the last note before the recorder stops. */
  tailBeats: number;
  /** Total seconds the microphone stays open. */
  recordSeconds: number;
  /** Two full measures of count-in labels, e.g. 1–4 followed by 1–4. */
  countInLabels: string[];
  countInSeconds: number;
  /** Exact silent hand-movement window on the shared audio timeline. */
  timedShift?: {
    splitIndex: number;
    waitSeconds: number;
    waitBeats: number;
    startBeat: number;
    endBeat: number;
  };
  /**
   * True when the notation shows fewer notes than the student plays — the
   * guide-note drills, where one written note names a position and the
   * student runs all five fingers off it.
   *
   * The scrubber is meaningless there: there is no second notehead to travel
   * to, and sweeping a line across one whole note would read as "hold this
   * for five beats". The metronome still runs; the line stays hidden.
   */
  guideNote: boolean;
}

function parseBeatsPerBar(timeSignature?: string): number {
  if (!timeSignature) return 4;
  const top = Number(timeSignature.split('/')[0]);
  return Number.isFinite(top) && top > 0 ? top : 4;
}

/**
 * Build the timing plan for a question.
 *
 * The recorder stops on its own once this elapses. Waiting indefinitely
 * would let a student noodle until they stumbled onto the right notes,
 * which is not sight-reading.
 */
export function planFor(
  cue: CueSpec,
  expectedSequence: string[],
  bpm: number = DEFAULT_BPM,
): DrillPlan {
  const secondsPerBeat = 60 / bpm;
  const beatsPerBar = parseBeatsPerBar(cue.timeSignature);

  // Merge every staff onto one shared timeline, in beat order. The
  // overwhelming majority of exercises have exactly one staff, so this
  // reduces to the original single-staff walk. A genuine two-hand grand
  // staff (see progressiveCurriculum.ts) is built so that at any one beat
  // exactly one staff carries a sounded event and the other rests. A sounded
  // event may contain several noteheads; each becomes an expected slot on the
  // same beat so the polyphonic detector can verify the stack concurrently.
  interface RawEntry {
    beat: number;
    beats: number;
    isRest: boolean;
    staffIndex: number;
    soundedCount: number;
  }
  const raw: RawEntry[] = [];
  cue.staves.forEach((staff, staffIndex) => {
    let staffBeat = 0;
    staff.notes.forEach((note) => {
      const isRest = note.duration.endsWith('r');
      const beats = beatsForDuration(note.duration);
      raw.push({
        beat: staffBeat,
        beats,
        isRest,
        staffIndex,
        soundedCount: isRest ? 0 : Math.max(1, note.keys.length),
      });
      staffBeat += beats;
    });
  });
  raw.sort((a, b) => a.beat - b.beat || a.staffIndex - b.staffIndex);

  const notes: PlannedNote[] = [];
  let beat = 0;
  let pitchIndex = 0;

  raw.forEach((entry, cueIndex) => {
    notes.push({
      cueIndex,
      beat: entry.beat,
      beats: entry.beats,
      isRest: entry.isRest,
      pitch: entry.isRest ? null : (expectedSequence[pitchIndex] ?? null),
    });
    if (!entry.isRest) pitchIndex += entry.soundedCount;
    beat = Math.max(beat, entry.beat + entry.beats);
  });

  // A guide-note cue shows one note but is played as a five-note run, so the
  // window must cover every note played, not every note drawn.
  const writtenPitchSlots = raw.reduce((sum, entry) => sum + entry.soundedCount, 0);
  const guideNote = writtenPitchSlots < expectedSequence.length;
  const written = guideNote ? Math.max(beat, expectedSequence.length) : beat;
  const writtenSlots = raw.flatMap((entry) =>
    Array.from({ length: entry.soundedCount }, () => ({
      beat: entry.beat,
      beats: entry.beats,
    })),
  );
  const expectedNotes: ExpectedNoteSlot[] = expectedSequence.map((pitch, index) => {
    const writtenNote = writtenSlots[index];
    return {
      pitch,
      beat: guideNote ? index : (writtenNote?.beat ?? index),
      beats: guideNote ? 1 : (writtenNote?.beats ?? 1),
    };
  });

  const tailBeats = 1;
  const countInLabels = Array.from(
    { length: beatsPerBar * 2 },
    (_, i) => String((i % beatsPerBar) + 1),
  );

  return {
    bpm,
    secondsPerBeat,
    beatsPerBar,
    notes,
    expectedNotes,
    totalBeats: written,
    tailBeats,
    recordSeconds: (written + tailBeats) * secondsPerBeat,
    countInLabels,
    countInSeconds: beatsPerBar * 2 * secondsPerBeat,
    guideNote,
  };
}

/** Metronome beat positions, with the musical grid silent during a hand move. */
export function metronomeBeatPositions(plan: DrillPlan): number[] {
  const waitBeats = plan.timedShift?.waitBeats ?? 0;
  const writtenPlayBeats = Math.ceil(plan.totalBeats - waitBeats);
  return Array.from({ length: writtenPlayBeats }, (_, writtenBeat) => (
    plan.timedShift && writtenBeat >= plan.timedShift.startBeat
      ? writtenBeat + waitBeats
      : writtenBeat
  ));
}

/* ---------------------------------------------------------------------------
   Pitch helpers
   --------------------------------------------------------------------------- */

const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Bb4" -> 70. Enharmonics collapse, so Bb4 and A#4 both grade as 70. */
export function pitchToMidi(pitch: string): number | null {
  const match = /^([A-G])([#b]*)(-?\d+)$/.exec(pitch.trim());
  if (!match) return null;
  const [, letter, accidentals, octave] = match;
  let semitone = LETTER_SEMITONE[letter];
  for (const ch of accidentals) semitone += ch === '#' ? 1 : -1;
  return (Number(octave) + 1) * 12 + semitone;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function midiToName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/* ---------------------------------------------------------------------------
   Grading

   The governing idea: be tolerant of NOISE, strict about NOTES.

   An acoustic piano in a real room produces onsets the student did not
   intend — a key bouncing under a heavy hand, a string ringing sympathetically
   with the one just struck, a damper thump. Failing a correct performance for
   any of those would be worse than useless; the student would learn that the
   app is arbitrary.

   But a wrong note is a wrong note. This app exists to prove the hand landed
   in the right place, so extras are CLASSIFIED rather than counted, and only
   the benign classes are forgiven freely.
   --------------------------------------------------------------------------- */

export interface DetectedNote {
  midi: number;
  /** AudioContext time of the onset. */
  time: number;
  /** YIN confidence, 0–1. */
  clarity: number;
  /** Onset salience relative to the room's own flux threshold. */
  strength: number;
  /**
   * How much the room was already ringing when this note was struck,
   * relative to its noise floor. Near 1 in a damped room; well above it
   * with the sustain pedal down.
   */
  sustain?: number;
  /** Worklet-local identity used to attach a later acoustic release event. */
  detectorId?: number;
  /** AudioContext time when a confident damper/key-release decay was heard. */
  endTime?: number;
  /** Confidence of the acoustic release estimate, 0–1. */
  durationConfidence?: number;
  /**
   * Written slot claimed by the live, score-aware detector. This is evidence
   * provenance. Final PCM may refine the event, but cannot silently remove an
   * exact slot that already cleared live pitch, attack, voice, and harmonic checks.
   */
  expectedSlot?: number;
  /** Strict physical onset or a deliberately provisional score recovery. */
  detectorLane?: 'strict' | 'context-recovery' | 'offline-recovered';
  /** True only when the hook matched this event to the exact written pitch. */
  scoreContextAccepted?: boolean;
  /** DSP evidence retained so post-take reconciliation can be auditable. */
  pianoAttackConfidence?: number;
  consensus?: number;
  pitchMad?: number;
  peakRms?: number;
  gate?: number;
  frameAttackRatio?: number;
  novelty?: number;
  voiceVeto?: boolean;
  voiceBurst?: boolean;
  harmonicShadow?: boolean;
  harmonicIndependentAttack?: boolean;
  analysisSource?: string;
  analysisConfidence?: number;
}

export type ExtraKind = 'repeat' | 'resonance' | 'faint' | 'hesitation' | 'wrong';

export interface ExtraNote {
  midi: number;
  name: string;
  time: number;
  kind: ExtraKind;
}

export interface RhythmReport {
  /** Matched notes whose onset landed inside the lesson's timing window. */
  onBeat: number;
  evaluated: number;
  /** 0–1 onset accuracy. */
  accuracy: number;
  /** Combined onset and between-note timing error, in beats. */
  meanAbsBeats: number;
  /** Mean absolute distance from the written onset, after tiny start grace. */
  meanOnsetErrorBeats: number;
  /** Mean error in the rhythmic gaps between successive matched notes. */
  meanIntervalErrorBeats: number;
  /** Number of written note lengths supported by a credible acoustic release. */
  durationEvaluated: number;
  /** Durations measured from an actual acoustic release rather than attack spacing. */
  releaseEvaluated: number;
  /** Continuous 0–1 duration score for those confirmed note lengths. */
  durationAccuracy: number | null;
  /** Mean absolute duration error in beats; null without credible release evidence. */
  meanDurationErrorBeats: number | null;
}

/**
 * Three independent axes, each 0-5, plus a combined score.
 *
 * They are kept separate because they fail for different reasons and call
 * for different teaching. A student can have perfect pitch accuracy and poor
 * timing (reads well, plays nervously), or clean timing and wrong notes
 * (confident but mis-placed hand) — one blended number hides exactly the
 * distinction an instructor needs.
 */
export interface ScoreBreakdown {
  /** Did the right notes come out, in order? The core skill. */
  pitch: number;
  /** Did they land on the beat? null for untimed drills. */
  timing: number | null;
  /** Was the performance free of wrong and stray notes? */
  cleanliness: number;
  /** Weighted combination, 0-5. */
  overall: number;
}

export interface GradeResult {
  scores: ScoreBreakdown;
  passed: boolean;
  matched: number;
  expectedCount: number;
  missed: number;
  /** Forgiven: double-strikes, sympathetic ringing, faint transients. */
  benignExtras: number;
  /** Of the benign extras, how many were echoes of an already-matched note. */
  echoExtras: number;
  /** True when the performance looks pedalled. Useful telemetry for teachers. */
  pedalled: boolean;
  /** Wrong note played then immediately corrected. Partly forgiven. */
  hesitations: number;
  /** Uncorrected wrong notes. Barely forgiven. */
  hardExtras: number;
  extras: ExtraNote[];
  firstMissIndex: number;
  playedNames: string[];
  rhythm: RhythmReport | null;
  transition: TransitionReport | null;
  spatialChord: SpatialChordReport | null;
  detail: string;
}

export interface SpatialChordPerformance {
  startedAt: number;
  rootFoundAt: number | null;
  completedAt: number | null;
  rootFound: boolean;
  /** Unique target tones heard, stored as MIDI so enharmonics compare safely. */
  foundMidi: number[];
  /** Exact lock times for anchor, outer fifth, and middle third. */
  toneFoundAt?: { midi: number; time: number }[];
  wrongRootGuesses: number;
  wrongShapeGuesses: number;
  totalGuesses: number;
  timedOut: boolean;
}

export interface SpatialChordReport {
  rootSupport: SpatialChordSpec['rootSupport'];
  rootFound: boolean;
  completed: boolean;
  foundTones: number;
  totalTones: number;
  rootLatencySec: number | null;
  buildLatencySec: number | null;
  /** Anchor-to-fifth time: the main spatial reach. */
  shellLatencySec: number | null;
  /** Fifth-to-third time: placing the quality-defining middle tone. */
  colorToneLatencySec: number | null;
  wrongRootGuesses: number;
  wrongShapeGuesses: number;
  totalGuesses: number;
  efficiencyScore: number;
  timedOut: boolean;
}

export interface TransitionReport {
  measured: boolean;
  /** Onset-to-onset gap across the position boundary. */
  transitionSeconds: number | null;
  transitionBeats: number | null;
  /** Written onset gap before any extra hand-travel delay. */
  writtenGapBeats: number;
  excessBeats: number | null;
  allowedExtraBeats: number;
  score: number;
  onTime: boolean;
}

export interface GradeOptions {
  /** Timing plan, for rhythm scoring. */
  plan?: DrillPlan;
  /** AudioContext time of the downbeat. */
  playStartTime?: number;
  /** Octave errors fail by default — position IS the octave here. */
  ignoreOctave?: boolean;
  /** Override the derived allowances. */
  allowedMisses?: number;
  allowedHesitations?: number;
  allowedHardExtras?: number;
  /**
   * One-based lesson number. Timing tolerance starts deliberately broad for
   * a new reader, then tightens smoothly as their reading becomes fluent.
   */
  lessonLevel?: number;
  /** Size of the pathway. Defaults to 20 so this also works outside the app. */
  totalLessons?: number;
  /** Enables boundary-specific movement grading for Anchor & Shift drills. */
  anchorShift?: AnchorShiftSpec;
  /** Enables search-efficiency grading instead of metronomic rhythm grading. */
  spatialChord?: SpatialChordSpec;
  spatialPerformance?: SpatialChordPerformance;
  /** Memory drills keep pitch strict but receive wider rhythm tolerance. */
  exerciseMode?: ExerciseMode;
}

export interface TimingLeniencyProfile {
  /** Error counted as "on beat", in beats. */
  onBeatWindow: number;
  /** Amount of a consistent late/early start that is forgiven, in beats. */
  startOffsetAllowance: number;
  /** Detector/human variation inside this window receives full onset credit. */
  fullCreditOnsetWindow: number;
  /** Release estimates inside this window receive full duration credit. */
  fullCreditDurationWindow: number;
  /** Mean error at which the timing score reaches zero, in beats. */
  zeroScoreWindow: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const mix = (early: number, late: number, progress: number): number =>
  early + (late - early) * progress;

/**
 * Continuous lesson-aware timing tolerance.
 *
 * Smoothstep avoids a difficulty cliff between adjacent lessons. Early
 * lessons retain a broad beginner window; later lessons still distinguish a
 * clearly displaced beat without punishing normal human timing variation.
 */
export function timingLeniencyForLesson(
  lessonLevel = 1,
  totalLessons = 20,
): TimingLeniencyProfile {
  const safeTotal = Math.max(2, Math.round(totalLessons));
  const linear = clamp01((Math.max(1, lessonLevel) - 1) / (safeTotal - 1));
  const progress = linear * linear * (3 - 2 * linear);
  return {
    onBeatWindow: mix(0.65, 0.42, progress),
    // Speaker-to-microphone and browser input latency shifts an otherwise
    // steady phrase as a block. Grade the intervals, not that fixed hardware
    // delay; a non-uniform or genuinely late rhythm still survives below.
    startOffsetAllowance: mix(0.90, 0.65, progress),
    // A continuous curve with no plateau penalised even a dead-centre take:
    // ordinary microphone/onset uncertainty turned 5.0 into 4.6. Preserve a
    // small, lesson-aware full-credit region, then grade the residual error.
    fullCreditOnsetWindow: mix(0.24, 0.17, progress),
    fullCreditDurationWindow: mix(0.38, 0.25, progress),
    zeroScoreWindow: mix(1.80, 1.20, progress),
  };
}

function timingProfileForOptions(options: GradeOptions): TimingLeniencyProfile {
  const profile = timingLeniencyForLesson(options.lessonLevel, options.totalLessons);
  if (options.exerciseMode !== 'blind-memory') return profile;
  return {
    onBeatWindow: Math.min(0.9, profile.onBeatWindow * 1.4),
    startOffsetAllowance: Math.min(1.2, profile.startOffsetAllowance * 1.3),
    fullCreditOnsetWindow: profile.fullCreditOnsetWindow * 1.55,
    fullCreditDurationWindow: profile.fullCreditDurationWindow * 1.4,
    zeroScoreWindow: profile.zeroScoreWindow * 1.25,
  };
}

/** Intervals above a ringing note that a piano produces on its own. */
const RESONANCE_INTERVALS = [12, 19, 24, 7, 28];
/**
 * Octave-BELOW duplicates of a note already matched.
 *
 * These are a detector artefact, not a resonance: as a note decays its
 * fundamental weakens and a late frame can land an octave low. Forgiving
 * them cannot mask a student playing the whole position an octave down,
 * because that is only reached relative to a note ALREADY matched — and in a
 * genuine wrong-octave performance the correct note never appears at all.
 */
const SUBOCTAVE_ARTIFACTS = [-12, -24];
/** How recently a note must have sounded to explain a resonance. */
const RESONANCE_WINDOW_SEC = 2.2;
/**
 * A retrigger of the same pitch within this window is an echo, not a note.
 *
 * Echoes CHAIN: a decaying string can be re-detected several times, each
 * within a short gap of the previous detection rather than of the original
 * strike. The window is measured from the most recent occurrence, so a run
 * of re-detections stays forgiven while a genuinely re-struck note much
 * later does not.
 */
const REPEAT_WINDOW_SEC = 0.75;
/**
 * Echo window with the sustain pedal down.
 *
 * Undamped strings ring for seconds rather than fractions of one, so
 * re-detections of a note already matched arrive much later. Widening this
 * only for pedalled playing keeps dry grading as strict as it was.
 */
const REPEAT_WINDOW_PEDAL_SEC = 1.4;
/** Median onset sustain above which the pedal is assumed to be down. */
const PEDAL_SUSTAIN_THRESHOLD = 4;
/** Onsets this weak relative to the performance are room artefacts. */
const FAINT_RATIO = 0.5;
/** Below this confidence, an unmatched event is detector debris—not proof of a wrong key. */
const HARD_EXTRA_MIN_CLARITY = 0.62;
/** A room-dependent release estimate must be credible before it can affect a grade. */
const MIN_GRADED_RELEASE_CONFIDENCE = 0.72;

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Tolerances scale with phrase length.
 *
 * A stray note in a nine-note phrase is a slip. The same stray note in a
 * four-note phrase is a quarter of the exercise, so short drills are graded
 * harder — there is nowhere for an error to hide.
 */
function allowancesFor(expectedCount: number) {
  return {
    // A single missed onset is a local error, not a failed performance. Two
    // are tolerated only in longer phrases where they remain a minority.
    misses: expectedCount >= 10 ? 2 : expectedCount >= 4 ? 1 : 0,
    // Wrong note, immediately corrected: the student found the position.
    hesitations: expectedCount >= 6 ? 2 : 1,
    // Wrong note, NOT corrected. This is the one that must stay strict.
    hardExtras: expectedCount >= 6 ? 1 : 0,
  };
}

type AlignmentOperation =
  | { kind: 'match'; expectedIndex: number; detectedIndex: number }
  | { kind: 'miss'; expectedIndex: number }
  | { kind: 'extra'; detectedIndex: number };

interface AlignmentCell {
  /** Insertions + deletions needed from this point onward. */
  edits: number;
  /** Used only to choose between equally accurate repeated-note alignments. */
  timingError: number;
  operation: AlignmentOperation['kind'] | null;
}

/**
 * Globally align expected and detected pitches.
 *
 * The previous one-note greedy lookahead cascaded after a miss: once its
 * cursor was one pitch behind, every later correct note became an "extra".
 * This is a minimum-edit alignment (insertions and deletions, exact pitch
 * matches only), so a local miss stays local. When repeated pitches create
 * multiple equally accurate alignments, written-beat timing is a tie-breaker
 * rather than a grading input; it can never buy or remove a pitch match.
 */
function alignSequences(
  expectedMidi: number[],
  detected: DetectedNote[],
  norm: (midi: number) => number,
  options: GradeOptions,
): AlignmentOperation[] {
  const expectedCount = expectedMidi.length;
  const detectedCount = detected.length;
  const pitchedPlan = options.plan?.notes.filter((note) => !note.isRest) ?? [];

  const timingTieBreak = (expectedIndex: number, detectedIndex: number): number => {
    const { plan, playStartTime } = options;
    if (!plan || playStartTime === undefined) return 0;
    const beat = pitchedPlan[expectedIndex]?.beat ?? expectedIndex;
    const expectedTime = playStartTime + beat * plan.secondsPerBeat;
    return Math.abs(detected[detectedIndex].time - expectedTime);
  };

  const table: AlignmentCell[][] = Array.from(
    { length: expectedCount + 1 },
    () => Array.from({ length: detectedCount + 1 }, () => ({
      edits: Number.POSITIVE_INFINITY,
      timingError: Number.POSITIVE_INFINITY,
      operation: null,
    })),
  );
  table[expectedCount][detectedCount] = { edits: 0, timingError: 0, operation: null };

  const priority: Record<AlignmentOperation['kind'], number> = {
    match: 0,
    miss: 1,
    extra: 2,
  };

  for (let expectedIndex = expectedCount; expectedIndex >= 0; expectedIndex--) {
    for (let detectedIndex = detectedCount; detectedIndex >= 0; detectedIndex--) {
      if (expectedIndex === expectedCount && detectedIndex === detectedCount) continue;

      const candidates: AlignmentCell[] = [];
      if (
        expectedIndex < expectedCount &&
        detectedIndex < detectedCount &&
        expectedMidi[expectedIndex] === norm(detected[detectedIndex].midi)
      ) {
        const next = table[expectedIndex + 1][detectedIndex + 1];
        candidates.push({
          edits: next.edits,
          timingError: next.timingError + timingTieBreak(expectedIndex, detectedIndex),
          operation: 'match',
        });
      }
      if (expectedIndex < expectedCount) {
        const next = table[expectedIndex + 1][detectedIndex];
        candidates.push({
          edits: next.edits + 1,
          timingError: next.timingError,
          operation: 'miss',
        });
      }
      if (detectedIndex < detectedCount) {
        const next = table[expectedIndex][detectedIndex + 1];
        candidates.push({
          edits: next.edits + 1,
          timingError: next.timingError,
          operation: 'extra',
        });
      }

      candidates.sort((a, b) =>
        a.edits - b.edits ||
        a.timingError - b.timingError ||
        priority[a.operation ?? 'extra'] - priority[b.operation ?? 'extra'],
      );
      table[expectedIndex][detectedIndex] = candidates[0];
    }
  }

  const operations: AlignmentOperation[] = [];
  let expectedIndex = 0;
  let detectedIndex = 0;
  while (expectedIndex < expectedCount || detectedIndex < detectedCount) {
    const operation = table[expectedIndex][detectedIndex].operation;
    if (operation === 'match') {
      operations.push({ kind: 'match', expectedIndex, detectedIndex });
      expectedIndex += 1;
      detectedIndex += 1;
    } else if (operation === 'miss') {
      operations.push({ kind: 'miss', expectedIndex });
      expectedIndex += 1;
    } else {
      operations.push({ kind: 'extra', detectedIndex });
      detectedIndex += 1;
    }
  }
  return operations;
}

function buildRhythm(
  matches: { expectedIndex: number; time: number; note: DetectedNote }[],
  options: GradeOptions,
): RhythmReport | null {
  const { plan, playStartTime } = options;
  if (!plan || playStartTime === undefined || matches.length === 0) return null;

  // `expectedNotes` is the authoritative played timeline. Using the drawn
  // notes here breaks guide-note drills and can shift every later onset after
  // a rest or a compact cue representation.
  const expectedSlots = plan.expectedNotes;
  const deviations: number[] = [];

  matches.forEach(({ expectedIndex, time }) => {
    // Guide-note cues draw fewer notes than are played; those fall back to
    // one note per beat, which is how they are counted in anyway.
    const beat = expectedSlots[expectedIndex]?.beat ?? expectedIndex;
    const expectedTime = playStartTime + beat * plan.secondsPerBeat;
    deviations.push((time - expectedTime) / plan.secondsPerBeat);
  });

  const profile = timingProfileForOptions(options);

  // A student who enters a fraction late but keeps the whole phrase steady
  // has a starting/reaction error, not a broken rhythm. Remove only the
  // lesson-appropriate part of the median offset; any excess still counts.
  const sorted = [...deviations].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const medianDeviation =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  const forgivenOffset = Math.max(
    -profile.startOffsetAllowance,
    Math.min(profile.startOffsetAllowance, medianDeviation),
  );
  const adjusted = deviations.map((deviation) => deviation - forgivenOffset);

  // Absolute onsets catch playing the whole phrase late or early. Duration is
  // considered separately and only when the worklet hears a credible acoustic
  // damping edge; adjacent attacks cannot prove that the prior key was lifted.
  const intervalErrors: number[] = [];
  const releaseErrors: { error: number; weight: number }[] = [];
  for (const match of matches) {
    const planned = expectedSlots[match.expectedIndex];
    const endTime = match.note.endTime;
    const confidence = match.note.durationConfidence ?? 0;
    if (
      !planned ||
      !Number.isFinite(endTime) ||
      (endTime as number) <= match.time ||
      confidence < MIN_GRADED_RELEASE_CONFIDENCE
    ) continue;
    const playedHoldBeats = ((endTime as number) - match.time) / plan.secondsPerBeat;
    releaseErrors.push({
      error: Math.abs(playedHoldBeats - planned.beats),
      // A marginal acoustic damper estimate should not outweigh several
      // precisely placed hammer attacks. Confidence-squared gives clear
      // releases authority while gracefully discounting room-dependent ones.
      weight: Math.max(0.16, confidence * confidence),
    });
  }

  for (let index = 1; index < matches.length; index++) {
    const previous = matches[index - 1];
    const current = matches[index];
    // If an attack was missed by the detector, do not invent a duration
    // failure across the hole. Pitch coverage already records the miss; only
    // adjacent, positively identified notes can bound a reliable duration.
    if (current.expectedIndex !== previous.expectedIndex + 1) continue;
    const previousBeat = expectedSlots[previous.expectedIndex]?.beat ?? previous.expectedIndex;
    const currentBeat = expectedSlots[current.expectedIndex]?.beat ?? current.expectedIndex;
    const expectedGap = currentBeat - previousBeat;
    if (expectedGap <= 0) continue;
    const playedGap = (current.time - previous.time) / plan.secondsPerBeat;
    const intervalError = Math.abs(playedGap - expectedGap);
    intervalErrors.push(intervalError);
  }

  // Adjacent attacks already contribute to interval timing above. Treating
  // that same gap as a guessed key duration penalised one timing variation
  // twice and claimed to know when a finger lifted. Only an independently
  // credible acoustic release is allowed to grade written note length.
  const durationErrors = releaseErrors;

  const meanOnsetError =
    adjusted.reduce((sum, deviation) => sum + Math.abs(deviation), 0) / adjusted.length;
  const meanIntervalError = intervalErrors.length === 0
    ? 0
    : intervalErrors.reduce((sum, error) => sum + error, 0) / intervalErrors.length;
  const durationZeroWindow = profile.zeroScoreWindow * 0.85;
  const durationScoringRange = Math.max(
    0.01,
    durationZeroWindow - profile.fullCreditDurationWindow,
  );
  const durationAccuracy = durationErrors.length === 0
    ? null
    : durationErrors.reduce(
        (sum, sample) => sum + Math.max(
          0,
          1 - Math.max(0, sample.error - profile.fullCreditDurationWindow) / durationScoringRange,
        ) * sample.weight,
        0,
      ) / durationErrors.reduce((sum, sample) => sum + sample.weight, 0);
  const meanDurationError = durationErrors.length === 0
    ? 0
    : durationErrors.reduce((sum, sample) => sum + sample.error * sample.weight, 0) /
      durationErrors.reduce((sum, sample) => sum + sample.weight, 0);
  // Relative spacing is the central musical fact once a take has been
  // aligned to its downbeat. Blend it with absolute onset residuals so fixed
  // browser/speaker/microphone latency cannot turn expert rhythm into 3/5.
  const attackTimingError = intervalErrors.length === 0
    ? meanOnsetError
    : meanOnsetError * 0.42 + meanIntervalError * 0.58;
  const combinedError = durationAccuracy === null
    ? attackTimingError
    : attackTimingError * 0.85 + meanDurationError * 0.15;

  const onBeat = adjusted.filter(
    (deviation) => Math.abs(deviation) <= profile.onBeatWindow,
  ).length;
  return {
    onBeat,
    evaluated: adjusted.length,
    accuracy: adjusted.length === 0 ? 0 : onBeat / adjusted.length,
    meanAbsBeats: Math.round(combinedError * 100) / 100,
    meanOnsetErrorBeats: Math.round(meanOnsetError * 100) / 100,
    meanIntervalErrorBeats: Math.round(meanIntervalError * 100) / 100,
    durationEvaluated: releaseErrors.length,
    releaseEvaluated: releaseErrors.length,
    durationAccuracy: durationAccuracy === null
      ? null
      : Math.round(durationAccuracy * 1000) / 1000,
    meanDurationErrorBeats: durationErrors.length === 0
      ? null
      : Math.round(meanDurationError * 100) / 100,
  };
}

function buildTransition(
  matches: { expectedIndex: number; time: number }[],
  options: GradeOptions,
): TransitionReport | null {
  const { anchorShift, plan } = options;
  if (!anchorShift || !plan) return null;

  const pitched = plan.notes.filter((note) => !note.isRest);
  const split = Math.min(
    Math.max(1, anchorShift.splitIndex),
    Math.max(1, pitched.length - 1),
  );
  const fromPlan = pitched[split - 1];
  const toPlan = pitched[split];
  const writtenGapBeats = Math.max(
    0.01,
    (toPlan?.beat ?? split) - (fromPlan?.beat ?? split - 1),
  );
  const lastFrom = matches.find((match) => match.expectedIndex === split - 1);
  const firstTo = matches.find((match) => match.expectedIndex === split);
  const allowedExtraBeats = Math.max(0.1, anchorShift.allowedExtraBeats);

  if (!lastFrom || !firstTo || firstTo.time < lastFrom.time) {
    return {
      measured: false,
      transitionSeconds: null,
      transitionBeats: null,
      writtenGapBeats,
      excessBeats: null,
      allowedExtraBeats,
      score: 0,
      onTime: false,
    };
  }

  const transitionSeconds = firstTo.time - lastFrom.time;
  const transitionBeats = transitionSeconds / plan.secondsPerBeat;
  const excessBeats = Math.max(0, transitionBeats - writtenGapBeats);
  // A transition is the difference between two independently detected
  // attacks, so its technical uncertainty is twice the single-onset window.
  const profile = timingProfileForOptions(options);
  const fullCreditWindow = Math.max(
    profile.fullCreditOnsetWindow * 2,
    allowedExtraBeats * 0.35,
  );
  const gradedExcessBeats = Math.max(0, excessBeats - fullCreditWindow);
  const score = Math.max(
    0,
    Math.min(5, Math.round(5 * (1 - gradedExcessBeats / allowedExtraBeats) * 10) / 10),
  );

  return {
    measured: true,
    transitionSeconds: Math.round(transitionSeconds * 100) / 100,
    transitionBeats: Math.round(transitionBeats * 100) / 100,
    writtenGapBeats: Math.round(writtenGapBeats * 100) / 100,
    excessBeats: Math.round(excessBeats * 100) / 100,
    allowedExtraBeats,
    score,
    onTime: excessBeats <= 0.25,
  };
}

const scoreToFive = (value: number): number =>
  Math.max(0, Math.min(5, Math.round(value * 10) / 10));

/**
 * The report's displayed Overall score is the single source of truth for
 * progression. A score of exactly 3.0 still retries; anything above it moves
 * on. Keeping this rule exported lets routing defend against a stale or
 * externally supplied `passed` Boolean without inventing a second threshold.
 */
export const RETRY_OVERALL_MAX = 3;

export function passesOverallScore(overall: number): boolean {
  return Number.isFinite(overall) && overall > RETRY_OVERALL_MAX;
}

/**
 * Combine only the scores shown to the learner. Overall must never contain a
 * second, invisible penalty. It starts as a normalized weighted mean and
 * therefore remains between the visible categories. Pitch may cap that mean
 * at half a point above itself so hearing only one easy note can never look
 * like a successful performance; unlike the former coverage multiplier,
 * this ceiling cannot drag Overall below the visible Pitch score.
 */
export function calculateOverallScore(
  pitch: number,
  timing: number | null,
  cleanliness: number,
  weights: { pitch: number; timing: number; cleanliness: number } = {
    pitch: 0.5,
    timing: 0.2,
    cleanliness: 0.3,
  },
): number {
  const categories = [
    { value: pitch, weight: weights.pitch },
    ...(timing === null ? [] : [{ value: timing, weight: weights.timing }]),
    { value: cleanliness, weight: weights.cleanliness },
  ].filter(({ value, weight }) => Number.isFinite(value) && weight > 0);
  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);
  if (totalWeight <= 0) return 0;
  const weightedMean =
    categories.reduce((sum, category) => sum + category.value * category.weight, 0) /
    totalWeight;
  return scoreToFive(Math.min(weightedMean, pitch + 0.5));
}

/**
 * Grade supplied-anchor spatial chord construction.
 *
 * This deliberately does not reuse beat alignment: the musical task is to
 * match a harmonic anchor and complete its physical shape, not to perform a
 * notated rhythm. Shape-building speed becomes Timing, and unnecessary
 * deliberate guesses become Cleanliness. Detector candidates/echoes never enter the
 * performance object, so room noise cannot manufacture a guessing penalty.
 */
export function gradeSpatialChord(
  spec: SpatialChordSpec,
  detected: DetectedNote[],
  performance: SpatialChordPerformance,
): GradeResult {
  const targetMidi = spec.chordPitches
    .map(pitchToMidi)
    .filter((midi): midi is number => midi !== null);
  const found = new Set(performance.foundMidi.filter((midi) => targetMidi.includes(midi)));
  const matched = found.size;
  const expectedCount = targetMidi.length;
  const missed = Math.max(0, expectedCount - matched);
  // Seeing the three pitch classes at some point is not a chord. Spatial
  // completion is issued only after the polyphonic lane confirms that every
  // target is concurrently present for the required hold window.
  const completed = Boolean(
    expectedCount > 0 &&
    matched === expectedCount &&
    performance.completedAt !== null &&
    !performance.timedOut
  );

  const rootLatencySec = performance.rootFoundAt === null
    ? null
    : Math.max(0, performance.rootFoundAt - performance.startedAt);
  const buildLatencySec = performance.rootFoundAt === null
    ? null
    : Math.max(
        0,
        (performance.completedAt ?? detected[detected.length - 1]?.time ?? performance.rootFoundAt) -
          performance.rootFoundAt,
      );

  const foundAtByMidi = new Map(
    (performance.toneFoundAt ?? []).map(({ midi, time }) => [midi, time]),
  );
  const outerMidi = targetMidi[2];
  const colorMidi = targetMidi[1];
  const outerFoundAt = foundAtByMidi.get(outerMidi) ?? performance.completedAt;
  const colorFoundAt = foundAtByMidi.get(colorMidi) ?? performance.completedAt;
  const shellLatencySec = performance.rootFoundAt === null || outerFoundAt == null
    ? null
    : Math.max(0, outerFoundAt - performance.rootFoundAt);
  const colorToneLatencySec = outerFoundAt == null || colorFoundAt == null
    ? null
    : Math.max(0, colorFoundAt - outerFoundAt);

  const rootSpeed = rootLatencySec === null
    ? 0
    : Math.max(0, 1 - rootLatencySec / Math.max(1, spec.rootSearchSeconds));
  const shapeCoverage = Math.max(0, matched - (performance.rootFound ? 1 : 0)) / 2;
  const shellSpeed = shellLatencySec === null
    ? 0
    : Math.max(0, 1 - shellLatencySec / Math.max(1, spec.shapeSearchSeconds * 0.62));
  const colorSpeed = colorToneLatencySec === null
    ? 0
    : Math.max(0, 1 - colorToneLatencySec / Math.max(1, spec.shapeSearchSeconds * 0.48));
  const guessPenalty =
    performance.wrongRootGuesses * 0.12 + performance.wrongShapeGuesses * 0.68;
  const rawEfficiencyScore = scoreToFive(
    // Root matching is readiness, not the main skill. Eighty-five percent of
    // this score belongs to building and retaining the physical chord shape.
    5 * (
      rootSpeed * 0.10 +
      shellSpeed * 0.40 +
      colorSpeed * 0.35 +
      shapeCoverage * 0.15
    ) - guessPenalty,
  );
  const secureCleanShape = Boolean(
    completed &&
    performance.wrongRootGuesses === 0 &&
    performance.wrongShapeGuesses === 0 &&
    rootLatencySec !== null &&
    rootLatencySec <= Math.max(1.5, spec.rootSearchSeconds * 0.6) &&
    shellLatencySec !== null &&
    shellLatencySec <= spec.shapeSearchSeconds * 0.55 &&
    colorToneLatencySec !== null &&
    colorToneLatencySec <= spec.shapeSearchSeconds * 0.5
  );
  const efficiencyScore = secureCleanShape ? 5 : rawEfficiencyScore;
  const pitchScore = scoreToFive(expectedCount === 0 ? 0 : 5 * matched / expectedCount);
  const cleanlinessScore = detected.length === 0
    ? 0
    : scoreToFive(
        5 - performance.wrongRootGuesses * 0.25 - performance.wrongShapeGuesses * 1.05,
      );
  const overall = calculateOverallScore(
    pitchScore,
    efficiencyScore,
    cleanlinessScore,
    { pitch: 0.5, timing: 0.3, cleanliness: 0.2 },
  );

  const wrongMidi = detected.filter((note) => !targetMidi.includes(note.midi));
  const extras: ExtraNote[] = wrongMidi.map((note) => ({
    midi: note.midi,
    name: midiToName(note.midi),
    time: note.time,
    kind: 'wrong',
  }));
  const medianSustain = medianOf(detected.map((note) => note.sustain ?? 1));
  const spatialChord: SpatialChordReport = {
    rootSupport: spec.rootSupport,
    rootFound: performance.rootFound,
    completed,
    foundTones: matched,
    totalTones: expectedCount,
    rootLatencySec: rootLatencySec === null ? null : Math.round(rootLatencySec * 100) / 100,
    buildLatencySec: buildLatencySec === null ? null : Math.round(buildLatencySec * 100) / 100,
    shellLatencySec: shellLatencySec === null ? null : Math.round(shellLatencySec * 100) / 100,
    colorToneLatencySec: colorToneLatencySec === null
      ? null
      : Math.round(colorToneLatencySec * 100) / 100,
    wrongRootGuesses: performance.wrongRootGuesses,
    wrongShapeGuesses: performance.wrongShapeGuesses,
    totalGuesses: performance.totalGuesses,
    efficiencyScore,
    timedOut: performance.timedOut,
  };
  // Chord by Ear is a guided discovery flow and does not show the conventional
  // scored report. Completing its three-tone shape remains the success rule;
  // exploration affects instructor telemetry rather than forcing a retry.
  const passed = completed;

  let detail: string;
  if (!performance.rootFound) {
    detail = spec.rootSupport === 'shown'
      ? 'The shown anchor was not placed yet.'
      : 'The isolated anchor was not matched yet. Listen once, then move directly.';
  } else if (!completed) {
    detail = `The root is correct. ${missed} chord ${missed === 1 ? 'tone is' : 'tones are'} still missing.`;
  } else if (passed && performance.wrongRootGuesses === 0 && performance.wrongShapeGuesses === 0) {
    detail = 'Anchor, outside, middle — the whole shape was built cleanly.';
  } else if (passed) {
    detail = 'Chord complete. Keep the outer reach steady, then place the middle tone.';
  } else {
    detail = 'The chord was found, but too many guesses made the search unclear.';
  }

  return {
    scores: {
      pitch: pitchScore,
      timing: efficiencyScore,
      cleanliness: cleanlinessScore,
      overall,
    },
    passed,
    matched,
    expectedCount,
    missed,
    benignExtras: 0,
    echoExtras: 0,
    pedalled: medianSustain >= PEDAL_SUSTAIN_THRESHOLD,
    hesitations: 0,
    hardExtras: performance.wrongRootGuesses + performance.wrongShapeGuesses,
    extras,
    firstMissIndex: completed ? -1 : Math.max(0, matched),
    playedNames: detected.map((note) => midiToName(note.midi)),
    rhythm: null,
    transition: null,
    spatialChord,
    detail,
  };
}

/**
 * Grade a played sequence.
 *
 * Matching is globally aligned but remains strictly in order. A deletion or
 * insertion no longer corrupts every later match, while playing the right
 * pitches in the wrong order still cannot pass as correct.
 */
export function gradeSequence(
  expected: string[],
  detected: DetectedNote[],
  options: GradeOptions = {},
): GradeResult {
  if (options.spatialChord && options.spatialPerformance) {
    return gradeSpatialChord(options.spatialChord, detected, options.spatialPerformance);
  }
  const isMemory = options.exerciseMode === 'blind-memory';
  const { ignoreOctave = false } = options;
  const norm = (midi: number) => (ignoreOctave ? ((midi % 12) + 12) % 12 : midi);

  const expectedMidi = expected
    .map(pitchToMidi)
    .filter((m): m is number => m !== null)
    .map(norm);
  const expectedCount = expectedMidi.length;

  const allowances = {
    ...allowancesFor(expectedCount),
    ...(isMemory ? { misses: expectedCount >= 4 ? 1 : 0 } : {}),
    ...(options.allowedMisses !== undefined ? { misses: options.allowedMisses } : {}),
    ...(options.allowedHesitations !== undefined
      ? { hesitations: options.allowedHesitations }
      : {}),
    ...(options.allowedHardExtras !== undefined
      ? { hardExtras: options.allowedHardExtras }
      : {}),
  };

  // Reference strength for "faint": the median of what was actually played,
  // so it adapts to a soft player and a loud room alike.
  const medianStrength = medianOf(detected.map((d) => d.strength || 1));

  // Pedal detection. Every note struck into a ringing texture reports high
  // sustain, so the median across the performance is a reliable indicator.
  const medianSustain = medianOf(detected.map((d) => d.sustain ?? 1));
  const pedalled = medianSustain >= PEDAL_SUSTAIN_THRESHOLD;
  const repeatWindow = pedalled ? REPEAT_WINDOW_PEDAL_SEC : REPEAT_WINDOW_SEC;

  // Echoes and sub-octave artefacts are counted apart from resonances and
  // faint transients. Both are benign, but only the first kind is provably
  // harmless: it repeats a note ALREADY matched, so no quantity of it can
  // disguise a wrong note. The second kind involves different pitches and
  // keeps a tight cap.
  let echoExtras = 0;
  const extras: ExtraNote[] = [];
  const matches: { expectedIndex: number; time: number; note: DetectedNote }[] = [];
  const accepted: DetectedNote[] = [];

  const alignment = alignSequences(expectedMidi, detected, norm, options);
  const expectedIndexByDetected = new Map<number, number>();
  const missedExpectedIndices: number[] = [];
  alignment.forEach((operation) => {
    if (operation.kind === 'match') {
      expectedIndexByDetected.set(operation.detectedIndex, operation.expectedIndex);
    } else if (operation.kind === 'miss') {
      missedExpectedIndices.push(operation.expectedIndex);
    }
  });

  let benign = 0;
  let hesitations = 0;
  let hard = 0;
  let playedRepeatExtras = 0;

  // Most recent matched occurrence of the note currently ringing. Do not
  // advance this anchor for echoes: otherwise an unlimited stream of false
  // re-detections can chain forever and still look perfectly clean.
  let lastEcho: DetectedNote | null = null;

  const isRepeat = (note: DetectedNote) => {
    if (!lastEcho || norm(lastEcho.midi) !== norm(note.midi)) return false;
    return (
      note.time - lastEcho.time <= repeatWindow ||
      note.strength < lastEcho.strength * 0.72
    );
  };

  const isResonance = (note: DetectedNote) => {
    for (let i = accepted.length - 1; i >= 0; i--) {
      const prior = accepted[i];
      if (note.time - prior.time > RESONANCE_WINDOW_SEC) break;
      const interval = note.midi - prior.midi;
      if (RESONANCE_INTERVALS.includes(interval) && note.strength < prior.strength * 0.7) {
        return true;
      }
      if (SUBOCTAVE_ARTIFACTS.includes(interval)) return true;
    }
    return false;
  };

  const isFaint = (note: DetectedNote) =>
    (medianStrength > 0 && note.strength < medianStrength * FAINT_RATIO) ||
    (Number.isFinite(note.clarity) && note.clarity > 0 && note.clarity < HARD_EXTRA_MIN_CLARITY);

  for (let i = 0; i < detected.length; i++) {
    const note = detected[i];
    const matchedExpectedIndex = expectedIndexByDetected.get(i);

    if (matchedExpectedIndex !== undefined) {
      matches.push({ expectedIndex: matchedExpectedIndex, time: note.time, note });
      accepted.push(note);
      lastEcho = note;
      continue;
    }

    // Benign classes, in order of confidence.
    let kind: ExtraKind | null = null;
    if (isRepeat(note)) kind = 'repeat';
    else if (isResonance(note)) kind = 'resonance';
    else if (isFaint(note)) kind = 'faint';

    if (kind) {
      benign += 1;
      if (kind === 'repeat') {
        echoExtras += 1;
        // A strict event with its own hammer evidence is a played repeat,
        // even inside the echo window. Weak/offline repeats remain acoustic
        // debris so detector chatter cannot crush an otherwise strong take.
        const hasIndependentAttack = Boolean(
          note.detectorLane === 'strict' && (
            (note.pianoAttackConfidence ?? 0) >= 0.5 ||
            (note.frameAttackRatio ?? 0) >= 1.08 ||
            (note.novelty ?? 0) >= 0.4
          )
        );
        if (hasIndependentAttack) playedRepeatExtras += 1;
      } else if (kind === 'resonance' && SUBOCTAVE_ARTIFACTS.includes(note.midi - (accepted[accepted.length - 1]?.midi ?? 0))) {
        echoExtras += 1;
      }
      extras.push({ midi: note.midi, name: midiToName(note.midi), time: note.time, kind });
      continue;
    }

    // An unmatched note immediately followed by an aligned note is a
    // hesitation: the student corrected themselves and continued in order.
    if (expectedIndexByDetected.has(i + 1)) {
      hesitations += 1;
      extras.push({ midi: note.midi, name: midiToName(note.midi), time: note.time, kind: 'hesitation' });
      continue;
    }

    hard += 1;
    extras.push({ midi: note.midi, name: midiToName(note.midi), time: note.time, kind: 'wrong' });
  }

  const totalMissed = missedExpectedIndices.length;
  const significantExtraCount = hard + hesitations * 0.35 + playedRepeatExtras;

  const playedNames = detected.map((d) => midiToName(d.midi));
  const rhythm = buildRhythm(matches, options);
  const transition = buildTransition(matches, options);

  /* --- Scoring -------------------------------------------------------- */

  const clamp5 = scoreToFive;

  // Pitch: proportion of the written notes actually produced, in order.
  // Offline recovery can rescue a real quiet key, but a note that never
  // cleared the live detector remains provisional evidence. It may earn
  // substantial credit, but it cannot turn an incomplete live take into 5.0.
  const offlineRecoveryPenalty = matches.reduce((penalty, { note }) => {
    if (note.analysisSource !== 'offline-recovered') return penalty;
    const confidence = clamp01(note.analysisConfidence ?? note.clarity ?? 0);
    // Lossless PCM is stronger evidence than a missing live UI event. Keep a
    // small provenance deduction so it cannot create 5.0, while avoiding the
    // old flat penalty that severely undervalued clearly recorded soft notes.
    return penalty + 0.1 + (1 - confidence) * 0.22;
  }, 0);
  const pitchEvidence = matches.length - offlineRecoveryPenalty;
  const pitchCoverage = expectedCount === 0 ? 0 : pitchEvidence / expectedCount;
  const pitchPrecision = pitchEvidence <= 0
    ? 0
    : pitchEvidence / (pitchEvidence + significantExtraCount);
  const exactPitchScore = clamp5(5 * pitchCoverage * pitchPrecision);
  // Memory assesses whether the learner retained the musical chunk. One
  // omitted note in an otherwise exact, ordered pattern still demonstrates
  // recognition; wrong notes and reordered material remain fully visible.
  const memoryPatternRecognized = Boolean(
    isMemory &&
    expectedCount >= 4 &&
    totalMissed <= 1 &&
    matches.length >= expectedCount - 1 &&
    hard === 0 &&
    hesitations === 0 &&
    significantExtraCount === 0
  );
  // Recognising a memory pattern with one omission should pass comfortably,
  // but "accepted" is not "perfect." Reserve 5.0 for every written pitch.
  const pitchScore = memoryPatternRecognized
    ? Math.max(4.5, exactPitchScore)
    : exactPitchScore;

  // Timing: a curved, lesson-aware falloff. Early readers get space to find
  // the beat; later readers are asked for more precision, without the old
  // cliff where a modest error abruptly became zero.
  const timingProfile = timingProfileForOptions(options);
  const baseTimingScore = rhythm === null
    ? null
    : (() => {
        const attackTimingError = rhythm.evaluated < 2
          ? rhythm.meanOnsetErrorBeats
          : rhythm.meanOnsetErrorBeats * 0.42 + rhythm.meanIntervalErrorBeats * 0.58;
        const onsetScoringRange = Math.max(
          0.01,
          timingProfile.zeroScoreWindow - timingProfile.fullCreditOnsetWindow,
        );
        const gradedOnsetError = Math.max(
          0,
          attackTimingError - timingProfile.fullCreditOnsetWindow,
        );
        const onsetScore = 5 * Math.pow(
          Math.max(0, 1 - gradedOnsetError / onsetScoringRange),
          1.15,
        );
        if (rhythm.meanDurationErrorBeats === null) return clamp5(onsetScore);

        // Duration stays visible and consequential, but acoustic releases are
        // intrinsically less certain than hammer onsets in a microphone/room.
        // It therefore contributes 18%, with confidence weighting applied in
        // buildRhythm; grossly wrong holds still lose credit without turning
        // an otherwise expert take into a 3/5.
        const durationZeroWindow = timingProfile.zeroScoreWindow * 0.85;
        const durationScoringRange = Math.max(
          0.01,
          durationZeroWindow - timingProfile.fullCreditDurationWindow,
        );
        const gradedDurationError = Math.max(
          0,
          rhythm.meanDurationErrorBeats - timingProfile.fullCreditDurationWindow,
        );
        const durationScore = 5 * Math.pow(
          Math.max(
            0,
            1 - gradedDurationError / durationScoringRange,
          ),
          1.1,
        );
        return clamp5(onsetScore * 0.82 + durationScore * 0.18);
      })();
  const completePitch =
    matches.length === expectedCount &&
    totalMissed === 0;
  const cleanPerformance = significantExtraCount === 0;
  const completeAndClean = completePitch && cleanPerformance;

  // Five means there is no useful timing correction to give—not that every
  // FFT timestamp landed inside an artificially tiny mathematical plateau.
  // Judge the whole musical result: every attack remains inside the lesson's
  // on-beat window, relative spacing is stable, and repeated high-confidence
  // releases do not prove materially wrong note lengths. Pitch/cleanliness
  // mistakes remain on their own axes and cannot lower Timing a second time.
  const transitionSupportsFullCredit =
    !transition || (transition.measured && transition.score === 5);
  const fullCreditTiming = Boolean(
    (completePitch || memoryPatternRecognized) &&
    rhythm &&
    rhythm.accuracy === 1 &&
    rhythm.meanIntervalErrorBeats <= timingProfile.onBeatWindow * 1.2 &&
    (
      rhythm.durationAccuracy === null ||
      rhythm.durationEvaluated < 2 ||
      rhythm.durationAccuracy >= 0.7
    ) &&
    transitionSupportsFullCredit,
  );
  const timingScore =
    fullCreditTiming
      ? 5
      : baseTimingScore === null
        ? transition?.score ?? null
        : transition
          ? clamp5(baseTimingScore * 0.65 + transition.score * 0.35)
          : baseTimingScore;

  // Cleanliness: penalises only what the student actually did. Echoes and
  // resonances are the room's doing and cost nothing.
  // Nothing played is not a clean performance — it is no performance.
  const cleanScore =
    detected.length === 0
      ? 0
      : completeAndClean
        // Quiet-room recoveries, sympathetic resonance, and harmless
        // detector debris are not student mistakes. A complete ordered take
        // with no wrong key or hesitation must display the earned 5.0.
        ? 5
        // Only confident, uncorrected wrong-key strikes should materially
        // affect Cleanliness. Echoes, resonances, faint detections and quick
        // self-corrections must not make a correct take look dirty.
        : clamp5(5 - 0.8 * significantExtraCount);

  // Pitch carries the most weight: this app exists to verify hand position.
  const wPitch = isMemory ? 0.7 : 0.5;
  const wTiming = isMemory ? 0.1 : 0.2;
  const wClean = isMemory ? 0.2 : 0.3;
  const overall = calculateOverallScore(
    pitchScore,
    timingScore,
    cleanScore,
    { pitch: wPitch, timing: wTiming, cleanliness: wClean },
  );

  const scores: ScoreBreakdown = {
    pitch: pitchScore,
    timing: timingScore,
    cleanliness: cleanScore,
    overall,
  };

  // Keep these diagnostics for precise student feedback, but never use them
  // as a second, hidden retry rule. Timing, duration, misses, extras, and hand
  // shifts already feed the three visible category scores.
  const lessonProgress = clamp01(
    ((options.lessonLevel ?? 1) - 1) / Math.max(1, (options.totalLessons ?? 20) - 1),
  );
  const minimumOnBeatRatio = mix(0.50, 0.65, lessonProgress);
  const minimumDurationAccuracy = mix(0.32, 0.48, lessonProgress);
  const timingPassed = rhythm === null || (
    (rhythm.evaluated < 3 || rhythm.accuracy >= minimumOnBeatRatio) &&
    (rhythm.durationEvaluated < 2 ||
      rhythm.durationAccuracy === null ||
      rhythm.durationAccuracy >= minimumDurationAccuracy)
  );
  const passed = passesOverallScore(overall);

  let detail: string;
  if (passed) {
    if (memoryPatternRecognized && totalMissed === 1) {
      detail = 'Pattern recognized. One note dropped out, but the musical shape stayed clear.';
    } else if (transition?.measured) {
      detail = transition.onTime
        ? `Clean landing — the hand shift took ${transition.transitionSeconds?.toFixed(2)} seconds.`
        : `The shift was measured at ${transition.transitionSeconds?.toFixed(2)} seconds. Keep the next position prepared.`;
    } else if (!timingPassed) {
      detail = 'Drill complete. The notes passed; keep working toward a steadier beat.';
    } else if (totalMissed > 0) {
      detail = 'Good recovery. One note was missed, and the rest of the phrase stayed in place.';
    } else if (benign > 0 && hesitations === 0 && hard === 0) {
      detail = 'Every note in the right place.';
    } else if (hesitations > 0) {
      detail = 'Correct — you found it after a wobble.';
    } else {
      detail = 'Every note in the right place.';
    }
  } else if (detected.length === 0) {
    detail = 'No notes were heard. Check the microphone and play a little louder.';
  } else if (matches.length === 0) {
    detail = `Started on ${playedNames[0] ?? 'the wrong note'} instead of ${expected[0]}.`;
  } else if (!timingPassed && rhythm?.durationEvaluated &&
    rhythm.durationAccuracy !== null &&
    rhythm.durationAccuracy < minimumDurationAccuracy) {
    detail = 'The notes were right, but their lengths did not match the written rhythm.';
  } else if (!timingPassed) {
    detail = 'The notes were right, but too many attacks missed the beat.';
  } else if (transition && !transition.measured) {
    detail = 'The notes around the position change were not both heard, so the hand shift could not be measured.';
  } else if (transition && transition.score < 1.5) {
    detail = `The position change took ${transition.transitionSeconds?.toFixed(2)} seconds. Prepare the landing shape before you move.`;
  } else if (significantExtraCount >= Math.max(3, expectedCount)) {
    detail = 'Too many extra notes were played. Follow only the written pattern and try again.';
  } else if (totalMissed > allowances.misses) {
    const firstMiss = missedExpectedIndices[0] ?? 0;
    const missedName = expected[Math.min(firstMiss, Math.max(0, expected.length - 1))];
    detail = `Missed ${missedName}. The rest of the phrase was still counted.`;
  } else if (hard > allowances.hardExtras) {
    const wrong = extras.find((e) => e.kind === 'wrong');
    detail = wrong
      ? `Extra note (${wrong.name}) that is not in the exercise.`
      : 'Extra notes that are not in the exercise.';
  } else {
    detail = 'Too many stumbles to count as clean. Try it again.';
  }

  return {
    scores,
    passed,
    matched: matches.length,
    expectedCount,
    missed: totalMissed,
    benignExtras: benign,
    echoExtras,
    pedalled,
    hesitations,
    hardExtras: hard,
    extras,
    firstMissIndex: missedExpectedIndices[0] ?? -1,
    playedNames,
    rhythm,
    transition,
    spatialChord: null,
    detail,
  };
}

export function planForQuestion(question: Question, bpm: number = DEFAULT_BPM): DrillPlan {
  const plan = planFor(question.cue, question.expectedSequence, bpm);
  const waitSeconds = Math.max(0, question.anchorShift?.timedShift?.waitSeconds ?? 0);
  if (waitSeconds === 0 || plan.expectedNotes.length < 2) return plan;

  const splitIndex = Math.min(
    Math.max(1, question.anchorShift?.splitIndex ?? 1),
    plan.expectedNotes.length - 1,
  );
  const startBeat = plan.expectedNotes[splitIndex].beat;
  const waitBeats = waitSeconds / plan.secondsPerBeat;
  const endBeat = startBeat + waitBeats;

  return {
    ...plan,
    notes: plan.notes.map((note) => (
      note.beat >= startBeat ? { ...note, beat: note.beat + waitBeats } : note
    )),
    expectedNotes: plan.expectedNotes.map((note, index) => (
      index >= splitIndex ? { ...note, beat: note.beat + waitBeats } : note
    )),
    totalBeats: plan.totalBeats + waitBeats,
    recordSeconds: plan.recordSeconds + waitSeconds,
    timedShift: {
      splitIndex,
      waitSeconds,
      waitBeats,
      startBeat,
      endBeat,
    },
  };
}
