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
export interface DiagnosticFeatureCheck {
  prompt: string;
  choices: readonly string[];
  correct: number;
  explanation: string;
}

export interface WrongClefRound {
  question: Question;
  notation: DiagnosticNotation;
  wrongClefPitches: readonly string[];
  explanation: string;
  correctFeedback?: string;
  featureCheck?: DiagnosticFeatureCheck;
  isMatch?: boolean;
}

export interface DiagnosticAudioClip {
  label: string;
  pitches: readonly string[];
  hesitationBefore?: number;
}

export interface DiagnosticInteractiveRound {
  title?: string;
  badge?: string;
  prompt: string;
  choices: readonly string[];
  correct: number;
  explanation: string;
  featureCheck?: DiagnosticFeatureCheck;
  highlightNoteIndex?: number;
  highlightClef?: boolean;
  highlight8va?: boolean;
  highlightClefChange?: boolean;
  audioClipA?: DiagnosticAudioClip;
  audioClipB?: DiagnosticAudioClip;
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
  wrongClefRounds?: readonly WrongClefRound[];
  interactiveRounds?: readonly DiagnosticInteractiveRound[];
  forcedErrorMessage?: string;
  correctFeedback?: string;
  featureCheck?: DiagnosticFeatureCheck;
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
  // Round 1: Bass clef, left hand — piano plays up in treble clef (Mismatch / Wrong)
  const r1Pitches = ['C3', 'E3', 'G3', 'A3'];
  const r1Wrong = ['A4', 'C5', 'E5', 'F5'];

  // Round 2: Treble clef, right hand — piano plays exact matching notes (Match / Correct!)
  const r2Pitches = ['C4', 'E4', 'G4', 'C5'];
  const r2Audio = ['C4', 'E4', 'G4', 'C5'];

  // Round 3: Treble clef, right hand — piano plays down in bass clef (Mismatch / Wrong)
  const r3Pitches = ['G4', 'E4', 'D4', 'C4'];
  const r3Wrong = ['B2', 'G2', 'F2', 'E2'];

  const lesson = base('clef-transposition', 'The clef detective', r1Pitches, r2Pitches, r1Wrong, 'left');
  lesson.explanation = 'Different clefs assign completely different pitches to each line and space.';
  lesson.correctFeedback = 'The piano played in the wrong clef!';
  lesson.featureCheck = {
    prompt: 'Which clef is this sheet music written in?',
    choices: ['Bass Clef', 'Treble Clef'],
    correct: 0,
    explanation: 'Check the clef symbol on the left of the staff.',
  };
  lesson.wrongClefRounds = [
    {
      question: question('clef-transposition/round-1', r1Pitches, 'left', [5, 3, 2, 1]),
      notation: { clef: 'bass', mistakeIndices: [0, 1, 2, 3] },
      wrongClefPitches: r1Wrong,
      isMatch: false,
      explanation: 'The piano read the bass clef notes as if they were treble clef.',
      correctFeedback: 'The piano played in the wrong clef!',
      featureCheck: {
        prompt: 'Which clef is this sheet music written in?',
        choices: ['Bass Clef', 'Treble Clef'],
        correct: 0,
        explanation: 'This phrase is written in bass clef.',
      },
    },
    {
      question: question('clef-transposition/round-2', r2Pitches, 'right', [1, 2, 3, 5]),
      notation: { clef: 'treble', mistakeIndices: [] },
      wrongClefPitches: r2Audio,
      isMatch: true,
      explanation: 'The piano accurately matched the treble clef notes.',
      correctFeedback: 'The piano matched the notes in treble clef!',
      featureCheck: {
        prompt: 'Which clef is this sheet music written in?',
        choices: ['Treble Clef', 'Bass Clef'],
        correct: 0,
        explanation: 'This phrase is written in treble clef.',
      },
    },
    {
      question: question('clef-transposition/round-3', r3Pitches, 'right', [5, 3, 2, 1]),
      notation: { clef: 'treble', mistakeIndices: [0, 1, 2, 3] },
      wrongClefPitches: r3Wrong,
      isMatch: false,
      explanation: 'The piano played the treble staff notes down in bass clef.',
      correctFeedback: 'The piano played in the wrong clef!',
      featureCheck: {
        prompt: 'Which clef is this sheet music written in?',
        choices: ['Treble Clef', 'Bass Clef'],
        correct: 0,
        explanation: 'This phrase is written in treble clef.',
      },
    },
  ];
  lesson.mcq = {
    prompt: 'What was the mistake in the music?',
    choices: [
      'Played in the wrong clef',
      'Played in the wrong octave',
      'Rushed the tempo',
    ],
    correct: 0,
    explanation: 'Each clef assigns different pitch names to the staff lines and spaces.',
  };
  lesson.tip = { kind: 'clef', text: 'Bass clef is the F-clef! Its two dots surround the F line (line 4). The top line is A.' };
  lesson.forcedErrorMessage = 'This phrase is written in bass clef, not treble clef.';
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C3', 'E3', 'G3'], 'left').positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C3: 5, E3: 3, G3: 2, A3: 1 } as Record<string, number>)[q.expectedSequence[i]]; });
    q.positionProof!.proofNotes[2].finger = 2;
  }
  return lesson;
}
function octave(): DiagnosticLesson {
  const lesson = base('octave-displacement', 'High Register Reading', ['C5', 'D5', 'E5', 'G5'], ['C5', 'E5', 'G5', 'D5'], ['C4', 'D4', 'E4', 'G4']);
  lesson.explanation = 'The piano played at Middle C instead of High C.';
  lesson.correctFeedback = 'The piano played in the wrong octave!';
  lesson.interactiveRounds = [
    {
      title: 'High C vs Middle C',
      prompt: 'Is this note Middle C or High C?',
      choices: [
        'High C',
        'Middle C',
      ],
      correct: 0,
      explanation: 'Middle C sits below the staff. High C sits inside the staff.',
      highlightNoteIndex: 0,
      featureCheck: {
        prompt: 'Which C has a line through it below the staff?',
        choices: ['Middle C', 'High C'],
        correct: 0,
        explanation: 'Middle C sits below the staff with a line through it.',
      },
    },
    {
      title: 'High G vs Low G',
      prompt: 'Is Note 4 Low G or High G?',
      choices: [
        'High G',
        'Low G',
      ],
      correct: 0,
      explanation: 'High G sits on top of the staff.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Does Note 4 sit on top of the staff?',
        choices: ['Yes, High G', 'No, Low G'],
        correct: 0,
        explanation: 'Note 4 sits above the top line — that is High G.',
      },
    },
    {
      title: 'Listen to the Register',
      prompt: 'Which clip plays High C?',
      choices: ['Clip B', 'Clip A'],
      correct: 0,
      explanation: 'Clip B plays High C.',
      audioClipA: { label: 'Clip A', pitches: ['C4', 'D4', 'E4', 'G4'] },
      audioClipB: { label: 'Clip B', pitches: ['C5', 'D5', 'E5', 'G5'] },
      featureCheck: {
        prompt: 'Which clip sounds higher?',
        choices: ['Clip B', 'Clip A'],
        correct: 0,
        explanation: 'Clip B sounds higher, matching High C.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'Is Note 1 Middle C or High C?',
    choices: ['High C', 'Middle C'],
    correct: 0,
    explanation: 'High C sits inside the staff; Middle C sits below it.',
  };
  lesson.mcq = {
    prompt: 'What was the mistake in the piano performance?',
    choices: ['Played too low (at Middle C)', 'Wrong clef', 'Wrong rhythm'],
    correct: 0,
    explanation: 'The music is written in High C, but the piano played down at Middle C.',
  };
  lesson.tip = { kind: 'octave', text: 'Middle C sits below the staff. High C sits inside the staff.' };
  lesson.forcedErrorMessage = 'Play in High C position, not Middle C.';
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C5', 'E5', 'G5']).positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C5: 1, D5: 2, E5: 3, G5: 5 } as Record<string, number>)[q.expectedSequence[i]]; });
  }
  return lesson;
}
function accidental(): DiagnosticLesson {
  const lesson = base('accidental-carryover', 'Accidental Carryover', ['C#4', 'D4', 'C#4', 'E4', 'C4', 'D4', 'E4', 'C4'], ['C#4', 'E4', 'D4', 'C#4', 'C4', 'E4', 'D4', 'C4'], ['C#4', 'D4', 'C4', 'E4', 'C4', 'D4', 'E4', 'C4']);
  lesson.explanation = 'Note 3 slipped to C natural. Sharps stay active until the barline.';
  lesson.correctFeedback = 'The piano missed the carried-over accidental!';
  lesson.interactiveRounds = [
    {
      title: 'Note 3 Inspection',
      prompt: 'Which note is Note 3?',
      choices: ['C#', 'C natural'],
      correct: 0,
      explanation: 'The sharp carries through the measure.',
      highlightNoteIndex: 2,
      featureCheck: {
        prompt: 'Has Note 3 crossed a barline?',
        choices: ['No, still Measure 1', 'Yes'],
        correct: 0,
        explanation: 'Still in Measure 1, so the sharp stays active.',
      },
    },
    {
      title: 'After the Barline',
      prompt: 'Which note is Note 5 (after the barline)?',
      choices: ['C natural', 'C#'],
      correct: 0,
      explanation: 'The barline resets the sharp back to natural.',
      highlightNoteIndex: 4,
      featureCheck: {
        prompt: 'Does the barline reset the sharp?',
        choices: ['Yes, resets to natural', 'No'],
        correct: 0,
        explanation: 'The barline resets previous accidentals.',
      },
    },
    {
      title: 'Listen for the Sharp',
      prompt: 'Which clip keeps Note 3 sharp?',
      choices: ['Clip A (C#)', 'Clip B (C natural)'],
      correct: 0,
      explanation: 'Clip A keeps Note 3 sharp.',
      highlightNoteIndex: 2,
      audioClipA: { label: 'Clip A', pitches: ['C#4', 'D4', 'C#4', 'E4'] },
      audioClipB: { label: 'Clip B', pitches: ['C#4', 'D4', 'C4', 'E4'] },
      featureCheck: {
        prompt: 'In Clip B, did Note 3 slip to natural?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip B incorrectly slipped to C natural.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'How long does an accidental stay active?',
    choices: ['Until the barline', 'Only for one note'],
    correct: 0,
    explanation: 'An accidental applies through the measure until the barline.',
  };
  lesson.mcq = { prompt: 'How long does an accidental remain active in a measure?', choices: ['Through the measure until the barline', 'Only for the single note', 'For the whole piece'], correct: 0, explanation: 'Accidentals carry through the measure until the barline resets them.' };
  lesson.tip = { kind: 'barline', text: 'C♯ · D · C♯ · E | C · D · E · C. The second C keeps the sharp; the new bar resets it.' };
  lesson.forcedErrorMessage = 'The sharp carries through the measure until the barline.';
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
  lesson.correctFeedback = 'The piano slipped on the hand position!';
  const answer = black.length ? black.join('; ') : 'White keys only';
  lesson.interactiveRounds = [
    {
      title: 'Key Signature Map',
      prompt: black.length ? `Which finger rests on a black key in ${key.name}?` : `Are any fingers on black keys in ${key.name}?`,
      choices: [
        answer,
        black.length ? 'White keys only' : 'Has black keys',
      ],
      correct: 0,
      explanation: `Pattern for ${key.name}: ${pattern.map((p, i) => `${i + 1}=${p}`).join(', ')}.`,
      featureCheck: {
        prompt: black.length ? 'Does this pattern use black keys?' : 'Is this pattern on white keys only?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Check hand placement before playing.',
      },
    },
    {
      title: 'Home Starting Key',
      prompt: `Which key does finger 1 (thumb) start on in ${key.name}?`,
      choices: [pattern[0].replace(/\d/g, ''), pattern[1].replace(/\d/g, ''), pattern[2].replace(/\d/g, '')],
      correct: 0,
      explanation: `Finger 1 begins on ${pattern[0].replace(/\d/g, '')}.`,
      featureCheck: {
        prompt: `Is ${pattern[0].replace(/\d/g, '')} the first note?`,
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: `${pattern[0].replace(/\d/g, '')} is the starting key.`,
      },
    },
    {
      title: 'Listen to the Pattern',
      prompt: `Which clip plays the correct ${key.name} pattern?`,
      choices: ['Clip A (Correct)', 'Clip B (Wrong key)'],
      correct: 0,
      explanation: `Clip A plays the true ${key.name} pattern.`,
      audioClipA: { label: 'Clip A', pitches: pitches.slice(0, 5) },
      audioClipB: { label: 'Clip B', pitches: mistake.slice(0, 5) },
      featureCheck: {
        prompt: 'Did Clip A play the correct notes?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip A played the pattern accurately.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: black.length ? 'Does this pattern use black keys?' : 'Is this pattern on white keys only?',
    choices: ['Yes', 'No'],
    correct: 0,
    explanation: 'Check hand placement before playing.',
  };
  lesson.question = question(`hand-position/${key.id}/practice`, pitches, 'right', order.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.transfer = question(`hand-position/${key.id}/transfer`, fresh.map(i => pattern[i]), 'right', fresh.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.notation.fifths = key.fifths; lesson.transferNotation.fifths = key.fifths;
  lesson.explanation = `Note ${index + 1} slipped to ${mistake[index]}. In ${key.name}, it should be ${pitches[index]}.`;
  lesson.mcq = { prompt: `Which keys are used in the ${key.name} pattern?`, choices: [answer, black.length ? 'White keys only' : 'Includes black keys', 'Any keys'], correct: 0, explanation: `Pattern for ${key.name}: ${pattern.map((p, i) => `${i + 1}=${p}`).join(', ')}.` };
  lesson.tip = { kind: 'keyboard', text: answer + ' Fingers for this five-finger pattern.' };
  lesson.forcedErrorMessage = `Check your finger positions for ${key.name}: ${pattern.join(', ')}.`;
  return lesson;
}
function clefChange(): DiagnosticLesson {
  const lesson = base('mid-line-clef-change', 'Mid-Line Clef Change', ['C3', 'E3', 'C4', 'E4', 'G4', 'E4', 'D4', 'C4'], ['C3', 'G3', 'C4', 'G4', 'E4', 'D4', 'E4', 'C4'], ['C3', 'E3', 'C3', 'E3', 'G3', 'E3', 'D3', 'C3'], 'left');
  lesson.notation.clefChange = { index: 2, clef: 'treble' }; lesson.transferNotation.clefChange = { index: 2, clef: 'treble' };
  lesson.explanation = 'A treble clef arrived before Note 3. The phrase climbs higher, but the piano stayed low.';
  lesson.correctFeedback = 'The piano missed the clef change!';
  lesson.interactiveRounds = [
    {
      title: 'Spot the Change',
      prompt: 'Which clef appears before Note 3?',
      choices: ['Treble clef', 'Bass clef'],
      correct: 0,
      explanation: 'A treble clef appears before Note 3.',
      highlightClefChange: true,
      featureCheck: {
        prompt: 'Is the new clef a treble clef?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'A treble clef appears before Note 3.',
      },
    },
    {
      title: 'Read in the New Clef',
      prompt: 'In treble clef, which note is Note 3?',
      choices: ['Middle C (C4)', 'E3', 'A4'],
      correct: 0,
      explanation: 'In treble clef, the ledger line below the staff is Middle C (C4).',
      highlightNoteIndex: 2,
      featureCheck: {
        prompt: 'Is Note 3 Middle C on a ledger line?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'It is Middle C below the treble staff.',
      },
    },
    {
      title: 'Listen to the Clef Change',
      prompt: 'Which clip climbs into treble clef at Note 3?',
      choices: ['Clip A (High register)', 'Clip B (Low register)'],
      correct: 0,
      explanation: 'Clip A climbs into the treble register.',
      highlightClefChange: true,
      audioClipA: { label: 'Clip A', pitches: ['C3', 'E3', 'C4', 'E4', 'G4'] },
      audioClipB: { label: 'Clip B', pitches: ['C3', 'E3', 'C3', 'E3', 'G3'] },
      featureCheck: {
        prompt: 'Does Clip A climb higher at Note 3?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip A moves into the treble register.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'Which clef appears midway through the staff?',
    choices: ['Treble clef', 'Bass clef'],
    correct: 0,
    explanation: 'The staff switches to treble clef.',
  };
  lesson.mcq = { prompt: 'What does the clef symbol midway through the staff mean?', choices: ['Switch to reading treble clef', 'Stop playing', 'Play louder'], correct: 0, explanation: 'Read treble clef from that symbol forward.' };
  lesson.tip = { kind: 'clef-change', text: 'Bass → treble: pause your eyes at the new clef before playing.' };
  lesson.forcedErrorMessage = 'The staff switches to treble clef midway through the phrase.';
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C3', 'E3', 'G3'], 'left').positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C3: 5, E3: 3, G3: 1, C4: 5, D4: 4, E4: 3, G4: 1 } as Record<string, number>)[q.expectedSequence[i]]; });
  }
  return lesson;
}
function crossing(): DiagnosticLesson {
  const pitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const lesson = base('cross-over-under', 'Cross-Over/Under', pitches, ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'], pitches);
  lesson.hesitationBefore = 3; lesson.notation.mistakeIndices = [3];
  lesson.explanation = 'The piano hesitated before F. Prepare the thumb early so the beat stays continuous.';
  lesson.correctFeedback = 'The piano stumbled on the finger crossing!';
  lesson.interactiveRounds = [
    {
      title: 'Thumb Tuck',
      prompt: 'How does finger 1 (thumb) reach Note 4 (F)?',
      choices: [
        'Tuck under finger 3',
        'Jump hand across',
        'Stretch finger 5',
      ],
      correct: 0,
      explanation: 'The thumb tucks smoothly under finger 3.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Does finger 1 tuck under finger 3?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Finger 1 passes under finger 3 to reach F.',
      },
    },
    {
      title: 'Listen for Continuity',
      prompt: 'Which clip plays with a steady beat?',
      choices: ['Clip A (Steady)', 'Clip B (Pauses before tuck)'],
      correct: 0,
      explanation: 'Clip A keeps a continuous, steady tempo.',
      highlightNoteIndex: 3,
      audioClipA: { label: 'Clip A', pitches: ['C4', 'D4', 'E4', 'F4', 'G4'] },
      audioClipB: { label: 'Clip B', pitches: ['C4', 'D4', 'E4', 'F4', 'G4'], hesitationBefore: 3 },
      featureCheck: {
        prompt: 'Did Clip B pause before Note 4?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip B hesitated at the tuck.',
      },
    },
    {
      title: 'Preparation Timing',
      prompt: 'When should the thumb tuck under?',
      choices: [
        'While finger 2 plays (prepare early)',
        'After finger 3 lifts',
      ],
      correct: 0,
      explanation: 'Preparing while finger 2 plays keeps the beat smooth.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Does early thumb prep keep the beat steady?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Early preparation prevents hesitation.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'What technique connects notes past finger 3?',
    choices: ['Tuck thumb under', 'Jump hand across'],
    correct: 0,
    explanation: 'Tuck the thumb under to continue smoothly.',
  };
  lesson.mcq = { prompt: 'When should the thumb start tucking under?', choices: ['While finger 2 plays', 'After finger 3 lifts completely', 'After the phrase ends'], correct: 0, explanation: 'Preparing the thumb early keeps the tempo steady.' };
  lesson.tip = { kind: 'crossing', text: 'Up: 1–2–3 → thumb 1 on F. Down: 1 on F → finger 3 over to E.' };
  lesson.forcedErrorMessage = 'Prepare the thumb under smoothly while finger 2 plays.';
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
  { id: 'octave-displacement', label: 'High Register', aliases: ['8va', '8va-blindspot', 'register-placement', 'octave-register', 'octave'], create: octave },
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
