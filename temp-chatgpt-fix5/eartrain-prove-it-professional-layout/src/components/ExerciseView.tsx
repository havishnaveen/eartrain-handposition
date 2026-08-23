import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import type { DetectedNote, DrillPlan, GradeResult } from '../audio/timing';
import type {
  AnchorShiftSpec,
  BlindMemorySpec,
  ExerciseMode,
  PositionProofSpec,
} from '../curriculum/types';
import ExerciseReport from './ExerciseReport';
import './exercise.css';

export type ExerciseStatus =
  | 'position-prompt'
  | 'proving'
  | 'proof-success'
  | 'prompt'
  | 'memory-preview'
  | 'leadin'
  | 'listening'
  | 'grading'
  | 'report';
export type ExerciseOutcome = 'success' | 'failure';
export type MicStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error';

export interface ExerciseViewHandle {
  /** Updates the in-piece progress bar without causing React renders. */
  seekToProgress: (progress: number) => void;
  resetProgress: () => void;
}

export interface ExerciseViewProps {
  status: ExerciseStatus;
  instruction: string;
  exerciseMode: ExerciseMode;
  positionProof?: PositionProofSpec;
  blindMemory?: BlindMemorySpec;
  anchorShift?: AnchorShiftSpec;
  memorySecondsRemaining?: number;
  children?: ReactNode;

  onStart?: () => void;
  startLabel?: string;
  micStatus?: MicStatus;

  /** Current audio-clock beat during the count-in and recording. */
  beatLabel?: string;
  /** True on the count-in's final beat. */
  isDownbeat?: boolean;

  /** Complete result shown in the full-stage report state. */
  report?: GradeResult | null;
  reportPlan?: DrillPlan | null;
  reportDetectedNotes?: readonly DetectedNote[];
  reportPlayStartTime?: number;
  recordingUrl?: string | null;
  onPlaybackFrame?: (beat: number) => void;
  onPlaybackEnd?: () => void;
  onNext?: () => void;
  nextLabel?: string;

  inputLevel?: number;
  detectedNotes?: string[];
  proofProgress?: 0 | 1 | 2 | 3;
}

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v4" />
    <path d="M8 22h8" />
  </svg>
);

const RecordDot = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <circle cx="12" cy="12" r="7" fill="currentColor" />
  </svg>
);

const AnalysisMark = () => (
  <svg viewBox="0 0 72 72" width="72" height="72" fill="none" aria-hidden="true">
    <path d="M13 44c7-18 13 11 21-10s13 15 25-8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="13" cy="44" r="4" fill="currentColor" />
    <circle cx="34" cy="34" r="4" fill="currentColor" />
    <circle cx="59" cy="26" r="4" fill="currentColor" />
  </svg>
);

function PerformanceAnalysis() {
  return (
    <section className="et-analysis" role="status" aria-live="polite" aria-label="Analyzing your performance">
      <div className="et-analysis__visual" aria-hidden="true">
        <span className="et-analysis__orbit et-analysis__orbit--one"><i /></span>
        <span className="et-analysis__orbit et-analysis__orbit--two"><i /></span>
        <span className="et-analysis__orbit et-analysis__orbit--three"><i /></span>
        <span className="et-analysis__pulse" />
        <span className="et-analysis__core"><AnalysisMark /></span>
      </div>

      <div className="et-analysis__copy">
        <p>Checking</p>
        <h2>Checking your notes</h2>
        <span>One moment…</span>
      </div>
    </section>
  );
}

const METER_BARS = 9;
const NOOP = () => undefined;

const MIC_MESSAGE: Partial<Record<MicStatus, string>> = {
  denied: 'Microphone access is blocked. Allow it in your browser settings, then reload.',
  unsupported: 'This browser cannot record audio. Try Chrome, Edge or Safari.',
  error: 'The microphone could not be opened. Check that nothing else is using it.',
  requesting: 'Waiting for microphone permission…',
};

function proofPositionTitle(positionName?: string): string {
  const root = (positionName ?? 'C')
    .replace(/\s+position$/i, '')
    .replace(/\s+major$/i, '')
    .trim();
  return `${root || 'C'} Major`;
}

function proofPitchName(pitch: string): string {
  return pitch.replace(/-?\d+$/, '');
}

/**
 * ExerciseView owns the five visual states of one drill. Grading and report
 * return early so the instruction, active staff, and recording controls are
 * removed from the main stage rather than covered or visually hidden.
 */
export const ExerciseView = forwardRef<ExerciseViewHandle, ExerciseViewProps>(
  function ExerciseView(
    {
      status,
      instruction,
      exerciseMode,
      positionProof,
      blindMemory,
      anchorShift,
      memorySecondsRemaining = 3,
      children,
      onStart,
      startLabel = 'Start drill',
      micStatus = 'idle',
      beatLabel = '',
      isDownbeat = false,
      report = null,
      reportPlan = null,
      reportDetectedNotes = [],
      reportPlayStartTime = 0,
      recordingUrl = null,
      onPlaybackFrame,
      onPlaybackEnd,
      onNext,
      nextLabel = 'Next Drill',
      inputLevel = 0,
      detectedNotes = [],
      proofProgress = 0,
    },
    ref,
  ) {
    const progressFillRef = useRef<HTMLSpanElement>(null);
    const progressLabelRef = useRef<HTMLSpanElement>(null);
    const progressTrackRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      seekToProgress(progress: number) {
        const normalized = Math.min(1, Math.max(0, progress));
        progressFillRef.current?.style.setProperty('transform', `scaleX(${normalized})`);
        if (progressLabelRef.current) {
          progressLabelRef.current.textContent = `${Math.round(normalized * 100)}%`;
        }
        progressTrackRef.current?.setAttribute('aria-valuenow', String(Math.round(normalized * 100)));
      },
      resetProgress() {
        progressFillRef.current?.style.setProperty('transform', 'scaleX(0)');
        if (progressLabelRef.current) progressLabelRef.current.textContent = '0%';
        progressTrackRef.current?.setAttribute('aria-valuenow', '0');
      },
    }), []);

    if (status === 'report' && report) {
      return (
        <ExerciseReport
          result={report}
          expectedMusic={children}
          plan={reportPlan}
          detectedNotes={reportDetectedNotes}
          playStartTime={reportPlayStartTime}
          recordingUrl={recordingUrl}
          onPlaybackFrame={onPlaybackFrame}
          onPlaybackEnd={onPlaybackEnd}
          onNext={onNext ?? NOOP}
          nextLabel={nextLabel}
        />
      );
    }

    if (status === 'grading') return <PerformanceAnalysis />;

    const level = Math.min(1, Math.max(0, inputLevel));
    const micMessage = MIC_MESSAGE[micStatus];
    const micBlocked = micStatus === 'denied' || micStatus === 'unsupported' || micStatus === 'error';

    if (
      exerciseMode === 'prove-it' &&
      (status === 'position-prompt' || status === 'proving' || status === 'proof-success')
    ) {
      const proofNotes = positionProof?.proofNotes ?? [
        { pitch: 'C4', finger: 1 as const },
        { pitch: 'E4', finger: 2 as const },
        { pitch: 'G4', finger: 3 as const },
      ];
      const handCode = positionProof?.hand === 'left' ? 'LH' : 'RH';
      return (
        <section className={`et-proof et-proof--${status}`} aria-live="polite">
          <div className="et-proof__halo" aria-hidden="true"><span /><span /><span /></div>
          <div className="et-proof__layout">
            <div className="et-proof__identity">
              <h2 className="et-proof__title">
                {proofPositionTitle(positionProof?.positionName)}, <span>{handCode}</span>
              </h2>

              {status === 'position-prompt' ? (
                <button
                  type="button"
                  className="et-start et-proof__start"
                  onClick={onStart}
                  disabled={micStatus === 'requesting'}
                >
                  <span className="et-start__dot"><RecordDot /></span>
                  Start
                </button>
              ) : null}

              {micMessage ? (
                <p className={`et-proof__mic-message${micBlocked ? ' et-proof__mic-message--alert' : ''}`}>
                  {micMessage}
                </p>
              ) : null}
            </div>

            <ol
              className="et-proof__keys"
              aria-label={proofNotes
                .map((note) => `Finger ${note.finger} on ${proofPitchName(note.pitch)}`)
                .join(', then ')}
            >
              {proofNotes.map((note, index) => {
                const done = status === 'proof-success' || proofProgress > index;
                const active = status !== 'proof-success' && proofProgress === index;
                return (
                  <li
                    key={`${note.pitch}-${note.finger}`}
                    className={`et-proof__key${active ? ' et-proof__key--active' : ''}${done ? ' et-proof__key--done' : ''}`}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span>Finger {note.finger} on</span>
                    <strong>{proofPitchName(note.pitch)}</strong>
                    <i aria-hidden="true">{done ? '✓' : ''}</i>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      );
    }

    const memoryHidden =
      exerciseMode === 'blind-memory' &&
      (status === 'prompt' || status === 'leadin' || status === 'listening');
    const memoryWaiting = exerciseMode === 'blind-memory' && status === 'prompt';
    const memoryDigit = Math.max(0, Math.ceil(memorySecondsRemaining));

    return (
      <section className={`et-exercise et-exercise--${status} et-exercise--mode-${exerciseMode}`}>
        <span className="et-mode-chip et-mode-chip--inline">
          {exerciseMode === 'blind-memory'
            ? 'Remember it'
            : exerciseMode === 'anchor-shift'
              ? 'Move positions'
              : 'Play the phrase'}
        </span>
        <p className="et-instruction">{instruction}</p>

        <div className={`et-piece-progress${status === 'listening' ? ' et-piece-progress--live' : ''}`}>
          <div className="et-piece-progress__meta">
            <span>{status === 'memory-preview' ? 'Look' : status === 'listening' ? 'Playing' : 'Progress'}</span>
            <span ref={progressLabelRef}>0%</span>
          </div>
          <div
            ref={progressTrackRef}
            className="et-piece-progress__track"
            role="progressbar"
            aria-label="Progress through this piece"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
          >
            <span ref={progressFillRef} className="et-piece-progress__fill" />
          </div>
        </div>

        <div className={`et-cue et-cue--${status}${memoryHidden ? ` et-cue--memory-${blindMemory?.hideStyle ?? 'vanish'}` : ''}`}>
          {anchorShift ? (
            <div className="et-shift-map" aria-label={`Shift from ${anchorShift.fromPositionName} to ${anchorShift.toPositionName}`}>
              <span>{anchorShift.fromPositionName}</span>
              <i aria-hidden="true"><b />→<b /></i>
              <span>{anchorShift.toPositionName}</span>
            </div>
          ) : null}
          <div className="et-cue__content" aria-hidden={memoryHidden}>{children}</div>
          {memoryHidden ? (
            <div className="et-memory-hidden" role="status">
              <strong>{memoryWaiting ? 'Tap Start to see the notes.' : 'Play from memory.'}</strong>
            </div>
          ) : null}
        </div>

        <div className="et-well" aria-live="polite">
          <div className={`et-panel${status === 'prompt' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'prompt'}>
            <button
              type="button"
              className="et-start"
              onClick={onStart}
              disabled={micStatus === 'requesting'}
              tabIndex={status === 'prompt' ? 0 : -1}
            >
              <span className="et-start__dot"><RecordDot /></span>
              {startLabel}
            </button>
            <p className={`et-panel__sub${micBlocked ? ' et-panel__sub--alert' : ''}`}>
              {micMessage ?? (
                exerciseMode === 'blind-memory'
                  ? 'You will see the notes for 3 seconds.'
                  : exerciseMode === 'anchor-shift'
                    ? 'Move when you see the arrow.'
                    : 'Listen to the count-in. Then play.'
              )}
            </p>
          </div>

          <div className={`et-panel${status === 'memory-preview' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'memory-preview'}>
            <div className="et-memory-count">
              <span className="et-memory-count__ring" style={{ '--et-memory-progress': `${(memorySecondsRemaining / Math.max(1, blindMemory?.previewSeconds ?? 3)) * 360}deg` } as React.CSSProperties}>
                <strong>{memoryDigit}</strong>
              </span>
              <span>Look at the notes.</span>
            </div>
          </div>

          <div className={`et-panel${status === 'leadin' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'leadin'}>
            <div className="et-leadin">
              <span
                key={`lead-${beatLabel}`}
                className={`et-leadin__beat${isDownbeat ? ' et-leadin__beat--go' : ''}`}
              >
                {beatLabel}
              </span>
              <span className="et-leadin__label">
                {isDownbeat ? 'Play next!' : 'Get ready'}
              </span>
            </div>
          </div>

          <div className={`et-panel${status === 'listening' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'listening'}>
            <div className="et-record">
              <span key={`beat-${beatLabel}`} className="et-record__beat">
                {beatLabel}
              </span>

              <div className="et-record__side">
                <span className="et-record__mic">
                  <span className="et-listen__halo" />
                  <MicIcon />
                </span>

                <span className="et-meter">
                  {Array.from({ length: METER_BARS }, (_, i) => {
                    const threshold = (i + 1) / METER_BARS;
                    return (
                      <span
                        key={i}
                        className={`et-meter__bar${level >= threshold ? ' et-meter__bar--lit' : ''}`}
                        style={{ height: `${12 + i * 3.5}px` }}
                      />
                    );
                  })}
                </span>
              </div>
            </div>

            <span className="et-listen__label">
              {detectedNotes.length > 0
                ? detectedNotes.slice(-8).join('  ·  ')
                : 'Recording — play along with the clicks'}
            </span>
          </div>
        </div>
      </section>
    );
  },
);

export default ExerciseView;
