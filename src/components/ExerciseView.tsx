import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { midiToName, pitchToMidi } from '../audio/timing';
import type { DetectedNote, DrillPlan, GradeResult } from '../audio/timing';
import type {
  AnchorShiftSpec,
  BlindMemorySpec,
  CueSpec,
  ExerciseMode,
  HandScope,
  PositionProofSpec,
  SpatialChordSpec,
} from '../curriculum/types';
import ExerciseReport from './ExerciseReport';
import LessonPanel from './LessonPanel';
import StaffCue from './StaffCue';
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
export type OrientationNoticeKind = 'register' | 'left-hand' | 'both-hands' | 'dual-proof';

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
  positionProofIndex?: number;
  positionProofCount?: number;
  handScope?: HandScope;
  blindMemory?: BlindMemorySpec;
  anchorShift?: AnchorShiftSpec;
  spatialChord?: SpatialChordSpec;
  memorySecondsRemaining?: number;
  analysisProgress?: number;
  children?: ReactNode;

  onStart?: () => void;
  /** Only ever offered during the count-in, before the downbeat hands off to recording. */
  onCancelStart?: () => void;
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
  /** True when the chord-by-ear demo's samples failed to load over the network. */
  spatialAudioIssue?: boolean;
  /** Re-plays the chord demo without leaving the current search. */
  onReplayChord?: () => void;
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

function PerformanceAnalysis({ progress }: { progress: number }) {
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const displayedRef = useRef(0);
  const startedAtRef = useRef(performance.now());
  const complete = progress >= 100;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const value = complete ? 100 : 96;
      displayedRef.current = value;
      setDisplayedProgress(value);
      return undefined;
    }

    let frame = 0;
    const completionStartedAt = performance.now();
    const completionStart = displayedRef.current;
    const advance = (now: number) => {
      if (complete) {
        const elapsed = (now - completionStartedAt) / 320;
        const t = Math.min(1, Math.max(0, elapsed));
        const easeOut = 1 - Math.pow(1 - t, 3);
        const next = Math.min(100, completionStart + (100 - completionStart) * easeOut);
        displayedRef.current = next;
        setDisplayedProgress(next);
        if (t < 1) {
          frame = requestAnimationFrame(advance);
        }
      } else {
        const tSeconds = Math.max(0, (now - startedAtRef.current) / 1000);
        // Multi-phase dynamic pacing: starts with a lively curve, settles into a smooth glide,
        // and asymptotically eases towards 98% so it never hits an abrupt ceiling.
        const phase1 = 1 - Math.exp(-tSeconds * 2.2);
        const phase2 = 1 - Math.exp(-tSeconds * 0.4);
        const target = phase1 * 58 + phase2 * 40;
        const next = Math.min(98, Math.max(displayedRef.current, target));
        displayedRef.current = next;
        setDisplayedProgress(next);
        frame = requestAnimationFrame(advance);
      }
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [complete]);

  const percent = Math.max(0, Math.min(100, Math.round(displayedProgress)));
  return (
    <section className="et-analysis" role="status" aria-live="polite" aria-label="Analyzing your performance">
      <div className="et-analysis__card">
        <header className="et-analysis__header">
          <span><i /> Performance review</span>
          <small>{percent}% complete</small>
        </header>
        <div className="et-analysis__score" aria-hidden="true">
          <span className="et-analysis__staff"><i /><i /><i /><i /><i /></span>
          <b className="et-analysis__note et-analysis__note--one">♪</b>
          <b className="et-analysis__note et-analysis__note--two">♪</b>
          <b className="et-analysis__note et-analysis__note--three">♫</b>
          <b className="et-analysis__note et-analysis__note--four">♪</b>
          <b className="et-analysis__note et-analysis__note--five">♪</b>
          <b className="et-analysis__note et-analysis__note--six">♫</b>
          <b className="et-analysis__note et-analysis__note--seven">♪</b>
          <b className="et-analysis__note et-analysis__note--eight">♪</b>
          <span className="et-analysis__scan" />
        </div>
        <div className="et-analysis__copy">
          <h2>Shaping your feedback</h2>
          <p>Checking the details that make your playing musical.</p>
        </div>
        <div className="et-analysis__checks" aria-hidden="true">
          <span><i /> Pitch</span>
          <span><i /> Rhythm</span>
          <span><i /> Clarity</span>
        </div>
        <div
          className="et-analysis__progress"
          role="progressbar"
          aria-label="Grading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="et-analysis__progress-track">
            <i
              className="et-analysis__progress-fill"
              style={{ transform: `scaleX(${displayedProgress / 100})` }}
            />
          </span>
          <strong>{percent}%</strong>
        </div>
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

/** Same split as `proofRegisterLabel`, kept separate so the checklist can
 * size the register word and the note letter independently — "Middle C" set
 * at one huge font size wraps onto two lines and reads worse than either
 * part alone. */
function proofPitchToStaffKey(pitch: string): string {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(pitch);
  return match ? `${match[1].toLowerCase()}${match[2]}/${match[3]}` : 'c/4';
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
      positionProofIndex = 0,
      positionProofCount = 1,
      blindMemory,
      anchorShift,
      spatialChord,
      memorySecondsRemaining = 3,
      analysisProgress = 0,
      children,
      onStart,
      onCancelStart,
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
      spatialAudioIssue = false,
      onReplayChord,
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
      return <PerformanceAnalysis progress={analysisProgress} />;
    }

    const level = Math.min(1, Math.max(0, inputLevel));
    const micMessage = MIC_MESSAGE[micStatus];
    const micBlocked = micStatus === 'denied' || micStatus === 'unsupported' || micStatus === 'error';
    const startBlocked = micStatus === 'requesting' || Boolean(orientationNotice);

    const showingPositionGate =
      status === 'position-prompt' || status === 'proving' || status === 'proof-success';
    if (exerciseMode === 'spatial-chord' && spatialChord && !showingPositionGate) {
      const isCue = status === 'chord-cue';
      const isListening = status === 'chord-root' || status === 'chord-build';
      const isComplete = status === 'chord-complete';
      const referencePitches = spatialChord.chordPitches.map((pitch) => {
        const midi = pitchToMidi(pitch);
        return midi === null ? pitch : midiToName(midi - 2);
      });
      const referenceCue: CueSpec = {
        keySignature: 'C',
        showTimeSignature: false,
        staves: [{
          clef: spatialChord.hand === 'right' ? 'treble' : 'bass',
          hand: spatialChord.hand,
          notes: [{
            keys: referencePitches.map(proofPitchToStaffKey),
            duration: 'w',
          }],
        }],
      };

      const spatialHeaderText = status === 'prompt'
        ? 'Study the reference chord, then find the nearby hidden one by feel.'
        : isComplete
          ? `${spatialChord.chordName} matched.`
          : isListening
            ? 'Use the reference shape and the distance you heard.'
            : null;

      return (
        <section className={`et-spatial et-spatial--${status}`} aria-live="polite">
          <header className="et-spatial__header">
            <span className="et-mode-chip">Chord by ear</span>
            <h2>{isComplete ? 'Chord found' : isListening ? 'Play the hidden chord' : 'Hear the nearby chord'}</h2>
            {spatialHeaderText ? <p>{spatialHeaderText}</p> : null}
            {orientationNotice ? (
              <OrientationCallout
                notice={orientationNotice}
                onAcknowledge={onAcknowledgeOrientation}
              />
            ) : null}
          </header>

          <div className="et-spatial__single-stage">
            <div className="et-spatial__cue-card et-spatial__reference-card">
              <small className="et-spatial__reference-label">Visible reference chord</small>
              <StaffCue cue={referenceCue} notationScale={2} accentColor="#ef6a47" inkColor="#242237" />
              {isCue ? (
                <div className="et-spatial__listening" role="status">
                  <span className="et-spatial__equalizer" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  <span><strong>Listen…</strong><small>Visible reference → hidden target</small></span>
                </div>
              ) : null}
            </div>

            {isListening ? (
              <div className="et-spatial__piano-response" role="status">
                <div className="et-spatial__response-progress" aria-label={`${spatialProgress} of 3 target chord tones heard`}>
                  {[0, 1, 2].map((index) => (
                    <i key={index} className={index < spatialProgress ? 'is-heard' : ''} />
                  ))}
                </div>
                <strong>{spatialProgress === 0 ? 'Listening…' : `${spatialProgress} of 3 tones heard`}</strong>
                <span className="et-spatial__mic-level" aria-hidden="true"><i style={{ transform: `scaleX(${level})` }} /></span>
                {spatialFoundMidi.length > 0 ? <small>Keep the correct tones held and adjust the shape.</small> : null}
                <button type="button" className="et-spatial__replay" onClick={onReplayChord ?? NOOP}>↻ Hear both chords again</button>
              </div>
            ) : null}

            {spatialAudioIssue ? (
              <div className="et-spatial__audio-issue" role="alert">
                <span>We couldn't load the demonstration clearly.</span>
                <button type="button" onClick={onReplayChord ?? NOOP}>Play again</button>
              </div>
            ) : null}

            {isComplete ? (
              <div className="et-spatial__finished is-success">
                <span aria-hidden="true">✓</span>
                <p>{spatialChord.chordName}</p>
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
                Hear the target
              </button>
            ) : null}
            {isComplete ? (
              <button type="button" className="et-start et-spatial__start" onClick={onNext ?? NOOP}>
                <span className="et-start__dot"><RecordDot /></span>
                {nextLabel}
              </button>
            ) : null}
          </footer>
        </section>
      );
    }

    if (
      positionProof &&
      (status === 'position-prompt' || status === 'proving' || status === 'proof-success')
    ) {
      const proofHand = positionProof.hand;
      const proofNotes = positionProof.proofNotes;
      const proofHandLabel = proofHand === 'right' ? 'RIGHT HAND' : 'LEFT HAND';
      const proofSequenceLabel = positionProofCount > 1
        ? `${proofHandLabel} check ${positionProofIndex + 1} of ${positionProofCount}`
        : `${proofHandLabel} check`;
      const activeProofIndex = Math.min(proofProgress, proofNotes.length - 1);
      const activeProofNote = proofNotes[activeProofIndex];
      // Only the single note the student needs right now — echoing all three
      // proof notes here duplicated the identity card's own staff and made
      // two displays disagree about which one mattered this instant.
      const proofCue: CueSpec = {
        keySignature: 'C',
        timeSignature: '4/4',
        showTimeSignature: false,
        staves: [{
          clef: proofHand === 'right' ? 'treble' : 'bass',
          hand: proofHand,
          notes: [{
            keys: [proofPitchToStaffKey(activeProofNote.pitch)],
            duration: 'q',
            finger: activeProofNote.finger,
            anchor: status !== 'proof-success',
          }],
        }],
      };
      // Prove It maps three anchor notes in sequence. It deliberately avoids
      // acoustic key-release judgments, which are unreliable across rooms.
      return (
        <section className={`et-proof et-proof--${status}`} aria-live="polite">
          <div className="et-proof__halo" aria-hidden="true"><span /><span /><span /></div>
          <div className={`et-proof__layout${status !== 'position-prompt' ? ' et-proof__layout--active' : ''}`}>
            <div className="et-proof__identity">
              <LessonPanel
                keyName={proofPositionTitle(positionProof?.positionName)}
                hands={[proofHand]}
                subtitle={status === 'position-prompt'
                  ? `${proofSequenceLabel}. Set the hand shape, then start.`
                  : 'Play each highlighted note once.'}
                onStart={status === 'position-prompt' ? onStart : undefined}
                disabled={startBlocked}
                activeFinger={status === 'position-prompt' ? undefined : activeProofNote.finger}
                showHandLabel={true}
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

            {status !== 'position-prompt' ? <div className="et-proof__task">
              <div className="et-proof__card">
                <div className="et-proof__eyebrow">
                  {status === 'proof-success'
                    ? `${proofHandLabel} DONE`
                    : `${proofHandLabel} · CHECK ${positionProofIndex + 1} OF ${positionProofCount} · STEP ${Math.min(proofProgress + 1, proofNotes.length)} OF ${proofNotes.length}`}
                </div>
                <div className="et-proof__headline">
                  {status === 'proof-success'
                    ? 'Nice work! 🎉'
                    : `Play ${proofPitchName(activeProofNote.pitch)}`}
                </div>
                {status !== 'proof-success' ? (
                  <div className="et-proof__mini-score" aria-label={`Note ${proofPitchName(activeProofNote.pitch)}, finger ${activeProofNote.finger}`}>
                    <StaffCue
                      cue={proofCue}
                      notationScale={2.3}
                      accentColor="#ef6a47"
                      inkColor="#242237"
                    />
                  </div>
                ) : null}
                <div className="et-proof__steps" aria-hidden="true">
                  {proofNotes.map((note, index) => {
                    const done = index < proofProgress || status === 'proof-success';
                    const active = !done && index === activeProofIndex;
                    return (
                      <span
                        key={note.pitch + index}
                        className={`et-proof__step-dot${done ? ' et-proof__step-dot--done' : active ? ' et-proof__step-dot--active' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div> : null}
          </div>
        </section>
      );
    }

    const isBlindMemory = exerciseMode === 'blind-memory';
    const memoryHidden =
      isBlindMemory &&
      (status === 'prompt' || status === 'leadin' || status === 'listening');
    const memoryWaiting = isBlindMemory && status === 'prompt';
    const hideUntilStart = status === 'prompt' && exerciseMode !== 'standard';
    const memoryPreviewSeconds = blindMemory?.previewSeconds ?? 6;
    const shiftWaitBeats = anchorShift?.timedShift?.waitBeats ?? 0;
    const isChordReading = exerciseMode === 'standard' && /stacked chord/i.test(instruction);
    const memoryDigit = Math.max(0, Math.ceil(memorySecondsRemaining));
    const showPieceProgress = status === 'listening';
    const visibleInstruction = isBlindMemory
      ? status === 'memory-preview'
        ? 'Find the pattern and remember it.'
        : ''
      : exerciseMode === 'anchor-shift'
        ? status === 'prompt' ? '' : 'Play, move, continue.'
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
              : isChordReading
                ? 'Read melody + chords'
                : 'Play the phrase'}
        </span>
        {isBlindMemory ? (
          <div className="et-kid-steps" aria-label="Remember it steps">
            <span className={status === 'prompt' || status === 'memory-preview' ? 'is-active' : 'is-done'}><b>1</b> Look</span>
            <span className={status === 'leadin' ? 'is-active' : status === 'listening' ? 'is-done' : ''}><b>2</b> Hide</span>
            <span className={status === 'listening' ? 'is-active' : ''}><b>3</b> Play</span>
          </div>
        ) : exerciseMode === 'anchor-shift' ? (
          <div className="et-kid-steps et-kid-steps--shift" aria-label="Timed hand switch steps">
            <span className={status === 'prompt' || status === 'leadin' ? 'is-active' : ''}><b>1</b> Play</span>
            <span><b>2</b> Move</span>
            <span><b>3</b> Continue</span>
          </div>
        ) : null}
        {visibleInstruction ? <p className="et-instruction">{visibleInstruction}</p> : null}

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

        <div className={`et-cue et-cue--${status}${memoryHidden ? ` et-cue--memory-${blindMemory?.hideStyle ?? 'vanish'}` : ''}${hideUntilStart ? ' et-cue--start-hidden' : ''}`}>
          <div className="et-cue__content" aria-hidden={memoryHidden || hideUntilStart}>{children}</div>
          {memoryHidden ? (
            <div className="et-memory-hidden" role="status">
              <span className="et-memory-hidden__mark" aria-hidden="true">{memoryWaiting ? memoryPreviewSeconds : '✓'}</span>
              <strong>{memoryWaiting ? `Start for a ${memoryPreviewSeconds}-second look.` : 'The notes are hidden.'}</strong>
              <span>{memoryWaiting ? 'Then play from memory.' : 'Play what you remember.'}</span>
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
            {micMessage || exerciseMode === 'anchor-shift' ? (
              <p className={`et-panel__sub${micBlocked ? ' et-panel__sub--alert' : ''}`}>
                {micMessage ?? (
                  shiftWaitBeats > 0
                    ? 'Shift on 1–2, set the hand on 3–4, then play.'
                    : 'Move when the arrow lights up.'
                )}
              </p>
            ) : null}
          </div>

          <div className={`et-panel${status === 'memory-preview' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'memory-preview'}>
            <div className="et-memory-count">
              <span className="et-memory-count__ring" style={{ '--et-memory-progress': `${(memorySecondsRemaining / Math.max(1, blindMemory?.previewSeconds ?? 3)) * 360}deg` } as CSSProperties}>
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
              {onCancelStart ? (
                <button
                  type="button"
                  className="et-leadin__cancel"
                  onClick={onCancelStart}
                  disabled={isDownbeat}
                  aria-label="Cancel and go back"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div className={`et-panel${status === 'listening' ? ' et-panel--on' : ''}`} aria-hidden={status !== 'listening'}>
            <div className="et-record">
              <span
                key={`beat-${beatLabel}`}
                className="et-record__beat"
              >
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

            {detectedNotes.length > 0 ? (
              <span className="et-listen__label">{detectedNotes.slice(-8).join('  ·  ')}</span>
            ) : null}
          </div>
        </div>
      </section>
    );
  },
);

export default ExerciseView;
