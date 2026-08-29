import type {
  ChordQuality,
  CueNote,
  ExerciseMode,
  GenerationMode,
  Hand,
  LessonDefinition,
  PhaseId,
  Question,
  RemediationProblem,
  SpatialChordSpec,
  SpatialInstrumentLayer,
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
  layers: readonly SpatialInstrumentLayer[];
  /** 1 = isolated target; 2–4 = increasingly contextual progression. */
  progressionLength: 1 | 2 | 3 | 4;
  targetRepeats: number;
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
    drills: ['prove-it', 'standard', 'standard', 'prove-it'], difficultyBase: 0.04,
  },
  {
    id: 'c02-rh-musical-phrases', index: 2, phase: 0, phaseLabel: 'Right hand foundations',
    title: 'Shape a right-hand phrase', focus: 'Read steps, turns, and gentle repeats without moving the hand.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: RH, positions: [C, G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED], meters: [4, 3],
    showKeySignature: false, tempoEasy: 14.5, tempoHard: 13,
    drills: ['standard', 'prove-it', 'blind-memory', 'standard'], difficultyBase: 0.08,
  },
  {
    id: 'c03-lh-c-position', index: 3, phase: 0, phaseLabel: 'Left hand foundations',
    title: 'Meet the left hand', focus: 'Learn bass-clef C position before adding any sharps.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: LH, positions: [C], rightOctaves: [4], leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: false,
    tempoEasy: 15, tempoHard: 13.8,
    drills: ['prove-it', 'standard', 'standard', 'prove-it'], difficultyBase: 0.07,
  },
  {
    id: 'c04-two-hand-white-keys', index: 4, phase: 0, phaseLabel: 'Two-hand foundations',
    title: 'White-key phrases', focus: 'Alternate hands while the pitch language stays familiar.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: BOTH_HANDS, positions: [C, G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: false, tempoEasy: 14, tempoHard: 12.5,
    drills: ['standard', 'prove-it', 'blind-memory', 'standard'], difficultyBase: 0.12,
  },
  {
    id: 'c05-g-major-orientation', index: 5, phase: 1, phaseLabel: 'One sharp',
    title: 'G major: one sharp', focus: 'Meet F-sharp in an otherwise familiar five-finger shape.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14.5, tempoHard: 13,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.17,
  },
  {
    id: 'c06-g-major-phrases', index: 6, phase: 1, phaseLabel: 'One sharp',
    title: 'Sing in G major', focus: 'Use one sharp inside complete tonal phrases.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 14, tempoHard: 12.4,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.22,
  },
  {
    id: 'c07-d-major-orientation', index: 7, phase: 1, phaseLabel: 'Two sharps',
    title: 'D major: two sharps', focus: 'Add C-sharp while keeping the phrase stepwise.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14, tempoHard: 12.8,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.27,
  },
  {
    id: 'c08-d-major-phrases', index: 8, phase: 1, phaseLabel: 'Two sharps',
    title: 'Shape D-major melodies', focus: 'Combine two sharps with turns, repeats, and gentle skips.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.32,
  },
  {
    id: 'c09-a-major-orientation', index: 9, phase: 2, phaseLabel: 'Three sharps',
    title: 'A major: three sharps', focus: 'Add G-sharp after G- and D-major feel secure.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.8, tempoHard: 12.4,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.37,
  },
  {
    id: 'c10-a-major-phrases', index: 10, phase: 2, phaseLabel: 'Three sharps',
    title: 'Flow through A major', focus: 'Keep three sharps stable through a longer phrase.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.2, tempoHard: 11.8,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.42,
  },
  {
    id: 'c11-e-major-orientation', index: 11, phase: 2, phaseLabel: 'Four sharps',
    title: 'E major: four sharps', focus: 'Add D-sharp with a calm, compact melodic path.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    drills: ['prove-it', 'standard', 'blind-memory', 'prove-it'], difficultyBase: 0.47,
  },
  {
    id: 'c12-e-major-phrases', index: 12, phase: 2, phaseLabel: 'Four sharps',
    title: 'Color E-major phrases', focus: 'Read four sharps through repeated ideas and skips.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    drills: ['standard', 'blind-memory', 'standard', 'prove-it'], difficultyBase: 0.52,
  },
  {
    id: 'c13-shift-c-to-g', index: 13, phase: 3, phaseLabel: 'Anchor and shift',
    title: 'Leap from C to G', focus: 'Release one known position and land a fifth away without searching.',
    instruction: 'Play C. Move to G. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [C, G],
    rightOctaves: TREBLE, leftOctaves: [3], contours: MUSICAL_GENTLE_SKIPS,
    meters: [4], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    drills: ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'], difficultyBase: 0.40,
    shiftPairs: [[C, G]],
  },
  {
    id: 'c14-shift-g-to-d', index: 14, phase: 3, phaseLabel: 'Anchor and shift',
    title: 'Leap from G to D', focus: 'Move between one- and two-sharp hand maps in time.',
    instruction: 'Play G. Move to D. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [G, D],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: MUSICAL_GENTLE_SKIPS,
    meters: [4], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    drills: ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'], difficultyBase: 0.47,
    shiftPairs: [[G, D]],
  },
  {
    id: 'c15-shift-d-to-a', index: 15, phase: 4, phaseLabel: 'Anchor and shift',
    title: 'Leap from D to A', focus: 'Transfer the same tactile shape into a three-sharp landing.',
    instruction: 'Play D. Move to A. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [D, A],
    rightOctaves: TREBLE, leftOctaves: [3], contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.2,
    drills: ['anchor-shift', 'standard', 'blind-memory', 'anchor-shift'], difficultyBase: 0.54,
    shiftPairs: [[D, A]],
  },
  {
    id: 'c16-shift-a-to-e', index: 16, phase: 4, phaseLabel: 'Anchor and shift',
    title: 'Leap from A to E', focus: 'Keep orientation while moving into a four-sharp position.',
    instruction: 'Play A. Move to E. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [A, E],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.3, tempoHard: 10.7,
    drills: ['anchor-shift', 'chord-reading', 'blind-memory', 'anchor-shift'], difficultyBase: 0.60,
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
    drills: ['prove-it', 'prove-it', 'prove-it', 'chord-reading'], difficultyBase: 0.50,
  },
  {
    id: 'c18-shift-b-to-fsharp', index: 18, phase: 5, phaseLabel: 'Five and six sharps',
    title: 'Move from B to F-sharp', focus: 'Move only after both five- and six-sharp hand maps have been established.',
    instruction: 'Play B. Move to F-sharp. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [B, FS],
    rightOctaves: [4], leftOctaves: [3], contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.2,
    drills: ['anchor-shift', 'chord-reading', 'blind-memory', 'anchor-shift'], difficultyBase: 0.62,
    shiftPairs: [[B, FS]],
  },
  {
    id: 'c19-anchor-and-shell', index: 19, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Anchor, then build', focus: 'Start from a supplied root, add the third, then complete the chord with the fifth.',
    instruction: 'Place the anchor. Add the middle, then the outside note.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D],
    rightOctaves: [4], leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 14, tempoHard: 13,
    drills: ['spatial-chord', 'chord-reading', 'spatial-chord', 'chord-reading'], difficultyBase: 0.58,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D], qualities: ['major'], rootSupport: 'shown',
      layers: [], progressionLength: 1, targetRepeats: 2, rootSearchSeconds: 9,
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
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.64,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major'], rootSupport: 'shown',
      layers: ['pad'], progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 8.5,
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
    drills: ['spatial-chord', 'chord-reading', 'chord-reading', 'spatial-chord'], difficultyBase: 0.70,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major', 'minor'], rootSupport: 'shown',
      layers: ['pad', 'bass'], progressionLength: 2, targetRepeats: 2,
      rootSearchSeconds: 8, shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c22-match-anchor-in-texture', index: 22, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Match an anchor in texture', focus: 'Match an isolated reference note, then rebuild the chord in 1-3-5 order.',
    instruction: 'Match the anchor. Build the same shape.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.8,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.76,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B], qualities: ['major', 'minor'], rootSupport: 'matched',
      layers: ['pad', 'bass', 'pulse'], progressionLength: 3, targetRepeats: 2,
      rootSearchSeconds: 8, shapeSearchSeconds: 9.5, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c23-separate-background-piano', index: 23, phase: 7, phaseLabel: 'Background harmony',
    title: 'Separate the background piano', focus: 'Track the centered piano through a mix, match its anchor, and rebuild by shape.',
    instruction: 'Hear the piano. Match. Build.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A, E],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.4, tempoHard: 11.2,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.84,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A, E], qualities: ['major', 'minor'], rootSupport: 'matched',
      layers: ['pad', 'bass', 'pulse', 'strings'], progressionLength: 3, targetRepeats: 2,
      rootSearchSeconds: 7.5, shapeSearchSeconds: 9, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c24-carry-shape-through-song', index: 24, phase: 7, phaseLabel: 'Background harmony',
    title: 'Carry the shape through a song', focus: 'Retain the piano target through four chords and rebuild it without chord-name guessing.',
    instruction: 'Follow the piano. Match. Build.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B, FS],
    rightOctaves: [4, 5], leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12, tempoHard: 10.8,
    drills: ['chord-reading', 'spatial-chord', 'chord-reading', 'spatial-chord'], difficultyBase: 0.90,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B, FS], qualities: ['major', 'minor'], rootSupport: 'matched',
      layers: ['pad', 'bass', 'pulse', 'strings'], progressionLength: 4, targetRepeats: 1,
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
    learningOutcome: 'Place both hands in G-major position and use F-sharp without searching.',
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
    learningOutcome: 'Place both hands in D-major position and use F-sharp and C-sharp securely.',
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
    learningOutcome: 'Place both hands in A-major position and include all three sharps automatically.',
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
    learningOutcome: 'Place both hands in E-major position and include all four sharps automatically.',
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
    learningOutcome: 'Match an isolated piano anchor inside light texture and transfer its chord shape.',
    coreProblems: ['chord-anchor', 'background-piano-separation', 'chord-shape-transfer', 'chord-by-ear'],
    supportingProblems: ['major-minor-hearing', 'chord-reading', 'chord-simultaneity'],
    drillPurposes: ['Read a reference chord', 'Match its heard anchor and rebuild', 'Read a contrasting chord', 'Transfer the heard shape to a new anchor'],
  },
  'c23-separate-background-piano': {
    learningOutcome: 'Track the piano through a mix, match its anchor, and reproduce the complete chord.',
    coreProblems: ['background-piano-separation', 'chord-by-ear', 'chord-simultaneity'],
    supportingProblems: ['chord-anchor', 'chord-reading', 'major-minor-hearing', 'chord-shape-transfer'],
    drillPurposes: ['Prime the written shape', 'Extract and rebuild the piano chord', 'Read a new harmonic shape', 'Extract and rebuild a contrasting chord'],
  },
  'c24-carry-shape-through-song': {
    learningOutcome: 'Retain and reproduce a target piano chord through a four-chord musical context.',
    coreProblems: ['chord-shape-transfer', 'background-piano-separation', 'chord-by-ear', 'major-minor-hearing'],
    supportingProblems: ['chord-anchor', 'chord-reading', 'chord-simultaneity', 'chord-quality-spacing'],
    drillPurposes: ['Prime the first written shape', 'Retain it through a progression', 'Read a contrasting shape', 'Retain and rebuild the final target'],
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

/** Pick consecutive reps from different entries before any melody can repeat. */
function variedPick<T>(
  ordered: readonly T[],
  difficulty: number,
  ordinal: number,
): T {
  if (ordered.length <= 1) return ordered[0];
  // Walk the bank with a stride coprime to its size. Three base reps then
  // sample different parts of a long contour bank instead of merely taking
  // its first three entries, while later adaptive reps eventually cover the
  // entire bank before repeating. The small tier offset changes material as
  // difficulty grows without turning difficulty itself into a cliff.
  const stride = ordered.length % 3 !== 0 ? 3 : ordered.length % 2 !== 0 ? 2 : 1;
  const tierOffset = Math.floor(clamp01(difficulty) * Math.min(3, ordered.length - 1));
  return ordered[positiveModulo(ordinal * stride + tierOffset, ordered.length)];
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

function chordPitches(rootPitch: string, quality: ChordQuality): [string, string, string] {
  return [
    rootPitch,
    transposePitch(rootPitch, quality === 'major' ? 4 : 3),
    transposePitch(rootPitch, 7),
  ];
}

type HarmonicRole = 'tonic' | 'supertonic' | 'subdominant' | 'dominant' | 'submediant';

function functionalChord(
  tonicPitch: string,
  tonicQuality: ChordQuality,
  semitones: number,
  role: HarmonicRole,
): [string, string, string] {
  const root = transposePitch(tonicPitch, semitones);
  const intervals = role === 'dominant'
    ? [0, 4, 7]
    : role === 'supertonic' && tonicQuality === 'minor'
      ? [0, 3, 6]
      : role === 'supertonic' || role === 'submediant'
        ? [0, tonicQuality === 'major' ? 3 : 4, 7]
        : [0, tonicQuality === 'major' ? 4 : 3, 7];
  return intervals.map((interval) => transposePitch(root, interval)) as [string, string, string];
}

/** Choose a compact inversion whose three voices move minimally into `next`. */
function voiceLeadInto(
  chord: readonly string[],
  next: readonly string[],
  tonicMidi: number,
): string[] {
  const source = chord.map(localPitchToMidi);
  const destination = next.map(localPitchToMidi).sort((a, b) => a - b);
  let best: number[] | null = null;
  let bestCost = Infinity;

  for (const lowShift of [-12, 0, 12]) {
    for (const middleShift of [-12, 0, 12]) {
      for (const highShift of [-12, 0, 12]) {
        const voiced = [
          source[0] + lowShift,
          source[1] + middleShift,
          source[2] + highShift,
        ].sort((a, b) => a - b);
        if (
          voiced[2] - voiced[0] > 12 ||
          voiced[0] < tonicMidi - 7 ||
          voiced[2] > tonicMidi + 14
        ) continue;
        const cost = voiced.reduce(
          (sum, midi, index) => sum + Math.abs(midi - destination[index]),
          0,
        ) + Math.abs(voiced[2] - destination[2]) * 0.35;
        if (cost < bestCost) {
          best = voiced;
          bestCost = cost;
        }
      }
    }
  }

  return (best ?? source).map(midiToScientificPitch);
}

function contextualProgression(
  target: [string, string, string],
  quality: ChordQuality,
  length: SpatialChordRecipe['progressionLength'],
  variant = 0,
): string[][] {
  type HarmonicStep = { semitones: number; role: HarmonicRole };
  const tonic: HarmonicStep = { semitones: 0, role: 'tonic' };
  const supertonic: HarmonicStep = { semitones: 2, role: 'supertonic' };
  const subdominant: HarmonicStep = { semitones: 5, role: 'subdominant' };
  const dominant: HarmonicStep = { semitones: 7, role: 'dominant' };
  const submediant: HarmonicStep = { semitones: 9, role: 'submediant' };
  const banks: Record<SpatialChordRecipe['progressionLength'], readonly HarmonicStep[][]> = {
    1: [[tonic]],
    2: [[dominant, tonic], [subdominant, tonic]],
    3: [
      [subdominant, dominant, tonic],
      [supertonic, dominant, tonic],
      [tonic, dominant, tonic],
    ],
    4: [
      [tonic, supertonic, dominant, tonic],
      [submediant, subdominant, dominant, tonic],
      [tonic, subdominant, dominant, tonic],
    ],
  };
  const degrees = cyclePick(banks[length], variant);
  const progression = degrees.map((degree, index) => (
    index === degrees.length - 1
      ? [...target]
      : functionalChord(target[0], quality, degree.semitones, degree.role)
  ));
  const voiced: string[][] = new Array(progression.length);
  voiced[voiced.length - 1] = [...target];
  const tonicMidi = localPitchToMidi(target[0]);
  for (let index = progression.length - 2; index >= 0; index -= 1) {
    voiced[index] = voiceLeadInto(progression[index], voiced[index + 1], tonicMidi);
  }
  return voiced;
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
    lesson.index,
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
    ...(degrees.length === 1
      ? { finger: fingerFor(degrees[0], hand) }
      : { fingers: degrees.map((degree) => fingerFor(degree, hand)) }),
    anchor: index === 0,
  }));
  const restKey = hand === 'right' ? 'b/4' : 'd/3';
  const paddingBeats = positiveModulo(-events.length, 4);
  // A run of 1-3 trailing beats reads as one clean rest, not a string of
  // separate quarter rests stacked together (e.g. 3 beats is a half rest
  // plus a quarter rest, the conventional engraving — never three quarters).
  const REST_DURATIONS_FOR_BEATS: Record<number, string> = { 4: 'w', 3: 'h', 2: 'h', 1: 'q' };
  let remainingPaddingBeats = paddingBeats;
  while (remainingPaddingBeats > 0) {
    const chunk = remainingPaddingBeats >= 4 ? 4 : remainingPaddingBeats >= 2 ? 2 : 1;
    notes.push({ keys: [restKey], duration: `${REST_DURATIONS_FOR_BEATS[chunk]}r` });
    remainingPaddingBeats -= chunk;
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
  const progression = contextualProgression(
    pitches,
    quality,
    recipe.progressionLength,
    localRep + lesson.index * 3,
  );
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
      layers: [...recipe.layers],
      progression,
      targetChordIndex: progression.length - 1,
      secondsPerChord: Math.max(0.95, 1.35 - difficulty * 0.22),
      targetRepeats: Math.max(1, recipe.targetRepeats),
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
  const fixedDifficulty = clamp01(lesson.difficultyBase + localRep * 0.035);
  const modeDifficulty = fixedDifficulty;
  const materialIndex = lesson.index * BASE_QUESTIONS + localRep;
  const rand = makeRandom(20260826 + lesson.index * 4099 + localRep * 131);

  // Local question number, not global ordinal, guarantees a fixed hand order
  // even after an earlier lesson grows remedial repeats.
  const hand = lesson.hands[localRep % lesson.hands.length];
  const clef = hand === 'right' ? 'treble' : 'bass';
  const octavePool = hand === 'right' ? lesson.rightOctaves : lesson.leftOctaves;

  if (drillKind === 'chord-reading') {
    return chordalStandardQuestion(
      lesson,
      ordinal,
      localRep + 1,
      fixedDifficulty,
      mode,
      modeDifficulty,
      hand,
    );
  }

  if (
    drillKind === 'spatial-chord' &&
    lesson.spatialChord &&
    (lesson.exerciseMode === 'spatial-chord' || lesson.spatialChord.questionNumbers.length > 0)
  ) {
    return spatialChordQuestion(
      lesson,
      lesson.spatialChord,
      ordinal,
      questionNumber,
      fixedDifficulty,
      mode,
      hand,
    );
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
    const opening = variedPick(openingPool, modeDifficulty, materialIndex + lesson.index);
    const landing = variedPick(landingPool, modeDifficulty, materialIndex * 2 + lesson.index);
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

    return {
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
        // No key signature: a hand-position shift crosses two different
        // keys mid-phrase, and printing the destination's signature for the
        // whole staff put accidentals (e.g. B Major's five sharps) on notes
        // that hadn't shifted there yet. VexFlow's Accidental.applyAccidentals
        // renders each note's own inline sharp/flat against a plain C
        // signature, so both halves stay accurate with far less clutter.
        keySignature: 'C',
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
            lesson.index,
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
    };
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
  const contour = variedPick(
    exerciseMode === 'blind-memory' ? memoryPool : lesson.contours,
    modeDifficulty,
    materialIndex + lesson.index,
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
    const continuationCandidates = [7, 11, 17].map((salt) =>
      variedPick(lesson.contours, modeDifficulty, materialIndex + lesson.index + salt),
    );
    const lastDegree = contour[contour.length - 1];
    const continuation = continuationCandidates.reduce((best, candidate) =>
      Math.abs(candidate[0] - lastDegree) < Math.abs(best[0] - lastDegree) ? candidate : best,
    );
    const standardContour = extendLength
      ? [...contour, ...continuation].slice(0, notesPerSystem * 2)
      : contour;
    return twoHandStandardQuestion(
      lesson, position, standardContour, beatsPerBar, ordinal, materialIndex,
      fixedDifficulty, mode, rand, modeDifficulty,
      extendLength ? 2 : undefined,
    );
  }

  const notes: CueNote[] = contour.map((degree, index) => ({
    keys: [position.vf[degree]],
    duration: 'q',
    finger: fingerFor(degree, hand),
    anchor: index === 0,
  }));

  return {
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
      staves: [{ clef, hand, notes: applyRhythm(notes, beatsPerBar, rand, lesson.index) }],
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
  };
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
