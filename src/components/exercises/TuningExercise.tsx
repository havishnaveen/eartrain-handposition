import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio } from "@/lib/audio";
import { Music } from "lucide-react";

type TuningExerciseProps = {
  onAnswer: (isCorrect: boolean) => void;
  onNext?: () => void;
  showHint?: boolean;
  
};

export function TuningExercise({ onAnswer, onNext, showHint }: TuningExerciseProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentQuestion = useRef<{base: {note: string, octave: number}, tuneState: 'tune' | 'sharp' | 'flat', detune: number} | null>(null);

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
    const startIdx = Math.floor(Math.random() * DIATONIC_NOTES.length);
    const rootNote = DIATONIC_NOTES[startIdx];
    
    const states: ('tune' | 'sharp' | 'flat')[] = ['tune', 'sharp', 'flat'];
    const tuneState = states[Math.floor(Math.random() * states.length)];
    
    let detune = 0;
    if (tuneState === 'sharp') detune = 25; // +25 cents
    else if (tuneState === 'flat') detune = -25; // -25 cents
    
    currentQuestion.current = {
      base: { note: rootNote, octave: startOctave },
      tuneState,
      detune
    };
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = () => {
    if (isPlaying || !currentQuestion.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    stopAllAudio();
    const q = currentQuestion.current;
    
    // Play base note for 1.5s
    playNote(q.base.note, q.base.octave, 1.5, 1, 0, 0);
    
    // Play target note (octave higher) after 2 second pause (so total 3.5s delay)
    setTimeout(() => {
      playNote(q.base.note, q.base.octave + 1, 1.5, 1, 0, q.detune);
    }, 2000);
    
    setTimeout(() => setIsPlaying(false), 3500);
  };

  const submitAnswer = (guess: 'tune' | 'sharp' | 'flat') => {
    const isCorrect = guess === currentQuestion.current?.tuneState;
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
          Hint: A sharp note feels strained and slightly "above" the pitch center. A flat note feels heavy and slightly "below" the pitch center.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press play to hear the tuning test</p>}

      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-2xl `}>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer('flat')}
          className="text-xl"
        >
          Flat (Too Low)
        </Button>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer('tune')}
          className="text-xl"
        >
          In Tune
        </Button>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer('sharp')}
          className="text-xl"
        >
          Sharp (Too High)
        </Button>
      
      
    </div>
    
      
      
    </div>
  );
}
