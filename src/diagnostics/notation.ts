import type { Question } from '../curriculum/types';
import type { DiagnosticNotation } from './registry';
import { cueSpecToMusicXML } from '../notation/cueSpecToMusicXML';

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const clefXml = (clef: 'bass' | 'treble') => `<clef><sign>${clef === 'bass' ? 'F' : 'G'}</sign><line>${clef === 'bass' ? 4 : 2}</line></clef>`;
/** Isolated engraving: sounding notes remain untouched in the engine's Question. */
export function diagnosticMusicXML(question: Question, notation: DiagnosticNotation, highlight = false, highlightNoteIndex?: number): string {
  // The new high-register listening rhythms use the existing beat-aware engraver.
  // Keep the specialized clef/accidental/8va path below unchanged.
  if (question.conceptId === 'octave-displacement' && question.cue.staves[0].notes.some(note => note.duration !== 'q')) {
    return cueSpecToMusicXML({
      ...question.cue,
      staves: question.cue.staves.map(staff => ({ ...staff, notes: staff.notes.map((note, i) => ({
        ...note, anchor: (highlight && notation.mistakeIndices.includes(i)) || highlightNoteIndex === i,
      })) })),
    }, { inkColor: '#242237', accentColor: '#ef6a47' });
  }
  const fifths = notation.fifths ?? 0;
  const keyAlter = new Map<string, number>();
  (fifths > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(fifths)).split('').forEach(step => keyAlter.set(step, Math.sign(fifths)));

  if (question.cue.staves.length === 2) {
    const [rightStaff, leftStaff] = question.cue.staves;
    const rightNotes = rightStaff.notes;
    const leftNotes = leftStaff.notes;
    const noteCount = Math.max(rightNotes.length, leftNotes.length);

    const renderStaffPart = (staffNotes: typeof rightNotes, partId: string, defaultClef: 'treble' | 'bass', isLeftStaff: boolean) => {
      const measures: string[] = [];
      for (let start = 0; start < noteCount; start += 4) {
        const accidentals = new Map<string, number>();
        let contents = start === 0
          ? `<attributes><divisions>1</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${clefXml(defaultClef)}</attributes>`
          : '';

        for (let i = start; i < Math.min(start + 4, noteCount); i++) {
          if (isLeftStaff && notation.clefChange?.index === i) {
            contents += `<attributes>${clefXml(notation.clefChange.clef)}</attributes>`;
          }
          const noteObj = staffNotes[i];
          if (!noteObj || noteObj.duration.endsWith('r')) {
            contents += '<note><rest/><duration>1</duration><type>quarter</type></note>';
          } else {
            const rawKey = noteObj.keys[0];
            const [stepLower, octStr] = rawKey.split('/');
            const step = stepLower[0].toUpperCase();
            const accStr = stepLower.slice(1);
            const octave = Number(octStr);
            const alter = accStr.startsWith('#') ? accStr.length : accStr.startsWith('b') ? -accStr.length : 0;
            const identity = `${step}${octave}`;
            const previous = accidentals.get(identity) ?? keyAlter.get(step) ?? 0;
            const sign = alter !== previous ? `<accidental>${alter === 1 ? 'sharp' : alter === -1 ? 'flat' : alter === 2 ? 'double-sharp' : alter === -2 ? 'flat-flat' : 'natural'}</accidental>` : '';
            accidentals.set(identity, alter);
            const finger = noteObj.finger;
            const isHighlighted = (highlight && notation.mistakeIndices.includes(i)) || highlightNoteIndex === i;
            const color = isHighlighted ? '#ef6a47' : '#242237';
            contents += `<note color="${color}"><pitch><step>${step}</step><alter>${alter}</alter><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type>${sign}${finger ? `<notations><technical><fingering placement="${isLeftStaff ? 'below' : 'above'}">${finger}</fingering></technical></notations>` : ''}</note>`;
          }
        }
        measures.push(`<measure number="${start / 4 + 1}">${contents}</measure>`);
      }
      return `<part id="${partId}">${measures.join('')}</part>`;
    };

    const p1Xml = renderStaffPart(rightNotes, 'P1', 'treble', false);
    const p2Xml = renderStaffPart(leftNotes, 'P2', 'bass', true);

    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><part-group type="start" number="1"><group-symbol>brace</group-symbol><group-barline>yes</group-barline></part-group><score-part id="P1"><part-name>Right hand</part-name></score-part><score-part id="P2"><part-name>Left hand</part-name></score-part><part-group type="stop" number="1"/></part-list>${p1Xml}${p2Xml}</score-partwise>`;
  }

  const measures: string[] = [];
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
      const finger = question.cue.staves[0]?.notes[i]?.finger;
      const isHighlighted = (highlight && notation.mistakeIndices.includes(i)) || highlightNoteIndex === i;
      const color = isHighlighted ? '#ef6a47' : '#242237';
      contents += `<note color="${color}"><pitch><step>${step}</step><alter>${alter}</alter><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type>${sign}${finger ? `<notations><technical><fingering placement="${question.handScope === 'left' ? 'below' : 'above'}">${finger}</fingering></technical></notations>` : ''}</note>`;
    }
    if (start + 4 >= pitches.length && notation.octaveUp) contents += '<direction placement="above"><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>';
    measures.push(`<measure number="${start / 4 + 1}">${contents}</measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>${xml(question.handScope === 'left' ? 'Left hand' : 'Right hand')}</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
}
