/**
 * Notation + curriculum types.
 *
 * VexFlow key syntax for notation ("c/4", "bb/3", "f#/5").
 * Scientific pitch notation for expected pitches ("C4", "Bb3") — that is
 * what the audio engine emits in Step 3.
 */

export type Clef = 'treble' | 'bass';
export type Hand = 'right' | 'left';
export type Topography = 'all-white' | 'black-middle' | 'black-edges';

export interface CueNote {
  keys: string[];
  /** VexFlow duration: w/h/q/8/16, optional dot(s), then optional r for rest. */
  duration: string;
  /** Single-note finger number. For a stacked chord (keys.length > 1), use `fingers` instead. */
  finger?: number;
  /** Per-key finger numbers for a stacked chord, parallel to `keys`. Takes priority over `finger` when set. */
  fingers?: number[];
  /** Anchor note the drill is built around — drawn in accent color. */
  anchor?: boolean;
}

export interface StaffSpec {
  clef: Clef;
  hand: Hand;
  notes: CueNote[];
}

export interface CueSpec {
  staves: StaffSpec[];
  keySignature?: string;
  timeSignature?: string;
  /**
   * Engraving-only override. The timing engine may still use `timeSignature`
   * for count-in and bar math while compact one-to-three-event cues omit the
   * redundant printed fraction.
   */
  showTimeSignature?: boolean;
  /**
   * When set, a piece longer than this many measures wraps onto additional
   * stacked systems (each a fresh copy of every staff in `staves`) instead
   * of staying on one ever-widening line. Undefined keeps today's single
   * continuous line — every existing exercise is unaffected.
   */
  measuresPerSystem?: number;
}

export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * How a question should be shaped for this rep.
 *  - reinforce: the student just struggled. Shorter, simpler structure.
 *  - normal:    standard shape for the concept.
 *  - stretch:   the student is cruising. Fuller, longer structure.
 * Orthogonal to `difficulty`, which moves shape/octave/leap size.
 */
export type GenerationMode = 'reinforce' | 'normal' | 'stretch';
export type ExerciseMode =
  | 'standard'
  | 'prove-it'
  | 'blind-memory'
  | 'anchor-shift'
  | 'spatial-chord';
export type HandScope = 'right' | 'left' | 'both';

/**
 * Stable, machine-readable reasons an instructor may assign EarTrain work.
 * These are deliberately skill problems rather than lesson titles so an
 * external system can request remediation without knowing curriculum order.
 */
export const REMEDIATION_PROBLEMS = [
  'right-hand-position',
  'left-hand-position',
  'finger-number-mapping',
  'treble-clef-recognition',
  'bass-clef-recognition',
  'clef-differentiation',
  'register-placement',
  'hand-coordination',
  'stepwise-note-reading',
  'skip-and-turn-reading',
  'key-signature-orientation',
  'c-position',
  'g-major-position',
  'd-major-position',
  'a-major-position',
  'e-major-position',
  'b-major-position',
  'f-sharp-major-position',
  'position-memory',
  'rhythm-pulse',
  'rapid-subdivision',
  'hand-shift',
  'right-hand-shift',
  'left-hand-shift',
  'dominant-hand-shift',
  'non-dominant-hand-shift',
  'c-to-g-shift',
  'g-to-d-shift',
  'd-to-a-shift',
  'a-to-e-shift',
  'b-to-f-sharp-shift',
  'chord-anchor',
  'chord-shell',
  'chord-reading',
  'chord-simultaneity',
  'chord-by-ear',
  'chord-quality-spacing',
  'major-minor-hearing',
  'background-piano-separation',
  'chord-shape-transfer',
] as const;

export type RemediationProblem = typeof REMEDIATION_PROBLEMS[number];

export type ChordQuality = 'major' | 'minor';
export type SpatialInstrumentLayer = 'pad' | 'bass' | 'pulse' | 'strings';
/**
 * How the anchor is supplied. Neither option tests absolute/perfect pitch:
 * `shown` names the key; `matched` plays the isolated anchor after the mix.
 */
export type SpatialRootSupport = 'shown' | 'matched';

export interface SpatialChordContext {
  /** The generated foreground timbre students are explicitly told to follow. */
  targetInstrument: 'piano';
  /**
   * Legacy arrangement hints retained for saved-curriculum compatibility.
   * Progressive playback renders every pitched layer with acoustic-piano
   * samples; these values must never select an oscillator/synth voice.
   */
  layers: SpatialInstrumentLayer[];
  /** Harmonic lead-in ending on the chord the student must identify. */
  progression: string[][];
  targetChordIndex: number;
  secondsPerChord: number;
  /** Repeating the final piano chord makes the target stream perceptually clear. */
  targetRepeats: number;
}

export interface SpatialChordSpec {
  /** Instructor/report label. The student UI withholds this until it is found. */
  chordName: string;
  hand: Hand;
  quality: ChordQuality;
  rootPitch: string;
  /** Root, third, fifth. Detection is sequential across these three targets. */
  chordPitches: [string, string, string];
  /** Semitone distances above the root, used for spatial-efficiency telemetry. */
  intervals: [number, number];
  /** The anchor is given or replayed in isolation; it is never blind-guessed. */
  rootSupport: SpatialRootSupport;
  /** Chord-tone indices in standard learning order: root, third, fifth. */
  buildOrder: [0, 1, 2];
  context: SpatialChordContext;
  rootSearchSeconds: number;
  shapeSearchSeconds: number;
  maxWrongGuesses: number;
}

export interface PositionProofNote {
  /** Exact scientific pitch required from the microphone, e.g. C4. */
  pitch: string;
  /** Piano finger number, shown as the primary instruction. */
  finger: 1 | 2 | 3 | 4 | 5;
}

export interface PositionProofSpec {
  positionName: string;
  hand: Hand;
  /** Three exact notes, played in order to establish the full hand shape. */
  proofNotes: [PositionProofNote, PositionProofNote, PositionProofNote];
  /** When true, each earlier key must stay down while the next is added. */
  requireHeld: boolean;
  /** Time allowed from the first requested note to the final one. */
  acceptWindowMs: number;
}

export interface BlindMemorySpec {
  previewSeconds: number;
  hideStyle: 'blur' | 'vanish';
}

export interface AnchorShiftSpec {
  fromPositionName: string;
  toPositionName: string;
  /** First expected note belonging to Position 2. */
  splitIndex: number;
  /** Extra delay beyond the written onset gap that still earns some credit. */
  allowedExtraBeats: number;
  /** Optional silent movement window inserted between the two notation panels. */
  timedShift?: {
    /** Exact silent movement window on the musical grid. */
    waitBeats: number;
    /** Counted preparation after the move timer, before Position 2 begins. */
    leadInBeats?: number;
    /** Hide Position 2 until its observation window begins. */
    revealSecond?: boolean;
  };
}

/** A single generated instance of a concept — one thing to play, once. */
export interface Question {
  /** Unique per instance: `${conceptId}#${ordinal}`. Telemetry keys on this. */
  id: string;
  conceptId: string;
  exerciseMode: ExerciseMode;
  /** Hands used across this lesson, even when one rep displays one staff. */
  handScope?: HandScope;
  instruction: string;
  cue: CueSpec;
  expectedSequence: string[];
  tempoWindowSec: number | null;
  /** Fingering is inferred from reach, not detected. Lower telemetry confidence. */
  fingeringInferred?: boolean;
  /** Human-readable position label, e.g. "G position (G4)". For instructor reports. */
  positionLabel: string;
  /** 0-1 rung on this concept's ladder. Recorded so reports show WHICH rung failed. */
  difficulty: number;
  /** Structural shaping applied to this instance. */
  mode: GenerationMode;
  positionProof?: PositionProofSpec;
  /** Ordered gates for drills that must establish more than one hand position. */
  positionProofs?: readonly PositionProofSpec[];
  blindMemory?: BlindMemorySpec;
  anchorShift?: AnchorShiftSpec;
  spatialChord?: SpatialChordSpec;
}

/**
 * A concept is a lesson: one mechanical skill, drilled with fresh material
 * each rep, climbing a difficulty ladder across the loop.
 */
export interface Concept {
  id: string;
  /** 1-based position in the macro pathway. */
  index: number;
  phase: PhaseId;
  phaseLabel: string;
  /** Lesson name shown in the header. */
  title: string;
  /** One line telling the student what skill this lesson trains. */
  focus: string;
  /** Primary instructor-facing problem this lesson remediates. */
  primaryProblem?: RemediationProblem;
  /** All problems for which this lesson is a valid targeted assignment. */
  problemTags?: readonly RemediationProblem[];
  /** Questions in a clean run. The router extends this on misses. */
  baseQuestionCount: number;
  /** Ceiling on loop growth so a struggling student is never trapped. */
  maxQuestionCount: number;
  /** Optional only so archived curriculum definitions still type-check. */
  exerciseMode?: ExerciseMode;
  /**
   * Pure: same ordinal + seeded rand + difficulty + mode => same question.
   * `difficulty` runs 0 (easiest) to 1 (hardest). Purity is what lets the
   * reducer generate questions directly and lets telemetry replay them.
   */
  generate: (
    ordinal: number,
    rand: () => number,
    difficulty: number,
    mode: GenerationMode,
    /** One-based rep inside the current lesson, including adaptive extensions. */
    questionNumber?: number,
  ) => Question;
}

/** Live lesson definitions always declare their interaction format. */
export interface LessonDefinition extends Concept {
  exerciseMode: ExerciseMode;
  primaryProblem: RemediationProblem;
  /** Problems this four-drill intervention is specifically designed to fix. */
  coreProblems: readonly RemediationProblem[];
  problemTags: readonly RemediationProblem[];
  /** Observable result expected after completing this lesson by itself. */
  learningOutcome: string;
  /** Why each immutable drill slot exists, in displayed order. */
  drillPurposes: readonly [string, string, string, string];
}
