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
  positionById,
} from './positions';
import type { PositionTemplate } from './positions';
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

const BASE_QUESTIONS = 3;
const MAX_QUESTIONS = 9;
const SHORT_MEMORY_PREVIEW_SECONDS = 6;
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
  shiftPairs?: readonly (readonly [PositionTemplate, PositionTemplate])[];
  /** Optional ear-training reps interleaved with this lesson's tactile work. */
  spatialChord?: SpatialChordRecipe;
}

interface SpatialChordRecipe {
  /** One-based reps in the clean three-question loop. */
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

const LESSONS: readonly LessonRecipe[] = [
  {
    id: 'c01-rh-c-position', index: 1, phase: 0, phaseLabel: 'Right hand foundations',
    title: 'Meet C position', focus: 'Set the right hand once and use all five fingers.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: RH, positions: [C], rightOctaves: [4], leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: false,
    tempoEasy: 15, tempoHard: 14,
  },
  {
    id: 'c02-rh-musical-phrases', index: 2, phase: 0, phaseLabel: 'Right hand foundations',
    title: 'Shape a right-hand phrase', focus: 'Read steps, turns, and gentle repeats without moving the hand.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: RH, positions: [C, G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED], meters: [4, 3],
    showKeySignature: false, tempoEasy: 14.5, tempoHard: 13,
    spatialChord: {
      questionNumbers: [3], roots: [C], qualities: ['major'], rootSupport: 'shown', layers: [],
      progressionLength: 1, targetRepeats: 2, rootSearchSeconds: 8,
      shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c03-lh-c-position', index: 3, phase: 0, phaseLabel: 'Left hand foundations',
    title: 'Meet the left hand', focus: 'Learn bass-clef C position before adding any sharps.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: LH, positions: [C], rightOctaves: [4], leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: false,
    tempoEasy: 15, tempoHard: 13.8,
  },
  {
    id: 'c04-two-hand-white-keys', index: 4, phase: 0, phaseLabel: 'Two-hand foundations',
    title: 'White-key phrases', focus: 'Alternate hands while the pitch language stays familiar.',
    instruction: 'Play the short pattern.',
    exerciseMode: 'prove-it',
    hands: BOTH_HANDS, positions: [C, G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: false, tempoEasy: 14, tempoHard: 12.5,
    spatialChord: {
      questionNumbers: [3], roots: [C, G], qualities: ['major'], rootSupport: 'shown', layers: ['pad'],
      progressionLength: 1, targetRepeats: 2, rootSearchSeconds: 8,
      shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c05-g-major-orientation', index: 5, phase: 1, phaseLabel: 'One sharp',
    title: 'G major: one sharp', focus: 'Meet F-sharp in an otherwise familiar five-finger shape.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14.5, tempoHard: 13,
  },
  {
    id: 'c06-g-major-phrases', index: 6, phase: 1, phaseLabel: 'One sharp',
    title: 'Sing in G major', focus: 'Use one sharp inside complete tonal phrases.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 14, tempoHard: 12.4,
    spatialChord: {
      questionNumbers: [3], roots: [G], qualities: ['major'], rootSupport: 'shown', layers: ['pad'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7.5,
      shapeSearchSeconds: 9.5, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c07-d-major-orientation', index: 7, phase: 1, phaseLabel: 'Two sharps',
    title: 'D major: two sharps', focus: 'Add C-sharp while keeping the phrase stepwise.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14, tempoHard: 12.8,
  },
  {
    id: 'c08-d-major-phrases', index: 8, phase: 1, phaseLabel: 'Two sharps',
    title: 'Shape D-major melodies', focus: 'Combine two sharps with turns, repeats, and gentle skips.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    spatialChord: {
      questionNumbers: [3], roots: [G, D], qualities: ['major'], rootSupport: 'shown', layers: ['pad', 'bass'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7.2,
      shapeSearchSeconds: 9.2, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c09-a-major-orientation', index: 9, phase: 2, phaseLabel: 'Three sharps',
    title: 'A major: three sharps', focus: 'Add G-sharp after G- and D-major feel secure.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.8, tempoHard: 12.4,
  },
  {
    id: 'c10-a-major-phrases', index: 10, phase: 2, phaseLabel: 'Three sharps',
    title: 'Flow through A major', focus: 'Keep three sharps stable through a longer phrase.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.2, tempoHard: 11.8,
    spatialChord: {
      questionNumbers: [3], roots: [D, A], qualities: ['major'], rootSupport: 'shown', layers: ['pad', 'bass'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7,
      shapeSearchSeconds: 9, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c11-e-major-orientation', index: 11, phase: 2, phaseLabel: 'Four sharps',
    title: 'E major: four sharps', focus: 'Add D-sharp with a calm, compact melodic path.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
  },
  {
    id: 'c12-e-major-phrases', index: 12, phase: 2, phaseLabel: 'Four sharps',
    title: 'Color E-major phrases', focus: 'Read four sharps through repeated ideas and skips.',
    instruction: 'Find the pattern. Then play it from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    spatialChord: {
      questionNumbers: [3], roots: [A, E], qualities: ['major'], rootSupport: 'matched', layers: ['pad', 'bass', 'pulse'],
      progressionLength: 3, targetRepeats: 2, rootSearchSeconds: 6.8,
      shapeSearchSeconds: 8.8, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c13-shift-c-to-g', index: 13, phase: 3, phaseLabel: 'Anchor and shift',
    title: 'Leap from C to G', focus: 'Release one known position and land a fifth away without searching.',
    instruction: 'Play C. Move to G. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [C, G],
    rightOctaves: TREBLE, leftOctaves: [3], contours: MUSICAL_GENTLE_SKIPS,
    meters: [4], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    shiftPairs: [[C, G]],
  },
  {
    id: 'c14-shift-g-to-d', index: 14, phase: 3, phaseLabel: 'Anchor and shift',
    title: 'Leap from G to D', focus: 'Move between one- and two-sharp hand maps in time.',
    instruction: 'Play G. Move to D. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [G, D],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: MUSICAL_GENTLE_SKIPS,
    meters: [4], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    shiftPairs: [[G, D]],
    spatialChord: {
      questionNumbers: [3], roots: [G, D], qualities: ['major'], rootSupport: 'matched', layers: ['pad', 'bass', 'pulse'],
      progressionLength: 3, targetRepeats: 2, rootSearchSeconds: 6.5,
      shapeSearchSeconds: 8.5, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c15-shift-d-to-a', index: 15, phase: 4, phaseLabel: 'Anchor and shift',
    title: 'Leap from D to A', focus: 'Transfer the same tactile shape into a three-sharp landing.',
    instruction: 'Play D. Move to A. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [D, A],
    rightOctaves: TREBLE, leftOctaves: [3], contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.2,
    shiftPairs: [[D, A]],
  },
  {
    id: 'c16-shift-a-to-e', index: 16, phase: 4, phaseLabel: 'Anchor and shift',
    title: 'Leap from A to E', focus: 'Keep orientation while moving into a four-sharp position.',
    instruction: 'Play A. Move to E. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [A, E],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.3, tempoHard: 10.7,
    shiftPairs: [[A, E]],
    spatialChord: {
      questionNumbers: [3], roots: [A, E], qualities: ['major'], rootSupport: 'matched', layers: ['pad', 'bass', 'pulse'],
      progressionLength: 3, targetRepeats: 2, rootSearchSeconds: 6.8,
      shapeSearchSeconds: 8.2, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c17-b-fsharp-orientation', index: 17, phase: 5, phaseLabel: 'Five and six sharps',
    title: 'Map B and F-sharp', focus: 'Place both new hand maps before asking the hand to jump between them.',
    instruction: 'Set the hand shape. Then play the short pattern.',
    exerciseMode: 'prove-it', hands: BOTH_HANDS,
    // Deliberate B, B, F# order: each hand meets B before F# is introduced.
    positions: [B, B, FS], rightOctaves: [4], leftOctaves: [3],
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_GENTLE_SKIPS], meters: [4],
    showKeySignature: true, tempoEasy: 13.2, tempoHard: 11.8,
  },
  {
    id: 'c18-shift-b-to-fsharp', index: 18, phase: 5, phaseLabel: 'Five and six sharps',
    title: 'Move from B to F-sharp', focus: 'Move only after both five- and six-sharp hand maps have been established.',
    instruction: 'Play B. Move to F-sharp. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [B, FS],
    rightOctaves: [4], leftOctaves: [3], contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.2,
    shiftPairs: [[B, FS]],
    spatialChord: {
      questionNumbers: [3], roots: [B, FS], qualities: ['major'], rootSupport: 'matched',
      layers: ['pad', 'bass', 'pulse'], progressionLength: 3, targetRepeats: 2,
      rootSearchSeconds: 7, shapeSearchSeconds: 8.4, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c19-anchor-and-shell', index: 19, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Anchor, then reach', focus: 'Start from a supplied root and build the stable root-to-fifth outer shell.',
    instruction: 'Place the anchor. Reach the outside note.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D],
    rightOctaves: [4], leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 14, tempoHard: 13,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D], qualities: ['major'], rootSupport: 'shown',
      layers: [], progressionLength: 1, targetRepeats: 2, rootSearchSeconds: 9,
      shapeSearchSeconds: 11, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c20-complete-the-frame', index: 20, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Complete the chord frame', focus: 'Keep the outer shell still, then place finger 3 into the middle space.',
    instruction: 'Build the outside. Add the middle.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A],
    rightOctaves: [4], leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12.5,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major'], rootSupport: 'shown',
      layers: ['pad'], progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 8.5,
      shapeSearchSeconds: 10.5, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c21-major-minor-space', index: 21, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Move the middle tone', focus: 'Keep root and fifth fixed; major and minor differ only in the middle finger space.',
    instruction: 'Keep the outside. Place the middle.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A],
    rightOctaves: TREBLE, leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 13, tempoHard: 12,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major', 'minor'], rootSupport: 'shown',
      layers: ['pad', 'bass'], progressionLength: 2, targetRepeats: 2,
      rootSearchSeconds: 8, shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c22-match-anchor-in-texture', index: 22, phase: 6, phaseLabel: 'Chord shapes by touch',
    title: 'Match an anchor in texture', focus: 'Match an isolated reference note, then reuse the same outer-shell-first process.',
    instruction: 'Match the anchor. Build the same shape.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.8,
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
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B, FS], qualities: ['major', 'minor'], rootSupport: 'matched',
      layers: ['pad', 'bass', 'pulse', 'strings'], progressionLength: 4, targetRepeats: 1,
      rootSearchSeconds: 7.2, shapeSearchSeconds: 8.8, maxWrongGuesses: 3,
    },
  },
];

interface LessonRemediation {
  primaryProblem: RemediationProblem;
  problemTags: readonly RemediationProblem[];
}

/**
 * External assignment taxonomy. Every live lesson is classified explicitly;
 * no title parsing or hand-written redirect table is needed in the Oclef
 * integration. Tags intentionally overlap because a bass-register mistake,
 * for example, may call for clef reading, physical placement, or both.
 */
const LESSON_REMEDIATION: Readonly<Record<string, LessonRemediation>> = {
  'c01-rh-c-position': {
    primaryProblem: 'right-hand-position',
    problemTags: ['right-hand-position', 'treble-clef-recognition', 'register-placement'],
  },
  'c02-rh-musical-phrases': {
    primaryProblem: 'treble-clef-recognition',
    problemTags: ['treble-clef-recognition', 'right-hand-position', 'rhythm-pulse'],
  },
  'c03-lh-c-position': {
    primaryProblem: 'left-hand-position',
    problemTags: ['left-hand-position', 'bass-clef-recognition', 'register-placement'],
  },
  'c04-two-hand-white-keys': {
    primaryProblem: 'hand-coordination',
    problemTags: ['hand-coordination', 'treble-clef-recognition', 'bass-clef-recognition', 'register-placement'],
  },
  'c05-g-major-orientation': {
    primaryProblem: 'key-signature-orientation',
    problemTags: ['key-signature-orientation', 'position-memory', 'register-placement'],
  },
  'c06-g-major-phrases': {
    primaryProblem: 'position-memory',
    problemTags: ['position-memory', 'key-signature-orientation', 'bass-clef-recognition', 'rhythm-pulse'],
  },
  'c07-d-major-orientation': {
    primaryProblem: 'key-signature-orientation',
    problemTags: ['key-signature-orientation', 'position-memory', 'treble-clef-recognition'],
  },
  'c08-d-major-phrases': {
    primaryProblem: 'position-memory',
    problemTags: ['position-memory', 'key-signature-orientation', 'bass-clef-recognition', 'rhythm-pulse'],
  },
  'c09-a-major-orientation': {
    primaryProblem: 'key-signature-orientation',
    problemTags: ['key-signature-orientation', 'position-memory', 'register-placement'],
  },
  'c10-a-major-phrases': {
    primaryProblem: 'position-memory',
    problemTags: ['position-memory', 'key-signature-orientation', 'bass-clef-recognition', 'rapid-subdivision'],
  },
  'c11-e-major-orientation': {
    primaryProblem: 'key-signature-orientation',
    problemTags: ['key-signature-orientation', 'position-memory', 'treble-clef-recognition'],
  },
  'c12-e-major-phrases': {
    primaryProblem: 'position-memory',
    problemTags: ['position-memory', 'key-signature-orientation', 'bass-clef-recognition', 'rapid-subdivision'],
  },
  'c13-shift-c-to-g': {
    primaryProblem: 'hand-shift',
    problemTags: ['hand-shift', 'register-placement', 'rhythm-pulse'],
  },
  'c14-shift-g-to-d': {
    primaryProblem: 'hand-shift',
    problemTags: ['hand-shift', 'key-signature-orientation', 'rhythm-pulse'],
  },
  'c15-shift-d-to-a': {
    primaryProblem: 'hand-shift',
    problemTags: ['hand-shift', 'key-signature-orientation', 'rapid-subdivision'],
  },
  'c16-shift-a-to-e': {
    primaryProblem: 'hand-shift',
    problemTags: ['hand-shift', 'key-signature-orientation', 'rapid-subdivision'],
  },
  'c17-b-fsharp-orientation': {
    primaryProblem: 'key-signature-orientation',
    problemTags: ['key-signature-orientation', 'register-placement', 'right-hand-position', 'left-hand-position'],
  },
  'c18-shift-b-to-fsharp': {
    primaryProblem: 'hand-shift',
    problemTags: ['hand-shift', 'key-signature-orientation', 'rapid-subdivision'],
  },
  'c19-anchor-and-shell': {
    primaryProblem: 'chord-anchor',
    problemTags: ['chord-anchor', 'chord-shell', 'right-hand-position', 'left-hand-position'],
  },
  'c20-complete-the-frame': {
    primaryProblem: 'chord-shell',
    problemTags: ['chord-shell', 'chord-anchor', 'chord-shape-transfer'],
  },
  'c21-major-minor-space': {
    primaryProblem: 'chord-quality-spacing',
    problemTags: ['chord-quality-spacing', 'chord-shell', 'chord-shape-transfer'],
  },
  'c22-match-anchor-in-texture': {
    primaryProblem: 'chord-anchor',
    problemTags: ['chord-anchor', 'background-piano-separation', 'chord-shape-transfer'],
  },
  'c23-separate-background-piano': {
    primaryProblem: 'background-piano-separation',
    problemTags: ['background-piano-separation', 'chord-anchor', 'chord-shape-transfer'],
  },
  'c24-carry-shape-through-song': {
    primaryProblem: 'chord-shape-transfer',
    problemTags: ['chord-shape-transfer', 'background-piano-separation', 'chord-quality-spacing'],
  },
};

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

function contextualProgression(
  target: [string, string, string],
  quality: ChordQuality,
  length: SpatialChordRecipe['progressionLength'],
  variant = 0,
): string[][] {
  type HarmonicStep = { semitones: number; role: 'tonic' | 'subdominant' | 'dominant' };
  const tonic: HarmonicStep = { semitones: 0, role: 'tonic' };
  const subdominant: HarmonicStep = { semitones: 5, role: 'subdominant' };
  const dominant: HarmonicStep = { semitones: 7, role: 'dominant' };
  const banks: Record<SpatialChordRecipe['progressionLength'], readonly HarmonicStep[][]> = {
    1: [[tonic]],
    2: [[dominant, tonic], [subdominant, tonic]],
    3: [
      [subdominant, dominant, tonic],
      [dominant, subdominant, tonic],
      [tonic, dominant, tonic],
    ],
    4: [
      [tonic, subdominant, dominant, tonic],
      [subdominant, tonic, dominant, tonic],
      [tonic, dominant, subdominant, tonic],
    ],
  };
  const degrees = cyclePick(banks[length], variant);
  return degrees.map((degree, index, all) => (
    index === all.length - 1
      ? [...target]
      : chordPitches(
          transposePitch(target[0], degree.semitones),
          quality === 'minor' && degree.role !== 'dominant' ? 'minor' : 'major',
        )
  ));
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
  const rootTemplate = cyclePick(recipe.roots, localRep);
  const quality = cyclePick(recipe.qualities, localRep);
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
  // order: anchor, outside shell, then the quality-defining middle tone.
  // Previously the staff showed root-third-fifth while the child was asked
  // for root-fifth-third, making a correct response look contradictory.
  const buildOrder = [0, 2, 1] as const;
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
    ordinal + lesson.index,
  );
  const spatialChord: SpatialChordSpec = {
    chordName,
    hand,
    quality,
    rootPitch: pitches[0],
    chordPitches: pitches,
    intervals: [quality === 'major' ? 4 : 3, 7],
    rootSupport: recipe.rootSupport,
    // Learn the stable outer shell before placing the quality-defining third.
    buildOrder: [0, 2, 1],
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
    instruction: recipe.rootSupport === 'shown'
      ? 'Place the anchor. Build the outside, then the middle.'
      : 'Match the anchor. Build the outside, then the middle.',
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
  rand: () => number,
  difficulty: number,
  mode: GenerationMode,
  questionNumber = 1,
): Question {
  const localRep = positiveModulo(questionNumber - 1, BASE_QUESTIONS);
  const repRamp = [0, 0.32, 0.58][localRep];
  const blendedDifficulty = clamp01(difficulty * 0.72 + repRamp * 0.28);
  const modeDifficulty =
    mode === 'reinforce'
      ? blendedDifficulty * 0.72
      : mode === 'stretch'
        ? blendedDifficulty + (1 - blendedDifficulty) * 0.16
        : blendedDifficulty;

  // Local question number, not global ordinal, guarantees a clean R/L/R
  // three-rep loop even after an earlier lesson grew adaptive extra reps.
  const hand = lesson.hands[localRep % lesson.hands.length];
  const clef = hand === 'right' ? 'treble' : 'bass';
  const octavePool = hand === 'right' ? lesson.rightOctaves : lesson.leftOctaves;

  if (
    lesson.spatialChord &&
    (lesson.exerciseMode === 'spatial-chord' || lesson.spatialChord.questionNumbers.includes(questionNumber))
  ) {
    return spatialChordQuestion(
      lesson,
      lesson.spatialChord,
      ordinal,
      questionNumber,
      modeDifficulty,
      mode,
      hand,
    );
  }

  if (lesson.exerciseMode === 'anchor-shift' && lesson.shiftPairs?.length) {
    const pair = cyclePick(lesson.shiftPairs, ordinal);
    const octave = cyclePick(octavePool, Math.floor(ordinal / lesson.shiftPairs.length));
    const [from, to] = buildAscendingFifthPair(pair, octave);
    const openingPool: readonly Contour[] = [
      [0, 1, 2],
      [2, 1, 0],
      [0, 2, 1],
      [1, 0, 2],
      [2, 0, 1],
      [0, 1, 3],
    ];
    const landingPool: readonly Contour[] = [
      // Six landing notes leave enough room for an eighth/sixteenth group
      // after the protected hand-off. Faster rhythm is therefore still taught
      // in late lessons without ever making the actual jump a rapid note.
      [0, 1, 2, 3, 2, 0],
      [0, 2, 1, 3, 2, 0],
      [2, 3, 1, 4, 2, 0],
      [0, 3, 2, 1, 2, 0],
      [4, 2, 3, 1, 2, 0],
      [1, 3, 2, 4, 2, 0],
      [0, 2, 4, 3, 1, 0],
      [3, 1, 2, 4, 2, 0],
    ];
    const opening = variedPick(openingPool, modeDifficulty, ordinal + lesson.index);
    const landing = variedPick(landingPool, modeDifficulty, ordinal * 2 + lesson.index);
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

    return {
      id: `${lesson.id}#${ordinal}`,
      conceptId: lesson.id,
      exerciseMode: 'anchor-shift',
      // This generated drill has one staff and one active hand. `both` is
      // reserved for a question that genuinely presents both hands at once;
      // alternating hands across a lesson must not mislabel the current rep.
      handScope: hand,
      instruction: lesson.instruction,
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
            lesson.index,
            [splitIndex - 1, splitIndex],
          ),
        }],
      },
      expectedSequence,
      tempoWindowSec: lerp(lesson.tempoEasy, lesson.tempoHard, modeDifficulty),
      positionLabel: `${from.label} → ${to.label}`,
      difficulty,
      mode,
      anchorShift: {
        fromPositionName: fromName,
        toPositionName: toName,
        splitIndex,
        allowedExtraBeats,
      },
    };
  }

  // Position introductions must not depend on how many adaptive drills were
  // added in an earlier lesson. This is especially important in Lesson 17:
  // its deliberate B, B, F-sharp order establishes both hands in B before
  // F-sharp appears. Extended reps cycle the same safe sequence.
  const positionTemplate = cyclePick(lesson.positions, questionNumber - 1);
  const octave = cyclePick(
    octavePool,
    Math.floor((questionNumber - 1) / lesson.positions.length),
  );
  const position = buildPosition(positionTemplate, octave);
  // Memory is one complementary drill inside each applicable lesson, not the
  // entire lesson. Orientation lessons lead with memory; phrase lessons place
  // it second, with their third drill reserved for chord work where present.
  const memoryRep = lesson.index % 2 === 1 ? 0 : 1;
  const exerciseMode: ExerciseMode =
    lesson.exerciseMode === 'blind-memory' && localRep !== memoryRep
      ? 'standard'
      : lesson.exerciseMode;
  const memoryPool = lesson.index >= 9 ? MEMORY_LONG_PATTERNS : MEMORY_SHORT_PATTERNS;
  const contour = variedPick(
    exerciseMode === 'blind-memory' ? memoryPool : lesson.contours,
    modeDifficulty,
    ordinal + lesson.index,
  );
  const memoryPreviewSeconds = contour.length >= 10
    ? LONG_MEMORY_PREVIEW_SECONDS
    : SHORT_MEMORY_PREVIEW_SECONDS;
  const beatsPerBar = cyclePick(lesson.meters, ordinal);

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
      : lesson.exerciseMode === 'blind-memory'
        ? 'Read the phrase and play it after the count-in.'
        : lesson.instruction,
    cue: {
      keySignature: lesson.showKeySignature ? position.template.keySignature : 'C',
      timeSignature: `${beatsPerBar}/4`,
      staves: [{ clef, hand, notes: applyRhythm(notes, beatsPerBar, rand, lesson.index) }],
    },
    expectedSequence: contour.map((degree) => position.sci[degree]),
    tempoWindowSec: lerp(lesson.tempoEasy, lesson.tempoHard, modeDifficulty),
    positionLabel: position.label,
    difficulty,
    mode,
    ...(lesson.exerciseMode === 'prove-it'
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
            requireHeld: true,
            acceptWindowMs: 5500,
          },
        }
      : {}),
    ...(exerciseMode === 'blind-memory'
      ? { blindMemory: { previewSeconds: memoryPreviewSeconds, hideStyle: 'vanish' as const } }
      : {}),
  };
}

export const PROGRESSIVE_CONCEPTS: LessonDefinition[] = LESSONS.map((lesson) => ({
  id: lesson.id,
  index: lesson.index,
  phase: lesson.phase,
  phaseLabel: lesson.phaseLabel,
  title: lesson.title,
  focus: lesson.focus,
  primaryProblem: LESSON_REMEDIATION[lesson.id].primaryProblem,
  problemTags: LESSON_REMEDIATION[lesson.id].problemTags,
  baseQuestionCount: BASE_QUESTIONS,
  maxQuestionCount: MAX_QUESTIONS,
  exerciseMode: lesson.exerciseMode,
  generate: (ordinal, rand, difficulty, mode, questionNumber) =>
    questionFor(lesson, ordinal, rand, difficulty, mode, questionNumber),
}));

/** Ordered remediation candidates for a server-verified external assignment. */
export function lessonsForProblem(problem: RemediationProblem): LessonDefinition[] {
  return PROGRESSIVE_CONCEPTS.filter((lesson) => lesson.problemTags.includes(problem));
}

/** Earliest safe entry point; later selection can use the saved checkpoint. */
export function openingLessonForProblem(problem: RemediationProblem): number {
  return lessonsForProblem(problem)[0]?.index ?? 1;
}
