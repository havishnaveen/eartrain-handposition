import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, getRandomNote, stopAllAudio, SCALE_PATTERNS, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";

const SCALES = [
  { name: "Major", pattern: SCALE_PATTERNS.major },
  { name: "Natural Minor", pattern: SCALE_PATTERNS.naturalMinor },
  { name: "Harmonic Minor", pattern: SCALE_PATTERNS.harmonicMinor },
];

export function ScaleTypeExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentScale = useRef<{root: {note: string, octave: number}, scaleObj: typeof SCALES[0]} | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    // Exclude sharps so we don't go too crazy high or get weird enharmonics
    const root = getRandomNote(3, 4, true); 
    const scaleObj = SCALES[Math.floor(Math.random() * SCALES.length)];
    
    currentScale.current = { root, scaleObj };
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentScale.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    stopAllAudio();
    
    const { root, scaleObj } = currentScale.current;
    
    const noteCount = scaleObj.pattern.length;
    scaleObj.pattern.forEach((semitones, idx) => {
      const n = getNoteAtInterval(root, semitones);
      playNote(n.note, n.octave, 1.5, 1, idx * 350);
    });
    
    setTimeout(() => setIsPlaying(false), noteCount * 350 + 1000);
  };

  const submitAnswer = (guessName: string) => {
    if (!currentScale.current) return;
    const isCorrect = guessName === currentScale.current.scaleObj.name;
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
          ⚠ Incorrect. Listen carefully to the intervals and try again!
        </div>
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Major sounds bright and happy. Natural Minor sounds sad throughout. Harmonic Minor has a distinctive exotic/Eastern raised 7th at the end.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the scale</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-2xl">
        {SCALES.map((sc) => (
          <Button 
            key={sc.name}
            variant="outline" 
            size="lg" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(sc.name)} 
            className="text-lg py-8 font-bold"
          >
            {sc.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
