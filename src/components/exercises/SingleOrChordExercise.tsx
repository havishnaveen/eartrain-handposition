import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio } from "@/lib/audio";
import { Music } from "lucide-react";

type SingleOrChordExerciseProps = {
  onAnswer: (isCorrect: boolean) => void;
  onNext?: () => void;
  showHint?: boolean;
  
};

export function SingleOrChordExercise({ onAnswer, onNext, showHint }: SingleOrChordExerciseProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentNotes = useRef<{note: string, octave: number}[]>([]);
  const isChord = useRef<boolean>(true);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    setHasPlayed(false);
    setIsRetry(false);
    const startOctave = 4;
    
    // Choose start note
    const DIATONIC_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const startIndex = Math.floor(Math.random() * 5); // C, D, E, F, G
    const startNoteClean = DIATONIC_NOTES[startIndex];
    
    const direction = Math.random() > 0.5; // true = Chord, false = Single Note
    isChord.current = direction;
    
    if (direction) {
      // Create a triad (Root, 3rd, 5th)
      const note3Index = startIndex + 2;
      const note5Index = startIndex + 4;
      
      currentNotes.current = [
        { note: startNoteClean, octave: startOctave },
        { note: DIATONIC_NOTES[note3Index], octave: startOctave },
        { note: DIATONIC_NOTES[note5Index], octave: startOctave }
      ];
    } else {
      currentNotes.current = [
        { note: startNoteClean, octave: startOctave }
      ];
    }
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    stopAllAudio();
    // Play all notes simultaneously
    for (const n of currentNotes.current) {
      playNote(n.note, n.octave, 1, 1);
    }
    
    setTimeout(() => {
      setIsPlaying(false);
    }, 1000);
  };

  const submitAnswer = (guessIsChord: boolean) => {
    const isCorrect = guessIsChord === isChord.current;
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
          Hint: A single note sounds thin and pure. A chord sounds rich and thick.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press play to hear the audio</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-md">
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(false)}
          className="text-xl"
        >
          Single Note
        </Button>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(true)}
          className="text-xl"
        >
          Chord
        </Button>
      
      
    </div>
    
      
      
    </div>
  );
}
