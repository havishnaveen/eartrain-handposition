// Development-only browser smoke test: real AudioWorklet → MessagePort → Worker.
// Generated PCM only; no microphone permission and no audible output.
import { planFor } from '../audio/timing';
import { findCompletePolyphonicGroup } from '../audio/useDrillAudio';
const button = document.querySelector<HTMLButtonElement>('#run')!;
const output = document.querySelector<HTMLElement>('#result')!;
button.onclick = async () => {
  button.disabled = true;
  const context = new AudioContext();
  const worker = new Worker('/audio/chord-analysis-worker.js?v=1');
  try {
    output.textContent = `Starting audio (${context.state})`;
    await Promise.race([context.resume(), new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Audio context did not resume')), 3000))]);
    output.textContent = 'Loading background analyzer';
    await context.audioWorklet.addModule('/audio/chord-capture-processor.js?v=1');
    const capture = new AudioWorkletNode(context, 'chord-capture-processor');
    const channel = new MessageChannel();
    capture.port.postMessage({ type: 'connect', port: channel.port1 }, [channel.port1]);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker startup timeout')), 2000);
      worker.onmessage = ({ data }) => {
        clearTimeout(timer);
        if (data.type === 'ready') resolve(); else reject(new Error(data.message));
      };
      worker.onerror = () => { clearTimeout(timer); reject(new Error('Worker error')); };
      worker.postMessage({ type: 'connect', port: channel.port2, sampleRate: context.sampleRate,
        engineUrl: new URL('/audio/chord-processor.js', location.href).href }, [channel.port2]);
    });
    const targets = [48, 60, 64, 67];
    const plan = planFor({ timeSignature: '4/4', staves: [
      { clef: 'treble', hand: 'right', notes: [{ keys: ['c/4', 'e/4', 'g/4'], duration: 'w' }] },
      { clef: 'bass', hand: 'left', notes: [{ keys: ['c/3'], duration: 'w' }] },
    ] }, ['C4', 'E4', 'G4', 'C3'], 75);
    let playStart = 0;
    const groups: number[][] = [];
    let timelyComplete = false;
    capture.port.onmessage = ({ data }) => {
      if (data.type !== 'chord-tones') return;
      groups.push(data.midi);
      const arrivalBeats = new Map<number, number>(data.arrivals.map((arrival: {midi: number; time: number}) =>
        [arrival.midi, (arrival.time - playStart) / plan.secondsPerBeat]));
      if (findCompletePolyphonicGroup(plan, new Set(data.midi),
        (data.time - playStart) / plan.secondsPerBeat, new Set(), arrivalBeats)) timelyComplete = true;
    };
    capture.port.postMessage({ type: 'listen-chord', targetMidi: targets,
      monitorMidi: Array.from({ length: 24 }, (_, i) => 46 + i) });
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const pcm = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      const time = i / context.sampleRate;
      const age = time - 0.5;
      if (age < 0) continue;
      for (const midi of targets) for (let h = 1; h <= 5; h++) {
        pcm[i] += .014 * (midi === 48 ? 1 : .5) * Math.min(1, age / .012) * Math.exp(-age / 1.9) /
          h ** 1.15 * Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * h *
            (1 + .00012 * h * h) * time + midi * .07);
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(capture);
    // Deliberately match production's analysis-only, disconnected output.
    const ended = new Promise<void>((resolve) => { source.onended = () => resolve(); });
    const sourceStart = context.currentTime + .05;
    playStart = sourceStart + .5;
    source.start(sourceStart);
    output.textContent = 'Testing generated two-hand audio';
    await Promise.race([ended, new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Audio playback did not complete')), 6000))]);
    if (!timelyComplete) {
      throw new Error(`Missing chord tones: ${JSON.stringify(groups)}`);
    }
    capture.port.postMessage({ type: 'idle' });
    capture.disconnect();
    output.textContent = `PASS: all four two-hand tones detected through the real browser pipeline at ${context.sampleRate} Hz.\n${JSON.stringify(groups)}`;
  } catch (error) {
    output.textContent = `FAIL: ${String(error)}`;
  } finally {
    worker.terminate();
    await context.close();
    button.disabled = false;
  }
};
