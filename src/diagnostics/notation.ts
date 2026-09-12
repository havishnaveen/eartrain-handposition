import type { Question } from '../curriculum/types';
import type { DiagnosticNotation } from './registry';

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const clefXml = (clef: 'bass' | 'treble') => `<clef><sign>${clef === 'bass' ? 'F' : 'G'}</sign><line>${clef === 'bass' ? 4 : 2}</line></clef>`;
/** Isolated engraving: sounding notes remain untouched in the engine's Question. */
export function diagnosticMusicXML(question: Question, notation: DiagnosticNotation, highlight = false): string {
  const measures: string[] = [];
  const keyAlter = new Map<string, number>();
  const fifths = notation.fifths ?? 0;
  (fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(fifths)).split('').forEach(step => keyAlter.set(step, Math.sign(fifths)));
  const pitches = question.expectedSequence;
  for (let start = 0; start < pitches.length; start += 4) {
    const accidentals = new Map<string, number>();
    let contents = start === 0 ? `<attributes><divisions>1</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${clefXml(notation.clef)}</attributes>` : '';
    // MusicXML down means the octave line is drawn above the staff; pitches are sounding pitches.
    if (start === 0 && notation.octaveUp) contents += '<direction placement="above"><direction-type><octave-shift type="down" size="8" number="1"/></direction-type></direction>';
    for (let i = start; i < Math.min(start + 4, pitches.length); i++) {
      if (notation.clefChange?.index === i) contents += `<attributes>${clefXml(notation.clefChange.clef)}</attributes>`;
      if (question.anchorShift?.splitIndex === i) contents += `<direction placement="above"><direction-type><words color="#ef6a47">${xml(question.anchorShift.toPositionName)}</words></direction-type></direction>`;
      const match = /^([A-G])([#b]*)(\d+)$/.exec(pitches[i]);
      if (!match) throw new Error(`Invalid diagnostic pitch: ${pitches[i]}`);
      const [, step, accidental, octave] = match;
      const alter = accidental.startsWith('#') ? accidental.length : -accidental.length;
      const identity = `${step}${octave}`;
      const previous = accidentals.get(identity) ?? keyAlter.get(step) ?? 0;
      const sign = alter !== previous ? `<accidental>${alter === 1 ? 'sharp' : alter === -1 ? 'flat' : alter === 2 ? 'double-sharp' : alter === -2 ? 'flat-flat' : 'natural'}</accidental>` : '';
      accidentals.set(identity, alter);
      const finger = question.cue.staves[0].notes[i].finger;
      const color = highlight && notation.mistakeIndices.includes(i) ? '#ef6a47' : '#242237';
      contents += `<note color="${color}"><pitch><step>${step}</step><alter>${alter}</alter><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type>${sign}${finger ? `<notations><technical><fingering placement="${question.handScope === 'left' ? 'below' : 'above'}">${finger}</fingering></technical></notations>` : ''}</note>`;
    }
    if (start + 4 >= pitches.length && notation.octaveUp) contents += '<direction placement="above"><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>';
    measures.push(`<measure number="${start / 4 + 1}">${contents}</measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>${xml(question.handScope === 'left' ? 'Left hand' : 'Right hand')}</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}
