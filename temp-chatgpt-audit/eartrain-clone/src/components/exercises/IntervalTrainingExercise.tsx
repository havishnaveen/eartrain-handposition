import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playInterval, getRandomNote, stopAllAudio, getNoteAtInterval } from "@/lib/audio";
import { Music } from "lucide-react";
import { MusicStaff } from "../MusicStaff";

const INTERVALS = [
  { name: "Minor 2nd", semitones: 1 },
  { name: "Major 2nd", semitones: 2 },
  { name: "Minor 3rd", semitones: 3 },
  { name: "Major 3rd", semitones: 4 },
  { name: "Perfect 4th", semitones: 5 },
  { name: "Tritone", semitones: 6 },
  { name: "Perfect 5th", semitones: 7 },
  { name: "Minor 6th", semitones: 8 },
  { name: "Major 6th", semitones: 9 },
  { name: "Minor 7th", semitones: 10 },
  { name: "Major 7th", semitones: 11 },
];

export function IntervalTrainingExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentInterval = useRef<{n1: {note: string, octave: number}, n2: {note: string, octave: number}, intervalObj: typeof INTERVALS[0]} | null>(null);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const n1 = getRandomNote(3, 4);
    const intervalObj = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    const n2 = getNoteAtInterval(n1, intervalObj.semitones);
    
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
    await playInterval(n1, n2, false); // melodic
    
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
          <p className="mb-2 font-bold">Quick Guide:</p>
          <ul className="text-left grid grid-cols-2 gap-x-4 gap-y-1">
            <li><strong>m2:</strong> Jaws</li>
            <li><strong>M2:</strong> Happy Birthday</li>
            <li><strong>m3:</strong> Greensleeves</li>
            <li><strong>M3:</strong> Oh When the Saints</li>
            <li><strong>P4:</strong> Here Comes the Bride</li>
            <li><strong>Tri:</strong> The Simpsons</li>
            <li><strong>P5:</strong> Star Wars</li>
            <li><strong>m6:</strong> The Entertainer</li>
            <li><strong>M6:</strong> NBC Chimes</li>
            <li><strong>m7:</strong> Somewhere (West Side)</li>
            <li><strong>M7:</strong> Take On Me</li>
          </ul>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
        {INTERVALS.map((inv) => (
          <Button 
            key={inv.name}
            variant="outline" 
            disabled={!hasPlayed || isPlaying} 
            onClick={() => submitAnswer(inv.name)} 
            className="text-sm py-6"
          >
            {inv.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
