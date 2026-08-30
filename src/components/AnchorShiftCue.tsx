import {
  forwardRef,
  useCallback,
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
  secondsPerBeat: number;
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
      secondsPerBeat,
      accentColor = '#ef6a47',
      inkColor = '#242237',
    notationScale = 1,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const firstRef = useRef<StaffCueHandle>(null);
    const secondRef = useRef<StaffCueHandle>(null);
    const countdownRef = useRef<HTMLElement>(null);
    const countdownFillRef = useRef<HTMLElement>(null);
    // When there is no scripted timedShift pause (e.g. Lessons 13-14, whose
    // audio timeline deliberately keeps Position 2 always visible with zero
    // reserved beats), the written beat clock crosses the hand-off in a
    // single animation frame and "move" is applied and overwritten before a
    // student can read it. This wall-clock latch — independent of the beat
    // timeline, so grading and count-in timing are untouched — holds the
    // indicator visible for a real minimum stretch instead.
    const unscriptedMoveEnteredAtRef = useRef<number | null>(null);
    const UNSCRIPTED_MOVE_MIN_MS = 700;
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
    const waitSeconds = Math.max(0, shift.timedShift?.waitSeconds ?? 0);
    const stagedReveal = shift.timedShift?.revealSecond === true;
    const waitBeats = waitSeconds / Math.max(0.01, secondsPerBeat);

    const showCountdown = useCallback((remaining: number) => {
      const safeRemaining = Math.max(0, Math.min(waitSeconds, remaining));
      if (countdownRef.current) {
        countdownRef.current.textContent = `${safeRemaining.toFixed(1)}s`;
      }
      if (countdownFillRef.current) {
        countdownFillRef.current.style.transform = `scaleX(${waitSeconds === 0 ? 1 : 1 - safeRemaining / waitSeconds})`;
      }
    }, [waitSeconds]);

    useImperativeHandle(ref, () => ({
      seekToBeat(beat: number) {
        if (beat < 0) {
          rootRef.current?.setAttribute('data-active-position', 'from');
          showCountdown(waitSeconds);
          firstRef.current?.seekToBeat(-1);
          secondRef.current?.hide();
          return;
        }
        if (beat < firstBeats) {
          rootRef.current?.setAttribute('data-active-position', 'from');
          showCountdown(waitSeconds);
          firstRef.current?.seekToBeat(beat);
          secondRef.current?.hide();
          return;
        }
        if (beat < firstBeats + waitBeats) {
          unscriptedMoveEnteredAtRef.current = null;
          rootRef.current?.setAttribute('data-active-position', 'move');
          showCountdown(waitSeconds - (beat - firstBeats) * secondsPerBeat);
          firstRef.current?.hide();
          secondRef.current?.hide();
          return;
        }
        if (waitBeats === 0) {
          const now = performance.now();
          if (unscriptedMoveEnteredAtRef.current === null) {
            unscriptedMoveEnteredAtRef.current = now;
          }
          if (now - unscriptedMoveEnteredAtRef.current < UNSCRIPTED_MOVE_MIN_MS) {
            rootRef.current?.setAttribute('data-active-position', 'move');
            showCountdown(0);
            firstRef.current?.hide();
            secondRef.current?.hide();
            return;
          }
        }
        rootRef.current?.setAttribute('data-active-position', 'to');
        showCountdown(0);
        firstRef.current?.hide();
        secondRef.current?.seekToBeat(beat - firstBeats - waitBeats);
      },
      hide() {
        unscriptedMoveEnteredAtRef.current = null;
        rootRef.current?.setAttribute('data-active-position', 'from');
        showCountdown(waitSeconds);
        firstRef.current?.hide();
        secondRef.current?.hide();
      },
    }), [firstBeats, secondsPerBeat, showCountdown, waitBeats, waitSeconds]);

    if (!staff) {
      return <StaffCue ref={firstRef} cue={cue} accentColor={accentColor} inkColor={inkColor} notationScale={notationScale} />;
    }

    return (
      <div
        ref={rootRef}
        className="et-anchor-cue"
        data-active-position="from"
        data-staged-reveal={stagedReveal ? 'true' : 'false'}
        aria-label={stagedReveal
          ? `Phrase reveal. Step 1: play ${shift.fromPositionName}. Step 2: study the new phrase for ${waitSeconds} seconds while moving. Step 3: play ${shift.toPositionName}.`
          : `Hand-position switch. First play ${shift.fromPositionName}, then move and play ${shift.toPositionName}.`}
      >
        <section className="et-anchor-cue__half et-anchor-cue__half--from" aria-label={`${shift.fromPositionName} music`}>
          <header className="et-anchor-cue__label">
            <b className="et-anchor-cue__step">1</b>
            <span><small>Play here first</small><strong>{shift.fromPositionName}</strong></span>
          </header>
          <StaffCue ref={firstRef} cue={firstCue} accentColor={accentColor} inkColor={inkColor} notationScale={notationScale} compact />
        </section>

        <div
          className="et-anchor-cue__bridge"
          aria-label={
            waitSeconds > 0
              ? stagedReveal
                ? `${waitSeconds}-second phrase-preview countdown`
                : `${waitSeconds}-second move-your-hand window`
              : 'Move your hand'
          }
        >
          <span className="et-anchor-cue__step">2</span>
          <b>{stagedReveal ? 'Study & move' : 'Move hand'}</b>
          <i className="et-anchor-cue__arrow" aria-hidden="true">→</i>
          {waitSeconds > 0 ? (
            <>
              <strong ref={countdownRef} className="et-anchor-cue__countdown">{waitSeconds.toFixed(1)}s</strong>
              <span className="et-anchor-cue__countdown-track" aria-hidden="true">
                <i ref={countdownFillRef} />
              </span>
              <small>{stagedReveal ? 'See the new phrase' : 'Keep the beat'}</small>
            </>
          ) : <small>Keep the beat</small>}
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
