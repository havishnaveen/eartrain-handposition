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
  /** 'w' | 'h' | 'q' | '8'; suffix 'r' for a rest, e.g. 'qr'. */
  duration: string;
  finger?: number;
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
}

export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * How a question should be shaped for this rep.
 *  - reinforce: the student just struggled. Shorter, simpler structure.
 *  - normal:    standard shape for the concept.
 *  - stretch:   the student is cruising. Fuller, longer structure.
 * Orthogonal to `difficulty`, which moves shape/octave/leap size.
 */
export type GenerationMode = 'reinforce' | 'normal' | 'stretch';
export type ExerciseMode = 'standard' | 'prove-it' | 'blind-memory' | 'anchor-shift';
export type HandScope = 'right' | 'left' | 'both';

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
  blindMemory?: BlindMemorySpec;
  anchorShift?: AnchorShiftSpec;
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
  ) => Question;
}

/** Live lesson definitions always declare their interaction format. */
export interface LessonDefinition extends Concept {
  exerciseMode: ExerciseMode;
}
