import type { Question } from '../curriculum/types';
import type { Archetype, DailyTriad, QuestionKind, StationQuestion, StationTopic } from './types';
import { hash, seeded } from './engine';

const KEYS = [
  { name: 'G major', tonic: 'G', fifths: 1 }, { name: 'F major', tonic: 'F', fifths: -1 },
  { name: 'D major', tonic: 'D', fifths: 2 }, { name: 'B♭ major', tonic: 'B', fifths: -2 },
  { name: 'A major', tonic: 'A', fifths: 3 }, { name: 'E♭ major', tonic: 'E', fifths: -3 },
];
const LETTERS = 'CDEFGAB';
const bars = [['q', 'q', 'q', 'q'], ['q', '8', '8', 'q', 'q'], ['h', 'q', 'q'], ['q', 'q', '16', '16', '16', '16', 'q']];
const beats = (duration: string) => duration === 'h' ? 2 : duration === '8' ? .5 : duration === '16' ? .25 : 1;
const midi = (pitch: string) => { const [, letter, sign, octave] = /^([A-G])([#b]?)(\d)$/.exec(pitch)!; return (Number(octave) + 1) * 12 + ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] ?? 0) + (sign === '#' ? 1 : sign === 'b' ? -1 : 0); };
const pick = <T,>(values: readonly T[], random: () => number): T => values[Math.floor(random() * values.length)];
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
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
  const random = seeded(seed), key = KEYS[keyOffset % KEYS.length];
  const rhythmLimit = subtlety === 0 ? 2 : subtlety === 1 ? 3 : 4;
  const firstBar = kind === 'audio' ? bars[subtlety === 0 ? 0 : subtlety === 1 ? 1 : 3] : pick(bars.slice(0, rhythmLimit), random);
  const secondBar = kind === 'audio' ? firstBar : pick(bars.slice(0, rhythmLimit), random);
  const durations = [...firstBar, ...secondBar];
  const count = durations.length;
  let fifths = key.fifths, clef: 'treble' | 'bass' = 'treble';
  let target = firstBar.length + secondBar.length - 2;
  let change: { index: number; clef: 'treble' | 'bass' } | undefined;
  let contour = Math.floor(random() * 7);
  const pitches = durations.map(() => {
    contour = Math.max(0, Math.min(7, contour + pick([-2, -1, 1, 2], random)));
    const letter = LETTERS[contour % 7];
    return spelling(letter, 4 + Math.floor(contour / 7), signatureAlter(letter, fifths));
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
    const letter = pick([...(fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(fifths))], random);
    const octave = subtlety >= 1 && random() > .5 ? 5 : 4;
    pitches[1] = spelling(letter, 4, Math.sign(fifths));
    pitches[target] = spelling(letter, octave, Math.sign(fifths));
    wrong.splice(0, count, ...pitches); wrong[target] = `${letter}${octave}`;
    explanation = `Note ${target + 1} is ${displayPitch(pitches[target])}. The key signature applies after the barline and in every octave unless a written accidental overrides it.`;
    cause = 'The key signature was missed';
    cluePrompt = `Does the barline end the key signature for Note ${target + 1}?`;
    clueChoices = ['Yes', 'No']; clueCorrect = 1; clueExplanation = 'The key signature continues across the barline.';
    rulePrompt = `Which notes does this key signature change?`;
    const changed = [...(fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(fifths))].join(', ');
    ruleChoices = [`${changed} in every measure and octave, unless overridden`, `${changed} in Measure 1 only`, `${changed} only at the signature’s printed octave`];
    visualPrompt = `What pitch is Note ${target + 1} in Measure 2?`;
  } else if (topic === 'accidental-carryover') {
    fifths = 0; keyName = 'No key signature';
    const letter = pick(['C', 'D', 'F', 'G', 'B'], random), alter = pick([1, -1], random);
    for (let i = 0; i < count; i++) pitches[i] = `${pick([...LETTERS].filter(l => l !== letter), random)}4`;
    const reset = random() > .5;
    target = reset ? firstBar.length : firstBar.length - 1;
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
    for (let i = 0; i < count; i++) { const letter = pick(['C', 'D', 'E', 'F'], random); pitches[i] = spelling(letter, 5, signatureAlter(letter, fifths)); }
    target = kind === 'audio' && subtlety > 0 ? count - 2 : 0;
    wrong.splice(0, count, ...pitches.map((p, i) => subtlety === 0 || subtlety === 1 && i >= firstBar.length || i === target ? p.replace('5', '4') : p));
    explanation = `Note ${target + 1} is ${displayPitch(pitches[target])}, in the fifth octave.`;
    cause = 'Written notes were played an octave too low';
    cluePrompt = `Is Note ${target + 1} inside the treble staff or below it?`; clueChoices = ['Inside the staff', 'Below the staff']; clueCorrect = 0;
    clueExplanation = `Note ${target + 1} is inside the treble staff, in the fifth octave.`;
    rulePrompt = `Which octave contains the written Note ${target + 1}?`; ruleChoices = ['Fifth octave', 'Fourth octave', 'Third octave'];
    visualPrompt = `What pitch is Note ${target + 1}?`;
  } else if (topic === 'mid-line-clef-change') {
    clef = 'bass'; fifths = 0; keyName = 'No key signature';
    change = { index: firstBar.length, clef: 'treble' }; target = firstBar.length;
    for (let i = 0; i < count; i++) pitches[i] = `${pick(['C', 'D', 'E', 'F', 'G', 'A'], random)}${i < firstBar.length ? 3 : 4}`;
    wrong.splice(0, count, ...pitches.map((p, i) => i < firstBar.length ? p : oldBassReading(p)));
    explanation = `The treble clef before Note ${target + 1} changes how this staff is read. That note is ${displayPitch(pitches[target])}.`;
    cause = 'The new clef was missed';
    cluePrompt = `Which clef appears just before Note ${target + 1}?`; clueChoices = ['Bass clef', 'Treble clef']; clueCorrect = 1;
    clueExplanation = `Treble clef starts at Note ${target + 1}.`;
    rulePrompt = `Which clef governs Note ${target + 1} and the following notes?`; ruleChoices = ['Treble clef', 'The opening bass clef', 'Whichever hand plays them'];
    visualPrompt = `What pitch is Note ${target + 1} after the clef change?`;
  } else if (topic === 'hand-position') {
    // A movable five-note shape gives physically plausible finger-to-note labels.
    const root = Math.floor(random() * 3), octave = pick([4, 5], random);
    const degrees = durations.map(() => root + Math.floor(random() * 5));
    for (let i = 0; i < count; i++) { const letter = LETTERS[degrees[i]]; pitches[i] = spelling(letter, octave, signatureAlter(letter, fifths)); }
    fingers = degrees.map(degree => degree - root + 1);
    target = Math.floor(random() * count);
    wrong.splice(0, count, ...pitches); wrong[target] = `${pitches[target][0]}${pitches[target].length > 2 ? '' : '#'}${pitches[target].slice(-1)}`;
    // Ensure the distractor actually changes the sounding pitch, including flat notes.
    if (midi(wrong[target]) === midi(pitches[target])) wrong[target] = 'C5';
    visualPrompt = `Which finger number is printed on Note ${target + 1}?`;
    visualChoices = [String(fingers[target]), String(fingers[target] % 5 + 1), String((fingers[target] + 1) % 5 + 1)];
    explanation = `Note ${target + 1} is ${displayPitch(pitches[target])}, marked for finger ${fingers[target]}. Audio checks pitch, not physical finger placement.`;
    cause = 'The written pitch was misread';
    cluePrompt = `Is the number on Note ${target + 1} a finger number or an octave?`; clueChoices = ['Finger number', 'Octave']; clueCorrect = 0;
    clueExplanation = 'The small number names the finger; the staff position names the pitch.';
    rulePrompt = 'What tells you the pitch to play?'; ruleChoices = ['Staff position, clef, and accidentals', 'The finger number alone', 'The nearest white key'];
  } else {
    // Assess continuity at a marked transition; audio cannot certify which finger was physically used.
    fingers = durations.map((_, i) => [1, 2, 3, 1, 2, 3, 4, 5][i % 8]);
    // G/D/A scales have the intended right-hand 3-to-thumb transition.
    const crossingKey = [KEYS[0], KEYS[2], KEYS[4]][keyOffset % 3];
    fifths = crossingKey.fifths; keyName = crossingKey.name;
    const start = LETTERS.indexOf(crossingKey.tonic);
    for (let i = 0; i < count; i++) {
      const degree = i < 4 ? i : Math.floor(random() * 8);
      const letter = LETTERS[(start + degree) % 7];
      pitches[i] = spelling(letter, 4 + Math.floor((start + degree) / 7), signatureAlter(letter, fifths));
      fingers[i] = [1, 2, 3, 1, 2, 3, 4, 5][degree];
    }
    target = 3;
    hesitation = target;
    wrong.splice(0, count, ...pitches);
    visualPrompt = `Which finger number follows finger 3 on Note ${target + 1}?`;
    visualChoices = ['1 (thumb)', '4', '5'];
    explanation = `Note ${target + 1} is marked for the thumb after finger 3. Keep the written beat through the move; listening verifies continuity, not finger technique.`;
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
  const mismatched = forceWrong || random() < .55;
  let prompt: string, options: string[], correct = 0;
  if (kind === 'audio') {
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
  const sorted = shuffle(options.map((text, i) => ({ text, right: i === correct })), random);
  const audioPitches = kind === 'cause' || mismatched ? wrong : pitches;
  const fingerprint = JSON.stringify([pitches.map(midi), durations]);
  return { id: question.id, topic, kind, fingerprint, keyName, question,
    notation: { clef, fifths, clefChange: change, mistakeIndices: [target] }, musicXML: stationMusicXML(question, fifths, change),
    prompt, choices: sorted.map(o => o.text), correct: sorted.findIndex(o => o.right), targetIndex: target,
    explanation: kind === 'audio' && !mismatched ? `The piano matches. ${explanation}` : explanation,
    clue: { prompt: cluePrompt, choices: clueChoices, correct: clueCorrect, explanation: clueExplanation },
    ...((kind === 'audio' || kind === 'cause') ? { audio: { pitches: audioPitches, durations, ...(hesitation !== undefined && (kind === 'cause' || mismatched) ? { hesitationBefore: hesitation, hesitationSeconds: [.8, .4, .2][Math.min(subtlety, 2)] } : {}) } } : {}) };
}

/** Pool sampling is bounded and rejects recent sounding phrases before accepting a question. */
export function assembleTriad(student: string, date: string, topic: StationTopic, archetype: Archetype, recent: Set<string>): DailyTriad {
  const seed = `stations-v1/${student}/${date}/${topic}/${archetype}`, random = seeded(seed);
  const templates: Record<Archetype, QuestionKind[]> = { ear: ['audio', 'audio', 'audio'], visual: ['visual', 'visual', 'cause'], classification: ['audio', 'audio', 'cause'], balanced: ['visual', 'rule', 'audio'] };
  // Preserve increasing auditory subtlety in ear mode, vary all other question orders.
  const kinds = archetype === 'ear' ? templates.ear : shuffle(templates[archetype], random);
  const seen = new Set(recent), result: StationQuestion[] = [];
  const keyStart = hash(`${student}/${date}/keys`) % KEYS.length;
  let heardJudgment = false;
  for (let slot = 0; slot < 3; slot++) {
    let accepted: StationQuestion | undefined;
    for (let candidate = 0; candidate < 256; candidate++) {
      const question = generateQuestion(topic, kinds[slot], `${seed}/${slot}/${candidate}`, slot, kinds[slot] === 'audio' && !heardJudgment, keyStart + slot);
      if (!seen.has(question.fingerprint)) { accepted = question; break; }
    }
    if (!accepted) throw new Error('No fresh musical example is available. Try exhaustive practice.');
    result.push(accepted); seen.add(accepted.fingerprint);
    if (accepted.kind === 'audio') heardJudgment = true;
  }
  return result as DailyTriad;
}
