import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { beatsForDuration } from '../audio/timing';
import type { AnchorShiftSpec, CueSpec } from '../curriculum/types';
import StaffCue from './StaffCue';
import type { StaffCueHandle } from './StaffCue';
import './anchor-shift-cue.css';

export interface AnchorShiftCueProps {
  cue: CueSpec;
  shift: AnchorShiftSpec;
  accentColor?: string;
  inkColor?: string;
  notationScale?: number;
}

/**
 * Two sequential notation panels sharing one audio timeline.
 *
 * A single extra-wide staff became illegible on tablets and phones. Splitting
 * only the visual surface keeps the original DrillPlan and grading timestamps
 * intact while making the physical movement unmistakable.
 */
export const AnchorShiftCue = forwardRef<StaffCueHandle, AnchorShiftCueProps>(
  function AnchorShiftCue(
    {
      cue,
      shift,
      accentColor = '#ef6a47',
      inkColor = '#242237',
    notationScale = 1,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const firstRef = useRef<StaffCueHandle>(null);
    const secondRef = useRef<StaffCueHandle>(null);
    const staff = cue.staves[0];
    const split = Math.min(
      Math.max(1, shift.splitIndex),
      Math.max(1, (staff?.notes.length ?? 2) - 1),
    );

    const { firstCue, secondCue, firstBeats } = useMemo(() => {
      if (!staff) return { firstCue: cue, secondCue: cue, firstBeats: 0 };
      const firstNotes = staff.notes.slice(0, split);
      const secondNotes = staff.notes.slice(split);
      const firstDuration = firstNotes.reduce(
        (sum, note) => sum + beatsForDuration(note.duration),
        0,
      );
      return {
        firstCue: { ...cue, staves: [{ ...staff, notes: firstNotes }] },
        secondCue: { ...cue, staves: [{ ...staff, notes: secondNotes }] },
        firstBeats: firstDuration,
      };
    }, [cue, split, staff]);
    const waitBeats = Math.max(0, shift.timedShift?.waitBeats ?? 0);

    useImperativeHandle(ref, () => ({
      seekToBeat(beat: number) {
        if (beat < 0) {
          rootRef.current?.setAttribute('data-active-position', 'from');
          rootRef.current?.style.setProperty('--et-shift-progress', '0%');
          firstRef.current?.seekToBeat(-1);
          secondRef.current?.hide();
          return;
        }
        if (beat < firstBeats) {
          rootRef.current?.setAttribute('data-active-position', 'from');
          rootRef.current?.style.setProperty('--et-shift-progress', '0%');
          firstRef.current?.seekToBeat(beat);
          secondRef.current?.hide();
          return;
        }
        if (beat < firstBeats + waitBeats) {
          rootRef.current?.setAttribute('data-active-position', 'move');
          rootRef.current?.style.setProperty(
            '--et-shift-progress',
            `${Math.max(0, Math.min(84, ((beat - firstBeats) / Math.max(1, waitBeats)) * 84))}%`,
          );
          firstRef.current?.hide();
          secondRef.current?.hide();
          return;
        }
        rootRef.current?.setAttribute('data-active-position', 'to');
        rootRef.current?.style.setProperty('--et-shift-progress', '84%');
        firstRef.current?.hide();
        secondRef.current?.seekToBeat(beat - firstBeats - waitBeats);
      },
      hide() {
        rootRef.current?.setAttribute('data-active-position', 'from');
        rootRef.current?.style.setProperty('--et-shift-progress', '0%');
        firstRef.current?.hide();
        secondRef.current?.hide();
      },
    }), [firstBeats, waitBeats]);

    if (!staff) {
      return <StaffCue ref={firstRef} cue={cue} accentColor={accentColor} inkColor={inkColor} notationScale={notationScale} />;
    }

    return (
      <div
        ref={rootRef}
        className="et-anchor-cue"
        data-active-position="from"
        aria-label={`Hand-position switch. First play ${shift.fromPositionName}, then move and play ${shift.toPositionName}. Both positions remain visible.`}
      >
        <section className="et-anchor-cue__half et-anchor-cue__half--from" aria-label={`${shift.fromPositionName} music`}>
          <header className="et-anchor-cue__label">
            <b className="et-anchor-cue__step">1</b>
            <span><small>Play here first</small><strong>{shift.fromPositionName}</strong></span>
          </header>
          <StaffCue ref={firstRef} cue={firstCue} accentColor={accentColor} inkColor={inkColor} notationScale={notationScale} compact />
        </section>

        <div
          className="et-anchor-cue__rest-bar"
          aria-label="One 4/4 rest measure: shift on beats 1 and 2, settle on beats 3 and 4"
        >
          <b>Shift during this rest measure</b>
          <span className="et-anchor-cue__rest-staff" aria-hidden="true">
            <i /><i /><i /><i /><i />
            <em />
            <strong />
          </span>
          <span className="et-anchor-cue__rest-counts" aria-hidden="true">
            <b>1<small>move</small></b><b>2<small>move</small></b>
            <b>3<small>set</small></b><b>4<small>set</small></b>
          </span>
        </div>

        <section className="et-anchor-cue__half et-anchor-cue__half--to" aria-label={`${shift.toPositionName} music`}>
          <header className="et-anchor-cue__label">
            <b className="et-anchor-cue__step">3</b>
            <span><small>Land here</small><strong>{shift.toPositionName}</strong></span>
          </header>
          <StaffCue ref={secondRef} cue={secondCue} accentColor={accentColor} inkColor={inkColor} notationScale={notationScale} compact />
        </section>
      </div>
    );
  },
);

export default AnchorShiftCue;
