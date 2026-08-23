import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playChord, getRandomNote, stopAllAudio, CADENCE_PATTERNS, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";

const CADENCES = [
  { name: "Authentic (V → I)", pattern: CADENCE_PATTERNS.authentic },
  { name: "Plagal (IV → I)", pattern: CADENCE_PATTERNS.plagal },
  { name: "Half (I → V)", pattern: CADENCE_PATTERNS.half },
  { name: "Deceptive (V → vi)", pattern: CADENCE_PATTERNS.deceptive },
];

export function CadencesExercise({ onAnswer, showHint, extended , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentCadence = useRef<{root: {note: string, octave: number}, cadenceObj: typeof CADENCES[0]} | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const root = getRandomNote(3, 4);
    const cadenceObj = CADENCES[Math.floor(Math.random() * CADENCES.length)];
    
    currentCadence.current = { root, cadenceObj };
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentCadence.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    stopAllAudio();
    
    const { root, cadenceObj } = currentCadence.current;
    
    const chordsToPlay = [];
    if (extended) {
      // Add a root I chord before the cadence pattern for context
      chordsToPlay.push([0, 4, 7, 12]);
    }
    chordsToPlay.push(...cadenceObj.pattern);
    
    for (let i = 0; i < chordsToPlay.length; i++) {
      const semitonesArr = chordsToPlay[i];
      const notes = semitonesArr.map(s => getNoteAtInterval(root, s));
      
      setTimeout(() => {
        playChord(notes, 1.8);
      }, i * 2000);
    }
    
    setTimeout(() => setIsPlaying(false), chordsToPlay.length * 2000 + 500);
  };

  const submitAnswer = (guessName: string) => {
    if (!currentCadence.current) return;
    const isCorrect = guessName === currentCadence.current.cadenceObj.name;
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
          ⚠ Incorrect. Listen carefully to the final resolution chord!
        </div>
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Authentic (V→I) sounds final. Plagal (IV→I) is the "Amen" cadence. Half (I→V) sounds incomplete. Deceptive (V→vi) surprises you with a minor chord.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the {extended ? "progression" : "cadence"}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        {CADENCES.map((cad) => (
          <Button 
            key={cad.name}
            variant="outline" 
            size="lg" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(cad.name)} 
            className="text-lg py-8 font-bold"
          >
            {cad.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
