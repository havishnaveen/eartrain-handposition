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
  const lesson = base('octave-displacement', 'Follow the floating 8', ['C5', 'D5', 'E5', 'G5'], ['C5', 'E5', 'G5', 'D5'], ['C4', 'D4', 'E4', 'G4']);
  lesson.notation.octaveUp = true; lesson.transferNotation.octaveUp = true;
  lesson.explanation = 'The piano stayed too low. The 8va line asks for the same notes one octave higher, starting at C5.';
  lesson.correctFeedback = 'The piano played in the wrong octave!';
  lesson.interactiveRounds = [
    {
      title: 'Register Placement',
      badge: 'Visual Clue',
      prompt: 'Where on the keyboard does 8va tell your hand to play?',
      choices: [
        'One octave higher (High register · C5)',
        'Middle C position (Normal register · C4)',
        'One octave lower (Bass register)',
      ],
      correct: 0,
      explanation: 'The 8va symbol (ottava alta) shifts written notes one octave higher.',
      highlight8va: true,
      featureCheck: {
        prompt: 'What does the 8va symbol above the staff mean?',
        choices: ['Play one octave higher', 'Play in normal register'],
        correct: 0,
        explanation: '8va shifts the notes up one octave.',
      },
    },
    {
      title: 'Auditory Register Check',
      badge: 'Ear Training',
      prompt: 'Which audio clip plays in the 8va high register?',
      choices: ['Clip A (Middle register)', 'Clip B (8va High register)'],
      correct: 1,
      explanation: 'Clip B plays in the sparkling high C5 register indicated by 8va.',
      highlight8va: true,
      audioClipA: { label: 'Clip A', pitches: ['C4', 'D4', 'E4', 'G4'] },
      audioClipB: { label: 'Clip B', pitches: ['C5', 'D5', 'E5', 'G5'] },
      featureCheck: {
        prompt: 'Does Clip B sound higher or lower than Clip A?',
        choices: ['One octave higher', 'One octave lower'],
        correct: 0,
        explanation: 'Clip B is one octave higher.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'What symbol appears above the staff?',
    choices: ['8va (One octave higher)', 'Standard staff (No shift)'],
    correct: 0,
    explanation: 'The 8va symbol indicates playing one octave higher.',
  };
  lesson.mcq = { prompt: 'What does the 8va symbol tell you to do?', choices: ['Play one octave higher', 'Play the measure twice', 'Play louder'], correct: 0, explanation: '8va shifts the written notes one octave up.' };
  lesson.tip = { kind: 'octave', text: 'Read C4 under the 8va line → play C5. Same note name, one octave higher!' };
  lesson.forcedErrorMessage = 'Play one octave higher: 8va shifts the written notes up an octave.';
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C5', 'E5', 'G5']).positionProof;
    q.cue.staves[0].notes.forEach((note, i) => { note.finger = ({ C5: 1, D5: 2, E5: 3, G5: 5 } as Record<string, number>)[q.expectedSequence[i]]; });
  }
  return lesson;
}
function accidental(): DiagnosticLesson {
  const lesson = base('accidental-carryover', 'The accidental’s magic measure', ['C#4', 'D4', 'C#4', 'E4', 'C4', 'D4', 'E4', 'C4'], ['C#4', 'E4', 'D4', 'C#4', 'C4', 'E4', 'D4', 'C4'], ['C#4', 'D4', 'C4', 'E4', 'C4', 'D4', 'E4', 'C4']);
  lesson.explanation = 'Note 3 slipped to C-natural. The first sharp still protects that C in this measure. After the barline, C is natural again.';
  lesson.correctFeedback = 'The piano missed the carried-over accidental!';
  lesson.interactiveRounds = [
    {
      title: 'Measure Inspection',
      badge: 'Inside Measure 1',
      prompt: 'Look at Note 3 in Measure 1. Which pitch do you play?',
      choices: [
        'C# (The sharp carries through the measure)',
        'C natural (No sharp drawn on this note)',
      ],
      correct: 0,
      explanation: 'An accidental applies to every note on that line or space until the barline.',
      highlightNoteIndex: 2,
      featureCheck: {
        prompt: 'Has this note crossed a barline yet?',
        choices: ['No, still in Measure 1', 'Yes, past the barline'],
        correct: 0,
        explanation: 'Because it is still in Measure 1, the sharp remains in effect.',
      },
    },
    {
      title: 'Across the Barline',
      badge: 'Measure 2 Reset',
      prompt: 'Now look at Note 5 after the barline. Which pitch do you play?',
      choices: [
        'C natural (The barline resets the sharp)',
        'C# (The sharp continues forever)',
      ],
      correct: 0,
      explanation: 'Crossing the barline cancels the sharp, resetting C back to natural.',
      highlightNoteIndex: 4,
      featureCheck: {
        prompt: 'What does the barline do to previous accidentals?',
        choices: ['Resets notes back to natural', 'Keeps them active'],
        correct: 0,
        explanation: 'The barline resets previous sharps and flats.',
      },
    },
    {
      title: 'Audio Accidental Check',
      badge: 'Ear Training',
      prompt: 'Which audio clip keeps the sharp active on Note 3?',
      choices: ['Clip A (Sharp held)', 'Clip B (Slipped to natural)'],
      correct: 0,
      explanation: 'Clip A keeps Note 3 as C#, matching the carried accidental rule.',
      highlightNoteIndex: 2,
      audioClipA: { label: 'Clip A', pitches: ['C#4', 'D4', 'C#4', 'E4'] },
      audioClipB: { label: 'Clip B', pitches: ['C#4', 'D4', 'C4', 'E4'] },
      featureCheck: {
        prompt: 'In Clip B, did Note 3 slip to natural or stay sharp?',
        choices: ['It slipped to natural', 'It stayed sharp'],
        correct: 0,
        explanation: 'Clip B incorrectly slipped to C natural.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'How long does an accidental apply?',
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
  lesson.correctFeedback = 'The piano slipped on the hand position notes!';
  const answer = black.length ? black.join('; ') : 'All five fingers sit on white keys.';
  lesson.interactiveRounds = [
    {
      title: 'Key Signature Map',
      badge: 'Hand Placement',
      prompt: black.length ? `In this ${key.name} position, which finger rests on a black key?` : `In this ${key.name} position, are any fingers on black keys?`,
      choices: [
        answer,
        black.length ? 'White keys only' : 'Includes black keys',
        'Any keys on the piano',
      ],
      correct: 0,
      explanation: `The 5-finger pattern for ${key.name} is: ${pattern.map((p, i) => `${i + 1} = ${p}`).join(', ')}.`,
      featureCheck: {
        prompt: black.length ? 'Does this pattern use black keys?' : 'Is this pattern on white keys only?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Check key signature and hand placement before playing.',
      },
    },
    {
      title: 'Home Starting Key',
      badge: 'Starting Finger',
      prompt: `Which key does finger 1 (thumb) rest on in ${key.name}?`,
      choices: [pattern[0].replace(/\d/g, ''), pattern[1].replace(/\d/g, ''), pattern[2].replace(/\d/g, '')],
      correct: 0,
      explanation: `Finger 1 (thumb) begins on the tonic key ${pattern[0].replace(/\d/g, '')}.`,
      featureCheck: {
        prompt: `Is ${pattern[0].replace(/\d/g, '')} the first note of the ${key.name} pattern?`,
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: `Yes, ${pattern[0].replace(/\d/g, '')} is the starting key.`,
      },
    },
    {
      title: 'Audio Pattern Check',
      badge: 'Ear Training',
      prompt: `Which audio clip plays the correct ${key.name} 5-finger pattern?`,
      choices: ['Clip A (Correct pattern)', 'Clip B (Slipped onto wrong key)'],
      correct: 0,
      explanation: `Clip A plays the true ${key.name} pattern with clean placement.`,
      audioClipA: { label: 'Clip A', pitches: pitches.slice(0, 5) },
      audioClipB: { label: 'Clip B', pitches: mistake.slice(0, 5) },
      featureCheck: {
        prompt: 'Did Clip A play the exact notes of the pattern?',
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
    explanation: 'Check key signature and hand placement before playing.',
  };
  lesson.question = question(`hand-position/${key.id}/practice`, pitches, 'right', order.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.transfer = question(`hand-position/${key.id}/transfer`, fresh.map(i => pattern[i]), 'right', fresh.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.notation.fifths = key.fifths; lesson.transferNotation.fifths = key.fifths;
  lesson.explanation = `Note ${index + 1} slipped to ${mistake[index]}. In ${key.name}, it should be ${pitches[index]}.`;
  lesson.mcq = { prompt: `Which keys are used in the ${key.name} 5-finger pattern?`, choices: [answer, black.length ? 'White keys only' : 'Includes black keys', 'Any keys on the piano'], correct: 0, explanation: `Pattern for ${key.name}: ${pattern.map((p, i) => `${i + 1} = ${p}`).join(', ')}.` };
  lesson.tip = { kind: 'keyboard', text: answer + ' These numbers are for this right-hand five-finger pattern, not a full-scale fingering.' };
  lesson.forcedErrorMessage = `Check your finger positions for ${key.name}: ${pattern.join(', ')}.`;
  return lesson;
}
function clefChange(): DiagnosticLesson {
  const lesson = base('mid-line-clef-change', 'Meet the new clef', ['C3', 'E3', 'C4', 'E4', 'G4', 'E4', 'D4', 'C4'], ['C3', 'G3', 'C4', 'G4', 'E4', 'D4', 'E4', 'C4'], ['C3', 'E3', 'C3', 'E3', 'G3', 'E3', 'D3', 'C3'], 'left');
  lesson.notation.clefChange = { index: 2, clef: 'treble' }; lesson.transferNotation.clefChange = { index: 2, clef: 'treble' };
  lesson.explanation = 'A treble clef arrived before note 3. The written phrase climbs higher, but the piano stayed down low.';
  lesson.correctFeedback = 'The piano missed the clef change!';
  lesson.interactiveRounds = [
    {
      title: 'Spot the Change',
      badge: 'Visual Clue',
      prompt: 'What notation change occurs midway through the staff?',
      choices: [
        'The staff switches to treble clef',
        'The tempo speeds up',
        'The volume gets louder',
      ],
      correct: 0,
      explanation: 'A treble clef appears midway through, changing how the following notes are read.',
      highlightClefChange: true,
      featureCheck: {
        prompt: 'Which clef symbol appears before Note 3?',
        choices: ['Treble clef', 'Bass clef'],
        correct: 0,
        explanation: 'A treble clef symbol is inserted before Note 3.',
      },
    },
    {
      title: 'Read in the New Clef',
      badge: 'New Clef Reading',
      prompt: 'Reading in the new treble clef, which note is Note 3?',
      choices: [
        'Middle C (C4)',
        'E3',
        'A4',
      ],
      correct: 0,
      explanation: 'In treble clef, the ledger line below the staff represents Middle C (C4).',
      highlightNoteIndex: 2,
      featureCheck: {
        prompt: 'Does Note 3 sit on a ledger line below the treble staff?',
        choices: ['Yes, Middle C', 'No, high on the staff'],
        correct: 0,
        explanation: 'It is Middle C on the ledger line.',
      },
    },
    {
      title: 'Audio Register Check',
      badge: 'Ear Training',
      prompt: 'Which audio clip climbs up into treble clef at Note 3?',
      choices: ['Clip A (Climbs to treble)', 'Clip B (Stays low in bass)'],
      correct: 0,
      explanation: 'Clip A switches up into the treble register, honoring the new clef.',
      highlightClefChange: true,
      audioClipA: { label: 'Clip A', pitches: ['C3', 'E3', 'C4', 'E4', 'G4'] },
      audioClipB: { label: 'Clip B', pitches: ['C3', 'E3', 'C3', 'E3', 'G3'] },
      featureCheck: {
        prompt: 'In Clip A, does the melody move higher or lower at Note 3?',
        choices: ['Higher into treble', 'Lower into bass'],
        correct: 0,
        explanation: 'Clip A moves higher into the treble register.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'What notation change occurs midway through the staff?',
    choices: ['Switch to treble clef', 'Time signature change'],
    correct: 0,
    explanation: 'The staff switches to treble clef midway through the phrase.',
  };
  lesson.mcq = { prompt: 'What does the clef symbol midway through the staff mean?', choices: ['Switch to reading treble clef', 'Stop playing', 'Play louder'], correct: 0, explanation: 'Read treble clef from the clef change forward.' };
  lesson.tip = { kind: 'clef-change', text: 'Bass → treble: pause your eyes at the new clef and find the new place before you start.' };
  lesson.forcedErrorMessage = 'The staff switches to treble clef midway through the phrase.';
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
  lesson.correctFeedback = 'The piano stumbled on the finger crossing!';
  lesson.interactiveRounds = [
    {
      title: 'Thumb Tuck Mechanics',
      badge: 'Physical Movement',
      prompt: 'How does finger 1 (thumb) reach Note 4 (F) after finger 3?',
      choices: [
        'The thumb tucks smoothly under finger 3',
        'The whole hand jumps across the keyboard',
        'Finger 5 stretches to reach F',
      ],
      correct: 0,
      explanation: 'The thumb tucks under finger 3 to reach F smoothly without lifting the hand.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Which finger plays Note 4 (F)?',
        choices: ['Finger 1 (Thumb)', 'Finger 5 (Pinky)'],
        correct: 0,
        explanation: 'Finger 1 plays F after passing under finger 3.',
      },
    },
    {
      title: 'Continuity & Steady Beat',
      badge: 'Fluid Flow',
      prompt: 'Which performance maintains a steady beat without stumbling at the thumb tuck?',
      choices: [
        'Performance A (Steady tempo)',
        'Performance B (Stumbled before tuck)',
      ],
      correct: 0,
      explanation: 'Performance A prepares the thumb early and keeps the tempo continuous without pausing.',
      highlightNoteIndex: 3,
      audioClipA: { label: 'Performance A', pitches: ['C4', 'D4', 'E4', 'F4', 'G4'] },
      audioClipB: { label: 'Performance B', pitches: ['C4', 'D4', 'E4', 'F4', 'G4'], hesitationBefore: 3 },
      featureCheck: {
        prompt: 'In Performance B, was there an unnatural pause before Note 4?',
        choices: ['Yes, it stumbled and paused', 'No, it was completely smooth'],
        correct: 0,
        explanation: 'Performance B paused before the thumb tuck.',
      },
    },
    {
      title: 'Preparation Timing',
      badge: 'Early Prep',
      prompt: 'When should the thumb start tucking under finger 3?',
      choices: [
        'While finger 2 is playing (prepare early)',
        'After finger 3 lifts completely',
        'After the song finishes',
      ],
      correct: 0,
      explanation: 'Preparing the thumb while finger 2 plays ensures a fluid, uninterrupted beat.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Does early thumb preparation keep the tempo steady?',
        choices: ['Yes, keeps tempo steady', 'No, causes mistakes'],
        correct: 0,
        explanation: 'Early preparation prevents hesitation and keeps the rhythm unbroken.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'What technique allows playing past five notes?',
    choices: ['Tucking the thumb under', 'Stretching fingers apart'],
    correct: 0,
    explanation: 'Tuck the thumb under to continue the phrase smoothly.',
  };
  lesson.mcq = { prompt: 'When should the thumb start tucking under?', choices: ['While finger 2 plays', 'After finger 3 lifts completely', 'After the phrase ends'], correct: 0, explanation: 'Preparing the thumb early keeps the tempo steady.' };
  lesson.tip = { kind: 'crossing', text: 'Up: 1–2–3 → thumb 1 on F. Down: 1 on F → finger 3 over to E. Keep the beat walking.' };
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
