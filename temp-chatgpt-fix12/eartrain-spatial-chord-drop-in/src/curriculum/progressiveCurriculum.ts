import type {
  ChordQuality,
  CueNote,
  ExerciseMode,
  GenerationMode,
  Hand,
  LessonDefinition,
  PhaseId,
  Question,
  SpatialChordSpec,
  SpatialInstrumentLayer,
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
 * Each new signature gets an orientation lesson and a consolidation lesson.
 * That makes the extra pathway time useful instead of introducing a new key
 * and a new motor demand on the same question.
 */

const BASE_QUESTIONS = 3;
const MAX_QUESTIONS = 9;

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
      questionNumbers: [3], roots: [C], qualities: ['major'], layers: [],
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
      questionNumbers: [3], roots: [C, G], qualities: ['major'], layers: ['pad'],
      progressionLength: 1, targetRepeats: 2, rootSearchSeconds: 8,
      shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c05-g-major-orientation', index: 5, phase: 1, phaseLabel: 'One sharp',
    title: 'G major: one sharp', focus: 'Meet F-sharp in an otherwise familiar five-finger shape.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14.5, tempoHard: 13,
  },
  {
    id: 'c06-g-major-phrases', index: 6, phase: 1, phaseLabel: 'One sharp',
    title: 'Sing in G major', focus: 'Use one sharp inside complete tonal phrases.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [G], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 14, tempoHard: 12.4,
    spatialChord: {
      questionNumbers: [3], roots: [G], qualities: ['major'], layers: ['pad'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7.5,
      shapeSearchSeconds: 9.5, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c07-d-major-orientation', index: 7, phase: 1, phaseLabel: 'Two sharps',
    title: 'D major: two sharps', focus: 'Add C-sharp while keeping the phrase stepwise.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: [3],
    contours: FIVE_FINGER_PATHS, meters: [4], showKeySignature: true,
    tempoEasy: 14, tempoHard: 12.8,
  },
  {
    id: 'c08-d-major-phrases', index: 8, phase: 1, phaseLabel: 'Two sharps',
    title: 'Shape D-major melodies', focus: 'Combine two sharps with turns, repeats, and gentle skips.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [D], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
    spatialChord: {
      questionNumbers: [3], roots: [G, D], qualities: ['major'], layers: ['pad', 'bass'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7.2,
      shapeSearchSeconds: 9.2, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c09-a-major-orientation', index: 9, phase: 2, phaseLabel: 'Three sharps',
    title: 'A major: three sharps', focus: 'Add G-sharp after G- and D-major feel secure.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.8, tempoHard: 12.4,
  },
  {
    id: 'c10-a-major-phrases', index: 10, phase: 2, phaseLabel: 'Three sharps',
    title: 'Flow through A major', focus: 'Keep three sharps stable through a longer phrase.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [A], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13.2, tempoHard: 11.8,
    spatialChord: {
      questionNumbers: [3], roots: [D, A], qualities: ['major'], layers: ['pad', 'bass', 'pulse'],
      progressionLength: 3, targetRepeats: 2, rootSearchSeconds: 7,
      shapeSearchSeconds: 9, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c11-e-major-orientation', index: 11, phase: 2, phaseLabel: 'Four sharps',
    title: 'E major: four sharps', focus: 'Add D-sharp with a calm, compact melodic path.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: [3],
    contours: [...FIVE_FINGER_PATHS, ...MUSICAL_BEGINNER], meters: [4],
    showKeySignature: true, tempoEasy: 13.5, tempoHard: 12,
  },
  {
    id: 'c12-e-major-phrases', index: 12, phase: 2, phaseLabel: 'Four sharps',
    title: 'Color E-major phrases', focus: 'Read four sharps through repeated ideas and skips.',
    instruction: 'Look for 3 seconds. Then play from memory.',
    exerciseMode: 'blind-memory',
    hands: BOTH_HANDS, positions: [E], rightOctaves: TREBLE, leftOctaves: BASS,
    contours: [...MUSICAL_BEGINNER, ...MUSICAL_REPEATED, ...MUSICAL_GENTLE_SKIPS],
    meters: [4, 3], showKeySignature: true, tempoEasy: 13, tempoHard: 11.5,
    spatialChord: {
      questionNumbers: [3], roots: [A, E], qualities: ['major'], layers: ['pad', 'bass', 'strings'],
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
      questionNumbers: [3], roots: [G, D], qualities: ['major'], layers: ['pad', 'bass', 'pulse'],
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
      questionNumbers: [3], roots: [A, E], qualities: ['major', 'minor'], layers: ['pad', 'bass', 'pulse', 'strings'],
      progressionLength: 4, targetRepeats: 2, rootSearchSeconds: 6.2,
      shapeSearchSeconds: 8.2, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c17-shift-b-to-fsharp', index: 17, phase: 5, phaseLabel: 'Anchor and shift',
    title: 'Leap from B to F-sharp', focus: 'Finish with a blind movement between five- and six-sharp maps.',
    instruction: 'Play B. Move to F-sharp. Keep going.',
    exerciseMode: 'anchor-shift', hands: BOTH_HANDS, positions: [B, FS],
    rightOctaves: [4, 5, 3], leftOctaves: BASS, contours: MUSICAL_LATE,
    meters: [4], showKeySignature: true, tempoEasy: 12, tempoHard: 10,
    shiftPairs: [[B, FS]],
  },
  {
    id: 'c18-hear-the-root', index: 18, phase: 6, phaseLabel: 'Chord shapes by ear',
    title: 'Hear the root', focus: 'Follow the piano sound and find the note the chord grows from.',
    instruction: 'Listen. Find the root note.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D],
    rightOctaves: [4], leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 14, tempoHard: 13,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D], qualities: ['major'], layers: ['pad'],
      progressionLength: 1, targetRepeats: 2, rootSearchSeconds: 8,
      shapeSearchSeconds: 10, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c19-build-the-shape', index: 19, phase: 6, phaseLabel: 'Chord shapes by ear',
    title: 'Build the chord shape', focus: 'Keep the root and feel the third and fifth around it.',
    instruction: 'Find the root. Then build the shape.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A],
    rightOctaves: TREBLE, leftOctaves: [3], contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 13.5, tempoHard: 12.5,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major'], layers: ['pad', 'bass'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7.5,
      shapeSearchSeconds: 9.5, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c20-major-minor-space', index: 20, phase: 6, phaseLabel: 'Chord shapes by ear',
    title: 'Feel major and minor', focus: 'Notice how one small finger-space change alters the chord color.',
    instruction: 'Find the root. Feel the chord shape.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 13, tempoHard: 12,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A], qualities: ['major', 'minor'], layers: ['pad', 'bass'],
      progressionLength: 2, targetRepeats: 2, rootSearchSeconds: 7.2,
      shapeSearchSeconds: 9.2, maxWrongGuesses: 4,
    },
  },
  {
    id: 'c21-roots-in-texture', index: 21, phase: 6, phaseLabel: 'Chord shapes by ear',
    title: 'Find roots in a mix', focus: 'Track the centered piano while bass and sustained sounds surround it.',
    instruction: 'Follow the piano. Find its root.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.8, tempoHard: 11.8,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B], qualities: ['major', 'minor'], layers: ['pad', 'bass', 'pulse'],
      progressionLength: 3, targetRepeats: 2, rootSearchSeconds: 6.8,
      shapeSearchSeconds: 8.8, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c22-background-chords', index: 22, phase: 7, phaseLabel: 'Background harmony',
    title: 'Build a background chord', focus: 'Extract one piano chord from a short multi-instrument progression.',
    instruction: 'Hear the piano. Build its chord.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [C, G, D, A, E],
    rightOctaves: TREBLE, leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12.4, tempoHard: 11.2,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [C, G, D, A, E], qualities: ['major', 'minor'], layers: ['pad', 'bass', 'pulse', 'strings'],
      progressionLength: 3, targetRepeats: 2, rootSearchSeconds: 6.4,
      shapeSearchSeconds: 8.4, maxWrongGuesses: 3,
    },
  },
  {
    id: 'c23-extract-the-harmony', index: 23, phase: 7, phaseLabel: 'Background harmony',
    title: 'Extract the harmony', focus: 'Hold onto the piano line inside a full texture and rebuild its chord efficiently.',
    instruction: 'Track the piano. Find and build the chord.',
    exerciseMode: 'spatial-chord', hands: BOTH_HANDS, positions: [D, A, E, B, FS],
    rightOctaves: [4, 5, 3], leftOctaves: BASS, contours: FIVE_FINGER_PATHS,
    meters: [4], showKeySignature: true, tempoEasy: 12, tempoHard: 10.8,
    spatialChord: {
      questionNumbers: [1, 2, 3], roots: [D, A, E, B, FS], qualities: ['major', 'minor'], layers: ['pad', 'bass', 'pulse', 'strings'],
      progressionLength: 4, targetRepeats: 1, rootSearchSeconds: 6,
      shapeSearchSeconds: 8, maxWrongGuesses: 3,
    },
  },
];

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
  length: SpatialChordRecipe['progressionLength'],
): string[][] {
  const offsets: Record<SpatialChordRecipe['progressionLength'], readonly number[]> = {
    1: [0],
    2: [-5, 0],
    3: [5, 7, 0],
    4: [-5, 2, 7, 0],
  };
  return offsets[length].map((offset, index, all) => (
    index === all.length - 1
      ? [...target]
      : chordPitches(transposePitch(target[0], offset), 'major')
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
  const rootTemplate = cyclePick(recipe.roots, localRep + lesson.index);
  const quality = cyclePick(recipe.qualities, localRep + Math.floor(ordinal / BASE_QUESTIONS));
  const octavePool = hand === 'right' ? lesson.rightOctaves : lesson.leftOctaves;
  const octave = cyclePick(octavePool, Math.floor(localRep / Math.max(1, recipe.roots.length)));
  const position = buildPosition(rootTemplate, octave);
  const pitches = chordPitches(position.sci[0], quality);
  const rootName = pitches[0].replace(/-?\d+$/, '');
  const chordName = `${rootName} ${quality === 'major' ? 'Major' : 'Minor'}`;
  const fingers = hand === 'right' ? ([1, 3, 5] as const) : ([5, 3, 1] as const);
  const cueNotes: CueNote[] = pitches.map((pitch, index) => ({
    keys: [scientificToVex(pitch)],
    duration: 'q',
    finger: fingers[index],
    anchor: index === 0,
  }));
  const progression = contextualProgression(pitches, recipe.progressionLength);
  const spatialChord: SpatialChordSpec = {
    chordName,
    hand,
    quality,
    rootPitch: pitches[0],
    chordPitches: pitches,
    intervals: [quality === 'major' ? 4 : 3, 7],
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
    instruction: 'Listen to the piano. Find the root note.',
    cue: {
      keySignature: quality === 'major' ? position.template.keySignature : 'C',
      timeSignature: '3/4',
      staves: [{
        clef: hand === 'right' ? 'treble' : 'bass',
        hand,
        notes: cueNotes,
      }],
    },
    expectedSequence: pitches,
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
    const from = buildPosition(pair[0], octave);
    const to = buildPosition(pair[1], octave);
    const openingPool: readonly Contour[] = [
      [0, 1, 2],
      [2, 1, 0],
      [0, 2, 1],
    ];
    const landingPool: readonly Contour[] = [
      [0, 1, 2, 0],
      [0, 2, 1, 0],
      [2, 3, 1, 0],
      [0, 3, 2, 0],
    ];
    const opening = cyclePick(openingPool, ordinal);
    const landing = cyclePick(landingPool, Math.floor(ordinal / openingPool.length));
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
          notes: applyRhythm(notes, 4, rand, lesson.index),
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

  const positionTemplate = cyclePick(lesson.positions, ordinal);
  const octave = cyclePick(octavePool, Math.floor(ordinal / lesson.positions.length));
  const position = buildPosition(positionTemplate, octave);
  const contour = variedPick(lesson.contours, modeDifficulty, ordinal);
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
    exerciseMode: lesson.exerciseMode,
    handScope: hand,
    instruction: lesson.instruction,
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
            proofNotes: [
              { pitch: position.sci[0], finger: 1 },
              { pitch: position.sci[2], finger: 2 },
              { pitch: position.sci[4], finger: 3 },
            ],
            acceptWindowMs: 5000,
          },
        }
      : {}),
    ...(lesson.exerciseMode === 'blind-memory'
      ? { blindMemory: { previewSeconds: 3, hideStyle: 'vanish' as const } }
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
  baseQuestionCount: BASE_QUESTIONS,
  maxQuestionCount: MAX_QUESTIONS,
  exerciseMode: lesson.exerciseMode,
  generate: (ordinal, rand, difficulty, mode, questionNumber) =>
    questionFor(lesson, ordinal, rand, difficulty, mode, questionNumber),
}));
