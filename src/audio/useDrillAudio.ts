import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DetectedNote,
  DrillPlan,
  SpatialChordPerformance,
} from './timing';
import {
  frequencyToMidi,
  metronomeBeatPositions,
  midiToName,
  PITCH_CAPTURE_LEAD_BEATS,
  pitchToMidi,
} from './timing';
import type { SpatialChordSpec } from '../curriculum/types';
import {
  analyzeCapturedTake,
  type CapturedPcm,
  type ScoreAnalysisResult,
} from './scoreAnalysis';
import { warmBasicPitch } from './basicPitchTranscription';
import {
  getAudioContext as getPianoAudioContext,
  initAudio as initPianoAudio,
  loadSample as loadPianoSample,
  scheduleNote as schedulePianoSample,
  stopActiveSourcesOnly as stopPianoSamples,
} from '../lib/audio';

export type MicStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error';
export type DrillPhase = 'idle' | 'countin' | 'playing';

export interface UseDrillAudioOptions {
  /** Path to the worklet module. Vite serves `public/` at the root. */
  workletUrl?: string;
  /** Dedicated expected-tone analyzer used only for simultaneous chords. */
  chordWorkletUrl?: string;
  /** Fired once on the downbeat, with its AudioContext time. */
  onPlayStart?: (audioTime: number) => void;
  /** Fired after final deferred pitch frames flush, with everything heard. */
  onFinish?: (
    detected: DetectedNote[],
    diagnostics: RecognitionDiagnostics,
    spatialPerformance?: SpatialChordPerformance,
  ) => void;
  /** Fired as soon as recording closes and final pitch frames begin flushing. */
  onAnalysisStart?: () => void;
  /** Reports actual grading pipeline milestones from 0 through 100. */
  onAnalysisProgress?: (percent: number) => void;
  /**
   * Called every animation frame while counting in or playing, with the
   * position in beats from the downbeat (negative during count-in).
   * Drive the scrubber from here — never from React state.
   */
  onFrame?: (beatPosition: number) => void;
  /** The proof detector has finished calibration and is accepting the first note. */
  onProofListenStart?: () => void;
  /** Fired after the requested physical hand position is acoustically proved. */
  onProofSuccess?: () => void;
  /** Context playback ended and the root-search microphone is now live. */
  onSpatialListenStart?: (audioTime: number) => void;
  /** The root locked; the UI should advance to physical chord building. */
  onSpatialRootFound?: () => void;
}

export interface RecognitionDiagnostics {
  /** Notes that cleared every detector threshold without exercise context. */
  strictAccepted: number;
  /** Borderline strikes rescued because they exactly matched the score. */
  expectedRecovered: number;
  /** Borderline strikes ignored because they did not safely match the score. */
  candidatesIgnored: number;
  /** Physical onsets for which no stable pitch could be established. */
  pitchRejected: number;
  /** Primary estimator was wrong/ambiguous, but an independent stable vote matched the score. */
  contextDisambiguated: number;
  /** Written notes recovered by the lossless whole-take pass. */
  offlineRecovered: number;
  /** Strict live notes preserved after independent PCM reconciliation. */
  offlineLivePreserved: number;
  /** Live events rejected after checking the raw take. */
  offlineRejected: number;
  /** Written score slots independently supported by the raw take. */
  offlineExpectedAccepted: number;
  /** Total written score slots evaluated by the raw-take analyzer. */
  offlineExpectedCount: number;
  /** Why the final analyzer completed or fell back to the live stream. */
  offlineReason: string;
}

const EMPTY_DIAGNOSTICS: RecognitionDiagnostics = {
  strictAccepted: 0,
  expectedRecovered: 0,
  candidatesIgnored: 0,
  pitchRejected: 0,
  contextDisambiguated: 0,
  offlineRecovered: 0,
  offlineLivePreserved: 0,
  offlineRejected: 0,
  offlineExpectedAccepted: 0,
  offlineExpectedCount: 0,
  offlineReason: 'not-run',
};

/** Prove It must not reset from a weak, ambiguous decay estimate. */
const PROOF_RELEASE_MIN_CONFIDENCE = 0.66;
const OUTPUT_GAIN_MULTIPLIER = 2.025;

interface PianoAnalysisProfile {
  presenceHz: number;
  presenceDb: number;
  lowpassHz: number;
  gain: number;
}

/**
 * Analysis-only piano front end. It does not change playback or the student's
 * saved recording: it downmixes unreliable multi-channel mic input, removes
 * rumble and both common mains frequencies, preserves the hammer/string band,
 * and raises quiet notes behind a soft compressor before the worklets grade
 * them. Frequency discrimination still happens independently in the worklets;
 * gain alone is never treated as proof that a note exists.
 */
function connectPianoAnalysisFrontEnd(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  destination: AudioNode,
  profile: PianoAnalysisProfile,
): void {
  const mono = ctx.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = 'explicit';
  mono.channelInterpretation = 'speakers';

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 70;
  highpass.Q.value = 0.7;

  const hum50 = ctx.createBiquadFilter();
  hum50.type = 'notch';
  hum50.frequency.value = 50;
  hum50.Q.value = 24;

  const hum60 = ctx.createBiquadFilter();
  hum60.type = 'notch';
  hum60.frequency.value = 60;
  hum60.Q.value = 24;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = profile.presenceHz;
  presence.Q.value = 0.55;
  presence.gain.value = profile.presenceDb;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = profile.lowpassHz;
  lowpass.Q.value = 0.7;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -42;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.4;
  // Preserve the hammer edge used for onset timing, then control the body.
  compressor.attack.value = 0.018;
  compressor.release.value = 0.16;

  const gain = ctx.createGain();
  gain.gain.value = profile.gain;

  source.connect(mono);
  mono.connect(highpass);
  highpass.connect(hum50);
  hum50.connect(hum60);
  hum60.connect(presence);
  presence.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(gain);
  gain.connect(destination);
}

/** Present simultaneous detections as one chord instead of random-looking notes. */
export function formatDetectedNoteGroups(notes: readonly DetectedNote[]): string[] {
  // Keep detector evidence intact for grading, but show a pitch again only
  // when envelope/flux evidence proves a new hammer strike. Time alone must
  // not turn one sustained tone into repeated live-feed entries.
  const lastShownByMidi = new Map<number, DetectedNote>();
  const displayNotes = [...notes]
    .sort((a, b) => a.time - b.time)
    .filter((note) => {
      const previous = lastShownByMidi.get(note.midi);
      if (previous && !isClearSamePitchRetrigger(
        {
          time: previous.time,
          peakRms: previous.peakRms ?? previous.strength,
          candidate: previous.detectorLane === 'context-recovery',
          releasedAt: previous.endTime,
          releaseConfidence: previous.durationConfidence,
        },
        {
          time: note.time,
          peakRms: note.peakRms ?? note.strength,
          gate: note.gate ?? 0,
          attackRatio: note.frameAttackRatio ?? 0,
          frameAttackRatio: note.frameAttackRatio,
          novelty: note.novelty,
          candidate: note.detectorLane === 'context-recovery',
          contextExpected: note.scoreContextAccepted,
        },
      )) return false;
      lastShownByMidi.set(note.midi, note);
      return true;
    });
  const groups: DetectedNote[][] = [];
  displayNotes.forEach((note) => {
    const group = groups[groups.length - 1];
    if (!group || note.time - group[0].time > 0.045) groups.push([note]);
    else group.push(note);
  });
  return groups.map((group) => {
    const names = [...new Set(group.map((note) => midiToName(note.midi)))];
    return names.length > 1 ? `Chord: ${names.join(' + ')}` : names[0];
  });
}

interface PcmCaptureSession {
  id: number;
  chunks: Float32Array[];
  sampleRate: number;
  startTime: number;
  endTime: number;
  settled: boolean;
  done: Promise<CapturedPcm | null>;
  resolve: (capture: CapturedPcm | null) => void;
}

interface PitchHypothesis {
  source: 'yin' | 'emergent';
  midi: number;
  frequency: number;
  frames: number;
  consensus: number;
  clarity: number;
  pitchMad: number;
  tuningErrorCents: number;
  pitchRange: number;
  maxPitchStep: number;
  pitchSlope: number;
}

export interface AcousticAttackEvidence {
  peakRms?: number;
  gate?: number;
  pianoAttackConfidence?: number;
  attackBandCoverage?: number;
  stableFrames?: number;
  consensus?: number;
  clarity?: number;
  frameAttackRatio?: number;
  novelty?: number;
  referenceTransient?: boolean;
}

/**
 * Shared live boundary between "a pitch is plausible" and "a key was
 * physically struck." Score context is deliberately absent from this test.
 */
export function hasCredibleAcousticAttack(
  evidence: AcousticAttackEvidence,
  lane: 'strict' | 'candidate',
): boolean {
  const peakRms = Number(evidence.peakRms) || 0;
  const gate = Math.max(0.0005, Number(evidence.gate) || 0);
  const attackConfidence = Number(evidence.pianoAttackConfidence) || 0;
  const bandCoverage = Number(evidence.attackBandCoverage) || 0;
  const stableFrames = Number(evidence.stableFrames) || 0;
  const consensus = Number(evidence.consensus) || 0;
  const clarity = Number(evidence.clarity) || 0;
  const frameRise = Number(evidence.frameAttackRatio) || 0;
  const novelty = Number(evidence.novelty) || 0;
  const candidate = lane === 'candidate';

  if (
    peakRms < Math.max(0.0002, gate * (candidate ? 0.7 : 0.98)) ||
    attackConfidence < (candidate ? 0.3 : 0.4) ||
    bandCoverage < 2 ||
    stableFrames < (candidate ? 2 : 2) ||
    consensus < (candidate ? 0.4 : 0.4) ||
    clarity < (candidate ? 0.26 : 0.25) ||
    frameRise < (candidate ? 0.965 : 0.96) ||
    novelty < (candidate ? 0.14 : 0.16)
  ) return false;

  // App-generated clicks are known exactly. A coincident key is retained,
  // but only with Oclef-style multi-frame pitch stability plus a much
  // stronger independent hammer signature.
  if (evidence.referenceTransient === true) {
    return (
      attackConfidence >= 0.68 &&
      stableFrames >= 5 &&
      consensus >= 0.72 &&
      clarity >= 0.62 &&
      bandCoverage >= 3
    );
  }
  return true;
}

/**
 * Prove It already knows the one exact pitch it is waiting for and still
 * applies pitch-hypothesis, voice, harmonic-shadow, and ordered-note guards.
 * Its recovery lane can therefore accept a slightly softer real hammer than
 * normal grading without admitting ambient sound or weakening scored drills.
 */
export function hasCredibleProofAttack(
  evidence: AcousticAttackEvidence,
  lane: 'strict' | 'candidate',
): boolean {
  if (lane === 'strict' || evidence.referenceTransient === true) {
    return hasCredibleAcousticAttack(evidence, lane);
  }
  const peakRms = Number(evidence.peakRms) || 0;
  const gate = Math.max(0.0005, Number(evidence.gate) || 0);
  return (
    peakRms >= Math.max(0.0002, gate * 0.58) &&
    (Number(evidence.pianoAttackConfidence) || 0) >= 0.27 &&
    (Number(evidence.attackBandCoverage) || 0) >= 2 &&
    (Number(evidence.stableFrames) || 0) >= 2 &&
    (Number(evidence.consensus) || 0) >= 0.36 &&
    (Number(evidence.clarity) || 0) >= 0.22 &&
    (Number(evidence.frameAttackRatio) || 0) >= 0.95 &&
    (Number(evidence.novelty) || 0) >= 0.12
  );
}

function readPitchHypotheses(value: unknown): PitchHypothesis[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is PitchHypothesis => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as Partial<PitchHypothesis>;
    return (
      (item.source === 'yin' || item.source === 'emergent') &&
      Number.isFinite(item.midi) &&
      Number.isFinite(item.frequency) &&
      Number.isFinite(item.frames) &&
      Number.isFinite(item.consensus) &&
      Number.isFinite(item.clarity) &&
      Number.isFinite(item.pitchMad) &&
      Number.isFinite(item.tuningErrorCents) &&
      Number.isFinite(item.pitchRange) &&
      Number.isFinite(item.maxPitchStep) &&
      Number.isFinite(item.pitchSlope)
    );
  });
}

/** Several stable frames are required before context may break a pitch tie. */
function supportsExpectedPitch(
  hypothesis: PitchHypothesis,
  expectedMidi: number,
  strictPrimary: boolean,
): boolean {
  if (hypothesis.midi !== expectedMidi) return false;
  const minimumFrames = strictPrimary ? 4 : 3;
  const minimumConsensus = strictPrimary ? 0.62 : 0.54;
  const maximumMad = strictPrimary ? 0.42 : 0.38;
  const maximumTuningError = strictPrimary ? 44 : 32;
  const maximumPitchRange = strictPrimary ? 0.4 : 0.38;
  const maximumPitchStep = strictPrimary ? 0.27 : 0.24;
  const minimumClarity = hypothesis.source === 'yin'
    ? (strictPrimary ? 0.5 : 0.48)
    : (strictPrimary ? 0.22 : 0.26);
  return (
    hypothesis.frames >= minimumFrames &&
    hypothesis.consensus >= minimumConsensus &&
    hypothesis.pitchMad <= maximumMad &&
    hypothesis.clarity >= minimumClarity &&
    hypothesis.tuningErrorCents <= maximumTuningError &&
    hypothesis.pitchRange <= maximumPitchRange &&
    hypothesis.maxPitchStep <= maximumPitchStep
  );
}

interface ContextualPitch {
  midi: number;
  slot: number | null;
  disambiguated: boolean;
}

export function resolveContextualPitch(
  plan: DrillPlan,
  playStartTime: number,
  primaryMidi: number,
  onsetTime: number,
  occupied: ReadonlySet<number>,
  hypotheses: readonly PitchHypothesis[],
  strictPrimary: boolean,
): ContextualPitch {
  // A strict worklet event already cleared the full independent pitch vote.
  // A recovery event has not: even its primary MIDI must be backed by one
  // hypothesis that clears the recovery-specific tuning and trajectory
  // checks. The former code skipped that verification for the primary and
  // allowed a weak rounded frequency to receive score credit merely because
  // it happened to equal the written answer.
  const primarySupported = strictPrimary || hypotheses.some(
    (hypothesis) => supportsExpectedPitch(hypothesis, primaryMidi, false),
  );
  const primarySlot = primarySupported
    ? findRecoverableExpectedSlot(
        plan,
        playStartTime,
        primaryMidi,
        onsetTime,
        occupied,
        strictPrimary ? 'strict' : 'recovery',
      )
    : null;
  if (primarySlot !== null) {
    return { midi: primaryMidi, slot: primarySlot, disambiguated: false };
  }

  for (const hypothesis of hypotheses) {
    if (!supportsExpectedPitch(hypothesis, hypothesis.midi, strictPrimary)) continue;
    const slot = findRecoverableExpectedSlot(
      plan,
      playStartTime,
      hypothesis.midi,
      onsetTime,
      occupied,
      strictPrimary ? 'strict' : 'recovery',
    );
    if (slot !== null) {
      return { midi: hypothesis.midi, slot, disambiguated: hypothesis.midi !== primaryMidi };
    }
  }
  return { midi: primaryMidi, slot: null, disambiguated: false };
}

/**
 * Find one still-unfilled written note that can safely rescue a borderline
 * pitch estimate. Exact MIDI equality is intentional: context may recover a
 * quiet correct strike, but it must never bend an uncertain pitch into the
 * answer. The beat window prevents an ambient tone elsewhere in the phrase
 * from filling a note merely because it has the same name.
 */
export function findRecoverableExpectedSlot(
  plan: DrillPlan,
  playStartTime: number,
  midi: number,
  onsetTime: number,
  occupied: ReadonlySet<number>,
  lane: 'strict' | 'recovery' = 'recovery',
): number | null {
  if (!Number.isFinite(playStartTime) || playStartTime <= 0) return null;
  const onsetBeat = (onsetTime - playStartTime) / plan.secondsPerBeat;
  if (onsetBeat < -0.3 || onsetBeat > plan.totalBeats + 0.7) return null;

  let bestIndex: number | null = null;
  let bestError = Infinity;
  plan.expectedNotes.forEach((slot, index) => {
    if (occupied.has(index) || pitchToMidi(slot.pitch) !== midi) return;
    const delta = onsetBeat - slot.beat;
    const error = Math.abs(delta);
    // The worklet reports the physical onset timestamp—not the later moment
    // when its pitch vote finishes—so recovery does not need a one-beat-wide
    // late window. Keeping it narrow prevents speech or a ringing harmonic
    // from reserving a future note. Strict events receive modest scheduling
    // tolerance; low-confidence recovery must be nearly centred.
    const earlyWindow = lane === 'strict' ? 0.48 : 0.24;
    const lateWindow = lane === 'strict' ? 0.68 : 0.48;
    if (delta >= -earlyWindow && delta <= lateWindow && error < bestError) {
      bestIndex = index;
      bestError = error;
    }
  });
  return bestIndex;
}

export interface PositionProofTarget {
  proofNotes: [
    { pitch: string; finger: number },
    { pitch: string; finger: number },
    { pitch: string; finger: number },
  ];
  /** Product invariant: Prove It is sequential; simultaneous holds belong to chord drills. */
  requireHeld?: boolean;
  acceptWindowMs?: number;
}

export interface DrillAudio {
  micStatus: MicStatus;
  phase: DrillPhase;
  /** Beat number during the two-bar count-in and while playing. */
  beatLabel: string;
  /** True on the count-in's final beat. */
  isDownbeat: boolean;
  inputLevel: number;
  detectedNames: string[];
  /** Number of correct position notes heard so far. */
  proofProgress: 0 | 1 | 2 | 3;
  /** Unique root/third/fifth targets locked in the spatial chord exercise. */
  spatialProgress: 0 | 1 | 2 | 3;
  /** Exact target tones locked so an either-order third/fifth search renders truthfully. */
  spatialFoundMidi: readonly number[];
  /** Deliberate non-target strikes, excluding candidates and acoustic echoes. */
  spatialWrongGuesses: number;
  /** True when the chord demo's piano samples failed to load over the network. */
  spatialAudioIssue: boolean;
  /** Object URL for the most recently completed microphone take. */
  recordingUrl: string | null;
  /** Room noise estimate, for diagnostics. */
  noiseFloor: () => number;
  /** Requests the mic if needed, then runs count-in and recording. */
  /** Resolves false when the microphone/audio graph could not start. */
  begin: (plan: DrillPlan) => Promise<boolean>;
  /** Opens and warms the microphone graph without starting a drill. */
  prepare: () => Promise<boolean>;
  /** Starts a microphone-only position check without clicks or recording. */
  beginProof: (target: PositionProofTarget) => Promise<boolean>;
  /** Plays a contextual clue, then runs a bounded root-first chord search. */
  beginSpatialChord: (target: SpatialChordSpec) => Promise<boolean>;
  /** Plays a visual-keyboard choice; never records or grades it. */
  previewSpatialChoice: (pitches: readonly string[]) => Promise<boolean>;
  /** Cancels everything in flight without tearing down the context. */
  abort: () => void;
}

/** Cached white-noise buffer for the click transient — built once per context. */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Decaying noise, so the transient does not sound like a burst of static.
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

/** Lookahead scheduler window — the standard fix for timer jitter. */
const SCHEDULE_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.15;
/** Pad before the first beat so scheduling never lands in the past. */
const START_PAD_SEC = 0.2;
/**
 * Arm analysis before the audio-clock downbeat. Waiting for the first visual
 * frame at/after zero loses perfectly timed attacks because requestAnimationFrame
 * is not synchronized to the audio thread.
 */
const DETECTOR_PREROLL_SEC = 0.22;
/**
 * Grace after the window closes, so deferred pitch estimates for the last
 * note can arrive. The worklet measures pitch during the sustain, not the
 * attack, so results trail their onsets.
 */
const PITCH_FLUSH_MS = 220;
/** Quiet frames needed before the first Prove It attack can be judged. */
const PROOF_DETECTOR_WARMUP_MS = 260;
/**
 * Brief confirmation after all three target tones overlap.
 *
 * The worklet already requires two stable expected-tone frames. Its slower
 * nearby-wrong-key guard needs about 116 ms at 44.1 kHz (10 × 512 samples),
 * so 180 ms leaves scheduling margin without turning recognition into a
 * half-second sustain test. This is a false-extra guard, not a musical hold.
 */
const SPATIAL_CHORD_CONFIRM_MS = 180;

/**
 * Read-only diagnostic switch for the Prove It note pipeline. Off by default
 * for every real student. Flip it on with `?debugAudio=1` in the URL, or
 * `localStorage.setItem('eartrain.debug-audio', '1')`, then open devtools —
 * every raw worklet decision (peak/subthreshold, pitch-rejected reasons,
 * onsets, release-profile) and every candidate this hook itself discards
 * (and exactly which gate discarded it) is logged with a `[proof-audio]`
 * prefix. This changes no thresholds and no behavior; it only makes the
 * existing (already-computed) rejection reasons visible, so a real failure
 * can be diagnosed from console output instead of guessed at blind.
 */
function isProofAudioDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('debugAudio') === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    return window.localStorage.getItem('eartrain.debug-audio') === '1';
  } catch {
    return false;
  }
}

export function proofDetectorWarmupRemaining(
  connectedAtMs: number,
  nowMs: number,
): number {
  if (!Number.isFinite(connectedAtMs) || connectedAtMs <= 0) {
    return PROOF_DETECTOR_WARMUP_MS;
  }
  return Math.max(0, PROOF_DETECTOR_WARMUP_MS - (nowMs - connectedAtMs));
}
/** Same-pitch events inside this window need acoustic evidence of a new hit. */
const SAME_NOTE_STRICT_WINDOW_SEC = 1.25;
const ABSOLUTE_RETRIGGER_FLOOR_SEC = 0.12;
const RETRIGGER_ATTACK_RATIO = 1.18;
const RETRIGGER_GATE_MULTIPLIER = 1.1;
const LATE_RETRIGGER_GATE_MULTIPLIER = 1.03;

export interface RetriggerEvidence {
  time: number;
  peakRms: number;
  /** A confirmed release is remembered; it does not erase duplicate guards. */
  releasedAt?: number;
  releaseConfidence?: number;
  gate: number;
  attackRatio: number;
  /** Short-term envelope rise from the worklet's physical-articulation test. */
  frameAttackRatio?: number;
  /** New spectral energy divided by the current weighted spectrum. */
  novelty?: number;
  /** True only for the worklet's low-confidence recovery lane. */
  candidate?: boolean;
  /** The score has an unfilled note of this exact pitch at this exact time. */
  contextExpected?: boolean;
}

/** Pure so the acoustic re-articulation rule can be regression-tested. */
export function isClearSamePitchRetrigger(
  previous: Pick<
    RetriggerEvidence,
    'time' | 'peakRms' | 'candidate' | 'releasedAt' | 'releaseConfidence'
  >,
  current: RetriggerEvidence,
): boolean {
  const gap = current.time - previous.time;
  if (gap < ABSOLUTE_RETRIGGER_FLOOR_SEC) return false;
  // A borderline onset can be finalized shortly before a second, strict
  // estimate of that same physical hammer strike. If the score has no second
  // same-pitch slot here, this is confidence promotion—not re-articulation.
  if (
    previous.candidate === true &&
    current.candidate !== true &&
    current.contextExpected !== true &&
    gap < 0.28
  ) return false;
  const hasArticulationMetrics =
    Number.isFinite(current.frameAttackRatio) && Number.isFinite(current.novelty);
  const contextualRecovery = current.contextExpected === true && current.candidate === true;
  const confirmedRelease = Boolean(
    Number.isFinite(previous.releasedAt) &&
    Number.isFinite(previous.releaseConfidence) &&
    (previous.releaseConfidence as number) >= 0.64 &&
    current.time - (previous.releasedAt as number) >= 0.035
  );
  // If the previous strike is still in this map, no acoustic release has
  // been confirmed. A second same-pitch event therefore needs unusually
  // strong evidence of a new hammer attack. Time alone must never turn the
  // beating partials of one held note into a second score event.
  const freshPhysicalAttack = hasArticulationMetrics
    ? (
        ((current.frameAttackRatio as number) >= 1.18 && (current.novelty as number) >= 0.4) ||
        ((current.frameAttackRatio as number) >= 1.08 && (current.novelty as number) >= 0.62) ||
        (
          confirmedRelease &&
          (current.frameAttackRatio as number) >= 1.1 &&
          (current.novelty as number) >= 0.44
        ) ||
        (
          contextualRecovery &&
          gap >= SAME_NOTE_STRICT_WINDOW_SEC &&
          (current.frameAttackRatio as number) >= 1.16 &&
          (current.novelty as number) >= 0.55
        )
      )
    : Number.isFinite(current.attackRatio) && current.attackRatio >= 1.45;
  const freshEnvelope =
    freshPhysicalAttack &&
    Number.isFinite(current.peakRms) &&
    Number.isFinite(current.gate) &&
    current.peakRms >= current.gate * (
      contextualRecovery ? 0.62 : LATE_RETRIGGER_GATE_MULTIPLIER
    );
  if (!freshEnvelope) return false;
  return (
    current.attackRatio >= (contextualRecovery ? 1.12 : RETRIGGER_ATTACK_RATIO) &&
    current.peakRms >= current.gate * (
      contextualRecovery ? 0.62 : RETRIGGER_GATE_MULTIPLIER
    ) &&
    current.peakRms >= previous.peakRms * (
      contextualRecovery ? 0.28 : 0.3
    )
  );
}

interface Scheduled {
  time: number;
  accent: boolean;
}

export interface ActiveProof {
  targetMidi: [number, number, number];
  acceptWindowSec: number;
  requireHeld?: boolean;
  nextIndex: 0 | 1 | 2;
  firstHeardAt: number | null;
  verifying?: boolean;
}

export type ProofNoteIndex = 0 | 1 | 2;

export interface ProofHoldFailure {
  /** Indices into PositionProofTarget.proofNotes that were no longer held. */
  releasedNoteIndices: ProofNoteIndex[];
}

/** Pure boundary for the release events allowed to invalidate a held shape. */
export function isCredibleProofRelease(reason: unknown, confidence: unknown): boolean {
  return (
    reason !== 'reattack' &&
    Number.isFinite(confidence) &&
    Number(confidence) >= PROOF_RELEASE_MIN_CONFIDENCE
  );
}

export interface PositionProofAdvance {
  progress: 0 | 1 | 2 | 3;
  complete: boolean;
}

export function priorProofKeysStillHeld(
  proof: ActiveProof,
  holds: ReadonlyMap<number, { releasedAt: number | null }>,
  time: number,
  releaseGraceSec = 0.22,
): boolean {
  return unheldProofNoteIndices(proof, holds, time, releaseGraceSec).length === 0;
}

/**
 * Returns every required key that is missing or was released. Keeping this
 * pure makes every one-, two-, and three-key Prove It failure explainable.
 */
export function unheldProofNoteIndices(
  proof: ActiveProof,
  holds: ReadonlyMap<number, { releasedAt: number | null }>,
  time: number,
  releaseGraceSec = 0.22,
): ProofNoteIndex[] {
  const heldCount = proof.verifying ? proof.targetMidi.length : proof.nextIndex;
  const releasedNoteIndices: ProofNoteIndex[] = [];
  proof.targetMidi.slice(0, heldCount).forEach((targetMidi, index) => {
    const hold = holds.get(targetMidi);
    const stillHeld = Boolean(
      hold && (hold.releasedAt === null || time - hold.releasedAt <= releaseGraceSec),
    );
    if (!stillHeld) releasedNoteIndices.push(index as ProofNoteIndex);
  });
  return releasedNoteIndices;
}

/**
 * Prove It is intentionally a tiny, deterministic state machine. The first
 * named pitch must be heard before the middle and final notes; other notes
 * never count as a partial match. Progress is monotonic: acoustic echoes of
 * an already-completed note are ignored instead of sending a child backward.
 */
export function advancePositionProof(
  proof: ActiveProof,
  midi: number,
  time: number,
): PositionProofAdvance {
  if (
    proof.nextIndex > 0 &&
    proof.firstHeardAt !== null &&
    time - proof.firstHeardAt > proof.acceptWindowSec
  ) {
    proof.nextIndex = 0;
    proof.firstHeardAt = null;
  }

  if (midi !== proof.targetMidi[proof.nextIndex]) {
    return { progress: proof.nextIndex, complete: false };
  }

  if (proof.nextIndex === 0) proof.firstHeardAt = time;
  const progress = (proof.nextIndex + 1) as 1 | 2 | 3;
  if (progress === proof.targetMidi.length) {
    return { progress: 3, complete: true };
  }
  proof.nextIndex = progress as 1 | 2;
  return { progress, complete: false };

}

export interface ActiveSpatialChord {
  spec: SpatialChordSpec;
  targetMidi: [number, number, number];
  startedAt: number;
  rootFoundAt: number | null;
  completedAt: number | null;
  foundMidi: Set<number>;
  foundAtByMidi: Map<number, number>;
  wrongRootGuesses: number;
  wrongShapeGuesses: number;
  totalGuesses: number;
  lastWrongAt: number | null;
  wrongHeldDetectorIds: Set<number>;
  /** Nearby non-target tones currently present in the polyphonic frame. */
  polyphonicWrongMidi: Set<number>;
}

export interface SpatialChordAdvance {
  progress: 0 | 1 | 2 | 3;
  rootJustFound: boolean;
  complete: boolean;
  countedGuess: boolean;
}

/**
 * Sequential discovery helper for the 1-3-5 teaching flow. This never proves
 * the final chord: completion is reserved for the independent polyphonic
 * detector after all target tones overlap for a stable hold.
 */
export function advanceSpatialChord(
  active: ActiveSpatialChord,
  midi: number,
  time: number,
): SpatialChordAdvance {
  const orderedTargets = active.spec.buildOrder.map((index) => active.targetMidi[index]);
  const root = orderedTargets[0];
  const wanted = orderedTargets[Math.min(active.foundMidi.size, orderedTargets.length - 1)];

  if (active.foundMidi.has(midi)) {
    // A held/repeated target does not move backward and is not a fresh guess.
    return {
      progress: active.foundMidi.size as 0 | 1 | 2 | 3,
      rootJustFound: false,
      complete: false,
      countedGuess: false,
    };
  }

  active.totalGuesses += 1;

  if (midi !== wanted) {
    // A valid tone played ahead of its teaching step is ignored rather than
    // marked wrong. An unrelated key is a real guess and never advances.
    if (orderedTargets.includes(midi)) {
      return {
        progress: active.foundMidi.size as 0 | 1 | 2,
        rootJustFound: false,
        complete: false,
        countedGuess: false,
      };
    }
    if (active.rootFoundAt === null) active.wrongRootGuesses += 1;
    else active.wrongShapeGuesses += 1;
    return {
      progress: active.foundMidi.size as 0 | 1 | 2,
      rootJustFound: false,
      complete: false,
      countedGuess: true,
    };
  }

  active.foundMidi.add(midi);
  active.foundAtByMidi.set(midi, time);
  const rootJustFound = midi === root && active.rootFoundAt === null;
  if (rootJustFound) active.rootFoundAt = time;
  const progress = active.foundMidi.size as 1 | 2 | 3;
  return {
    progress,
    rootJustFound,
    complete: false,
    countedGuess: false,
  };
}

/** Current held-tone prefix for the guided root → third → fifth UI. */
export function updateSpatialChordPresence(
  active: ActiveSpatialChord,
  presentMidi: ReadonlySet<number>,
  time: number,
): SpatialChordAdvance {
  const orderedTargets = active.spec.buildOrder.map((index) => active.targetMidi[index]);
  let progress = 0;
  while (progress < orderedTargets.length && presentMidi.has(orderedTargets[progress])) {
    progress += 1;
  }
  const previous = new Set(active.foundMidi);
  active.foundMidi.clear();
  orderedTargets.slice(0, progress).forEach((midi) => {
    active.foundMidi.add(midi);
    if (!previous.has(midi)) active.foundAtByMidi.set(midi, time);
  });
  const rootJustFound = progress > 0 && active.rootFoundAt === null;
  if (rootJustFound) active.rootFoundAt = time;
  active.totalGuesses += Math.max(0, progress - previous.size);
  return {
    progress: progress as 0 | 1 | 2 | 3,
    rootJustFound,
    // Presence alone is not completion. The caller must verify a stable
    // simultaneous hold before it may finish the exercise.
    complete: false,
    countedGuess: false,
  };
}

function splitPianoPitch(pitch: string): { note: string; octave: number } | null {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(pitch.trim());
  if (!match) return null;
  return { note: match[1], octave: Number(match[2]) };
}

async function prepareProofSuccessChime(): Promise<void> {
  await initPianoAudio();
  await Promise.all([
    loadPianoSample('E', 5),
    loadPianoSample('G#', 5),
    loadPianoSample('B', 5),
  ]);
}

function playProofSuccessChime(): void {
  // Musical feedback is sampled acoustic piano too. A sine-wave "success"
  // arpeggio was one of the remaining synth sounds in the progressive path.
  void (async () => {
    await prepareProofSuccessChime();
    const pianoContext = getPianoAudioContext();
    if (!pianoContext) return;
    if (pianoContext.state === 'suspended') {
      await pianoContext.resume().catch(() => undefined);
    }
    const start = pianoContext.currentTime + 0.02;
    void schedulePianoSample('E', 5, 0.48, 0.42, start);
    void schedulePianoSample('G#', 5, 0.48, 0.38, start + 0.075);
    void schedulePianoSample('B', 5, 0.55, 0.36, start + 0.15);
  })();
}

/**
 * The polyphonic detector is only useful where the score genuinely asks for
 * two or more simultaneous attacks. Arming it with every pitch in a melody
 * made one held note look like a new note on every analysis frame.
 */
export function polyphonicTargetsForPlan(plan: DrillPlan): number[] {
  return Array.from(new Set(
    polyphonicSlotGroupsForPlan(plan).flatMap((group) =>
      group.slots.map(({ midi }) => midi),
    ),
  ));
}

/** Target tones plus nearby wrong keys that the chord lane must reject. */
export function chordMonitorMidi(targetMidi: readonly number[]): number[] {
  const monitored = new Set<number>();
  targetMidi.forEach((midi) => {
    for (let offset = -2; offset <= 2; offset++) {
      const value = midi + offset;
      if (value >= 21 && value <= 108) monitored.add(value);
    }
  });
  return [...monitored].sort((a, b) => a - b);
}

export function polyphonicMonitorTargetsForPlan(plan: DrillPlan): number[] {
  return chordMonitorMidi(polyphonicTargetsForPlan(plan));
}

export interface PolyphonicSlotGroup {
  beat: number;
  slots: Array<{ index: number; midi: number }>;
}

/** Exact score slots that must be heard together, grouped by written onset. */
export function polyphonicSlotGroupsForPlan(plan: DrillPlan): PolyphonicSlotGroup[] {
  const slotsByBeat = new Map<number, Array<{ index: number; midi: number }>>();
  plan.expectedNotes.forEach((slot, index) => {
    const midi = pitchToMidi(slot.pitch);
    if (midi === null) return;
    const beatKey = Math.round(slot.beat * 1000) / 1000;
    const slots = slotsByBeat.get(beatKey) ?? [];
    slots.push({ index, midi });
    slotsByBeat.set(beatKey, slots);
  });
  return [...slotsByBeat.entries()]
    .filter(([beat, slots]) => slots.length > 1 || plan.expectedNotes.some((note) =>
      note.beat < beat && note.beat + note.beats > beat,
    ))
    .map(([beat, slots]) => ({ beat, slots }));
}

export function isPolyphonicExpectedSlot(plan: DrillPlan, expectedSlot: number): boolean {
  return polyphonicSlotGroupsForPlan(plan).some((group) =>
    group.slots.some(({ index }) => index === expectedSlot),
  );
}

export function findCompletePolyphonicGroup(
  plan: DrillPlan,
  heard: ReadonlySet<number>,
  onsetBeat: number,
  occupied: ReadonlySet<number>,
): PolyphonicSlotGroup | null {
  return polyphonicSlotGroupsForPlan(plan)
    .filter((candidate) =>
      candidate.slots.every(({ midi }) => heard.has(midi)) &&
      [...heard].every((midi) => candidate.slots.some((slot) => slot.midi === midi) ||
        plan.expectedNotes.some((slot, index) => occupied.has(index) &&
          pitchToMidi(slot.pitch) === midi && slot.beat < candidate.beat &&
          slot.beat + slot.beats >= candidate.beat)) &&
      candidate.slots.some(({ index }) => !occupied.has(index)) &&
      Math.abs(candidate.beat - onsetBeat) <= 0.75,
    )
    .sort((a, b) => Math.abs(a.beat - onsetBeat) - Math.abs(b.beat - onsetBeat))[0] ?? null;
}

export function useDrillAudio(options: UseDrillAudioOptions = {}): DrillAudio {
  // The worklet lives in public/ and is otherwise easy for a browser/CDN to
  // reuse across deploys. Version the URL whenever its recognition contract
  // changes so students cannot keep an older detector in a long-lived tab.
  const {
    workletUrl = '/audio/pitch-processor.js?v=proof-consensus-v20-2026-09-05',
    chordWorkletUrl = '/audio/chord-processor.js?v=overlap-arrivals-v6-2026-09-05',
  } = options;

  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [phase, setPhase] = useState<DrillPhase>('idle');
  const [beatLabel, setBeatLabel] = useState('');
  const [isDownbeat, setIsDownbeat] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [detectedNames, setDetectedNames] = useState<string[]>([]);
  const [proofProgress, setProofProgress] = useState<0 | 1 | 2 | 3>(0);
  const [, setProofHoldFailure] = useState<ProofHoldFailure | null>(null);
  const [spatialProgress, setSpatialProgress] = useState<0 | 1 | 2 | 3>(0);
  const [spatialFoundMidi, setSpatialFoundMidi] = useState<number[]>([]);
  const [spatialWrongGuesses, setSpatialWrongGuesses] = useState(0);
  // True when the chord-by-ear demo could not fetch its piano samples (a
  // network hiccup against the sample CDN, not a musical failure). The UI
  // surfaces this explicitly instead of leaving the student listening for a
  // chord that was never actually played.
  const [spatialAudioIssue, setSpatialAudioIssue] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  // Callbacks via refs so a re-render never restarts the audio graph.
  const cbRef = useRef(options);
  cbRef.current = options;

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const chordWorkletRef = useRef<AudioWorkletNode | null>(null);
  const chordReadyResolveRef = useRef<(() => void) | null>(null);
  /**
   * Distinct pitches that share a written onset in the current drill, fed to
   * the polyphonic chord-processor (see the `chord-tones` handling below).
   * This is a second,
   * independent, simultaneous-tone-aware witness that runs alongside the
   * existing single-pitch onset detector; it only ever *adds* corroborated
   * notes, never replaces or overrides the tuned monophonic path.
   */
  const generalChordTargetsRef = useRef<number[]>([]);
  const generalChordMonitorRef = useRef<number[]>([]);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const clickGainRef = useRef<GainNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);
  const recordingDoneRef = useRef<Promise<void>>(Promise.resolve());
  const resolveRecordingDoneRef = useRef<(() => void) | null>(null);
  const pcmCaptureRef = useRef<PcmCaptureSession | null>(null);
  const pcmCaptureSequenceRef = useRef(0);

  const rafRef = useRef(0);
  const schedTimerRef = useRef(0);
  const playTransitionTimerRef = useRef(0);

  const planRef = useRef<DrillPlan | null>(null);
  const clicksRef = useRef<Scheduled[]>([]);
  const nextClickRef = useRef(0);
  const playStartRef = useRef(0);
  const recordEndRef = useRef(0);
  const listeningRef = useRef(false);
  const detectorArmedRef = useRef(false);
  const finishedRef = useRef(true);
  const onsetsRef = useRef<DetectedNote[]>([]);
  const proofRef = useRef<ActiveProof | null>(null);
  const proofCompletionTimerRef = useRef(0);
  const proofHoldByMidiRef = useRef(new Map<number, {
    detectorId: number;
    releasedAt: number | null;
  }>());
  const proofMidiByDetectorRef = useRef(new Map<number, number>());
  const spatialRef = useRef<ActiveSpatialChord | null>(null);
  const spatialTimeoutRef = useRef(0);
  const spatialChordConfirmationTimerRef = useRef(0);
  const spatialSourcesRef = useRef(new Set<AudioScheduledSourceNode>());
  const finishSpatialRef = useRef<((timedOut: boolean) => void) | null>(null);
  const armSpatialDeadlineRef = useRef<((milliseconds: number) => void) | null>(null);
  const lastStrikeByMidiRef = useRef(new Map<number, {
    time: number;
    peakRms: number;
    detectorId?: number;
    candidate?: boolean;
    releasedAt?: number;
    releaseConfidence?: number;
  }>());
  const onsetByDetectorIdRef = useRef(new Map<number, DetectedNote>());
  const occupiedExpectedSlotsRef = useRef(new Set<number>());
  const provisionalByExpectedSlotRef = useRef(new Map<number, {
    note: DetectedNote;
    detectorId?: number;
    quality: number;
  }>());
  const diagnosticsRef = useRef<RecognitionDiagnostics>({ ...EMPTY_DIAGNOSTICS });
  const proofAudioDebugRef = useRef(false);
  if (proofAudioDebugRef.current === false) proofAudioDebugRef.current = isProofAudioDebugEnabled();
  const lastBeatKeyRef = useRef('');
  const noiseFloorRef = useRef(0);
  const graphConnectedAtRef = useRef(0);
  /** Invalidates every delayed callback belonging to an older proof/drill. */
  const runTokenRef = useRef(0);
  const mountedRef = useRef(true);

  const cancelPcmCapture = useCallback(() => {
    const capture = pcmCaptureRef.current;
    if (!capture) return;
    try {
      workletRef.current?.port.postMessage({ type: 'capture-cancel', id: capture.id });
    } catch {
      // The graph may already be closing.
    }
    if (!capture.settled) {
      capture.settled = true;
      capture.resolve(null);
    }
    pcmCaptureRef.current = null;
  }, []);

  const beginPcmCapture = useCallback((
    worklet: AudioWorkletNode,
    startTime: number,
    endTime: number,
  ): PcmCaptureSession => {
    cancelPcmCapture();
    let resolveCapture!: (capture: CapturedPcm | null) => void;
    const done = new Promise<CapturedPcm | null>((resolve) => {
      resolveCapture = resolve;
    });
    const capture: PcmCaptureSession = {
      id: ++pcmCaptureSequenceRef.current,
      chunks: [],
      sampleRate: 0,
      startTime,
      endTime,
      settled: false,
      done,
      resolve: resolveCapture,
    };
    pcmCaptureRef.current = capture;
    worklet.port.postMessage({
      type: 'capture-plan',
      id: capture.id,
      startTime,
      endTime,
    });
    return capture;
  }, [cancelPcmCapture]);

  const safeSet = useCallback(<T,>(setter: (v: T) => void, value: T) => {
    if (mountedRef.current) setter(value);
  }, []);

  const clearProofCompletionTimer = useCallback(() => {
    if (!proofCompletionTimerRef.current) return;
    window.clearTimeout(proofCompletionTimerRef.current);
    proofCompletionTimerRef.current = 0;
  }, []);

  const replaceRecordingUrl = useCallback((nextUrl: string | null) => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = nextUrl;
    safeSet(setRecordingUrl, nextUrl);
  }, [safeSet]);

  const settleRecording = useCallback(() => {
    resolveRecordingDoneRef.current?.();
    resolveRecordingDoneRef.current = null;
  }, []);

  const cancelMicRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') recorder.stop();
    settleRecording();
  }, [settleRecording]);

  const startMicRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;

    cancelMicRecording();
    recordingChunksRef.current = [];
    recordingDoneRef.current = new Promise<void>((resolve) => {
      resolveRecordingDoneRef.current = resolve;
    });

    try {
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/webm',
      ];
      const mimeType = preferredTypes.find(
        (type) => typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type),
      );
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
      } catch {
        // Older Safari accepts its native recorder but rejects an explicit
        // bitrate. Preserve smooth single-segment capture without losing
        // replay entirely on that browser.
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (chunks.length > 0) {
          const blobType = chunks.find((chunk) => chunk.type)?.type || recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: blobType });
          if (blob.size > 0) replaceRecordingUrl(URL.createObjectURL(blob));
        }
        settleRecording();
      };
      recorder.onerror = () => {
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        settleRecording();
      };
      mediaRecorderRef.current = recorder;
      // One continuous encoded segment. Joining 250ms MediaRecorder fragments
      // is legal in some WebM implementations but produces timestamp seams—and
      // audible clicks/dropouts—in others, especially MP4-backed Safari.
      recorder.start();
    } catch {
      // Pitch grading still works when a browser cannot create a MediaRecorder.
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      settleRecording();
    }
  }, [cancelMicRecording, replaceRecordingUrl, settleRecording]);

  const stopMicRecording = useCallback((): Promise<void> => {
    const recorder = mediaRecorderRef.current;
    const done = recordingDoneRef.current;
    if (recorder?.state === 'recording') {
      recorder.stop();
    } else {
      settleRecording();
    }
    return done;
  }, [settleRecording]);

  const stopLoops = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (schedTimerRef.current) {
      window.clearInterval(schedTimerRef.current);
      schedTimerRef.current = 0;
    }
    if (playTransitionTimerRef.current) {
      window.clearTimeout(playTransitionTimerRef.current);
      playTransitionTimerRef.current = 0;
    }
  }, []);

  const stopSpatialPlayback = useCallback(() => {
    if (spatialTimeoutRef.current) {
      window.clearTimeout(spatialTimeoutRef.current);
      spatialTimeoutRef.current = 0;
    }
    if (spatialChordConfirmationTimerRef.current) {
      window.clearTimeout(spatialChordConfirmationTimerRef.current);
      spatialChordConfirmationTimerRef.current = 0;
    }
    spatialSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // A source that has already ended is harmless.
      }
      try {
        source.disconnect();
      } catch {
        // It may have been disconnected by its onended cleanup.
      }
    });
    spatialSourcesRef.current.clear();
    // Spatial/chord examples are rendered by the shared sampled-piano
    // engine. Stop those buffers too when a route changes mid-example.
    stopPianoSamples();
  }, []);

  /** Full teardown. Every node, the stream, and the context. */
  const teardown = useCallback(() => {
    runTokenRef.current += 1;
    clearProofCompletionTimer();
    stopLoops();
    stopSpatialPlayback();
    cancelMicRecording();
    cancelPcmCapture();

    const worklet = workletRef.current;
    if (worklet) {
      // Drop the handler before disconnecting: a late message into a dead
      // component is exactly how these leak.
      worklet.port.onmessage = null;
      try {
        worklet.port.postMessage({ type: 'idle' });
      } catch {
        /* port may already be closed */
      }
      worklet.disconnect();
      workletRef.current = null;
    }

    const chordWorklet = chordWorkletRef.current;
    if (chordWorklet) {
      chordWorklet.port.onmessage = null;
      try {
        chordWorklet.port.postMessage({ type: 'idle' });
      } catch {
        /* port may already be closed */
      }
      chordWorklet.disconnect();
      chordWorkletRef.current = null;
    }
    chordReadyResolveRef.current?.();
    chordReadyResolveRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    clickGainRef.current?.disconnect();
    clickGainRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    }
  }, [stopLoops, stopSpatialPlayback, cancelMicRecording, cancelPcmCapture, clearProofCompletionTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  /** Creates the graph on first use and reuses it for every later drill. */
  const ensureGraph = useCallback(async (): Promise<AudioContext | null> => {
    if (ctxRef.current && workletRef.current && chordWorkletRef.current) {
      if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
      return ctxRef.current;
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      safeSet(setMicStatus, 'unsupported' as MicStatus);
      return null;
    }

    safeSet(setMicStatus, 'requesting' as MicStatus);

    try {
      // Speech processing is tuned for voice and mangles musical harmonics.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 1 },
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      streamRef.current = stream;
      // Browsers may otherwise optimize microphone tracks for speech and
      // damage piano attacks/harmonics even when individual constraints are
      // unsupported or ignored. `music` is a standards-defined content hint.
      const inputTrack = stream.getAudioTracks()[0];
      if (inputTrack && 'contentHint' in inputTrack) {
        try {
          inputTrack.contentHint = 'music';
        } catch {
          // Some older engines expose the property but reject assignment.
        }
      }

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      await Promise.all([
        ctx.audioWorklet.addModule(workletUrl),
        ctx.audioWorklet.addModule(chordWorkletUrl),
      ]);
      if (!mountedRef.current) return null;

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pitch-processor');
      const chordWorklet = new AudioWorkletNode(ctx, 'chord-processor');
      if (proofAudioDebugRef.current) {
        worklet.port.postMessage({ type: 'debug', enabled: true });
      }

      worklet.port.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data) return;

        if (typeof data.type === 'string' && data.type.indexOf('debug-') === 0) {
          if (proofAudioDebugRef.current) {
            // eslint-disable-next-line no-console
            console.log('[proof-audio]', data.type.slice('debug-'.length), data);
          }
          return;
        }

        if (data.type === 'capture-chunk') {
          const capture = pcmCaptureRef.current;
          if (!capture || capture.id !== Number(data.id) || capture.settled) return;
          if (data.samples instanceof ArrayBuffer && data.samples.byteLength > 0) {
            capture.chunks.push(new Float32Array(data.samples));
          }
          return;
        }

        if (data.type === 'capture-complete') {
          const capture = pcmCaptureRef.current;
          if (!capture || capture.id !== Number(data.id) || capture.settled) return;
          capture.sampleRate = Number(data.sampleRate);
          capture.startTime = Number(data.startTime);
          capture.endTime = Number(data.endTime);
          capture.settled = true;
          capture.resolve({
            id: capture.id,
            chunks: capture.chunks,
            sampleRate: capture.sampleRate,
            startTime: capture.startTime,
            endTime: capture.endTime,
          });
          return;
        }

        const clearProofHolds = () => {
          proofHoldByMidiRef.current.clear();
          proofMidiByDetectorRef.current.clear();
        };

        const acceptProofNote = (
          midi: number,
          time: number,
        ): boolean => {
          const proof = proofRef.current;
          if (!proof) return false;
          if (proof.verifying) {
            if (proofAudioDebugRef.current) {
              // eslint-disable-next-line no-console
              console.log('[proof-audio] acceptProofNote: ignored, already verifying', { midi, time });
            }
            return false;
          }

          const expired = Boolean(
            proof.nextIndex > 0 &&
            proof.firstHeardAt !== null &&
            time - proof.firstHeardAt > proof.acceptWindowSec
          );
          if (expired) clearProofHolds();

          const result = advancePositionProof(proof, midi, time);
          if (proofAudioDebugRef.current) {
            // eslint-disable-next-line no-console
            console.log('[proof-audio] acceptProofNote', {
              heardMidi: midi,
              targetMidi: proof.targetMidi,
              nextIndexBefore: proof.nextIndex,
              matched: midi === proof.targetMidi[result.progress > 0 ? result.progress - 1 : proof.nextIndex],
              progress: result.progress,
              complete: result.complete,
            });
          }
          safeSet(setProofProgress, result.progress);
          if (result.progress > 0 && midi === proof.targetMidi[result.progress - 1]) {
            safeSet(setProofHoldFailure, null);
          }
          if (!result.complete) {
            const nextWanted = proof.targetMidi[proof.nextIndex];
            worklet.port.postMessage({ type: 'watch-pitch', midi: nextWanted });
            return false;
          }
          // The third ordered anchor completes Prove It immediately. Chord
          // simultaneity is verified by the separate polyphonic chord lane.
          proofRef.current = null;
          clearProofHolds();
          worklet.port.postMessage({ type: 'clear-watch-pitch' });
          worklet.port.postMessage({ type: 'idle' });
          safeSet(setPhase, 'idle' as DrillPhase);
          safeSet(setInputLevel, 0);
          playProofSuccessChime();
          cbRef.current.onProofSuccess?.();
          return false;
        };

        if (data.type === 'level') {
          safeSet(setInputLevel, data.level as number);
          noiseFloorRef.current = data.noiseFloor ?? noiseFloorRef.current;
          return;
        }

        if (data.type === 'note-release') {
          const id = Number(data.id);
          const spatial = spatialRef.current;
          if (spatial?.wrongHeldDetectorIds.has(id)) {
            const releaseTime = Number(data.time);
            const confidence = Number(data.confidence);
            if (
              data.reason !== 'reattack' &&
              Number.isFinite(releaseTime) &&
              Number.isFinite(confidence) &&
              confidence >= 0.5
            ) {
              spatial.wrongHeldDetectorIds.delete(id);
              spatial.lastWrongAt = releaseTime;
            }
          }
          const proofMidi = proofMidiByDetectorRef.current.get(id);
          if (proofRef.current && proofMidi !== undefined && proofRef.current.requireHeld !== false) {
            const hold = proofHoldByMidiRef.current.get(proofMidi);
            const releaseTime = Number(data.time);
            const releaseConfidence = Number(data.confidence);
            if (
              hold?.detectorId === id &&
              isCredibleProofRelease(data.reason, releaseConfidence) &&
              Number.isFinite(releaseTime)
            ) {
              const proof = proofRef.current;
              const releasedIndex = proof.targetMidi.indexOf(proofMidi);
              hold.releasedAt = releaseTime;
              // Report a proven key-up immediately. Waiting for the child to
              // add another finger made the personalized error intermittent,
              // and a release during final verification could feel ignored.
              if (releasedIndex >= 0 && releasedIndex < proof.nextIndex) {
                clearProofCompletionTimer();
                proof.nextIndex = 0;
                proof.firstHeardAt = null;
                proof.verifying = false;
                clearProofHolds();
                safeSet(setProofProgress, 0);
                safeSet(setProofHoldFailure, {
                  releasedNoteIndices: [releasedIndex as ProofNoteIndex],
                });
                worklet.port.postMessage({ type: 'watch-pitch', midi: proof.targetMidi[0] });
              }
            }
            return;
          }
          const note = onsetByDetectorIdRef.current.get(id);
          const releaseTime = Number(data.time);
          const confidence = Number(data.confidence);
          if (
            note &&
            Number.isFinite(releaseTime) &&
            releaseTime > note.time &&
            Number.isFinite(confidence) &&
            confidence >= 0.5
          ) {
            note.endTime = releaseTime;
            note.durationConfidence = Math.min(1, Math.max(0, confidence));
          }
          // A released string is no longer a duplicate-risk. Clearing only
          // the matching detector id preserves protection if a stale release
          // arrives after a newer strike of the same key.
          if (note) {
            const lastStrike = lastStrikeByMidiRef.current.get(note.midi);
            if (data.reason !== 'reattack' && lastStrike?.detectorId === id) {
              // Keep a release tombstone. A single long piano decay can
              // briefly fool the harmonic envelope into announcing a release
              // after 2–3 beats; deleting the guard here allowed the next
              // partial swell to become a second note. A real repeated key
              // still passes because it brings a fresh broadband attack.
              lastStrike.releasedAt = releaseTime;
              lastStrike.releaseConfidence = Number.isFinite(confidence)
                ? Math.min(1, Math.max(0, confidence))
                : 0;
            }
          }
          return;
        }

        if (data.type === 'note-rejected') {
          diagnosticsRef.current.pitchRejected += 1;
          return;
        }

        if (data.type === 'note-onset' || data.type === 'note-candidate') {
          const isCandidate = data.type === 'note-candidate';
          const proofWanted = proofRef.current?.targetMidi[proofRef.current.nextIndex];
          const proofCandidate = Boolean(isCandidate && Number.isFinite(proofWanted));
          const quietBassProofCandidate = Boolean(
            isCandidate && Number.isFinite(proofWanted) && (proofWanted as number) <= 55
          );
          // See isProofAudioDebugEnabled() above. Only logs while a Prove It
          // is actually in progress, so it stays silent during every other
          // exercise even with the flag on.
          const logProofVeto = (reason: string, extra?: Record<string, unknown>) => {
            if (!proofAudioDebugRef.current || !proofRef.current) return;
            // eslint-disable-next-line no-console
            console.log('[proof-audio] rejected', reason, {
              lane: isCandidate ? 'candidate' : 'strict',
              wanted: proofWanted,
              frequency: data.frequency,
              clarity: data.clarity,
              consensus: data.consensus,
              peakRms: data.peakRms,
              gate: data.gate,
              pianoAttackConfidence: data.pianoAttackConfidence,
              ...extra,
            });
          };
          /* An established voice burst is never allowed into score context.
           * A single direct voice-like estimate is normally rejected too,
           * but one narrow exception is handled below: during a known click,
           * YIN may lock to a quiet bass note's octave while the independent
           * emergent-period vote correctly supports the written pitch. */
          const establishedVoiceBurst = data.voiceBurst === true;
          const directVoiceVeto = data.voiceVeto === true && !establishedVoiceBurst;
          if (establishedVoiceBurst) {
            logProofVeto('established-voice-burst');
            if (isCandidate) diagnosticsRef.current.candidatesIgnored += 1;
            else diagnosticsRef.current.pitchRejected += 1;
            return;
          }
          const attackLane = isCandidate ? 'candidate' : 'strict';
          const credibleAttack = proofRef.current
            ? hasCredibleProofAttack(data, attackLane)
            : hasCredibleAcousticAttack(data, attackLane);
          if (!credibleAttack) {
            logProofVeto('no-credible-physical-attack');
            if (isCandidate) diagnosticsRef.current.candidatesIgnored += 1;
            else diagnosticsRef.current.pitchRejected += 1;
            return;
          }
          // Defense in depth: current worklets include their adaptive RMS
          // gate with every onset. The soft recovery lane may sit below that
          // gate, but it can never enter grading without an exact score match.
          if (
            Number.isFinite(data.peakRms) &&
            Number.isFinite(data.gate) &&
            data.peakRms < data.gate * (
              quietBassProofCandidate ? 0.44 : proofCandidate ? 0.5 : isCandidate ? 0.6 : 1
            )
          ) {
            logProofVeto('peakRms-below-gate');
            if (isCandidate) diagnosticsRef.current.candidatesIgnored += 1;
            return;
          }
          if (
            Number.isFinite(data.clarity) &&
            data.clarity < (quietBassProofCandidate ? 0.14 : proofCandidate ? 0.15 : isCandidate ? 0.18 : 0.25)
          ) {
            logProofVeto('clarity-too-low');
            return;
          }
          if (
            Number.isFinite(data.consensus) &&
            data.consensus < (quietBassProofCandidate ? 0.34 : proofCandidate ? 0.36 : isCandidate ? 0.42 : 0.5)
          ) {
            logProofVeto('consensus-too-low');
            return;
          }
          if (
            isCandidate &&
            Number.isFinite(data.pianoAttackConfidence) &&
            data.pianoAttackConfidence < (quietBassProofCandidate ? 0.25 : proofCandidate ? 0.27 : 0.4)
          ) {
            logProofVeto('pianoAttackConfidence-too-low');
            diagnosticsRef.current.candidatesIgnored += 1;
            return;
          }

          const primaryMidi = frequencyToMidi(data.frequency);
          if (!Number.isFinite(primaryMidi) || primaryMidi < 21 || primaryMidi > 108) return;
          const hypotheses = readPitchHypotheses(data.hypotheses);
          let midi = primaryMidi;

          if (spatialRef.current) {
            const active = spatialRef.current;
            // Spatial chord success belongs exclusively to the independent
            // simultaneous-tone processor. The monophonic recovery lane used
            // to retarget almost any onset toward the next expected pitch;
            // one C or even an unrelated B could therefore fill three slots.
            // Here it may record a confident wrong-key guess, but it can never
            // add a target tone or complete the chord.
            if (isCandidate || directVoiceVeto) {
              diagnosticsRef.current.candidatesIgnored += 1;
              return;
            }
            if (data.harmonicShadow === true && data.harmonicIndependentAttack !== true) {
              diagnosticsRef.current.candidatesIgnored += 1;
              return;
            }
            if (Number(data.time) < active.startedAt - 0.03) return;
            if (active.targetMidi.includes(primaryMidi)) return;

            midi = primaryMidi;
            const previousStrike = lastStrikeByMidiRef.current.get(primaryMidi);
            if (
              previousStrike &&
              !isClearSamePitchRetrigger(previousStrike, {
                time: data.time,
                peakRms: data.peakRms,
                gate: data.gate,
                attackRatio: data.attackRatio,
                frameAttackRatio: data.frameAttackRatio,
                novelty: data.novelty,
                candidate: false,
                contextExpected: false,
              })
            ) {
              return;
            }

            const detectedNote: DetectedNote = {
              midi: primaryMidi,
              time: Number(data.time),
              clarity: data.clarity ?? 0,
              strength: data.strength ?? 1,
              sustain: data.sustain ?? 1,
              detectorId: Number.isFinite(data.id) ? Number(data.id) : undefined,
              detectorLane: 'strict',
              scoreContextAccepted: false,
              pianoAttackConfidence: Number(data.pianoAttackConfidence) || 0,
              consensus: Number(data.consensus) || 0,
              pitchMad: Number(data.pitchMad) || 0,
              peakRms: Number(data.peakRms) || 0,
              gate: Number(data.gate) || 0,
              frameAttackRatio: Number(data.frameAttackRatio) || 0,
              novelty: Number(data.novelty) || 0,
              voiceVeto: data.voiceVeto === true,
              voiceBurst: data.voiceBurst === true,
              harmonicShadow: data.harmonicShadow === true,
              harmonicIndependentAttack: data.harmonicIndependentAttack === true,
            };
            onsetsRef.current.push(detectedNote);
            onsetsRef.current.sort((a, b) => a.time - b.time);
            if (detectedNote.detectorId !== undefined) {
              onsetByDetectorIdRef.current.set(detectedNote.detectorId, detectedNote);
            }
            lastStrikeByMidiRef.current.set(primaryMidi, {
              time: Number(data.time),
              peakRms: Number.isFinite(data.peakRms) ? data.peakRms : 0,
              detectorId: detectedNote.detectorId,
              candidate: false,
            });
            diagnosticsRef.current.strictAccepted += 1;

            advanceSpatialChord(active, primaryMidi, Number(data.time));
            active.lastWrongAt = Number(data.time);
            if (detectedNote.detectorId !== undefined) {
              active.wrongHeldDetectorIds.add(detectedNote.detectorId);
            }
            safeSet(setDetectedNames, formatDetectedNoteGroups(onsetsRef.current));
            safeSet(
              setSpatialWrongGuesses,
              active.wrongRootGuesses + active.wrongShapeGuesses,
            );
            return;
          }

          if (proofRef.current) {
            const wanted = proofRef.current.targetMidi[proofRef.current.nextIndex];
            const alternative = hypotheses.find((hypothesis) =>
              supportsExpectedPitch(hypothesis, wanted, !isCandidate),
            );
            if (midi !== wanted && alternative) {
              midi = wanted;
              diagnosticsRef.current.contextDisambiguated += 1;
            }
            const referenceOctaveRescue = Boolean(
              isCandidate &&
              data.referenceTransient === true &&
              alternative &&
              midi !== primaryMidi &&
              Math.abs(midi - primaryMidi) === 12 &&
              Number(data.pianoAttackConfidence) >= 0.72
            );
            if (directVoiceVeto && !referenceOctaveRescue) {
              logProofVeto('direct-voice-veto', { midi, wanted });
              diagnosticsRef.current.candidatesIgnored += 1;
              return;
            }
            const recoverySupported = !isCandidate || hypotheses.some(
              (hypothesis) => supportsExpectedPitch(hypothesis, midi, false),
            );
            if (isCandidate && (midi !== wanted || !recoverySupported)) {
              logProofVeto('candidate-not-recovery-supported', { midi, wanted, recoverySupported });
              diagnosticsRef.current.candidatesIgnored += 1;
              return;
            }
            // An upper partial of a key already being held may have exactly
            // the pitch requested next (C's third partial is G). It counts
            // only when the worklet also found a fresh hammer articulation.
            if (data.harmonicShadow === true && data.harmonicIndependentAttack !== true) {
              logProofVeto('harmonic-shadow', { midi, wanted });
              diagnosticsRef.current.candidatesIgnored += 1;
              return;
            }
            const detectorId = Number(data.id);
            if (!Number.isFinite(detectorId)) {
              logProofVeto('no-detector-id', { midi, wanted });
              return;
            }
            if (isCandidate) {
              diagnosticsRef.current.expectedRecovered += 1;
              worklet.port.postMessage({
                type: 'accept-candidate',
                id: detectorId,
                frequency: 440 * Math.pow(2, (midi - 69) / 12),
                time: data.time,
              });
            } else {
              diagnosticsRef.current.strictAccepted += 1;
              if (midi !== primaryMidi) {
                worklet.port.postMessage({
                  type: 'retarget-note',
                  id: detectorId,
                  frequency: 440 * Math.pow(2, (midi - 69) / 12),
                });
              }
            }
            const completed = acceptProofNote(midi, Number(data.time));
            if (!completed) {
              safeSet(
                setDetectedNames,
                proofRef.current
                  ? proofRef.current.targetMidi
                    .slice(0, proofRef.current.nextIndex)
                    .map(midiToName)
                  : [midiToName(midi)],
              );
            }
            return;
          }

          const plan = planRef.current;
          // Recovery owns a score slot provisionally. A later strict event
          // must still be allowed to claim that slot; otherwise room sound
          // can steal it before the student's dead-centre strike arrives.
          const occupiedForEvent = isCandidate
            ? occupiedExpectedSlotsRef.current
            : new Set(
                [...occupiedExpectedSlotsRef.current].filter(
                  (slot) => !provisionalByExpectedSlotRef.current.has(slot),
                ),
              );
          const contextual = plan
            ? resolveContextualPitch(
                plan,
                playStartRef.current,
                primaryMidi,
                Number(data.time),
                occupiedForEvent,
                hypotheses,
                !isCandidate,
              )
            : { midi: primaryMidi, slot: null, disambiguated: false };
          midi = contextual.midi;
          const expectedSlot = contextual.slot;
          if (onsetsRef.current.some((note) => note.detectorLane === 'polyphonic' &&
            note.midi === midi && Math.abs(note.time - Number(data.time)) <= 0.12)) {
            return;
          }
          if (
            plan &&
            expectedSlot !== null &&
            isPolyphonicExpectedSlot(plan, expectedSlot)
          ) {
            // A monophonic estimate cannot prove one member of a written
            // chord. The independent chord lane will submit the whole stack
            // only when all of its tones coexist in one analysis frame.
            diagnosticsRef.current.candidatesIgnored += 1;
            return;
          }
          if (contextual.disambiguated) {
            diagnosticsRef.current.contextDisambiguated += 1;
          }
          const referenceOctaveRescue = Boolean(
            isCandidate &&
            data.referenceTransient === true &&
            contextual.disambiguated &&
            Math.abs(midi - primaryMidi) === 12 &&
            Number(data.pianoAttackConfidence) >= 0.72
          );
          if (directVoiceVeto && !referenceOctaveRescue) {
            if (isCandidate) diagnosticsRef.current.candidatesIgnored += 1;
            else diagnosticsRef.current.pitchRejected += 1;
            return;
          }
          if (isCandidate && expectedSlot === null) {
            diagnosticsRef.current.candidatesIgnored += 1;
            return;
          }

          const provisional = expectedSlot === null
            ? undefined
            : provisionalByExpectedSlotRef.current.get(expectedSlot);
          const removeProvisional = () => {
            if (expectedSlot === null || !provisional) return;
            const index = onsetsRef.current.indexOf(provisional.note);
            if (index >= 0) onsetsRef.current.splice(index, 1);
            if (provisional.detectorId !== undefined) {
              onsetByDetectorIdRef.current.delete(provisional.detectorId);
              worklet.port.postMessage({
                type: 'cancel-note',
                id: provisional.detectorId,
              });
            }
            const lastStrike = lastStrikeByMidiRef.current.get(provisional.note.midi);
            if (lastStrike?.detectorId === provisional.detectorId) {
              lastStrikeByMidiRef.current.delete(provisional.note.midi);
            }
            provisionalByExpectedSlotRef.current.delete(expectedSlot);
            occupiedExpectedSlotsRef.current.delete(expectedSlot);
            diagnosticsRef.current.expectedRecovered = Math.max(
              0,
              diagnosticsRef.current.expectedRecovered - 1,
            );
          };

          let candidateQuality = 0;
          if (isCandidate && expectedSlot !== null && plan) {
            const writtenBeat = plan.expectedNotes[expectedSlot]?.beat ?? 0;
            const onsetBeat = (Number(data.time) - playStartRef.current) / plan.secondsPerBeat;
            const timingFit = Math.max(0, 1 - Math.abs(onsetBeat - writtenBeat) / 0.48);
            candidateQuality =
              Math.min(1, Math.max(0, Number(data.consensus) || 0)) * 0.28 +
              Math.min(1, Math.max(0, Number(data.clarity) || 0)) * 0.24 +
              Math.min(1, Math.max(0, Number(data.pianoAttackConfidence) || 0)) * 0.3 +
              timingFit * 0.18;
            if (provisional && candidateQuality <= provisional.quality + 0.04) {
              diagnosticsRef.current.candidatesIgnored += 1;
              return;
            }
          }
          // A better recovery candidate may replace a weaker one, and every
          // strict event replaces provisional ownership unconditionally.
          if (provisional) removeProvisional();

          // A sustained piano string can develop a fresh spectral bump as
          // its partials beat, even though no key was struck again. For the
          // same MIDI pitch, accept a close repeat only when the amplitude
          // envelope also proves a physical re-articulation.
          const previousStrike = lastStrikeByMidiRef.current.get(midi);
          const confidencePromotion = Boolean(
            previousStrike?.candidate === true &&
            !isCandidate &&
            expectedSlot === null &&
            Number(data.time) - previousStrike.time >= 0 &&
            Number(data.time) - previousStrike.time < 0.28
          );
          if (confidencePromotion && previousStrike) {
            /* Recovery can report the quiet leading edge before the same
             * hammer strike becomes strict. The worklet moves release
             * tracking to the strict detector id; mirror that move here
             * instead of creating a second note or preserving the internal
             * `reattack` hand-off as a spurious 70 ms duration. */
            const oldId = previousStrike.detectorId;
            const newId = Number.isFinite(data.id) ? Number(data.id) : undefined;
            const original = oldId === undefined
              ? undefined
              : onsetByDetectorIdRef.current.get(oldId);
            if (oldId !== undefined && original && newId !== undefined) {
              onsetByDetectorIdRef.current.delete(oldId);
              original.detectorId = newId;
              delete original.endTime;
              delete original.durationConfidence;
              onsetByDetectorIdRef.current.set(newId, original);
            }
            lastStrikeByMidiRef.current.set(midi, {
              time: previousStrike.time,
              peakRms: Number.isFinite(data.peakRms)
                ? Math.max(previousStrike.peakRms, Number(data.peakRms))
                : previousStrike.peakRms,
              detectorId: newId ?? oldId,
              candidate: false,
            });
            diagnosticsRef.current.expectedRecovered = Math.max(
              0,
              diagnosticsRef.current.expectedRecovered - 1,
            );
            diagnosticsRef.current.strictAccepted += 1;
            return;
          }
          if (
            previousStrike &&
            !isClearSamePitchRetrigger(previousStrike, {
              time: data.time,
              peakRms: data.peakRms,
              gate: data.gate,
              attackRatio: data.attackRatio,
              frameAttackRatio: data.frameAttackRatio,
              novelty: data.novelty,
              candidate: isCandidate,
              contextExpected: expectedSlot !== null,
            })
          ) {
            // The worklet may open a new release tracker when a sustained
            // string produces a false spectral "onset". Merge that tracker
            // into the original note instead of adding a second onset. This
            // also clears the provisional `reattack` end time, allowing the
            // eventual real damper release to finish the original hold.
            const oldId = previousStrike.detectorId;
            const newId = Number.isFinite(data.id) ? Number(data.id) : undefined;
            const heldNote = oldId === undefined
              ? undefined
              : onsetByDetectorIdRef.current.get(oldId);
            if (heldNote && newId !== undefined) {
              onsetByDetectorIdRef.current.delete(oldId!);
              heldNote.detectorId = newId;
              delete heldNote.endTime;
              delete heldNote.durationConfidence;
              onsetByDetectorIdRef.current.set(newId, heldNote);
              lastStrikeByMidiRef.current.set(midi, {
                ...previousStrike,
                peakRms: Math.max(
                  previousStrike.peakRms,
                  Number.isFinite(data.peakRms) ? Number(data.peakRms) : 0,
                ),
                detectorId: newId,
              });
            }
            if (isCandidate) diagnosticsRef.current.candidatesIgnored += 1;
            return;
          }
          // Pitch is measured after the attack, so an onset can arrive a
          // beat late — including just after the window closed. Keep it if
          // the onset itself happened while recording.
          const pitchLeadSeconds = (planRef.current?.secondsPerBeat ?? 0) * PITCH_CAPTURE_LEAD_BEATS;
          if (Number(data.time) < playStartRef.current - pitchLeadSeconds - 0.03) return;
          const detectedNote: DetectedNote = {
            midi,
            time: data.time,
            clarity: data.clarity ?? 0,
            strength: data.strength ?? 1,
            sustain: data.sustain ?? 1,
            detectorId: Number.isFinite(data.id) ? Number(data.id) : undefined,
            expectedSlot: expectedSlot ?? undefined,
            detectorLane: isCandidate ? 'context-recovery' : 'strict',
            scoreContextAccepted: expectedSlot !== null,
            pianoAttackConfidence: Number(data.pianoAttackConfidence) || 0,
            consensus: Number(data.consensus) || 0,
            pitchMad: Number(data.pitchMad) || 0,
            peakRms: Number(data.peakRms) || 0,
            gate: Number(data.gate) || 0,
            frameAttackRatio: Number(data.frameAttackRatio) || 0,
            novelty: Number(data.novelty) || 0,
            voiceVeto: data.voiceVeto === true,
            voiceBurst: data.voiceBurst === true,
            harmonicShadow: data.harmonicShadow === true,
            harmonicIndependentAttack: data.harmonicIndependentAttack === true,
          };
          if (isCandidate) {
            diagnosticsRef.current.expectedRecovered += 1;
            if (expectedSlot !== null) occupiedExpectedSlotsRef.current.add(expectedSlot);
            // Begin the same release analysis used by strict notes only after
            // score context has accepted this candidate.
            worklet.port.postMessage({
              type: 'accept-candidate',
              id: data.id,
              frequency: 440 * Math.pow(2, (midi - 69) / 12),
              time: data.time,
            });
          } else {
            diagnosticsRef.current.strictAccepted += 1;
            if (expectedSlot !== null) occupiedExpectedSlotsRef.current.add(expectedSlot);
            if (contextual.disambiguated) {
              worklet.port.postMessage({
                type: 'retarget-note',
                id: data.id,
                frequency: 440 * Math.pow(2, (midi - 69) / 12),
              });
            }
          }
          onsetsRef.current.push(detectedNote);
          if (detectedNote.detectorId !== undefined) {
            onsetByDetectorIdRef.current.set(detectedNote.detectorId, detectedNote);
          }
          lastStrikeByMidiRef.current.set(midi, {
            time: data.time,
            peakRms: Number.isFinite(data.peakRms) ? data.peakRms : 0,
            detectorId: detectedNote.detectorId,
            candidate: isCandidate,
          });
          if (isCandidate && expectedSlot !== null) {
            provisionalByExpectedSlotRef.current.set(expectedSlot, {
              note: detectedNote,
              detectorId: detectedNote.detectorId,
              quality: candidateQuality,
            });
          }
          onsetsRef.current.sort((a, b) => a.time - b.time);
          safeSet(setDetectedNames, formatDetectedNoteGroups(onsetsRef.current));
        }
      };

      chordWorklet.port.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data) return;
        if (data.type === 'chord-ready') {
          chordReadyResolveRef.current?.();
          chordReadyResolveRef.current = null;
          return;
        }
        if (data.type === 'chord-level') {
          if (spatialRef.current) safeSet(setInputLevel, Number(data.level) || 0);
          return;
        }
        if (data.type !== 'chord-tones') return;

        if (!spatialRef.current) {
          // This lane is armed only for score beats containing simultaneous
          // notes. Never credit partial arrivals: the complete written stack
          // must coexist in the current polyphonic frame.
          if (generalChordTargetsRef.current.length === 0) return;
          const heard: number[] = (Array.isArray(data.midi) ? data.midi : [])
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isFinite(value))
            .map((value: number) => Math.round(value));
          const heardSet = new Set(heard);
          const plan = planRef.current;
          if (!plan) return;
          const baseTime = Number.isFinite(data.time) ? Number(data.time) : ctx.currentTime;
          const onsetBeat = (baseTime - playStartRef.current) / plan.secondsPerBeat;
          const group = findCompletePolyphonicGroup(
            plan,
            heardSet,
            onsetBeat,
            occupiedExpectedSlotsRef.current,
          );
          if (!group) return;
          const arrivals = new Map<number, number>(
            (Array.isArray(data.arrivals) ? data.arrivals : []).flatMap(
              (arrival: { midi: number; time: number }) =>
                Number.isFinite(arrival.midi) && Number.isFinite(arrival.time)
                  ? [[arrival.midi, arrival.time] as [number, number]] : [],
            ),
          );
          // A sustained tone can support another hand's new attack, but it
          // cannot become a second attack merely because the written beat changed.
          if (group.slots.some(({ index, midi }) => !occupiedExpectedSlotsRef.current.has(index) &&
            (!arrivals.has(midi) || baseTime - arrivals.get(midi)! > 0.2))) return;
          let added = false;
          group.slots.forEach(({ index: expectedSlot, midi }) => {
            if (occupiedExpectedSlotsRef.current.has(expectedSlot)) return;
            const time = arrivals.get(midi) ?? baseTime;
            const note: DetectedNote = {
              midi,
              time,
              clarity: 0.75,
              strength: 1.3,
              sustain: 1,
              expectedSlot,
              detectorLane: 'polyphonic',
              scoreContextAccepted: true,
            };
            onsetsRef.current.push(note);
            occupiedExpectedSlotsRef.current.add(expectedSlot);
            lastStrikeByMidiRef.current.set(midi, {
              time,
              peakRms: 0,
              candidate: false,
            });
            diagnosticsRef.current.strictAccepted += 1;
            added = true;
          });
          if (added) {
            onsetsRef.current.sort((a, b) => a.time - b.time);
            safeSet(setDetectedNames, formatDetectedNoteGroups(onsetsRef.current));
          }
          return;
        }

        const active = spatialRef.current;
        const heard = new Set<number>(
          (Array.isArray(data.midi) ? data.midi : [])
            .map(Number)
            .filter((value: unknown): value is number => Number.isFinite(value))
            .map(Math.round),
        );
        const baseTime = Number.isFinite(data.time) ? Number(data.time) : ctx.currentTime;
        const previousFound = new Set(active.foundMidi);
        const unexpected = [...heard].filter((midi) => !active.targetMidi.includes(midi));
        const newlyUnexpected = unexpected.filter((midi) => !active.polyphonicWrongMidi.has(midi));
        active.polyphonicWrongMidi = new Set(unexpected);
        if (unexpected.length > 0) {
          active.lastWrongAt = baseTime;
          if (active.rootFoundAt === null) active.wrongRootGuesses += newlyUnexpected.length;
          else active.wrongShapeGuesses += newlyUnexpected.length;
          safeSet(
            setSpatialWrongGuesses,
            active.wrongRootGuesses + active.wrongShapeGuesses,
          );
        }
        const result = updateSpatialChordPresence(active, heard, baseTime);
        const newlyPresent = [...active.foundMidi].filter((midi) => !previousFound.has(midi));
        newlyPresent.forEach((midi, index) => {
          const time = baseTime + index * 0.001;
          onsetsRef.current.push({
            midi,
            time,
            clarity: 1,
            strength: 2,
            sustain: 1,
            detectorLane: 'polyphonic',
            scoreContextAccepted: true,
          });
          diagnosticsRef.current.strictAccepted += 1;
        });
        safeSet(setSpatialProgress, result.progress);
        safeSet(setSpatialFoundMidi, [...active.foundMidi]);
        if (result.rootJustFound) {
          armSpatialDeadlineRef.current?.(active.spec.shapeSearchSeconds * 1000);
          cbRef.current.onSpatialRootFound?.();
        }

        if (result.progress === active.targetMidi.length) {
          if (!spatialChordConfirmationTimerRef.current) {
            const confirmChord = () => {
              spatialChordConfirmationTimerRef.current = 0;
              const current = spatialRef.current;
              if (current !== active || finishedRef.current) return;
              const targets = current.spec.buildOrder.map((index) => current.targetMidi[index]);
              if (!targets.every((midi) => current.foundMidi.has(midi))) return;
              if (current.polyphonicWrongMidi.size > 0) return;
              if (current.wrongHeldDetectorIds.size > 0) {
                spatialChordConfirmationTimerRef.current = window.setTimeout(confirmChord, 120);
                return;
              }
              const cleanForMs = current.lastWrongAt === null
                ? Number.POSITIVE_INFINITY
                : (ctx.currentTime - current.lastWrongAt) * 1000;
              if (cleanForMs < SPATIAL_CHORD_CONFIRM_MS) {
                spatialChordConfirmationTimerRef.current = window.setTimeout(
                  confirmChord,
                  SPATIAL_CHORD_CONFIRM_MS - cleanForMs,
                );
                return;
              }
              current.completedAt = ctx.currentTime;
              playProofSuccessChime();
              finishSpatialRef.current?.(false);
            };
            spatialChordConfirmationTimerRef.current = window.setTimeout(
              confirmChord,
              SPATIAL_CHORD_CONFIRM_MS,
            );
          }
        } else if (spatialChordConfirmationTimerRef.current) {
          window.clearTimeout(spatialChordConfirmationTimerRef.current);
          spatialChordConfirmationTimerRef.current = 0;
        }

        if (newlyPresent.length > 0) {
          onsetsRef.current.sort((a, b) => a.time - b.time);
          safeSet(setDetectedNames, formatDetectedNoteGroups(onsetsRef.current));
        }
      };

      // Analysis only — never routed to the speakers, so no feedback path.
      // The mono and chord lanes receive different piano-band emphasis but
      // share the same controlled noise rejection and quiet-note lift.
      connectPianoAnalysisFrontEnd(ctx, source, worklet, {
        presenceHz: 1100,
        presenceDb: 2.5,
        lowpassHz: 7600,
        gain: 1.65,
      });
      connectPianoAnalysisFrontEnd(ctx, source, chordWorklet, {
        presenceHz: 500,
        presenceDb: 3,
        lowpassHz: 5000,
        gain: 1.45,
      });
      sourceRef.current = source;
      workletRef.current = worklet;
      chordWorkletRef.current = chordWorklet;
      graphConnectedAtRef.current = performance.now();

      // Metronome output bus.
      const clickGain = ctx.createGain();
      clickGain.gain.value = 0.65 * OUTPUT_GAIN_MULTIPLIER;
      clickGain.connect(ctx.destination);
      clickGainRef.current = clickGain;

      safeSet(setMicStatus, 'ready' as MicStatus);
      return ctx;
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      safeSet(setMicStatus, (denied ? 'denied' : 'error') as MicStatus);
      teardown();
      return null;
    }
  }, [workletUrl, chordWorkletUrl, safeSet, teardown, clearProofCompletionTimer]);

  /**
   * Short rim click, scheduled on the audio clock.
   *
   * This deliberately has no pitched oscillator body. A pitched woodblock
   * remains audible inside the detector's first analysis window and can mask
   * a quiet piano attack on the beat. A very short, tightly band-passed noise
   * transient is louder to the listener while leaving the piano fundamental
   * and its lower harmonics substantially cleaner for recognition.
   *
   * Accent ("tick") sits higher and louder than the subdivision ("tock"), so
   * the downbeat is unmistakable without being harsh.
   */
  const scheduleClick = useCallback((time: number, accent: boolean) => {
    const ctx = ctxRef.current;
    const bus = clickGainRef.current;
    if (!ctx || !bus) return;

    const peak = accent ? 0.92 : 0.58;

    // Attack transient.
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = accent ? 3900 : 3150;
    noiseFilter.Q.value = accent ? 1.4 : 1.2;

    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(0.0001, time);
    noiseEnv.gain.exponentialRampToValueAtTime(peak, time + 0.0015);
    noiseEnv.gain.exponentialRampToValueAtTime(0.0001, time + 0.014);

    // Shared tone shaping.
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = accent ? 5600 : 4800;
    warm.Q.value = 0.7;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseEnv);
    noiseEnv.connect(warm);
    warm.connect(bus);

    noise.start(time);
    noise.stop(time + 0.025);

    // One-shot nodes: release the graph edges so they can be collected.
    noise.onended = () => {
      noise.disconnect();
      noiseFilter.disconnect();
      noiseEnv.disconnect();
      warm.disconnect();
    };
  }, []);

  const scheduleSpatialContext = useCallback(async (
    ctx: AudioContext,
    spec: SpatialChordSpec,
  ): Promise<number> => {
    // Preload every required key before scheduling. A failed sample is silent
    // by design; this path never falls back to oscillators or synthetic
    // "instrument layers". Every pitched example the child hears is piano.
    await initPianoAudio();
    const referencePitches = spec.referencePitches;
    const allPitches = new Set([...referencePitches, ...spec.chordPitches]);
    const loaded = new Map<string, unknown>();
    await Promise.all([...allPitches].map(async (pitch) => {
      const parsed = splitPianoPitch(pitch);
      const buffer = parsed ? await loadPianoSample(parsed.note, parsed.octave) : null;
      loaded.set(pitch, buffer);
    }));
    // If any target sample failed to load, tell the UI instead of leaving the
    // student listening for silence.
    const missingTarget = spec.chordPitches.some((pitch) => !loaded.get(pitch));
    safeSet(setSpatialAudioIssue, missingTarget);

    const pianoContext = getPianoAudioContext();
    if (!pianoContext) return ctx.currentTime;
    const start = pianoContext.currentTime + 0.16;
    const schedulePitches = (
      pitches: readonly string[],
      offset: number,
      duration: number,
      volume: number,
      brokenGap = 0,
    ) => {
      const scaledVolume = volume / Math.sqrt(Math.max(1, pitches.length));
      pitches.forEach((pitch, index) => {
        const parsed = splitPianoPitch(pitch);
        if (!parsed) return;
        void schedulePianoSample(
          parsed.note,
          parsed.octave,
          duration,
          scaledVolume,
          start + offset + index * brokenGap,
        );
      });
    };

    // Hear the visible reference, then the hidden target. The microphone is
    // armed only after playback so the learner can reproduce the target on
    // the physical piano without the demonstration leaking into detection.
    schedulePitches(referencePitches, 0, 0.95, 0.92);
    schedulePitches(spec.chordPitches, 1.25, 1.05, 1);
    const offset = 2.55;

    // Return an equivalent end time on the microphone context's clock.
    return ctx.currentTime + 0.16 + offset;
  }, []);

  const abort = useCallback(() => {
    runTokenRef.current += 1;
    clearProofCompletionTimer();
    stopLoops();
    stopSpatialPlayback();
    cancelMicRecording();
    cancelPcmCapture();
    proofRef.current = null;
    proofHoldByMidiRef.current.clear();
    proofMidiByDetectorRef.current.clear();
    spatialRef.current = null;
    finishSpatialRef.current = null;
    armSpatialDeadlineRef.current = null;
    onsetByDetectorIdRef.current.clear();
    occupiedExpectedSlotsRef.current.clear();
    provisionalByExpectedSlotRef.current.clear();
    safeSet(setProofProgress, 0);
    safeSet(setProofHoldFailure, null);
    safeSet(setSpatialProgress, 0);
    safeSet(setSpatialFoundMidi, [] as number[]);
    safeSet(setSpatialWrongGuesses, 0);
    safeSet(setSpatialAudioIssue, false);
    listeningRef.current = false;
    detectorArmedRef.current = false;
    finishedRef.current = true;
    workletRef.current?.port.postMessage({ type: 'idle' });
    chordWorkletRef.current?.port.postMessage({ type: 'idle' });
    generalChordTargetsRef.current = [];
    generalChordMonitorRef.current = [];
    safeSet(setPhase, 'idle' as DrillPhase);
    safeSet(setBeatLabel, '');
    safeSet(setIsDownbeat, false);
  }, [stopLoops, stopSpatialPlayback, cancelMicRecording, cancelPcmCapture, clearProofCompletionTimer, safeSet]);

  const prepare = useCallback(async (): Promise<boolean> => {
    // The real-time AudioWorklet owns startup. Heavy ML initialization is
    // isolated in its worker and may warm during a non-playing preview.
    void warmBasicPitch();
    const ctx = await ensureGraph();
    return Boolean(ctx && workletRef.current && chordWorkletRef.current && mountedRef.current);
  }, [ensureGraph]);

  const beginProof = useCallback(
    async (target: PositionProofTarget): Promise<boolean> => {
      // The position check gives the isolated ML worker time to initialize
      // before the later scored performance. It never blocks proof detection
      // and, unlike cold-starting during grading, cannot zero a valid take.
      void warmBasicPitch();
      const runToken = ++runTokenRef.current;
      const targetMidi = target.proofNotes.map((note) => pitchToMidi(note.pitch));
      if (targetMidi.some((midi) => midi === null)) return false;

      // Start sample loading from the same user gesture that starts Prove It.
      // Safari may otherwise keep a newly-created playback context suspended
      // when completion arrives asynchronously from the microphone worklet.
      void prepareProofSuccessChime();

      const ctx = await ensureGraph();
      const worklet = workletRef.current;
      if (!ctx || !worklet || !mountedRef.current || runTokenRef.current !== runToken) return false;

      // On a newly-created graph, the worklet needs a handful of quiet hops
      // to establish spectral and RMS baselines. Previously the screen began
      // asking for C immediately, so a fast first strike landed inside that
      // calibration window and was silently discarded. Later notes worked
      // because the detector was warm by then. Wait here, before the UI enters
      // its listening state, instead of making the first pitch artificially
      // louder or weakening every note's noise protection.
      const warmupRemaining = proofDetectorWarmupRemaining(
        graphConnectedAtRef.current,
        performance.now(),
      );
      if (warmupRemaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, warmupRemaining));
      }
      if (
        !mountedRef.current ||
        workletRef.current !== worklet ||
        runTokenRef.current !== runToken
      ) return false;

      stopLoops();
      clearProofCompletionTimer();
      stopSpatialPlayback();
      cancelMicRecording();
      cancelPcmCapture();
      replaceRecordingUrl(null);
      chordWorkletRef.current?.port.postMessage({ type: 'idle' });
      generalChordTargetsRef.current = [];
      generalChordMonitorRef.current = [];
      onsetsRef.current = [];
      onsetByDetectorIdRef.current.clear();
      occupiedExpectedSlotsRef.current.clear();
      provisionalByExpectedSlotRef.current.clear();
      diagnosticsRef.current = { ...EMPTY_DIAGNOSTICS };
      lastStrikeByMidiRef.current.clear();
      proofHoldByMidiRef.current.clear();
      proofMidiByDetectorRef.current.clear();
      spatialRef.current = null;
      finishSpatialRef.current = null;
      safeSet(setSpatialProgress, 0);
      safeSet(setSpatialFoundMidi, [] as number[]);
      safeSet(setSpatialWrongGuesses, 0);
      safeSet(setSpatialAudioIssue, false);
      proofRef.current = {
        targetMidi: targetMidi as [number, number, number],
        acceptWindowSec: Math.max(1.2, (target.acceptWindowMs ?? 2800) / 1000),
        // Never infer a hold requirement from an omitted field. Prove It is a
        // sequential position map; simultaneous acoustic proof is reserved
        // for the dedicated chord detector and chord exercises.
        requireHeld: false,
        nextIndex: 0,
        firstHeardAt: null,
        verifying: false,
      };
      listeningRef.current = false;
      detectorArmedRef.current = true;
      finishedRef.current = true;
      safeSet(setDetectedNames, [] as string[]);
      safeSet(setProofProgress, 0);
      safeSet(setProofHoldFailure, null);
      safeSet(setPhase, 'playing' as DrillPhase);
      worklet.port.postMessage({ type: 'listen' });
      worklet.port.postMessage({ type: 'watch-pitch', midi: targetMidi[0] });
      // Tell the UI only after the worklet is genuinely armed. Previously the
      // highlighted first key appeared during graph setup/calibration, so a
      // quick child could play the correct note into a detector that was not
      // listening yet. This callback is queued before any worklet response,
      // keeping PROOF_SUCCESS safely behind PROOF_START as well.
      cbRef.current.onProofListenStart?.();
      return true;
    },
    [
      ensureGraph,
      stopLoops,
      stopSpatialPlayback,
      cancelMicRecording,
      cancelPcmCapture,
      replaceRecordingUrl,
      clearProofCompletionTimer,
      safeSet,
    ],
  );

  const beginSpatialChord = useCallback(
    async (target: SpatialChordSpec): Promise<boolean> => {
      const runToken = ++runTokenRef.current;
      const targetMidi = target.chordPitches.map((pitch) => pitchToMidi(pitch));
      if (targetMidi.some((midi) => midi === null)) return false;

      const ctx = await ensureGraph();
      const worklet = workletRef.current;
      const chordWorklet = chordWorkletRef.current;
      if (!ctx || !worklet || !chordWorklet || !mountedRef.current || runTokenRef.current !== runToken) return false;

      const warmupRemaining = proofDetectorWarmupRemaining(
        graphConnectedAtRef.current,
        performance.now(),
      );
      if (warmupRemaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, warmupRemaining));
      }
      if (!mountedRef.current || workletRef.current !== worklet || chordWorkletRef.current !== chordWorklet || runTokenRef.current !== runToken) {
        return false;
      }

      stopLoops();
      clearProofCompletionTimer();
      stopSpatialPlayback();
      cancelMicRecording();
      cancelPcmCapture();
      replaceRecordingUrl(null);
      worklet.port.postMessage({ type: 'idle' });
      generalChordTargetsRef.current = [];
      generalChordMonitorRef.current = [];
      detectorArmedRef.current = false;
      listeningRef.current = false;
      finishedRef.current = false;
      proofRef.current = null;
      proofHoldByMidiRef.current.clear();
      proofMidiByDetectorRef.current.clear();
      spatialRef.current = null;
      onsetsRef.current = [];
      onsetByDetectorIdRef.current.clear();
      occupiedExpectedSlotsRef.current.clear();
      provisionalByExpectedSlotRef.current.clear();
      diagnosticsRef.current = { ...EMPTY_DIAGNOSTICS };
      lastStrikeByMidiRef.current.clear();
      safeSet(setDetectedNames, [] as string[]);
      safeSet(setProofProgress, 0);
      safeSet(setProofHoldFailure, null);
      safeSet(setSpatialProgress, 0);
      safeSet(setSpatialFoundMidi, [] as number[]);
      safeSet(setSpatialWrongGuesses, 0);
      safeSet(setSpatialAudioIssue, false);
      safeSet(setPhase, 'idle' as DrillPhase);

      // Learn the room's noise floor before any speaker playback can leak
      // back into the microphone. The same baseline is reused when listening
      // begins, so a reverberant demo cannot hide a softly voiced chord tone.
      const prepared = new Promise<void>((resolve) => {
        chordReadyResolveRef.current = resolve;
      });
      const monitorMidi = chordMonitorMidi(targetMidi as number[]);
      chordWorklet.port.postMessage({ type: 'prepare-chord', targetMidi, monitorMidi });
      await Promise.race([
        prepared,
        new Promise<void>((resolve) => window.setTimeout(resolve, 700)),
      ]);
      chordReadyResolveRef.current = null;
      if (!mountedRef.current || runTokenRef.current !== runToken || chordWorkletRef.current !== chordWorklet) {
        return false;
      }

      const clueEndTime = await scheduleSpatialContext(ctx, target);
      const waitMs = Math.max(0, (clueEndTime - ctx.currentTime + 0.16) * 1000);
      await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
      if (!mountedRef.current || runTokenRef.current !== runToken || workletRef.current !== worklet || chordWorkletRef.current !== chordWorklet) {
        return false;
      }

      const startedAt = ctx.currentTime;
      const active: ActiveSpatialChord = {
        spec: target,
        targetMidi: targetMidi as [number, number, number],
        startedAt,
        rootFoundAt: null,
        completedAt: null,
        foundMidi: new Set<number>(),
        foundAtByMidi: new Map<number, number>(),
        wrongRootGuesses: 0,
        wrongShapeGuesses: 0,
        totalGuesses: 0,
        lastWrongAt: null,
        wrongHeldDetectorIds: new Set<number>(),
        polyphonicWrongMidi: new Set<number>(),
      };
      spatialRef.current = active;
      const chordReady = new Promise<void>((resolve) => {
        chordReadyResolveRef.current = resolve;
      });
      chordWorklet.port.postMessage({
        type: 'listen-chord',
        targetMidi,
        monitorMidi,
        reuseBaseline: true,
      });
      await Promise.race([
        chordReady,
        new Promise<void>((resolve) => window.setTimeout(resolve, 700)),
      ]);
      chordReadyResolveRef.current = null;
      if (!mountedRef.current || runTokenRef.current !== runToken || spatialRef.current !== active) {
        return false;
      }
      active.startedAt = ctx.currentTime;
      playStartRef.current = active.startedAt;
      listeningRef.current = true;
      detectorArmedRef.current = true;
      safeSet(setPhase, 'playing' as DrillPhase);
      startMicRecording();
      cbRef.current.onSpatialListenStart?.(active.startedAt);

      const finish = (timedOut: boolean) => {
        if (runTokenRef.current !== runToken || finishedRef.current) return;
        const current = spatialRef.current;
        if (!current) return;
        finishedRef.current = true;
        listeningRef.current = false;
        spatialRef.current = null;
        finishSpatialRef.current = null;
        armSpatialDeadlineRef.current = null;
        if (spatialTimeoutRef.current) window.clearTimeout(spatialTimeoutRef.current);
        spatialTimeoutRef.current = 0;
        if (spatialChordConfirmationTimerRef.current) {
          window.clearTimeout(spatialChordConfirmationTimerRef.current);
          spatialChordConfirmationTimerRef.current = 0;
        }
        cbRef.current.onAnalysisStart?.();
        cbRef.current.onAnalysisProgress?.(35);
        const recordingDone = stopMicRecording();
        safeSet(setPhase, 'idle' as DrillPhase);
        safeSet(setInputLevel, 0);

        const spatialPerformance: SpatialChordPerformance = {
          startedAt: current.startedAt,
          rootFoundAt: current.rootFoundAt,
          completedAt: current.completedAt,
          rootFound: current.rootFoundAt !== null,
          foundMidi: [...current.foundMidi],
          toneFoundAt: [...current.foundAtByMidi].map(([midi, time]) => ({ midi, time })),
          wrongRootGuesses: current.wrongRootGuesses,
          wrongShapeGuesses: current.wrongShapeGuesses,
          totalGuesses: current.totalGuesses,
          timedOut,
        };
        const recordingFallback = new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1200);
        });
        window.setTimeout(() => {
          if (runTokenRef.current !== runToken) return;
          chordWorklet.port.postMessage({ type: 'idle' });
          detectorArmedRef.current = false;
          void Promise.race([recordingDone, recordingFallback]).then(() => {
            if (!mountedRef.current || runTokenRef.current !== runToken) return;
            cbRef.current.onFinish?.(
              onsetsRef.current.slice(),
              { ...diagnosticsRef.current },
              spatialPerformance,
            );
            cbRef.current.onAnalysisProgress?.(100);
          });
        }, 180);
      };
      finishSpatialRef.current = finish;
      const armDeadline = (milliseconds: number) => {
        if (spatialTimeoutRef.current) window.clearTimeout(spatialTimeoutRef.current);
        spatialTimeoutRef.current = window.setTimeout(
          () => finishSpatialRef.current?.(true),
          Math.max(1000, milliseconds),
        );
      };
      armSpatialDeadlineRef.current = armDeadline;
      armDeadline(target.rootSearchSeconds * 1000);
      return true;
    },
    [
      ensureGraph,
      stopLoops,
      stopSpatialPlayback,
      cancelMicRecording,
      cancelPcmCapture,
      replaceRecordingUrl,
      clearProofCompletionTimer,
      scheduleSpatialContext,
      startMicRecording,
      stopMicRecording,
      safeSet,
    ],
  );

  const previewSpatialChoice = useCallback(async (pitches: readonly string[]): Promise<boolean> => {
    if (pitches.length === 0) return false;
    await initPianoAudio();
    const parsed = pitches.map(splitPianoPitch);
    if (parsed.some((pitch) => pitch === null)) return false;
    const loaded = await Promise.all(parsed.map((pitch) =>
      pitch ? loadPianoSample(pitch.note, pitch.octave) : Promise.resolve(null),
    ));
    const context = getPianoAudioContext();
    if (!context || loaded.some((sample) => !sample)) return false;
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
    stopPianoSamples();
    const start = context.currentTime + 0.025;
    const volume = 0.9 / Math.sqrt(pitches.length);
    parsed.forEach((pitch) => {
      if (pitch) void schedulePianoSample(pitch.note, pitch.octave, 0.8, volume, start);
    });
    return true;
  }, []);

  const begin = useCallback(
    async (plan: DrillPlan): Promise<boolean> => {
      const runToken = ++runTokenRef.current;
      const ctx = await ensureGraph();
      if (!ctx || !mountedRef.current || runTokenRef.current !== runToken) return false;

      stopLoops();
      clearProofCompletionTimer();
      stopSpatialPlayback();
      cancelMicRecording();
      cancelPcmCapture();
      replaceRecordingUrl(null);
      chordWorkletRef.current?.port.postMessage({ type: 'idle' });

      planRef.current = plan;
      generalChordTargetsRef.current = polyphonicTargetsForPlan(plan);
      generalChordMonitorRef.current = polyphonicMonitorTargetsForPlan(plan);
      proofRef.current = null;
      proofHoldByMidiRef.current.clear();
      proofMidiByDetectorRef.current.clear();
      spatialRef.current = null;
      finishSpatialRef.current = null;
      safeSet(setProofProgress, 0);
      safeSet(setProofHoldFailure, null);
      safeSet(setSpatialProgress, 0);
      safeSet(setSpatialFoundMidi, [] as number[]);
      safeSet(setSpatialWrongGuesses, 0);
      safeSet(setSpatialAudioIssue, false);
      onsetsRef.current = [];
      onsetByDetectorIdRef.current.clear();
      occupiedExpectedSlotsRef.current.clear();
      provisionalByExpectedSlotRef.current.clear();
      diagnosticsRef.current = { ...EMPTY_DIAGNOSTICS };
      lastStrikeByMidiRef.current.clear();
      lastBeatKeyRef.current = '';
      listeningRef.current = false;
      detectorArmedRef.current = false;
      finishedRef.current = false;
      safeSet(setDetectedNames, [] as string[]);

      const spb = plan.secondsPerBeat;
      const t0 = ctx.currentTime + START_PAD_SEC;
      const countInBeats = plan.beatsPerBar * 2;
      const playStart = t0 + countInBeats * spb;
      const pitchAnalysisStart = playStart - PITCH_CAPTURE_LEAD_BEATS * spb;
      playStartRef.current = playStart;
      recordEndRef.current = playStart + plan.recordSeconds;
      // Capture one quiet second before the downbeat and the complete tail.
      // This is raw, uncompressed microphone PCM; it is the evidence used by
      // the final score-aware pass, not by replay encoding.
      const captureSession = beginPcmCapture(
        workletRef.current!,
        Math.max(ctx.currentTime, pitchAnalysisStart - 1),
        recordEndRef.current + 0.3,
      );

      // Build the whole click list up front: count-in, then every beat of
      // the drill. Scheduling is then a matter of draining this list.
      const clicks: Scheduled[] = [];
      for (let i = 0; i < countInBeats; i++) {
        clicks.push({ time: t0 + i * spb, accent: i % plan.beatsPerBar === 0 });
      }
      metronomeBeatPositions(plan).forEach((timelineBeat, writtenBeat) => {
        clicks.push({
          time: playStart + timelineBeat * spb,
          accent: writtenBeat % plan.beatsPerBar === 0,
        });
      });
      clicksRef.current = clicks;
      nextClickRef.current = 0;
      // The worklet receives the exact audio-clock click schedule. It can
      // downgrade coincident click-shaped events to score-aware candidates
      // while still retaining a real piano note played on that same beat.
      workletRef.current?.port.postMessage({
        type: 'reference-transients',
        times: clicks
          .map((click) => click.time)
          .filter((time) => time >= pitchAnalysisStart - DETECTOR_PREROLL_SEC),
      });

      safeSet(setPhase, 'countin' as DrillPhase);

      // Lookahead scheduler: setInterval only decides WHAT to schedule; the
      // audio clock decides WHEN it sounds, so there is no drift.
      schedTimerRef.current = window.setInterval(() => {
        const context = ctxRef.current;
        if (!context) return;
        const horizon = context.currentTime + SCHEDULE_AHEAD_SEC;
        while (
          nextClickRef.current < clicksRef.current.length &&
          clicksRef.current[nextClickRef.current].time < horizon
        ) {
          const click = clicksRef.current[nextClickRef.current];
          scheduleClick(click.time, click.accent);
          nextClickRef.current += 1;
        }
      }, SCHEDULE_INTERVAL_MS);

      // State must leave count-in on the audio-clock downbeat even if a
      // browser delays or drops requestAnimationFrame. This is especially
      // important after a long memory preview, where the old RAF-only handoff
      // could leave the interface frozen on the final count-in beat.
      const enterPlaying = () => {
        if (
          listeningRef.current ||
          finishedRef.current ||
          runTokenRef.current !== runToken ||
          !ctxRef.current
        ) return;
        if (playTransitionTimerRef.current) {
          window.clearTimeout(playTransitionTimerRef.current);
          playTransitionTimerRef.current = 0;
        }
        listeningRef.current = true;
        startMicRecording();
        if (!detectorArmedRef.current) {
          detectorArmedRef.current = true;
          workletRef.current?.port.postMessage({ type: 'listen' });
          if (generalChordTargetsRef.current.length > 0) {
            chordWorkletRef.current?.port.postMessage({
              type: 'listen-chord',
              targetMidi: generalChordTargetsRef.current,
              monitorMidi: generalChordMonitorRef.current,
            });
          }
        }
        safeSet(setPhase, 'playing' as DrillPhase);
        safeSet(setIsDownbeat, false);
        cbRef.current.onPlayStart?.(playStartRef.current);
      };

      const handOffAtDownbeat = () => {
        const context = ctxRef.current;
        if (!context || finishedRef.current || runTokenRef.current !== runToken) return;
        const secondsRemaining = playStartRef.current - context.currentTime;
        if (secondsRemaining > 0.015) {
          playTransitionTimerRef.current = window.setTimeout(
            handOffAtDownbeat,
            Math.max(16, Math.min(250, secondsRemaining * 1000 + 8)),
          );
          return;
        }
        enterPlaying();
      };
      playTransitionTimerRef.current = window.setTimeout(
        handOffAtDownbeat,
        Math.max(0, (playStart - ctx.currentTime) * 1000 + 8),
      );

      const frame = () => {
        const context = ctxRef.current;
        const currentPlan = planRef.current;
        if (
          !context ||
          !currentPlan ||
          finishedRef.current ||
          runTokenRef.current !== runToken
        ) return;

        const now = context.currentTime;
        const beatPosition = (now - playStartRef.current) / currentPlan.secondsPerBeat;

        if (!detectorArmedRef.current && now >= pitchAnalysisStart - DETECTOR_PREROLL_SEC) {
          detectorArmedRef.current = true;
          workletRef.current?.port.postMessage({ type: 'listen' });
          if (generalChordTargetsRef.current.length > 0) {
            chordWorkletRef.current?.port.postMessage({
              type: 'listen-chord',
              targetMidi: generalChordTargetsRef.current,
              monitorMidi: generalChordMonitorRef.current,
            });
          }
        }

        cbRef.current.onFrame?.(beatPosition);

        if (beatPosition < 0) {
          // Counting in.
          const index = Math.min(
            countInBeats - 1,
            Math.max(0, Math.floor((now - (playStartRef.current - countInBeats * currentPlan.secondsPerBeat)) / currentPlan.secondsPerBeat)),
          );
          const key = `c${index}`;
          if (key !== lastBeatKeyRef.current) {
            lastBeatKeyRef.current = key;
            safeSet(setBeatLabel, currentPlan.countInLabels[index] ?? '');
            safeSet(setIsDownbeat, index === countInBeats - 1);
          }
        } else {
          enterPlaying();

          const timedShift = currentPlan.timedShift;
          const writtenBeatPosition = timedShift && beatPosition >= timedShift.endBeat
            ? beatPosition - timedShift.totalPauseBeats
            : beatPosition;
          const beatInBar = Math.floor(writtenBeatPosition) % currentPlan.beatsPerBar;
          const key = `p${Math.floor(beatPosition)}`;
          if (key !== lastBeatKeyRef.current) {
            lastBeatKeyRef.current = key;
            safeSet(setBeatLabel, String(beatInBar + 1));
          }

          if (now >= recordEndRef.current) {
            finishedRef.current = true;
            listeningRef.current = false;
            cbRef.current.onAnalysisStart?.();
            cbRef.current.onAnalysisProgress?.(12);
            const recordingDone = stopMicRecording();
            stopLoops();
            safeSet(setPhase, 'idle' as DrillPhase);
            safeSet(setBeatLabel, '');
            safeSet(setInputLevel, 0);

            // Pitch for the final note is measured ~200ms after its attack,
            // so grading waits for the worklet to flush rather than dropping
            // the last note of every drill.
            const worklet = workletRef.current;
            window.setTimeout(() => {
              if (runTokenRef.current !== runToken) return;
              worklet?.port.postMessage({ type: 'idle' });
              detectorArmedRef.current = false;
              // Do not expose the report until MediaRecorder has emitted its
              // final chunk and produced a playable object URL. A bounded
              // fallback prevents a broken browser recorder from blocking
              // grading forever.
              const recordingFallback = new Promise<void>((resolve) => {
                window.setTimeout(resolve, 700);
              });
              const captureFallback = new Promise<null>((resolve) => {
                window.setTimeout(() => resolve(null), 900);
              });
              void Promise.all([
                Promise.race([recordingDone, recordingFallback]),
                Promise.race([captureSession.done, captureFallback]),
              ]).then(async ([, capture]) => {
                if (!mountedRef.current || runTokenRef.current !== runToken) return;
                const realtime = onsetsRef.current.slice();
                cbRef.current.onAnalysisProgress?.(32);
                let analysis: ScoreAnalysisResult = {
                  notes: realtime,
                  recovered: 0,
                  livePreserved: 0,
                  rejected: 0,
                  expectedAccepted: 0,
                  expectedCount: currentPlan.expectedNotes.length,
                  reason: 'capture-unavailable',
                };
                if (capture) {
                  cbRef.current.onAnalysisProgress?.(48);
                  analysis = await analyzeCapturedTake(
                    capture,
                    currentPlan,
                    playStartRef.current,
                    realtime,
                    (percent) => cbRef.current.onAnalysisProgress?.(percent),
                  );
                }
                cbRef.current.onAnalysisProgress?.(92);
                if (!mountedRef.current || runTokenRef.current !== runToken) return;
                diagnosticsRef.current.offlineRecovered = analysis.recovered;
                diagnosticsRef.current.offlineLivePreserved = analysis.livePreserved;
                diagnosticsRef.current.offlineRejected = analysis.rejected;
                diagnosticsRef.current.offlineExpectedAccepted = analysis.expectedAccepted;
                diagnosticsRef.current.offlineExpectedCount = analysis.expectedCount;
                diagnosticsRef.current.offlineReason = analysis.reason;
                if (pcmCaptureRef.current?.id === captureSession.id) {
                  pcmCaptureRef.current = null;
                }
                window.setTimeout(() => {
                  if (!mountedRef.current || runTokenRef.current !== runToken) return;
                  cbRef.current.onFinish?.(
                    analysis.notes,
                    { ...diagnosticsRef.current },
                  );
                  cbRef.current.onAnalysisProgress?.(100);
                }, 60);
              });
            }, PITCH_FLUSH_MS);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(frame);
      };

      rafRef.current = requestAnimationFrame(frame);
      return true;
    },
    [
      ensureGraph,
      scheduleClick,
      stopLoops,
      stopSpatialPlayback,
      cancelMicRecording,
      cancelPcmCapture,
      beginPcmCapture,
      replaceRecordingUrl,
      startMicRecording,
      stopMicRecording,
      clearProofCompletionTimer,
      safeSet,
    ],
  );

  return {
    micStatus,
    phase,
    beatLabel,
    isDownbeat,
    inputLevel,
    detectedNames,
    proofProgress,
    spatialProgress,
    spatialFoundMidi,
    spatialWrongGuesses,
    spatialAudioIssue,
    recordingUrl,
    noiseFloor: () => noiseFloorRef.current,
    prepare,
    begin,
    beginProof,
    beginSpatialChord,
    previewSpatialChoice,
    abort,
  };
}
