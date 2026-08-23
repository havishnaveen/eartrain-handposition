import { useCallback, useEffect, useRef, useState } from 'react';

export interface NoteOnsetEvent {
  frequency: number;
  midi: number;
  noteName: string;
  cents: number;   // deviation from nearest semitone
  clarity: number; // 0..1 YIN confidence
  time: number;    // seconds since the audio graph started
}

interface UsePianoAudioOptions {
  workletUrl?: string;
  onNoteOnset?: (event: NoteOnsetEvent) => void;
  bufferSize?: number;
  hopSize?: number;
  yinThreshold?: number;
  minFreq?: number;
  maxFreq?: number;
}

type MicStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error';

function freqToNote(frequency: number) {
  const midiFloat = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return { midi, noteName: `${names[((midi % 12) + 12) % 12]}${octave}`, cents };
}

export function usePianoAudio(options: UsePianoAudioOptions = {}) {
  const {
    workletUrl = '/audio/pitch-processor.js?v=score-aware-pcm-v14-2026-08-22',
    onNoteOnset,
    bufferSize = 2048,
    hopSize = 1024,
    yinThreshold = 0.12,
    minFreq = 60,
    maxFreq = 1200,
  } = options;

  const [status, setStatus] = useState<MicStatus>('idle');
  const [lastNote, setLastNote] = useState<NoteOnsetEvent | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const onNoteOnsetRef = useRef(onNoteOnset);
  onNoteOnsetRef.current = onNoteOnset;

  const stop = useCallback(() => {
    workletNodeRef.current?.port.postMessage({ type: 'idle' });
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');

    try {
      // Echo cancellation / noise suppression are tuned for speech and
      // will distort or suppress musical harmonic content — turn them off.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const audioCtx = new window.AudioContext();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume(); // iOS/Safari gesture requirement

      await audioCtx.audioWorklet.addModule(workletUrl);

      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, 'pitch-processor', {
        processorOptions: { bufferSize, hopSize, yinThreshold, minFreq, maxFreq },
      });

      worklet.port.onmessage = (event: MessageEvent) => {
        if (event.data?.type !== 'note-onset') return;
        const { frequency, clarity, time } = event.data;
        const { midi, noteName, cents } = freqToNote(frequency);
        const noteEvent: NoteOnsetEvent = { frequency, midi, noteName, cents, clarity, time };
        setLastNote(noteEvent);
        onNoteOnsetRef.current?.(noteEvent);
      };

      // Intentionally NOT connecting worklet -> destination: we only
      // analyze the signal, we don't play it back (avoids feedback risk).
      source.connect(worklet);
      workletNodeRef.current = worklet;
      // The worklet learns room statistics continuously but emits no notes
      // until explicitly armed. This legacy hook previously omitted the
      // message and therefore appeared ready while silently detecting none.
      worklet.port.postMessage({ type: 'listen' });
      setStatus('ready');
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setStatus(denied ? 'denied' : 'error');
      stop();
    }
  }, [workletUrl, bufferSize, hopSize, yinThreshold, minFreq, maxFreq, stop]);

  useEffect(() => stop, [stop]); // release mic + context on unmount

  return { status, lastNote, start, stop };
}
