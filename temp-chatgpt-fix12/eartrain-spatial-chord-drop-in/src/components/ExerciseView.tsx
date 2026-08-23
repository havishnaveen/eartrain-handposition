import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { Hand } from 'lucide-react';
import { pitchToMidi } from '../audio/timing';
import type { DetectedNote, DrillPlan, GradeResult } from '../audio/timing';
import type {
  AnchorShiftSpec,
  BlindMemorySpec,
  ExerciseMode,
  HandScope,
  PositionProofSpec,
  SpatialChordSpec,
} from '../curriculum/types';
import ExerciseReport from './ExerciseReport';
import './exercise.css';

export type ExerciseStatus =
  | 'position-prompt'
  | 'proving'
  | 'proof-success'
  | 'chord-cue'
  | 'chord-root'
  | 'chord-build'
  | 'prompt'
  | 'memory-preview'
  | 'leadin'
  | 'listening'
  | 'grading'
  | 'report';
export type ExerciseOutcome = 'success' | 'failure';
export type MicStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error';
export type OrientationNoticeKind = 'register' | 'left-hand' | 'both-hands';

export interface OrientationNotice {
  kind: OrientationNoticeKind;
  title: string;
  message: string;
}

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
  handScope?: HandScope;
  blindMemory?: BlindMemorySpec;
  anchorShift?: AnchorShiftSpec;
  spatialChord?: SpatialChordSpec;
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
  spatialProgress?: 0 | 1 | 2 | 3;
  spatialFoundMidi?: readonly number[];
  spatialWrongGuesses?: number;
  orientationNotice?: OrientationNotice | null;
  onAcknowledgeOrientation?: () => void;
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

function HandBadge({ hand }: { hand: 'right' | 'left' }) {
  const label = hand === 'right' ? 'Right Hand' : 'Left Hand';
  return (
    <figure className={`et-hand-badge et-hand-badge--${hand}`} aria-label={label}>
      <div className="et-hand-badge__tile">
        <span className="et-hand-badge__shine" aria-hidden="true" />
        <Hand className="et-hand-badge__icon" strokeWidth={1.45} aria-hidden="true" />
        <figcaption className="et-hand-badge__label">{label}</figcaption>
      </div>
    </figure>
  );
}

function HandRequirement({ scope }: { scope: HandScope }) {
  const hands = scope === 'both' ? (['left', 'right'] as const) : ([scope] as const);
  return (
    <div className={`et-hand-requirement et-hand-requirement--${scope}`}>
      {hands.map((hand) => <HandBadge key={hand} hand={hand} />)}
    </div>
  );
}

function OrientationCallout({
  notice,
  onAcknowledge,
}: {
  notice: OrientationNotice;
  onAcknowledge?: () => void;
}) {
  return (
    <aside
      className={`et-orientation-tip et-orientation-tip--${notice.kind}`}
      role="dialog"
      aria-label={notice.title}
    >
      <span className="et-orientation-tip__pointer" aria-hidden="true" />
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
      </div>
      <button type="button" onClick={onAcknowledge} autoFocus>Okay</button>
    </aside>
  );
}

/** Child-friendly register name for the position's first (anchor) note. */
export function proofRegisterLabel(pitch: string): string {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(pitch.trim());
  if (!match) return proofPitchName(pitch);
  const [, noteName, octaveText] = match;
  const octave = Number(octaveText);
  const register = octave <= 3 ? 'Bass' : octave >= 5 ? 'Treble' : 'Middle';
  return `${register} ${noteName}`;
}

/** Diatonic staff steps preserve musical height without revealing hidden tones. */
function spatialStaffStep(pitch: string, hand: 'right' | 'left'): number {
  const match = /^([A-G])(?:#|b)?(-?\d+)$/.exec(pitch.trim());
  if (!match) return 0;
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const absoluteStep = Number(match[2]) * 7 + letters.indexOf(match[1]);
  // The bottom line is E4 in treble and G2 in bass.
  const bottomLine = hand === 'right' ? 4 * 7 + 2 : 2 * 7 + 4;
  return Math.max(-3, Math.min(12, absoluteStep - bottomLine));
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
      handScope,
      blindMemory,
      anchorShift,
      spatialChord,
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
      spatialProgress = 0,
      spatialFoundMidi = [],
      spatialWrongGuesses = 0,
      orientationNotice = null,
      onAcknowledgeOrientation,
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

    if (exerciseMode === 'spatial-chord' && spatialChord) {
      const isCue = status === 'chord-cue';
      const isRootSearch = status === 'chord-root';
      const isShapeSearch = status === 'chord-build';
      const isSearching = isRootSearch || isShapeSearch;
      const rootName = proofPitchName(spatialChord.rootPitch);
      const foundPitches = spatialFoundMidi.length > 0
        ? spatialChord.chordPitches.filter((pitch) => {
            const midi = pitchToMidi(pitch);
            return midi !== null && spatialFoundMidi.includes(midi);
          })
        : spatialChord.chordPitches.slice(0, spatialProgress);
      const layerLabels = spatialChord.context.layers.map((layer) => (
        layer === 'pad' ? 'Soft pad' :
          layer === 'bass' ? 'Bass' :
            layer === 'pulse' ? 'Beat' : 'Strings'
      ));

      return (
        <section className={`et-spatial et-spatial--${status}`} aria-live="polite">
          <div className="et-spatial__ambient" aria-hidden="true"><i /><i /><i /></div>
          <header className="et-spatial__header">
            <span className="et-mode-chip">Chord by ear</span>
            <h2>
              {isCue
                ? 'Listen for the piano'
                : isShapeSearch
                  ? 'Build the chord shape'
                  : 'Find the root note'}
            </h2>
            <p>
              {isCue
                ? 'Follow the clear piano sound.'
                : isShapeSearch
                  ? 'Now use spatial recognition to find the rest of the chord.'
                  : 'Play the note the chord grows from.'}
            </p>
            {orientationNotice ? (
              <OrientationCallout
                notice={orientationNotice}
                onAcknowledge={onAcknowledgeOrientation}
              />
            ) : null}
          </header>

          <div className="et-spatial__body">
            <div className={`et-spatial__mix${isCue ? ' et-spatial__mix--playing' : ''}`} aria-label="Instrument layers">
              <span className="et-spatial__instrument et-spatial__instrument--target">
                <i className="et-spatial__piano" aria-hidden="true"><b /><b /><b /></i>
                <strong>Piano</strong>
                <small>Listen here</small>
              </span>
              {layerLabels.map((label) => (
                <span className="et-spatial__instrument" key={label}>
                  <i className="et-spatial__wave" aria-hidden="true" />
                  <strong>{label}</strong>
                </span>
              ))}
            </div>

            <div className="et-spatial__staff" aria-label="Chord tones found on the staff">
              <span className="et-spatial__clef" aria-hidden="true">
                {spatialChord.hand === 'right' ? '𝄞' : '𝄢'}
              </span>
              <span className="et-spatial__staff-lines" aria-hidden="true">
                <i /><i /><i /><i /><i />
              </span>
              {foundPitches.map((pitch) => (
                <span
                  className="et-spatial__staff-note"
                  key={`staff-${pitch}`}
                  style={{
                    '--et-staff-step': spatialStaffStep(pitch, spatialChord.hand),
                    '--et-staff-left': `${38 + spatialChord.chordPitches.indexOf(pitch) * 20}%`,
                  } as React.CSSProperties}
                >
                  <i aria-hidden="true" />
                  <strong>{proofPitchName(pitch)}</strong>
                </span>
              ))}
              {foundPitches.length === 0 ? (
                <span className="et-spatial__staff-empty">Listen, then play the root</span>
              ) : null}
            </div>

            <div className="et-spatial__tones" aria-label="Chord tones found">
              {spatialChord.chordPitches.map((pitch, index) => {
                const midi = pitchToMidi(pitch);
                const found = spatialFoundMidi.length > 0
                  ? midi !== null && spatialFoundMidi.includes(midi)
                  : spatialProgress > index;
                const root = index === 0;
                return (
                  <div
                    key={pitch}
                    className={`et-spatial__tone${root ? ' et-spatial__tone--root' : ''}${found ? ' et-spatial__tone--found' : ''}`}
                  >
                    <span>{root ? 'Root' : index === 1 ? 'Middle' : 'Top'}</span>
                    <strong>{found ? proofPitchName(pitch) : '?'}</strong>
                    <i aria-hidden="true">{found ? '✓' : ''}</i>
                  </div>
                );
              })}
            </div>

            <div className="et-spatial__action">
              <HandRequirement scope={handScope ?? spatialChord.hand} />
              {status === 'prompt' ? (
                <button
                  type="button"
                  className="et-start et-spatial__start"
                  onClick={onStart}
                  disabled={micStatus === 'requesting'}
                >
                  <span className="et-start__dot"><RecordDot /></span>
                  Hear the chord
                </button>
              ) : null}
              {isCue ? (
                <div className="et-spatial__listening" role="status">
                  <span className="et-spatial__equalizer" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  <strong>Piano is playing</strong>
                </div>
              ) : null}
              {isSearching ? (
                <div className="et-spatial__recording" role="status">
                  <span className="et-record__mic"><span className="et-listen__halo" /><MicIcon /></span>
                  <div>
                    <strong>{isRootSearch ? 'Play the root' : 'Find the other two notes'}</strong>
                    <small>
                      {spatialWrongGuesses > 0
                        ? `${spatialWrongGuesses} ${spatialWrongGuesses === 1 ? 'try' : 'tries'} so far`
                        : detectedNotes.length > 0
                          ? detectedNotes.slice(-3).join(' · ')
                          : 'Listening…'}
                    </small>
                  </div>
                </div>
              ) : null}
              {micMessage ? (
                <p className={`et-proof__mic-message${micBlocked ? ' et-proof__mic-message--alert' : ''}`}>
                  {micMessage}
                </p>
              ) : null}
              {isShapeSearch && foundPitches.length > 0 ? (
                <span className="et-spatial__root-lock">Root locked: {rootName}</span>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    if (
      exerciseMode === 'prove-it' &&
      (status === 'position-prompt' || status === 'proving' || status === 'proof-success')
    ) {
      const proofNotes = positionProof?.proofNotes ?? [
        { pitch: 'C4', finger: 1 as const },
        { pitch: 'E4', finger: 2 as const },
        { pitch: 'G4', finger: 3 as const },
      ];
      const requiredHands: HandScope = handScope ?? positionProof?.hand ?? 'right';
      return (
        <section className={`et-proof et-proof--${status}`} aria-live="polite">
          <div className="et-proof__halo" aria-hidden="true"><span /><span /><span /></div>
          <div className="et-proof__layout">
            <div className="et-proof__identity">
              <h2 className="et-proof__title">
                {proofPositionTitle(positionProof?.positionName)}
              </h2>
              <HandRequirement scope={requiredHands} />
              <p className="et-proof__register">
                {proofRegisterLabel(proofNotes[0].pitch)}
              </p>

              {orientationNotice ? (
                <OrientationCallout
                  notice={orientationNotice}
                  onAcknowledge={onAcknowledgeOrientation}
                />
              ) : null}

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
                .join(', then ') + `. Start in the ${proofRegisterLabel(proofNotes[0].pitch)} register.`}
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
        {orientationNotice ? (
          <OrientationCallout
            notice={orientationNotice}
            onAcknowledge={onAcknowledgeOrientation}
          />
        ) : null}
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
