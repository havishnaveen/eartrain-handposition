export const MAJOR_OFFSETS = [0, 2, 4, 5, 7];
export const MINOR_OFFSETS = [0, 2, 3, 5, 7];

export const VALID_ROOTS = [
  "C4", "D4", "E4", "F4", "G4", "A4", "B4",
  "C5", "D5"
];

export const LEAP_ROOTS = ["C4", "G4"];

const SCALE_DICTIONARY: Record<string, string[]> = {
  // Octave 4
  "C4_true": ["C4", "D4", "E4", "F4", "G4"],
  "C4_false": ["C4", "D4", "Eb4", "F4", "G4"],
  "D4_true": ["D4", "E4", "F#4", "G4", "A4"],
  "D4_false": ["D4", "E4", "F4", "G4", "A4"],
  "E4_true": ["E4", "F#4", "G#4", "A4", "B4"],
  "E4_false": ["E4", "F#4", "G4", "A4", "B4"],
  "F4_true": ["F4", "G4", "A4", "Bb4", "C5"],
  "F4_false": ["F4", "G4", "Ab4", "Bb4", "C5"],
  "G4_true": ["G4", "A4", "B4", "C5", "D5"],
  "G4_false": ["G4", "A4", "Bb4", "C5", "D5"],
  "A4_true": ["A4", "B4", "C#5", "D5", "E5"],
  "A4_false": ["A4", "B4", "C5", "D5", "E5"],
  "B4_true": ["B4", "C#5", "D#5", "E5", "F#5"],
  "B4_false": ["B4", "C#5", "D5", "E5", "F#5"],

  // Octave 5
  "C5_true": ["C5", "D5", "E5", "F5", "G5"],
  "C5_false": ["C5", "D5", "Eb5", "F5", "G5"],
  "D5_true": ["D5", "E5", "F#5", "G5", "A5"],
  "D5_false": ["D5", "E5", "F5", "G5", "A5"],
};

export function getNotesForHandShape(rootNote: string, isMajor: boolean) {
  const key = `${rootNote}_${isMajor}`;
  const notes = SCALE_DICTIONARY[key];
  
  if (!notes) {
    // Fallback just in case
    return [
      { note: "C4", octave: 4 },
      { note: "D4", octave: 4 },
      { note: "E4", octave: 4 },
      { note: "F4", octave: 4 },
      { note: "G4", octave: 4 },
    ];
  }

  return notes.map(n => {
    // Parse note like "C#4" into note="C#4", octave=4
    const octave = parseInt(n.slice(-1));
    return { note: n, octave };
  });
}

const PATTERNS = [
  [0, 1, 2, 3, 4], // Ascending
  [4, 3, 2, 1, 0], // Descending
  [0, 2, 4, 2, 0], // Arpeggio up and down
  [0, 1, 0, 1, 0], // Neighboring notes
  [0, 1, 2, 1, 0], // Small hill
  [0, 4, 3, 2, 1], // Jump up, walk down
];

export function getRandomMelodyPattern(): number[] {
  return PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
}

export function getRandomTriadPattern(): number[] {
  return [0, 2, 4];
}

// Ensure every question in a lesson is unique
export function getUniqueQuestion<T>(options: T[], history: T[], compareFn?: (a: T, b: T) => boolean): T {
  const available = options.filter(opt => !history.some(hist => compareFn ? compareFn(opt, hist) : opt === hist));
  if (available.length === 0) {
    // Fallback if we exhausted all options somehow
    return options[Math.floor(Math.random() * options.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function transposeNote(noteStr: string, semitones: number): string {
  let pitch = noteStr.slice(0, -1);
  const oct = parseInt(noteStr.slice(-1));
  
  if (pitch === "Db") pitch = "C#";
  if (pitch === "Eb") pitch = "D#";
  if (pitch === "Gb") pitch = "F#";
  if (pitch === "Ab") pitch = "G#";
  if (pitch === "Bb") pitch = "A#";

  const idx = PITCH_CLASSES.indexOf(pitch);
  if (idx === -1) return noteStr; 

  const safeSemitones = Number.isFinite(semitones) ? Math.trunc(semitones) : 0;
  const absoluteIndex = idx + safeSemitones;
  const newIdx = ((absoluteIndex % 12) + 12) % 12;
  const newOct = oct + Math.floor(absoluteIndex / 12);

  let newPitch = PITCH_CLASSES[newIdx];
  // Basic enharmonic spelling for F Major (1 flat)
  if (safeSemitones === 5 && newPitch === "A#") newPitch = "Bb"; 
  
  return `${newPitch}${newOct}`;
}

export function transposeNoteObj(n: {note: string, octave: number}, semitones: number): {note: string, octave: number} {
  const fullNote = `${n.note}${n.octave}`;
  const transposed = transposeNote(fullNote, semitones);
  return {
    note: transposed.slice(0, -1),
    octave: parseInt(transposed.slice(-1))
  };
}
