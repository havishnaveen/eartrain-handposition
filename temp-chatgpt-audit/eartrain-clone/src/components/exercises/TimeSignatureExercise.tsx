import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playMetronomeClick, stopAllAudio } from "@/lib/audio";
import { Timer } from "lucide-react";

const TIME_SIGS = [
  { name: "3/4", beats: 3, interval: 500 },
  { name: "4/4", beats: 4, interval: 500 },
  { name: "6/8", beats: 6, interval: 350 },
];

export function TimeSignatureExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentSig = useRef<typeof TIME_SIGS[0] | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const sig = TIME_SIGS[Math.floor(Math.random() * TIME_SIGS.length)];
    currentSig.current = sig;
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentSig.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    stopAllAudio();
    
    const sig = currentSig.current;
    
    // Play 2 measures
    const totalClicks = sig.beats * 2;
    for (let i = 0; i < totalClicks; i++) {
      const isAccent = (i % sig.beats === 0) || (sig.name === "6/8" && i % sig.beats === 3);
      playMetronomeClick(isAccent, i * sig.interval);
    }
    
    setTimeout(() => setIsPlaying(false), totalClicks * sig.interval + 500);
  };

  const submitAnswer = (guessName: string) => {
    if (!currentSig.current) return;
    const isCorrect = guessName === currentSig.current.name;
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
          ⚠ Incorrect. Listen carefully to the accents and count the beats!
        </div>
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: 3/4 = waltz feel (1-2-3). 4/4 = standard march (1-2-3-4). 6/8 = compound feel with 2 groups of 3 (1-2-3-4-5-6).
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Timer className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the rhythm</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-2xl">
        {TIME_SIGS.map((ts) => (
          <Button 
            key={ts.name}
            variant="outline" 
            size="lg" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(ts.name)} 
            className="text-2xl py-8 font-bold"
          >
            {ts.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
