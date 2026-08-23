import type { CueNote, Hand, Topography } from './types';

/** Deterministic PRNG (mulberry32). Same seed, same drill — replayable. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

/**
 * Sample from a difficulty-ordered pool.
 *
 * `sorted` runs easiest to hardest. A window slides across it as difficulty
 * climbs 0 -> 1, and one item is drawn at random from inside that window.
 * The ladder is real, but no two runs produce the same five questions.
 */
export function tieredPick<T>(
  sorted: readonly T[],
  difficulty: number,
  rand: () => number,
  windowFraction = 0.45,
): T {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const d = Math.min(1, Math.max(0, difficulty));
  const center = d * (n - 1);
  // Scales with (n - 1), not n, so a 2- or 3-item ladder still tiers
  // instead of collapsing into "pick anything".
  const half = Math.max(0, ((n - 1) * windowFraction) / 2);
  const lo = Math.max(0, Math.round(center - half));
  const hi = Math.min(n - 1, Math.round(center + half));
  return sorted[lo + Math.floor(rand() * (hi - lo + 1))];
}

/** "f#/4" -> "F#4", "bb/3" -> "Bb3" */
export function toScientific(vexKey: string): string {
  const [letter, octave] = vexKey.split('/');
  return letter.charAt(0).toUpperCase() + letter.slice(1) + octave;
}

const LETTER_SEMITONE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Rough MIDI number for a VexFlow key — used only for difficulty ranking. */
export function midiOf(vexKey: string): number {
  const [raw, octave] = vexKey.split('/');
  const letter = raw[0];
  const accidental = raw.slice(1);
  let semitone = LETTER_SEMITONE[letter] ?? 0;
  if (accidental.includes('#')) semitone += accidental.length;
  if (accidental.includes('b')) semitone -= accidental.length;
  return (Number(octave) + 1) * 12 + semitone;
}

export interface PositionTemplate {
  id: string;
  keySignature: string;
  letters: [string, string, string, string, string];
  /** Octave increments relative to the base octave (bumps at C). */
  octaveOffsets: [number, number, number, number, number];
  topography: Topography;
  /** 0 = easiest shape under the hand, 1 = hardest. Drives tiering. */
  rank: number;
}

/**
 * Ordered easiest -> hardest. The final two shapes deliberately extend the
 * pathway to five- and six-sharp reading without spelling pitches as their
 * enharmonic flat equivalents; the visible signature and expected audio
 * pitches therefore describe the same key.
 */
export const POSITIONS: readonly PositionTemplate[] = [
  { id: 'C',  keySignature: 'C',  letters: ['c', 'd', 'e', 'f', 'g'],   octaveOffsets: [0, 0, 0, 0, 0], topography: 'all-white',    rank: 0.0 },
  { id: 'G',  keySignature: 'G',  letters: ['g', 'a', 'b', 'c', 'd'],   octaveOffsets: [0, 0, 0, 1, 1], topography: 'all-white',    rank: 0.15 },
  { id: 'F',  keySignature: 'F',  letters: ['f', 'g', 'a', 'bb', 'c'],  octaveOffsets: [0, 0, 0, 0, 1], topography: 'black-middle', rank: 0.25 },
  { id: 'D',  keySignature: 'D',  letters: ['d', 'e', 'f#', 'g', 'a'],  octaveOffsets: [0, 0, 0, 0, 0], topography: 'black-middle', rank: 0.35 },
  { id: 'A',  keySignature: 'A',  letters: ['a', 'b', 'c#', 'd', 'e'],  octaveOffsets: [0, 0, 1, 1, 1], topography: 'black-middle', rank: 0.5 },
  { id: 'Bb', keySignature: 'Bb', letters: ['bb', 'c', 'd', 'eb', 'f'], octaveOffsets: [0, 1, 1, 1, 1], topography: 'black-edges',  rank: 0.6 },
  { id: 'E',  keySignature: 'E',  letters: ['e', 'f#', 'g#', 'a', 'b'], octaveOffsets: [0, 0, 0, 0, 0], topography: 'black-edges',  rank: 0.68 },
  { id: 'B',  keySignature: 'B',  letters: ['b', 'c#', 'd#', 'e', 'f#'], octaveOffsets: [0, 1, 1, 1, 1], topography: 'black-edges', rank: 0.84 },
  { id: 'F#', keySignature: 'F#', letters: ['f#', 'g#', 'a#', 'b', 'c#'], octaveOffsets: [0, 0, 0, 0, 1], topography: 'black-edges', rank: 1.0 },
];

const byRank = (a: PositionTemplate, b: PositionTemplate) => a.rank - b.rank;

export const POSITIONS_BY_RANK = [...POSITIONS].sort(byRank);
export const WHITE_POSITIONS = POSITIONS_BY_RANK.filter((p) => p.topography === 'all-white');
export const BLACK_POSITIONS = POSITIONS_BY_RANK.filter((p) => p.topography !== 'all-white');

/**
 * Octaves ordered by reading difficulty. The middle octave sits on the staff;
 * outer octaves need ledger lines, which is the harder read.
 */
export const TREBLE_OCTAVE_LADDER = [4, 5, 3];
export const BASS_OCTAVE_LADDER = [3, 2];

export function positionById(id: string): PositionTemplate {
  return POSITIONS.find((p) => p.id === id) ?? POSITIONS[0];
}

export interface Position {
  template: PositionTemplate;
  vf: string[];
  sci: string[];
  label: string;
}

/**
 * Lowest pitch the curriculum may generate, as a MIDI number.
 *
 * G2 (43). Two reasons, and they agree: reading below the bass staff is not
 * a CM 1-3 skill, and pitches near mains hum are exactly where acoustic
 * detection becomes unreliable. Positions that would fall below this are
 * lifted an octave instead.
 */
export const LOWEST_MIDI = 43;

/**
 * Highest pitch the curriculum may generate: C-sharp6 (85).
 *
 * Same two reasons as the floor, in the same direction. Reading five ledger
 * lines above the treble staff is not a CM 1-3 skill, and it keeps every
 * generated note inside the detector's reliable range. The one-semitone
 * extension beyond C6 is deliberate: a complete F-sharp five-finger shape
 * must reach C-sharp6 so the late B4→F-sharp5 shift remains an ascending
 * fifth instead of being silently clamped into a descending fourth.
 */
export const HIGHEST_MIDI = 85;

export function buildPosition(template: PositionTemplate, baseOctave: number): Position {
  let octave = baseOctave;
  while (
    octave < 7 &&
    midiOf(`${template.letters[0]}/${octave + template.octaveOffsets[0]}`) < LOWEST_MIDI
  ) {
    octave += 1;
  }
  // Top of the position, not its root — a five-finger shape reaches upward.
  while (
    octave > 1 &&
    midiOf(`${template.letters[4]}/${octave + template.octaveOffsets[4]}`) > HIGHEST_MIDI
  ) {
    octave -= 1;
  }
  const vf = template.letters.map(
    (letter, i) => `${letter}/${octave + template.octaveOffsets[i]}`,
  );
  return {
    template,
    vf,
    sci: vf.map(toScientific),
    label: `${template.id} position (${toScientific(vf[0])})`,
  };
}

/** Position chosen by difficulty across both shape and octave. */
export function tieredPosition(
  pool: readonly PositionTemplate[],
  ladder: readonly number[],
  difficulty: number,
  rand: () => number,
): Position {
  const template = tieredPick(pool, difficulty, rand);
  const octave = tieredPick(ladder, difficulty, rand, 0.5);
  return buildPosition(template, octave);
}

/** Ascending five-finger run. Fingers count up for RH, down for LH. */
export function fiveFingerNotes(position: Position, hand: Hand): CueNote[] {
  return position.vf.map((key, i) => ({
    keys: [key],
    duration: 'q',
    finger: hand === 'right' ? i + 1 : 5 - i,
    anchor: i === 0,
  }));
}

export function notesAt(
  position: Position,
  indices: number[],
  fingers: number[],
  anchorIndices: number[] = [0],
): CueNote[] {
  return indices.map((noteIndex, i) => ({
    keys: [position.vf[noteIndex]],
    duration: 'q',
    finger: fingers[i],
    anchor: anchorIndices.includes(i),
  }));
}

export function sciAt(position: Position, indices: number[]): string[] {
  return indices.map((i) => position.sci[i]);
}

export const REST: CueNote = { keys: ['b/4'], duration: 'qr' };

export interface JumpPair {
  from: { id: string; octave: number };
  to: { id: string; octave: number };
}

/** Middle of the treble staff (B4). Reading cost grows with distance from it. */
const TREBLE_CENTER = 71;

function jumpSpan(pair: JumpPair): number {
  const from = buildPosition(positionById(pair.from.id), pair.from.octave);
  const to = buildPosition(positionById(pair.to.id), pair.to.octave);
  // Distance the hand travels, plus penalties for hard shapes and for notes
  // sitting far off the staff. These drills are read in treble, so low
  // positions are the expensive ones — ledger lines below, not above.
  const travel = Math.abs(midiOf(to.vf[0]) - midiOf(from.vf[0]));
  const shapeCost = (from.template.rank + to.template.rank) * 3;
  const ledgerCost =
    (Math.abs(midiOf(from.vf[0]) - TREBLE_CENTER) + Math.abs(midiOf(to.vf[0]) - TREBLE_CENTER)) * 0.35;
  return travel + shapeCost + ledgerCost;
}

const RAW_SMALL_JUMPS: readonly JumpPair[] = [
  { from: { id: 'C', octave: 4 }, to: { id: 'G', octave: 4 } },
  { from: { id: 'C', octave: 3 }, to: { id: 'G', octave: 3 } },
  { from: { id: 'G', octave: 3 }, to: { id: 'D', octave: 4 } },
  { from: { id: 'G', octave: 4 }, to: { id: 'D', octave: 5 } },
  { from: { id: 'F', octave: 3 }, to: { id: 'C', octave: 4 } },
  { from: { id: 'F', octave: 4 }, to: { id: 'C', octave: 5 } },
  { from: { id: 'D', octave: 4 }, to: { id: 'A', octave: 4 } },
  { from: { id: 'D', octave: 3 }, to: { id: 'A', octave: 3 } },
  { from: { id: 'A', octave: 3 }, to: { id: 'E', octave: 4 } },
  { from: { id: 'Bb', octave: 3 }, to: { id: 'F', octave: 4 } },
];

const RAW_LARGE_JUMPS: readonly JumpPair[] = [
  { from: { id: 'C', octave: 4 }, to: { id: 'C', octave: 5 } },
  { from: { id: 'C', octave: 3 }, to: { id: 'C', octave: 4 } },
  { from: { id: 'G', octave: 3 }, to: { id: 'G', octave: 4 } },
  { from: { id: 'G', octave: 4 }, to: { id: 'G', octave: 5 } },
  { from: { id: 'F', octave: 3 }, to: { id: 'F', octave: 4 } },
  { from: { id: 'F', octave: 4 }, to: { id: 'F', octave: 5 } },
  { from: { id: 'D', octave: 4 }, to: { id: 'D', octave: 5 } },
  { from: { id: 'D', octave: 3 }, to: { id: 'D', octave: 4 } },
  { from: { id: 'A', octave: 3 }, to: { id: 'A', octave: 4 } },
  { from: { id: 'E', octave: 4 }, to: { id: 'E', octave: 5 } },
];

/** Sorted easiest -> hardest so tieredPick walks them in order. */
export const SMALL_JUMPS = [...RAW_SMALL_JUMPS].sort((a, b) => jumpSpan(a) - jumpSpan(b));
export const LARGE_JUMPS = [...RAW_LARGE_JUMPS].sort((a, b) => jumpSpan(a) - jumpSpan(b));

export function jumpPositions(pair: JumpPair) {
  return {
    from: buildPosition(positionById(pair.from.id), pair.from.octave),
    to: buildPosition(positionById(pair.to.id), pair.to.octave),
  };
}

/**
 * Anchors for interval-forced fingering. Playing the anchor then reaching
 * `up` is only comfortable with the thumb on it; reaching `down` is only
 * comfortable with the fifth finger. The reach is the evidence.
 */
export interface FlexAnchor {
  key: string;
  up: string;
  down: string;
  keySignature: string;
}

const RAW_FLEX_ANCHORS: readonly FlexAnchor[] = [
  { key: 'c/4', up: 'g/4', down: 'f/3', keySignature: 'C' },
  { key: 'd/4', up: 'a/4', down: 'g/3', keySignature: 'C' },
  { key: 'e/4', up: 'b/4', down: 'a/3', keySignature: 'C' },
  { key: 'g/4', up: 'd/5', down: 'c/4', keySignature: 'C' },
  { key: 'a/4', up: 'e/5', down: 'd/4', keySignature: 'C' },
  { key: 'b/4', up: 'f#/5', down: 'e/4', keySignature: 'G' },
  { key: 'c/5', up: 'g/5', down: 'f/4', keySignature: 'C' },
  { key: 'd/5', up: 'a/5', down: 'g/4', keySignature: 'C' },
  { key: 'g/3', up: 'd/4', down: 'c/3', keySignature: 'C' },
  { key: 'f/4', up: 'c/5', down: 'bb/3', keySignature: 'F' },
];

/** Closest to the middle of the treble staff is the easiest read. */
export const FLEX_ANCHORS = [...RAW_FLEX_ANCHORS].sort(
  (a, b) => Math.abs(midiOf(a.key) - TREBLE_CENTER) - Math.abs(midiOf(b.key) - TREBLE_CENTER),
);
