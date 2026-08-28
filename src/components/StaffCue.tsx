import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Vex from 'vexflow';
const {
  Accidental,
  Annotation,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} = Vex.Flow;
import type { AnchorShiftSpec, CueNote, CueSpec, StaffSpec } from '../curriculum/types';
import { beatsForDuration, pitchToMidi } from '../audio/timing';
import './staff-cue.css';

export interface StaffCueProps {
  cue: CueSpec;
  accentColor?: string;
  inkColor?: string;
  /** Pitches already completed in an interactive score. */
  successPitches?: readonly string[];
  successColor?: string;
  /** Highlights the exact travel space between the two hand positions. */
  shiftMarker?: AnchorShiftSpec;
  /** Keeps paired notation panels on one shared visual scale. */
  minimumTimelineBeats?: number;
  /** Uses tighter horizontal engraving for narrow split-card layouts. */
  compact?: boolean;
}

export interface StaffCueHandle {
  /**
   * Move the scrubber to a beat position. Negative parks it at the start
   * (count-in). Called from an animation frame — this mutates SVG attributes
   * directly and never triggers a React render.
   */
  seekToBeat: (beat: number) => void;
  hide: () => void;
}

/* Sizing. The viewBox crops to measured content, so apparent note size is
 * governed by the content's ASPECT RATIO — a scale() would grow the glyphs
 * and the bounding box together and cancel out exactly. The lever is a
 * narrower stave, sized to its real contents. */

const KEY_ACCIDENTALS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6,
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6,
};

const CLEF_WIDTH = 62;
const ACCIDENTAL_WIDTH = 14;
const TIME_SIG_WIDTH = 30;
const PER_BEAT = 62;
const MIN_PER_NOTE = 48;
const PER_BARLINE = 30;
const MIN_STAVE_W = 260;
/** Space for the final notehead, accidental, stem and finger annotation. */
const NOTE_RIGHT_GUTTER = 44;

const CANVAS_H = 560;
const STAVE_X = 12;
const STAVE_TOP = 200;
const STAVE_GAP = 122;
const BOUNDS_PAD_X = 42;
const BOUNDS_PAD_Y = 28;
const SCRUB_OVERHANG = 26;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ScrubPoint {
  beat: number;
  x: number;
}

export interface ShiftRegion {
  startX: number;
  endX: number;
  centerX: number;
}

/** The hand moves after note splitIndex - 1 and must land on splitIndex. */
export function shiftRegionFromOnsets(
  points: readonly ScrubPoint[],
  splitIndex: number,
): ShiftRegion | null {
  const safeSplit = Math.trunc(splitIndex);
  const before = points[safeSplit - 1];
  const after = points[safeSplit];
  if (!before || !after || after.x <= before.x) return null;
  const gap = after.x - before.x;
  const inset = Math.min(9, gap * 0.16);
  const startX = before.x + inset;
  const endX = after.x - inset;
  return {
    startX,
    endX: Math.max(startX + 1, endX),
    centerX: (before.x + after.x) / 2,
  };
}

/**
 * One horizontal line of notation. A piece that fits on one line has exactly
 * one of these; a wrapped multi-line piece (see `CueSpec.measuresPerSystem`)
 * has one per line, each with its own local beat-to-pixel scale and its own
 * vertical band, plus a `startBeat` that place it on the piece's one shared,
 * continuous beat timeline — the same global `beat` the scrubber is driven
 * with — so `seekToBeat` can find which system a given moment belongs to.
 */
interface SystemLayout {
  startBeat: number;
  totalBeats: number;
  points: ScrubPoint[];
  startX: number;
  endX: number;
  top: number;
  bottom: number;
}

function headWidth(cue: CueSpec, compact: boolean): number {
  const accidentals = cue.keySignature ? (KEY_ACCIDENTALS[cue.keySignature] ?? 0) : 0;
  const scale = compact ? 0.8 : 1;
  return CLEF_WIDTH * scale + accidentals * ACCIDENTAL_WIDTH * scale +
    (cue.timeSignature ? TIME_SIG_WIDTH * scale : 0);
}

function beatsPerBarOf(cue: CueSpec): number {
  if (!cue.timeSignature) return 0; // 0 disables barlines
  const top = Number(cue.timeSignature.split('/')[0]);
  return Number.isFinite(top) && top > 0 ? top : 0;
}

/** Indices in the note list that should be preceded by a barline. */
function barlineBefore(notes: { duration: string }[], beatsPerBar: number): Set<number> {
  const marks = new Set<number>();
  if (beatsPerBar <= 0) return marks;
  let beat = 0;
  notes.forEach((note, i) => {
    if (i > 0 && beat > 0 && Math.abs(beat % beatsPerBar) < 1e-6) marks.add(i);
    beat += beatsForDuration(note.duration);
  });
  return marks;
}

/** Split only between notes, on measured beat boundaries whenever possible. */
export function splitNotesIntoSystems(notes: readonly CueNote[], maxBeats: number): CueNote[][] {
  if (!Number.isFinite(maxBeats) || maxBeats <= 0) return [notes.slice()];
  const chunks: CueNote[][] = [];
  let chunk: CueNote[] = [];
  let beats = 0;

  notes.forEach((note) => {
    const noteBeats = Math.max(0, beatsForDuration(note.duration));
    if (chunk.length > 0 && beats + noteBeats > maxBeats + 1e-6) {
      chunks.push(chunk);
      chunk = [];
      beats = 0;
    }
    chunk.push(note);
    beats += noteBeats;
    if (beats >= maxBeats - 1e-6) {
      chunks.push(chunk);
      chunk = [];
      beats = 0;
    }
  });
  if (chunk.length > 0) chunks.push(chunk);
  return chunks.length > 0 ? chunks : [[]];
}

/** One beat always occupies one equal fraction of the timeline. */
export function timelineXForBeat(
  startX: number,
  endX: number,
  totalBeats: number,
  beat: number,
): number {
  if (!Number.isFinite(totalBeats) || totalBeats <= 0) return startX;
  const progress = Math.min(1, Math.max(0, beat / totalBeats));
  return startX + progress * (endX - startX);
}

/**
 * Resolve scrubber bounds from the noteheads after VexFlow has drawn them.
 * TickContext X values can be relative before draw while getAbsoluteX() is
 * in SVG coordinates afterwards. Mixing those spaces made the line travel a
 * longer distance than the notes and therefore appear too slow.
 */
export function scrubberBoundsFromOnsets(
  points: readonly ScrubPoint[],
  totalBeats: number,
  fallbackStart: number,
  fallbackEnd: number,
): { startX: number; endX: number } {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2 || last.beat <= first.beat) {
    return { startX: first?.x ?? fallbackStart, endX: fallbackEnd };
  }
  const pixelsPerBeat = (last.x - first.x) / (last.beat - first.beat);
  if (!Number.isFinite(pixelsPerBeat) || pixelsPerBeat <= 0) {
    return { startX: first.x, endX: fallbackEnd };
  }
  const projectedEnd = first.x + pixelsPerBeat * totalBeats;
  return {
    startX: first.x,
    // getAbsoluteX() includes VexFlow's internal notehead offsets, while the
    // projected endpoint is extrapolated from onset spacing. A few glyphs
    // can therefore push that projection beyond the designed notation area.
    // The scrubber owns the timeline, never the right gutter or SVG padding.
    endX: Math.max(first.x, Math.min(fallbackEnd, projectedEnd)),
  };
}

/**
 * Put noteheads on the exact same beat-to-pixel scale as the scrubber.
 * A half note therefore owns twice the horizontal time of a quarter note,
 * and an eighth owns half. VexFlow still calculates modifier widths and a
 * collision-safe first position; only rhythmic X placement is normalized.
 */
function distributeNotesByTime(
  notes: InstanceType<typeof StaveNote>[],
  durations: string[],
  timelineWidth: number,
): { startX: number; endX: number; totalBeats: number } | null {
  if (notes.length === 0) return null;
  const contexts = notes.map((note) => note.getTickContext());
  const firstX = contexts[0].getX();
  const totalBeats = durations.reduce((sum, duration) => sum + beatsForDuration(duration), 0);
  // TickContext X is VOICE-LOCAL before draw. `timelineWidth` is deliberately
  // local too; passing the stave's absolute right edge here mixed coordinate
  // spaces, pushed noteheads farther right than their beat positions, and
  // made the correctly clocked scrubber appear to lag behind them.
  const endX = Math.max(firstX + 1, timelineWidth);
  if (!Number.isFinite(firstX) || totalBeats <= 0) return null;

  let beat = 0;
  contexts.forEach((context, index) => {
    context.setX(timelineXForBeat(firstX, endX, totalBeats, beat));
    beat += beatsForDuration(durations[index]);
  });

  return { startX: firstX, endX, totalBeats };
}

export const StaffCue = forwardRef<StaffCueHandle, StaffCueProps>(function StaffCue(
  {
    cue,
    accentColor = '#f97316',
    inkColor = '#171b22',
    successPitches = [],
    successColor = '#2f9868',
    shiftMarker,
    minimumTimelineBeats = 0,
    compact = false,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<SystemLayout[] | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);
  const trailRef = useRef<SVGRectElement | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const successPitchKey = [...successPitches].sort().join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateWidth = () => {
      const next = Math.round(host.getBoundingClientRect().width);
      setHostWidth((current) => current === next ? current : next);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seekToBeat(beat: number) {
        const systems = layoutRef.current;
        const line = lineRef.current;
        const trail = trailRef.current;
        if (!systems || systems.length === 0 || !line || !trail) return;
        const first = systems[0];

        if (beat < 0) {
          // During the two-measure count-in the cursor is visible but parked
          // at the first playable point. That makes the waiting state clear
          // without implying that any written time has elapsed.
          line.setAttribute('opacity', '1');
          line.setAttribute('x1', String(first.startX));
          line.setAttribute('x2', String(first.startX));
          line.setAttribute('y1', String(first.top));
          line.setAttribute('y2', String(first.bottom));
          trail.setAttribute('opacity', '1');
          trail.setAttribute('x', String(first.startX));
          trail.setAttribute('y', String(first.top));
          trail.setAttribute('height', String(first.bottom - first.top));
          trail.setAttribute('width', '0');
          return;
        }

        // Multi-line pieces need the right system, not just the right X —
        // each line has its own vertical band, so crossing into the next
        // system moves the cursor down as well as back to the left margin.
        let system = systems.find((s) => beat >= s.startBeat && beat < s.startBeat + s.totalBeats);
        if (!system) system = beat < first.startBeat ? first : systems[systems.length - 1];

        const x = timelineXForBeat(system.startX, system.endX, system.totalBeats, beat - system.startBeat);
        line.setAttribute('opacity', '1');
        line.setAttribute('x1', String(x));
        line.setAttribute('x2', String(x));
        line.setAttribute('y1', String(system.top));
        line.setAttribute('y2', String(system.bottom));

        trail.setAttribute('opacity', '1');
        trail.setAttribute('x', String(system.startX));
        trail.setAttribute('y', String(system.top));
        trail.setAttribute('height', String(system.bottom - system.top));
        trail.setAttribute('width', String(Math.max(0, x - system.startX)));
      },
      hide() {
        lineRef.current?.setAttribute('opacity', '0');
        trailRef.current?.setAttribute('opacity', '0');
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const completedMidi = new Set(
      successPitchKey
        .split('|')
        .filter(Boolean)
        .map((pitch) => pitchToMidi(pitch))
        .filter((midi): midi is number => midi !== null),
    );

    host.innerHTML = '';
    layoutRef.current = null;
    lineRef.current = null;
    trailRef.current = null;

    const beatsPerBar = beatsPerBarOf(cue);
    const measuredHostWidth = hostWidth || host.getBoundingClientRect().width;
    const narrowFullScore = !compact && measuredHostWidth <= 520;
    const perBeat = compact ? 44 : narrowFullScore ? 54 : PER_BEAT;
    const minPerNote = compact ? 38 : narrowFullScore ? 44 : MIN_PER_NOTE;
    const perBarline = compact ? 22 : narrowFullScore ? 24 : PER_BARLINE;
    const minStaveWidth = compact ? 218 : narrowFullScore ? 236 : MIN_STAVE_W;
    const noteRightGutter = compact ? 30 : narrowFullScore ? 32 : NOTE_RIGHT_GUTTER;
    const boundsPadX = compact ? 24 : narrowFullScore ? 22 : BOUNDS_PAD_X;
    const longestStaffBeats = cue.staves.reduce(
      (largest, staff) => Math.max(
        largest,
        staff.notes.reduce((sum, note) => sum + beatsForDuration(note.duration), 0),
      ),
      0,
    );
    // On phones, one wide two-measure SVG makes otherwise normal notation
    // unreadably small. Reflow full-size scores to one measured bar per line;
    // compact split-card scores keep their purpose-built layout.
    const responsiveMeasuresPerSystem = narrowFullScore &&
      beatsPerBar > 0 && longestStaffBeats > beatsPerBar
      ? 1
      : undefined;
    const measuresPerSystem = cue.measuresPerSystem ?? responsiveMeasuresPerSystem;
    const beatsPerSystem = measuresPerSystem
      ? measuresPerSystem * Math.max(1, beatsPerBar)
      : Infinity;
    const systemsByStaff = cue.staves.map((staff) =>
      splitNotesIntoSystems(staff.notes, beatsPerSystem));
    const systemCount = Math.max(1, ...systemsByStaff.map((chunks) => chunks.length));
    const systemStartBeats: number[] = [];
    let runningSystemBeat = 0;
    (systemsByStaff[0] ?? [[]]).forEach((notes) => {
      systemStartBeats.push(runningSystemBeat);
      runningSystemBeat += notes.reduce(
        (sum, note) => sum + beatsForDuration(note.duration),
        0,
      );
    });
    const staffSegments = systemsByStaff.flat();
    const maxTimelineWidth = Math.max(
      Math.max(0, minimumTimelineBeats) * perBeat,
      staffSegments.reduce((largest, notes) => {
        const durations = notes.map((note) => beatsForDuration(note.duration));
        const total = durations.reduce((sum, beats) => sum + beats, 0);
        // Only intervals before another note need collision spacing; the last
        // duration owns visual tail room but has no following notehead.
        const steps = durations.slice(0, -1).filter((beats) => beats > 0);
        const shortestStep = steps.length > 0 ? Math.min(...steps) : Math.max(1, total);
        // Subdivision glyphs are naturally narrower than quarter/half-note
        // spacing. Keep them collision-safe without making one sixteenth
        // group shrink the entire responsive staff to postage-stamp size.
        const perStep = shortestStep <= 0.25
          ? 30
          : shortestStep <= 0.5
            ? 38
            : minPerNote;
        const collisionSafe = (total / shortestStep) * perStep;
        return Math.max(largest, total * perBeat, collisionSafe);
      }, 1),
    );
    const barCount = staffSegments.reduce(
      (n, notes) => Math.max(n, barlineBefore(notes, beatsPerBar).size),
      0,
    );
    // Do not cap dense music to an arbitrary width. The responsive SVG will
    // scale a wider staff down, while VexFlow retains the real engraving
    // space needed by every note and modifier.
    const staveWidth = Math.max(
      minStaveWidth,
      headWidth(cue, compact) + maxTimelineWidth + barCount * perBarline + noteRightGutter,
    );
    const canvasWidth = staveWidth + STAVE_X * 2;

    const staffCountPerSystem = Math.max(1, cue.staves.length);
    // Extra clearance below one system's last staff before the next
    // system's first staff — bigger than STAVE_GAP (which only separates
    // treble from bass within one grand staff) so ledger lines and finger
    // annotations from consecutive systems never crowd each other.
    const SYSTEM_GAP = STAVE_GAP + 96;
    const systemHeight = (staffCountPerSystem - 1) * STAVE_GAP + SYSTEM_GAP;
    const canvasHeight = systemCount <= 1
      ? CANVAS_H
      : STAVE_TOP + (systemCount - 1) * systemHeight + (staffCountPerSystem - 1) * STAVE_GAP + 300;

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(canvasWidth, canvasHeight);
    const context = renderer.getContext();
    context.setFont('Inter, Roboto, sans-serif', 15);

    const barlineXs: { x: number; top: number; bottom: number }[] = [];
    const systems: SystemLayout[] = [];
    let shiftRegion: (ShiftRegion & { top: number; bottom: number }) | null = null;

    for (let systemIndex = 0; systemIndex < systemCount; systemIndex += 1) {
      const drawnStavesInSystem: any[] = [];
      const systemBarlines: { x: number; top: number; bottom: number }[] = [];
      const systemStartBeat = systemStartBeats[systemIndex] ?? 0;

      cue.staves.forEach((staffSpec: StaffSpec, staffIndex: number) => {
        const notesForSystem = systemsByStaff[staffIndex][systemIndex] ?? [];
        if (notesForSystem.length === 0) return;

        const stave = new Stave(
          STAVE_X,
          STAVE_TOP + systemIndex * systemHeight + staffIndex * STAVE_GAP,
          staveWidth,
        );

        // Clef, then key, then time — the frame a student reads in a method
        // book. Every system restates clef and key (a reader who lands
        // mid-system should never lose track of either), but the time
        // signature is conventionally shown only once, at the very start.
        stave.addClef(staffSpec.clef);
        if (cue.keySignature) stave.addKeySignature(cue.keySignature);
        if (cue.timeSignature && systemIndex === 0) stave.addTimeSignature(cue.timeSignature);

        stave.setBegBarType(Vex.Flow.Barline.type.SINGLE);
        stave.setEndBarType(Vex.Flow.Barline.type.END);
        (stave as any).setStyle({ strokeStyle: inkColor, fillStyle: inkColor, lineWidth: 1.5 });
        stave.setContext(context).draw();
        drawnStavesInSystem.push(stave);

        const marks = barlineBefore(notesForSystem, beatsPerBar);

        const staveNotes = notesForSystem.map((cueNote) => {
          const note = new StaveNote({
            keys: cueNote.keys,
            duration: cueNote.duration,
            clef: staffSpec.clef,
          });

          // The duration parser gives `hd`, `qd`, etc. their correct number of
          // ticks, but VexFlow does not draw the matching glyph dot unless the
          // Dot modifier is attached. Without this, later lessons sounded and
          // graded three beats while showing an undotted two-beat half note.
          const dotCount = (cueNote.duration.replace(/r$/, '').match(/d+$/)?.[0].length ?? 0);
          for (let dot = 0; dot < dotCount; dot += 1) {
            // Runtime is VexFlow 4; the installed legacy declaration package
            // omits this V4 static helper even though the implementation ships.
            (Dot as any).buildAndAttach([note], { all: true });
          }

          // A rest's `keys` is only ever a staff-line placeholder (see
          // twoHandStandardQuestion in progressiveCurriculum.ts) — it must
          // never be compared against completedMidi, or a rest could get
          // colored as "played" purely by coincidence with its placeholder
          // pitch.
          const completed = !cueNote.duration.endsWith('r') && cueNote.keys.some((key) => {
            const match = /^([a-g](?:#|b)?)\/(-?\d+)$/i.exec(key);
            if (!match) return false;
            const scientific = `${match[1][0].toUpperCase()}${match[1].slice(1)}${match[2]}`;
            const midi = pitchToMidi(scientific);
            return midi !== null && completedMidi.has(midi);
          });
          const color = completed ? successColor : cueNote.anchor ? accentColor : inkColor;
          (note as any).setStyle({ strokeStyle: color, fillStyle: color, lineWidth: 1.5 });

          if (cueNote.finger !== undefined) {
            const placement =
              staffSpec.hand === 'right'
                ? Annotation.VerticalJustify.TOP
                : Annotation.VerticalJustify.BOTTOM;

            const annotation = new Annotation(String(cueNote.finger))
              .setVerticalJustification(placement)
              .setFont('Inter, Roboto, sans-serif', 17, '700');
            // Annotation inherits Element.setStyle at runtime, but VexFlow 4's
            // declaration omits it from Annotation. Keep the runtime styling
            // while containing the typing gap here.
            (annotation as any).setStyle({ strokeStyle: color, fillStyle: color });
            note.addModifier(annotation, 0);
          }

          return note;
        });

        const voice = new Voice({ num_beats: 4, beat_value: 4 })
          .setStrict(false)
          .addTickables(staveNotes);

        Accidental.applyAccidentals([voice], cue.keySignature ?? 'C');

        const noteStart = stave.getNoteStartX();
        const noteEnd = stave.getX() + stave.getWidth();
        const timelineEnd = noteEnd - noteRightGutter;
        const formatWidth = Math.max(110, timelineEnd - noteStart);

        new Formatter().joinVoices([voice]).format([voice], formatWidth);
        const beams = Beam.generateBeams(staveNotes);
        const timeline = distributeNotesByTime(
          staveNotes,
          notesForSystem.map((note) => note.duration),
          formatWidth,
        );
        voice.draw(context, stave);
        beams.forEach((beam) => beam.setContext(context).draw());

        // Barlines.
        //
        // VexFlow 4's BarNote emits nothing when added as a tickable to a
        // non-strict voice — verified: no vf-barnote element reaches the SVG.
        // Drawing them directly is deterministic and needs no cooperation from
        // the formatter. Each sits midway between the last note of one measure
        // and the first of the next, which is where an engraver would put it.
        //
        // X positions are taken from the FIRST staff of THIS system only,
        // same authoritative timeline the scrubber below uses — every staff
        // shares one formatWidth and one written beat grid, so both staves'
        // bars land at (as good as) identical X already. Height is fixed up
        // to span every staff in the system right after this staff loop, so
        // a two-hand grand staff gets one continuous barline through both
        // staves instead of two short, disconnected ones.
        if (marks.size > 0 && staffIndex === 0) {
          const top = stave.getYForLine(0);
          const bottom = stave.getYForLine(4);
          marks.forEach((index) => {
            const after = staveNotes[index];
            const before = staveNotes[index - 1];
            if (!after || !before) return;
            // The next note begins exactly on the measure boundary. Leave a
            // small engraving gap before it without changing its timed X.
            const previousX = before.getAbsoluteX();
            const nextX = after.getAbsoluteX();
            const x = nextX - Math.min(10, Math.max(4, (nextX - previousX) * 0.16));
            systemBarlines.push({ x, top, bottom });
          });
        }

        // Capture the scrubber track from the FIRST staff of THIS system
        // only, after formatting — getAbsoluteX is meaningless before the
        // formatter runs.
        if (staffIndex === 0) {
          const points: ScrubPoint[] = [];
          let beat = 0;
          staveNotes.forEach((note, i) => {
            points.push({ beat, x: note.getAbsoluteX() });
            beat += beatsForDuration(notesForSystem[i].duration);
          });
          const totalBeats = timeline?.totalBeats ?? Math.max(beat, points.length);
          const scrubberBounds = scrubberBoundsFromOnsets(
            points,
            totalBeats,
            timeline?.startX ?? noteStart,
            // The extrapolated timed endpoint may occupy the reserved final
            // note gutter, but can never cross the stave's actual end barline.
            noteEnd,
          );
          systems.push({
            startBeat: systemStartBeat,
            totalBeats,
            points,
            startX: scrubberBounds.startX,
            endX: scrubberBounds.endX,
            top: stave.getYForLine(0) - SCRUB_OVERHANG,
            bottom: stave.getYForLine(4) + SCRUB_OVERHANG,
          });
          // Only ever meaningful in the single-system case — anchor-shift
          // exercises never set `measuresPerSystem` — same as before.
          const resolvedShift = shiftMarker
            ? shiftRegionFromOnsets(points, shiftMarker.splitIndex)
            : null;
          if (resolvedShift) {
            shiftRegion = {
              ...resolvedShift,
              top: stave.getYForLine(0) - 25,
              bottom: stave.getYForLine(4) + 25,
            };
          }
        }
      });

      // Extend this system's barlines and scrubber band down through every
      // staff IN THIS SYSTEM — both were captured against the first (top)
      // staff alone above, which is correct for a single staff but left a
      // two-hand grand staff with a marker that stopped at the bottom of the
      // treble staff instead of reaching the bass staff underneath it.
      if (drawnStavesInSystem.length > 1) {
        const lastStave = drawnStavesInSystem[drawnStavesInSystem.length - 1];
        const systemBottom = lastStave.getYForLine(4);
        systemBarlines.forEach((bar) => { bar.bottom = systemBottom; });
        const thisSystemLayout = systems[systems.length - 1];
        if (thisSystemLayout && thisSystemLayout.startBeat === systemStartBeat) {
          thisSystemLayout.bottom = systemBottom + SCRUB_OVERHANG;
        }
      }
      barlineXs.push(...systemBarlines);

      if (drawnStavesInSystem.length === 2) {
        const [top, bottom] = drawnStavesInSystem;
        (['BRACE', 'SINGLE_LEFT', 'SINGLE_RIGHT'] as const).forEach((kind) => {
          new StaveConnector(top, bottom)
            .setType(StaveConnector.type[kind])
            .setContext(context)
            .draw();
        });
      }
    }

    const svg = host.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    barlineXs.forEach(({ x, top, bottom }) => {
      const bar = document.createElementNS(SVG_NS, 'line');
      bar.setAttribute('x1', String(x));
      bar.setAttribute('x2', String(x));
      bar.setAttribute('y1', String(top));
      bar.setAttribute('y2', String(bottom));
      bar.setAttribute('stroke', inkColor);
      bar.setAttribute('stroke-width', '1.6');
      bar.setAttribute('class', 'et-barline');
      svg.appendChild(bar);
    });

    if (shiftRegion && shiftMarker) {
      const resolvedShift = shiftRegion as ShiftRegion & { top: number; bottom: number };
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'et-shift-marker');
      group.setAttribute('pointer-events', 'none');

      const zone = document.createElementNS(SVG_NS, 'rect');
      zone.setAttribute('x', String(resolvedShift.startX));
      zone.setAttribute('y', String(resolvedShift.top));
      zone.setAttribute('width', String(resolvedShift.endX - resolvedShift.startX));
      zone.setAttribute('height', String(resolvedShift.bottom - resolvedShift.top));
      zone.setAttribute('rx', '8');
      zone.setAttribute('fill', '#6f63d9');
      zone.setAttribute('fill-opacity', '0.085');
      zone.setAttribute('stroke', '#6f63d9');
      zone.setAttribute('stroke-opacity', '0.38');
      zone.setAttribute('stroke-width', '1.4');
      zone.setAttribute('stroke-dasharray', '5 5');
      group.appendChild(zone);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(resolvedShift.centerX));
      label.setAttribute('y', String(resolvedShift.top - 8));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#5549b4');
      label.setAttribute('font-family', 'Inter, Roboto, sans-serif');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '800');
      label.setAttribute('letter-spacing', '1.1');
      label.textContent = 'MOVE';
      group.appendChild(label);

      svg.appendChild(group);
      svg.setAttribute(
        'aria-label',
        `Music moving from ${shiftMarker.fromPositionName} to ${shiftMarker.toPositionName}. The purple zone marks the hand movement.`,
      );
    }

    // Scrubber. Drawn INSIDE the SVG so it shares the notation's coordinate
    // space — no unit conversion, and it scales with the staff for free.
    // Starts parked on the first system; `seekToBeat` moves it — including
    // between systems, for a wrapped multi-line piece — from there.
    if (systems.length > 0) {
      const first = systems[0];

      const trail = document.createElementNS(SVG_NS, 'rect');
      trail.setAttribute('x', String(first.startX));
      trail.setAttribute('y', String(first.top));
      trail.setAttribute('width', '0');
      trail.setAttribute('height', String(first.bottom - first.top));
      trail.setAttribute('fill', accentColor);
      trail.setAttribute('opacity', '0');
      trail.setAttribute('pointer-events', 'none');
      trail.setAttribute('class', 'et-scrub__trail');
      svg.appendChild(trail);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(first.startX));
      line.setAttribute('x2', String(first.startX));
      line.setAttribute('y1', String(first.top));
      line.setAttribute('y2', String(first.bottom));
      line.setAttribute('stroke', accentColor);
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', '0');
      line.setAttribute('pointer-events', 'none');
      line.setAttribute('class', 'et-scrub__line');
      svg.appendChild(line);

      trailRef.current = trail;
      lineRef.current = line;
      layoutRef.current = systems;
    }

    // Measure what was drawn, then crop to it. Nothing can clip, however far
    // ledger lines, accidentals, annotations or the scrubber extend.
    let box = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    try {
      const measured = svg.getBBox();
      if (measured.width > 0 && measured.height > 0) box = measured;
    } catch {
      // getBBox needs a live layout (unavailable in SSR/jsdom).
      // The full canvas is a safe superset — over-wide, never clipped.
    }

    // Keep the full designed horizontal canvas as a minimum, then union it
    // with measured overflow. This protects against browsers that omit a
    // late-loading annotation font from getBBox(), while the larger X pad
    // also covers stroke width and sub-pixel rounding at the right edge.
    const boundsLeft = Math.min(0, box.x);
    const boundsRight = Math.max(canvasWidth, box.x + box.width);
    const viewBoxWidth = boundsRight - boundsLeft + boundsPadX * 2;
    const viewBoxHeight = box.height + BOUNDS_PAD_Y * 2;
    svg.setAttribute(
      'viewBox',
      `${boundsLeft - boundsPadX} ${box.y - BOUNDS_PAD_Y} ${viewBoxWidth} ${viewBoxHeight}`,
    );
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Give the SVG an intrinsic size equal to its own viewBox (1 SVG unit =
    // 1 CSS px) instead of leaving width/height unset, which the container
    // CSS used to stretch to 100% of the card on every exercise. That made
    // notehead size a function of note COUNT: a 3-note phrase and a
    // 12-note one were forced into the same box, so the busier exercise's
    // notes rendered visibly smaller. With explicit width/height here,
    // `.et-staff svg`'s `width:auto;height:auto;max-width:100%;max-height:
    // 100%` (staff-cue.css) renders every exercise at the same true
    // engraving scale, only shrinking proportionally if content is wider
    // than the card can hold at all — never as a function of note count.
    svg.setAttribute('width', String(viewBoxWidth));
    svg.setAttribute('height', String(viewBoxHeight));
    // Renderer.resize() writes the original full-canvas dimensions as inline
    // styles. Attributes alone do not override those styles, so the cropped
    // score was being letterboxed inside a hidden 560px-tall SVG and looked
    // tiny on phones and split shift cards. Removing those stale declarations
    // lets the measured width/height attributes preserve the viewBox ratio.
    svg.style.removeProperty('width');
    svg.style.removeProperty('height');
    svg.setAttribute('role', 'img');
    svg.setAttribute('focusable', 'false');

    return () => {
      host.innerHTML = '';
      layoutRef.current = null;
      lineRef.current = null;
      trailRef.current = null;
    };
  }, [cue, accentColor, compact, hostWidth, inkColor, successPitchKey, successColor, shiftMarker, minimumTimelineBeats]);

  return <div className="et-staff" ref={hostRef} />;
});

export default StaffCue;
