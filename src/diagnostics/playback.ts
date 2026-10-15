import { getAudioContext, initAudio, loadSample, scheduleNote, stopAllAudio } from '../lib/audio';
import { soundingPitch } from './registry';
import { beatsForDuration, planForQuestion } from '../audio/timing';
import type { Question } from '../curriculum/types';

export function diagnosticPlaybackTiming(count: number, durations?: readonly string[]) {
  let beat = 0;
  const notes = Array.from({ length: count }, (_, i) => {
    const beats = beatsForDuration(durations?.[i] ?? 'q');
    const note = { start: beat * .8, duration: beats * .65 };
    beat += beats;
    return note;
  });
  return { notes, seconds: beat * .8 };
}

/** Cancellable, sample-based piano demo. Never opens the microphone. */
export function playDiagnosticExample(pitches: readonly string[], hesitationBefore?: number, durations?: readonly string[], hesitationSeconds = 2, question?: Question): { done: Promise<void>; stop: () => void } {
  let cancelled = false, timer = 0;
  let settle: (() => void) | undefined;
  const stop = () => { cancelled = true; window.clearTimeout(timer); stopAllAudio(); settle?.(); };
  const done = (async () => {
    await initAudio();
    const notes = pitches.map(pitch => { const match = /^(.+?)(\d+)$/.exec(soundingPitch(pitch))!; return { name: match[1], octave: Number(match[2]) }; });
    const buffers = await Promise.all(notes.map(note => loadSample(note.name, note.octave)));
    if (cancelled) return;
    if (buffers.some(buffer => !buffer)) throw new Error('Piano samples unavailable');
    const start = getAudioContext()!.currentTime + .12;
    const plan = question ? planForQuestion(question, 75) : null;
    const timing = plan ? { notes: plan.expectedNotes.map(n => ({ start: n.beat * .8, duration: n.beats * .65 })), seconds: Math.max(...plan.expectedNotes.map(n => n.beat + n.beats)) * .8 } : diagnosticPlaybackTiming(notes.length, durations);
    await Promise.all(notes.map((note, i) => scheduleNote(note.name, note.octave, timing.notes[i].duration, .65, start + timing.notes[i].start + (hesitationBefore !== undefined && i >= hesitationBefore ? hesitationSeconds : 0))));
    if (cancelled) return;
    await new Promise<void>(resolve => { settle = resolve; timer = window.setTimeout(resolve, (timing.seconds + .15 + (hesitationBefore !== undefined ? hesitationSeconds : 0)) * 1000); });
  })();
  return { done, stop };
}
