import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playChord, getRandomNote, stopAllAudio, CHORD_PATTERNS, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";

const CHORD_TYPES = [
  { name: "Major 7th", pattern: CHORD_PATTERNS.major7 },
  { name: "Minor 7th", pattern: CHORD_PATTERNS.minor7 },
  { name: "Dominant 7th", pattern: CHORD_PATTERNS.dominant7 },
  { name: "Diminished 7th", pattern: CHORD_PATTERNS.diminished7 },
];

export function SeventhChordsExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentChord = useRef<{root: {note: string, octave: number}, typeObj: typeof CHORD_TYPES[0]} | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const root = getRandomNote(3, 4);
    const typeObj = CHORD_TYPES[Math.floor(Math.random() * CHORD_TYPES.length)];
    
    currentChord.current = { root, typeObj };
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentChord.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    const { root, typeObj } = currentChord.current;
    const notes = typeObj.pattern.map(semitones => getNoteAtInterval(root, semitones));
    
    await playChord(notes, 2.5);
    
    setTimeout(() => setIsPlaying(false), 2500);
  };

  const submitAnswer = (guessName: string) => {
    if (!currentChord.current) return;
    const isCorrect = guessName === currentChord.current.typeObj.name;
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
          ⚠ Incorrect. Listen carefully to the chord quality and try again!
        </div>
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Major 7th = jazzy/dreamy. Minor 7th = warm/soulful. Dominant 7th = bluesy/wants to resolve. Diminished 7th = very tense/symmetrical.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the chord</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
        {CHORD_TYPES.map((ct) => (
          <Button 
            key={ct.name}
            variant="outline" 
            size="lg" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(ct.name)} 
            className="text-lg py-8 font-bold"
          >
            {ct.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
