import type { CueNote, CueSpec, StaffSpec } from '../curriculum/types';
import { beatsForDuration, pitchToMidi } from '../audio/timing';

/**
 * Converts the app's internal CueSpec (VexFlow-flavored: "c/4" keys, "q"/"8"/
 * "16"/"w"/"h" + optional "d" dots + optional trailing "r" for rest) into a
 * MusicXML partwise document that OpenSheetMusicDisplay can render.
 *
 * Design notes:
 * - One <part> per staff in `cue.staves` (so a two-hand grand staff becomes
 *   two parts, bracketed together — OSMD/VexFlow draws a brace between parts
 *   that share a `<part-group>` the same way it would for a real piano part).
 * - Real <measure> boundaries are computed from `beatsPerBar`, independent of
 *   `measuresPerSystem` (which only affects line-wrapping, a rendering
 *   concern OSMD's own responsive engraving now owns).
 * - Per-note color is baked directly into the XML via MusicXML's `color`
 *   attribute (supported on <note>), replacing VexFlow's post-hoc
 *   `setStyle()` calls. Coloring priority mirrors the old renderer exactly:
 *   success > anchor > ink.
 * - Fingering numbers go through <notations><technical><fingering>, which
 *   OSMD renders out of the box (confirmed empirically; RenderFingerings
 *   defaults to true).
 * - `positionChange` and the anchor-shift purple overlay are NOT notation
 *   content — they stay as a separate SVG/DOM overlay layer in StaffCue.tsx,
 *   exactly as before.
 */

const KEY_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};

/** MusicXML <divisions> per quarter note. 16 lets a 16th note (1) stay integral. */
const DIVISIONS = 16;

interface ParsedPitch {
  step: string;
  alter: number;
  octave: number;
}

/** "c/4", "f#/4", "bb/3" -> MusicXML step/alter/octave. */
function parsePitch(key: string): ParsedPitch | null {
  const match = /^([a-g])(#{1,2}|b{1,2})?\/(-?\d+)$/i.exec(key);
  if (!match) return null;
  const step = match[1].toUpperCase();
  const accidental = match[2] ?? '';
  const alter = accidental === '#' ? 1 : accidental === '##' ? 2
    : accidental === 'b' ? -1 : accidental === 'bb' ? -2 : 0;
  const octave = Number(match[3]);
  if (!Number.isFinite(octave)) return null;
  return { step, alter, octave };
}

interface ParsedDuration {
  /** MusicXML <type>: whole/half/quarter/eighth/16th. */
  type: string;
  dots: number;
  isRest: boolean;
  beats: number;
  /** Integer duration in DIVISIONS units, for <duration>. */
  divisions: number;
}

const BASE_TYPE: Record<string, string> = {
  w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th',
};

function parseDuration(duration: string): ParsedDuration {
  const isRest = duration.endsWith('r');
  const withoutRest = isRest ? duration.slice(0, -1) : duration;
  const dots = (withoutRest.match(/d+$/)?.[0].length) ?? 0;
  const base = withoutRest.replace(/d+$/, '');
  const type = BASE_TYPE[base] ?? 'quarter';
  const beats = beatsForDuration(duration);
  // DIVISIONS is per quarter note, so beats * DIVISIONS is exact for every
  // base duration/dot combination used in this codebase (w/h/q/8/16, single
  // dot) since DIVISIONS=16 is divisible by all of 1,2,4,8,16.
  const divisions = Math.round(beats * DIVISIONS);
  return { type, dots, isRest, beats, divisions };
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Same coloring priority as the old VexFlow renderer: success > anchor > ink. */
function resolveNoteColor(
  note: CueNote,
  completedMidi: Set<number>,
  inkColor: string,
  accentColor: string,
  successColor: string,
): string {
  if (note.duration.endsWith('r')) return inkColor;
  const completed = note.keys.some((key) => {
    const parsed = parsePitch(key);
    if (!parsed) return false;
    const accidental = parsed.alter === 1 ? '#' : parsed.alter === -1 ? 'b' : '';
    const midi = pitchToMidi(`${parsed.step}${accidental}${parsed.octave}`);
    return midi !== null && completedMidi.has(midi);
  });
  if (completed) return successColor;
  if (note.anchor) return accentColor;
  return inkColor;
}

function beatsPerBarOf(cue: CueSpec): number {
  if (!cue.timeSignature) return 4;
  const top = Number(cue.timeSignature.split('/')[0]);
  return Number.isFinite(top) && top > 0 ? top : 4;
}

interface MeasureBucket {
  notes: CueNote[];
}

/**
 * MusicXML/OSMD does not auto-beam from duration alone the way VexFlow's own
 * `Beam.generateBeams` did — every beamed group needs explicit per-note
 * <beam type="begin|continue|end"> elements, or eighth/sixteenth notes render
 * as individually-flagged notes even when they're rhythmically adjacent.
 *
 * Groups consecutive eighth-or-shorter, non-rest notes within one measure
 * into beam runs, breaking at: a rest, a note too long to beam (quarter or
 * longer), or a quarter-note beat boundary — the standard convention (and
 * what the old VexFlow renderer produced by default) is to beam within a
 * beat but not across it, so eighths on beats 1 and 2 (say) get two separate
 * two-note beams rather than one four-note beam spanning the barline's
 * strong pulse. Returns one beam-type slot per note in `notes` (undefined
 * for a note that isn't part of any beam — either alone or too long).
 */
function computeBeamTypes(notes: readonly CueNote[]): (string | undefined)[] {
  const types: (string | undefined)[] = new Array(notes.length).fill(undefined);
  let beat = 0;
  let runStart = -1; // index into `notes` where the current beam run began
  let runStartBeatFloor = -1;

  const closeRun = (endIndex: number) => {
    if (runStart < 0) return;
    if (endIndex - runStart >= 2) {
      types[runStart] = 'begin';
      for (let i = runStart + 1; i < endIndex - 1; i += 1) types[i] = 'continue';
      types[endIndex - 1] = 'end';
    }
    runStart = -1;
  };

  notes.forEach((note, index) => {
    const noteBeats = beatsForDuration(note.duration);
    const isRest = note.duration.endsWith('r');
    const beamable = !isRest && noteBeats < 1 - 1e-6;
    const beatFloor = Math.floor(beat + 1e-6);

    if (!beamable || (runStart >= 0 && beatFloor !== runStartBeatFloor)) {
      closeRun(index);
    }
    if (beamable) {
      if (runStart < 0) {
        runStart = index;
        runStartBeatFloor = beatFloor;
      }
    }
    beat += noteBeats;
  });
  closeRun(notes.length);

  return types;
}

/** Splits one staff's notes into real measures using written beats. */
function splitIntoMeasures(notes: readonly CueNote[], beatsPerBar: number): MeasureBucket[] {
  const measures: MeasureBucket[] = [{ notes: [] }];
  let beatInMeasure = 0;
  for (const note of notes) {
    const noteBeats = beatsForDuration(note.duration);
    if (beatInMeasure > 0 && beatInMeasure + noteBeats > beatsPerBar + 1e-6) {
      // A note that would overflow the bar starts a new one instead of
      // splitting (no tie-across-barline support needed by this catalog).
      measures.push({ notes: [] });
      beatInMeasure = 0;
    }
    measures[measures.length - 1].notes.push(note);
    beatInMeasure += noteBeats;
    if (beatInMeasure >= beatsPerBar - 1e-6) {
      measures.push({ notes: [] });
      beatInMeasure = 0;
    }
  }
  if (measures[measures.length - 1].notes.length === 0) measures.pop();
  return measures.length > 0 ? measures : [{ notes: [] }];
}

export interface CueSpecToMusicXMLOptions {
  inkColor?: string;
  accentColor?: string;
  successColor?: string;
  successPitches?: readonly string[];
}

export function cueSpecToMusicXML(cue: CueSpec, options: CueSpecToMusicXMLOptions = {}): string {
  const {
    inkColor = '#171b22',
    accentColor = '#f97316',
    successColor = '#2f9868',
    successPitches = [],
  } = options;
  const completedMidi = new Set(
    successPitches
      .map((pitch) => pitchToMidi(pitch))
      .filter((midi): midi is number => midi !== null),
  );
  const beatsPerBar = beatsPerBarOf(cue);
  const fifths = cue.keySignature ? (KEY_FIFTHS[cue.keySignature] ?? 0) : 0;
  const [beatsTop, beatsBottom] = (cue.timeSignature ?? '4/4').split('/').map(Number);

  const perStaffMeasures = cue.staves.map((staff) => splitIntoMeasures(staff.notes, beatsPerBar));
  const measureCount = Math.max(1, ...perStaffMeasures.map((m) => m.length));

  const partIds = cue.staves.map((_, i) => `P${i + 1}`);

  const scoreParts = cue.staves
    .map((staff, i) => `    <score-part id="${partIds[i]}"><part-name>${xmlEscape(staffLabel(staff, i))}</part-name></score-part>`)
    .join('\n');

  const partGroupOpen = cue.staves.length > 1
    ? `  <part-list>\n    <part-group type="start" number="1">\n      <group-symbol>brace</group-symbol>\n      <group-barline>yes</group-barline>\n    </part-group>\n${scoreParts}\n    <part-group type="stop" number="1"/>\n  </part-list>`
    : `  <part-list>\n${scoreParts}\n  </part-list>`;

  const parts = cue.staves.map((staff, staffIndex) => {
    const measures = perStaffMeasures[staffIndex];
    const clef = recommendedClefForXml(staff);
    const measureXml: string[] = [];
    for (let m = 0; m < measureCount; m += 1) {
      const bucket = measures[m] ?? { notes: [] };
      const isFirst = m === 0;
      const attributesXml = isFirst
        ? `      <attributes>\n        <divisions>${DIVISIONS}</divisions>\n        <key><fifths>${fifths}</fifths></key>\n        <time><beats>${beatsTop || 4}</beats><beat-type>${beatsBottom || 4}</beat-type></time>\n        <clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>\n      </attributes>\n`
        : '';
      const beamTypes = computeBeamTypes(bucket.notes);
      const notesXml = bucket.notes.length > 0
        ? bucket.notes.map((note, noteIndex) => noteToXml(note, staffIndex, cue.staves.length, inkColor, accentColor, successColor, completedMidi, beamTypes[noteIndex], staff.hand)).join('\n')
        : `      <note>\n        <rest/>\n        <duration>${beatsPerBar * DIVISIONS}</duration>\n        <type>${BASE_TYPE[String(beatsPerBar)] ?? 'whole'}</type>\n      </note>`;
      measureXml.push(`    <measure number="${m + 1}">\n${attributesXml}${notesXml}\n    </measure>`);
    }
    return `  <part id="${partIds[staffIndex]}">\n${measureXml.join('\n')}\n  </part>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n${partGroupOpen}\n${parts}\n</score-partwise>`;
}

function staffLabel(staff: StaffSpec, index: number): string {
  return staff.hand === 'right' ? 'Right hand' : staff.hand === 'left' ? 'Left hand' : `Staff ${index + 1}`;
}

function recommendedClefForXml(staff: StaffSpec): { sign: string; line: number } {
  if (staff.clef === 'bass') return { sign: 'F', line: 4 };
  return { sign: 'G', line: 2 };
}

function noteToXml(
  note: CueNote,
  staffIndex: number,
  staffCount: number,
  inkColor: string,
  accentColor: string,
  successColor: string,
  completedMidi: Set<number>,
  beamType: string | undefined,
  hand?: StaffSpec['hand'],
): string {
  const duration = parseDuration(note.duration);
  const color = resolveNoteColor(note, completedMidi, inkColor, accentColor, successColor);
  const colorAttr = ` color="${color}"`;
  const staffTag = staffCount > 1 ? `\n        <staff>${staffIndex + 1}</staff>` : '';
  // MusicXML numbers beam levels independently (level 1 = eighth, level 2 =
  // 16th, ...). Every duration this catalog beams (eighth/16th) only ever
  // needs level 1: OSMD draws additional flag hooks per note type on its
  // own, and this app's rhythms never mix eighths and 16ths within one run.
  const beamXml = beamType ? `\n        <beam number="1">${beamType}</beam>` : '';

  if (duration.isRest || note.keys.length === 0) {
    return `      <note${colorAttr}>\n        <rest/>\n        <duration>${duration.divisions}</duration>\n        <type>${duration.type}</type>${'<dot/>'.repeat(duration.dots)}${staffTag}\n      </note>`;
  }

  const placement = hand === 'left' ? 'below' : 'above';

  return note.keys.map((key, keyIndex) => {
    const pitch = parsePitch(key);
    const pitchXml = pitch
      ? `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`
      : `<pitch><step>C</step><octave>4</octave></pitch>`;
    const chordTag = keyIndex > 0 ? '\n        <chord/>' : '';
    const finger = note.fingers && note.fingers.length > 0 ? note.fingers[keyIndex] : keyIndex === 0 ? note.finger : undefined;
    const notationsXml = finger !== undefined
      ? `\n        <notations><technical><fingering placement="${placement}">${finger}</fingering></technical></notations>`
      : '';
    const accidentalXml = pitch && pitch.alter !== 0
      ? `\n        <accidental>${pitch.alter === 1 ? 'sharp' : pitch.alter === -1 ? 'flat' : pitch.alter === 2 ? 'double-sharp' : 'flat-flat'}</accidental>`
      : '';
    // Per MusicXML's schema, <beam> is only valid on the first note of a
    // chord (subsequent <chord/> notes share the first note's beam/stem).
    const beamForThisKey = keyIndex === 0 ? beamXml : '';
    return `      <note${colorAttr}>${chordTag}\n        ${pitchXml}\n        <duration>${duration.divisions}</duration>\n        <type>${duration.type}</type>${'<dot/>'.repeat(duration.dots)}${accidentalXml}${staffTag}${notationsXml}${beamForThisKey}\n      </note>`;
  }).join('\n');
}
