import type { GradeResult } from '../audio/timing';
import type { StationQuestion } from './types';

/** Follow the actual missed note, not a predetermined later-measure mistake. */
export function playingFollowUp(q: StationQuestion, report: GradeResult) {
  const index = report.firstMissIndex;
  if (index < 0 || index >= q.question.expectedSequence.length || report.missed === 0) return null;
  const pitch = q.question.expectedSequence[index];
  const name = pitch.replace('#', '♯').replace('b', '♭');
  const both = q.question.handScope === 'both';
  const note = both ? `Note ${Math.floor(index / 2) + 1} on the ${index % 2 ? 'lower' : 'upper'} staff` : `Note ${index + 1}`;
  if (q.topic === 'key-signature' && /[#b]/.test(pitch)) {
    const letter = pitch[0], flat = pitch.includes('b');
    return { prompt: `Look at the key signature. What should you play for ${note}?`,
      choices: [name, `${letter}${pitch.slice(-1)} (natural)`], correct: 0,
      explanation: `The key signature makes ${letter} ${flat ? 'flat' : 'sharp'}. The sign does not need to appear beside ${note.toLowerCase()}.` };
  }
  return { prompt: `Read ${note} again. Which pitch is written?`,
    choices: [name, `${pitch[0]}${Number(pitch.slice(-1)) + 1}`], correct: 0,
    explanation: `${note} is ${name}. Check its staff position and clef before retrying.` };
}
