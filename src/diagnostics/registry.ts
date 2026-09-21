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
export interface StaffChoiceVisual {
  clef: 'treble' | 'bass';
  position?: 'space-3' | 'ledger-below' | 'above-line-5' | 'line-5' | 'line-4' | 'line-2' | 'line-1' | 'inside-staff' | 'below-bottom-line' | 'clef-only';
  highlight?: boolean;
}

export interface StaffVisualGuide {
  clef: 'treble' | 'bass';
  highlight: 'space-3' | 'space-2' | 'space-1' | 'space-4' | 'line-1' | 'line-2' | 'line-3' | 'line-4' | 'line-5' | 'ledger-below' | 'above-line-5';
  label?: string;
  compareLedger?: boolean;
}

export interface DiagnosticAudioClue {
  label: string;
  pitches: readonly string[];
  tag?: string;
}

export interface DiagnosticFeatureCheck {
  prompt: string;
  choices: readonly string[];
  correct: number;
  explanation: string;
  highlightNoteIndex?: number;
  visualGuide?: StaffVisualGuide;
  choiceVisuals?: readonly (StaffChoiceVisual | undefined)[];
  audioClues?: readonly DiagnosticAudioClue[];
  followUpCheck?: DiagnosticFeatureCheck;
}

export interface WrongClefRound {
  question: Question;
  notation: DiagnosticNotation;
  wrongClefPitches: readonly string[];
  explanation: string;
  correctFeedback?: string;
  featureCheck?: DiagnosticFeatureCheck;
  isMatch?: boolean;
  highlightNoteIndex?: number;
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
  question?: Question;
  notation?: DiagnosticNotation;
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
  listenRounds?: readonly WrongClefRound[];
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
  // Round 1: Bass clef, left hand — 6 notes (piano plays treble misreading)
  const r1Pitches = ['C3', 'D3', 'E3', 'G3', 'E3', 'C3'];
  const r1Wrong = ['A4', 'B4', 'C5', 'E5', 'C5', 'A4'];

  // Round 2: Treble clef, right hand — 8 notes across two measures (matching audio)
  const r2Pitches = ['C4', 'D4', 'E4', 'G4', 'F4', 'E4', 'D4', 'C4'];
  const r2Audio = ['C4', 'D4', 'E4', 'G4', 'F4', 'E4', 'D4', 'C4'];

  // Round 3: Treble clef, right hand — 8 notes with contour and skips (piano plays down in bass)
  const r3Pitches = ['G4', 'E4', 'C4', 'E4', 'G4', 'F4', 'E4', 'D4'];
  const r3Wrong = ['B2', 'G2', 'E2', 'G2', 'B2', 'A2', 'G2', 'F2'];

  // Stage 3 Practice Drill (Bass clef, left hand): 8 notes across two measures
  const practicePitches = ['C3', 'E3', 'G3', 'A3', 'G3', 'E3', 'D3', 'C3'];
  const practiceWrong = ['A4', 'C5', 'E5', 'F5', 'E5', 'C5', 'B4', 'A4'];

  // Stage 4 Transfer Drill (Treble clef, right hand): 8 notes across two measures
  const transferPitches = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'D4', 'C4'];

  const lesson = base('clef-transposition', 'The clef detective', practicePitches, transferPitches, practiceWrong, 'left');
  lesson.explanation = 'Bass clef: Bottom line is G2, line 4 is F3, top line is A3.';
  lesson.correctFeedback = 'Wrong clef: Played in treble register instead of bass.';
  lesson.featureCheck = {
    prompt: 'Which clef is this sheet music written in?',
    choices: ['Bass Clef', 'Treble Clef'],
    correct: 0,
    explanation: 'Bass clef: Note is C3 (low register).',
    choiceVisuals: [
      { clef: 'bass', position: 'clef-only' },
      { clef: 'treble', position: 'clef-only' },
    ],
    audioClues: [
      { label: 'Bass Clef (Lower pitch)', pitches: ['C3', 'E3', 'G3'], tag: 'Low' },
      { label: 'Treble Clef (Higher pitch)', pitches: ['C4', 'E4', 'G4'], tag: 'High' },
    ],
  };
  lesson.wrongClefRounds = [
    {
      question: question('clef-transposition/round-1', r1Pitches, 'left', [5, 4, 3, 1, 3, 5]),
      notation: { clef: 'bass', mistakeIndices: [0, 1, 2, 3, 4, 5] },
      wrongClefPitches: r1Wrong,
      isMatch: false,
      explanation: 'Wrong clef: Played in treble register instead of bass.',
      correctFeedback: 'Wrong clef: Played in treble register instead of bass.',
      featureCheck: {
        prompt: 'Which clef is this sheet music written in?',
        choices: ['Bass Clef', 'Treble Clef'],
        correct: 0,
        explanation: 'Bass clef: Note is C3 (low register).',
        choiceVisuals: [
          { clef: 'bass', position: 'clef-only' },
          { clef: 'treble', position: 'clef-only' },
        ],
        audioClues: [
          { label: 'Bass Clef (Lower pitch)', pitches: ['C3', 'E3', 'G3'], tag: 'Low' },
          { label: 'Treble Clef (Higher pitch)', pitches: ['C4', 'E4', 'G4'], tag: 'High' },
        ],
      },
    },
    {
      question: question('clef-transposition/round-2', r2Pitches, 'right', [1, 2, 3, 5, 4, 3, 2, 1]),
      notation: { clef: 'treble', mistakeIndices: [] },
      wrongClefPitches: r2Audio,
      isMatch: true,
      explanation: 'Treble clef: Matched C4 in treble register.',
      correctFeedback: 'Treble clef: Matched C4 in treble register.',
      featureCheck: {
        prompt: 'Which clef is this sheet music written in?',
        choices: ['Treble Clef', 'Bass Clef'],
        correct: 0,
        explanation: 'Treble clef: Note is C4 (treble register).',
        choiceVisuals: [
          { clef: 'treble', position: 'clef-only' },
          { clef: 'bass', position: 'clef-only' },
        ],
        audioClues: [
          { label: 'Treble Clef (Higher pitch)', pitches: ['C4', 'E4', 'G4'], tag: 'High' },
          { label: 'Bass Clef (Lower pitch)', pitches: ['C3', 'E3', 'G3'], tag: 'Low' },
        ],
      },
    },
    {
      question: question('clef-transposition/round-3', r3Pitches, 'right', [5, 3, 1, 3, 5, 4, 3, 2]),
      notation: { clef: 'treble', mistakeIndices: [0, 1, 2, 3, 4, 5, 6, 7] },
      wrongClefPitches: r3Wrong,
      isMatch: false,
      explanation: 'Wrong clef: Played down in bass register instead of treble.',
      correctFeedback: 'Wrong clef: Played down in bass register instead of treble.',
      featureCheck: {
        prompt: 'Which clef is this sheet music written in?',
        choices: ['Treble Clef', 'Bass Clef'],
        correct: 0,
        explanation: 'Treble clef: Note is G4 (treble register).',
        choiceVisuals: [
          { clef: 'treble', position: 'clef-only' },
          { clef: 'bass', position: 'clef-only' },
        ],
        audioClues: [
          { label: 'Treble Clef (Higher pitch)', pitches: ['C4', 'E4', 'G4'], tag: 'High' },
          { label: 'Bass Clef (Lower pitch)', pitches: ['C3', 'E3', 'G3'], tag: 'Low' },
        ],
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
    explanation: 'Bass clef line 4 is F3; treble clef line 2 is G4.',
  };
  lesson.tip = { kind: 'clef', text: 'Bass clef: Line 4 is F3 (between two dots); top line is A3.' };
  lesson.forcedErrorMessage = 'Bass clef: Note is C3 (left hand, low register).';

  lesson.question.positionProof = question(lesson.question.id, ['C3', 'E3', 'G3'], 'left').positionProof;
  lesson.question.cue.staves[0].notes.forEach((note, i) => {
    note.finger = ([5, 3, 2, 1, 2, 3, 4, 5])[i];
  });
  lesson.question.positionProof!.proofNotes[2].finger = 2;

  lesson.transfer = question('clef-transposition/transfer', transferPitches, 'right', [1, 2, 3, 5, 3, 2, 2, 1]);
  lesson.transferNotation = { clef: 'treble', mistakeIndices: [] };
  lesson.transfer.positionProof = question('clef-transposition/transfer', ['C4', 'E4', 'G4'], 'right').positionProof;

  return lesson;
}
function octave(): DiagnosticLesson {
  const practicePitches = ['C5', 'D5', 'E5', 'G5', 'F5', 'E5', 'D5', 'C5'];
  const mistakePitches = ['C4', 'D4', 'E4', 'G4', 'F4', 'E4', 'D4', 'C4'];
  const transferPitches = ['C5', 'E5', 'D5', 'F5', 'G5', 'E5', 'D5', 'C5'];

  const lesson = base('octave-displacement', 'High Register Reading', practicePitches, transferPitches, mistakePitches);
  lesson.explanation = 'High C (C5) sits in Space 3; Middle C (C4) sits on ledger line below.';
  lesson.correctFeedback = 'Wrong register: Played Middle C (C4) instead of High C (C5).';

  const r1Pitches = ['C5', 'D5', 'E5', 'D5', 'C5'];
  const r1Question = question('octave-displacement/round-1', r1Pitches, 'right', [1, 2, 3, 2, 1]);

  const r2Pitches = ['C5', 'E5', 'G5', 'E5', 'D5', 'F5', 'E5', 'C5'];
  const r2Question = question('octave-displacement/round-2', r2Pitches, 'right', [1, 3, 5, 3, 2, 4, 3, 1]);

  const r3Pitches = ['C5', 'E5', 'G5', 'E5', 'G5', 'F5', 'D5', 'C5'];
  const r3Question = question('octave-displacement/round-3', r3Pitches, 'right', [1, 3, 5, 3, 5, 4, 2, 1]);

  const r4Question = question('octave-displacement/round-4', ['C5', 'E5', 'D5', 'F5', 'E5', 'C5'], 'right', [1, 3, 2, 4, 3, 1]);
  const r5Question = question('octave-displacement/round-5', ['C5', 'D5', 'E5', 'F5', 'G5', 'E5', 'D5', 'C5'], 'right');
  // Rhythm complexity belongs only to listening, not the acoustic passages.
  [r4Question, r5Question].forEach((round, i) => {
    const durations = i === 0 ? ['q', '8', '8', 'q', '8', '8'] : ['q', '16', '16', '16', '16', 'q', '8', '8'];
    round.cue.staves[0].notes.forEach((note, index) => {
      note.duration = durations[index];
      note.finger = undefined; // Listening-only examples do not need fingering labels.
    });
  });

  const octaveFeatureCheck = {
    prompt: 'Where does Note 1 sit on the treble staff?',
    choices: ['In the 3rd space of the staff', 'Below the staff on a ledger line'],
    correct: 0,
    explanation: 'Note 1 is C5, in the 5th octave.',
    highlightNoteIndex: 0,
    choiceVisuals: [
      { clef: 'treble' as const, position: 'space-3' as const, highlight: true },
      { clef: 'treble' as const, position: 'ledger-below' as const, highlight: true },
    ],
    audioClues: [
      { label: 'Hear High C (Space 3)', pitches: ['C5'], tag: 'High' },
      { label: 'Hear Middle C (Ledger)', pitches: ['C4'], tag: 'Low' },
    ],
  };

  lesson.listenRounds = [
    {
      question: r1Question,
      notation: { clef: 'treble', mistakeIndices: [0, 1, 2, 3, 4] },
      wrongClefPitches: ['C4', 'D4', 'E4', 'D4', 'C4'],
      isMatch: false,
      explanation: 'Wrong register: Played Middle C (C4) instead of High C (C5).',
      correctFeedback: 'Wrong register: Played Middle C (C4) instead of High C (C5).',
      featureCheck: octaveFeatureCheck,
    },
    {
      question: r2Question,
      notation: { clef: 'treble', mistakeIndices: [] },
      wrongClefPitches: ['C5', 'E5', 'G5', 'E5', 'D5', 'F5', 'E5', 'C5'],
      isMatch: true,
      explanation: 'High register matched (C5).',
      correctFeedback: 'High register matched (C5).',
      featureCheck: octaveFeatureCheck,
    },
    {
      question: r3Question,
      notation: { clef: 'treble', mistakeIndices: [0, 1, 2, 3, 4, 5, 6, 7] },
      wrongClefPitches: ['C4', 'E4', 'G4', 'E4', 'G4', 'F4', 'D4', 'C4'],
      isMatch: false,
      explanation: 'Wrong register: Played Middle C (C4) instead of High C (C5).',
      correctFeedback: 'Wrong register: Played Middle C (C4) instead of High C (C5).',
      featureCheck: octaveFeatureCheck,
    },
    {
      question: r4Question,
      notation: { clef: 'treble', mistakeIndices: [] },
      wrongClefPitches: r4Question.expectedSequence,
      explanation: 'High register matched (C5).',
      correctFeedback: 'High register matched (C5).',
      featureCheck: octaveFeatureCheck,
    },
    {
      question: r5Question,
      notation: { clef: 'treble', mistakeIndices: [] },
      wrongClefPitches: r5Question.expectedSequence,
      explanation: 'High register matched (C5).',
      correctFeedback: 'High register matched (C5).',
      featureCheck: octaveFeatureCheck,
    },
  ];
  // Choose once per lesson, retain it on retries, and never alternate throughout.
  const answerPatterns = [
    [false, false, true, false, true], [true, false, false, true, false],
    [false, true, true, false, true], [true, true, false, true, false],
    [false, false, true, true, false], [true, true, false, false, true],
  ];
  const answers = answerPatterns[Math.floor(Math.random() * answerPatterns.length)];
  lesson.listenRounds = lesson.listenRounds.map((round, i) => ({
    ...round,
    isMatch: answers[i],
    wrongClefPitches: round.question.expectedSequence.map(pitch => answers[i] ? pitch : midiToName(pitchToMidi(pitch)! - 12)),
    notation: { ...round.notation, mistakeIndices: answers[i] ? [] : round.question.expectedSequence.map((_, index) => index) },
    explanation: answers[i] ? 'High register matched (C5).' : 'Wrong register: Played Middle C (C4) instead of High C (C5).',
    correctFeedback: answers[i] ? 'High register matched (C5).' : 'Wrong register: Played Middle C (C4) instead of High C (C5).',
  }));
  lesson.featureCheck = {
    prompt: 'Where does High C sit on the treble staff?',
    choices: ['In the 3rd space of the staff', 'Below the staff on a ledger line'],
    correct: 0,
    explanation: 'Space 3 = High C (C5); Ledger line below = Middle C (C4).',
    choiceVisuals: [
      { clef: 'treble', position: 'space-3', highlight: true },
      { clef: 'treble', position: 'ledger-below', highlight: true },
    ],
    audioClues: [
      { label: 'Hear High C (5th Octave)', pitches: ['C5'], tag: 'High' },
      { label: 'Hear Middle C (4th Octave)', pitches: ['C4'], tag: 'Low' },
    ],
  };
  lesson.mcq = {
    prompt: 'What was the difference between the written notes and the piano audio?',
    choices: ['Played an octave too low', 'Played in the wrong clef', 'Played with the wrong rhythm'],
    correct: 0,
    explanation: 'Space 3 is High C (C5); Middle C (C4) sits on a ledger line below.',
  };
  lesson.tip = { kind: 'octave', text: 'C5: 3rd space · C4: ledger line' };
  lesson.forcedErrorMessage = 'High C position: Space 3 = C5 (octave above Middle C).';
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C5', 'E5', 'G5']).positionProof;
    q.cue.staves[0].notes.forEach((note, i) => {
      note.finger = ({ C5: 1, D5: 2, E5: 3, F5: 4, G5: 5 } as Record<string, number>)[q.expectedSequence[i]];
    });
  }
  return lesson;
}
function accidental(): DiagnosticLesson {
  const lesson = base('accidental-carryover', 'Accidental Carryover', ['C#4', 'D4', 'C#4', 'E4', 'C4', 'D4', 'E4', 'C4'], ['C#4', 'E4', 'D4', 'C#4', 'C4', 'E4', 'D4', 'C4'], ['C#4', 'D4', 'C4', 'E4', 'C4', 'D4', 'E4', 'C4']);
  lesson.explanation = 'Sharp carries through the entire measure until the barline.';
  lesson.correctFeedback = 'Note 3 missed the carried-over sharp.';
  lesson.interactiveRounds = [
    {
      title: 'Note 3 Inspection',
      prompt: 'Which note is Note 3?',
      choices: ['C#', 'C natural'],
      correct: 0,
      explanation: 'Sharp stays active through the measure until the barline.',
      highlightNoteIndex: 2,
      featureCheck: {
        prompt: 'Has Note 3 crossed a barline?',
        choices: ['No, still Measure 1', 'Yes'],
        correct: 0,
        explanation: 'Still inside Measure 1 — sharp stays active.',
        followUpCheck: {
          prompt: 'Does a sharp carry through a full measure or stop for just one note?',
          choices: ['Carries through a full measure', 'Stops for just one note'],
          correct: 0,
          explanation: 'Sharps carry through the full measure until the barline.',
        },
      },
    },
    {
      title: 'After the Barline',
      prompt: 'Which note is Note 5 (after the barline)?',
      choices: ['C natural', 'C#'],
      correct: 0,
      explanation: 'Barline cancels the sharp back to C natural.',
      highlightNoteIndex: 4,
      featureCheck: {
        prompt: 'Does the barline reset the sharp?',
        choices: ['Yes, resets to natural', 'No'],
        correct: 0,
        explanation: 'Barlines cancel all accidental carryover.',
      },
    },
    {
      title: 'Listen for the Sharp',
      prompt: 'Which clip keeps Note 3 sharp?',
      choices: ['Clip A', 'Clip B'],
      correct: 0,
      explanation: 'Clip A keeps Note 3 sharp (C#).',
      highlightNoteIndex: 2,
      audioClipA: { label: 'Clip A', pitches: ['C#4', 'D4', 'C#4', 'E4'] },
      audioClipB: { label: 'Clip B', pitches: ['C#4', 'D4', 'C4', 'E4'] },
      featureCheck: {
        prompt: 'In Clip B, did Note 3 slip to natural?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip B slipped to C natural.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'How long does an accidental stay active?',
    choices: ['Until the barline', 'Only for one note'],
    correct: 0,
    explanation: 'Accidentals apply through the entire measure until the barline.',
  };
  lesson.mcq = { prompt: 'How long does an accidental remain active in a measure?', choices: ['Through the measure until the barline', 'Only for the single note', 'For the whole piece'], correct: 0, explanation: 'Accidentals apply to all matching notes in the measure until the barline.' };
  lesson.tip = { kind: 'barline', text: 'Accidentals carry until the barline resets them.' };
  lesson.forcedErrorMessage = 'Sharp carries through the entire measure until the barline.';
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
  const blackNotes = pattern.filter(isBlackKey).map(p => p.replace(/\d/g, ''));
  const blackFingers = pattern.flatMap((p, i) => isBlackKey(p) ? [`finger ${i + 1} on ${p.replace(/\d/g, '')}`] : []);
  const slip = pattern.findIndex(isBlackKey);
  const index = slip < 0 ? 2 : order.indexOf(slip);
  const mistake = [...pitches];
  // C major and A minor have no black keys: use a neighboring white-key slip.
  mistake[index] = slip < 0 ? pattern[3] : pitches[index].replace(/[#b]/g, '');
  const lesson = base('hand-position', `${key.name}: Hand Position`, pitches, fresh.map(i => pattern[i]), mistake);
  lesson.key = key;
  lesson.correctFeedback = 'Piano slipped on the hand position.';

  const tonicName = pattern[0].replace(/\d/g, '');
  const step2 = pattern[1].replace(/\d/g, '');
  const step3 = pattern[2].replace(/\d/g, '');

  lesson.interactiveRounds = [
    {
      title: 'Home Starting Key',
      prompt: `Where does your thumb (finger 1) anchor for ${key.name}?`,
      choices: [tonicName, step2, step3],
      correct: 0,
      explanation: `${key.name}: Finger 1 (thumb) anchors on ${tonicName}.`,
      featureCheck: {
        prompt: `Is ${tonicName} the starting note of ${key.name}?`,
        choices: ['Yes, anchor on ' + tonicName, 'No, start on another key'],
        correct: 0,
        explanation: `Anchor finger 1 on ${tonicName}.`,
      },
    },
    {
      title: 'Key Signature Orientation',
      prompt: blackNotes.length
        ? `Which note in the ${key.name} hand position uses a black key?`
        : `Do any of the 5 fingers in ${key.name} rest on a black key?`,
      choices: blackNotes.length
        ? [blackNotes[0], step2 !== blackNotes[0] ? step2 : pattern[3].replace(/\d/g, ''), tonicName]
        : ['No, all 5 fingers rest on white keys', 'Yes, one finger rests on a black key'],
      correct: 0,
      explanation: blackNotes.length
        ? `${key.name}: ${blackFingers.join(' and ')}.`
        : `${key.name}: All 5 notes rest on white keys (${pattern.map(p => p.replace(/\d/g, '')).join(' · ')}).`,
      featureCheck: {
        prompt: blackNotes.length
          ? `Does ${key.name} include ${blackNotes.join(', ')}?`
          : `Is this hand position on white keys only?`,
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: blackNotes.length
          ? `Rest fingers over ${blackNotes.join(', ')}.`
          : 'All 5 fingers rest on white keys.',
      },
    },
    {
      title: 'Listen to the Hand Position',
      prompt: `Which clip plays the correct notes for ${key.name}?`,
      choices: ['Clip A', 'Clip B'],
      correct: 0,
      explanation: `Clip A plays the correct ${key.name} pattern.`,
      audioClipA: { label: 'Clip A', pitches: pitches.slice(0, 5) },
      audioClipB: { label: 'Clip B', pitches: mistake.slice(0, 5) },
      featureCheck: {
        prompt: 'Did Clip A play without slipping to the wrong note?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip A held the correct hand position.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: blackNotes.length ? `Which note in ${key.name} is on a black key?` : `Are any notes in ${key.name} on black keys?`,
    choices: blackNotes.length
      ? [blackNotes[0], tonicName]
      : ['No black keys', 'Has black keys'],
    correct: 0,
    explanation: blackNotes.length ? `Rest fingers over ${blackNotes.join(', ')}.` : 'All 5 fingers rest on white keys.',
  };
  lesson.question = question(`hand-position/${key.id}/practice`, pitches, 'right', order.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.transfer = question(`hand-position/${key.id}/transfer`, fresh.map(i => pattern[i]), 'right', fresh.map(i => i + 1), [pattern[0], pattern[2], pattern[4]]);
  lesson.notation.fifths = key.fifths; lesson.transferNotation.fifths = key.fifths;
  lesson.explanation = `Note ${index + 1} slipped to ${mistake[index]}. Play ${pitches[index]}.`;
  lesson.mcq = {
    prompt: `Before sight-reading in ${key.name}, why do you position your hand on the home keys first?`,
    choices: [
      'To place each finger over the correct keys (including any black keys)',
      'To play as fast as possible',
      'To avoid having to look at the sheet music',
    ],
    correct: 0,
    explanation: 'Positions each finger directly over its key before playing.',
  };
  lesson.tip = {
    kind: 'keyboard',
    text: `${key.name}: Fingers 1–5 on ${pattern.map(p => p.replace(/\d/g, '')).join(' · ')}${blackFingers.length ? ` (${blackFingers.join(', ')})` : ' (white keys)'}.`,
  };
  lesson.forcedErrorMessage = `${key.name} hand position: ${pattern.map(p => p.replace(/\d/g, '')).join(' · ')}.`;
  return lesson;
}
function clefChange(): DiagnosticLesson {
  const practicePitches = ['C3', 'E3', 'C4', 'E4', 'G4', 'E4', 'D4', 'C4'];
  const transferPitches = ['C3', 'G3', 'C4', 'G4', 'E4', 'D4', 'E4', 'C4'];
  const mistakePitches = ['C3', 'E3', 'C3', 'E3', 'G3', 'E3', 'D3', 'C3'];
  const lesson = base('mid-line-clef-change', 'Mid-Line Clef Change', practicePitches, transferPitches, mistakePitches, 'left');
  lesson.notation.clefChange = { index: 2, clef: 'treble' }; lesson.transferNotation.clefChange = { index: 2, clef: 'treble' };
  lesson.explanation = 'Lower staff changed to Treble Clef before Note 3 — left hand climbs higher.';
  lesson.correctFeedback = 'Missed clef change: Played low in bass instead of treble.';

  const rhPractice = ['E4', 'G4', 'E4', 'G4', 'G4', 'C5', 'G4', 'E4'];
  const rhTransfer = ['G4', 'E4', 'G4', 'E4', 'E4', 'G4', 'C5', 'G4'];
  const rhFingers = [1, 3, 1, 3, 3, 5, 3, 1];
  const rhTransferFingers = [3, 1, 3, 1, 1, 3, 5, 3];
  const lhPracticeFingers = [5, 3, 5, 3, 1, 3, 4, 5];
  const lhTransferFingers = [5, 1, 5, 1, 3, 4, 3, 5];

  const buildTwoHandStaves = (rhPitches: string[], rhF: number[], lhPitches: string[], lhF: number[]) => [
    {
      clef: 'treble' as const,
      hand: 'right' as const,
      notes: rhPitches.map((pitch, i) => ({
        keys: [cueKey(pitch)],
        duration: 'q' as const,
        finger: rhF[i],
      })),
    },
    {
      clef: 'bass' as const,
      hand: 'left' as const,
      notes: lhPitches.map((pitch, i) => ({
        keys: [cueKey(pitch)],
        duration: 'q' as const,
        finger: lhF[i],
      })),
    },
  ];

  lesson.question.cue.staves = buildTwoHandStaves(rhPractice, rhFingers, practicePitches, lhPracticeFingers);
  lesson.transfer.cue.staves = buildTwoHandStaves(rhTransfer, rhTransferFingers, transferPitches, lhTransferFingers);

  lesson.interactiveRounds = [
    {
      title: 'Spot the Change',
      prompt: 'Look at the grand staff (both hands). Which clef appears in the lower staff before Note 3?',
      choices: ['Treble clef', 'Bass clef'],
      correct: 0,
      explanation: 'Treble clef appears in the lower staff before Note 3.',
      highlightClefChange: true,
      featureCheck: {
        prompt: 'Is the new clef in the lower staff a treble clef?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Treble clef appears before Note 3.',
      },
    },
    {
      title: 'Read in the New Clef',
      prompt: 'In the lower staff’s new treble clef, which note is Note 3?',
      choices: ['Middle C', 'E3', 'A4'],
      correct: 0,
      explanation: 'In treble clef, ledger line below is Middle C (C4).',
      highlightNoteIndex: 2,
      featureCheck: {
        prompt: 'Where does Note 3 sit in the new treble clef?',
        choices: ['Below the staff on a ledger line', 'In the 3rd space of the staff'],
        correct: 0,
        explanation: 'Middle C (C4) sits on ledger line below treble staff.',
        highlightNoteIndex: 2,
        choiceVisuals: [
          { clef: 'treble', position: 'ledger-below', highlight: true },
          { clef: 'treble', position: 'space-3', highlight: true },
        ],
        audioClues: [
          { label: 'Hear Middle C (Treble Clef)', pitches: ['C4'], tag: 'Treble' },
          { label: 'Hear Low C (Bass Clef)', pitches: ['C3'], tag: 'Bass' },
        ],
      },
    },
    {
      title: 'Listen to the Clef Change',
      prompt: 'Which clip has the left hand climb into treble clef at Note 3?',
      choices: ['Clip A', 'Clip B'],
      correct: 0,
      explanation: 'Clip A climbs into treble register at Note 3.',
      highlightClefChange: true,
      audioClipA: { label: 'Clip A', pitches: ['C3', 'E3', 'C4', 'E4', 'G4', 'E4', 'D4', 'C4'] },
      audioClipB: { label: 'Clip B', pitches: ['C3', 'E3', 'C3', 'E3', 'G3', 'E3', 'D3', 'C3'] },
      featureCheck: {
        prompt: 'Does Clip A climb higher at Note 3?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip A climbs higher into treble.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'Which clef appears midway through the lower staff?',
    choices: ['Treble clef', 'Bass clef'],
    correct: 0,
    explanation: 'Lower staff switches to Treble Clef before Note 3.',
  };
  lesson.mcq = { prompt: 'What does the clef symbol midway through the staff mean?', choices: ['Switch to reading treble clef', 'Stop playing', 'Play louder'], correct: 0, explanation: 'Switch to reading treble clef from the new clef symbol forward.' };
  lesson.tip = { kind: 'clef-change', text: 'Bass → treble: Read Note 3 in treble clef (ledger line = Middle C).' };
  lesson.forcedErrorMessage = 'Lower staff switches to Treble Clef before Note 3.';
  for (const q of [lesson.question, lesson.transfer]) {
    q.positionProof = question(q.id, ['C3', 'E3', 'G3'], 'left').positionProof;
  }
  return lesson;
}
function crossing(): DiagnosticLesson {
  const pitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const lesson = base('cross-over-under', 'Cross-Over/Under', pitches, ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'], pitches);
  lesson.hesitationBefore = 3; lesson.notation.mistakeIndices = [3];
  lesson.explanation = 'Glide thumb under finger 3 to keep tempo steady.';
  lesson.correctFeedback = 'Hesitation at Note 4: Beat stumbled at the thumb tuck.';
  lesson.interactiveRounds = [
    {
      title: 'Thumb Tuck Motion',
      prompt: 'How does the thumb reach note 4 (F)?',
      choices: [
        'Tuck thumb under finger 3',
        'Jump hand across keys',
      ],
      correct: 0,
      explanation: 'Thumb glides under finger 3 to reach F4 smoothly.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Does the thumb glide under finger 3?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Thumb glides under finger 3 to reach F4.',
      },
    },
    {
      title: 'Listen for Smooth Tempo',
      prompt: 'Which clip plays smoothly without pausing?',
      choices: ['Clip A', 'Clip B'],
      correct: 0,
      explanation: 'Clip A stays in tempo through the tuck.',
      highlightNoteIndex: 3,
      audioClipA: { label: 'Clip A', pitches: pitches },
      audioClipB: { label: 'Clip B', pitches: pitches, hesitationBefore: 3 },
      featureCheck: {
        prompt: 'Did Clip B pause before note 4?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Clip B stumbled before Note 4.',
      },
    },
    {
      title: 'Preparation Timing',
      prompt: 'When should the thumb tuck under?',
      choices: [
        'While finger 2 is playing',
        'After finger 3 lifts off',
      ],
      correct: 0,
      explanation: 'Tucking early while finger 2 plays keeps tempo steady.',
      highlightNoteIndex: 3,
      featureCheck: {
        prompt: 'Does early preparation prevent hesitation?',
        choices: ['Yes', 'No'],
        correct: 0,
        explanation: 'Early tuck keeps the tempo unbroken.',
      },
    },
  ];
  lesson.featureCheck = {
    prompt: 'How do you connect notes smoothly past finger 3?',
    choices: ['Tuck thumb under', 'Jump hand across'],
    correct: 0,
    explanation: 'Tuck thumb under finger 3 to avoid pausing.',
  };
  lesson.mcq = {
    prompt: 'Why do you tuck your thumb under finger 3?',
    choices: [
      'To keep a steady beat without jumping',
      'To play louder',
      'To skip notes',
    ],
    correct: 0,
    explanation: 'Tucking thumb under maintains uninterrupted tempo without jumping.',
  };
  lesson.tip = { kind: 'crossing', text: 'Thumb glides under finger 3 — keep hand level and steady.' };
  lesson.forcedErrorMessage = 'Glide thumb under finger 3 before Note 4 to prevent hesitation.';
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
