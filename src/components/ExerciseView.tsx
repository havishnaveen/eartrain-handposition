import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Hand } from 'lucide-react';
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
  spatialWrongGuesses?: number;
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

function PerformanceAnalysis() {
  return (
    <section className="et-analysis" role="status" aria-live="polite" aria-label="Analyzing your performance">
      <div className="et-analysis__card">
        <header className="et-analysis__header">
          <span><i /> Performance review</span>
          <small>Listening back</small>
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
        <span className="et-analysis__progress" aria-hidden="true"><i /></span>
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
function proofRegisterParts(pitch: string): { register: string; noteName: string } {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(pitch.trim());
  if (!match) return { register: '', noteName: proofPitchName(pitch) };
  const [, noteName, octaveText] = match;
  const octave = Number(octaveText);
  const register = octave <= 3 ? 'Bass' : octave >= 5 ? 'Treble' : 'Middle';
  return { register, noteName };
}

function FingerHandCue({
  finger,
  hand,
  done = false,
}: {
  finger: number;
  hand: 'right' | 'left';
  done?: boolean;
}) {
  const fingerParts = [1, 2, 3, 4, 5];
  return (
    <figure
      className={`et-finger-hand et-finger-hand--${hand}${done ? ' is-done' : ''}`}
      aria-label={`${hand === 'right' ? 'Right' : 'Left'} hand, finger ${finger}`}
    >
      <svg viewBox="0 0 96 82" role="img" aria-hidden="true">
        <rect className="et-finger-hand__palm" x="30" y="38" width="46" height="37" rx="17" />
        <rect className={finger === 1 ? 'is-active' : ''} x="15" y="42" width="28" height="14" rx="7" transform="rotate(-27 29 49)" />
        <rect className={finger === 2 ? 'is-active' : ''} x="31" y="12" width="11" height="37" rx="6" />
        <rect className={finger === 3 ? 'is-active' : ''} x="44" y="5" width="11" height="44" rx="6" />
        <rect className={finger === 4 ? 'is-active' : ''} x="57" y="10" width="11" height="39" rx="6" />
        <rect className={finger === 5 ? 'is-active' : ''} x="70" y="20" width="10" height="31" rx="5" />
        {fingerParts.map((number) => number === finger ? (
          <text key={number} x={number === 1 ? 25 : 23 + number * 13} y={number === 1 ? 52 : number === 3 ? 19 : number === 5 ? 35 : 27}>
            {number}
          </text>
        ) : null)}
      </svg>
    </figure>
  );
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
      spatialWrongGuesses = 0,
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
      return <PerformanceAnalysis />;
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
      const anchorIsShown = spatialChord.rootSupport === 'shown';
      const heldAnchorLabel = anchorIsShown ? rootName : 'the bottom note';
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
      const activeAction = activeStep === 0
        ? anchorIsShown
          ? `Play the given ${rootName} anchor with Finger ${rootFinger}`
          : `Match the bottom broken note with Finger ${rootFinger}`
        : activeStep === 1
          ? `Keep ${heldAnchorLabel}. Find the chord's middle sound with Finger 3`
          : activeStep === 2
            ? `Keep both keys down. Complete the sound with Finger ${outerFinger}`
            : '';
      const activeAnswer = activeStep === 0
        ? anchorIsShown ? rootName : 'Bottom note'
        : activeStep === 1
          ? 'Finger 3'
          : `Finger ${outerFinger}`;
      const activeHint = activeStep === 0
        ? anchorIsShown
          ? 'The anchor is supplied—this is not a perfect-pitch test'
          : 'Use the first note of the broken example—no perfect pitch needed'
        : activeStep === 1
          ? spatialWrongGuesses >= 3
            ? 'Compare nearby keys to the broken-chord replay'
            : 'Listen to the distance above the anchor'
          : 'Sound all three together—the brief check confirms the chord';
      const retryMessage = activeStep === 0
        ? anchorIsShown
          ? `That was not the given ${rootName}. Return to the anchor.`
          : 'That did not match the bottom broken note. Replay and compare.'
        : activeStep === 1
          ? 'Middle tone missed. Replay and match the second sound in 1–3–5.'
          : 'Outside tone missed. Replay and match the final sound in 1–3–5.';

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
                ? anchorIsShown
                  ? `${rootName} is supplied. Hear the chord whole, then copy its 1–3–5 shape without seeing the other notes.`
                  : 'Hear the chord whole, then use the broken example to find its bottom note and copy the shape.'
                : isCue
                  ? `First hear the chord together. Then hear its notes as 1–3–5.`
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
              <div className="et-spatial__intro" aria-label={`${handName} chord listening exercise`}>
                <HandRequirement scope={spatialChord.hand} />
              </div>
            ) : null}

            {isCue ? (
              <div className="et-spatial__cue-card">
                <div
                  className="et-spatial__listen-passes"
                  aria-label={anchorIsShown
                    ? `${rootName} is supplied; the other chord tones remain hidden`
                    : 'All note names remain hidden; match the blocked and broken piano examples'}
                >
                  <div className="et-spatial__listen-pass">
                    <small>1 · Whole chord</small>
                    <span className="et-spatial__chord-dots" aria-hidden="true"><i /><i /><i /></span>
                    <strong>One blended sound</strong>
                  </div>
                  <div className="et-spatial__listen-pass">
                    <small>2 · Broken notes</small>
                    <span className="et-spatial__finger-shape" aria-hidden="true">1 · 3 · 5</span>
                    <strong>Bottom · middle · top</strong>
                  </div>
                </div>
                <div className="et-spatial__listening" role="status">
                  <span className="et-spatial__equalizer" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  <span><strong>Chord, then broken notes</strong><small>Only the target is played</small></span>
                </div>
                {spatialAudioIssue ? (
                  <div className="et-spatial__audio-issue" role="alert">
                    <span>We couldn't load the sound clearly.</span>
                    <button type="button" onClick={onReplayChord ?? NOOP}>Play again</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isSearching && activeTone ? (
              <div className="et-spatial__answer-card et-spatial__answer-card--ear">
                <div className="et-spatial__anchor-strip">
                  <span>{anchorIsShown ? 'Given anchor' : 'Match by ear'}</span>
                  <strong>{anchorIsShown ? rootName : 'Hidden'}</strong>
                  <small>{handName} · Finger {rootFinger}</small>
                </div>
                <div className="et-spatial__tones" aria-label={`Step ${activeStep + 1} of 3`}>
                  {orderedToneEntries.map((tone, step) => {
                    const done = step < spatialProgress;
                    const active = step === activeStep;
                    return (
                      <div
                        key={tone.chordIndex}
                        className={`et-spatial__tone${done ? ' et-spatial__tone--found' : active ? ' et-spatial__tone--active' : ''}`}
                      >
                        <span className="et-spatial__step-number">{done ? '✓' : step + 1}</span>
                        <div className="et-spatial__tone-copy">
                          <small>Finger</small>
                          <strong>{tone.finger}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <strong>{activeAnswer}</strong>
                <p>{activeAction}</p>
                <small>{activeHint}</small>
                <div className="et-spatial__recording" role="status">
                  <span className="et-record__mic"><span className="et-listen__halo" /><MicIcon /></span>
                  <div>
                    <b>{spatialWrongGuesses > 0 ? 'Try again' : 'Listening'}</b>
                    <small>{spatialWrongGuesses > 0 ? retryMessage : 'Play when you are ready…'}</small>
                  </div>
                </div>
                {spatialAudioIssue ? (
                  <div className="et-spatial__audio-issue" role="alert">
                    <span>The demo may not have played. Not sure what you heard?</span>
                    <button type="button" onClick={onReplayChord ?? NOOP}>Play again</button>
                  </div>
                ) : (
                  <button type="button" className="et-spatial__replay" onClick={onReplayChord ?? NOOP}>
                    ↻ Hear it again
                  </button>
                )}
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
      const proofHandLabel = requiredHands === 'left' ? 'Left Hand' : 'Right Hand';
      // Prove It maps three anchor notes in sequence. It deliberately avoids
      // acoustic key-release judgments, which are unreliable across rooms.
      return (
        <section className={`et-proof et-proof--${status}`} aria-live="polite">
          <div className="et-proof__halo" aria-hidden="true"><span /><span /><span /></div>
          <div className={`et-proof__layout${status === 'position-prompt' ? ' et-proof__layout--ready' : ''}`}>
            <div className="et-proof__identity">
              <LessonPanel
                keyName={proofPositionTitle(positionProof?.positionName)}
                hands={requiredHands === 'both' ? ['left', 'right'] : [requiredHands]}
                subtitle={status === 'position-prompt'
                  ? `${proofHandLabel} ready? The notes appear after Start.`
                  : `Play the three notes one after another with your ${proofHandLabel.toLowerCase()}.`}
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

            {status !== 'position-prompt' ? <div className="et-proof__task">
              <div className="et-proof__card">
                <div className="et-proof__eyebrow">
                  {status === 'proof-success' ? 'DONE' : `STEP ${Math.min(proofProgress + 1, proofNotes.length)} OF ${proofNotes.length}`}
                </div>
                <div className="et-proof__headline">
                  {status === 'proof-success'
                    ? 'Nice work! 🎉'
                    : `Play ${proofPitchName(proofNotes[Math.min(proofProgress, proofNotes.length - 1)].pitch)}`}
                </div>
                <ul className="et-proof__keys">
                  {proofNotes.map((note, index) => {
                    const keyState = index < proofProgress || status === 'proof-success'
                      ? 'done'
                      : index === proofProgress
                        ? 'active'
                        : null;
                    const { register, noteName } = proofRegisterParts(note.pitch);
                    return (
                      <li
                        key={note.pitch + index}
                        className={keyState ? `et-proof__key et-proof__key--${keyState}` : 'et-proof__key'}
                      >
                        <span className="et-proof__key-note">
                          {register ? <small className="et-proof__key-register">{register}</small> : null}
                          <strong>{noteName}</strong>
                        </span>
                        <FingerHandCue
                          finger={note.finger}
                          hand={requiredHands === 'left' ? 'left' : 'right'}
                          done={keyState === 'done'}
                        />
                        <i aria-hidden="true">{keyState === 'done' ? '✓' : '•'}</i>
                      </li>
                    );
                  })}
                </ul>
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
    const shiftWaitSeconds = anchorShift?.timedShift?.waitSeconds;
    const isChordReading = exerciseMode === 'standard' && /stacked chord/i.test(instruction);
    const memoryDigit = Math.max(0, Math.ceil(memorySecondsRemaining));
    const showPieceProgress = status === 'listening';
    const visibleInstruction = isBlindMemory
      ? status === 'memory-preview'
        ? 'Find the pattern and remember it.'
        : status === 'leadin' || status === 'listening'
          ? 'Now play from memory.'
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
          {hideUntilStart && !memoryHidden ? (
            <div className="et-start-hidden" role="status">
              <span aria-hidden="true">♪</span>
              <strong>Ready when you are</strong>
              <small>The exercise appears after Start.</small>
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
                  ? `You will have ${memoryPreviewSeconds} seconds to look.`
                  : exerciseMode === 'anchor-shift'
                    ? shiftWaitSeconds
                      ? `A ${shiftWaitSeconds}-second move timer appears during the exercise.`
                      : 'Move when the arrow lights up.'
                    : 'Listen to the two-measure count in. Then play.'
              )}
            </p>
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
