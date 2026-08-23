import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio } from "@/lib/audio";
import { Music } from "lucide-react";

type ConsonanceDissonanceExerciseProps = {
  onAnswer: (isCorrect: boolean) => void;
  onNext?: () => void;
  showHint?: boolean;
  
};

export function ConsonanceDissonanceExercise({ onAnswer, onNext, showHint }: ConsonanceDissonanceExerciseProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentInterval = useRef<{root: {note: string, octave: number}, top: {note: string, octave: number}} | null>(null);
  const isConsonant = useRef<boolean>(true);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    setHasPlayed(false);
    setIsRetry(false);
    
    const DIATONIC_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const startOctave = 4;
    const startIdx = Math.floor(Math.random() * 5); // C, D, E, F, G
    const rootNote = DIATONIC_NOTES[startIdx];
    
    // Define intervals by semitones
    // Consonant: Perfect 4th (5), Perfect 5th (7), Major 3rd (4), Minor 3rd (3), Major 6th (9), Minor 6th (8)
    const consonantSemitones = [3, 4, 5, 7, 8, 9];
    
    // Dissonant: Minor 2nd (1), Major 2nd (2), Tritone (6), Major 7th (11), Minor 7th (10)
    const dissonantSemitones = [1, 2, 6, 10, 11];
    
    const direction = Math.random() > 0.5; // true = Consonant
    isConsonant.current = direction;
    
    let semitones = 0;
    if (direction) {
      semitones = consonantSemitones[Math.floor(Math.random() * consonantSemitones.length)];
    } else {
      semitones = dissonantSemitones[Math.floor(Math.random() * dissonantSemitones.length)];
    }
    
    // Map root to midi
    const noteToMidi: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    const rootMidi = noteToMidi[rootNote] + (startOctave * 12);
    const topMidi = rootMidi + semitones;
    
    // Convert back to note
    const midiToNote = (midi: number) => {
      const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      return { note: notes[midi % 12], octave: Math.floor(midi / 12) };
    };
    
    currentInterval.current = {
      root: { note: rootNote, octave: startOctave },
      top: midiToNote(topMidi)
    };
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = () => {
    if (isPlaying || !currentInterval.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    stopAllAudio();
    playNote(currentInterval.current.root.note, currentInterval.current.root.octave, 1.5, 1);
    playNote(currentInterval.current.top.note, currentInterval.current.top.octave, 1.5, 1);
    
    setTimeout(() => setIsPlaying(false), 1500);
  };

  const submitAnswer = (guessIsConsonant: boolean) => {
    const isCorrect = guessIsConsonant === isConsonant.current;
    if (isCorrect) {
      onAnswer(true);
      if (!onNext) {
        setShowNext(true);
      }
    } else {
      if (!onNext) setIsRetry(true);
      onAnswer(false);
    }
  };

    return (
    <div className="p-8 flex flex-col items-center relative overflow-hidden">

      {showNext && !onNext && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl animate-in fade-in duration-300">
          <Button size="lg" className="quiz-continue-btn text-xl px-8 py-6 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/20" onClick={handleNext}>CONTINUE</Button>
        </div>
      )}

      
      {isRetry && (
        <div className="w-full bg-orange-500/10 border border-orange-500/50 text-orange-400 p-4 rounded-xl text-center font-bold mb-8">
          ⚠ Try again! Listen carefully and select a different answer.
        </div>
      )}

      {showHint && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Dissonant intervals sound like they "want to resolve" or move to another note. Consonant intervals sound stable and relaxed.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press play to hear the interval</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-md">
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(true)}
          className="text-xl"
        >
          Consonant (Smooth)
        </Button>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(false)}
          className="text-xl"
        >
          Dissonant (Harsh)
        </Button>
      
      
    </div>
    
      
      
    </div>
  );
}
