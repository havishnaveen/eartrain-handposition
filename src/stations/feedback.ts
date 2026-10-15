import type { StationQuestion } from './types';

/** Concise musical feedback, including for previously saved batches. */
export function stationExplanation(q: StationQuestion): string {
  const note = `Note ${q.targetIndex + 1}`;
  const pitch = q.question.expectedSequence[q.topic === 'mid-line-clef-change' ? q.targetIndex * 2 + 1 : q.targetIndex].replace('#', '♯').replace('b', '♭');
  switch (q.topic) {
    case 'key-signature': return `${note} is ${pitch}. The key signature supplies the sign even when none is printed beside the note.`;
    case 'clef-transposition': return q.explanation;
    case 'octave-displacement': return `${note} is ${pitch}, in the fifth octave.`;
    case 'mid-line-clef-change': return `Read the lower staff in treble clef from ${note} onward. That note is ${pitch}.`;
    case 'hand-position': return `${note} is ${pitch}, marked for finger ${q.question.cue.staves[0].notes[q.targetIndex].finger}. Staff position determines pitch.`;
    case 'cross-over-under': return `Use the thumb on ${note}, after finger 3. Keep the written beat steady.`;
    case 'accidental-carryover': return q.explanation;
  }
}
