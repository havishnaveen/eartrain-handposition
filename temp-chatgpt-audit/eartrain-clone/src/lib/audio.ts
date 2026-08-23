// AudioEngine implementation with MusyngKite piano samples

const SAMPLE_BASE_URL = "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-mp3/";

// Mapping sharp notes to the flat notation used by the CDN
const SAMPLE_MAP: Record<string, string> = {
  "C": "C", "C#": "Db", "D": "D", "D#": "Eb", "E": "E", "F": "F", "F#": "Gb", "G": "G", "G#": "Ab", "A": "A", "A#": "Bb", "B": "B"
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FLAT_TO_SHARP: Record<string, string> = {
  "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"
};

const normalizeNote = (note: string) => {
  const n = note.replace(/[0-9]/g, '');
  return FLAT_TO_SHARP[n] || n;
};

let audioCtx: AudioContext | null = null;
const activeSources = new Set<AudioBufferSourceNode>();
const loadingPromises = new Map<string, Promise<AudioBuffer | null>>();
const bufferCache = new Map<string, AudioBuffer>();

let currentAudioSession = 0;
export const getAudioSession = () => currentAudioSession;

export const waitAudio = (ms: number) => {
  const session = currentAudioSession;
  return new Promise<boolean>(resolve => {
    setTimeout(() => {
      resolve(session === currentAudioSession);
    }, ms);
  });
};

export const initAudio = async () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
};

export const stopAllAudio = () => {
  currentAudioSession++;
  stopActiveSourcesOnly();
};

export const stopActiveSourcesOnly = () => {
  activeSources.forEach(source => {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {
      // ignore
    }
  });
  activeSources.clear();
};

const getSampleUrl = (note: string, octave: number) => {
  const mapped = SAMPLE_MAP[note] || note;
  return `${SAMPLE_BASE_URL}${mapped}${octave}.mp3`;
};

export const loadSample = async (note: string, octave: number): Promise<AudioBuffer | null> => {
  if (!audioCtx) await initAudio();
  note = normalizeNote(note);
  const key = `${note}${octave}`;
  
  if (bufferCache.has(key)) return bufferCache.get(key)!;
  if (loadingPromises.has(key)) return loadingPromises.get(key)!;

  const promise = fetch(getSampleUrl(note, octave))
    .then(res => res.arrayBuffer())
    .then(data => audioCtx!.decodeAudioData(data))
    .then(buffer => {
      bufferCache.set(key, buffer);
      return buffer;
    })
    .catch(() => null);

  loadingPromises.set(key, promise);
  return promise;
};

// Fallback synth
const playSynthNote = (freq: number, duration: number, vol: number) => {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(vol * 0.5, audioCtx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
};

const noteToFreq = (note: string, octave: number) => {
  note = normalizeNote(note);
  let semitones = NOTE_NAMES.indexOf(note);
  if (semitones === -1) semitones = 0;
  return 440 * Math.pow(2, (octave - 4) + (semitones - 9) / 12);
};

export const preloadAllNotes = async () => {
  const octaves = [3, 4, 5];
  const promises = [];
  for (const octave of octaves) {
    for (const note of NOTE_NAMES) {
      promises.push(loadSample(note, octave));
    }
  }
  await Promise.all(promises);
};

export const playNote = async (note: string, octave: number, duration: number = 2, vol: number = 1, delayMs: number = 0, detuneCents: number = 0) => {
  const session = currentAudioSession;
  note = normalizeNote(note);
  if (!audioCtx) initAudio();
  const buffer = await loadSample(note, octave);
  
  if (session !== currentAudioSession) return;

  if (!buffer) {
    // If the piano sample failed to load, we do not play anything
    // This ensures we ONLY hear piano sounds as requested by the user.
    return;
  }

  const source = audioCtx!.createBufferSource();
  const gain = audioCtx!.createGain();
  
  source.buffer = buffer;
  if (detuneCents !== 0) {
    source.detune.value = detuneCents;
  }
  source.connect(gain);
  gain.connect(audioCtx!.destination);
  
  gain.gain.value = vol;
  const noteStart = audioCtx!.currentTime + (delayMs / 1000);
  const noteEnd = noteStart + duration;
  // Sharp fade-out in the last 50ms to avoid sustain bleed / "pedal on" sound
  gain.gain.setValueAtTime(vol, noteEnd - 0.05);
  gain.gain.linearRampToValueAtTime(0, noteEnd);
  
  source.start(noteStart);
  source.stop(noteEnd + 0.01); // Hard stop shortly after fade completes
  activeSources.add(source);
  
  source.onended = () => {
    activeSources.delete(source);
    source.disconnect();
  };
};

export const scheduleNote = async (note: string, octave: number, duration: number, vol: number, startTime: number) => {
  const session = currentAudioSession;
  note = normalizeNote(note);
  if (!audioCtx) initAudio();
  const buffer = await loadSample(note, octave);
  
  if (session !== currentAudioSession) return;

  if (!buffer) {
    const delayMs = Math.max(0, (startTime - audioCtx!.currentTime) * 1000);
    setTimeout(() => {
      if (session === currentAudioSession) playSynthNote(noteToFreq(note, octave), duration, vol);
    }, delayMs);
    return;
  }

  const source = audioCtx!.createBufferSource();
  const gain = audioCtx!.createGain();
  
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audioCtx!.destination);
  
  gain.gain.value = vol;
  const noteEnd = startTime + duration;
  // Sharp fade-out in the last 50ms to avoid sustain bleed
  gain.gain.setValueAtTime(vol, noteEnd - 0.05);
  gain.gain.linearRampToValueAtTime(0, noteEnd);
  
  source.start(startTime);
  source.stop(noteEnd + 0.01); // Hard stop shortly after fade
  activeSources.add(source);
  
  source.onended = () => {
    activeSources.delete(source);
    source.disconnect();
  };
};

export const getAudioContext = () => {
  if (!audioCtx) initAudio();
  return audioCtx;
};

export const playChord = async (notes: {note: string, octave: number}[], duration: number = 2.5, vol: number = 1) => {
  const session = currentAudioSession;
  stopActiveSourcesOnly();
  await Promise.all(notes.map(n => loadSample(n.note, n.octave)));
  if (session !== currentAudioSession) return;
  const scaledVol = vol / Math.sqrt(notes.length);
  notes.forEach((n, i) => {
    // humanized stagger 15ms per note
    playNote(n.note, n.octave, duration, scaledVol, i * 15);
  });
};

export const playInterval = async (n1: {note: string, octave: number}, n2: {note: string, octave: number}, simultaneous: boolean) => {
  const session = currentAudioSession;
  stopActiveSourcesOnly();
  await Promise.all([loadSample(n1.note, n1.octave), loadSample(n2.note, n2.octave)]);
  if (session !== currentAudioSession) return;
  
  if (simultaneous) {
    await playChord([n1, n2], 2);
    const ok = await waitAudio(2000);
    if (!ok) return;
    playNote(n1.note, n1.octave, 1.5, 1, 0);
    playNote(n2.note, n2.octave, 1.5, 1, 1000);
  } else {
    playNote(n1.note, n1.octave, 1.5, 1, 0);
    playNote(n2.note, n2.octave, 1.5, 1, 1000);
  }
};

export const playMetronomeClick = (accent: boolean, delayMs: number = 0) => {
  if (!audioCtx) initAudio();
  
  // Classic click uses a short sine burst with a rapid pitch drop and short envelope
  const osc = audioCtx!.createOscillator();
  const gain = audioCtx!.createGain();
  
  osc.type = 'sine';
  const startFreq = accent ? 1200 : 800;
  const time = audioCtx!.currentTime + delayMs/1000;
  
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.03); // rapid pitch drop creates the "tick"
  
  gain.gain.setValueAtTime(accent ? 1 : 0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  
  osc.connect(gain);
  gain.connect(audioCtx!.destination);
  osc.start(time);
  osc.stop(time + 0.05);
};

export type SequenceEvent = {
  notes: { note: string; octave: number }[];
  duration: number; // in seconds
  gapAfter: number; // gap after this event before next event in seconds
};

export const playSequenceWithUI = async (
  events: SequenceEvent[],
  onActiveNotes: (notes: string[]) => void
) => {
  const session = currentAudioSession;
  if (!audioCtx) await initAudio();
  if (audioCtx?.state === 'suspended') await audioCtx.resume();
  
  const loadPromises: Promise<any>[] = [];
  events.forEach(ev => {
    ev.notes.forEach(n => loadPromises.push(loadSample(n.note, n.octave)));
  });
  await Promise.all(loadPromises);
  if (session !== currentAudioSession) return;
  
  const startTime = audioCtx!.currentTime + 0.1;
  let timeOffset = 0;
  
  events.forEach(ev => {
    ev.notes.forEach((n, i) => {
      const stagger = ev.notes.length > 1 ? (i * 0.015) : 0;
      scheduleNote(n.note, n.octave, ev.duration, 1 / Math.sqrt(ev.notes.length || 1), startTime + timeOffset + stagger);
    });
    timeOffset += ev.duration + ev.gapAfter;
  });
  
  let uiOffset = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const waitTime = (startTime + uiOffset - audioCtx!.currentTime) * 1000;
    if (waitTime > 0) {
      await new Promise(r => setTimeout(r, waitTime));
    }
    if (session !== currentAudioSession) return;
    
    onActiveNotes(ev.notes.map(n => `${n.note}${n.octave}`));
    
    await new Promise(r => setTimeout(r, ev.duration * 1000));
    if (session !== currentAudioSession) return;
    onActiveNotes([]);
    
    if (ev.gapAfter > 0) {
      await new Promise(r => setTimeout(r, ev.gapAfter * 1000));
    }
    uiOffset += ev.duration + ev.gapAfter;
  }
};

// Utilities
export const getRandomNote = (minOct: number, maxOct: number, excludeSharp: boolean = false) => {
  const oct = Math.floor(Math.random() * (maxOct - minOct + 1)) + minOct;
  let pool = excludeSharp ? ["C", "D", "E", "F", "G", "A", "B"] : NOTE_NAMES;
  const note = pool[Math.floor(Math.random() * pool.length)];
  return { note, octave: oct };
};

export const getNoteAtInterval = (base: {note: string, octave: number}, semitones: number) => {
  let idx = NOTE_NAMES.indexOf(base.note);
  let total = idx + semitones;
  let oct = base.octave + Math.floor(total / 12);
  let newIdx = ((total % 12) + 12) % 12;
  return { note: NOTE_NAMES[newIdx], octave: Math.max(1, Math.min(7, oct)) };
};

export const CHORD_PATTERNS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  augmented: [0, 4, 8],
  diminished: [0, 3, 6],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  diminished7: [0, 3, 6, 9],
};

export const SCALE_PATTERNS = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10, 12],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11, 12],
  pentatonic: [0, 2, 4, 7, 9, 12],
  blues: [0, 3, 5, 6, 7, 10, 12],
  wholeTone: [0, 2, 4, 6, 8, 10, 12]
};

export const CADENCE_PATTERNS = {
  authentic: [[-5, -1, 2, 7], [0, 4, 7, 12]], // V -> I
  plagal: [[-7, 0, 5, 9], [0, 4, 7, 12]],    // IV -> I
  half: [[0, 4, 7, 12], [7, 11, 14, 19]],    // I -> V
  deceptive: [[-5, -1, 2, 7], [9, 12, 16, 21]] // V -> vi
};
