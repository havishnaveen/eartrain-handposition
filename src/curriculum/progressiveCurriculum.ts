import type {
  ChordQuality,
  CueNote,
  ExerciseMode,
  GenerationMode,
  Hand,
  LessonDefinition,
  PhaseId,
  PositionProofSpec,
  Question,
  RemediationProblem,
  SpatialChordSpec,
  SpatialRootSupport,
} from './types';
import {
  buildPosition,
  makeRandom,
  positionById,
} from './positions';
import type { Position, PositionTemplate } from './positions';
import {
  MUSICAL_BEGINNER,
  MUSICAL_GENTLE_SKIPS,
  MUSICAL_LATE,
  MUSICAL_REPEATED,
  MEMORY_LONG_PATTERNS,
  MEMORY_SHORT_PATTERNS,
  applyRhythm,
  fingerFor,
} from './melody';
import type { Contour } from './melody';

/**
 * The production curriculum's explicit difficulty envelope.
 *
 * Lessons 1-2 are the complete right-hand-only foundation. Lesson 3 teaches
 * the left hand in C before any signature is added. From Lesson 5 onward,
 * key signatures climb by musical distance rather than random position rank:
 * G (1 sharp), D (2), A (3), E (4), B (5), then F-sharp (6).
 *
 * G, D, A, and E each receive orientation plus consolidation. B and F-sharp
 * then share an explicit, word-light placement bridge before the B→F-sharp
 * jump; neither position is first encountered during the jump itself.
 *
 * Chord listening is deliberately relative rather than absolute: the anchor
 * is either shown or replayed in isolation. The assessed work is what follows
 * — retaining the anchor, reaching the outer fifth, and placing the middle
 * tone without searching randomly.
 */

const BASE_QUESTIONS = 4;
const MAX_QUESTIONS = 10;
const SHORT_MEMORY_PREVIEW_SECONDS = 10;
const LONG_MEMORY_PREVIEW_SECONDS = 15;

const C = positionById('C');
const G = positionById('G');
const D = positionById('D');
const A = positionById('A');
const E = positionById('E');
const B = positionById('B');
const FS = positionById('F#');

/**
 * A full position is still visited on every phrase, but the melody changes
 * from rep to rep. These are short tonal shapes rather than two scale runs.
 */
const FIVE_FINGER_PATHS: readonly Contour[] = [
  [0, 1, 2, 3, 4],
  [4, 3, 2, 1, 0],
  [0, 1, 2, 1, 3, 2, 4, 0],
  [0, 2, 1, 3, 2, 4, 3, 2, 1, 0],
  [4, 2, 3, 1, 2, 0],
  [0, 1, 3, 2, 1, 0, 2, 4, 0],
  [0, 2, 4, 3, 2, 1, 0],
  [4, 3, 1, 2, 0, 1, 0],
  [0, 1, 2, 0, 3, 2, 4, 0],
  [4, 2, 0, 1, 3, 2, 1, 0],
];

interface LessonRecipe {
  id: string;
  index: number;
  phase: PhaseId;
  phaseLabel: string;
  title: string;
  focus: string;
  instruction: string;
  exerciseMode: ExerciseMode;
  /** One hand means a dedicated lesson; two alternate predictably by rep. */
  hands: readonly Hand[];
  positions: readonly PositionTemplate[];
  rightOctaves: readonly number[];
  leftOctaves: readonly number[];
  contours: readonly Contour[];
  meters: readonly number[];
  showKeySignature: boolean;
  tempoEasy: number;
  tempoHard: number;
  /** Fixed teaching order. Performance may add repeats, never reshuffle it. */
  drills: readonly CurriculumDrillKind[];
  /** Explicit lesson rung; each of the four drills rises slightly from here. */
  difficultyBase: number;
  shiftPairs?: readonly (readonly [PositionTemplate, PositionTemplate])[];
  /** Optional ear-training reps interleaved with this lesson's tactile work. */
  spatialChord?: SpatialChordRecipe;
}

export type CurriculumDrillKind =
  | 'prove-it'
  | 'standard'
  | 'blind-memory'
  | 'anchor-shift'
  | 'chord-reading'
  | 'spatial-chord';

interface SpatialChordRecipe {
  /** Legacy enablement list; live slot order is governed only by `drills`. */
  questionNumbers: readonly number[];
  roots: readonly PositionTemplate[];
  qualities: readonly ChordQuality[];
  /** Supplies an anchor without requiring absolute/perfect pitch. */
  rootSupport: SpatialRootSupport;
  rootSearchSeconds: number;
  shapeSearchSeconds: number;
  maxWrongGuesses: number;
}

const BOTH_HANDS: readonly Hand[] = ['right', 'left'];
const RH: readonly Hand[] = ['right'];
const LH: readonly Hand[] = ['left'];
const TREBLE = [4, 5] as const;
const BASS = [3, 2] as const;

/**
 * AI MAINTAINERS: THE ORDER BELOW IS A REVIEWED PRODUCT CONTRACT.
 *
 * Do not reorder lessons or their four `drills`, and do not make generation
 * depend on random seed, adaptive mode, or global ordinal. Each lesson is a
 * standalone intervention reached directly from an instructor diagnosis.
 * Read /AGENTS.md and /src/curriculum/CURRICULUM.md before changing this list,
 * then update the blueprint, version, and curriculum audits in the same change.
 */
const LESSONS: readonly LessonRecipe[] = [
  {
    id: 'c01-rh-c-position', index: 1, phase: 0, phaseLabel: 'Right hand foundations',
    title: 'Meet C position', focus: 'Set the right hand once and use all five fingers.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: RH, positions: [C], rightOctaves: [4], leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: false,
    tempoEasy: 15, tempoHard: 14,
    drills: ['prove-it', 'standard', 'standard', 'prove-it'], difficultyBase: 0.02,
  },
  {
    id: 'c02-rh-musical-phrases', index: 2, phase: 0, phaseLabel: 'Right hand foundations',
    title: 'Shape a right-hand phrase', focus: 'Read steps, turns, and gentle repeats without moving the hand.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: RH, positions: [C, G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED], meters: [4, 3],
    showKeySignature: false, tempoEasy: 14.5, tempoHard: 13,
    drills: ['standard', 'prove-it', 'blind-memory', 'standard'], difficultyBase: 0.06,
  },
  {
    id: 'c03-lh-c-position', index: 3, phase: 0, phaseLabel: 'Left hand foundations',
    title: 'Meet the left hand', focus: 'Learn bass-clef C position before adding any sharps.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: LH, positions: [C], rightOctaves: [4], leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: false,
    tempoEasy: 15, tempoHard: 13.8,
    drills: ['prove-it', 'standard', 'standard', 'prove-it'], difficultyBase: 0.10,
  },
  {
    id: 'c04-two-hand-white-keys', index: 4, phase: 0, phaseLabel: 'Two-hand foundations',
    title: 'White-key phrases', focus: 'Alternate hands while the pitch language stays familiar.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: BOTH_HANDS, positions: [C, G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: false, tempoEasy: 14, tempoHard: 12.5,
    drills: ['standard', 'prove-it', 'blind-memory', 'standard'], difficultyBase: 0.14,
  },
  {
    id: 'c05-g-major-orientation', index: 5, phase: 1, phaseLabel: 'One sharp',
    title: 'G major: one sharp', focus: 'Read the one-sharp signature while placing G-A-B-C-D on familiar white keys.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14.5, tempoHard: 13,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.18,
  },
  {
    id: 'c06-g-major-phrases', index: 6, phase: 1, phaseLabel: 'One sharp',
    title: 'Sing in G major', focus: 'Keep the G-position tonic map stable through complete tonal phrases.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 14, tempoHard: 12.4,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.22,
  },
  {
    id: 'c07-d-major-orientation', index: 7, phase: 1, phaseLabel: 'Two sharps',
    title: 'D major: two sharps', focus: 'Make F-sharp physical inside D-E-F-sharp-G-A while reading the two-sharp signature.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14, tempoHard: 12.8,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.26,
  },
  {
    id: 'c08-d-major-phrases', index: 8, phase: 1, phaseLabel: 'Two sharps',
    title: 'Shape D-major melodies', focus: 'Keep F-sharp secure through turns, repeats, and gentle skips in D position.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.30,
  },
  {
    id: 'c09-a-major-orientation', index: 9, phase: 2, phaseLabel: 'Three sharps',
    title: 'A major: three sharps', focus: 'Transfer black-key awareness to C-sharp inside the A five-finger map.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.8, tempoHard: 12.4,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.34,
  },
  {
    id: 'c10-a-major-phrases', index: 10, phase: 2, phaseLabel: 'Three sharps',
    title: 'Flow through A major', focus: 'Keep the A-position C-sharp stable through a longer phrase.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.2, tempoHard: 11.8,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.38,
  },
  {
    id: 'c11-e-major-orientation', index: 11, phase: 2, phaseLabel: 'Four sharps',
    title: 'E major: four sharps', focus: 'Coordinate F-sharp and G-sharp inside a calm, compact E-position path.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.42,
  },
  {
    id: 'c12-e-major-phrases', index: 12, phase: 2, phaseLabel: 'Four sharps',
    title: 'Color E-major phrases', focus: 'Keep both black keys secure through repeated ideas and skips in E position.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.46,
  },
  {
    id: 'c13-shift-c-to-g', index: 13, phase: 3, phaseLabel: 'Anchor and shift',
    title: 'Leap from C to G', focus: 'Release one known position and land a fifth away without searching.',
    instruction: 'Play C. Move to G. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [C, G],
    rightOctaves: TREBLE, leftOctaves: [3], contours: MUSICAL_GENTLE_SKIPS,
    meters: [4], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    drills: ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'], difficultyBase: 0.50,
    shiftPairs: [[C, G]],
  },
  {
    id: 'c14-shift-g-to-d', index: 14, phase: 3, phaseLabel: 'Anchor and shift',
    title: 'Leap from G to D', focus: 'Move between one- and two-sharp hand maps in time.',
    instruction: 'Play G. Move to D. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [G, D],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: MUSICAL_GENTLE_SKIPS,
    meters: [4], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    drills: ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'], difficultyBase: 0.54,
    shiftPairs: [[G, D]],
  },
  {
    id: 'c15-shift-d-to-a', index: 15, phase: 4, phaseLabel: 'Anchor and shift',
    title: 'Leap from D to A', focus: 'Transfer the same tactile shape into a three-sharp landing.',
    instruction: 'Play D. Move to A. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [D, A],
    rightOctaves: TREBLE, leftOctaves: [3], contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.2,
    drills: ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'], difficultyBase: 0.58,
    shiftPairs: [[D, A]],
  },
  {
    id: 'c16-shift-a-to-e', index: 16, phase: 4, phaseLabel: 'Anchor and shift',
    title: 'Leap from A to E', focus: 'Keep orientation while moving into a four-sharp position.',
    instruction: 'Play A. Move to E. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [A, E],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.3, tempoHard: 10.7,
    drills: ['anchor-shift', 'chord-reading', 'blind-memory', 'anchor-shift'], difficultyBase: 0.62,
    shiftPairs: [[A, E]],
  },
  {
    id: 'c17-b-fsharp-orientation', index: 17, phase: 5, phaseLabel: 'Five and six sharps',
    title: 'Map B and F-sharp', focus: 'Place both new hand maps before asking the hand to jump between them.',
    instruction: 'Set the hand shape. Then play the short pattern.',
    exerciseMode: 'prove-it', hands: BOTH_HANDS,
    // Both hands establish B before both hands meet F-sharp.
    positions: [B, B, FS, FS], rightOctaves: [4], leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4],
    showKeySignature: true, tempoEasy: 15, tempoHard: 14,
    drills: ['prove-it', 'prove-it', 'prove-it', 'chord-reading'], difficultyBase: 0.66,
  },
  {
    id: 'c18-shift-b-to-fsharp', index: 18, phase: 5, phaseLabel: 'Five and six sharps',
    title: 'Move from B to F-sharp', focus: 'Move only after both five- and six-sharp hand maps have been established.',
    instruction: 'Play B. Move to F-sharp. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [B, FS],
    rightOctaves: [4], leftOctaves: [3], contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.2,
    drills: ['anchor-shift', 'chord-reading', 'blind-memory', 'anchor-shift'], difficultyBase: 0.70,
    shiftPairs: [[B, FS]],
  },
  {
    id: 'c19-anchor-and-shell', index: 19, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Anchor, then build', focus: 'Start from a supplied root, add the third, then complete the chord with the fifth.',
    instruction: 'Place the anchor. Add the middle, then the outside note.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D],
    rightOctaves: [4], leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 14, tempoHard: 13,
    drills: ['spatial-chord', 'chord-reading', 'spatial-chord', 'chord-reading'], difficultyBase: 0.74,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D], qualities: ['major'], rootSupport: 'shown',
      rootSearchSeconds: 9,
      shapeSearchSeconds: 11, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c20-complete-the-frame', index: 20, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Complete the chord frame', focus: 'Build every chord in the familiar 1-3-5 order.',
    instruction: 'Build from the root: 1, 3, 5.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A],
    rightOctaves: [4], leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12.5,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.78,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major'], rootSupport: 'shown',
      rootSearchSeconds: 8.5,
      shapeSearchSeconds: 10.5, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c21-major-minor-space', index: 21, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Move the middle tone', focus: 'Hear how the third changes while the root-to-third-to-fifth order stays familiar.',
    instruction: 'Build 1, 3, 5. Listen to the middle.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A],
    rightOctaves: TREBLE, leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 13, tempoHard: 12,
    drills: ['spatial-chord', 'chord-reading', 'chord-reading', 'spatial-chord'], difficultyBase: 0.82,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major', 'minor'], rootSupport: 'shown',
      rootSearchSeconds: 8, shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c22-match-anchor-in-texture', index: 22, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Match an isolated anchor', focus: 'Find the bottom note from the broken example, then rebuild the chord in 1-3-5 order.',
    instruction: 'Match the anchor. Build the same shape.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.8,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.86,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B], qualities: ['major', 'minor'], rootSupport: 'matched',
      rootSearchSeconds: 8, shapeSearchSeconds: 9.5, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c23-separate-background-piano', index: 23, phase: 7, phaseLabel: 'Independent chord hearing',
    title: 'Retain the heard shape', focus: 'Keep all three chord tones after the blocked and broken examples, then rebuild them together.',
    instruction: 'Listen. Find the bottom note. Build 1-3-5.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A, E],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.4, tempoHard: 11.2,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.90,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A, E], qualities: ['major', 'minor'], rootSupport: 'matched',
      rootSearchSeconds: 7.5, shapeSearchSeconds: 9, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c24-carry-shape-through-song', index: 24, phase: 7, phaseLabel: 'Independent chord hearing',
    title: 'Transfer the heard shape', focus: 'Rebuild major and minor shapes across the widest root and register range without visual note clues.',
    instruction: 'Listen. Find the bottom note. Rebuild the shape.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B, FS],
    rightOctaves: [4, 5], leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12, tempoHard: 10.8,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.94,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B, FS], qualities: ['major', 'minor'], rootSupport: 'matched',
      rootSearchSeconds: 7.2, shapeSearchSeconds: 8.8, maxWrongGuesses: 3,
    },
  },
];

interface LessonIntervention {
  /** What a student should be able to do after taking this lesson alone. */
  learningOutcome: string;
  /** Direct-referral reasons. These rank ahead of incidental reinforcement. */
  coreProblems: readonly RemediationProblem[];
  supportingProblems: readonly RemediationProblem[];
  /** The teaching job of each immutable drill slot, in screen order. */
  drillPurposes: readonly [string, string, string, string];
}

/**
 * Standalone intervention map. A referred student may enter any one lesson
 * without completing the lessons before it, so every four-drill set starts
 * with orientation/support and ends with a direct application or verification.
 */
const LESSON_INTERVENTIONS: Readonly<Record<string, LessonIntervention>> = {
  'c01-rh-c-position': {
    learningOutcome: 'Place the right hand in middle-C position and connect fingers 1-5 to the written notes.',
    coreProblems: ['right-hand-position', 'finger-number-mapping', 'c-position', 'register-placement'],
    supportingProblems: ['treble-clef-recognition'],
    drillPurposes: ['Map the 1-3-5 frame in order', 'Read the five-finger map', 'Apply the map to a new contour', 'Verify the three anchor notes again'],
  },
  'c02-rh-musical-phrases': {
    learningOutcome: 'Read a short treble-clef phrase as steps, turns, repeats, and gentle skips without moving the hand.',
    coreProblems: ['treble-clef-recognition', 'stepwise-note-reading', 'skip-and-turn-reading', 'rhythm-pulse'],
    supportingProblems: ['right-hand-position', 'c-position', 'position-memory'],
    drillPurposes: ['Read the phrase shape', 'Confirm its hand map', 'Recall the shape without notation', 'Transfer the idea to a new phrase'],
  },
  'c03-lh-c-position': {
    learningOutcome: 'Place the left hand in bass-clef C position and use the correct mirrored finger numbers.',
    coreProblems: ['left-hand-position', 'finger-number-mapping', 'bass-clef-recognition', 'c-position', 'register-placement'],
    supportingProblems: [],
    drillPurposes: ['Map the 5-3-1 frame in order', 'Read the bass five-finger map', 'Apply the map to a new contour', 'Verify the three anchor notes again'],
  },
  'c04-two-hand-white-keys': {
    learningOutcome: 'Differentiate treble from bass and play a coordinated white-key grand-staff phrase.',
    coreProblems: ['clef-differentiation', 'hand-coordination', 'treble-clef-recognition', 'bass-clef-recognition'],
    supportingProblems: ['register-placement', 'stepwise-note-reading', 'position-memory'],
    drillPurposes: ['Coordinate both staves', 'Re-anchor the left hand', 'Recall the right-hand map', 'Coordinate both staves in a new phrase'],
  },
  'c05-g-major-orientation': {
    learningOutcome: 'Place both hands on G-A-B-C-D while recognizing the one-sharp G-major signature.',
    coreProblems: ['g-major-position', 'key-signature-orientation', 'right-hand-position', 'left-hand-position'],
    supportingProblems: ['finger-number-mapping', 'position-memory', 'register-placement'],
    drillPurposes: ['Build the right-hand G frame', 'Read the left-hand G map', 'Recall the right-hand pattern', 'Verify the left-hand G frame'],
  },
  'c06-g-major-phrases': {
    learningOutcome: 'Keep the G-major hand map stable through reading, memory, and two-hand phrase work.',
    coreProblems: ['g-major-position', 'position-memory', 'hand-coordination', 'rhythm-pulse'],
    supportingProblems: ['key-signature-orientation', 'clef-differentiation', 'skip-and-turn-reading'],
    drillPurposes: ['Read G major on both staves', 'Recall the G map', 'Apply it to a new two-hand phrase', 'Verify the left-hand frame'],
  },
  'c07-d-major-orientation': {
    learningOutcome: 'Place both hands on D-E-F-sharp-G-A while recognizing the two-sharp signature.',
    coreProblems: ['d-major-position', 'key-signature-orientation', 'right-hand-position', 'left-hand-position'],
    supportingProblems: ['finger-number-mapping', 'position-memory', 'register-placement'],
    drillPurposes: ['Build the right-hand D frame', 'Read the left-hand D map', 'Recall the right-hand pattern', 'Verify the left-hand D frame'],
  },
  'c08-d-major-phrases': {
    learningOutcome: 'Keep the D-major map stable through turns, repeats, skips, and two-hand reading.',
    coreProblems: ['d-major-position', 'position-memory', 'hand-coordination', 'skip-and-turn-reading'],
    supportingProblems: ['key-signature-orientation', 'clef-differentiation', 'rhythm-pulse'],
    drillPurposes: ['Read D major on both staves', 'Recall the D map', 'Apply it to a new two-hand phrase', 'Verify the left-hand frame'],
  },
  'c09-a-major-orientation': {
    learningOutcome: 'Place both hands on A-B-C-sharp-D-E while recognizing the three-sharp signature.',
    coreProblems: ['a-major-position', 'key-signature-orientation', 'right-hand-position', 'left-hand-position'],
    supportingProblems: ['finger-number-mapping', 'position-memory', 'register-placement'],
    drillPurposes: ['Build the right-hand A frame', 'Read the left-hand A map', 'Recall the right-hand pattern', 'Verify the left-hand A frame'],
  },
  'c10-a-major-phrases': {
    learningOutcome: 'Maintain A-major orientation through longer phrases and controlled subdivisions.',
    coreProblems: ['a-major-position', 'position-memory', 'hand-coordination', 'rapid-subdivision'],
    supportingProblems: ['key-signature-orientation', 'clef-differentiation', 'rhythm-pulse'],
    drillPurposes: ['Read A major on both staves', 'Chunk and recall the pattern', 'Apply it to a longer phrase', 'Verify the left-hand frame'],
  },
  'c11-e-major-orientation': {
    learningOutcome: 'Place both hands on E-F-sharp-G-sharp-A-B while recognizing the four-sharp signature.',
    coreProblems: ['e-major-position', 'key-signature-orientation', 'right-hand-position', 'left-hand-position'],
    supportingProblems: ['finger-number-mapping', 'position-memory', 'register-placement'],
    drillPurposes: ['Build the right-hand E frame', 'Read the left-hand E map', 'Recall the right-hand pattern', 'Verify the left-hand E frame'],
  },
  'c12-e-major-phrases': {
    learningOutcome: 'Maintain E-major orientation through longer phrases, skips, and controlled subdivisions.',
    coreProblems: ['e-major-position', 'position-memory', 'hand-coordination', 'rapid-subdivision'],
    supportingProblems: ['key-signature-orientation', 'clef-differentiation', 'skip-and-turn-reading'],
    drillPurposes: ['Read E major on both staves', 'Chunk and recall the pattern', 'Apply it to a longer phrase', 'Verify the left-hand frame'],
  },
  'c13-shift-c-to-g': {
    learningOutcome: 'Move either hand from C to G while both destination phrases remain visible.',
    coreProblems: ['c-to-g-shift', 'hand-shift', 'right-hand-shift', 'left-hand-shift', 'dominant-hand-shift', 'non-dominant-hand-shift'],
    supportingProblems: ['c-position', 'g-major-position', 'register-placement', 'rhythm-pulse'],
    drillPurposes: ['Learn the right-hand landing', 'Stabilize both written positions', 'Recall the destination map', 'Apply the same shift with the left hand'],
  },
  'c14-shift-g-to-d': {
    learningOutcome: 'Move either hand from G to D with a short, always-visible destination phrase.',
    coreProblems: ['g-to-d-shift', 'hand-shift', 'right-hand-shift', 'left-hand-shift', 'dominant-hand-shift', 'non-dominant-hand-shift'],
    supportingProblems: ['g-major-position', 'd-major-position', 'key-signature-orientation', 'rhythm-pulse'],
    drillPurposes: ['Learn the right-hand landing', 'Stabilize both written positions', 'Recall the destination map', 'Apply the same shift with the left hand'],
  },
  'c15-shift-d-to-a': {
    learningOutcome: 'Move either hand from D to A after a generous five-second destination preview.',
    coreProblems: ['d-to-a-shift', 'hand-shift', 'right-hand-shift', 'left-hand-shift', 'dominant-hand-shift', 'non-dominant-hand-shift'],
    supportingProblems: ['d-major-position', 'a-major-position', 'key-signature-orientation', 'rapid-subdivision'],
    drillPurposes: ['Learn the right-hand reveal-and-land routine', 'Stabilize both positions', 'Recall the destination map', 'Repeat the routine with the left hand'],
  },
  'c16-shift-a-to-e': {
    learningOutcome: 'Move either hand from A to E after a 3.5-second preview and retain a compact E chord shape.',
    coreProblems: ['a-to-e-shift', 'hand-shift', 'right-hand-shift', 'left-hand-shift', 'dominant-hand-shift', 'non-dominant-hand-shift'],
    supportingProblems: ['a-major-position', 'e-major-position', 'key-signature-orientation', 'chord-reading', 'chord-simultaneity'],
    drillPurposes: ['Shift the right hand after reveal', 'Secure the left-hand destination chord', 'Recall the destination map', 'Shift the left hand after reveal'],
  },
  'c17-b-fsharp-orientation': {
    learningOutcome: 'Place both hands in B and F-sharp positions before any jump between them is required.',
    coreProblems: ['b-major-position', 'f-sharp-major-position', 'key-signature-orientation', 'right-hand-position', 'left-hand-position'],
    supportingProblems: ['finger-number-mapping', 'register-placement', 'chord-reading', 'chord-simultaneity'],
    drillPurposes: ['Build the right-hand B frame', 'Build the left-hand B frame', 'Build the right-hand F-sharp frame', 'Read a short left-hand F-sharp chord phrase'],
  },
  'c18-shift-b-to-fsharp': {
    learningOutcome: 'Move either hand from B to F-sharp after a two-second destination preview.',
    coreProblems: ['b-to-f-sharp-shift', 'hand-shift', 'right-hand-shift', 'left-hand-shift', 'dominant-hand-shift', 'non-dominant-hand-shift'],
    supportingProblems: ['b-major-position', 'f-sharp-major-position', 'key-signature-orientation', 'chord-reading', 'chord-simultaneity'],
    drillPurposes: ['Shift the right hand after reveal', 'Secure the left-hand destination chord', 'Recall the destination map', 'Shift the left hand after reveal'],
  },
  'c19-anchor-and-shell': {
    learningOutcome: 'Use a supplied root to build and recognize a complete major 1-3-5 chord.',
    coreProblems: ['chord-anchor', 'chord-shell', 'chord-by-ear'],
    supportingProblems: ['chord-reading', 'chord-simultaneity', 'right-hand-position', 'left-hand-position'],
    drillPurposes: ['Hear and build from a shown root', 'Read the same 1-3-5 shape', 'Transfer the heard shape to a new root', 'Verify it as a simultaneous written chord'],
  },
  'c20-complete-the-frame': {
    learningOutcome: 'Read, hear, and play all three tones of a 1-3-5 chord at the same time.',
    coreProblems: ['chord-shell', 'chord-reading', 'chord-simultaneity'],
    supportingProblems: ['chord-anchor', 'chord-by-ear', 'chord-shape-transfer'],
    drillPurposes: ['Read a complete chord', 'Rebuild it from sound and anchor', 'Read the shape on a new root', 'Transfer it to a new heard root'],
  },
  'c21-major-minor-space': {
    learningOutcome: 'Differentiate major from minor by hearing and moving the middle chord tone.',
    coreProblems: ['major-minor-hearing', 'chord-quality-spacing', 'chord-by-ear'],
    supportingProblems: ['chord-shell', 'chord-reading', 'chord-simultaneity', 'chord-shape-transfer'],
    drillPurposes: ['Hear and build the first quality', 'Read its spacing', 'Read the contrasting spacing', 'Hear and build the contrasting quality'],
  },
  'c22-match-anchor-in-texture': {
    learningOutcome: 'Find the bottom note in the broken example and transfer the complete heard chord shape.',
    coreProblems: ['chord-anchor', 'chord-shape-transfer', 'chord-by-ear'],
    supportingProblems: ['major-minor-hearing', 'chord-reading', 'chord-simultaneity'],
    drillPurposes: ['Read a reference chord', 'Match its heard anchor and rebuild', 'Read a contrasting chord', 'Transfer the heard shape to a new anchor'],
  },
  'c23-separate-background-piano': {
    learningOutcome: 'Retain all three chord tones across blocked and broken presentations, then reproduce them together.',
    coreProblems: ['chord-by-ear', 'chord-simultaneity', 'chord-shape-transfer'],
    supportingProblems: ['chord-anchor', 'chord-reading', 'major-minor-hearing', 'chord-shape-transfer'],
    drillPurposes: ['Prime the written shape', 'Retain and rebuild the heard chord', 'Read a new harmonic shape', 'Retain and rebuild a contrasting chord'],
  },
  'c24-carry-shape-through-song': {
    learningOutcome: 'Transfer major and minor chord shapes by ear across the widest root and register range.',
    coreProblems: ['chord-shape-transfer', 'chord-by-ear', 'major-minor-hearing'],
    supportingProblems: ['chord-anchor', 'chord-reading', 'chord-simultaneity', 'chord-quality-spacing'],
    drillPurposes: ['Prime the first written shape', 'Transfer it from the blocked and broken examples', 'Read a contrasting shape', 'Transfer and rebuild the final target'],
  },
};

function interventionProblems(intervention: LessonIntervention): RemediationProblem[] {
  return [...new Set([...intervention.coreProblems, ...intervention.supportingProblems])];
}

/** Public, testable contract used by routing, audits, and external assignment tooling. */
export const CURRICULUM_BLUEPRINT = LESSONS.map((lesson) => {
  const intervention = LESSON_INTERVENTIONS[lesson.id];
  return {
    lesson: lesson.index,
    id: lesson.id,
    difficultyBase: lesson.difficultyBase,
    drills: [...lesson.drills],
    learningOutcome: intervention.learningOutcome,
    coreProblems: [...intervention.coreProblems],
    problemTags: interventionProblems(intervention),
    drillPurposes: [...intervention.drillPurposes] as [string, string, string, string],
  };
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (easy: number, hard: number, difficulty: number): number =>
  Math.round((easy + (hard - easy) * clamp01(difficulty)) * 10) / 10;

const positiveModulo = (value: number, length: number): number =>
  ((Math.trunc(value) % length) + length) % length;

function contourDemand(contour: Contour): number {
  const motion = contour.slice(1).reduce(
    (sum, degree, index) => sum + Math.abs(degree - contour[index]),
    0,
  );
  const largestLeap = contour.slice(1).reduce(
    (largest, degree, index) => Math.max(largest, Math.abs(degree - contour[index])),
    0,
  );
  return contour.length * 2 + motion + largestLeap * 2;
}

/**
 * Select from a real easiest-to-hardest contour ordering.
 *
 * The old stride picker prevented exact repetition, but could make Drill 1
 * angular and Drill 2 stepwise. Sorting by length and interval demand first
 * makes the fixed four-drill sequence perceptibly progressive, while the
 * small slot offset still gives neighbouring drills different melodies.
 */
function progressiveContourPick(
  ordered: readonly Contour[],
  difficulty: number,
  slot: number,
): Contour {
  if (ordered.length <= 1) return ordered[0];
  const ranked = ordered
    .map((contour, sourceIndex) => ({ contour, sourceIndex, demand: contourDemand(contour) }))
    .sort((a, b) => a.demand - b.demand || a.sourceIndex - b.sourceIndex);
  const baseRank = Math.floor(clamp01(difficulty) * (ranked.length - 1) * 0.72);
  const slotOffset = positiveModulo(slot, ranked.length);
  return ranked[Math.min(ranked.length - 1, baseRank + slotOffset)].contour;
}

function cyclePick<T>(items: readonly T[], ordinal: number): T {
  return items[positiveModulo(ordinal, items.length)];
}

const CHROMATIC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function localPitchToMidi(pitch: string): number {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(pitch);
  if (!match) return 60;
  const [, letter, accidental, octaveText] = match;
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter as 'A'];
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octaveText) + 1) * 12 + natural + offset;
}

function midiToScientificPitch(midi: number): string {
  const safe = Math.max(21, Math.min(108, Math.round(midi)));
  return `${CHROMATIC_SHARPS[safe % 12]}${Math.floor(safe / 12) - 1}`;
}

function transposePitch(pitch: string, semitones: number): string {
  return midiToScientificPitch(localPitchToMidi(pitch) + semitones);
}

function pitchOctave(pitch: string): number {
  const match = /(-?\d+)$/.exec(pitch);
  return match ? Number(match[1]) : 4;
}

/**
 * Build an ascending-fifth shift without letting each position clamp its
 * octave independently.
 *
 * `buildPosition(G, 4)` begins on G4 while `buildPosition(D, 4)` begins on
 * D4. Treating the shared `4` as a shared musical register therefore turned
 * G→D, A→E, and B→F# into descending fourths in some later reps. Starting
 * from the realised first root and deriving the destination root by MIDI
 * keeps every displayed arrow, expected pitch, and transition grade on the
 * same seven-semitone movement. If the preferred treble octave would exceed
 * the engraving ceiling, the complete pair moves down together.
 */
export function buildAscendingFifthPair(
  pair: readonly [PositionTemplate, PositionTemplate],
  preferredOctave: number,
): readonly [ReturnType<typeof buildPosition>, ReturnType<typeof buildPosition>] {
  for (let octaveDrop = 0; octaveDrop < 4; octaveDrop += 1) {
    const from = buildPosition(pair[0], preferredOctave - octaveDrop);
    const wantedToMidi = localPitchToMidi(from.sci[0]) + 7;
    const wantedToPitch = midiToScientificPitch(wantedToMidi);
    const to = buildPosition(pair[1], pitchOctave(wantedToPitch));
    if (localPitchToMidi(to.sci[0]) === wantedToMidi) return [from, to];
  }

  // Every production pair is a perfect fifth and fits within the curriculum
  // range. Keep a deterministic fallback so malformed future data still
  // produces a playable question instead of crashing the lesson router.
  const from = buildPosition(pair[0], preferredOctave);
  const to = buildPosition(pair[1], pitchOctave(transposePitch(from.sci[0], 7)));
  return [from, to];
}

function scientificToVex(pitch: string): string {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(pitch);
  if (!match) return 'c/4';
  return `${match[1].toLowerCase()}${match[2]}/${match[3]}`;
}

function vexToScientificPitch(key: string): string | null {
  const match = /^([a-g])([#b]?)\/(-?\d+)$/i.exec(key);
  if (!match) return null;
  return `${match[1].toUpperCase()}${match[2]}${match[3]}`;
}

/** Attach one deterministic position check without replacing the real drill. */
function withPositionProof(question: Question, preferredHand: Hand): Question {
  if (question.positionProof) return question;

  const hand = question.handScope === 'left' ? 'left' : preferredHand;
  const staff = question.cue.staves.find((candidate) => candidate.hand === hand)
    ?? question.cue.staves[0];
  const writtenPitches = staff?.notes.flatMap((note) =>
    note.duration.endsWith('r')
      ? []
      : note.keys.map(vexToScientificPitch).filter((pitch): pitch is string => pitch !== null)
  ) ?? [];
  // Chord-by-ear must not leak its unknown middle tone in the preceding
  // position check. Use root, adjacent key, and outer fifth as a neutral hand
  // warm-up; the real chord quality remains something the student hears.
  const spatialWarmup = question.spatialChord
    ? [
        question.spatialChord.rootPitch,
        transposePitch(question.spatialChord.rootPitch, 2),
        transposePitch(question.spatialChord.rootPitch, 7),
      ]
    : null;
  const sourcePitches = spatialWarmup
    ?? (writtenPitches.length > 0 ? writtenPitches : question.expectedSequence);
  const uniquePitches = [...new Set(sourcePitches)]
    .sort((a, b) => localPitchToMidi(a) - localPitchToMidi(b));
  const fallbackRoot = uniquePitches[0] ?? question.expectedSequence[0] ?? 'C4';
  while (uniquePitches.length < 3) {
    uniquePitches.push(transposePitch(fallbackRoot, uniquePitches.length === 1 ? 4 : 7));
  }
  const middleIndex = Math.floor((uniquePitches.length - 1) / 2);
  const anchors = [
    uniquePitches[0],
    uniquePitches[middleIndex],
    uniquePitches[uniquePitches.length - 1],
  ] as [string, string, string];
  const fingers = question.spatialChord
    ? hand === 'right' ? ([1, 2, 5] as const) : ([5, 4, 1] as const)
    : hand === 'right' ? ([1, 3, 5] as const) : ([5, 3, 1] as const);
  const positionName = question.spatialChord
    ? `${question.spatialChord.rootPitch.replace(/-?\d+$/, '')} Position`
    : question.positionLabel
        .replace(/\s+[—→].*$/, '')
        .replace(/\s+\([^)]*\)$/, '')
        .trim();
  const positionProof: PositionProofSpec = {
    positionName,
    hand,
    proofNotes: anchors.map((pitch, index) => ({ pitch, finger: fingers[index] })) as PositionProofSpec['proofNotes'],
    requireHeld: false,
    acceptWindowMs: 5500,
  };
  return { ...question, positionProof };
}

function chordPitches(rootPitch: string, quality: ChordQuality): [string, string, string] {
  return [
    rootPitch,
    transposePitch(rootPitch, quality === 'major' ? 4 : 3),
    transposePitch(rootPitch, 7),
  ];
}

/**
 * A real grand-staff question: right hand and left hand trade the notes of
 * one shared contour, one note at a time, each in its own register. Every
 * beat slot has exactly one sounded note (on whichever hand's turn it is)
 * and a rest on the other staff — never two pitches at once — so the
 * existing single-pitch-at-a-time detector and timing.ts's beat-merged
 * `planFor` (see there) grade it exactly like any other exercise. This is
 * what actually makes the drill require both hands: the notation shows two
 * staves and the student must physically move between them mid-phrase,
 * even though acoustic detection only ever expects one pitch at a time.
 */
function twoHandStandardQuestion(
  lesson: LessonRecipe,
  rightPosition: Position,
  contour: Contour,
  beatsPerBar: number,
  ordinal: number,
  materialIndex: number,
  difficulty: number,
  mode: GenerationMode,
  rand: () => number,
  modeDifficulty: number,
  /** Wraps the notation onto a second stacked grand-staff system once the
   * (already-lengthened) contour runs past `measuresPerSystem` measures. */
  measuresPerSystem?: number,
): Question {
  const leftOctave = cyclePick(lesson.leftOctaves, materialIndex + 1);
  const leftPosition = buildPosition(rightPosition.template, leftOctave);
  // A rest still needs a staff line to sit on — VexFlow's Accidental.
  // applyAccidentals explicitly skips rests (t.isRest() short-circuits it),
  // so there's no accidental-safety concern here; these are simply each
  // clef's conventional centered rest position (the middle line).
  const rightRestKey = 'b/4';
  const leftRestKey = 'd/3';

  const rightNotes: CueNote[] = [];
  const leftNotes: CueNote[] = [];
  const expectedSequence: string[] = [];

  // Switching hands on every single note turned one melodic contour into a
  // note-by-note ping-pong between two octave-apart registers — a leap on
  // every attack, never a phrase either hand could actually play. Handing
  // each hand a full bar at a time keeps the contour's own stepwise motion
  // intact within a turn (real "hands take turns" phrasing) and confines
  // the register jump to once per hand-off instead of every note.
  const groupSize = Math.max(1, beatsPerBar);

  contour.forEach((degree, index) => {
    const onRight = Math.floor(index / groupSize) % 2 === 0;
    expectedSequence.push(onRight ? rightPosition.sci[degree] : leftPosition.sci[degree]);
    rightNotes.push(
      onRight
        ? { keys: [rightPosition.vf[degree]], duration: 'q', finger: fingerFor(degree, 'right'), anchor: index === 0 }
        : { keys: [rightRestKey], duration: 'qr' },
    );
    leftNotes.push(
      onRight
        ? { keys: [leftRestKey], duration: 'qr' }
        : { keys: [leftPosition.vf[degree]], duration: 'q', finger: fingerFor(degree, 'left') },
    );
  });

  // Generate one shared rhythm lane, then mirror every duration onto the
  // sounding note and the other hand's rest. This preserves real eighth/
  // sixteenth development without letting the grand staves drift apart.
  const handoffIndices = Array.from(
    { length: Math.max(0, Math.ceil(contour.length / groupSize) - 1) },
    (_, index) => (index + 1) * groupSize,
  ).flatMap((index) => [index - 1, index]);
  const rhythmicSlots = applyRhythm(
    contour.map((degree) => ({ keys: [rightPosition.vf[degree]], duration: 'q' })),
    beatsPerBar,
    rand,
    Math.min(lesson.index, 12),
    handoffIndices,
  );
  rhythmicSlots.forEach((slot, index) => {
    const duration = slot.duration.replace(/r$/, '');
    rightNotes[index] = {
      ...rightNotes[index],
      duration: rightNotes[index].duration.endsWith('r') ? `${duration}r` : duration,
    };
    leftNotes[index] = {
      ...leftNotes[index],
      duration: leftNotes[index].duration.endsWith('r') ? `${duration}r` : duration,
    };
  });

  return {
    id: `${lesson.id}#${ordinal}`,
    conceptId: lesson.id,
    exerciseMode: 'standard',
    handScope: 'both',
    instruction: 'Hands take turns — right, then left. Play the phrase after the count-in.',
    cue: {
      keySignature: lesson.showKeySignature ? rightPosition.template.keySignature : 'C',
      timeSignature: `${beatsPerBar}/4`,
      staves: [
        { clef: 'treble', hand: 'right', notes: rightNotes },
        { clef: 'bass', hand: 'left', notes: leftNotes },
      ],
      ...(measuresPerSystem ? { measuresPerSystem } : {}),
    },
    expectedSequence,
    tempoWindowSec: lerp(lesson.tempoEasy, lesson.tempoHard, modeDifficulty),
    positionLabel: `${rightPosition.label} — both hands`,
    difficulty,
    mode,
  };
}

/**
 * Late standard reading keeps a melodic line, but adds genuine stacked
 * attacks so chord reading and the polyphonic microphone path are exercised
 * before the dedicated chord-by-ear sequence takes over.
 */
function chordalStandardQuestion(
  lesson: LessonRecipe,
  ordinal: number,
  questionNumber: number,
  difficulty: number,
  mode: GenerationMode,
  modeDifficulty: number,
  hand: Hand,
): Question {
  const octavePool = hand === 'right' ? lesson.rightOctaves : lesson.leftOctaves;
  const positionTemplate = cyclePick(lesson.positions, questionNumber - 1);
  const octave = cyclePick(
    octavePool,
    Math.floor((questionNumber - 1) / lesson.positions.length),
  );
  const position = buildPosition(positionTemplate, octave);
  const phraseBanks: readonly (readonly (readonly number[])[])[] = lesson.index === 17
    ? [
      [[0], [1], [2], [1], [0, 2, 4]],
      [[2], [1], [0], [1], [0, 2, 4]],
      [[0], [1], [2], [3], [0, 2, 4]],
    ]
    : [
      [[0, 2, 4], [1], [2], [0, 2, 4], [4], [3], [0, 4], [0, 2, 4]],
      [[0], [1], [0, 2, 4], [2], [3], [4], [0, 4], [0, 2, 4]],
      [[4], [3], [0, 2, 4], [1], [2], [1], [0, 4], [0, 2, 4]],
    ];
  const events = cyclePick(phraseBanks, questionNumber - 1);
  const notes: CueNote[] = events.map((degrees, index) => ({
    keys: degrees.map((degree) => position.vf[degree]),
    duration: 'q',
    ...(degrees.length === 1 ? { finger: fingerFor(degrees[0], hand) } : {}),
    anchor: index === 0,
  }));
  const restKey = hand === 'right' ? 'b/4' : 'd/3';
  const paddingBeats = positiveModulo(-events.length, 4);
  for (let index = 0; index < paddingBeats; index += 1) {
    notes.push({ keys: [restKey], duration: 'qr' });
  }

  return {
    id: `${lesson.id}#${ordinal}`,
    conceptId: lesson.id,
    exerciseMode: 'standard',
    handScope: hand,
    instruction: 'Read the phrase. Play every stacked chord together.',
    cue: {
      keySignature: lesson.showKeySignature ? position.template.keySignature : 'C',
      timeSignature: '4/4',
      staves: [{ clef: hand === 'right' ? 'treble' : 'bass', hand, notes }],
    },
    // Chord pitches stay adjacent here because planFor maps every pitch from
    // one CueNote to the same beat.
    expectedSequence: events.flatMap((degrees) =>
      degrees.map((degree) => position.sci[degree]),
    ),
    tempoWindowSec: lerp(lesson.tempoEasy, lesson.tempoHard, modeDifficulty),
    positionLabel: `${position.label} — chord phrase`,
    difficulty,
    mode,
  };
}

function spatialChordQuestion(
  lesson: LessonRecipe,
  recipe: SpatialChordRecipe,
  ordinal: number,
  questionNumber: number,
  difficulty: number,
  mode: GenerationMode,
  hand: Hand,
): Question {
  const localRep = positiveModulo(questionNumber - 1, BASE_QUESTIONS);
  // Recipe lists are pedagogical order, not merely random pools. Keying this
  // to the global ordinal made an earlier adaptive extension silently rotate
  // every later chord lesson: a learner could meet F-sharp first in Lesson 24
  // simply because they needed extra practice in Lesson 6. Local rep order
  // keeps each lesson's intended easiest-to-hardest sequence stable.
  // Dedicated chord lessons should not all restart on C. Preserve the
  // within-lesson progression while rotating each lesson's starting root.
  const lessonRootOffset = lesson.exerciseMode === 'spatial-chord'
    ? Math.max(0, (lesson.index - 19) * 2)
    : 0;
  const rootTemplate = cyclePick(recipe.roots, localRep + lessonRootOffset);
  // Two ear drills in one four-slot lesson must contrast qualities instead of
  // accidentally selecting only the odd (minor) entries at slots 2 and 4.
  const quality = cyclePick(recipe.qualities, Math.floor(localRep / 2));
  const octavePool = hand === 'right' ? lesson.rightOctaves : lesson.leftOctaves;
  // Ear work stays in the already-established register until the dedicated
  // chord phase. Octave displacement is a separate motor skill and must not
  // be smuggled into the first anchor/shape exercises.
  const octave = lesson.index < 19 ? octavePool[0] : cyclePick(octavePool, localRep);
  const position = buildPosition(rootTemplate, octave);
  const pitches = chordPitches(position.sci[0], quality);
  const rootName = pitches[0].replace(/-?\d+$/, '');
  const chordName = `${rootName} ${quality === 'major' ? 'Major' : 'Minor'}`;
  const fingers = hand === 'right' ? ([1, 3, 5] as const) : ([5, 3, 1] as const);
  // The screen, piano demonstration, and staff all use the same physical
  // order: root, third, fifth—the conventional 1-3-5 chord shape.
  const buildOrder = [0, 1, 2] as const;
  const cueNotes: CueNote[] = buildOrder.map((pitchIndex) => ({
    keys: [scientificToVex(pitches[pitchIndex])],
    duration: 'q',
    finger: fingers[pitchIndex],
    anchor: pitchIndex === 0,
  }));
  // Product contract: chord-by-ear contains exactly the target chord and the
  // same three notes broken bottom-to-top. `useDrillAudio` schedules those two
  // piano examples; no contextual harmony or background layer is permitted.
  const progression = [[...pitches]];
  const spatialChord: SpatialChordSpec = {
    chordName,
    hand,
    quality,
    rootPitch: pitches[0],
    chordPitches: pitches,
    intervals: [quality === 'major' ? 4 : 3, 7],
    rootSupport: recipe.rootSupport,
    buildOrder: [0, 1, 2],
    context: {
      targetInstrument: 'piano',
      layers: [],
      progression,
      targetChordIndex: 0,
      secondsPerChord: Math.max(0.95, 1.35 - difficulty * 0.22),
      targetRepeats: 1,
    },
    rootSearchSeconds: recipe.rootSearchSeconds,
    shapeSearchSeconds: recipe.shapeSearchSeconds,
    maxWrongGuesses: recipe.maxWrongGuesses,
  };

  return {
    id: `${lesson.id}#${ordinal}`,
    conceptId: lesson.id,
    exerciseMode: 'spatial-chord',
    handScope: hand,
    instruction: lesson.instruction,
    cue: {
      keySignature: quality === 'major' ? position.template.keySignature : 'C',
      timeSignature: '3/4',
      staves: [{
        clef: hand === 'right' ? 'treble' : 'bass',
        hand,
        notes: cueNotes,
      }],
    },
    expectedSequence: buildOrder.map((index) => pitches[index]),
    tempoWindowSec: recipe.rootSearchSeconds + recipe.shapeSearchSeconds,
    positionLabel: `${chordName} chord (${pitches[0]})`,
    difficulty,
    mode,
    spatialChord,
  };
}

function questionFor(
  lesson: LessonRecipe,
  ordinal: number,
  _rand: () => number,
  _difficulty: number,
  mode: GenerationMode,
  questionNumber = 1,
): Question {
  const localRep = positiveModulo(questionNumber - 1, lesson.drills.length);
  const drillKind = cyclePick(lesson.drills, localRep);
  const fixedDifficulty = clamp01(lesson.difficultyBase + localRep * 0.012);
  const modeDifficulty = fixedDifficulty;
  const materialIndex = lesson.index * BASE_QUESTIONS + localRep;
  const rand = makeRandom(20260826 + lesson.index * 4099 + localRep * 131);

  // Local question number, not global ordinal, guarantees a fixed hand order
  // even after an earlier lesson grows remedial repeats.
  const hand = lesson.hands[localRep % lesson.hands.length];
  const clef = hand === 'right' ? 'treble' : 'bass';
  const octavePool = hand === 'right' ? lesson.rightOctaves : lesson.leftOctaves;

  if (drillKind === 'chord-reading') {
    return withPositionProof(chordalStandardQuestion(
      lesson,
      ordinal,
      localRep + 1,
      fixedDifficulty,
      mode,
      modeDifficulty,
      hand,
    ), hand);
  }

  if (
    drillKind === 'spatial-chord' &&
    lesson.spatialChord &&
    (lesson.exerciseMode === 'spatial-chord' || lesson.spatialChord.questionNumbers.length > 0)
  ) {
    return withPositionProof(spatialChordQuestion(
      lesson,
      lesson.spatialChord,
      ordinal,
      questionNumber,
      fixedDifficulty,
      mode,
      hand,
    ), hand);
  }

  if (drillKind === 'anchor-shift' && lesson.shiftPairs?.length) {
    const pair = cyclePick(lesson.shiftPairs, localRep);
    const octave = cyclePick(octavePool, Math.floor(localRep / lesson.shiftPairs.length));
    const [from, to] = buildAscendingFifthPair(pair, octave);
    const openingPool: readonly Contour[] = [
      [0, 1, 2],
      [2, 1, 0],
      [0, 2, 1],
      [1, 0, 2],
      [2, 0, 1],
      [0, 1, 3],
    ];
    const fullLandingPool: readonly Contour[] = [
      [0, 1, 2, 3, 2, 0],
      [0, 2, 1, 3, 2, 0],
      [2, 3, 1, 4, 2, 0],
      [0, 3, 2, 1, 2, 0],
      [4, 2, 3, 1, 2, 0],
      [1, 3, 2, 4, 2, 0],
      [0, 2, 4, 3, 1, 0],
      [3, 1, 2, 4, 2, 0],
    ];
    // The physical switch is introduced before phrase complexity. Lessons
    // 13-15 use only three/four destination notes; later switches expand
    // gradually, never jumping straight to a dense six-note landing.
    const landingLength = lesson.index <= 13 ? 3 : lesson.index <= 15 ? 4 : 5;
    const landingPool = fullLandingPool.map((contour) => contour.slice(0, landingLength));
    const opening = progressiveContourPick(openingPool, modeDifficulty, localRep);
    const landing = progressiveContourPick(landingPool, modeDifficulty, localRep + 1);
    const splitIndex = opening.length;
    const degrees = [...opening, ...landing];
    const notes: CueNote[] = degrees.map((degree, index) => {
      const inLanding = index >= splitIndex;
      const activePosition = inLanding ? to : from;
      return {
        keys: [activePosition.vf[degree]],
        duration: 'q',
        finger: fingerFor(degree, hand),
        anchor: index === 0 || index === splitIndex,
      };
    });
    const expectedSequence = [
      ...opening.map((degree) => from.sci[degree]),
      ...landing.map((degree) => to.sci[degree]),
    ];
    const fromName = `${from.template.id} Major`;
    const toName = `${to.template.id === 'F#' ? 'F-sharp' : to.template.id} Major`;
    const allowedExtraBeats = Math.max(
      0.42,
      1.1 - (lesson.index - 13) * 0.12 - modeDifficulty * 0.18,
    );
    const waitSeconds = lesson.index === 15 ? 5 : lesson.index === 16 ? 3.5 : 2;
    const stagedReveal = lesson.index >= 15;

    return withPositionProof({
      id: `${lesson.id}#${ordinal}`,
      conceptId: lesson.id,
      exerciseMode: 'anchor-shift',
      // This generated drill has one staff and one active hand. `both` is
      // reserved for a question that genuinely presents both hands at once;
      // alternating hands across a lesson must not mislabel the current rep.
      handScope: hand,
      instruction: stagedReveal
        ? `Play ${fromName}. Then study the newly revealed ${toName} phrase for ${waitSeconds} seconds before playing it.`
        : lesson.instruction,
      cue: {
        // The destination signature covers the sharper landing. Naturals are
        // applied automatically when the opening position needs one.
        keySignature: to.template.keySignature,
        timeSignature: '4/4',
        staves: [{
          clef,
          hand,
          // Never place an eighth/sixteenth group across the hand-off. Both
          // boundary attacks retain a full beat so the movement is physically
          // possible, while later lessons still receive faster rhythm elsewhere.
          notes: applyRhythm(
            notes,
            4,
            rand,
            Math.min(lesson.index, 12),
            [splitIndex - 1, splitIndex],
          ),
        }],
      },
      expectedSequence,
      tempoWindowSec: lerp(lesson.tempoEasy, lesson.tempoHard, modeDifficulty),
      positionLabel: `${from.label} → ${to.label}`,
      difficulty: fixedDifficulty,
      mode,
      anchorShift: {
        fromPositionName: fromName,
        toPositionName: toName,
        splitIndex,
        allowedExtraBeats,
        ...(stagedReveal
          ? { timedShift: { waitSeconds, revealSecond: true } }
          : {}),
      },
    }, hand);
  }

  // Position introductions must not depend on how many adaptive drills were
  // added earlier. Lesson 17 deliberately uses B, B, F-sharp, F-sharp so both
  // hands establish each map before the following B-to-F-sharp lesson.
  const positionTemplate = cyclePick(lesson.positions, localRep);
  const octave = cyclePick(
    octavePool,
    Math.floor(localRep / lesson.positions.length),
  );
  const position = buildPosition(positionTemplate, octave);
  const exerciseMode: ExerciseMode = drillKind === 'blind-memory'
    ? 'blind-memory'
    : drillKind === 'prove-it'
      ? 'prove-it'
      : 'standard';

  const memoryPool = lesson.index >= 9 ? MEMORY_LONG_PATTERNS : MEMORY_SHORT_PATTERNS;
  const contour = progressiveContourPick(
    exerciseMode === 'blind-memory' ? memoryPool : lesson.contours,
    modeDifficulty,
    localRep,
  );
  const memoryPreviewSeconds = contour.length >= 10
    ? LONG_MEMORY_PREVIEW_SECONDS
    : SHORT_MEMORY_PREVIEW_SECONDS;
  const beatsPerBar = cyclePick(lesson.meters, localRep);

  // Genuine two-hand grand-staff questions begin with Lesson 4, whose entire
  // purpose is differentiating treble/bass while coordinating both hands.
  // Later standard reps use chordalStandardQuestion above. Scoped to
  // 'standard' — prove-it/blind-memory/anchor-shift/
  // spatial-chord already teach hand alternation or coordination in their
  // own way (see c04's dedicated single-hand support drills, and every
  // BOTH_HANDS lesson's R/L/R rep cycle), and forcing simultaneous two-hand
  // chords into a memory-recall or chord-search exercise would need real
  // polyphonic detection tuned for that purpose — not worth the risk for no
  // clear teaching benefit.
  const isTwoHandLesson = lesson.index >= 4;
  if (exerciseMode === 'standard' && isTwoHandLesson) {
    // Longer phrases for the tail of the standard-exercise arc: 60% of
    // reps get roughly 1.5-2x the usual length, wrapped onto a second
    // stacked grand-staff system instead of one ever-widening line.
    const extendLength = lesson.index >= 11 && localRep >= 2;
    // Capped to exactly two systems' worth of notes (StaffCue.tsx wraps at
    // `measuresPerSystem` measures = `measuresPerSystem * beatsPerBar`
    // quarter notes) — "1.5 to 2 lines", never a stray third line, even
    // when both concatenated contours happen to run long.
    const notesPerSystem = 2 * beatsPerBar;
    // Two independently-picked contours glued together can open the second
    // one on a degree far from where the first just resolved — an arbitrary
    // leap that reads as "two unrelated phrases," not one longer idea.
    // Trying a couple of deterministic candidates and keeping whichever
    // opens closest to the first phrase's last note keeps the seam a
    // plausible melodic step instead of a coin-flip jump.
    const continuationCandidates = [1, 2, 3].map((offset) =>
      progressiveContourPick(lesson.contours, modeDifficulty, localRep + offset),
    );
    const lastDegree = contour[contour.length - 1];
    const continuation = continuationCandidates.reduce((best, candidate) =>
      Math.abs(candidate[0] - lastDegree) < Math.abs(best[0] - lastDegree) ? candidate : best,
    );
    const standardContour = extendLength
      ? [...contour, ...continuation].slice(0, notesPerSystem * 2)
      : contour;
    return withPositionProof(twoHandStandardQuestion(
      lesson, position, standardContour, beatsPerBar, ordinal, materialIndex,
      fixedDifficulty, mode, rand, modeDifficulty,
      extendLength ? 2 : undefined,
    ), hand);
  }

  const notes: CueNote[] = contour.map((degree, index) => ({
    keys: [position.vf[degree]],
    duration: 'q',
    finger: fingerFor(degree, hand),
    anchor: index === 0,
  }));

  return withPositionProof({
    id: `${lesson.id}#${ordinal}`,
    conceptId: lesson.id,
    exerciseMode,
    handScope: hand,
    instruction: exerciseMode === 'blind-memory'
      ? `Look for ${memoryPreviewSeconds} seconds. Find the pattern, then play it from memory.`
      : 'Read the phrase and play it after the count-in.',
    cue: {
      keySignature: lesson.showKeySignature ? position.template.keySignature : 'C',
      timeSignature: `${beatsPerBar}/4`,
      staves: [{
        clef,
        hand,
        // From Lesson 13 onward the new difficulty is movement, deep-key
        // orientation, or polyphony. Do not simultaneously escalate to
        // sixteenths; retain the established eighth-note vocabulary.
        notes: applyRhythm(notes, beatsPerBar, rand, Math.min(lesson.index, 12)),
      }],
    },
    expectedSequence: contour.map((degree) => position.sci[degree]),
    tempoWindowSec: lerp(lesson.tempoEasy, lesson.tempoHard, modeDifficulty),
    positionLabel: position.label,
    difficulty: fixedDifficulty,
    mode,
    ...(exerciseMode === 'prove-it'
      ? {
          positionProof: {
            positionName: `${position.template.id === 'F#' ? 'F-sharp' : position.template.id} Position`,
            hand,
            proofNotes: hand === 'right'
              ? [
                  { pitch: position.sci[0], finger: 1 as const },
                  { pitch: position.sci[2], finger: 3 as const },
                  { pitch: position.sci[4], finger: 5 as const },
                ]
              : [
                  // A left-hand triad is physically mirrored. Reusing the RH
                  // 1–2–3 labels made every LH Prove It screen teach the wrong
                  // fingers even though the microphone expected the right notes.
                  { pitch: position.sci[0], finger: 5 as const },
                  { pitch: position.sci[2], finger: 3 as const },
                  { pitch: position.sci[4], finger: 1 as const },
                ],
            // Prove It confirms the three anchor notes in order. Acoustic
            // release tracking is too room-dependent to require the child to
            // sustain earlier keys while adding the next finger.
            requireHeld: false,
            acceptWindowMs: 5500,
          },
        }
      : {}),
    ...(exerciseMode === 'blind-memory'
      ? { blindMemory: { previewSeconds: memoryPreviewSeconds, hideStyle: 'vanish' as const } }
      : {}),
  }, hand);
}

export const PROGRESSIVE_CONCEPTS: LessonDefinition[] = LESSONS.map((lesson) => {
  const intervention = LESSON_INTERVENTIONS[lesson.id];
  return {
    id: lesson.id,
    index: lesson.index,
    phase: lesson.phase,
    phaseLabel: lesson.phaseLabel,
    title: lesson.title,
    focus: lesson.focus,
    primaryProblem: intervention.coreProblems[0],
    coreProblems: intervention.coreProblems,
    problemTags: interventionProblems(intervention),
    learningOutcome: intervention.learningOutcome,
    drillPurposes: intervention.drillPurposes,
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    exerciseMode: lesson.exerciseMode,
    generate: (ordinal, rand, difficulty, mode, questionNumber) =>
      questionFor(lesson, ordinal, rand, difficulty, mode, questionNumber),
  };
});

/** Best-fit interventions first; incidental reinforcement never steals a referral. */
export function lessonsForProblem(problem: RemediationProblem): LessonDefinition[] {
  return PROGRESSIVE_CONCEPTS
    .filter((lesson) => lesson.problemTags.includes(problem))
    .sort((a, b) => (
      Number(b.coreProblems.includes(problem)) - Number(a.coreProblems.includes(problem)) ||
      a.index - b.index
    ));
}

/** Direct-entry lesson for a verified instructor diagnosis. */
export function openingLessonForProblem(problem: RemediationProblem): number {
  return lessonsForProblem(problem)[0]?.index ?? 1;
}
