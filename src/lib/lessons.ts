import { ArrowUpDown, Music, Timer, Piano, Compass, Target, Home, Rainbow, Brain, Activity } from "lucide-react";

export type LessonDef = {
  id: string;
  stage: number;
  level?: number;
  name: string;
  desc: string;
  icon: any;
};

export const LESSONS: LessonDef[] = [
  // Stage 1
  { id: "direction", stage: 1, name: "Note Direction", desc: "Learn to tell if a sequence is moving up or down.", icon: ArrowUpDown },
  { id: "melodic-contour", stage: 1, name: "Melodic Contour", desc: "Learn to identify when a melody changes direction.", icon: ArrowUpDown },
  { id: "single-chord", stage: 1, name: "Single vs Chord", desc: "Understand the difference between solitary notes and chords.", icon: Music },
  { id: "pitch-memory", stage: 1, name: "Pitch Memory", desc: "Practice holding a note in your mind.", icon: Brain },
  { id: "interval-2-3", stage: 1, name: "Seconds vs Thirds", desc: "Differentiate between steps and skips.", icon: Music },
  { id: "note-duration-basic", stage: 1, name: "Note Duration (Basic)", desc: "Understand whole, half, and quarter notes.", icon: Timer },
  
  // Stage 2
  { id: "major-minor", stage: 2, name: "Major vs Minor", desc: "The foundational difference in musical emotion.", icon: Piano },
  { id: "consonance-dissonance", stage: 2, name: "Consonance vs Dissonance", desc: "Understand tension and release in harmony.", icon: Activity },
  { id: "tuning", stage: 2, name: "Pitch Precision (Tuning)", desc: "Learn to identify notes that are sharp or flat.", icon: Target },
  { id: "note-duration-extended", stage: 2, name: "Note Duration (Extended)", desc: "Subdividing beats with 8th and 16th notes.", icon: Timer },
  { id: "fourths-fifths", stage: 2, name: "Fourths vs Fifths", desc: "Suspended vs powerful intervals.", icon: Music },
  
  // Stage 3
  { id: "interval-training", stage: 3, level: 6, name: "Interval Training", desc: "Adding 6ths and 7ths.", icon: ArrowUpDown },
  { id: "chord-quality", stage: 3, level: 6, name: "Chord Quality (Triads)", desc: "Major, Minor, Diminished, Augmented.", icon: Piano },
  { id: "scale-type", stage: 3, level: 6, name: "Scale Type", desc: "Natural, Harmonic, and Melodic minor.", icon: Rainbow },
  { id: "time-signature", stage: 3, level: 6, name: "Time Signature", desc: "Counting the beat structure.", icon: Timer },
  { id: "seventh-chords", stage: 3, level: 7, name: "7th Chord Quality", desc: "Jazz chords and extensions.", icon: Piano },
  { id: "chord-inversions", stage: 3, level: 8, name: "Chord Inversions", desc: "Root, 1st, and 2nd inversions.", icon: Piano },
  { id: "cadences", stage: 3, level: 8, name: "Cadences", desc: "Musical punctuation.", icon: Home },
  { id: "interval-extended", stage: 3, level: 9, name: "Extended Interval Training", desc: "Advanced Mode for wide ranges.", icon: ArrowUpDown },
  { id: "cadences-extended", stage: 3, level: 9, name: "Extended Cadences", desc: "Advanced Mode for repeated chords.", icon: Home },
  { id: "advanced-scales", stage: 3, level: 10, name: "Advanced Scales", desc: "Pentatonic, Blues, Whole Tone.", icon: Rainbow },
  { id: "wide-intervals", stage: 3, level: 10, name: "Wide Intervals", desc: "Intervals beyond an octave (9ths, 10ths, etc).", icon: ArrowUpDown },
  
  // Stage 4
  { id: "exact-note", stage: 4, name: "Exact Note Recognition", desc: "Perfect Pitch primer.", icon: Target },
  { id: "mode-classification", stage: 4, name: "Mode Classification", desc: "Dorian, Phrygian, Lydian, etc.", icon: Compass },
  { id: "very-wide-intervals", stage: 4, name: "Very Wide Intervals", desc: "Stretch across multiple octaves.", icon: ArrowUpDown },
];
