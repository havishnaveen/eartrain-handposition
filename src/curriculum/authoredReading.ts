import type { Hand } from './types';

export interface AuthoredReadingScore {
  id: string;
  title: string;
  meter: 3 | 4;
  /** Space-separated degree+duration tokens. `r` is a rest; `024q` is a triad. */
  right?: string;
  left?: string;
  solo?: string;
  soloHand?: Hand;
  measuresPerSystem?: number;
}

/**
 * Reviewed reading repertoire for every `standard` slot before the dedicated
 * chord-reading unit. These are authored scores, not random contours. Repeated
 * cells, answers, cadences, and accompaniment changes are intentional.
 */
const SCORES: Readonly<Record<string, AuthoredReadingScore>> = {
  '1-1': { id: 'c-position-walk', title: 'C-position walk', meter: 4, solo: '0q 1q 2q 3q | 4h 2q 0q' },
  '1-2': { id: 'c-position-answer', title: 'C-position answer', meter: 4, solo: '0q 2q 1q 3q | 2q 1q 0h' },
  '2-0': { id: 'little-question', title: 'Little question', meter: 3, solo: '0q 1q 2q | 3q 2q 1q | 0h rq' },
  '2-3': { id: 'turning-home', title: 'Turning home', meter: 4, solo: '0q 1q 2q 1q | 3q 2q 1q 0q' },
  '3-1': { id: 'bass-steps', title: 'Bass steps', meter: 4, solo: '0q 1q 2q 3q | 4h 2q 0q', soloHand: 'left' },
  '3-2': { id: 'bass-answer', title: 'Bass answer', meter: 4, solo: '4q 2q 3q 1q | 2q 1q 0h', soloHand: 'left' },

  '4-0': {
    id: 'hands-say-hello', title: 'Hands say hello', meter: 4,
    right: '0q 1q 2q 1q | rq rq rq rq',
    left: 'rq rq rq rq | 4q 3q 2q 0q',
  },
  '4-3': {
    id: 'answer-back', title: 'Answer back', meter: 4,
    right: 'rq rq rq rq | 0q 2q 1q 0q',
    left: '0q 1q 2q 1q | rq rq rq rq',
  },
  '5-1': {
    id: 'g-pedal-song', title: 'G pedal song', meter: 4,
    right: '0q 1q 2q 3q | 4q 2q 1q 0q',
    left: '0w | 4w',
  },
  '6-0': {
    id: 'g-running-pairs', title: 'G running pairs', meter: 4,
    right: '0q 1q 2-8 3-8 4q | 3q 2-8 1-8 2q 0q',
    left: '0h 4h | 0w',
  },
  '6-2': {
    id: 'g-echo-dance', title: 'G echo dance', meter: 4,
    right: '0-8 1-8 2q 1-8 2-8 3q | 3q 2-8 1-8 2q 0q',
    left: '0w | 4h 0h',
  },
  '7-1': {
    id: 'd-major-bridge', title: 'D-major bridge', meter: 4,
    right: '0q 2q 1q 3q | 4h 2q 0q',
    left: '0h 4h | 0w',
  },
  '8-0': {
    id: 'd-major-skip-song', title: 'D-major skip song', meter: 3,
    right: '0q 2q 1q | 3-8 2-8 1q 0q | 2q 4q 0q',
    left: '0hd | 4hd | 0hd',
  },
  '8-2': {
    id: 'd-major-conversation', title: 'D-major conversation', meter: 4,
    right: '0-8 1-8 2q 3q 2q | rq rq 4q 2q',
    left: '0h 4h | 4q 3q 2q 0q',
  },
  '9-1': {
    id: 'a-major-contrary', title: 'A-major contrary motion', meter: 4,
    right: '0q 1q 2q 3q | 4q 3q 2q 0q',
    left: '4q 3q 2q 1q | 0q 1q 2q 4q',
  },
  '10-0': {
    id: 'a-major-lilt', title: 'A-major lilt', meter: 3,
    right: '0qd 1-8 2q | 3qd 2-8 1q | 0h rq',
    left: '0hd | 4hd | 0hd',
  },
  '10-2': {
    id: 'a-major-broken-fifths', title: 'A-major broken fifths', meter: 4,
    right: '0q 2-8 3-8 4q 3q | 2q 1-8 2-8 3q 0q',
    left: '0q 4q 2q 4q | 0q 4q 2q 0q',
  },
  '11-1': {
    id: 'e-major-parallel', title: 'E-major parallel motion', meter: 4,
    right: '0q 1q 2-8 3-8 4q | 2q 1q 2q 0q',
    left: '0q 1q 2-8 3-8 4q | 2q 1q 2q 0q',
  },
  '12-0': {
    id: 'e-major-alberti', title: 'E-major Alberti study', meter: 4,
    right: '0q 2q 3-8 4-8 3q | 1q 2-8 3-8 2q 0q',
    left: '0-8 4-8 2-8 4-8 0-8 4-8 2-8 4-8 | 0-8 4-8 2-8 4-8 0h',
  },
  '12-2': {
    id: 'e-major-cadence', title: 'E-major cadence tune', meter: 3,
    right: '0q 1-8 2-8 3q | 4qd 3-8 2q | 1q 2q 0q',
    left: '0hd | 4qd 2-8 0q | 0hd',
    measuresPerSystem: 2,
  },
  '13-1': {
    id: 'c-g-singing-bass', title: 'Singing line over a steady bass', meter: 4,
    right: '0q 2q 1-8 2-8 3q | 3q 2q 1q 0q',
    left: '0w | 4h 0h',
  },
  '14-1': {
    id: 'g-d-contrary-phrase', title: 'Contrary-motion phrase', meter: 4,
    right: '0-8 1-8 2q 3q 4q | 3q 1q 2q 0q',
    left: '4-8 3-8 2q 1q 0q | 1q 3q 2q 4q',
  },
  '15-1': {
    id: 'd-a-walking-bass', title: 'Tune with walking bass', meter: 4,
    right: '0q 2-8 3-8 4q 2q | 3qd 2-8 1q 0q',
    left: '0q 1q 2q 3q | 4q 3q 2q 0q',
  },
  '16-1': {
    id: 'a-e-melody-and-chords', title: 'Melody over changing chords', meter: 4,
    right: '0q 2q 3q 4q | 3q 2q 1q 0q',
    left: '024h rh | 024w',
  },
  '17-3': {
    id: 'f-sharp-chord-cadence', title: 'F-sharp chord cadence', meter: 4,
    solo: '0q 1q 2q 3q | 024w', soloHand: 'left',
  },
  '18-1': {
    id: 'b-fsharp-held-harmony', title: 'Tune over held harmony', meter: 4,
    right: '0q 2-8 3-8 4q 2q | 3q 1q 2q 0q',
    left: '024w | 024h 04h',
  },
  '19-1': {
    id: 'chord-shell-answer', title: 'Chord and shell answer', meter: 4,
    right: '024h 1q 2q | 04h 024h',
    left: '0w | 4h 0h',
  },
  '19-3': {
    id: 'chord-pulse-cadence', title: 'Chord pulse cadence', meter: 4,
    right: '024q 024q 1q 2q | 04h 024h',
    left: '0h 4h | 0w',
  },
  '20-0': {
    id: 'chords-in-three', title: 'Chords in three', meter: 3,
    right: '024h 2q | 04q 024h',
    left: '0hd | 4hd',
  },
  '20-2': {
    id: 'broken-to-blocked', title: 'Broken to blocked', meter: 4,
    right: '0q 2q 4q 2q | 024h 04h',
    left: '0w | 4h 0h',
  },
  '21-1': {
    id: 'middle-tone-color-one', title: 'Hear the middle-tone color', meter: 4,
    right: '04h 024h | 0q 2q 4q 024q',
    left: '0w | 0w',
  },
  '21-2': {
    id: 'middle-tone-color-two', title: 'Answer with a new color', meter: 4,
    right: '024q 04q 024h | 4q 2q 1q 0q',
    left: '0h 4h | 0w',
  },
  '22-0': {
    id: 'fifth-transfer-song', title: 'Transfer the chord frame', meter: 4,
    right: '024h 2q 4q | 04q 024q 2q 0q',
    left: '0q 4q 2q 4q | 0w',
  },
  '22-2': {
    id: 'fifth-transfer-answer', title: 'Answer across the staves', meter: 4,
    right: 'rq rq 024h | 4q 2q 1q 0q',
    left: '024h 0q 2q | 0w',
  },
  '23-0': {
    id: 'alberti-under-chords', title: 'Chords over Alberti bass', meter: 4,
    right: '024h 04h | 1q 2q 024h',
    left: '0-8 4-8 2-8 4-8 0-8 4-8 2-8 4-8 | 0-8 4-8 2-8 4-8 0h',
  },
  '23-2': {
    id: 'walking-bass-chord-tune', title: 'Chord tune with walking bass', meter: 4,
    right: '024q 2q 3q 4q | 04h 024h',
    left: '0q 1q 2q 3q | 4q 3q 2q 0q',
  },
  '24-0': {
    id: 'parallel-cadence-study', title: 'Parallel cadence study', meter: 4,
    right: '0-8 1-8 2q 024h | 4q 3q 2q 024q',
    left: '0-8 1-8 2q 024h | 4q 3q 2q 024q',
  },
  '24-2': {
    id: 'final-miniature', title: 'Final reading miniature', meter: 4,
    right: '024q 2-8 3-8 4q 3q | 2qd 1-8 04q 024q',
    left: '0q 4q 2q 4q | 0-8 4-8 2-8 4-8 024h',
  },
};

export function authoredReadingScore(lessonIndex: number, localRep: number): AuthoredReadingScore | null {
  return SCORES[`${lessonIndex}-${localRep}`] ?? null;
}
