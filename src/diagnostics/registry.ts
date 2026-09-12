import type { Clef, Hand, Question } from '../curriculum/types';
import { midiToName, pitchToMidi } from '../audio/timing';

export type DiagnosticStage = 1 | 2 | 3 | 4;
export interface DiagnosticKey { id: string; name: string; tonic: string; minor: boolean; fifths: number }
const major = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const minor = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D'];
const fifths = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];
export const DIAGNOSTIC_KEYS: readonly DiagnosticKey[] = [false, true].flatMap(isMinor =>
  (isMinor ? minor : major).map((tonic, i) => ({
    id: `${tonic.replace('#', '-sharp').replace('b', '-flat').toLowerCase()}-${isMinor ? 'minor' : 'major'}`,
    name: `${tonic} ${isMinor ? 'minor' : 'major'}`, tonic, minor: isMinor, fifths: fifths[i],
  })),
);
const canonical = (value: string) => value.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  .replace(/sharp/gi, '#').replace(/flat/gi, 'b').toLowerCase().replace(/[\s_-]/g, '');
export function resolveDiagnosticKey(value: unknown): DiagnosticKey | undefined {
  if (typeof value !== 'string') return undefined;
  const name = canonical(value);
  return DIAGNOSTIC_KEYS.find(key => canonical(key.id) === name || canonical(key.name) === name ||
    (!key.minor && canonical(key.tonic) === name));
}
export interface DiagnosticNotation {
  clef: Clef;
  /** Changes before this zero-based note, including within a measure. */
  clefChange?: { index: number; clef: Clef };
  octaveUp?: boolean;
  fifths?: number;
  mistakeIndices: readonly number[];
}
export interface DiagnosticLesson {
  title: string;
  focus: string;
  question: Question;
  transfer: Question;
  notation: DiagnosticNotation;
  transferNotation: DiagnosticNotation;
  mistakePitches: string[];
  hesitationBefore?: number;
  explanation: string;
  mcq: { prompt: string; choices: readonly string[]; correct: number; explanation: string };
  tip: { kind: 'clef' | 'octave' | 'barline' | 'keyboard' | 'clef-change' | 'crossing'; text: string };
  key?: DiagnosticKey;
}
export interface DiagnosticDefinition {
  id: string;
  label: string;
  aliases: readonly string[];
  usesKey?: boolean;
  create: (key: DiagnosticKey) => DiagnosticLesson;
}
export function fiveFingerPattern(key: DiagnosticKey): string[] {
  const letters = 'CDEFGAB';
  const start = letters.indexOf(key.tonic[0]);
  const root = pitchToMidi(`${key.tonic}4`)!;
  const steps = key.minor ? [0, 2, 3, 5, 7] : [0, 2, 4, 5, 7];
  return steps.map((step, i) => {
    const letter = letters[(start + i) % 7];
    const octave = 4 + Math.floor((start + i) / 7);
    const alteration = root + step - pitchToMidi(`${letter}${octave}`)!;
    return `${letter}${alteration > 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration)}${octave}`;
  });
}
export const isBlackKey = (pitch: string) => [1, 3, 6, 8, 10].includes(pitchToMidi(pitch)! % 12);
const cueKey = (pitch: string) => pitch.replace(/(-?\d+)$/, '/$1').toLowerCase();
function question(id: string, pitches: string[], hand: Hand = 'right', fingers?: number[], proof?: string[]): Question {
  const fingering = fingers ?? pitches.map((_, i) => hand === 'left' ? [5, 3, 2, 1][i % 4] : [1, 2, 3, 5][i % 4]);
  const anchors = proof ?? [pitches[0], pitches[Math.min(1, pitches.length - 1)], pitches[Math.min(2, pitches.length - 1)]];
  return {
    id, conceptId: id.split('/')[0], exerciseMode: 'standard', handScope: hand,
    instruction: 'Find your starting place, then play the phrase with a steady beat.',
    cue: { timeSignature: '4/4', staves: [{ clef: hand === 'left' ? 'bass' : 'treble', hand,
      notes: pitches.map((pitch, i) => ({ keys: [cueKey(pitch)], duration: 'q', finger: fingering[i] })) }] },
    expectedSequence: pitches, tempoWindowSec: null, positionLabel: `${hand === 'left' ? 'Left' : 'Right'} hand · ${pitches[0]}`,
    difficulty: 0, mode: 'normal', fingeringInferred: true,
    positionProof: { positionName: `${pitches[0]} starting place`, hand, requireHeld: false, acceptWindowMs: 12000,
      proofNotes: anchors.map((pitch, i) => ({ pitch, finger: (hand === 'left' ? [5, 3, 1][i] : [1, 3, 5][i]) as 1 | 3 | 5 })) as NonNullable<Question['positionProof']>['proofNotes'] },
  };
}
function base(id: string, title: string, pitches: string[], transfer: string[], mistake: string[], hand: Hand = 'right'): DiagnosticLesson {
  const notation: DiagnosticNotation = { clef: hand === 'left' ? 'bass' : 'treble', mistakeIndices: mistake.flatMap((p, i) => p !== pitches[i] ? [i] : []) };
  return { title, focus: 'Listen, discover, play, and try a fresh phrase.',
    question: question(`${id}/practice`, pitches, hand), transfer: question(`${id}/transfer`, transfer, hand),
    notation, transferNotation: { ...notation, mistakeIndices: [] }, mistakePitches: mistake,
    explanation: '', mcq: { prompt: '', choices: [], correct: 0, explanation: '' }, tip: { kind: 'clef', text: '' } };
}
function clefSwap(): DiagnosticLesson {
  const lesson = base('clef-transposition', 'The clef detective', ['C3', 'E3', 'G3', 'A3'], ['C3', 'G3', 'A3', 'E3'], ['C3', 'E3', 'G3', 'F3'], 'left');
  lesson.explanation = 'The last note should be A. The piano took a wrong turn to F. Check the bass clef before reading the lines!';
  lesson.mcq = { prompt: 'Why did that last note sound like a wrong turn?', choices: ['The piano needed to be louder.', 'The pianist read the bass clef like a treble clef!', 'Every last note must be C.'], correct: 1, explanation: 'Each clef gives the lines different note names.' };
  lesson.tip = { kind: 'clef', text: 'Bass clef is the F-clef! Its two dots hug the F line. The top line is A.' };
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C3', 'E3', 'G3'], 'left').positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C3: 5, E3: 3, G3: 2, A3: 1 } as Record<string, number>)[q.expectedSequence[i]]; });
    q.positionProof!.proofNotes[2].finger = 2;
  }
  return lesson;
}
function octave(): DiagnosticLesson {
  const lesson = base('octave-displacement', 'Follow the floating 8', ['C5', 'D5', 'E5', 'G5'], ['C5', 'E5', 'G5', 'D5'], ['C4', 'D4', 'E4', 'G4']);
  lesson.notation.octaveUp = true; lesson.transferNotation.octaveUp = true;
  lesson.explanation = 'The piano stayed too low. The 8va line asks for the same notes one octave higher, starting at C5.';
  lesson.mcq = { prompt: 'What clue tells our fingers to float up high?', choices: ['The little 8va dashed line!', 'The page number.', 'Playing extra loudly.'], correct: 0, explanation: '8va means move the written notes one octave up.' };
  lesson.tip = { kind: 'octave', text: 'Read C4 under the 8va line → play C5. Same note name, one octave higher!' };
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C5', 'E5', 'G5']).positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C5: 1, D5: 2, E5: 3, G5: 5 } as Record<string, number>)[q.expectedSequence[i]]; });
  }
  return lesson;
}
function accidental(): DiagnosticLesson {
  const lesson = base('accidental-carryover', 'The accidental’s magic measure', ['C#4', 'D4', 'C#4', 'E4', 'C4', 'D4', 'E4', 'C4'], ['C#4', 'E4', 'D4', 'C#4', 'C4', 'E4', 'D4', 'C4'], ['C#4', 'D4', 'C4', 'E4', 'C4', 'D4', 'E4', 'C4']);
  lesson.explanation = 'Note 3 slipped to C-natural. The first sharp still protects that C in this measure. After the barline, C is natural again.';
  lesson.mcq = { prompt: 'How long does an accidental’s magic power last?', choices: ['Only for one note.', 'Forever and ever!', 'Through this measure, until the barline locks it out!'], correct: 2, explanation: 'It covers the same note name in the same octave until the barline.' };
  lesson.tip = { kind: 'barline', text: 'C♯ · D · C♯ · E | C · D · E · C. The second C keeps the sharp; the new bar resets it.' };
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C#4', 'E4', 'G4']).positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ 'C#4': 1, C4: 1, D4: 2, E4: 3 } as Record<string, number>)[q.expectedSequence[i]]; });
  }
  return lesson;
}
function handPosition(key: DiagnosticKey): DiagnosticLesson {
  const pattern = fiveFingerPattern(key);
  const order = [0, 1, 2, 3, 4, 3, 2, 0], fresh = [0, 2, 1, 3, 4, 2, 3, 0];
  const pitches = order.map(i => pattern[i]);
  const black = pattern.flatMap((p, i) => isBlackKey(p) ? [`finger ${i + 1} on ${p.replace(/\d/g, '')}`] : []);
  const slip = pattern.findIndex(isBlackKey);
  const index = slip < 0 ? 2 : order.indexOf(slip);
  const mistake = [...pitches];
  // C major and A minor have no black keys: use a neighboring white-key slip.
  mistake[index] = slip < 0 ? pattern[3] : pitches[index].replace(/[#b]/g, '');
  const lesson = base('hand-position', `${key.name}: find your five`, pitches, fresh.map(i => pattern[i]), mistake);
  lesson.key = key;
  lesson.question = question(`hand-position/${key.id}/practice`, pitches, 'right', order.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.transfer = question(`hand-position/${key.id}/transfer`, fresh.map(i => pattern[i]), 'right', fresh.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.notation.fifths = key.fifths; lesson.transferNotation.fifths = key.fifths;
  const answer = black.length ? black.join('; ') : 'All five fingers sit on white keys.';
  lesson.explanation = `Note ${index + 1} slipped to ${mistake[index]}. In ${key.name}, it should be ${pitches[index]}.`;
  lesson.mcq = { prompt: `Which fingers find the black keys in our ${key.name} five-finger home?`, choices: [black.length ? 'Every finger goes on a black key.' : 'Only the thumb goes on a black key.', answer, 'Our fingers can choose any keys.'], correct: 1, explanation: `For this right-hand pattern: ${pattern.map((p, i) => `${i + 1} = ${p}`).join(', ')}.` };
  lesson.tip = { kind: 'keyboard', text: answer + ' These numbers are for this right-hand five-finger pattern, not a full-scale fingering.' };
  return lesson;
}
function clefChange(): DiagnosticLesson {
  const lesson = base('mid-line-clef-change', 'Meet the new clef', ['C3', 'E3', 'C4', 'E4', 'G4', 'E4', 'D4', 'C4'], ['C3', 'G3', 'C4', 'G4', 'E4', 'D4', 'E4', 'C4'], ['C3', 'E3', 'C3', 'E3', 'G3', 'E3', 'D3', 'C3'], 'left');
  lesson.notation.clefChange = { index: 2, clef: 'treble' }; lesson.transferNotation.clefChange = { index: 2, clef: 'treble' };
  lesson.explanation = 'A treble clef arrived before note 3. The written phrase climbs higher, but the piano stayed down low.';
  lesson.mcq = { prompt: 'A surprise guest appeared in the middle of the music! What was it?', choices: ['A sign to stop forever.', 'A brand-new clef telling our hand to jump up high!', 'A sign to play louder.'], correct: 1, explanation: 'Read with the new clef from that spot onward.' };
  lesson.tip = { kind: 'clef-change', text: 'Bass → treble: pause your eyes at the new clef and find the new place before you start.' };
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C3', 'E3', 'G3'], 'left').positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C3: 5, E3: 3, G3: 1, C4: 5, D4: 4, E4: 3, G4: 1 } as Record<string, number>)[q.expectedSequence[i]]; });
  }
  return lesson;
}
function crossing(): DiagnosticLesson {
  const pitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const lesson = base('cross-over-under', 'A smooth thumb tunnel', pitches, ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'], pitches);
  lesson.hesitationBefore = 3; lesson.notation.mistakeIndices = [3];
  lesson.explanation = 'The piano froze for two seconds before F. Prepare the thumb early so the beat keeps walking.';
  lesson.mcq = { prompt: 'When should our thumb start getting ready to tuck under finger 3?', choices: ['While finger 2 plays, it starts preparing smoothly.', 'After the music stops.', 'Only after finger 5 plays.'], correct: 0, explanation: 'Prepare gently as finger 2 plays; let the thumb pass under and land on F after finger 3 plays E.' };
  lesson.tip = { kind: 'crossing', text: 'Up: 1–2–3 → thumb 1 on F. Down: 1 on F → finger 3 over to E. Keep the beat walking.' };
  lesson.question = question('cross-over-under/practice', pitches, 'right', [1, 2, 3, 1, 2, 3, 4, 5], ['C4', 'E4', 'G4']);
  lesson.transfer = question('cross-over-under/transfer', lesson.transfer.expectedSequence, 'right', [5, 4, 3, 2, 1, 3, 2, 1], ['F4', 'A4', 'C5']);
  for (const [q, splitIndex] of [[lesson.question, 3], [lesson.transfer, 5]] as const) {
    q.exerciseMode = 'anchor-shift';
    q.anchorShift = { fromPositionName: q === lesson.question ? 'C · fingers 1–2–3' : 'C5 down to F · fingers 5–1', toPositionName: q === lesson.question ? 'Thumb under to F' : 'Finger 3 over to E', splitIndex, allowedExtraBeats: 0.5 };
    q.cue.staves[0].notes[splitIndex].positionChange = q.anchorShift.toPositionName;
  }
  return lesson;
}

/** Add a definition here: routing and the tester discover entries automatically. */
export const DIAGNOSTIC_REGISTRY: readonly DiagnosticDefinition[] = [
  { id: 'clef-transposition', label: 'Clef Swap', aliases: ['clef-swap', 'treble-for-bass', 'clef-differentiation', 'bass-clef-recognition'], create: clefSwap },
  { id: 'octave-displacement', label: '8va Octave', aliases: ['8va', '8va-blindspot', 'register-placement'], create: octave },
  { id: 'accidental-carryover', label: 'Accidental Carryover', aliases: ['accidental-carry-over', 'accidental-carry-over-failure', 'measure-long-amnesia'], create: accidental },
  { id: 'hand-position', label: 'Hand Position', aliases: ['hand-position-weakness', 'hand-position-weaknesses', 'right-hand-position', 'key-signature-orientation'], usesKey: true, create: handPosition },
  { id: 'mid-line-clef-change', label: 'Mid-Line Clef Change', aliases: ['mid-line-clef-change-blindness', 'clef-change'], create: clefChange },
  { id: 'cross-over-under', label: 'Cross-Over/Under', aliases: ['cross-over', 'cross-under', 'thumb-under', 'finger-over', 'hand-shift', 'right-hand-shift'], create: crossing },
];
export function resolveDiagnostic(value: unknown): DiagnosticDefinition | undefined {
  if (typeof value !== 'string') return undefined;
  const token = canonical(value);
  return DIAGNOSTIC_REGISTRY.find(item => [item.id, ...item.aliases].some(alias => canonical(alias) === token));
}
export function soundingPitch(pitch: string): string { return midiToName(pitchToMidi(pitch)!); }
