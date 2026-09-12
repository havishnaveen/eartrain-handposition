import { getAudioContext, initAudio, loadSample, scheduleNote, stopAllAudio } from '../lib/audio';
import { soundingPitch } from './registry';

/** Cancellable, sample-based piano demo. Never opens the microphone. */
export function playDiagnosticExample(pitches: readonly string[], hesitationBefore?: number): { done: Promise<void>; stop: () => void } {
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
    await Promise.all(notes.map((note, i) => scheduleNote(note.name, note.octave, .65, .65, start + i * .8 + (hesitationBefore !== undefined && i >= hesitationBefore ? 2 : 0))));
    if (cancelled) return;
    await new Promise<void>(resolve => { settle = resolve; timer = window.setTimeout(resolve, (notes.length * .8 + .15 + (hesitationBefore !== undefined ? 2 : 0)) * 1000); });
  })();
  return { done, stop };
}
