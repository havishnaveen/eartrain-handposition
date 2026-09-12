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
  rules?: Record<string, unknown>;
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

/** Extrapolates timeline start/end X from the first and last rendered notehead onsets. */
export function scrubberBoundsFromOnsets(
  points: readonly ScrubPoint[],
  totalBeats: number,
  fallbackStartX: number,
  fallbackEndX: number,
): { startX: number; endX: number } {
  if (points.length === 0) return { startX: fallbackStartX, endX: fallbackEndX };
  const first = points[0];
  const last = points[points.length - 1];
  const pixelsPerBeat = last.beat > first.beat ? (last.x - first.x) / (last.beat - first.beat) : 0;
  const startX = first.x;
  const endX = pixelsPerBeat > 0 ? Math.min(fallbackEndX, first.x + pixelsPerBeat * totalBeats) : first.x;
  return { startX, endX: Math.max(startX + 1, endX) };
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

/** Engraved spacing is not linear in musical time (especially dotted notes). */
export function engravedXForBeat(points: readonly ScrubPoint[], beat: number): number {
  if (!points.length) return 0;
  if (beat <= points[0].beat) return points[0].x;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    if (beat <= next.beat) {
      return previous.x + (next.x - previous.x) *
        Math.max(0, Math.min(1, (beat - previous.beat) / Math.max(1e-6, next.beat - previous.beat)));
    }
  }
  return points[points.length - 1].x;
}

/** Piecewise interpolation between rendered notehead X positions for exact notehead alignment. */
export function timelineXForBeatFromPoints(
  points: readonly ScrubPoint[],
  fallbackStartX: number,
  fallbackEndX: number,
  totalBeats: number,
  beat: number,
): number {
  if (!points || points.length === 0) {
    return timelineXForBeat(fallbackStartX, fallbackEndX, totalBeats, beat);
  }
  if (points.length === 1) {
    return points[0].x;
  }
  if (beat <= points[0].beat) {
    if (points[0].beat === 0 || beat <= 0) return points[0].x;
    const slope = (points[1].x - points[0].x) / (points[1].beat - points[0].beat || 1);
    return Math.max(fallbackStartX, points[0].x - (points[0].beat - beat) * slope);
  }
  const last = points[points.length - 1];
  if (beat >= last.beat) {
    if (beat >= totalBeats && totalBeats > last.beat) {
      const slope = (last.x - points[points.length - 2].x) / (last.beat - points[points.length - 2].beat || 1);
      return Math.min(fallbackEndX, last.x + (beat - last.beat) * slope);
    }
    return last.x;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (beat >= p0.beat && beat <= p1.beat) {
      const span = p1.beat - p0.beat;
      if (span <= 1e-6) return p0.x;
      const t = (beat - p0.beat) / span;
      return p0.x + t * (p1.x - p0.x);
    }
  }
  return last.x;
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
 * Convert a point in screen-pixel space (e.g. from getBoundingClientRect())
 * into the given SVG element's own internal coordinate system (its current
 * viewBox units), via the browser's real screen-to-user-space transform.
 * This is the robust way to do this conversion: approximating it by
 * subtracting a container element's own getBoundingClientRect() origin
 * silently breaks whenever that container isn't pixel-aligned with the
 * SVG's own coordinate origin — which is routine here, since the host is a
 * flex-centered box (can be wider than the SVG) and OSMD's own viewBox does
 * not start at (0,0). That mismatch was the confirmed root cause of the
 * scrubber drifting away from the actual notes it was meant to track.
 */
function screenPointToSvgSpace(svg: SVGSVGElement, screenX: number, screenY: number): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inverse = ctm.inverse();
  const point = svg.createSVGPoint();
  point.x = screenX;
  point.y = screenY;
  const transformed = point.matrixTransform(inverse);
  return { x: transformed.x, y: transformed.y };
}

/**
 * Flat, onset-ordered list of every sounded (non-rest) note across every
 * staff/measure in OSMD's own graphical layout, each with its real rendered
 * X position — converted into the SVG's own coordinate space via
 * getScreenCTM(), so it lines up with everything else drawn in that space —
 * and its beat position on the piece's single continuous timeline. Used to
 * drive the scrubber and the shift-region overlay exactly as VexFlow tick-
 * context positions did before.
 */
function collectScrubPointsFromGraphic(
  osmd: OSMDInstance,
  svg: SVGSVGElement,
  beatsPerBar: number,
): ScrubPoint[] {
  const measureList = osmd.GraphicSheet?.MeasureList;
  if (!measureList || measureList.length === 0) return [];
  const rawPoints: { beat: number; x: number }[] = [];

  for (let measureIdx = 0; measureIdx < measureList.length; measureIdx++) {
    const measureRow = measureList[measureIdx];
    if (!measureRow) continue;

    const measures = Array.isArray(measureRow) ? measureRow : [measureRow];
    for (const measure of measures as any[]) {
      if (!measure) continue;
      const staffEntries = measure.staffEntries ?? [];
      let fallbackBeatInMeasure = 0;

      for (const entry of staffEntries) {
        let beatInMeasure: number | null = null;
        if (typeof entry.getAbsoluteTimestamp === 'function') {
          const ts = entry.getAbsoluteTimestamp();
          const rv = ts?.RealValue ?? ts?.realValue;
          if (typeof rv === 'number') {
            beatInMeasure = rv * 4;
          }
        }
        if (beatInMeasure === null && entry.relInMeasureTimestamp) {
          const rel = entry.relInMeasureTimestamp.RealValue ?? entry.relInMeasureTimestamp.realValue;
          if (typeof rel === 'number') {
            beatInMeasure = measureIdx * beatsPerBar + rel * 4;
          }
        }
        if (beatInMeasure === null) {
          beatInMeasure = measureIdx * beatsPerBar + fallbackBeatInMeasure;
        }

        let entryDuration = 0.25;
        const voiceEntries = entry.graphicalVoiceEntries ?? [];
        for (const gve of voiceEntries) {
          for (const gNote of gve.notes ?? []) {
            const dur = ((gNote?.sourceNote?.length?.RealValue ?? gNote?.sourceNote?.length?.realValue) ?? 0.25) * 4;
            if (dur > entryDuration) entryDuration = dur;
            const isRest = Boolean(gNote?.sourceNote?.isRestFlag || gNote?.sourceNote?.isRest?.());
            if (!isRest && typeof gNote?.getSVGGElement === 'function') {
              const gEl = gNote.getSVGGElement();
              if (gEl) {
                const head = gEl.querySelector('.vf-notehead > path') ?? gEl;
                const rect = head.getBoundingClientRect();
                const svgPoint = screenPointToSvgSpace(svg, rect.x + rect.width / 2, rect.y + rect.height / 2);
                if (svgPoint) {
                  rawPoints.push({ beat: beatInMeasure, x: svgPoint.x });
                }
              }
            }
          }
        }
        fallbackBeatInMeasure += entryDuration;
      }
    }
  }

  if (rawPoints.length === 0) return [];

  rawPoints.sort((a, b) => a.beat - b.beat);
  const consolidated: ScrubPoint[] = [];
  let currentGroup: { beat: number; xSum: number; count: number } | null = null;

  for (const pt of rawPoints) {
    if (!currentGroup) {
      currentGroup = { beat: pt.beat, xSum: pt.x, count: 1 };
    } else if (Math.abs(pt.beat - currentGroup.beat) < 0.01) {
      currentGroup.xSum += pt.x;
      currentGroup.count += 1;
    } else {
      consolidated.push({
        beat: currentGroup.beat,
        x: currentGroup.xSum / currentGroup.count,
      });
      currentGroup = { beat: pt.beat, xSum: pt.x, count: 1 };
    }
  }
  if (currentGroup) {
    consolidated.push({
      beat: currentGroup.beat,
      x: currentGroup.xSum / currentGroup.count,
    });
  }

  return consolidated;
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
  const layoutRef = useRef<{ startX: number; endX: number; totalBeats: number; top: number; bottom: number; points: ScrubPoint[] } | null>(null);
  const pointsRef = useRef<readonly ScrubPoint[]>([]);
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

        const points = layout.points || pointsRef.current;
        const x = points && points.length > 0
          ? timelineXForBeatFromPoints(points, layout.startX, layout.endX, layout.totalBeats, beat)
          : timelineXForBeat(layout.startX, layout.endX, layout.totalBeats, beat);
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

    // Stop at the written end of the last SOUNDED note, matching
    // planFor()'s `performanceBeats` in audio/timing.ts exactly — staff
    // generation routinely pads the final measure with a trailing rest so
    // the bar/system comes out even (see progressiveCurriculum.ts's
    // padBar()), and that padding is layout only, not extra performance
    // time. Summing every note's duration including trailing rests made
    // this component's own `totalBeats` land past where the audio clock's
    // `plan.totalBeats` actually ends — up to a whole beat wider on an
    // ordinary padded phrase. scrubberBoundsFromOnsets() below extrapolates
    // the scrubber's rail end (endX) from this totalBeats, so that mismatch
    // stretched the visual timeline past the real one: during the final
    // note the scrubber crept toward a rail end it would never audibly
    // reach on time, reading as the cursor running behind — exactly the
    // reported "occasionally ahead or behind" symptom, and one that would
    // recur on any exercise whose generated phrase needed trailing padding
    // to fill out its bar (routine, not rare).
    const totalBeats = Math.max(
      Math.max(0, minimumTimelineBeats),
      cue.staves.reduce((max, staff) => {
        let beat = 0;
        let performanceEnd = 0;
        for (const note of staff.notes) {
          const beats = beatsForDuration(note.duration);
          if (!note.duration.endsWith('r')) {
            performanceEnd = Math.max(performanceEnd, beat + beats);
          }
          beat += beats;
        }
        return Math.max(max, performanceEnd);
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
      drawMeasureNumbers: false,
    });

    const rules = (osmd as any).EngravingRules || (osmd as any).rules;
    if (rules) {
      rules.FingeringPositionFromXML = true;
      rules.RenderMeasureNumbers = false;
      rules.RenderMeasureNumbersOnlyAtSystemStart = false;
      rules.MeasureNumberInterval = 0;
    }

    osmd.load(xml).then(() => {
      if (cancelled) return;
      osmd.render();

      const svg = container.querySelector('svg') as SVGSVGElement | null;
      if (!svg) return;

      // Practice cues must never display measure numbers (which collide with
      // fingering numbers and look like floating/levitating fingerings).
      svg.querySelectorAll('.measure-number, [class*="measure-number"]').forEach((el) => el.remove());

      svg.setAttribute('role', 'img');
      svg.setAttribute('focusable', 'false');

      // Measure real drawn content BEFORE anything else touches the SVG:
      // before the scrubber/shift-overlay elements are appended (they would
      // otherwise inflate their own bounding box into this measurement —
      // circular), and before notationScale changes width/height. This is
      // the same crop-to-measured-content approach the old VexFlow renderer
      // used via its own getBBox() pass: OSMD's own viewBox spans a full
      // printed-page layout with generous margins, and scaling THAT by
      // notationScale blew a "zoomed" card up far past its actual content
      // (confirmed: a 2.3x card rendered 780px tall against a ~300px card,
      // spilling the staff and fingering numbers over neighboring text).
      const rawViewBox = svg.getAttribute('viewBox');
      const [rawVbX, rawVbY, rawVbW, rawVbH] = (rawViewBox ?? '0 0 0 0').split(/\s+/).map(Number);
      let box = { x: rawVbX || 0, y: rawVbY || 0, width: rawVbW || 0, height: rawVbH || 0 };
      try {
        const measured = svg.getBBox();
        if (measured.width > 0 && measured.height > 0) box = measured;
      } catch {
        // getBBox needs a live layout (unavailable in SSR/jsdom); the raw
        // (uncropped) viewBox above is a safe superset — over-wide, never
        // clipped — for both the crop below and collectScrubPointsFromGraphic's
        // own fallback.
      }

      // Convert each real note's on-screen position (getSVGGElement +
      // getBoundingClientRect, both confirmed against the live OSMD
      // runtime) into the SVG's OWN coordinate space via getScreenCTM(),
      // rather than approximating it by subtracting the flex host's origin
      // — the host can be wider than the SVG (flex-centered) and the SVG's
      // un-cropped viewBox does not start at (0,0), so that approximation
      // was the root cause of the scrubber drifting from the actual notes.
      const beatsPerBar = beatsPerBarOf(cue);
      const points = collectScrubPointsFromGraphic(osmd, svg, beatsPerBar || totalBeats);

      const shiftHeadroom = shiftMarker ? 18 : 0;
      const cropPadX = 12;
      const cropX = box.x - cropPadX;
      const cropTop = box.y - SCRUB_OVERHANG - 4 - shiftHeadroom;
      const cropWidth = box.width + cropPadX * 2;
      const cropHeight = box.height + SCRUB_OVERHANG * 2 + 8 + shiftHeadroom;
      const top = box.y - SCRUB_OVERHANG - 4;
      const bottom = top + box.height + SCRUB_OVERHANG * 2 + 8;

      if (points.length > 0) {
        const bounds = scrubberBoundsFromOnsets(points, totalBeats, cropX + 10, cropX + cropWidth - 10);
        const layout = {
          startX: bounds.startX,
          endX: bounds.endX,
          totalBeats,
          top,
          bottom,
          points: [...points, { beat: totalBeats, x: bounds.endX }],
        };
        layoutRef.current = layout;
        pointsRef.current = points;

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

      // Apply the crop computed above (before the scrubber/shift-overlay
      // elements were appended, so their own geometry never fed back into
      // it). The viewBox stays the FULL measured content — it must never be
      // shrunk around notationScale, which was tried and tested wrong: it
      // silently cropped away real musical content (confirmed empirically
      // on a two-hand, two-staff phrase at notationScale 2.3 — shrinking the
      // viewBox to fit "zoomed" lost the entire bass staff, which had
      // genuinely fallen outside the cropped region, not just a rendering
      // artifact). `notationScale` was never meant to mean "show less of
      // the phrase" — every call site applies the same scale uniformly to
      // phrases from a single chord to a full two-hand passage — so the
      // element must always show 100% of what was written.
      //
      // Sizing is width/height ATTRIBUTES of "100%" (a CSS-relative size,
      // not a pixel one) plus `preserveAspectRatio="xMidYMid meet"`, which
      // together are the SVG-native equivalent of object-fit:contain: fit
      // and center the WHOLE viewBox inside the element's box, preserving
      // its aspect ratio, on both axes at once — confirmed empirically to
      // hold where plain CSS max-width/max-height and CSS object-fit did
      // not (see staff-cue.css's `.et-staff svg` comment for the full
      // story). `notationScale` no longer feeds sizing math at all: with
      // the element always filling its container via "contain", a card
      // with a smaller, dedicated height (compact chord/proof cards use a
      // shorter `.et-staff` box than a full phrase's card) naturally
      // renders its one or two notes larger simply by filling more of a
      // smaller box — the same practical effect `notationScale` used to
      // chase by inflating pixel size, without the cropping bug.
      svg.setAttribute('viewBox', `${cropX} ${cropTop} ${cropWidth} ${cropHeight}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.removeProperty('width');
      svg.style.removeProperty('height');
      container.style.removeProperty('width');
      // `container.style.width` was only ever a lower bound so OSMD had a
      // real width to lay out into (see estimateStaveWidth's comment) —
      // clear it now that layout is done so it stops forcing the host to
      // that width. The host now sizes from CSS alone (width/height:100% in
      // staff-cue.css against `.et-staff`'s real card height), and the SVG
      // in turn always fills the host completely, so nothing here needs the
      // host to shrink-wrap the SVG's own size.
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
      pointsRef.current = [];
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
