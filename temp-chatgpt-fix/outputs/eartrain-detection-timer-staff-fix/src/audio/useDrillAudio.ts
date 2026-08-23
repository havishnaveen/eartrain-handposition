import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedNote, DrillPlan } from './timing';
import { frequencyToMidi, midiToName, pitchToMidi } from './timing';

export type MicStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error';
export type DrillPhase = 'idle' | 'countin' | 'playing';

export interface UseDrillAudioOptions {
  /** Path to the worklet module. Vite serves `public/` at the root. */
  workletUrl?: string;
  /** Fired once on the downbeat, with its AudioContext time. */
  onPlayStart?: (audioTime: number) => void;
  /** Fired after final deferred pitch frames flush, with everything heard. */
  onFinish?: (detected: DetectedNote[]) => void;
  /** Fired as soon as recording closes and final pitch frames begin flushing. */
  onAnalysisStart?: () => void;
  /**
   * Called every animation frame while counting in or playing, with the
   * position in beats from the downbeat (negative during count-in).
   * Drive the scrubber from here — never from React state.
   */
  onFrame?: (beatPosition: number) => void;
  /** Fired after the requested physical hand position is acoustically proved. */
  onProofSuccess?: () => void;
}

export interface PositionProofTarget {
  proofNotes: [
    { pitch: string; finger: number },
    { pitch: string; finger: number },
    { pitch: string; finger: number },
  ];
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
  /** Object URL for the most recently completed microphone take. */
  recordingUrl: string | null;
  /** Room noise estimate, for diagnostics. */
  noiseFloor: () => number;
  /** Requests the mic if needed, then runs count-in and recording. */
  begin: (plan: DrillPlan) => Promise<void>;
  /** Opens and warms the microphone graph without starting a drill. */
  prepare: () => Promise<boolean>;
  /** Starts a microphone-only position check without clicks or recording. */
  beginProof: (target: PositionProofTarget) => Promise<boolean>;
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
 * Grace after the window closes, so deferred pitch estimates for the last
 * note can arrive. The worklet measures pitch during the sustain, not the
 * attack, so results trail their onsets.
 */
const PITCH_FLUSH_MS = 380;
/** Same-pitch events inside this window need acoustic evidence of a new hit. */
const SAME_NOTE_STRICT_WINDOW_SEC = 1.25;
const ABSOLUTE_RETRIGGER_FLOOR_SEC = 0.12;
const RETRIGGER_ATTACK_RATIO = 1.35;
const RETRIGGER_GATE_MULTIPLIER = 1.35;
const RETRIGGER_PREVIOUS_PEAK_RATIO = 0.32;
const LATE_RETRIGGER_ATTACK_RATIO = 1.22;
const LATE_RETRIGGER_GATE_MULTIPLIER = 1.15;

export interface RetriggerEvidence {
  time: number;
  peakRms: number;
  gate: number;
  attackRatio: number;
}

/** Pure so the acoustic re-articulation rule can be regression-tested. */
export function isClearSamePitchRetrigger(
  previous: Pick<RetriggerEvidence, 'time' | 'peakRms'>,
  current: RetriggerEvidence,
): boolean {
  const gap = current.time - previous.time;
  if (gap < ABSOLUTE_RETRIGGER_FLOOR_SEC) return false;
  const freshEnvelope =
    Number.isFinite(current.attackRatio) &&
    Number.isFinite(current.peakRms) &&
    Number.isFinite(current.gate) &&
    current.attackRatio >= LATE_RETRIGGER_ATTACK_RATIO &&
    current.peakRms >= current.gate * LATE_RETRIGGER_GATE_MULTIPLIER;
  if (!freshEnvelope) return false;
  if (gap >= SAME_NOTE_STRICT_WINDOW_SEC) return true;
  return (
    current.attackRatio >= RETRIGGER_ATTACK_RATIO &&
    current.peakRms >= current.gate * RETRIGGER_GATE_MULTIPLIER &&
    current.peakRms >= previous.peakRms * RETRIGGER_PREVIOUS_PEAK_RATIO
  );
}

interface Scheduled {
  time: number;
  accent: boolean;
}

export interface ActiveProof {
  targetMidi: [number, number, number];
  acceptWindowSec: number;
  nextIndex: 0 | 1 | 2;
  firstHeardAt: number | null;
}

export interface PositionProofAdvance {
  progress: 0 | 1 | 2 | 3;
  complete: boolean;
}

/**
 * Prove It is intentionally a tiny, deterministic state machine. The first
 * named pitch must be heard before the middle and final notes; other notes
 * never count as a partial match. Replaying the first note restarts the
 * short window.
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

  if (midi === proof.targetMidi[0]) {
    proof.nextIndex = 1;
    proof.firstHeardAt = time;
    return { progress: 1, complete: false };
  }

  if (midi === proof.targetMidi[proof.nextIndex]) {
    const progress = (proof.nextIndex + 1) as 2 | 3;
    if (progress === proof.targetMidi.length) {
      return { progress: 3, complete: true };
    }
    proof.nextIndex = progress;
    return { progress, complete: false };
  }

  return { progress: proof.nextIndex, complete: false };
}

function playProofSuccessChime(ctx: AudioContext): void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.62);
  master.connect(ctx.destination);
  [659.25, 830.61, 987.77].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(master);
    oscillator.start(ctx.currentTime + index * 0.075);
    oscillator.stop(ctx.currentTime + 0.5 + index * 0.075);
    oscillator.onended = () => oscillator.disconnect();
  });
  window.setTimeout(() => master.disconnect(), 760);
}

export function useDrillAudio(options: UseDrillAudioOptions = {}): DrillAudio {
  const { workletUrl = '/audio/pitch-processor.js' } = options;

  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [phase, setPhase] = useState<DrillPhase>('idle');
  const [beatLabel, setBeatLabel] = useState('');
  const [isDownbeat, setIsDownbeat] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [detectedNames, setDetectedNames] = useState<string[]>([]);
  const [proofProgress, setProofProgress] = useState<0 | 1 | 2 | 3>(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  // Callbacks via refs so a re-render never restarts the audio graph.
  const cbRef = useRef(options);
  cbRef.current = options;

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const clickGainRef = useRef<GainNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);

  const rafRef = useRef(0);
  const schedTimerRef = useRef(0);

  const planRef = useRef<DrillPlan | null>(null);
  const clicksRef = useRef<Scheduled[]>([]);
  const nextClickRef = useRef(0);
  const playStartRef = useRef(0);
  const recordEndRef = useRef(0);
  const listeningRef = useRef(false);
  const finishedRef = useRef(true);
  const onsetsRef = useRef<DetectedNote[]>([]);
  const proofRef = useRef<ActiveProof | null>(null);
  const lastStrikeByMidiRef = useRef(new Map<number, { time: number; peakRms: number }>());
  const lastBeatKeyRef = useRef('');
  const noiseFloorRef = useRef(0);
  const mountedRef = useRef(true);

  const safeSet = useCallback(<T,>(setter: (v: T) => void, value: T) => {
    if (mountedRef.current) setter(value);
  }, []);

  const replaceRecordingUrl = useCallback((nextUrl: string | null) => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = nextUrl;
    safeSet(setRecordingUrl, nextUrl);
  }, [safeSet]);

  const cancelMicRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') recorder.stop();
  }, []);

  const startMicRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;

    cancelMicRecording();
    recordingChunksRef.current = [];

    try {
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0].type });
        replaceRecordingUrl(URL.createObjectURL(blob));
      };
      recorder.onerror = () => {
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      // Pitch grading still works when a browser cannot create a MediaRecorder.
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
    }
  }, [cancelMicRecording, replaceRecordingUrl]);

  const stopMicRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const stopLoops = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (schedTimerRef.current) {
      window.clearInterval(schedTimerRef.current);
      schedTimerRef.current = 0;
    }
  }, []);

  /** Full teardown. Every node, the stream, and the context. */
  const teardown = useCallback(() => {
    stopLoops();
    cancelMicRecording();

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
  }, [stopLoops, cancelMicRecording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  /** Creates the graph on first use and reuses it for every later drill. */
  const ensureGraph = useCallback(async (): Promise<AudioContext | null> => {
    if (ctxRef.current && workletRef.current) {
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
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      await ctx.audioWorklet.addModule(workletUrl);
      if (!mountedRef.current) return null;

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pitch-processor');

      worklet.port.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data) return;

        const acceptProofNote = (midi: number, time: number): boolean => {
          const proof = proofRef.current;
          if (!proof) return false;
          const result = advancePositionProof(proof, midi, time);
          safeSet(setProofProgress, result.progress);
          if (!result.complete) return false;
          proofRef.current = null;
          worklet.port.postMessage({ type: 'idle' });
          safeSet(setPhase, 'idle' as DrillPhase);
          safeSet(setInputLevel, 0);
          playProofSuccessChime(ctx);
          cbRef.current.onProofSuccess?.();
          return true;
        };

        if (data.type === 'level') {
          safeSet(setInputLevel, data.level as number);
          noiseFloorRef.current = data.noiseFloor ?? noiseFloorRef.current;
          return;
        }

        if (data.type === 'note-onset') {
          // Defense in depth: current worklets include their adaptive RMS
          // gate with every onset. Never surface a pitch that did not clear
          // it, even if a stale/cached processor posts a malformed event.
          if (
            Number.isFinite(data.peakRms) &&
            Number.isFinite(data.gate) &&
            data.peakRms < data.gate
          ) return;
          // Mirror the worklet's borderline-note tolerances. The adaptive
          // amplitude gate and four-frame stability check still reject room
          // noise before these messages can reach the drill.
          if (Number.isFinite(data.clarity) && data.clarity < 0.25) return;
          if (Number.isFinite(data.consensus) && data.consensus < 0.5) return;

          const midi = frequencyToMidi(data.frequency);
          if (!Number.isFinite(midi) || midi < 21 || midi > 108) return;

          if (proofRef.current) {
            safeSet(setDetectedNames, [midiToName(midi)]);
            acceptProofNote(midi, data.time);
            return;
          }

          // A sustained piano string can develop a fresh spectral bump as
          // its partials beat, even though no key was struck again. For the
          // same MIDI pitch, accept a close repeat only when the amplitude
          // envelope also proves a physical re-articulation.
          const previousStrike = lastStrikeByMidiRef.current.get(midi);
          if (
            previousStrike &&
            !isClearSamePitchRetrigger(previousStrike, {
              time: data.time,
              peakRms: data.peakRms,
              gate: data.gate,
              attackRatio: data.attackRatio,
            })
          ) return;
          // Pitch is measured after the attack, so an onset can arrive a
          // beat late — including just after the window closed. Keep it if
          // the onset itself happened while recording.
          if (!listeningRef.current && data.time < playStartRef.current) return;
          onsetsRef.current.push({
            midi,
            time: data.time,
            clarity: data.clarity ?? 0,
            strength: data.strength ?? 1,
            sustain: data.sustain ?? 1,
          });
          lastStrikeByMidiRef.current.set(midi, {
            time: data.time,
            peakRms: Number.isFinite(data.peakRms) ? data.peakRms : 0,
          });
          onsetsRef.current.sort((a, b) => a.time - b.time);
          safeSet(setDetectedNames, onsetsRef.current.map((n) => midiToName(n.midi)));
        }
      };

      // Analysis only — never routed to the speakers, so no feedback path.
      source.connect(worklet);
      sourceRef.current = source;
      workletRef.current = worklet;

      // Metronome output bus.
      const clickGain = ctx.createGain();
      clickGain.gain.value = 0.32;
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
  }, [workletUrl, safeSet, teardown]);

  /**
   * Woodblock click, scheduled on the audio clock.
   *
   * Three layers, because a bare oscillator reads as a beep rather than a
   * struck object:
   *   - a pitched body that glides down fast, which is what makes wood sound
   *     like wood rather than like a tone
   *   - a short filtered noise transient for the attack
   *   - a gentle lowpass over both so nothing gets shrill on laptop speakers
   *
   * Accent ("tick") sits higher and louder than the subdivision ("tock"), so
   * the downbeat is unmistakable without being harsh.
   */
  const scheduleClick = useCallback((time: number, accent: boolean) => {
    const ctx = ctxRef.current;
    const bus = clickGainRef.current;
    if (!ctx || !bus) return;

    const peak = accent ? 0.62 : 0.34;
    const bodyFrom = accent ? 1180 : 810;
    const bodyTo = accent ? 720 : 520;
    const decay = accent ? 0.085 : 0.065;

    // Pitched body.
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(bodyFrom, time);
    body.frequency.exponentialRampToValueAtTime(bodyTo, time + 0.028);

    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, time);
    bodyEnv.gain.exponentialRampToValueAtTime(peak, time + 0.004);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    // Attack transient.
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = accent ? 2400 : 1800;
    noiseFilter.Q.value = 1.1;

    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(0.0001, time);
    noiseEnv.gain.exponentialRampToValueAtTime(peak * 0.5, time + 0.002);
    noiseEnv.gain.exponentialRampToValueAtTime(0.0001, time + 0.022);

    // Shared tone shaping.
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = accent ? 4200 : 3400;
    warm.Q.value = 0.7;

    body.connect(bodyEnv);
    bodyEnv.connect(warm);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseEnv);
    noiseEnv.connect(warm);
    warm.connect(bus);

    body.start(time);
    body.stop(time + decay + 0.02);
    noise.start(time);
    noise.stop(time + 0.05);

    // One-shot nodes: release the graph edges so they can be collected.
    body.onended = () => {
      body.disconnect();
      bodyEnv.disconnect();
      noise.disconnect();
      noiseFilter.disconnect();
      noiseEnv.disconnect();
      warm.disconnect();
    };
  }, []);

  const abort = useCallback(() => {
    stopLoops();
    cancelMicRecording();
    proofRef.current = null;
    safeSet(setProofProgress, 0);
    listeningRef.current = false;
    finishedRef.current = true;
    workletRef.current?.port.postMessage({ type: 'idle' });
    safeSet(setPhase, 'idle' as DrillPhase);
    safeSet(setBeatLabel, '');
    safeSet(setIsDownbeat, false);
  }, [stopLoops, cancelMicRecording, safeSet]);

  const prepare = useCallback(async (): Promise<boolean> => {
    const ctx = await ensureGraph();
    return Boolean(ctx && workletRef.current && mountedRef.current);
  }, [ensureGraph]);

  const beginProof = useCallback(
    async (target: PositionProofTarget): Promise<boolean> => {
      const targetMidi = target.proofNotes.map((note) => pitchToMidi(note.pitch));
      if (targetMidi.some((midi) => midi === null)) return false;

      const ctx = await ensureGraph();
      const worklet = workletRef.current;
      if (!ctx || !worklet || !mountedRef.current) return false;

      stopLoops();
      cancelMicRecording();
      replaceRecordingUrl(null);
      onsetsRef.current = [];
      lastStrikeByMidiRef.current.clear();
      proofRef.current = {
        targetMidi: targetMidi as [number, number, number],
        acceptWindowSec: Math.max(1.2, (target.acceptWindowMs ?? 2800) / 1000),
        nextIndex: 0,
        firstHeardAt: null,
      };
      listeningRef.current = false;
      finishedRef.current = true;
      safeSet(setDetectedNames, [] as string[]);
      safeSet(setProofProgress, 0);
      safeSet(setPhase, 'playing' as DrillPhase);
      worklet.port.postMessage({ type: 'listen' });
      return true;
    },
    [
      ensureGraph,
      stopLoops,
      cancelMicRecording,
      replaceRecordingUrl,
      safeSet,
    ],
  );

  const begin = useCallback(
    async (plan: DrillPlan) => {
      const ctx = await ensureGraph();
      if (!ctx || !mountedRef.current) return;

      stopLoops();
      cancelMicRecording();
      replaceRecordingUrl(null);

      planRef.current = plan;
      proofRef.current = null;
      safeSet(setProofProgress, 0);
      onsetsRef.current = [];
      lastStrikeByMidiRef.current.clear();
      lastBeatKeyRef.current = '';
      listeningRef.current = false;
      finishedRef.current = false;
      safeSet(setDetectedNames, [] as string[]);

      const spb = plan.secondsPerBeat;
      const t0 = ctx.currentTime + START_PAD_SEC;
      const countInBeats = plan.beatsPerBar * 2;
      const playStart = t0 + countInBeats * spb;
      playStartRef.current = playStart;
      recordEndRef.current = playStart + plan.recordSeconds;

      // Build the whole click list up front: count-in, then every beat of
      // the drill. Scheduling is then a matter of draining this list.
      const clicks: Scheduled[] = [];
      for (let i = 0; i < countInBeats; i++) {
        clicks.push({ time: t0 + i * spb, accent: i % plan.beatsPerBar === 0 });
      }
      const playBeats = Math.ceil(plan.totalBeats);
      for (let j = 0; j < playBeats; j++) {
        clicks.push({
          time: playStart + j * spb,
          accent: j % plan.beatsPerBar === 0,
        });
      }
      clicksRef.current = clicks;
      nextClickRef.current = 0;

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

      const frame = () => {
        const context = ctxRef.current;
        const currentPlan = planRef.current;
        if (!context || !currentPlan || finishedRef.current) return;

        const now = context.currentTime;
        const beatPosition = (now - playStartRef.current) / currentPlan.secondsPerBeat;

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
          if (!listeningRef.current) {
            listeningRef.current = true;
            startMicRecording();
            workletRef.current?.port.postMessage({ type: 'listen' });
            safeSet(setPhase, 'playing' as DrillPhase);
            safeSet(setIsDownbeat, false);
            cbRef.current.onPlayStart?.(playStartRef.current);
          }

          const beatInBar = Math.floor(beatPosition) % currentPlan.beatsPerBar;
          const key = `p${Math.floor(beatPosition)}`;
          if (key !== lastBeatKeyRef.current) {
            lastBeatKeyRef.current = key;
            safeSet(setBeatLabel, String(beatInBar + 1));
          }

          if (now >= recordEndRef.current) {
            finishedRef.current = true;
            listeningRef.current = false;
            cbRef.current.onAnalysisStart?.();
            stopMicRecording();
            stopLoops();
            safeSet(setPhase, 'idle' as DrillPhase);
            safeSet(setBeatLabel, '');
            safeSet(setInputLevel, 0);

            // Pitch for the final note is measured ~200ms after its attack,
            // so grading waits for the worklet to flush rather than dropping
            // the last note of every drill.
            const worklet = workletRef.current;
            window.setTimeout(() => {
              worklet?.port.postMessage({ type: 'idle' });
              window.setTimeout(() => {
                if (!mountedRef.current) return;
                cbRef.current.onFinish?.(onsetsRef.current.slice());
              }, 60);
            }, PITCH_FLUSH_MS);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(frame);
      };

      rafRef.current = requestAnimationFrame(frame);
    },
    [
      ensureGraph,
      scheduleClick,
      stopLoops,
      cancelMicRecording,
      replaceRecordingUrl,
      startMicRecording,
      stopMicRecording,
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
    recordingUrl,
    noiseFloor: () => noiseFloorRef.current,
    prepare,
    begin,
    beginProof,
    abort,
  };
}
