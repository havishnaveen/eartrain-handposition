import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playInterval, getRandomNote, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";
import { MusicStaff } from "../MusicStaff";

export function FourthsFifthsExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentInterval = useRef<{n1: {note: string, octave: number}, n2: {note: string, octave: number}, isFifth: boolean} | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const n1 = getRandomNote(3, 4);
    const isFifth = Math.random() > 0.5;
    
    // 4th = 5 semitones, 5th = 7 semitones
    const semitones = isFifth ? 7 : 5;
      
    const n2 = getNoteAtInterval(n1, semitones);
    
    currentInterval.current = { n1, n2, isFifth };
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentInterval.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    const { n1, n2 } = currentInterval.current;
    await playInterval(n1, n2, true);
    
    setTimeout(() => setIsPlaying(false), 3000);
  };

  const submitAnswer = (guessIsFifth: boolean) => {
    if (!currentInterval.current) return;
    const isCorrect = guessIsFifth === currentInterval.current.isFifth;
    if (isCorrect) {
      onAnswer(true);
      if (!onNext) setShowNext(true);
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

      {isRetry && currentInterval.current && (
        <MusicStaff notes={[currentInterval.current.n1, currentInterval.current.n2]} 
          caption={`The interval was a ${currentInterval.current.isFifth ? "5th" : "4th"}`} 
        />
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: A Perfect 4th sounds like "Here Comes the Bride." A Perfect 5th sounds like the opening to Star Wars or Twinkle Twinkle Little Star.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the interval</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-md">
        <Button variant="outline" size="lg" disabled={!hasPlayed || isPlaying} onClick={() => submitAnswer(false)} className="text-xl">
          Perfect 4th
        </Button>
        <Button variant="outline" size="lg" disabled={!hasPlayed || isPlaying} onClick={() => submitAnswer(true)} className="text-xl">
          Perfect 5th
        </Button>
      </div>
    </div>
  );
}
