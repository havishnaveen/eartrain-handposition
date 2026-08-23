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
      return {
        firstCue: { ...cue, staves: [{ ...staff, notes: firstNotes }] },
        secondCue: { ...cue, staves: [{ ...staff, notes: secondNotes }] },
        firstBeats: firstNotes.reduce(
          (sum, note) => sum + beatsForDuration(note.duration),
          0,
        ),
      };
    }, [cue, split, staff]);

    useImperativeHandle(ref, () => ({
      seekToBeat(beat: number) {
        if (beat < 0) {
          rootRef.current?.setAttribute('data-active-position', 'from');
          firstRef.current?.seekToBeat(-1);
          secondRef.current?.hide();
          return;
        }
        if (beat < firstBeats) {
          // Light the travel cue half a beat before the landing. The written
          // timeline and scrubber remain unchanged; this is only a visual
          // preparation cue so a young learner knows exactly when to move.
          rootRef.current?.setAttribute(
            'data-active-position',
            beat >= Math.max(0, firstBeats - 0.5) ? 'move' : 'from',
          );
          firstRef.current?.seekToBeat(beat);
          secondRef.current?.hide();
          return;
        }
        rootRef.current?.setAttribute('data-active-position', 'to');
        firstRef.current?.hide();
        secondRef.current?.seekToBeat(beat - firstBeats);
      },
      hide() {
        rootRef.current?.setAttribute('data-active-position', 'from');
        firstRef.current?.hide();
        secondRef.current?.hide();
      },
    }), [firstBeats]);

    if (!staff) {
      return <StaffCue ref={firstRef} cue={cue} accentColor={accentColor} inkColor={inkColor} />;
    }

    return (
      <div
        ref={rootRef}
        className="et-anchor-cue"
        data-active-position="from"
        aria-label={`Step 1: play ${shift.fromPositionName}. Step 2: move your hand. Step 3: land in ${shift.toPositionName}.`}
      >
        <section className="et-anchor-cue__half et-anchor-cue__half--from" aria-label={`${shift.fromPositionName} music`}>
          <header className="et-anchor-cue__label">
            <b className="et-anchor-cue__step">1</b>
            <span><small>Play here first</small><strong>{shift.fromPositionName}</strong></span>
          </header>
          <StaffCue ref={firstRef} cue={firstCue} accentColor={accentColor} inkColor={inkColor} />
        </section>

        <div className="et-anchor-cue__bridge" aria-label="Move your hand">
          <span className="et-anchor-cue__step">2</span>
          <b>Move hand</b>
          <i aria-hidden="true">→</i>
          <small>Keep the beat</small>
        </div>

        <section className="et-anchor-cue__half et-anchor-cue__half--to" aria-label={`${shift.toPositionName} music`}>
          <header className="et-anchor-cue__label">
            <b className="et-anchor-cue__step">3</b>
            <span><small>Land here</small><strong>{shift.toPositionName}</strong></span>
          </header>
          <StaffCue ref={secondRef} cue={secondCue} accentColor={accentColor} inkColor={inkColor} />
        </section>
      </div>
    );
  },
);

export default AnchorShiftCue;
