import type { CueNote, Hand } from './types';
import { tieredPick } from './positions';

/**
 * Melody and rhythm.
 *
 * A contour is a list of DEGREE OFFSETS from the figure's thumb note, not
 * absolute pitches — so the same shape can be replayed from a shifted or
 * jumped-to position and the fingering stays honest (finger = offset + 1 for
 * the right hand, 5 - offset for the left).
 *
 * The hard constraint on the Phase 0/1 plant drills: every one of the five
 * degrees must appear, because playing all five is what PROVES the hand is
 * planted correctly. Variance there means reordering, never omitting.
 */

export type Contour = readonly number[];

/* --- Original tonal phrase bank -----------------------------------------
   These are small compositional shapes, not excerpts from method books.
   They favour stepwise motion, repeat a recognisable idea, and resolve to
   the tonic or another stable chord tone. Pools are ordered easiest to
   hardest so the generator can still adapt without producing note soup. */

export const MUSICAL_BEGINNER: readonly Contour[] = [
  [0, 1, 2, 1, 0],
  [0, 1, 2, 3, 2, 1, 0],
  [2, 1, 0, 1, 0],
  [4, 3, 2, 1, 0],
  [0, 1, 0, 2, 1, 0],
  [1, 2, 3, 2, 1, 0],
  [0, 1, 2, 1, 3, 2, 0],
  [3, 2, 1, 2, 0],
  [0, 1, 0, 1, 2, 0],
  [4, 3, 2, 3, 1, 0],
];

export const MUSICAL_REPEATED: readonly Contour[] = [
  [0, 0, 1, 2, 1, 0],
  [2, 2, 1, 0, 1, 0],
  [0, 1, 1, 2, 1, 0],
  [4, 4, 3, 2, 1, 0],
  [0, 2, 2, 1, 0],
  [0, 1, 2, 2, 1, 0],
  [3, 3, 2, 4, 3, 1, 0],
  [1, 2, 2, 3, 1, 0],
  [4, 3, 3, 1, 2, 0],
  [0, 2, 3, 3, 1, 0],
];

export const MUSICAL_GENTLE_SKIPS: readonly Contour[] = [
  [0, 2, 1, 2, 0],
  [0, 1, 3, 2, 1, 0],
  [0, 2, 4, 3, 2, 1, 0],
  [4, 2, 3, 1, 2, 0],
  [0, 2, 1, 3, 2, 0],
  [1, 3, 2, 4, 2, 0],
  [0, 3, 1, 2, 0],
  [4, 2, 0, 1, 3, 0],
  [0, 2, 3, 1, 2, 0],
  [2, 4, 3, 1, 2, 0],
];

export const MUSICAL_LATE: readonly Contour[] = [
  [0, 2, 4, 3, 1, 2, 0],
  [4, 2, 3, 1, 2, 0],
  [0, 3, 2, 4, 1, 2, 0],
  [2, 4, 1, 3, 2, 0],
  [0, 2, 1, 4, 3, 2, 0],
  [4, 1, 3, 0, 2, 4, 0],
  [1, 4, 2, 0, 3, 1, 0],
  [0, 4, 1, 3, 2, 4, 0],
  [3, 0, 2, 4, 1, 3, 0],
  [0, 2, 4, 1, 3, 2, 0],
  [4, 2, 0, 3, 1, 2, 0],
  [2, 0, 4, 1, 3, 0],
];

/* --- Three-note figures, grouped by how far they reach --------------------
   A figure that will be replayed a step higher can only reach degree 3; two
   steps higher, only degree 2. Reaching further would run off the hand. */

export const CONTOURS_3_TIGHT: readonly Contour[] = [
  [0, 1, 2], [2, 1, 0], [0, 2, 1], [1, 0, 2], [2, 0, 1], [1, 2, 0],
];

export const CONTOURS_3_WIDE: readonly Contour[] = [
  [0, 1, 3], [3, 1, 0], [0, 3, 1], [1, 3, 0], [3, 0, 1], [0, 2, 3], [3, 2, 0], [1, 3, 2],
];

export const CONTOURS_3_SPREAD: readonly Contour[] = [
  [0, 2, 4], [4, 2, 0], [0, 4, 2], [2, 4, 0], [4, 0, 2], [2, 0, 4], [0, 3, 4], [4, 1, 2],
];

export const CONTOURS_4: readonly Contour[] = [
  [0, 1, 2, 1], [0, 2, 1, 3], [2, 1, 0, 2], [0, 1, 3, 2],
  [3, 2, 1, 0], [0, 2, 4, 2], [4, 2, 0, 1], [1, 3, 2, 0],
  [2, 0, 3, 1], [0, 4, 2, 3],
];

/** Repeated first note, then a continuation that may rise or fall. */
export const CONTOURS_REPEAT: readonly Contour[] = [
  [0, 0, 1, 2], [1, 1, 2, 3], [2, 2, 3, 4], [2, 2, 1, 0],
  [3, 3, 2, 1], [4, 4, 3, 2], [1, 1, 0, 2], [3, 3, 4, 2],
];

/**
 * Five-degree figures, ordered smoothest to most angular.
 *
 * Every entry is a permutation of 0–4: all five fingers are used, so the
 * position is still fully validated no matter which shape is drawn. Only the
 * order changes, which is exactly the variance we want — a student who has
 * only ever played ascending has learned the scale, not the position.
 */
export const CONTOURS_5: readonly Contour[] = [
  [0, 1, 2, 3, 4],
  [4, 3, 2, 1, 0],
  [0, 1, 3, 2, 4],
  [0, 2, 1, 3, 4],
  [4, 2, 3, 1, 0],
  [0, 1, 4, 2, 3],
  [2, 0, 1, 3, 4],
  [0, 3, 1, 2, 4],
  [4, 1, 3, 0, 2],
  [2, 4, 0, 3, 1],
];

/** Filters a pool to figures that stay inside the hand after a shift. */
export function contoursWithin(pool: readonly Contour[], maxOffset: number): readonly Contour[] {
  const usable = pool.filter((c) => Math.max(...c) <= maxOffset);
  return usable.length > 0 ? usable : pool.filter((c) => Math.max(...c) <= 2);
}

export function fingerFor(offset: number, hand: Hand): number {
  return hand === 'right' ? offset + 1 : 5 - offset;
}

/* --- Rhythm ---------------------------------------------------------------
   Every generated phrase fills whole measures. That is what lets the staff
   carry an honest time signature and real barlines: a five-note phrase is
   written across two bars, not stamped 4/4 and left ragged.

   Subdivisions arrive only after the pulse is established. Lessons 6–12
   contain an eighth-note pair in 60% of drills. From Lesson 13 onward, 60%
   contain a four-sixteenth group, 24% retain eighths, and 16% stay simple.
   The latter two paths are intentional: crossing a lesson boundary should
   introduce a rhythm, not make every later drill look identical. */

const BEATS_FOR: Record<number, string> = {
  0.25: '16',
  0.5: '8',
  1: 'q',
  2: 'h',
  3: 'hd',
  4: 'w',
};

/** Prefer subdivision runs without an immediate repeated pitch. */
function subdivisionStarts(
  notes: CueNote[],
  size: number,
  protectedIndices: ReadonlySet<number>,
): number[] {
  const starts: number[] = [];
  // Keep the final note available for the cadence/measure fill.
  for (let start = 0; start + size <= notes.length - 1; start++) {
    if (Array.from({ length: size }, (_, offset) => start + offset)
      .some((index) => protectedIndices.has(index))) continue;
    let clean = true;
    for (let index = start + 1; index < start + size; index++) {
      if (notes[index - 1].keys.join('|') === notes[index].keys.join('|')) {
        clean = false;
        break;
      }
    }
    if (clean) starts.push(start);
  }
  return starts;
}

export function chooseMeter(
  rand: () => number,
  difficulty: number,
  lessonLevel = 17,
): number {
  // The opening five lessons keep a stable 4/4 pulse. Three-four arrives
  // only after note reading itself is comfortable.
  if (lessonLevel <= 5) return 4;
  // 3/4 appears more often higher up the ladder, for variety rather than
  // difficulty — a student should not assume every drill is in four.
  const lessonProgress = Math.min(1, Math.max(0, (lessonLevel - 6) / 14));
  const threeChance = 0.12 + lessonProgress * 0.2 + difficulty * 0.08;
  return rand() < threeChance ? 3 : 4;
}

/**
 * Assign durations so the phrase fills whole bars.
 *
 * Quarters everywhere, then lengthen notes until the total is a multiple of
 * the bar. The last note is lengthened first, because a phrase that ends on
 * a held note reads as a phrase rather than a list.
 */
export function applyRhythm(
  notes: CueNote[],
  beatsPerBar: number,
  rand: () => number,
  lessonLevel = 1,
  /** Notes that must keep a full beat, e.g. both sides of a hand-position jump. */
  protectedIndices: readonly number[] = [],
): CueNote[] {
  const count = notes.length;
  if (count === 0) return notes;

  const beats = new Array<number>(count).fill(1);

  const rhythmRoll = rand();
  let subdivision: { size: number; beats: number } | null = null;
  if (lessonLevel > 12 && rhythmRoll < 0.6) {
    subdivision = { size: 4, beats: 0.25 };
  } else if (
    lessonLevel > 5 &&
    // Lessons 6–12: 60% eighths. Lessons 13+: the 0.60–0.84 band
    // retains them in 24% of drills after sixteenths become available.
    (lessonLevel <= 12 ? rhythmRoll < 0.6 : rhythmRoll < 0.84)
  ) {
    subdivision = { size: 2, beats: 0.5 };
  }

  if (subdivision) {
    const starts = subdivisionStarts(notes, subdivision.size, new Set(protectedIndices));
    if (starts.length > 0) {
      const start = starts[Math.min(starts.length - 1, Math.floor(rand() * starts.length))];
      for (let index = start; index < start + subdivision.size; index++) {
        beats[index] = subdivision.beats;
      }
    }
  }

  const usedBeforeFinal = beats
    .slice(0, -1)
    .reduce((sum, noteBeats) => sum + noteBeats, 0);
  const minimumTotal = usedBeforeFinal + 1;
  const target = Math.ceil(minimumTotal / beatsPerBar) * beatsPerBar;

  // Resolve on a held final note. The subdivision group always occupies one
  // beat, so the final duration remains an ordinary 1–4 beat value and no
  // generated note needs to cross a barline.
  beats[count - 1] = Math.max(1, target - usedBeforeFinal);

  return notes.map((note, i) => {
    const symbol = BEATS_FOR[beats[i]] ?? 'q';
    const isRest = note.duration.endsWith('r');
    return { ...note, duration: isRest ? `${symbol}r` : symbol };
  });
}

/** Total beats a rhythm occupies — used to confirm bar alignment in tests. */
export function totalBeatsOf(notes: CueNote[]): number {
  const map: Record<string, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };
  return notes.reduce((sum, note) => {
    const withoutRest = note.duration.replace(/r$/, '');
    const dotted = withoutRest.endsWith('d');
    const base = withoutRest.replace(/d$/, '');
    const beats = map[base] ?? 1;
    return sum + (dotted ? beats * 1.5 : beats);
  }, 0);
}

export function pickContour(
  pool: readonly Contour[],
  difficulty: number,
  rand: () => number,
): Contour {
  return tieredPick(pool, difficulty, rand, 0.55);
}
