import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { midiToName, pitchToMidi } from '../audio/timing';
import type { DetectedNote, DrillPlan, ExtraKind, GradeResult } from '../audio/timing';
import './exercise-report.css';

export interface ExerciseReportProps {
  result: GradeResult;
  expectedMusic?: ReactNode;
  plan?: DrillPlan | null;
  detectedNotes?: readonly DetectedNote[];
  playStartTime?: number;
  recordingUrl?: string | null;
  onPlaybackFrame?: (beat: number) => void;
  onPlaybackEnd?: () => void;
  onNext: () => void;
  nextLabel?: string;
}

const AUTO_ADVANCE_MS = 15000;
const AUTO_ADVANCE_TICK_MS = 50;

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
);

const FocusIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const PlayIcon = ({ paused }: { paused: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM14 5h4v14h-4z" />}
  </svg>
);

function scoreMessage(axis: 'pitch' | 'timing' | 'cleanliness', value: number | null): string {
  if (value === null) return 'This drill did not include rhythm scoring.';
  if (axis === 'pitch') {
    if (value >= 4.5) return 'The written notes were played accurately and in order.';
    if (value >= 3.5) return 'Nearly there—review the missed notes before moving on.';
    return 'Slow down and confirm the starting position before playing.';
  }
  if (axis === 'timing') {
    if (value >= 4.5) return 'Your note attacks stayed closely aligned with the beat.';
    if (value >= 3.5) return 'Mostly steady—listen through the count-in before starting.';
    return 'Try a slower internal count and aim each note at a click.';
  }
  if (value >= 4.5) return 'A clean take with no meaningful stray notes.';
  if (value >= 3.5) return 'A few small sounds were detected around the played notes.';
  return 'Release each key clearly and avoid correcting notes mid-phrase.';
}

function ScoreMeter({
  label,
  value,
  axis,
  message,
  compact = false,
}: {
  label: string;
  value: number | null;
  axis: 'pitch' | 'timing' | 'cleanliness';
  message?: string;
  compact?: boolean;
}) {
  const safeValue = value === null ? 0 : Math.min(5, Math.max(0, value));
  const style = { '--et-report-score': `${(safeValue / 5) * 100}%` } as CSSProperties;

  return (
    <article className={`et-report-score${value === null ? ' et-report-score--na' : ''}${compact ? ' et-report-score--compact' : ''}`}>
      <div className="et-report-score__top">
        <h3>{label}</h3>
        <p>
          {value === null ? <span className="et-report-score__na">Not scored</span> : <><strong>{value.toFixed(1)}</strong><span>/5</span></>}
        </p>
      </div>
      <div
        className="et-report-score__track"
        role="progressbar"
        aria-label={`${label} score`}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? 'Not scored' : `${value.toFixed(1)} out of 5`}
      >
        <span className="et-report-score__fill" style={style} />
      </div>
      {compact ? null : (
        <p className="et-report-score__message">{message ?? scoreMessage(axis, value)}</p>
      )}
    </article>
  );
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}

function noteKind(note: DetectedNote, result: GradeResult): ExtraKind | 'correct' {
  const extra = result.extras.find(
    (candidate) => candidate.midi === note.midi && Math.abs(candidate.time - note.time) < 0.025,
  );
  return extra?.kind ?? 'correct';
}

interface PitchLaneRange {
  low: number;
  high: number;
}

const PIANO_LOW_MIDI = 21;
const PIANO_HIGH_MIDI = 108;
const MIN_LANE_SPAN_SEMITONES = 12;
const LANE_EDGE_PADDING_SEMITONES = 2;
const LANE_TOP_PERCENT = 18;
const LANE_BOTTOM_PERCENT = 82;

/**
 * Build a stable pitch window for this drill. Including expected pitches
 * prevents one stray extreme detection from defining the whole scale; a
 * minimum octave of range keeps adjacent notes visually honest instead of
 * exaggerating a semitone into the full lane height.
 */
export function pitchLaneRange(
  detectedNotes: readonly DetectedNote[],
  plan?: DrillPlan | null,
): PitchLaneRange {
  const midis = [
    ...detectedNotes.map((note) => note.midi),
    ...(plan?.notes
      .map((note) => note.pitch ? pitchToMidi(note.pitch) : null)
      .filter((midi): midi is number => midi !== null) ?? []),
  ].filter((midi) => Number.isFinite(midi));

  if (midis.length === 0) return { low: 54, high: 66 };

  const observedLow = Math.min(...midis);
  const observedHigh = Math.max(...midis);
  const center = (observedLow + observedHigh) / 2;
  const span = Math.max(
    MIN_LANE_SPAN_SEMITONES,
    observedHigh - observedLow + LANE_EDGE_PADDING_SEMITONES * 2,
  );

  let low = center - span / 2;
  let high = center + span / 2;
  if (low < PIANO_LOW_MIDI) {
    high += PIANO_LOW_MIDI - low;
    low = PIANO_LOW_MIDI;
  }
  if (high > PIANO_HIGH_MIDI) {
    low -= high - PIANO_HIGH_MIDI;
    high = PIANO_HIGH_MIDI;
  }

  return {
    low: Math.max(PIANO_LOW_MIDI, low),
    high: Math.min(PIANO_HIGH_MIDI, high),
  };
}

/** Higher MIDI always maps upward; identical MIDI always maps identically. */
export function pitchLaneTopPercent(midi: number, range: PitchLaneRange): number {
  const span = Math.max(1, range.high - range.low);
  const normalized = Math.min(1, Math.max(0, (midi - range.low) / span));
  return LANE_BOTTOM_PERCENT - normalized * (LANE_BOTTOM_PERCENT - LANE_TOP_PERCENT);
}

interface PerformanceReplayProps {
  result: GradeResult;
  expectedMusic?: ReactNode;
  plan?: DrillPlan | null;
  detectedNotes: readonly DetectedNote[];
  playStartTime: number;
  recordingUrl: string | null;
  onPlaybackFrame?: (beat: number) => void;
  onPlaybackEnd?: () => void;
}

function PerformanceReplay({
  result,
  expectedMusic,
  plan,
  detectedNotes,
  playStartTime,
  recordingUrl,
  onPlaybackFrame,
  onPlaybackEnd,
}: PerformanceReplayProps) {
  const fallbackDuration = Math.max(1, plan?.recordSeconds ?? 1);
  const [duration, setDuration] = useState(fallbackDuration);
  const durationRef = useRef(fallbackDuration);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const waveformProgressRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef(0);
  const fallbackStartedAtRef = useRef(0);
  const lastUiUpdateRef = useRef(0);

  const relativeNotes = useMemo(
    () => detectedNotes.map((note) => ({
      note,
      name: midiToName(note.midi),
      second: Math.max(0, note.time - playStartTime),
      kind: noteKind(note, result),
    })),
    [detectedNotes, playStartTime, result],
  );

  const lanePitchRange = useMemo(
    () => pitchLaneRange(detectedNotes, plan),
    [detectedNotes, plan],
  );

  const visualDuration = Math.max(
    1,
    plan?.recordSeconds ?? 0,
    relativeNotes[relativeNotes.length - 1]?.second ?? 0,
    duration,
  );

  const waveform = useMemo(() => {
    const maxStrength = Math.max(1, ...detectedNotes.map((note) => note.strength));
    return Array.from({ length: 72 }, (_, index) => {
      const position = index / 71;
      const nearby = relativeNotes.filter(
        (event) => Math.abs(event.second / visualDuration - position) < 0.035,
      );
      const eventEnergy = nearby.length === 0
        ? 0
        : Math.max(...nearby.map((event) => event.note.strength / maxStrength));
      const texture = 0.12 + Math.abs(Math.sin(index * 1.73)) * 0.16;
      return Math.round(8 + Math.min(1, texture + eventEnergy * 0.72) * 30);
    });
  }, [detectedNotes, relativeNotes, visualDuration]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
  }, []);

  const paintProgress = useCallback((seconds: number) => {
    const normalized = Math.min(1, Math.max(0, seconds / Math.max(0.01, durationRef.current)));
    if (playheadRef.current) playheadRef.current.style.left = `${normalized * 100}%`;
    if (waveformProgressRef.current) {
      waveformProgressRef.current.style.transform = `scaleX(${normalized})`;
    }
  }, []);

  const finishPlayback = useCallback(() => {
    stopAnimation();
    setIsPlaying(false);
    setCurrentTime(duration);
    paintProgress(duration);
    const finalBeat = plan ? plan.totalBeats : duration;
    onPlaybackFrame?.(finalBeat);
    onPlaybackEnd?.();
  }, [duration, onPlaybackEnd, onPlaybackFrame, paintProgress, plan, stopAnimation]);

  const updatePlayback = useCallback(() => {
    const audio = audioRef.current;
    const nextTime = recordingUrl && audio
      ? audio.currentTime
      : (performance.now() - fallbackStartedAtRef.current) / 1000;
    const capped = Math.min(duration, Math.max(0, nextTime));
    paintProgress(capped);

    // The playhead still moves at display refresh rate through refs, while
    // the heavyweight report/staff tree rerenders only a few times a second.
    if (performance.now() - lastUiUpdateRef.current > 160 || capped >= duration) {
      lastUiUpdateRef.current = performance.now();
      setCurrentTime(capped);
    }
    if (plan) onPlaybackFrame?.(Math.min(plan.totalBeats, capped / plan.secondsPerBeat));

    if (capped >= duration || (recordingUrl && audio?.ended)) {
      finishPlayback();
      return;
    }
    animationRef.current = requestAnimationFrame(updatePlayback);
  }, [duration, finishPlayback, onPlaybackFrame, paintProgress, plan, recordingUrl]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (isPlaying) {
      audio?.pause();
      stopAnimation();
      setIsPlaying(false);
      return;
    }

    const startAt = currentTime >= duration - 0.05 ? 0 : currentTime;
    setCurrentTime(startAt);
    paintProgress(startAt);
    if (plan) onPlaybackFrame?.(startAt / plan.secondsPerBeat);

    if (recordingUrl && audio) {
      audio.currentTime = startAt;
      audio.muted = false;
      audio.volume = 1;
      void audio.play().then(() => {
        setPlaybackError(null);
        setIsPlaying(true);
        animationRef.current = requestAnimationFrame(updatePlayback);
      }).catch(() => {
        setIsPlaying(false);
        setPlaybackError('This browser could not play the recorded take.');
      });
      return;
    }

    fallbackStartedAtRef.current = performance.now() - startAt * 1000;
    setIsPlaying(true);
    animationRef.current = requestAnimationFrame(updatePlayback);
  }, [currentTime, duration, isPlaying, onPlaybackFrame, paintProgress, plan, recordingUrl, stopAnimation, updatePlayback]);

  useEffect(() => {
    durationRef.current = fallbackDuration;
    setDuration(fallbackDuration);
    setCurrentTime(0);
    paintProgress(0);
    setPlaybackError(null);
    const audio = audioRef.current;
    if (recordingUrl && audio) audio.load();
  }, [fallbackDuration, paintProgress, recordingUrl]);

  useEffect(() => () => {
    stopAnimation();
    audioRef.current?.pause();
    onPlaybackEnd?.();
  }, [onPlaybackEnd, stopAnimation]);

  return (
    <section className="et-replay" aria-labelledby="et-replay-title">
      <div className="et-replay__heading">
        <div>
          <p className="et-report__section-kicker">See and hear your take</p>
          <h3 id="et-replay-title">Performance playback</h3>
        </div>
      </div>

      <div className="et-replay__score">
        <div className="et-replay__expected-label">Expected music</div>
        <div className="et-replay__staff">{expectedMusic}</div>

        <div className="et-replay__played-label">Your performance</div>
        <div className="et-replay__note-lane" aria-label="Notes detected in your performance">
          {relativeNotes.length === 0 ? (
            <span className="et-replay__empty">No played notes were detected.</span>
          ) : relativeNotes.map((event, index) => {
            const left = `${Math.min(96, Math.max(4, (event.second / visualDuration) * 100))}%`;
            const top = `${pitchLaneTopPercent(event.note.midi, lanePitchRange)}%`;
            const active = Math.abs(currentTime - event.second) < 0.3;
            return (
              <span
                key={`${event.note.time}-${event.note.midi}-${index}`}
                className={`et-replay-note et-replay-note--${event.kind}${active ? ' et-replay-note--active' : ''}`}
                style={{ left, top }}
                title={`${event.name} at ${event.second.toFixed(2)} seconds`}
              >
                {event.name}
              </span>
            );
          })}
          <span ref={playheadRef} className="et-replay__lane-playhead" />
        </div>
      </div>

      <div className="et-replay__transport">
        <audio
          ref={audioRef}
          src={recordingUrl ?? undefined}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
              durationRef.current = nextDuration;
              setDuration(nextDuration);
            }
            setPlaybackError(null);
          }}
          onCanPlay={() => setPlaybackError(null)}
          onError={() => setPlaybackError('This browser could not decode the recorded take.')}
          onEnded={finishPlayback}
        />
        <button
          type="button"
          className="et-replay__play"
          onClick={togglePlayback}
          aria-label={isPlaying ? 'Pause your performance' : 'Play your performance'}
        >
          <PlayIcon paused={!isPlaying} />
        </button>
        <div className="et-replay__waveform" aria-hidden="true">
          <span ref={waveformProgressRef} className="et-replay__waveform-progress" />
          <span className="et-replay__waveform-bars">
            {waveform.map((height, index) => (
              <i key={index} style={{ height: `${height}px` }} />
            ))}
          </span>
        </div>
        <span className="et-replay__time">
          {formatTime(currentTime)} <i>/</i> {formatTime(duration)}
        </span>
      </div>
      {playbackError ? (
        <p className="et-replay__audio-note et-replay__audio-note--error">{playbackError}</p>
      ) : !recordingUrl ? (
        <p className="et-replay__audio-note">Visual replay is available; audio playback is not supported by this browser.</p>
      ) : null}
    </section>
  );
}

// Retained temporarily for the future instructor dashboard. Student reports
// intentionally do not render audio or the detected-note timeline.
void PerformanceReplay;

export function ExerciseReport({
  result,
  onNext,
  nextLabel = 'Next Drill',
}: ExerciseReportProps) {
  // Detailed detections, duration evidence, transitions, and recognition
  // diagnostics remain in telemetry for the future teacher dashboard. The
  // child sees only the overall score, three categories, and one useful fact.
  const [remainingMs, setRemainingMs] = useState(AUTO_ADVANCE_MS);
  const [isStaying, setIsStaying] = useState(false);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const countdownTickRef = useRef<number | null>(null);
  const didAdvanceRef = useRef(false);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (countdownTickRef.current !== null) {
      window.clearInterval(countdownTickRef.current);
      countdownTickRef.current = null;
    }
  }, []);

  const moveNext = useCallback(() => {
    if (didAdvanceRef.current) return;
    didAdvanceRef.current = true;
    clearAutoAdvance();
    onNextRef.current();
  }, [clearAutoAdvance]);

  useEffect(() => {
    const deadline = performance.now() + AUTO_ADVANCE_MS;
    setRemainingMs(AUTO_ADVANCE_MS);
    countdownTickRef.current = window.setInterval(() => {
      setRemainingMs(Math.max(0, deadline - performance.now()));
    }, AUTO_ADVANCE_TICK_MS);
    autoAdvanceTimerRef.current = window.setTimeout(moveNext, AUTO_ADVANCE_MS);
    return clearAutoAdvance;
  }, [clearAutoAdvance, moveNext]);

  const stayHere = useCallback(() => {
    clearAutoAdvance();
    setIsStaying(true);
  }, [clearAutoAdvance]);

  const countdownSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const countdownStyle = {
    '--et-auto-progress': `${Math.max(0, Math.min(100, (remainingMs / AUTO_ADVANCE_MS) * 100))}%`,
  } as CSSProperties;

  return (
    <section className={`et-report et-report--${result.passed ? 'success' : 'focus'}`} aria-labelledby="exercise-report-title">
      <header className="et-report__hero">
        <div className="et-report__verdict-mark">
          {result.passed ? <CheckIcon /> : <FocusIcon />}
        </div>
        <div className="et-report__heading">
          <p className="et-report__eyebrow">Performance report</p>
          <h2 id="exercise-report-title">
            {result.passed ? 'Drill complete' : 'A few things to refine'}
          </h2>
          <p className="et-report__summary">{result.detail}</p>
        </div>
        <div className="et-report__overall" aria-label={`Overall score ${result.scores.overall.toFixed(1)} out of 5`}>
          <strong>{result.scores.overall.toFixed(1)}</strong>
          <span>out of 5</span>
          <small>Overall</small>
        </div>
      </header>

      <div className="et-report__scores" aria-label="Score breakdown">
        <ScoreMeter
          label="Pitch"
          value={result.scores.pitch}
          axis="pitch"
          compact
        />
        <ScoreMeter
          label="Timing"
          value={result.scores.timing}
          axis="timing"
          compact
        />
        <ScoreMeter
          label="Cleanliness"
          value={result.scores.cleanliness}
          axis="cleanliness"
          compact
        />
      </div>

      <section className="et-report__essential" aria-label={`${result.matched} of ${result.expectedCount} notes matched`}>
        <span aria-hidden="true">{result.missed === 0 ? '✓' : '♪'}</span>
        <p>
          <strong>{result.matched} of {result.expectedCount} notes matched</strong>
          <small>{result.missed === 0 ? 'Every written note was heard.' : `${result.missed} ${result.missed === 1 ? 'note needs' : 'notes need'} another try.`}</small>
        </p>
      </section>

      <footer className="et-report__footer">
        <div
          className={`et-report-auto${isStaying ? ' et-report-auto--staying' : ''}`}
          style={countdownStyle}
          role="status"
          aria-label={isStaying ? 'Automatic advance cancelled' : `Next drill in ${countdownSeconds} seconds`}
        >
          <span className="et-report-auto__dial" aria-hidden="true">
            <i><strong>{isStaying ? '✓' : countdownSeconds}</strong></i>
          </span>
          <span className="et-report-auto__copy">
            <small>{isStaying ? 'Report parked' : 'Moving on automatically'}</small>
            <strong>{isStaying ? 'Stay as long as you like' : `Next drill in ${countdownSeconds}`}</strong>
          </span>
          {isStaying ? (
            <span className="et-report-auto__parked">Timer off</span>
          ) : (
            <button type="button" className="et-report-auto__stay" onClick={stayHere}>
              Stay Here
            </button>
          )}
        </div>
        <button type="button" className="et-report__next" onClick={moveNext}>
          {nextLabel}
          <ArrowIcon />
        </button>
      </footer>
    </section>
  );
}

export default ExerciseReport;
