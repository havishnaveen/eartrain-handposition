import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as OSMDModule from 'opensheetmusicdisplay';
import type { AnchorShiftSpec, CueNote, CueSpec, StaffSpec } from '../curriculum/types';
import { beatsForDuration } from '../audio/timing';
import { cueSpecToMusicXML } from '../notation/cueSpecToMusicXML';
import './staff-cue.css';

const OpenSheetMusicDisplay = (OSMDModule as unknown as {
  OpenSheetMusicDisplay: new (container: HTMLElement, options?: Record<string, unknown>) => OSMDInstance;
}).OpenSheetMusicDisplay;

/**
 * Minimal shape of the parts of the real OSMD runtime API this component
 * uses. OSMD's own shipped type declarations for this package version do not
 * match its real published npm API (confirmed empirically — see the probe
 * scripts under scripts-testsuite/), so API usage here is typed narrowly
 * against what was verified to actually exist at runtime rather than trusted
 * from the (partly fabricated) vendored .d.ts tree.
 */
interface OSMDInstance {
  load(xml: string): Promise<void>;
  render(): void;
  GraphicSheet?: {
    MeasureList?: unknown[][];
  };
  EngravingRules?: Record<string, unknown>;
}

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
  /** Overrides notehead size without changing the surrounding card. Retained
   *  for prop-compatibility with callers; OSMD's own engraving already
   *  avoids the collisions this once compensated for, so it is currently
   *  inert (matching the old VexFlow renderer, where it was also unused). */
  noteGlyphScale?: number;
  /** Zooms the complete engraving—staff, clef, notes, and annotations—together. */
  notationScale?: number;
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const SCRUB_OVERHANG = 26;

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

/** Print meter only when the learner is actually reading a measure. */
export function shouldShowTimeSignature(cue: CueSpec): boolean {
  if (!cue.timeSignature) return false;
  if (cue.showTimeSignature !== undefined) return cue.showTimeSignature;
  const beatsPerBar = beatsPerBarOf(cue);
  if (beatsPerBar <= 0) return false;
  const soundedOnsets = new Set<string>();
  let totalBeats = 0;
  cue.staves.forEach((staff) => {
    let beat = 0;
    staff.notes.forEach((note) => {
      if (!note.duration.endsWith('r')) soundedOnsets.add(beat.toFixed(4));
      beat += beatsForDuration(note.duration);
    });
    totalBeats = Math.max(totalBeats, beat);
  });
  return soundedOnsets.size >= 4 && totalBeats >= beatsPerBar - 1e-6;
}

function beatsPerBarOf(cue: CueSpec): number {
  if (!cue.timeSignature) return 0; // 0 disables barlines/shift regions
  const top = Number(cue.timeSignature.split('/')[0]);
  return Number.isFinite(top) && top > 0 ? top : 0;
}

const KEY_ACCIDENTALS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6,
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6,
};
const CLEF_WIDTH = 62;
const ACCIDENTAL_WIDTH = 14;
const TIME_SIG_WIDTH = 30;
const PER_BEAT = 40;
const MIN_PER_NOTE = 30;
const MIN_STAVE_W = 260;
const NOTE_RIGHT_GUTTER = 44;

/**
 * OSMD (unlike a canvas-first renderer) sizes its SVG width from its host
 * container's own measured width — a container with no intrinsic size
 * (this one sits centered in a flex layout) collapses to 0 and OSMD then
 * renders a real, fully-populated but zero-width/invisible SVG. VexFlow's
 * old renderer sidestepped this by always computing an explicit pixel
 * width up front rather than reading one from the DOM; the same estimate
 * is reused here to give the OSMD host a real width before load()/render().
 * It does not need to be exact — OSMD reflows to fit whatever width it is
 * given — only large enough that dense phrases do not compress unreadably.
 */
function estimateStaveWidth(cue: CueSpec, compact: boolean): number {
  const accidentals = cue.keySignature ? (KEY_ACCIDENTALS[cue.keySignature] ?? 0) : 0;
  const scale = compact ? 0.8 : 1;
  const headWidth = CLEF_WIDTH * scale + accidentals * ACCIDENTAL_WIDTH * scale +
    (shouldShowTimeSignature(cue) ? TIME_SIG_WIDTH * scale : 0);
  const perBeat = compact ? 25 : PER_BEAT;
  const minPerNote = compact ? 25 : MIN_PER_NOTE;
  const minStaveWidth = compact ? 120 : MIN_STAVE_W;
  const noteRightGutter = compact ? 30 : NOTE_RIGHT_GUTTER;
  const maxTimelineWidth = cue.staves.reduce((largest, staff) => {
    const durations = staff.notes.map((note) => beatsForDuration(note.duration));
    const total = durations.reduce((sum, beats) => sum + beats, 0);
    const steps = durations.slice(0, -1).filter((beats) => beats > 0);
    const shortestStep = steps.length > 0 ? Math.min(...steps) : Math.max(1, total);
    const perStep = shortestStep <= 0.25 ? 30 : shortestStep <= 0.5 ? 38 : minPerNote;
    const collisionSafe = (total / Math.max(shortestStep, 1e-6)) * perStep;
    return Math.max(largest, total * perBeat, collisionSafe);
  }, 1);
  return Math.max(minStaveWidth, headWidth + maxTimelineWidth + noteRightGutter);
}

/** Wrap only between complete notes, using written beats rather than count. */
export function splitNotesIntoSystems<T extends { duration: string }>(
  notes: readonly T[],
  beatsPerSystem: number,
): T[][] {
  if (!Number.isFinite(beatsPerSystem) || beatsPerSystem <= 0) return [[...notes]];
  const systems: T[][] = [];
  let current: T[] = [];
  let currentBeats = 0;
  notes.forEach((note) => {
    const noteBeats = beatsForDuration(note.duration);
    if (current.length > 0 && currentBeats + noteBeats > beatsPerSystem + 1e-6) {
      systems.push(current);
      current = [];
      currentBeats = 0;
    }
    current.push(note);
    currentBeats += noteBeats;
    if (currentBeats >= beatsPerSystem - 1e-6) {
      systems.push(current);
      current = [];
      currentBeats = 0;
    }
  });
  if (current.length > 0) systems.push(current);
  return systems.length > 0 ? systems : [[]];
}

/** Prefer bass when a treble phrase would spend most of its time on ledger lines. */
export function recommendedClefForStaff(staff: StaffSpec): StaffSpec['clef'] {
  if (staff.clef !== 'treble') return staff.clef;
  const midi = staff.notes
    .filter((note) => !note.duration.endsWith('r'))
    .flatMap((note) => note.keys)
    .map((key) => {
      const match = /^([a-g](?:#|b)?)\/(-?\d+)$/i.exec(key);
      if (!match) return null;
      return pitchToMidiLocal(`${match[1][0].toUpperCase()}${match[1].slice(1)}${match[2]}`);
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (midi.length === 0) return staff.clef;
  const median = midi[Math.floor(midi.length / 2)];
  return midi[0] <= 57 && median < 60 ? 'bass' : staff.clef;
}

// Local copy to avoid importing pitchToMidi from audio/timing purely for
// this one clef heuristic; kept behaviorally identical.
function pitchToMidiLocal(scientific: string): number | null {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(scientific);
  if (!match) return null;
  const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const base = letters[match[1]];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]);
  return (octave + 1) * 12 + base + accidental;
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

/** Directions occupy their own layout row, never the note/fingering lanes. */
export function positionDirections(cue: CueSpec): string[] {
  const rows = new Map<number, string[]>();
  const meter = beatsPerBarOf(cue) || 4;
  for (const staff of cue.staves) {
    let beat = 0;
    for (const note of staff.notes) {
      if (note.positionChange) {
        const bar = Math.floor((beat + 1e-6) / meter) + 1;
        const labels = rows.get(bar) ?? [];
        if (!labels.includes(note.positionChange)) labels.push(note.positionChange);
        rows.set(bar, labels);
      }
      beat += beatsForDuration(note.duration);
    }
  }
  return [...rows].sort(([a], [b]) => a - b).map(([bar, labels]) => {
    const right = labels.find((label) => label.startsWith('RH: '));
    const left = labels.find((label) => label.startsWith('LH: '));
    const text = right && left && right.slice(4) === left.slice(4)
      ? `Both hands: ${right.slice(4)}` : labels.join(' · ');
    return `Bar ${bar} — ${text}`;
  });
}

/**
 * Flat, onset-ordered list of every sounded (non-rest) note across every
 * staff/measure in OSMD's own graphical layout, each with its real rendered
 * X position (from getSVGGElement + getBoundingClientRect, both confirmed
 * against the live runtime) and its beat position on the piece's single
 * continuous timeline. Used to drive the scrubber and the shift-region
 * overlay exactly as VexFlow tick-context positions did before.
 */
function collectScrubPointsFromGraphic(
  osmd: OSMDInstance,
  hostRect: DOMRect,
  beatsPerBar: number,
): ScrubPoint[] {
  const measureList = osmd.GraphicSheet?.MeasureList;
  if (!measureList || measureList.length === 0) return [];
  const points: ScrubPoint[] = [];
  let beat = 0;
  for (const measureRow of measureList) {
    // Column 0 (first staff / top voice) owns the authoritative timeline,
    // matching the old VexFlow renderer's "first staff of this system" rule.
    const measure = measureRow?.[0] as
      | { staffEntries?: { graphicalVoiceEntries?: { notes?: unknown[] }[] }[] }
      | undefined;
    const staffEntries = measure?.staffEntries ?? [];
    let beatInMeasure = 0;
    for (const entry of staffEntries) {
      const gNote = entry.graphicalVoiceEntries?.[0]?.notes?.[0] as
        | { sourceNote?: { isRestFlag?: boolean; length?: { realValue?: number } }; getSVGGElement?: () => SVGGraphicsElement | undefined }
        | undefined;
      const durationBeats = (gNote?.sourceNote?.length?.realValue ?? 0.25) * 4;
      const isRest = Boolean(gNote?.sourceNote?.isRestFlag);
      if (!isRest && gNote?.getSVGGElement) {
        const gEl = gNote.getSVGGElement();
        if (gEl) {
          const rect = gEl.getBoundingClientRect();
          points.push({ beat: beat + beatInMeasure, x: rect.x - hostRect.x + rect.width / 2 });
        }
      }
      beatInMeasure += durationBeats || 0.25;
    }
    beat += beatsPerBar > 0 ? beatsPerBar : beatInMeasure;
  }
  return points.sort((a, b) => a.beat - b.beat);
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
    notationScale = 1,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<{ startX: number; endX: number; totalBeats: number; top: number; bottom: number } | null>(null);
  const lineRef = useRef<SVGLineElement | null>(null);
  const trailRef = useRef<SVGRectElement | null>(null);
  const successPitchKey = [...successPitches].sort().join('|');
  const resolvedNotationScale = Math.max(1, Math.min(2.5, notationScale));

  useImperativeHandle(
    ref,
    () => ({
      seekToBeat(beat: number) {
        const layout = layoutRef.current;
        const line = lineRef.current;
        const trail = trailRef.current;
        if (!layout || !line || !trail) return;

        if (beat < 0) {
          // During the two-measure count-in the cursor is visible but parked
          // at the first playable point.
          line.setAttribute('opacity', '1');
          line.setAttribute('x1', String(layout.startX));
          line.setAttribute('x2', String(layout.startX));
          line.setAttribute('y1', String(layout.top));
          line.setAttribute('y2', String(layout.bottom));
          trail.setAttribute('opacity', '1');
          trail.setAttribute('x', String(layout.startX));
          trail.setAttribute('y', String(layout.top));
          trail.setAttribute('height', String(layout.bottom - layout.top));
          trail.setAttribute('width', '0');
          return;
        }

        const x = timelineXForBeat(layout.startX, layout.endX, layout.totalBeats, beat);
        line.setAttribute('opacity', '1');
        line.setAttribute('x1', String(x));
        line.setAttribute('x2', String(x));
        line.setAttribute('y1', String(layout.top));
        line.setAttribute('y2', String(layout.bottom));

        trail.setAttribute('opacity', '1');
        trail.setAttribute('x', String(layout.startX));
        trail.setAttribute('y', String(layout.top));
        trail.setAttribute('height', String(layout.bottom - layout.top));
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
    let cancelled = false;

    host.innerHTML = '';
    layoutRef.current = null;
    lineRef.current = null;
    trailRef.current = null;

    const totalBeats = Math.max(
      Math.max(0, minimumTimelineBeats),
      cue.staves.reduce((max, staff) => {
        const beats = staff.notes.reduce((sum, note) => sum + beatsForDuration(note.duration), 0);
        return Math.max(max, beats);
      }, 0),
    );

    const xml = cueSpecToMusicXML(cue, { inkColor, accentColor, successColor, successPitches });

    const container = document.createElement('div');
    container.className = 'et-staff__osmd-host';
    // See estimateStaveWidth's comment: OSMD needs a real pixel width up
    // front, since its host has no intrinsic size of its own.
    const staveWidth = estimateStaveWidth(cue, compact);
    container.style.width = `${staveWidth}px`;
    host.appendChild(container);

    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: false,
      backend: 'svg',
      drawingParameters: compact ? 'compacttight' : 'default',
      // This is a short practice cue, not a titled score: suppress every
      // header element OSMD would otherwise print (title/composer/lyricist/
      // credits default to "Untitled score" etc. when MusicXML omits
      // <work>/<identification>) and the per-staff instrument name labels
      // ("Right hand"/"Left hand", used only internally for part ordering).
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawCredits: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
    });

    osmd.load(xml).then(() => {
      if (cancelled) return;
      osmd.render();

      const svg = container.querySelector('svg') as SVGSVGElement | null;
      if (!svg) return;

      svg.setAttribute('role', 'img');
      svg.setAttribute('focusable', 'false');

      // Read every real note position (via getSVGGElement + getBoundingClientRect,
      // both confirmed against the live OSMD runtime) and append the scrubber
      // BEFORE applying `notationScale`, so every coordinate — points, and
      // the scrubber elements sized from them — lives in one consistent
      // space: the SVG's own pre-scale viewBox units. `notationScale` is
      // then applied uniformly afterwards by growing the SVG's own width/
      // height attributes (which changes how big a viewBox unit renders on
      // screen) rather than a CSS transform layered on top, so the
      // scrubber — drawn in viewBox units like every note — scales with
      // the notation instead of drifting out of sync with it.
      const hostRect = container.getBoundingClientRect();
      const beatsPerBar = beatsPerBarOf(cue);
      const points = collectScrubPointsFromGraphic(osmd, hostRect, beatsPerBar || totalBeats);
      const svgRect = svg.getBoundingClientRect();
      const top = 0 - SCRUB_OVERHANG;
      const bottom = svgRect.height + SCRUB_OVERHANG;

      if (points.length > 0) {
        const first = points[0];
        const last = points[points.length - 1];
        const pixelsPerBeat = last.beat > first.beat ? (last.x - first.x) / (last.beat - first.beat) : 0;
        const startX = first.x;
        const endX = pixelsPerBeat > 0
          ? Math.min(svgRect.width, first.x + pixelsPerBeat * totalBeats)
          : first.x;

        const layout = { startX, endX: Math.max(startX + 1, endX), totalBeats, top, bottom };
        layoutRef.current = layout;

        const trail = document.createElementNS(SVG_NS, 'rect');
        trail.setAttribute('x', String(layout.startX));
        trail.setAttribute('y', String(layout.top));
        trail.setAttribute('width', '0');
        trail.setAttribute('height', String(layout.bottom - layout.top));
        trail.setAttribute('fill', accentColor);
        trail.setAttribute('opacity', '0');
        trail.setAttribute('pointer-events', 'none');
        trail.setAttribute('class', 'et-scrub__trail');
        svg.appendChild(trail);

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(layout.startX));
        line.setAttribute('x2', String(layout.startX));
        line.setAttribute('y1', String(layout.top));
        line.setAttribute('y2', String(layout.bottom));
        line.setAttribute('stroke', accentColor);
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0');
        line.setAttribute('pointer-events', 'none');
        line.setAttribute('class', 'et-scrub__line');
        svg.appendChild(line);

        trailRef.current = trail;
        lineRef.current = line;

        if (shiftMarker) {
          const resolvedShift = shiftRegionFromOnsets(points, shiftMarker.splitIndex);
          if (resolvedShift) {
            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('class', 'et-shift-marker');
            group.setAttribute('pointer-events', 'none');

            const zone = document.createElementNS(SVG_NS, 'rect');
            zone.setAttribute('x', String(resolvedShift.startX));
            zone.setAttribute('y', String(top + 1));
            zone.setAttribute('width', String(resolvedShift.endX - resolvedShift.startX));
            zone.setAttribute('height', String(bottom - top - 2));
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
            label.setAttribute('y', String(top - 8));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', '#5549b4');
            label.setAttribute('font-family', 'Inter, Roboto, sans-serif');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-weight', '800');
            label.setAttribute('letter-spacing', '1.1');
            label.textContent = 'SHIFT HAND';
            group.appendChild(label);

            svg.appendChild(group);
            svg.setAttribute(
              'aria-label',
              `Music moving from ${shiftMarker.fromPositionName} to ${shiftMarker.toPositionName}. The purple zone marks the hand movement.`,
            );
          }
        }
      }

      // Expand the viewBox to cover the scrubber's overhang above/below the
      // staff (SCRUB_OVERHANG on each side), then scale the SVG's own
      // intrinsic width/height by `notationScale` — growing how large a
      // viewBox unit renders on screen — rather than a CSS transform, so
      // the scrubber and every note stay in the exact same coordinate
      // space at every zoom level.
      const baseViewBox = svg.getAttribute('viewBox');
      const [vbX, vbY, vbW, vbH] = (baseViewBox ?? `0 0 ${svgRect.width} ${svgRect.height}`)
        .split(/\s+/).map(Number);
      const expandedY = vbY - SCRUB_OVERHANG;
      const expandedH = vbH + SCRUB_OVERHANG * 2;
      svg.setAttribute('viewBox', `${vbX} ${expandedY} ${vbW} ${expandedH}`);
      svg.setAttribute('width', String(vbW * resolvedNotationScale));
      svg.setAttribute('height', String(expandedH * resolvedNotationScale));
      svg.style.removeProperty('width');
      svg.style.removeProperty('height');
      // `container.style.width` was only ever a lower bound so OSMD had a
      // real width to lay out into (see estimateStaveWidth's comment).
      // Clearing it now lets the host shrink-wrap the SVG's real, possibly
      // notationScale-enlarged size, so the flex host's own max-width:100%
      // does not clamp a deliberately zoomed engraving back down.
      container.style.removeProperty('width');
    }).catch((error) => {
      // Surface loading/parsing failures in dev rather than leaving a blank
      // card — a malformed CueSpec should be visibly wrong, not silent.
      // eslint-disable-next-line no-console
      console.error('StaffCue: OSMD failed to render cue', error);
    });

    return () => {
      cancelled = true;
      host.innerHTML = '';
      layoutRef.current = null;
      lineRef.current = null;
      trailRef.current = null;
    };
  }, [cue, accentColor, compact, inkColor, successPitchKey, successColor, shiftMarker, minimumTimelineBeats, resolvedNotationScale]);

  const engraving = (
    <div
      className={`et-staff${resolvedNotationScale > 1 ? ' et-staff--scaled' : ''}`}
      ref={hostRef}
    />
  );
  const directions = positionDirections(cue);
  return directions.length ? (
    <div className="et-staff-with-directions">
      <div className="et-staff-directions" aria-label="Hand position changes">
        {directions.map((direction) => <p key={direction}>{direction}</p>)}
      </div>
      {engraving}
    </div>
  ) : engraving;
});

export default StaffCue;

// Re-exported so other modules can type against the local CueNote shape
// without importing curriculum/types directly (keeps the previous public
// surface of this file intact for any consumer that imported it from here).
export type { CueNote };
