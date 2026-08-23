import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, playMetronomeClick, stopAllAudio } from "@/lib/audio";
import { Timer } from "lucide-react";


export function NoteDurationExercise({ onAnswer, showHint, extended = false , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [visibleSteps, setVisibleSteps] = useState<string[]>([]);
  
  // 4, 2, 1, 0.5, 0.25 beats
  const options = extended ? [4, 2, 1, 0.5, 0.25] : [4, 2, 1];
  const currentDuration = useRef<number>(4);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    currentDuration.current = options[Math.floor(Math.random() * options.length)];
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
  }, [extended]);

  const playSequence = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    stopAllAudio();
    
    // Metronome 80 BPM = 750ms per beat.
    const beatMs = 750;
    
    // Play 4 beats total setup.
    for (let i = 0; i < 4; i++) {
      playMetronomeClick(i === 0, i * beatMs);
    }
    
    // Play C4 on beat 1. Duration = beats * 0.75s
    playNote("C", 4, currentDuration.current * 0.75, 1, 0);

    // Provide Rhythmic Counting Visualizer!
    const syllables = ["1", "e", "&", "a", "2", "e", "&", "a", "3", "e", "&", "a", "4", "e", "&", "a"];
    const totalStepsToPlay = currentDuration.current * 4;
    setVisibleSteps(syllables.slice(0, totalStepsToPlay));
    
    // Animate the active step lighting up
    for (let i = 0; i < totalStepsToPlay; i++) {
      setTimeout(() => {
        setActiveStep(i);
      }, i * (beatMs / 4));
    }
    
    setTimeout(() => {
      setIsPlaying(false);
      setActiveStep(-1);
    }, 3500);
  };

  const submitAnswer = (guess: number) => {
    const isCorrect = guess === currentDuration.current;
    if (isCorrect) {
      onAnswer(true);
      if (!onNext) setShowNext(true);
    } else {
      if (!onNext) setIsRetry(true);
      onAnswer(false);
    }
  };

  const labelMap: any = {
    4: "Whole Note (4 beats)",
    2: "Half Note (2 beats)",
    1: "Quarter Note (1 beat)",
    0.5: "Eighth Note (1/2 beat)",
    0.25: "Sixteenth Note (1/4 beat)"
  };

  const gradient = extended ? "bg-emerald-500" : "from-orange-500 to-orange-400 dark:from-orange-500 dark:to-orange-500";
  const shadow = extended ? "shadow-emerald-500/30" : "shadow-orange-500/30 dark:shadow-orange-500/30";

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

      {isRetry && (
        <div className="bg-orange-50 dark:bg-orange-50 dark:bg-[#1a1c23] border border-orange-200 dark:border-stone-800 rounded-xl p-8 my-6 w-full text-center">
           <p className="text-orange-400 font-bold tracking-wide">
             The note was a {labelMap[currentDuration.current]}
           </p>
        </div>
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Listen to the metronome clicks. Does the note last through 4 clicks, 2 clicks, or stop immediately after the first click?
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className={`w-32 h-32 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${shadow} hover:scale-105 active:scale-95 transition-all mb-8 disabled:opacity-50`}
      >
        <Timer className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {/* Rhythmic Counting Visualizer */}
      <div className="h-16 flex items-center justify-center mb-8 w-full">
        {isPlaying ? (
          <div className="flex gap-2 text-2xl md:text-4xl font-black font-serif uppercase text-white bg-black/40 px-8 py-4 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md">
            {visibleSteps.map((syllable, i) => (
              <span 
                key={i} 
                className={`transition-all duration-75 w-8 md:w-10 text-center ${i === activeStep ? 'text-orange-600 dark:text-orange-400 scale-125 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'text-white/20'}`}
              >
                {syllable}
              </span>
            ))}
          </div>
        ) : !hasPlayed ? (
          <p className="text-muted-foreground font-medium animate-pulse text-lg">Press play to hear the duration and see the counting</p>
        ) : null}
      </div>

      <div className={`grid gap-4 w-full max-w-xl ${extended ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-3'}`}>
        {options.map(opt => (
          <Button 
            key={opt}
            variant="outline" 
            size="lg" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(opt)}
            className="text-sm h-14"
          >
            {labelMap[opt].split(' (')[0]}
          </Button>
        ))}
      </div>
    </div>
  );
}
