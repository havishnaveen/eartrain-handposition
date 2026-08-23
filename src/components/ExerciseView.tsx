import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { Hand } from 'lucide-react';
import type { DetectedNote, DrillPlan, GradeResult } from '../audio/timing';
import type { ProofHoldFailure } from '../audio/useDrillAudio';
import type {
  AnchorShiftSpec,
  BlindMemorySpec,
  ExerciseMode,
  HandScope,
  PositionProofSpec,
  SpatialChordSpec,
} from '../curriculum/types';
import ExerciseReport from './ExerciseReport';
import LessonPanel from './LessonPanel';
import './exercise.css';

export type ExerciseStatus =
  | 'position-prompt'
  | 'proving'
  | 'proof-success'
  | 'chord-cue'
  | 'chord-root'
  | 'chord-build'
  | 'chord-complete'
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
  buttonLabel?: string;
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
  proofHoldFailure?: ProofHoldFailure | null;
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

function joinChildFriendlyList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
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
    <div className="et-orientation-gate">
      <aside
        className={`et-orientation-tip et-orientation-tip--${notice.kind}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={notice.title}
      >
        <span className="et-orientation-tip__pointer" aria-hidden="true" />
        <span className="et-orientation-tip__stop" aria-hidden="true">!</span>
        <div>
          <strong>{notice.title}</strong>
          <p>{notice.message}</p>
        </div>
        <button type="button" onClick={onAcknowledge} autoFocus>
          {notice.buttonLabel ?? 'I understand'}
        </button>
      </aside>
    </div>
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
      proofHoldFailure = null,
      spatialProgress = 0,
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

    if (status === 'grading') {
      return exerciseMode === 'spatial-chord' ? (
        <section className="et-spatial et-spatial--checking" role="status" aria-live="polite">
          <div className="et-spatial__ambient" aria-hidden="true"><i /><i /><i /></div>
          <div className="et-spatial__checkmark" aria-hidden="true">✓</div>
          <h2>Shape heard</h2>
          <p>Saving your progress…</p>
        </section>
      ) : <PerformanceAnalysis />;
    }

    const level = Math.min(1, Math.max(0, inputLevel));
    const micMessage = MIC_MESSAGE[micStatus];
    const micBlocked = micStatus === 'denied' || micStatus === 'unsupported' || micStatus === 'error';
    const startBlocked = micStatus === 'requesting' || Boolean(orientationNotice);

    if (exerciseMode === 'spatial-chord' && spatialChord) {
      const isCue = status === 'chord-cue';
      const isRootSearch = status === 'chord-root';
      const isShapeSearch = status === 'chord-build';
      const isComplete = status === 'chord-complete';
      const isSearching = isRootSearch || isShapeSearch;
      const rootName = proofPitchName(spatialChord.rootPitch);
      const handName = spatialChord.hand === 'right' ? 'Right Hand' : 'Left Hand';
      const rootFinger = spatialChord.hand === 'right' ? 1 : 5;
      const outerFinger = spatialChord.hand === 'right' ? 5 : 1;
      const orderedToneEntries = spatialChord.buildOrder.map((chordIndex, stepIndex) => ({
        chordIndex,
        stepIndex,
        pitch: spatialChord.chordPitches[chordIndex],
        finger: chordIndex === 0 ? rootFinger : chordIndex === 2 ? outerFinger : 3,
      }));
      const activeStep = isRootSearch ? 0 : isShapeSearch ? Math.min(2, spatialProgress) : -1;
      const activeTone = activeStep >= 0 ? orderedToneEntries[activeStep] : null;
      const chordSucceeded = Boolean(report?.passed);
      const matchedAnchor = spatialChord.rootSupport === 'matched';
      const activeAction = activeStep === 0
        ? matchedAnchor
          ? `Copy the first note with Finger ${rootFinger}`
          : `Play ${rootName} with Finger ${rootFinger}`
        : activeStep === 1
          ? `Keep ${rootName}. Reach with Finger ${activeTone?.finger ?? outerFinger}`
          : activeStep === 2
            ? 'Keep the outside shape. Add Finger 3.'
            : '';
      const activeAnswer = activeStep === 0 && matchedAnchor
        ? '♪'
        : activeStep === 0
          ? rootName
          : activeStep === 1
            ? `${rootFinger} — ${outerFinger}`
            : '1 · 3 · 5';
      const activeHint = activeStep === 0
        ? `${handName} · Finger ${rootFinger}`
        : activeStep === 1
          ? 'Leave the anchor in place'
          : 'The middle note fits inside the shape';

      return (
        <section className={`et-spatial et-spatial--${status}`} aria-live="polite">
          <div className="et-spatial__ambient" aria-hidden="true"><i /><i /><i /></div>
          <header className="et-spatial__header">
            <span className="et-mode-chip">Chord by ear</span>
            <h2>
              {status === 'prompt'
                ? '1. Hear the chord'
                : isCue
                  ? '1. Listen only'
                  : isComplete
                    ? chordSucceeded ? 'Shape complete' : 'Let’s try once more'
                  : isRootSearch
                    ? '2. Copy one note'
                    : '3. Build the hand shape'}
            </h2>
            <p>
              {status === 'prompt'
                ? `${handName}. Tap the button once.`
                : isCue
                  ? 'Hands still. Hear it together, then one note at a time.'
                  : isComplete
                    ? chordSucceeded
                      ? 'You found the whole hand shape.'
                      : 'Hear it again, then rebuild the shape.'
                : isRootSearch
                  ? 'Play only the first note you heard.'
                  : isShapeSearch
                    ? 'Keep each found key down while you add the next.'
                  : ''}
            </p>
            {orientationNotice ? (
              <OrientationCallout
                notice={orientationNotice}
                onAcknowledge={onAcknowledgeOrientation}
              />
            ) : null}
          </header>

          <div className="et-spatial__single-stage">
            {status === 'prompt' ? (
              <div className="et-spatial__intro" aria-label={`${handName} for ${spatialChord.chordName}`}>
                <HandRequirement scope={spatialChord.hand} />
              </div>
            ) : null}

            {isCue ? (
              <div className="et-spatial__cue-card">
                <div className="et-spatial__notation">{children}</div>
                <div className="et-spatial__listening" role="status">
                  <span className="et-spatial__equalizer" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  <span><strong>Listen</strong><small>Together, then broken</small></span>
                </div>
              </div>
            ) : null}

            {isSearching && activeTone ? (
              <div className="et-spatial__answer-card">
                <div className="et-spatial__step-dots" aria-label={`Step ${activeStep + 1} of 3`}>
                  {[0, 1, 2].map((step) => (
                    <i
                      key={step}
                      className={step < spatialProgress
                        ? 'is-done'
                        : step === activeStep ? 'is-active' : ''}
                    />
                  ))}
                </div>
                <span>Step {activeStep + 1} of 3</span>
                <strong className={activeStep === 0 && matchedAnchor ? 'is-listen-symbol' : ''}>
                  {activeAnswer}
                </strong>
                <p>{activeAction}</p>
                <small>{activeHint}</small>
                <div className="et-spatial__recording" role="status">
                  <span className="et-record__mic"><span className="et-listen__halo" /><MicIcon /></span>
                  <div>
                    <b>{spatialWrongGuesses > 0 ? 'Try one nearby key' : 'Listening'}</b>
                    <small>Listening…</small>
                  </div>
                </div>
              </div>
            ) : null}

            {isComplete ? (
              <div className={`et-spatial__finished${chordSucceeded ? ' is-success' : ''}`}>
                <span aria-hidden="true">{chordSucceeded ? '✓' : '↻'}</span>
                <p>{chordSucceeded ? `${spatialChord.chordName} is set.` : 'The shape is not finished yet.'}</p>
              </div>
            ) : null}
          </div>

          <footer className="et-spatial__action">
            {status === 'prompt' ? (
              <button
                type="button"
                className="et-start et-spatial__start"
                onClick={onStart}
                disabled={startBlocked}
              >
                <span className="et-start__dot"><RecordDot /></span>
                Hear the chord
              </button>
            ) : null}
            {isComplete ? (
              <button type="button" className="et-start et-spatial__start" onClick={onNext ?? NOOP}>
                <span className="et-start__dot"><RecordDot /></span>
                {nextLabel}
              </button>
            ) : null}
            {micMessage ? (
              <p className={`et-proof__mic-message${micBlocked ? ' et-proof__mic-message--alert' : ''}`}>
                {micMessage}
              </p>
            ) : null}
          </footer>
        </section>
      );
    }

    if (
      exerciseMode === 'prove-it' &&
      (status === 'position-prompt' || status === 'proving' || status === 'proof-success')
    ) {
      const requiredHands: HandScope = handScope ?? positionProof?.hand ?? 'right';
      const suppliedProofNotes = positionProof?.proofNotes ?? [
        { pitch: 'C4', finger: 1 as const },
        { pitch: 'E4', finger: 3 as const },
        { pitch: 'G4', finger: 5 as const },
      ];
      // Normalize legacy Prove It data at the rendering boundary. A three-note
      // position uses the root, third, and fifth fingers—not consecutive 1-2-3.
      const proofFingers = requiredHands === 'left'
        ? ([5, 3, 1] as const)
        : ([1, 3, 5] as const);
      const proofNotes = suppliedProofNotes.map((note, index) => ({
        ...note,
        finger: proofFingers[index] ?? note.finger,
      }));
      const anchorRegister = proofRegisterLabel(proofNotes[0].pitch);

      const proofHandLabel = requiredHands === 'left' ? 'Left Hand' : 'Right Hand';
      const releasedKeyMessage = proofHoldFailure
        ? joinChildFriendlyList(proofHoldFailure.releasedNoteIndices.map((index) => {
            const note = proofNotes[index];
            return `${proofHandLabel} Finger ${note.finger} on ${proofRegisterLabel(note.pitch)}`;
          }))
        : '';
      return (
        <section className={`et-proof et-proof--${status}`} aria-live="polite">
          <div className="et-proof__halo" aria-hidden="true"><span /><span /><span /></div>
          <div className="et-proof__layout">
            <div className="et-proof__identity">
              <LessonPanel
                keyName={proofPositionTitle(positionProof?.positionName)}
                hands={requiredHands === 'both' ? ['left', 'right'] : [requiredHands]}
                subtitle={instruction}
                onStart={status === 'position-prompt' ? onStart : undefined}
                disabled={startBlocked}
              />

              {orientationNotice ? (
                <OrientationCallout
                  notice={orientationNotice}
                  onAcknowledge={onAcknowledgeOrientation}
                />
              ) : null}

              {micMessage ? (
                <p className={`et-proof__mic-message${micBlocked ? ' et-proof__mic-message--alert' : ''}`}>
                  {micMessage}
                </p>
              ) : null}
            </div>

            <div className="et-proof__task" style={{ alignSelf: 'center' }}>
              <div className="et-proof__dynamic-step" style={{ textAlign: 'center', background: 'rgba(255, 253, 251, 0.96)', padding: '40px 20px', borderRadius: '24px 24px 24px 9px', border: '1px solid rgba(239, 106, 71, 0.3)', boxShadow: '0 14px 34px rgba(81, 51, 40, 0.1)', width: '100%' }}>
                {status === 'proof-success' ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 820, color: '#c74a27', marginBottom: '12px', letterSpacing: '0.11em' }}>SUCCESS</div>
                    <div style={{ fontSize: '28px', fontWeight: 860, color: '#ef6a47', lineHeight: 1.2 }}>Great job!</div>
                  </>
                ) : proofHoldFailure ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 820, color: '#f84c4c', marginBottom: '12px', letterSpacing: '0.11em' }}>TRY AGAIN</div>
                    <div style={{ fontSize: '28px', fontWeight: 860, color: '#ef6a47', lineHeight: 1.2 }}>You didn&apos;t hold <strong>{releasedKeyMessage}</strong>.</div>
                    <div style={{ fontSize: '18px', fontWeight: 760, color: '#6f687b', lineHeight: 1.4, marginTop: '18px' }}>Start again. Keep every key down while you add the next finger.</div>
                  </>
                ) : proofProgress === 0 ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 820, color: '#c74a27', marginBottom: '12px', letterSpacing: '0.11em' }}>STEP 1</div>
                    <div style={{ fontSize: '28px', fontWeight: 860, color: '#ef6a47', lineHeight: 1.2 }}>Hold <strong>{proofHandLabel} Finger {proofNotes[0].finger}</strong> on <strong>{anchorRegister}</strong></div>
                  </>
                ) : proofProgress === 1 ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 820, color: '#c74a27', marginBottom: '12px', letterSpacing: '0.11em' }}>STEP 2</div>
                    <div style={{ fontSize: '28px', fontWeight: 860, color: '#ef6a47', lineHeight: 1.2 }}>Keep holding that key.<br/><br/>Add <strong>Finger {proofNotes[1].finger}</strong> on <strong>{proofPitchName(proofNotes[1].pitch)}</strong></div>
                  </>
                ) : proofProgress === 2 ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 820, color: '#c74a27', marginBottom: '12px', letterSpacing: '0.11em' }}>STEP 3</div>
                    <div style={{ fontSize: '28px', fontWeight: 860, color: '#ef6a47', lineHeight: 1.2 }}>Keep holding both keys.<br/><br/>Add <strong>Finger {proofNotes[2].finger}</strong> on <strong>{proofPitchName(proofNotes[2].pitch)}</strong></div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 820, color: '#c74a27', marginBottom: '12px', letterSpacing: '0.11em' }}>HOLD STEADY</div>
                    <div style={{ fontSize: '28px', fontWeight: 860, color: '#ef6a47', lineHeight: 1.2 }}>Don't let go...</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    const isBlindMemory = exerciseMode === 'blind-memory';
    const memoryHidden =
      isBlindMemory &&
      (status === 'prompt' || status === 'leadin' || status === 'listening');
    const memoryWaiting = isBlindMemory && status === 'prompt';
    const memoryDigit = Math.max(0, Math.ceil(memorySecondsRemaining));
    const showPieceProgress = status === 'listening';
    const visibleInstruction = isBlindMemory
      ? status === 'memory-preview'
        ? 'Remember these notes.'
        : status === 'leadin' || status === 'listening'
          ? 'Now play from memory.'
          : 'Ready to remember?'
      : exerciseMode === 'anchor-shift'
        ? 'Play the first card. Move when the arrow lights up.'
        : instruction;

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
              ? 'Move your hand'
              : 'Play the phrase'}
        </span>
        {isBlindMemory ? (
          <div className="et-kid-steps" aria-label="Remember it steps">
            <span className={status === 'prompt' || status === 'memory-preview' ? 'is-active' : 'is-done'}><b>1</b> Look for 3 seconds</span>
            <span className={status === 'leadin' ? 'is-active' : status === 'listening' ? 'is-done' : ''}><b>2</b> Notes hide</span>
            <span className={status === 'listening' ? 'is-active' : ''}><b>3</b> Play from memory</span>
          </div>
        ) : exerciseMode === 'anchor-shift' ? (
          <div className="et-kid-steps et-kid-steps--shift" aria-label="Move your hand steps">
            <span><b>1</b> Play the first box</span>
            <span><b>2</b> Move at the arrow</span>
            <span><b>3</b> Play the second box</span>
          </div>
        ) : null}
        <p className="et-instruction">{visibleInstruction}</p>

        <div
          className={`et-piece-progress${showPieceProgress ? ' et-piece-progress--live' : ' et-piece-progress--waiting'}`}
          aria-hidden={!showPieceProgress}
        >
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
          <div className="et-cue__content" aria-hidden={memoryHidden}>{children}</div>
          {memoryHidden ? (
            <div className="et-memory-hidden" role="status">
              <span className="et-memory-hidden__mark" aria-hidden="true">{memoryWaiting ? '3' : '✓'}</span>
              <strong>{memoryWaiting ? 'Tap Start for a 3-second look.' : 'The notes are hidden.'}</strong>
              <span>{memoryWaiting ? 'Then they disappear.' : 'Play what you remember.'}</span>
            </div>
          ) : null}
        </div>

        <div className="et-well" aria-live="polite">
          <div className={`et-panel${status === 'prompt' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'prompt'}>
            <button
              type="button"
              className="et-start"
              onClick={onStart}
              disabled={startBlocked}
              tabIndex={status === 'prompt' ? 0 : -1}
            >
              <span className="et-start__dot"><RecordDot /></span>
              {startLabel}
            </button>
            <p className={`et-panel__sub${micBlocked ? ' et-panel__sub--alert' : ''}`}>
              {micMessage ?? (
                exerciseMode === 'blind-memory'
                  ? 'Tap once. Look carefully. Then play.'
                  : exerciseMode === 'anchor-shift'
                    ? `Start in ${anchorShift?.fromPositionName ?? 'the first position'}. When MOVE lights up, land in ${anchorShift?.toPositionName ?? 'the second position'}.`
                    : 'Listen to the two-measure count in. Then play.'
              )}
            </p>
          </div>

          <div className={`et-panel${status === 'memory-preview' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'memory-preview'}>
            <div className="et-memory-count">
              <span className="et-memory-count__ring" style={{ '--et-memory-progress': `${(memorySecondsRemaining / Math.max(1, blindMemory?.previewSeconds ?? 3)) * 360}deg` } as React.CSSProperties}>
                <strong>{memoryDigit}</strong>
              </span>
              <span>Look now — they will disappear.</span>
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
