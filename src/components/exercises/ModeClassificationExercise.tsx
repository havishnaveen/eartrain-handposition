import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, getRandomNote, stopAllAudio, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";

const MODES = [
  { name: "Ionian (Major)", pattern: [0,2,4,5,7,9,11,12] },
  { name: "Dorian", pattern: [0,2,3,5,7,9,10,12] },
  { name: "Phrygian", pattern: [0,1,3,5,7,8,10,12] },
  { name: "Lydian", pattern: [0,2,4,6,7,9,11,12] },
  { name: "Mixolydian", pattern: [0,2,4,5,7,9,10,12] },
  { name: "Aeolian (Minor)", pattern: [0,2,3,5,7,8,10,12] },
  { name: "Locrian", pattern: [0,1,3,5,6,8,10,12] },
];

export function ModeClassificationExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentMode = useRef<{root: {note: string, octave: number}, modeObj: typeof MODES[0]} | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const root = getRandomNote(3, 4, true); 
    const modeObj = MODES[Math.floor(Math.random() * MODES.length)];
    
    currentMode.current = { root, modeObj };
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentMode.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    stopAllAudio();
    
    const { root, modeObj } = currentMode.current;
    
    const noteCount = modeObj.pattern.length;
    modeObj.pattern.forEach((semitones, idx) => {
      const n = getNoteAtInterval(root, semitones);
      playNote(n.note, n.octave, 1.5, 1, idx * 350);
    });
    
    setTimeout(() => setIsPlaying(false), noteCount * 350 + 1000);
  };

  const submitAnswer = (guessName: string) => {
    if (!currentMode.current) return;
    const isCorrect = guessName === currentMode.current.modeObj.name;
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
          ⚠ Incorrect. Listen carefully to the flavor of the scale and try again!
        </div>
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Ionian=happy Major. Dorian=jazzy minor. Phrygian=Spanish/dark. Lydian=dreamy/bright. Mixolydian=bluesy major. Aeolian=sad Natural Minor. Locrian=very dark/unstable.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the mode</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-3xl">
        {MODES.map((m) => (
          <Button 
            key={m.name}
            variant="outline" 
            size="lg" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(m.name)} 
            className="text-sm md:text-base py-6 font-bold"
          >
            {m.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
