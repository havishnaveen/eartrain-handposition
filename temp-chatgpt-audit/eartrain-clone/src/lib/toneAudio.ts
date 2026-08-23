import * as Tone from "tone";

const SAMPLE_BASE_URL = "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-mp3/";

// Tone.Sampler works best by providing a subset of notes, and it will pitch shift the rest.
// We'll provide C and F# across a few octaves for a good balance of quality and load speed.
const pianoSamples = {
  "C3": "C3.mp3",
  "F#3": "Gb3.mp3",
  "C4": "C4.mp3",
  "F#4": "Gb4.mp3",
  "C5": "C5.mp3",
  "F#5": "Gb5.mp3",
  "C6": "C6.mp3",
};

let pianoSampler: Tone.Sampler | null = null;
let isLoaded = false;

export const initToneAudio = async (): Promise<Tone.Sampler> => {
  if (pianoSampler) return pianoSampler;

  await Tone.start();
  
  return new Promise((resolve) => {
    pianoSampler = new Tone.Sampler({
      urls: pianoSamples,
      baseUrl: SAMPLE_BASE_URL,
      onload: () => {
        isLoaded = true;
        resolve(pianoSampler!);
      },
    }).toDestination();
  });
};

export const getPianoSampler = () => pianoSampler;

export const playToneNote = async (note: string, duration: string | number = "4n", time?: number) => {
  if (!pianoSampler || !isLoaded) {
    await initToneAudio();
  }
  
  if (time !== undefined) {
    pianoSampler!.triggerAttackRelease(note, duration, time);
  } else {
    pianoSampler!.triggerAttackRelease(note, duration);
  }
};

export const stopToneAudio = () => {
  Tone.Transport.stop();
  Tone.Transport.cancel(0);
  if (pianoSampler) {
    pianoSampler.releaseAll();
  }
};
