import type { Question } from '../curriculum/types';
import type { DailyTriad, QuestionKind, StationQuestion, StationTopic } from './types';
import { hash } from './engine';

const KEYS = [
  { name: 'G major', tonic: 'G', fifths: 1 }, { name: 'F major', tonic: 'F', fifths: -1 },
  { name: 'D major', tonic: 'D', fifths: 2 }, { name: 'B♭ major', tonic: 'B', fifths: -2 },
  { name: 'A major', tonic: 'A', fifths: 3 }, { name: 'E♭ major', tonic: 'E', fifths: -3 },
];
const LETTERS = 'CDEFGAB';
const bars = [['q', 'q', 'q', 'q'], ['q', '8', '8', 'q', 'q'], ['h', 'q', 'q'], ['q', 'q', '16', '16', '16', '16', 'q']];
const beats = (duration: string) => duration === 'h' ? 2 : duration === '8' ? .5 : duration === '16' ? .25 : 1;
const midi = (pitch: string) => { const [, letter, sign, octave] = /^([A-G])([#b]?)(\d)$/.exec(pitch)!; return (Number(octave) + 1) * 12 + ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] ?? 0) + (sign === '#' ? 1 : sign === 'b' ? -1 : 0); };
// Written scale fragments, turns, and arches. Each row is a complete two-bar phrase.
const CONTOURS = [
  [0, 1, 2, 3, 4, 3, 2, 0], [2, 3, 4, 2, 1, 2, 1, 0], [4, 3, 2, 1, 0, 1, 2, 0],
  [0, 2, 4, 3, 2, 1, 2, 0], [2, 1, 0, 1, 2, 3, 2, 0], [0, 1, 2, 4, 3, 2, 1, 0],
  [0, 1, 2, 3, 4, 5, 4, 3, 2, 0], [2, 3, 4, 5, 4, 3, 2, 1, 2, 0], [4, 3, 2, 1, 0, 1, 2, 3, 1, 0],
  [0, 2, 3, 4, 2, 1, 0, 1, 2, 0], [2, 1, 0, 2, 3, 4, 3, 2, 1, 0], [0, 1, 3, 4, 3, 2, 1, 2, 1, 0],
  [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 1, 0], [2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 2, 1, 0], [4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 0],
  [0, 2, 4, 3, 2, 1, 0, 1, 2, 3, 4, 2, 1, 0], [2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 0], [0, 1, 2, 4, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0],
];
export const BATCH_COUNT = 6;
export const BATCH_KINDS: readonly (readonly QuestionKind[])[] = [
  ['audio', 'visual', 'play'], ['audio', 'cause', 'play'],
  ['audio', 'visual', 'play'], ['audio', 'cause', 'play'],
  ['audio', 'audio', 'play'], ['audio', 'visual', 'play'],
];
const signatureAlter = (letter: string, fifths: number) => (fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(fifths)).includes(letter) ? Math.sign(fifths) : 0;
const spelling = (letter: string, octave: number, alter: number) => `${letter}${alter === 1 ? '#' : alter === -1 ? 'b' : ''}${octave}`;
const displayPitch = (pitch: string) => pitch.replace('#', '♯').replace('b', '♭');
const oldBassReading = (pitch: string) => {
  const [, letter, sign, octave] = /^([A-G])([#b]?)(\d)$/.exec(pitch)!;
  const index = Number(octave) * 7 + LETTERS.indexOf(letter) - 12;
  return `${LETTERS[((index % 7) + 7) % 7]}${sign}${Math.floor(index / 7)}`;
};

/** Engraves sounding pitches and durations from the same semantic model used by the answer/audio. */
export function stationMusicXML(question: Question, fifths: number, clefChange?: { index: number; clef: 'treble' | 'bass' }): string {
  if (question.cue.staves.length === 2) {
    const parts = question.cue.staves.map((staff, i) => {
      const single = { ...question, expectedSequence: staff.notes.map(n => n.keys[0].replace('/', '').replace(/^./, c => c.toUpperCase())), cue: { ...question.cue, staves: [staff] } };
      const xml = stationMusicXML(single, fifths, i === 1 ? clefChange : undefined);
      return xml.slice(xml.indexOf('<part id="P1">'), xml.indexOf('</score-partwise>')).replace('<part id="P1">', `<part id="P${i + 1}">`);
    });
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><part-group type="start" number="1"><group-symbol>brace</group-symbol><group-barline>yes</group-barline></part-group><score-part id="P1"><part-name>Right hand</part-name></score-part><score-part id="P2"><part-name>Left hand</part-name></score-part><part-group type="stop" number="1"/></part-list>${parts.join('')}</score-partwise>`;
  }
  const notes = question.cue.staves[0].notes;
  let content = '', measure = 1, beat = 0;
  let accidentals = new Map<string, number>();
  const measures: string[] = [];
  const clef = (value: 'treble' | 'bass') => `<clef><sign>${value === 'bass' ? 'F' : 'G'}</sign><line>${value === 'bass' ? 4 : 2}</line></clef>`;
  notes.forEach((note, i) => {
    if (i === 0) content += `<attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${clef(notes.length ? question.cue.staves[0].clef : 'treble')}</attributes>`;
    if (clefChange?.index === i) content += `<attributes>${clef(clefChange.clef)}</attributes>`;
    const [, step, acc, oct] = /^([A-G])([#b]?)(\d)$/.exec(question.expectedSequence[i])!;
    const alter = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
    const identity = `${step}${oct}`, prior = accidentals.get(identity) ?? signatureAlter(step, fifths);
    const sign = prior === alter ? '' : `<accidental>${alter === 1 ? 'sharp' : alter === -1 ? 'flat' : 'natural'}</accidental>`;
    accidentals.set(identity, alter);
    const duration = beats(note.duration);
    content += `<note><pitch><step>${step}</step><alter>${alter}</alter><octave>${oct}</octave></pitch><duration>${duration * 4}</duration><type>${{ q: 'quarter', h: 'half', '8': 'eighth', '16': '16th' }[note.duration] ?? 'quarter'}</type>${sign}${note.finger ? `<notations><technical><fingering>${note.finger}</fingering></technical></notations>` : ''}</note>`;
    beat += duration;
    if (beat === 4) { measures.push(`<measure number="${measure++}">${content}</measure>`); content = ''; beat = 0; accidentals = new Map(); }
  });
  if (beat !== 0 || content) throw new Error('Station phrase must contain complete measures.');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Reading</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}

export function generateQuestion(topic: StationTopic, kind: QuestionKind, seed: string, subtlety: number, forceWrong: boolean, keyOffset: number): StationQuestion {
  const example = keyOffset % CONTOURS.length;
  const batch = Math.floor(example / 3);
  const key = KEYS[batch];
  const firstBar = bars[subtlety === 0 ? 0 : subtlety === 1 ? 1 : 3];
  const secondBar = firstBar;
  const durations = [...firstBar, ...secondBar];
  const count = durations.length;
  let fifths = key.fifths, clef: 'treble' | 'bass' = 'treble';
  let target = firstBar.length + secondBar.length - 2;
  let change: { index: number; clef: 'treble' | 'bass' } | undefined;
  const shape = CONTOURS[example];
  const pitches = durations.map((_, i) => {
    const degree = LETTERS.indexOf(key.tonic) + shape[i];
    const letter = LETTERS[degree % 7];
    return spelling(letter, 4 + Math.floor(degree / 7), signatureAlter(letter, fifths));
  });
  const wrong = [...pitches];
  let explanation: string, cause: string, cluePrompt: string, clueChoices: string[], clueCorrect: number, clueExplanation: string;
  let rulePrompt: string, ruleChoices: string[];
  const ruleCorrect = 0, visualCorrect = 0;
  let visualPrompt: string, visualChoices: string[] = [];
  let hesitation: number | undefined;
  let keyName = key.name;
  let fingers: number[] | undefined;

  if (topic === 'key-signature') {
    // Descending scale fragments put the signature tone naturally in both bars.
    const letter = (fifths > 0 ? 'FCGDAEB' : 'BEADGCF')[Math.abs(fifths) - 1];
    const base = LETTERS.indexOf(letter) + (batch >= 2 ? 7 : 0);
    for (let i = 0; i < count; i++) {
      const degree = base + shape[i];
      const step = LETTERS[degree % 7];
      pitches[i] = spelling(step, 4 + Math.floor(degree / 7), signatureAlter(step, fifths));
    }
    target = count - 1;
    pitches[0] = spelling(letter, 4 + Math.floor(base / 7), Math.sign(fifths));
    wrong.splice(0, count, ...pitches.map(p => p.replace(/[#b]/, '')));
    explanation = `Note ${target + 1} is ${displayPitch(pitches[target])}. Read the sharp or flat at the start of the staff, even when no sign is beside the note.`;
    cause = 'The key signature was missed';
    cluePrompt = `The key signature marks ${letter}. Which note should you play for Note ${target + 1}?`;
    clueChoices = [displayPitch(pitches[target]), `${letter} natural`]; clueCorrect = 0;
    clueExplanation = `The key signature makes this ${letter} ${fifths > 0 ? 'sharp' : 'flat'}; it does not need another sign beside the note.`;
    rulePrompt = `Which notes does this key signature change?`;
    const changed = [...(fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(fifths))].join(', ');
    ruleChoices = [`${changed} in every measure and octave, unless overridden`, `${changed} in Measure 1 only`, `${changed} only at the signature’s printed octave`];
    visualPrompt = `What pitch is Note ${target + 1} in Measure 2?`;
  } else if (topic === 'accidental-carryover') {
    fifths = 0; keyName = 'No key signature';
    const letter = ['F', 'B', 'C', 'E', 'G', 'A'][batch], alter = batch % 2 === 0 ? 1 : -1;
    const reset = example % 3 !== 0;
    const base = LETTERS.indexOf(letter);
    for (let i = 0; i < count; i++) {
      const degree = base + shape[i] % 4;
      pitches[i] = spelling(LETTERS[degree % 7], 4 + Math.floor(degree / 7), 0);
    }
    target = reset ? firstBar.length : firstBar.length - 1;
    // Carry the alteration to every repeated occurrence in the first measure.
    for (let i = 0; i < firstBar.length; i++) if (pitches[i] === `${letter}4`) pitches[i] = spelling(letter, 4, alter);
    pitches[0] = spelling(letter, 4, alter);
    pitches[target] = spelling(letter, 4, reset ? 0 : alter);
    wrong.splice(0, count, ...pitches); wrong[target] = spelling(letter, 4, reset ? alter : 0);
    explanation = reset ? `Note ${target + 1} is ${letter} natural. The barline ended the temporary accidental.` : `Note ${target + 1} is ${displayPitch(pitches[target])}. The earlier accidental still applies to the same pitch in this measure.`;
    cause = reset ? 'An accidental was carried past the barline' : 'An accidental was forgotten inside the measure';
    cluePrompt = `Is Note ${target + 1} in the same measure as Note 1?`; clueChoices = ['Yes', 'No']; clueCorrect = reset ? 1 : 0;
    clueExplanation = reset ? 'It is after the barline, so the temporary accidental has ended.' : 'Both notes are in Measure 1 and the same octave.';
    rulePrompt = 'Where does this temporary accidental stop applying?';
    ruleChoices = ['At the next barline, unless the note is tied across it', 'After just one note', 'At the end of the piece'];
    visualPrompt = `What pitch is Note ${target + 1}?`;
  } else if (topic === 'octave-displacement') {
    fifths = 0; keyName = 'C major';
    for (let i = 0; i < count; i++) pitches[i] = `${LETTERS[shape[i]]}5`;
    target = kind === 'audio' && subtlety > 0 ? count - 2 : 0;
    wrong.splice(0, count, ...pitches.map((p, i) => subtlety === 0 || subtlety === 1 && i >= firstBar.length || i === target ? p.replace('5', '4') : p));
    explanation = `Note ${target + 1} is ${displayPitch(pitches[target])}, in the fifth octave.`;
    cause = 'Written notes were played an octave too low';
    cluePrompt = `Is Note ${target + 1} inside the treble staff or below it?`; clueChoices = ['Inside the staff', 'Below the staff']; clueCorrect = 0;
    clueExplanation = `Note ${target + 1} is inside the treble staff, in the fifth octave.`;
    rulePrompt = `Which octave contains the written Note ${target + 1}?`; ruleChoices = ['Fifth octave', 'Fourth octave', 'Third octave'];
    visualPrompt = `What pitch is Note ${target + 1}?`;
  } else if (topic === 'clef-transposition') {
    clef = batch % 2 === 0 ? 'bass' : 'treble'; fifths = 0; keyName = 'C major';
    for (let i = 0; i < count; i++) pitches[i] = `${LETTERS[shape[i]]}${clef === 'bass' ? 3 : 4}`;
    target = 0;
    wrong.splice(0, count, ...pitches.map(p => {
      const degree = Number(p.slice(-1)) * 7 + LETTERS.indexOf(p[0]) + (clef === 'bass' ? 12 : -12);
      return `${LETTERS[degree % 7]}${Math.floor(degree / 7)}`;
    }));
    explanation = `Read Note 1 as ${displayPitch(pitches[0])} in ${clef} clef.`;
    cause = 'The staff was read in the wrong clef';
    cluePrompt = 'Which clef is printed at the start of this staff?';
    clueChoices = ['Bass clef', 'Treble clef']; clueCorrect = clef === 'bass' ? 0 : 1;
    clueExplanation = `This staff uses ${clef} clef.`;
    rulePrompt = 'Which clef should you use to read these notes?'; ruleChoices = [clef === 'bass' ? 'Bass clef' : 'Treble clef', clef === 'bass' ? 'Treble clef' : 'Bass clef'];
    visualPrompt = 'What pitch is Note 1?';
  } else if (topic === 'mid-line-clef-change') {
    clef = 'bass'; fifths = 0; keyName = 'No key signature';
    change = { index: firstBar.length, clef: 'treble' }; target = firstBar.length;
    for (let i = 0; i < count; i++) pitches[i] = `${LETTERS[shape[i]]}${i < firstBar.length ? 3 : 4}`;
    wrong.splice(0, count, ...pitches.map((p, i) => i < firstBar.length ? p : oldBassReading(p)));
    explanation = `The lower staff changes to treble clef before Note ${target + 1}. That note is ${displayPitch(pitches[target])}.`;
    cause = 'The new clef was missed';
    cluePrompt = `Which clef appears before Note ${target + 1} on the lower staff?`; clueChoices = ['Bass clef', 'Treble clef']; clueCorrect = 1;
    clueExplanation = `The lower staff uses treble clef from Note ${target + 1}.`;
    rulePrompt = `Which clef governs Note ${target + 1} on the lower staff?`; ruleChoices = ['Treble clef', 'The opening bass clef', 'Whichever hand plays them'];
    visualPrompt = `What pitch is Note ${target + 1} on the lower staff after the clef change?`;
  } else if (topic === 'hand-position') {
    // A movable five-note shape gives physically plausible finger-to-note labels.
    fifths = 0; keyName = 'C major';
    const root = batch % 3, octave = batch < 3 ? 4 : 5;
    const degrees = durations.map((_, i) => root + Math.min(shape[i], 4));
    for (let i = 0; i < count; i++) { const letter = LETTERS[degrees[i]]; pitches[i] = spelling(letter, octave, signatureAlter(letter, fifths)); }
    fingers = degrees.map(degree => degree - root + 1);
    target = firstBar.length;
    wrong.splice(0, count, ...pitches); wrong[target] = `${pitches[target][0]}${pitches[target].length > 2 ? '' : '#'}${pitches[target].slice(-1)}`;
    // Ensure the distractor actually changes the sounding pitch, including flat notes.
    if (midi(wrong[target]) === midi(pitches[target])) wrong[target] = 'C5';
    visualPrompt = `Which finger number is printed on Note ${target + 1}?`;
    visualChoices = [String(fingers[target]), String(fingers[target] % 5 + 1), String((fingers[target] + 1) % 5 + 1)];
    explanation = `Note ${target + 1} is ${displayPitch(pitches[target])}, marked for finger ${fingers[target]}. Staff position determines pitch.`;
    cause = 'The written pitch was misread';
    cluePrompt = `Is the number on Note ${target + 1} a finger number or an octave?`; clueChoices = ['Finger number', 'Octave']; clueCorrect = 0;
    clueExplanation = 'The small number names the finger; the staff position names the pitch.';
    rulePrompt = 'What tells you the pitch to play?'; ruleChoices = ['Staff position, clef, and accidentals', 'The finger number alone', 'The nearest white key'];
  } else {
    // Assess continuity at a marked transition; audio cannot certify which finger was physically used.
    fingers = durations.map((_, i) => [1, 2, 3, 1, 2, 3, 4, 5][i % 8]);
    // G/D/A scales have the intended right-hand 3-to-thumb transition.
    const crossingKey = [KEYS[0], KEYS[2], KEYS[4]][batch % 3];
    fifths = crossingKey.fifths; keyName = crossingKey.name;
    const start = LETTERS.indexOf(crossingKey.tonic);
    for (let i = 0; i < count; i++) {
      const endings = [[4, 5, 6, 7, 6, 5, 4, 3, 2, 0], [4, 5, 4, 3, 2, 1, 0, 1, 2, 3], [4, 3, 2, 0, 1, 2, 3, 4, 3, 2]];
      const degree = i < 4 ? i : endings[example % 3][i - 4];
      const letter = LETTERS[(start + degree) % 7];
      pitches[i] = spelling(letter, 4 + Math.floor((start + degree) / 7), signatureAlter(letter, fifths));
      fingers[i] = [1, 2, 3, 1, 2, 3, 4, 5][degree];
    }
    target = 3;
    hesitation = target;
    wrong.splice(0, count, ...pitches);
    visualPrompt = `Which finger number follows finger 3 on Note ${target + 1}?`;
    visualChoices = ['1 (thumb)', '4', '5'];
    explanation = `Use the thumb on Note ${target + 1}, after finger 3. Keep the written beat steady through the move.`;
    cause = 'The beat hesitated at the marked move';
    cluePrompt = `Which finger is written on Note ${target + 1}?`; clueChoices = ['1 (thumb)', '3']; clueCorrect = 0;
    clueExplanation = 'Finger 1 is the thumb. Prepare the move before this note.';
    rulePrompt = `What should happen to the beat at Note ${target + 1}?`; ruleChoices = ['It continues at the written rhythm', 'It pauses for the hand to move', 'It restarts from beat 1'];
  }

  const question: Question = { id: `station/${topic}/${hash(seed)}`, conceptId: topic, exerciseMode: 'standard', handScope: clef === 'bass' ? 'left' : 'right',
    instruction: 'Read the written phrase.', expectedSequence: pitches,
    cue: { timeSignature: '4/4', staves: [{ clef, hand: clef === 'bass' ? 'left' : 'right', notes: pitches.map((pitch, i) => ({ keys: [pitch.replace(/(\d)$/, '/$1').toLowerCase()], duration: durations[i], finger: fingers?.[i] })) }] },
    tempoWindowSec: null, positionLabel: 'Reading station', difficulty: subtlety, mode: 'normal', fingeringInferred: false,
    positionProof: { requireHeld: false, positionName: 'Reading station', hand: clef === 'bass' ? 'left' : 'right', acceptWindowMs: 12000, proofNotes: [0, 1, 2].map((i) => ({ pitch: pitches[i], finger: ([1, 3, 5] as const)[i] })) as NonNullable<Question['positionProof']>['proofNotes'] } };
  const rightPitches = topic === 'mid-line-clef-change' ? shape.map(degree => `${LETTERS[Math.min(degree + 2, 6)]}5`) : null;
  if (rightPitches) {
    const leftStaff = question.cue.staves[0];
    question.cue.staves = [{ clef: 'treble', hand: 'right', notes: rightPitches.map((pitch, i) => ({ keys: [pitch.replace(/(\d)$/, '/$1').toLowerCase()], duration: durations[i] })) }, leftStaff];
    question.handScope = 'both';
    question.expectedSequence = pitches.flatMap((p, i) => [rightPitches[i], p]);
    question.instruction = 'Play both hands. Read the new clef on the lower staff.';
  } else question.instruction = topic === 'key-signature' ? 'Read the music, then play the phrase.' : 'Play the written phrase with a steady beat.';
  const mismatched = forceWrong;
  let prompt: string, options: string[], correct = 0;
  if (kind === 'play') {
    prompt = question.instruction; options = ['Played accurately', 'Needs another try'];
  } else if (kind === 'audio') {
    prompt = topic === 'cross-over-under' ? `Does the piano keep the written beat through Note ${target + 1}?` : 'Does the piano match the score?';
    options = ['Right', 'Wrong']; correct = mismatched ? 1 : 0;
  } else if (kind === 'cause') {
    prompt = `The piano does not match. What caused the error?`;
    options = [cause, 'A different rhythm was played', 'The phrase was played in the wrong octave'];
    if (topic === 'octave-displacement') options = [cause, 'A different rhythm was played', 'The key signature was missed'];
    if (topic === 'cross-over-under') options = [cause, 'The key signature was missed', 'The phrase was played in the wrong octave'];
  } else if (kind === 'rule') { prompt = rulePrompt; options = ruleChoices; correct = ruleCorrect; }
  else {
    prompt = visualPrompt;
    options = visualChoices.length ? visualChoices : [displayPitch(pitches[target]), displayPitch(`${pitches[target][0]}${pitches[target].length > 2 ? '' : '#'}${pitches[target].slice(-1)}`), displayPitch(pitches[target].replace(/\d$/, p => String(Number(p) + 1)))];
    // Octave and flat distractors must remain distinct from the correct pitch.
    options = [...new Set(options)];
    if (options.length < 3) options.push(displayPitch(`${pitches[target][0]}${Number(pitches[target].slice(-1)) - 1}`));
    correct = visualCorrect;
  }
  const offset = example % options.length;
  const sorted = options.map((_, i) => { const index = (i + offset) % options.length; return { text: options[index], right: index === correct }; });
  const heard = kind === 'cause' || mismatched ? wrong : pitches;
  const audioPitches = rightPitches ? heard.flatMap((p, i) => [rightPitches[i], p]) : heard;
  const fingerprint = JSON.stringify([question.expectedSequence.map(midi), durations]);
  return { id: question.id, topic, kind, fingerprint, keyName, question,
    notation: { clef, fifths, clefChange: change, mistakeIndices: [target] }, musicXML: stationMusicXML(question, fifths, change),
    prompt, choices: sorted.map(o => o.text), correct: sorted.findIndex(o => o.right), targetIndex: target,
    explanation: kind === 'audio' && !mismatched ? `The piano matches. ${explanation}` : explanation,
    clue: { prompt: cluePrompt, choices: clueChoices, correct: clueCorrect, explanation: clueExplanation },
    ...((kind === 'audio' || kind === 'cause') ? { audio: { pitches: audioPitches, durations: rightPitches ? durations.flatMap(d => [d, d]) : durations, ...(hesitation !== undefined && (kind === 'cause' || mismatched) ? { hesitationBefore: hesitation, hesitationSeconds: [.8, .4, .2][Math.min(subtlety, 2)] } : {}) } } : {}) };
}

/** A finite, shared teaching sequence. Identity, date and telemetry never select content. */
export function fixedBatch(topic: StationTopic, batch: number): DailyTriad {
  if (!Number.isInteger(batch) || batch < 1 || batch > BATCH_COUNT) throw new Error('Unknown batch');
  let firstAudio = true;
  return BATCH_KINDS[batch - 1].map((kind, slot) => {
    const wrong = kind === 'audio' && firstAudio;
    if (kind === 'audio') firstAudio = false;
    return generateQuestion(topic, kind, `fixed-v2/${topic}/${batch}/${slot}`, Math.floor((batch - 1) / 2), wrong, (batch - 1) * 3 + slot);
  }) as DailyTriad;
}
