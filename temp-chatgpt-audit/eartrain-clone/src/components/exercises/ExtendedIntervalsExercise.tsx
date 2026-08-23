import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playInterval, getRandomNote, stopAllAudio, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";
import { MusicStaff } from "../MusicStaff";

const EXTENDED_INTERVALS = [
  { name: "Minor 2nd", s: 1 }, { name: "Major 2nd", s: 2 }, { name: "Minor 3rd", s: 3 }, { name: "Major 3rd", s: 4 },
  { name: "Perfect 4th", s: 5 }, { name: "Tritone", s: 6 }, { name: "Perfect 5th", s: 7 },
  { name: "Minor 6th", s: 8 }, { name: "Major 6th", s: 9 }, { name: "Minor 7th", s: 10 }, { name: "Major 7th", s: 11 },
  { name: "Octave", s: 12 },
  { name: "Minor 9th", s: 13 }, { name: "Major 9th", s: 14 }, { name: "Minor 10th", s: 15 }, { name: "Major 10th", s: 16 },
  { name: "Perfect 11th", s: 17 }, { name: "Tritone + 8ve", s: 18 }, { name: "Perfect 12th", s: 19 },
  { name: "Minor 13th", s: 20 }, { name: "Major 13th", s: 21 }, { name: "Minor 14th", s: 22 }, { name: "Major 14th", s: 23 },
  { name: "Two Octaves", s: 24 },
  { name: "Minor 16th", s: 25 }, { name: "Major 16th", s: 26 }, { name: "Minor 17th", s: 27 }, { name: "Major 17th", s: 28 },
  { name: "Perfect 18th", s: 29 }, { name: "Tritone + 15ma", s: 30 }, { name: "Perfect 19th", s: 31 },
  { name: "Minor 20th", s: 32 }, { name: "Major 20th", s: 33 }, { name: "Minor 21st", s: 34 }, { name: "Major 21st", s: 35 },
  { name: "Three Octaves", s: 36 },
];

export function ExtendedIntervalsExercise({ onAnswer, showHint, maxOctaveSpan = 2 , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentInterval = useRef<{n1: {note: string, octave: number}, n2: {note: string, octave: number}, intervalObj: typeof EXTENDED_INTERVALS[0]} | null>(null);

  const availableIntervals = EXTENDED_INTERVALS.filter(i => i.s <= maxOctaveSpan * 12);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    // Keep root note low so we don't exceed max piano bounds
    const rootOctave = maxOctaveSpan >= 3 ? 2 : 3;
    const n1 = getRandomNote(rootOctave, rootOctave + 1);
    const intervalObj = availableIntervals[Math.floor(Math.random() * availableIntervals.length)];
    const n2 = getNoteAtInterval(n1, intervalObj.s);
    
    currentInterval.current = { n1, n2, intervalObj };
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying || !currentInterval.current) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    const { n1, n2 } = currentInterval.current;
    await playInterval(n1, n2, false); // melodic to hear range better
    
    setTimeout(() => setIsPlaying(false), 3000);
  };

  const submitAnswer = (guessName: string) => {
    if (!currentInterval.current) return;
    const isCorrect = guessName === currentInterval.current.intervalObj.name;
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
          ⚠ Incorrect. Listen carefully and try another option!
        </div>
      )}

      {isRetry && currentInterval.current && (
        <MusicStaff notes={[currentInterval.current.n1, currentInterval.current.n2]} 
          caption={`The interval was a ${currentInterval.current.intervalObj.name}`} 
        />
      )}

      {showHint && !isRetry && (
        <div className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          <p className="mb-2 font-bold">Compound Interval Naming:</p>
          <p>Compound intervals are just simple intervals + an octave. For example, a 9th is an octave + a 2nd. A 10th is an octave + a 3rd. Try singing the higher note down an octave to identify it!</p>
        </div>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-24 h-24 rounded-full bg-orange-500 dark:bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 dark:shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-8 disabled:opacity-50"
      >
        <Music className={`w-10 h-10 text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-6 animate-pulse">Press play to hear the melodic interval</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full h-[300px] overflow-y-auto pr-2 pb-2">
        {availableIntervals.map((inv) => (
          <Button 
            key={inv.name}
            variant="outline" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(inv.name)} 
            className="text-xs py-4"
          >
            {inv.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
