import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as Vex from 'vexflow';
const {
  Accidental,
  Annotation,
  Beam,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} = Vex.Flow;
import type { CueSpec, StaffSpec } from '../curriculum/types';
import { beatsForDuration } from '../audio/timing';
import './staff-cue.css';

export interface StaffCueProps {
  cue: CueSpec;
  accentColor?: string;
  inkColor?: string;
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

interface Layout {
  points: ScrubPoint[];
  startX: number;
  endX: number;
  totalBeats: number;
  top: number;
  bottom: number;
}

function headWidth(cue: CueSpec): number {
  const accidentals = cue.keySignature ? (KEY_ACCIDENTALS[cue.keySignature] ?? 0) : 0;
  return CLEF_WIDTH + accidentals * ACCIDENTAL_WIDTH + (cue.timeSignature ? TIME_SIG_WIDTH : 0);
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

/** Constant-velocity mapping across the same beat scale used for engraving. */
function xForBeat(layout: Layout, beat: number): number {
  return timelineXForBeat(layout.startX, layout.endX, layout.totalBeats, beat);
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
  timelineEndX: number,
): { startX: number; endX: number; totalBeats: number } | null {
  if (notes.length === 0) return null;
  const contexts = notes.map((note) => note.getTickContext());
  const firstX = contexts[0].getX();
  const totalBeats = durations.reduce((sum, duration) => sum + beatsForDuration(duration), 0);
  const endX = Math.max(firstX + 1, timelineEndX);
  if (!Number.isFinite(firstX) || totalBeats <= 0) return null;

  let beat = 0;
  contexts.forEach((context, index) => {
    context.setX(timelineXForBeat(firstX, endX, totalBeats, beat));
    beat += beatsForDuration(durations[index]);
  });

  return { startX: firstX, endX, totalBeats };
}

export const StaffCue = forwardRef<StaffCueHandle, StaffCueProps>(function StaffCue(
  { cue, accentColor = '#f97316', inkColor = '#171b22' },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);
  const trailRef = useRef<SVGRectElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      seekToBeat(beat: number) {
        const layout = layoutRef.current;
        const line = lineRef.current;
        const trail = trailRef.current;
        if (!layout || !line || !trail) return;

        if (beat < 0) {
          line.setAttribute('opacity', '0');
          trail.setAttribute('opacity', '0');
          return;
        }

        const x = xForBeat(layout, beat);
        line.setAttribute('opacity', '1');
        line.setAttribute('x1', String(x));
        line.setAttribute('x2', String(x));

        trail.setAttribute('opacity', '1');
        trail.setAttribute('width', String(Math.max(0, x - layout.startX)));
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

    host.innerHTML = '';
    layoutRef.current = null;
    lineRef.current = null;
    trailRef.current = null;

    const beatsPerBar = beatsPerBarOf(cue);
    const maxTimelineWidth = cue.staves.reduce(
      (largest, staff) => {
        const durations = staff.notes.map((note) => beatsForDuration(note.duration));
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
            : MIN_PER_NOTE;
        const collisionSafe = (total / shortestStep) * perStep;
        return Math.max(largest, total * PER_BEAT, collisionSafe);
      },
      1,
    );
    const barCount = cue.staves.reduce(
      (n, s) => Math.max(n, barlineBefore(s.notes, beatsPerBar).size),
      0,
    );
    // Do not cap dense music to an arbitrary width. The responsive SVG will
    // scale a wider staff down, while VexFlow retains the real engraving
    // space needed by every note and modifier.
    const staveWidth = Math.max(
      MIN_STAVE_W,
      headWidth(cue) + maxTimelineWidth + barCount * PER_BARLINE + NOTE_RIGHT_GUTTER,
    );
    const canvasWidth = staveWidth + STAVE_X * 2;

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(canvasWidth, CANVAS_H);
    const context = renderer.getContext();
    context.setFont('Inter, Roboto, sans-serif', 15);

    const drawnStaves: any[] = [];
    const barlineXs: { x: number; top: number; bottom: number }[] = [];
    let layout: Layout | null = null;

    cue.staves.forEach((staffSpec: StaffSpec, staffIndex: number) => {
      const stave = new Stave(STAVE_X, STAVE_TOP + staffIndex * STAVE_GAP, staveWidth);

      // Clef, then key, then time — the frame a student reads in a method book.
      stave.addClef(staffSpec.clef);
      if (cue.keySignature) stave.addKeySignature(cue.keySignature);
      if (cue.timeSignature) stave.addTimeSignature(cue.timeSignature);

      stave.setBegBarType(Vex.Flow.Barline.type.SINGLE);
      stave.setEndBarType(Vex.Flow.Barline.type.END);
      (stave as any).setStyle({ strokeStyle: inkColor, fillStyle: inkColor, lineWidth: 1.5 });
      stave.setContext(context).draw();
      drawnStaves.push(stave);

      const marks = barlineBefore(staffSpec.notes, beatsPerBar);

      const staveNotes = staffSpec.notes.map((cueNote) => {
        const note = new StaveNote({
          keys: cueNote.keys,
          duration: cueNote.duration,
          clef: staffSpec.clef,
        });

        const color = cueNote.anchor ? accentColor : inkColor;
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

      if (staveNotes.length === 0) return;

      const voice = new Voice({ num_beats: 4, beat_value: 4 })
        .setStrict(false)
        .addTickables(staveNotes);

      Accidental.applyAccidentals([voice], cue.keySignature ?? 'C');

      const noteStart = stave.getNoteStartX();
      const noteEnd = stave.getX() + stave.getWidth();
      const timelineEnd = noteEnd - NOTE_RIGHT_GUTTER;
      const formatWidth = Math.max(110, timelineEnd - noteStart);

      new Formatter().joinVoices([voice]).format([voice], formatWidth);
      const beams = Beam.generateBeams(staveNotes);
      const timeline = distributeNotesByTime(
        staveNotes,
        staffSpec.notes.map((note) => note.duration),
        timelineEnd,
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
      if (marks.size > 0) {
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
          barlineXs.push({ x, top, bottom });
        });
      }

      // Capture the scrubber track from the FIRST staff only, after
      // formatting — getAbsoluteX is meaningless before the formatter runs.
      if (staffIndex === 0) {
        const points: ScrubPoint[] = [];
        let beat = 0;
        staveNotes.forEach((note, i) => {
          points.push({ beat, x: note.getAbsoluteX() });
          beat += beatsForDuration(staffSpec.notes[i].duration);
        });
        const totalBeats = timeline?.totalBeats ?? Math.max(beat, points.length);
        const scrubberBounds = scrubberBoundsFromOnsets(
          points,
          totalBeats,
          timeline?.startX ?? noteStart,
          timeline?.endX ?? timelineEnd,
        );
        layout = {
          points,
          startX: scrubberBounds.startX,
          endX: scrubberBounds.endX,
          totalBeats,
          top: stave.getYForLine(0) - SCRUB_OVERHANG,
          bottom: stave.getYForLine(4) + SCRUB_OVERHANG,
        };
      }
    });

    if (drawnStaves.length === 2) {
      const [top, bottom] = drawnStaves;
      (['BRACE', 'SINGLE_LEFT', 'SINGLE_RIGHT'] as const).forEach((kind) => {
        new StaveConnector(top, bottom)
          .setType(StaveConnector.type[kind])
          .setContext(context)
          .draw();
      });
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

    // Scrubber. Drawn INSIDE the SVG so it shares the notation's coordinate
    // space — no unit conversion, and it scales with the staff for free.
    if (layout) {
      const resolved: Layout = layout;

      const trail = document.createElementNS(SVG_NS, 'rect');
      trail.setAttribute('x', String(resolved.startX));
      trail.setAttribute('y', String(resolved.top));
      trail.setAttribute('width', '0');
      trail.setAttribute('height', String(resolved.bottom - resolved.top));
      trail.setAttribute('fill', accentColor);
      trail.setAttribute('opacity', '0');
      trail.setAttribute('pointer-events', 'none');
      trail.setAttribute('class', 'et-scrub__trail');
      svg.appendChild(trail);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(resolved.startX));
      line.setAttribute('x2', String(resolved.startX));
      line.setAttribute('y1', String(resolved.top));
      line.setAttribute('y2', String(resolved.bottom));
      line.setAttribute('stroke', accentColor);
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('opacity', '0');
      line.setAttribute('pointer-events', 'none');
      line.setAttribute('class', 'et-scrub__line');
      svg.appendChild(line);

      trailRef.current = trail;
      lineRef.current = line;
      layoutRef.current = resolved;
    }

    // Measure what was drawn, then crop to it. Nothing can clip, however far
    // ledger lines, accidentals, annotations or the scrubber extend.
    let box = { x: 0, y: 0, width: canvasWidth, height: CANVAS_H };
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
    svg.setAttribute(
      'viewBox',
      `${boundsLeft - BOUNDS_PAD_X} ${box.y - BOUNDS_PAD_Y} ${boundsRight - boundsLeft + BOUNDS_PAD_X * 2} ${box.height + BOUNDS_PAD_Y * 2}`,
    );
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    svg.setAttribute('focusable', 'false');

    return () => {
      host.innerHTML = '';
      layoutRef.current = null;
      lineRef.current = null;
      trailRef.current = null;
    };
  }, [cue, accentColor, inkColor]);

  return <div className="et-staff" ref={hostRef} />;
});

export default StaffCue;
