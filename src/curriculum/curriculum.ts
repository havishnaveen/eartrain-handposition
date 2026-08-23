import type { Concept, CueNote, GenerationMode, Hand, Question } from './types';
import {
  BASS_OCTAVE_LADDER,
  BLACK_POSITIONS,
  FLEX_ANCHORS,
  LARGE_JUMPS,
  POSITIONS_BY_RANK,
  SMALL_JUMPS,
  TREBLE_OCTAVE_LADDER,

  buildPosition,
  jumpPositions,
  positionById,
  tieredPick,
  tieredPosition,
  toScientific,
} from './positions';
import type { Position } from './positions';
import {
  CONTOURS_3_SPREAD,
  CONTOURS_3_TIGHT,
  CONTOURS_3_WIDE,
  CONTOURS_4,
  CONTOURS_5,
  CONTOURS_REPEAT,
  applyRhythm,
  chooseMeter,
  contoursWithin,
  fingerFor,
  pickContour,
} from './melody';
import type { Contour } from './melody';
import { PROGRESSIVE_CONCEPTS } from './progressiveCurriculum';

/**
 * The pathway is 17 CONCEPTS, not 17 questions.
 *
 * Each concept generates a short ladder for one mechanical skill. Material
 * varies on four axes so a student cannot memorise their way through:
 *   - position shape and octave (difficulty-tiered)
 *   - melodic contour (up, down, skip, change of direction)
 *   - rhythm (quarters, halves, whole notes, filling whole bars)
 *   - meter (4/4 and 3/4)
 *
 * Generators are pure — same ordinal, seed, difficulty and mode reproduce the
 * exact drill a student saw, which is what makes telemetry replayable.
 */

// Keep archived/compatibility definitions on the same three-drill pacing as
// the live progressive curriculum. This prevents older profile checkpoints
// from reopening a five-question lesson after a curriculum-version upgrade.
const BASE_QUESTIONS = 3;
const MAX_QUESTIONS = 9;

interface Figure {
  notes: CueNote[];
  sci: string[];
}

/**
 * Realise a contour against a position.
 *
 * `base` is the degree the thumb sits on. Offsets are relative to it, so a
 * figure replayed after a shift keeps its shape and its fingering.
 */
function figureFrom(
  position: Position,
  base: number,
  contour: Contour,
  hand: Hand,
  anchorFirst = true,
): Figure {
  const notes: CueNote[] = [];
  const sci: string[] = [];

  contour.forEach((offset, i) => {
    const degree = Math.min(4, Math.max(0, base + offset));
    notes.push({
      keys: [position.vf[degree]],
      duration: 'q',
      finger: fingerFor(offset, hand),
      anchor: anchorFirst && i === 0,
    });
    sci.push(position.sci[degree]);
  });

  return { notes, sci };
}

function join(...figures: Figure[]): Figure {
  return {
    notes: figures.flatMap((f) => f.notes),
    sci: figures.flatMap((f) => f.sci),
  };
}

const REST_SLOT: CueNote = { keys: ['b/4'], duration: 'qr' };

interface BuildArgs {
  conceptId: string;
  ordinal: number;
  difficulty: number;
  mode: GenerationMode;
  instruction: string;
  clef: 'treble' | 'bass';
  hand: Hand;
  notes: CueNote[];
  keySignature: string;
  beatsPerBar: number;
  expectedSequence: string[];
  tempoWindowSec: number | null;
  positionLabel: string;
  fingeringInferred?: boolean;
}

function build(args: BuildArgs): Question {
  return {
    id: `${args.conceptId}#${args.ordinal}`,
    conceptId: args.conceptId,
    exerciseMode: 'standard',
    instruction: args.instruction,
    cue: {
      keySignature: args.keySignature,
      // Honest by construction: rhythms are generated to fill whole bars,
      // so the signature and the barlines always agree with the notes.
      timeSignature: `${args.beatsPerBar}/4`,
      staves: [{ clef: args.clef, hand: args.hand, notes: args.notes }],
    },
    expectedSequence: args.expectedSequence,
    tempoWindowSec: args.tempoWindowSec,
    fingeringInferred: args.fingeringInferred,
    positionLabel: args.positionLabel,
    difficulty: args.difficulty,
    mode: args.mode,
  };
}

const lerp = (easy: number, hard: number, d: number) =>
  Math.round((easy + (hard - easy) * Math.min(1, Math.max(0, d))) * 10) / 10;

/** Plant drills use every degree, so the position is always fully proved. */
function plantDrill(
  conceptId: string,
  instruction: string,
  position: Position,
  clef: 'treble' | 'bass',
  hand: Hand,
  ordinal: number,
  difficulty: number,
  mode: GenerationMode,
  rand: () => number,
  tempoWindowSec: number | null,
): Question {
  const contour = pickContour(CONTOURS_5, difficulty, rand);
  const figure = figureFrom(position, 0, contour, hand);
  const beatsPerBar = chooseMeter(rand, difficulty);
  return build({
    conceptId,
    ordinal,
    difficulty,
    mode,
    instruction,
    clef,
    hand,
    notes: applyRhythm(figure.notes, beatsPerBar, rand),
    keySignature: position.template.keySignature,
    beatsPerBar,
    expectedSequence: figure.sci,
    tempoWindowSec,
    positionLabel: position.label,
  });
}

/**
 * Retained as a compatibility reference for previously recorded concept IDs.
 * The live pathway below uses the explicit progressive curriculum.
 */
export const LEGACY_CONCEPTS: Concept[] = [
  /* ---- Phase 0 — Starting position, untimed ---------------------------- */
  {
    id: 'c01-starting-position',
    index: 1,
    phase: 0,
    phaseLabel: 'Starting position',
    title: 'Find the starting position',
    focus: 'Read where the hand goes, then play all five notes.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) =>
      plantDrill(
        'c01-starting-position',
        'Find this starting position, then play what you see.',
        tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand),
        'treble',
        'right',
        ordinal,
        difficulty,
        mode,
        rand,
        null,
      ),
  },
  {
    id: 'c02-starting-position-keysig',
    index: 2,
    phase: 0,
    phaseLabel: 'Starting position',
    title: 'Read the key signature first',
    focus: 'Let the key signature tell you which keys are black.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) =>
      plantDrill(
        'c02-starting-position-keysig',
        'Check the key signature before you place your hand.',
        tieredPosition(BLACK_POSITIONS, TREBLE_OCTAVE_LADDER, difficulty, rand),
        'treble',
        'right',
        ordinal,
        difficulty,
        mode,
        rand,
        null,
      ),
  },

  /* ---- Phase 1 — Anchor plants ----------------------------------------- */
  {
    id: 'c03-guide-note-anchor',
    index: 3,
    phase: 1,
    phaseLabel: 'Anchor plants',
    title: 'Plant from one guide note',
    focus: 'One note tells you where all five fingers belong.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const position = tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand);
      const ascending = rand() < 0.6;
      const sci = ascending ? position.sci : [...position.sci].reverse();
      return build({
        conceptId: 'c03-guide-note-anchor',
        ordinal,
        difficulty,
        mode,
        instruction: ascending
          ? 'Thumb on this note. Play all five fingers upward.'
          : 'Little finger on this note. Play all five fingers downward.',
        clef: 'treble',
        hand: 'right',
        notes: [
          {
            keys: [ascending ? position.vf[0] : position.vf[4]],
            duration: 'w',
            finger: ascending ? 1 : 5,
            anchor: true,
          },
        ],
        keySignature: position.template.keySignature,
        beatsPerBar: 4,
        expectedSequence: sci,
        tempoWindowSec: lerp(5, 3.5, difficulty),
        positionLabel: position.label,
      });
    },
  },
  {
    id: 'c04-left-hand-anchor',
    index: 4,
    phase: 1,
    phaseLabel: 'Anchor plants',
    title: 'Left hand anchor',
    focus: 'Same skill, mirrored. Watch which finger takes which note.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) =>
      plantDrill(
        'c04-left-hand-anchor',
        'Left hand. Read the fingering before you start.',
        tieredPosition(POSITIONS_BY_RANK, BASS_OCTAVE_LADDER, difficulty, rand),
        'bass',
        'left',
        ordinal,
        difficulty,
        mode,
        rand,
        lerp(5, 3.5, difficulty),
      ),
  },
  {
    id: 'c05-anchor-sprint',
    index: 5,
    phase: 1,
    phaseLabel: 'Anchor plants',
    title: 'Plant at speed',
    focus: 'Finding the position should stop being something you think about.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) =>
      plantDrill(
        'c05-anchor-sprint',
        'Same idea, faster. Place and play without stopping.',
        tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand),
        'treble',
        'right',
        ordinal,
        difficulty,
        mode,
        rand,
        lerp(3.5, 2.2, difficulty),
      ),
  },
  {
    id: 'c06-topography',
    index: 6,
    phase: 1,
    phaseLabel: 'Anchor plants',
    title: 'Feel the black keys',
    focus: 'Shapes with black keys sit differently under the hand.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const position = tieredPosition(BLACK_POSITIONS, TREBLE_OCTAVE_LADDER, difficulty, rand);
      const hint =
        position.template.topography === 'black-middle'
          ? 'This shape has a black key in the middle. Feel for it.'
          : 'This shape sits partly on black keys. Feel the shape first.';
      return plantDrill(
        'c06-topography',
        hint,
        position,
        'treble',
        'right',
        ordinal,
        difficulty,
        mode,
        rand,
        lerp(5, 3.5, difficulty),
      );
    },
  },

  /* ---- Phase 2 — Repeated notes and shifts ----------------------------- */
  {
    id: 'c07-repeated-note',
    index: 7,
    phase: 2,
    phaseLabel: 'Shifts',
    title: 'Repeated notes stay put',
    focus: 'A repeated note is not a reason to move your hand.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const position = tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand);
      const contour = pickContour(CONTOURS_REPEAT, difficulty, rand);
      const figure = figureFrom(position, 0, contour, 'right');
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c07-repeated-note',
        ordinal,
        difficulty,
        mode,
        instruction: 'The first note repeats. Keep your hand still.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: position.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(5, 3.5, difficulty),
        positionLabel: position.label,
      });
    },
  },
  {
    id: 'c08-step-shift',
    index: 8,
    phase: 2,
    phaseLabel: 'Shifts',
    title: 'Slide up one key',
    focus: 'The whole hand moves together, not one finger at a time.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const position = tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand);
      // Reaches at most degree 3, so the same shape still fits one step up.
      const pool = contoursWithin([...CONTOURS_3_TIGHT, ...CONTOURS_3_WIDE], 3);
      const contour = pickContour(pool, difficulty, rand);
      const figure = join(
        figureFrom(position, 0, contour, 'right'),
        figureFrom(position, 1, contour, 'right'),
      );
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c08-step-shift',
        ordinal,
        difficulty,
        mode,
        instruction: 'Slide the whole hand up one key, then play the same shape.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: position.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(7, 5, difficulty),
        positionLabel: position.label,
      });
    },
  },
  {
    id: 'c09-skip-shift',
    index: 9,
    phase: 2,
    phaseLabel: 'Shifts',
    title: 'Shift by a skip',
    focus: 'A wider slide needs the same single motion.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const position = tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand);
      const contour = pickContour(contoursWithin(CONTOURS_3_TIGHT, 2), difficulty, rand);
      const figure = join(
        figureFrom(position, 0, contour, 'right'),
        figureFrom(position, 2, contour, 'right'),
      );
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c09-skip-shift',
        ordinal,
        difficulty,
        mode,
        instruction: 'This time the hand moves further. Thumb lands on the new note.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: position.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(7, 5, difficulty),
        positionLabel: position.label,
      });
    },
  },
  {
    id: 'c10-mid-phrase-shift',
    index: 10,
    phase: 2,
    phaseLabel: 'Shifts',
    title: 'Shift inside a phrase',
    focus: 'Catch the move without breaking the line.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const position = tieredPosition(POSITIONS_BY_RANK, TREBLE_OCTAVE_LADDER, difficulty, rand);
      const opening = pickContour(contoursWithin(CONTOURS_4, 4), difficulty, rand);
      const answer = pickContour(contoursWithin(CONTOURS_3_TIGHT, 2), difficulty, rand);
      // reinforce: shorter opening, so the shift is the only thing to hold.
      const openContour = mode === 'reinforce' ? opening.slice(0, 3) : opening;
      const figure = join(
        figureFrom(position, 0, openContour, 'right'),
        figureFrom(position, 2, answer, 'right'),
      );
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c10-mid-phrase-shift',
        ordinal,
        difficulty,
        mode,
        instruction: 'Play straight through. The shift happens in the middle.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: position.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(8, 6, difficulty),
        positionLabel: position.label,
      });
    },
  },

  /* ---- Phase 3 — Jumps -------------------------------------------------- */
  {
    id: 'c11-small-jump',
    index: 11,
    phase: 3,
    phaseLabel: 'Jumps',
    title: 'Jump with a rest',
    focus: 'The rest is travel time. Use it.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const { from, to } = jumpPositions(tieredPick(SMALL_JUMPS, difficulty, rand));
      const before = pickContour(CONTOURS_3_SPREAD, difficulty, rand);
      const after = pickContour(CONTOURS_3_SPREAD, difficulty, rand);
      const a = figureFrom(from, 0, before, 'right');
      const b = figureFrom(to, 0, after, 'right');
      const beatsPerBar = chooseMeter(rand, difficulty);
      const notes = [...a.notes, REST_SLOT, ...b.notes];
      return build({
        conceptId: 'c11-small-jump',
        ordinal,
        difficulty,
        mode,
        instruction: 'Lift your hand during the rest and land on the new thumb note.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(notes, beatsPerBar, rand),
        keySignature: from.template.keySignature,
        beatsPerBar,
        expectedSequence: [...a.sci, ...b.sci],
        tempoWindowSec: lerp(9, 7, difficulty),
        positionLabel: `${from.label} to ${to.label}`,
      });
    },
  },
  {
    id: 'c12-large-jump',
    index: 12,
    phase: 3,
    phaseLabel: 'Jumps',
    title: 'Jump without a rest',
    focus: 'No travel time. The hand has to already know where it is going.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const { from, to } = jumpPositions(tieredPick(LARGE_JUMPS, difficulty, rand));
      const before = pickContour(CONTOURS_3_SPREAD, difficulty, rand);
      const after = pickContour(CONTOURS_3_SPREAD, difficulty, rand);
      const a = figureFrom(from, 0, before, 'right');
      const b = figureFrom(to, 0, after, 'right');
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c12-large-jump',
        ordinal,
        difficulty,
        mode,
        instruction: 'A longer jump, and no rest. Move as soon as you release.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm([...a.notes, ...b.notes], beatsPerBar, rand),
        keySignature: from.template.keySignature,
        beatsPerBar,
        expectedSequence: [...a.sci, ...b.sci],
        tempoWindowSec: lerp(8, 6, difficulty),
        positionLabel: `${from.label} to ${to.label}`,
      });
    },
  },
  {
    id: 'c13-multi-jump',
    index: 13,
    phase: 3,
    phaseLabel: 'Jumps',
    title: 'Three positions in a row',
    focus: 'Read ahead. Your eyes leave before your hands do.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const pair = tieredPick(SMALL_JUMPS, difficulty, rand);
      const { from: a, to: b } = jumpPositions(pair);
      const c = buildPosition(positionById(pair.from.id), pair.from.octave + 1);
      const chain = mode === 'reinforce' ? [a, b] : [a, b, c];
      const pool = contoursWithin(CONTOURS_3_SPREAD, 4);
      const figures = chain.map((p) => figureFrom(p, 0, pickContour(pool, difficulty, rand), 'right'));
      const figure = join(...figures);
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c13-multi-jump',
        ordinal,
        difficulty,
        mode,
        instruction: 'Several positions in a row. Look ahead to the next thumb note.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: a.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(9, 7, difficulty),
        positionLabel: chain.map((p) => p.label).join(' to '),
      });
    },
  },

  /* ---- Phase 4 — Anchor flexibility ------------------------------------ */
  {
    id: 'c14-same-key-two-fingers',
    index: 14,
    phase: 4,
    phaseLabel: 'Flexibility',
    title: 'One key, two fingers',
    focus: 'No finger owns a key. The music decides.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const anchor = tieredPick(FLEX_ANCHORS, difficulty, rand);
      // The reach is the evidence, so this shape is fixed. Variety comes
      // from the anchor, the meter and the rhythm instead.
      const notes: CueNote[] = [
        { keys: [anchor.key], duration: 'q', finger: 1, anchor: true },
        { keys: [anchor.up], duration: 'q', finger: 5 },
        { keys: [anchor.key], duration: 'q', finger: 5, anchor: true },
        { keys: [anchor.down], duration: 'q', finger: 1 },
      ];
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c14-same-key-two-fingers',
        ordinal,
        difficulty,
        mode,
        instruction: 'The same note twice, with a different finger each time.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(notes, beatsPerBar, rand),
        keySignature: anchor.keySignature,
        beatsPerBar,
        expectedSequence: [anchor.key, anchor.up, anchor.key, anchor.down].map(toScientific),
        tempoWindowSec: lerp(6, 4.5, difficulty),
        positionLabel: `${toScientific(anchor.key)} anchor, both fingerings`,
        fingeringInferred: true,
      });
    },
  },
  {
    id: 'c15-flexible-finger-phrase',
    index: 15,
    phase: 4,
    phaseLabel: 'Flexibility',
    title: 'Unexpected fingering',
    focus: 'Read the number, not your habit.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const anchor = tieredPick(FLEX_ANCHORS, difficulty, rand);
      const notes: CueNote[] = [
        { keys: [anchor.key], duration: 'q', finger: 5, anchor: true },
        { keys: [anchor.down], duration: 'q', finger: 1 },
        { keys: [anchor.key], duration: 'q', finger: 1, anchor: true },
        { keys: [anchor.up], duration: 'q', finger: 5 },
      ];
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c15-flexible-finger-phrase',
        ordinal,
        difficulty,
        mode,
        instruction: 'Read the fingering carefully. It is not the one you expect.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(notes, beatsPerBar, rand),
        keySignature: anchor.keySignature,
        beatsPerBar,
        expectedSequence: [anchor.key, anchor.down, anchor.key, anchor.up].map(toScientific),
        tempoWindowSec: lerp(6, 4.5, difficulty),
        positionLabel: `${toScientific(anchor.key)} anchor, reversed fingering`,
        fingeringInferred: true,
      });
    },
  },

  /* ---- Phase 5 — Applied integration ----------------------------------- */
  {
    id: 'c16-shift-and-jump',
    index: 16,
    phase: 5,
    phaseLabel: 'Putting it together',
    title: 'Shift, then jump',
    focus: 'Tell a small slide apart from a real leap, on sight.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const { from, to } = jumpPositions(tieredPick(SMALL_JUMPS, difficulty, rand));
      const shape = pickContour(contoursWithin([...CONTOURS_3_TIGHT, ...CONTOURS_3_WIDE], 3), difficulty, rand);
      const landing = pickContour(CONTOURS_3_SPREAD, difficulty, rand);
      const reinforcing = mode === 'reinforce';
      const figure = reinforcing
        ? join(figureFrom(from, 0, shape, 'right'), figureFrom(to, 0, landing, 'right'))
        : join(
            figureFrom(from, 0, shape, 'right'),
            figureFrom(from, 1, shape, 'right'),
            figureFrom(to, 0, landing, 'right'),
          );
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c16-shift-and-jump',
        ordinal,
        difficulty,
        mode,
        instruction: 'One small slide, then one real jump. Do not stop between them.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: from.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(11, 9, difficulty),
        positionLabel: `${from.label} shift, jump to ${to.label}`,
      });
    },
  },
  {
    id: 'c17-full-mixed-read',
    index: 17,
    phase: 5,
    phaseLabel: 'Putting it together',
    title: 'Everything at once',
    focus: 'Anchor, shift, jump and fingering in one pass.',
    baseQuestionCount: BASE_QUESTIONS,
    maxQuestionCount: MAX_QUESTIONS,
    generate: (ordinal, rand, difficulty, mode) => {
      const { from, to } = jumpPositions(tieredPick(LARGE_JUMPS, difficulty, rand));
      const opening = pickContour(contoursWithin(CONTOURS_4, 4), difficulty, rand);
      const middle = pickContour(contoursWithin(CONTOURS_3_TIGHT, 2), difficulty, rand);
      const landing = pickContour(CONTOURS_3_SPREAD, difficulty, rand);
      const figure =
        mode === 'reinforce'
          ? join(figureFrom(from, 0, opening, 'right'), figureFrom(to, 0, landing, 'right'))
          : join(
              figureFrom(from, 0, opening, 'right'),
              figureFrom(from, 2, middle, 'right'),
              figureFrom(to, 0, landing, 'right'),
            );
      const beatsPerBar = chooseMeter(rand, difficulty);
      return build({
        conceptId: 'c17-full-mixed-read',
        ordinal,
        difficulty,
        mode,
        instruction: 'Everything at once. Play it through without stopping.',
        clef: 'treble',
        hand: 'right',
        notes: applyRhythm(figure.notes, beatsPerBar, rand),
        keySignature: from.template.keySignature,
        beatsPerBar,
        expectedSequence: figure.sci,
        tempoWindowSec: lerp(12, 10, difficulty),
        positionLabel: `${from.label} through ${to.label}`,
        fingeringInferred: true,
      });
    },
  },
];

export const CONCEPTS: Concept[] = PROGRESSIVE_CONCEPTS;

export const TOTAL_CONCEPTS = CONCEPTS.length;

export function getConcept(index: number) {
  return CONCEPTS[Math.min(Math.max(1, index), CONCEPTS.length) - 1];
}

/**
 * Where a question sits on its concept's ladder.
 *
 * The modulo matters: when a miss extends the loop past the base count, the
 * extra reps restart the ladder from easy rather than stacking more hard
 * questions on a student who just failed one.
 */
export function difficultyFor(questionNumber: number, baseCount: number): number {
  if (baseCount <= 1) return 0;
  const rung = (questionNumber - 1) % baseCount;
  // A three-rep lesson should demonstrate easy → developing → confident,
  // not easy → medium → maximum. Reserve the top quarter for adaptive
  // extensions and later lessons so compression from five reps never creates
  // a difficulty cliff.
  return clamp01(rung / Math.max(4, baseCount));
}

/* ---------------------------------------------------------------------------
   Adaptive engine. Pure — the reducer calls these directly, which keeps
   question generation out of render and immune to stale closures.
   --------------------------------------------------------------------------- */

export interface PerformanceSignal {
  lastPassed: boolean | null;
  lastDifficulty: number;
  lastAttempts: number;
  lastTimeMs: number;
  lastTempoWindowSec: number | null;
  consecutivePasses: number;
  consecutiveFails: number;
}

export const INITIAL_SIGNAL: PerformanceSignal = {
  lastPassed: null,
  lastDifficulty: 0,
  lastAttempts: 1,
  lastTimeMs: 0,
  lastTempoWindowSec: null,
  consecutivePasses: 0,
  consecutiveFails: 0,
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function wasEffortless(signal: PerformanceSignal): boolean {
  if (!signal.lastPassed || signal.lastAttempts > 1) return false;
  if (signal.lastTempoWindowSec === null) return signal.lastTimeMs < 6000;
  return signal.lastTimeMs < signal.lastTempoWindowSec * 1000 * 0.6;
}

/**
 * Asymmetric on purpose: drops are larger than climbs. Pushing a struggling
 * student one rung down is cheap; leaving them stranded above their ceiling
 * costs the whole lesson.
 */
export function nextDifficulty(
  current: number,
  signal: PerformanceSignal,
  baseCount: number,
): number {
  // Three base questions use 0.25-sized steps. The previous 1/(n-1) formula
  // made a successful three-rep lesson jump 0 → .5 → 1, which is much too
  // abrupt for children and leaves no headroom for stretch material.
  const rung = 1 / Math.max(4, baseCount);
  if (signal.lastPassed === null) return clamp01(current);

  if (!signal.lastPassed) {
    const drop = signal.consecutiveFails >= 2 ? rung * 2 : rung * 1.2;
    return clamp01(current - drop);
  }

  if (wasEffortless(signal)) {
    const spike = signal.consecutivePasses >= 2 ? rung * 1.35 : rung * 1.15;
    return clamp01(current + spike);
  }

  if (signal.lastAttempts > 1) return clamp01(current + rung * 0.2);
  return clamp01(current + rung);
}

export function nextMode(signal: PerformanceSignal): GenerationMode {
  if (signal.lastPassed === null) return 'normal';
  if (!signal.lastPassed || signal.consecutiveFails > 0) return 'reinforce';
  if (signal.consecutivePasses >= 2 && wasEffortless(signal)) return 'stretch';
  return 'normal';
}

export function openingDifficulty(signal: PerformanceSignal): number {
  if (signal.lastPassed === null) return 0;
  if (signal.consecutiveFails > 0) return 0;
  if (signal.consecutivePasses >= 3) return 0.25;
  return 0;
}

export function updateSignal(
  signal: PerformanceSignal,
  outcome: {
    passed: boolean;
    difficulty: number;
    attempts: number;
    timeMs: number;
    tempoWindowSec: number | null;
  },
): PerformanceSignal {
  return {
    lastPassed: outcome.passed,
    lastDifficulty: outcome.difficulty,
    lastAttempts: outcome.attempts,
    lastTimeMs: outcome.timeMs,
    lastTempoWindowSec: outcome.tempoWindowSec,
    consecutivePasses: outcome.passed ? signal.consecutivePasses + 1 : 0,
    consecutiveFails: outcome.passed ? 0 : signal.consecutiveFails + 1,
  };
}
