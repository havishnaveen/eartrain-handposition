import type { Question } from '../curriculum/types';
import type { DiagnosticFeatureCheck, DiagnosticLesson, DiagnosticNotation } from './registry';

export interface KeySignatureCheck {
  id: string;
  question: Question;
  notation: DiagnosticNotation;
  prompt: string;
  choices: readonly string[];
  correct: number;
  explanation: string;
  target?: number;
  audio?: readonly string[];
  clues: readonly DiagnosticFeatureCheck[];
}

function phrase(id: string, pitches: string[], clef: 'treble' | 'bass' = 'treble'): Question {
  const hand = clef === 'bass' ? 'left' : 'right';
  return {
    id: `key-signature/${id}`, conceptId: 'key-signature', exerciseMode: 'standard', handScope: hand,
    instruction: 'Read the key signature, then play the written phrase with a steady beat.',
    cue: { timeSignature: '4/4', staves: [{ clef, hand, notes: pitches.map(p => ({ keys: [p.replace(/(\d+)$/, '/$1').toLowerCase()], duration: 'q' })) }] },
    expectedSequence: pitches, tempoWindowSec: null, positionLabel: `${hand === 'left' ? 'Left' : 'Right'} hand · ${pitches[0]}`,
    difficulty: 0, mode: 'normal', fingeringInferred: true,
    positionProof: { positionName: `${pitches[0]} starting place`, hand, requireHeld: false, acceptWindowMs: 12000,
      proofNotes: [0, 1, 2].map((i) => ({ pitch: pitches[i], finger: ([1, 3, 5] as const)[i] })) as NonNullable<Question['positionProof']>['proofNotes'] },
  };
}

const gNotation: DiagnosticNotation = { clef: 'treble', fifths: 1, mistakeIndices: [6] };
const gPhrase = ['D4', 'E4', 'F#4', 'G4', 'A4', 'G4', 'F#4', 'G4'];
const gMistake = gPhrase.map(pitch => pitch === 'F#4' ? 'F4' : pitch);
const letterClue: DiagnosticFeatureCheck = { prompt: 'What letter is Note 7?', choices: ['F', 'G'], correct: 0,
  explanation: 'Note 7 is F, in the first space.', highlightNoteIndex: 6 };
const signatureClue: DiagnosticFeatureCheck = { prompt: 'Which letter does the key-signature sharp change?', choices: ['C', 'F'], correct: 1,
  explanation: 'The sharp in this signature changes F in every octave.' };
const unmarkedClue: DiagnosticFeatureCheck = { prompt: 'No sign is beside this F. What does the key signature tell you to play?', choices: ['F sharp', 'F natural'], correct: 0,
  explanation: 'The sharp at the start of the staff makes this F sharp.' };

export const KEY_SIGNATURE_CHECKS: readonly KeySignatureCheck[] = [
  { id: 'listen-error', question: phrase('listen-error', gPhrase), notation: gNotation,
    prompt: 'Does the piano match the score?', choices: ['Right', 'Wrong'], correct: 1, audio: gMistake,
    explanation: 'The Fs should be F♯. The piano played F natural.', clues: [letterClue, signatureClue, unmarkedClue] },
  { id: 'later-note', question: phrase('later-note', gPhrase), notation: gNotation,
    prompt: 'What pitch is Note 7?', choices: ['F♯4', 'F4', 'G4'], correct: 0, target: 6,
    explanation: 'The key signature makes this F sharp, even without a sign beside it.', clues: [letterClue, signatureClue, unmarkedClue] },
  { id: 'scope', question: phrase('scope', gPhrase), notation: gNotation,
    prompt: 'What does the sharp in this key signature change?',
    choices: ['Every F in the first measure', 'Only F on the line where the sharp is printed', 'Every F, in every octave, while this signature remains'], correct: 2,
    explanation: 'Every F is sharp in every octave unless a written accidental overrides it.',
    clues: [signatureClue, unmarkedClue] },
  { id: 'higher-octave', question: phrase('higher-octave', ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5']), notation: gNotation,
    prompt: 'What pitch is Note 7 in this new phrase?', choices: ['F5', 'F♯4', 'F♯5'], correct: 2, target: 6,
    explanation: 'A higher F is still sharp. The key signature applies in every octave.',
    clues: [{ ...letterClue, explanation: 'Note 7 is F5, on the top line.' }, signatureClue] },
  { id: 'left-staff', question: phrase('left-staff', ['G2', 'B2', 'D3', 'G3', 'E3', 'D3', 'F#3', 'G3'], 'bass'),
    notation: { ...gNotation, clef: 'bass' }, prompt: 'What pitch is Note 7 on this bass staff?',
    choices: ['F♯3', 'F3', 'G3'], correct: 0, target: 6,
    explanation: 'Note 7 is F♯3. The signature applies to the bass staff too.',
    clues: [{ ...letterClue, explanation: 'Note 7 is F3, on the fourth line of the bass staff.' }, signatureClue] },
  { id: 'listen-match', question: phrase('listen-match', ['G4', 'B4', 'A4', 'G4', 'E4', 'F#4', 'A4', 'G4']), notation: { ...gNotation, mistakeIndices: [] },
    prompt: 'Does the piano match this new score?', choices: ['Right', 'Wrong'], correct: 0,
    audio: ['G4', 'B4', 'A4', 'G4', 'E4', 'F#4', 'A4', 'G4'],
    explanation: 'The piano played Note 6 as F♯, matching the signature.',
    clues: [{ ...letterClue, prompt: 'What letter is Note 6?', highlightNoteIndex: 5, explanation: 'Note 6 is F.' }, signatureClue] },
];

export const KEY_SIGNATURE_NATURAL_CHECK: KeySignatureCheck = {
  id: 'natural-reset', question: phrase('natural-reset', ['F4', 'G4', 'F4', 'A4', 'F#4', 'G4', 'A4', 'G4']), notation: gNotation,
  prompt: 'A natural is printed on Note 1. What pitches are Notes 3 and 5?',
  choices: ['F natural, then F natural', 'F natural, then F♯', 'F♯, then F♯'], correct: 1,
  explanation: 'Note 3 stays F natural within the measure. After the barline, Note 5 returns to F♯.',
  clues: [
    { prompt: 'Are Notes 1 and 3 in the same measure and octave?', choices: ['Yes', 'No'], correct: 0,
      explanation: 'Both are F4 in Measure 1. The natural is still active for Note 3.', highlightNoteIndex: 2 },
    { prompt: 'What sets Note 5 after the barline?', choices: ['The previous measure’s natural', 'The key signature'], correct: 1,
      explanation: 'The natural ends at the barline. The key signature makes Note 5 F♯.', highlightNoteIndex: 4 },
  ],
};

export function createKeySignatureLesson(): DiagnosticLesson {
  const practice = ['D4', 'E4', 'F#4', 'G4', 'A4', 'G4', 'F#4', 'G4', 'B4', 'A4', 'G4', 'E4', 'D4', 'F#4', 'A4', 'G4'];
  const transfer = ['F4', 'A4', 'Bb4', 'C5', 'D5', 'C5', 'Bb4', 'A4', 'G4', 'F4', 'A4', 'C5', 'D5', 'Bb4', 'G4', 'F4'];
  return {
    title: 'Key Signature Reading', focus: 'Recognize the sharps and flats at the start of the staff, then apply them as you play.',
    question: phrase('practice', practice), transfer: phrase('transfer', transfer),
    notation: { ...gNotation, mistakeIndices: [6, 13] }, transferNotation: { clef: 'treble', fifths: -1, mistakeIndices: [6, 13] },
    mistakePitches: practice.map(p => p === 'F#4' ? 'F4' : p),
    explanation: 'The key signature sets the default in every octave until the signature changes. A written accidental temporarily overrides it.',
    mcq: { prompt: KEY_SIGNATURE_NATURAL_CHECK.prompt, choices: KEY_SIGNATURE_NATURAL_CHECK.choices, correct: KEY_SIGNATURE_NATURAL_CHECK.correct, explanation: KEY_SIGNATURE_NATURAL_CHECK.explanation },
    tip: { kind: 'key-signature', text: 'Look for sharps or flats beside the clef before reading the notes.' },
    forcedErrorMessage: 'Check each F against the key signature. An unmarked F is F♯ here unless a written accidental is still active.',
  };
}
