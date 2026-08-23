import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio } from "@/lib/audio";
import { Music, Play } from "lucide-react";
import { Card } from "../ui/card";

type PitchMemoryExerciseProps = {
  onAnswer: (isCorrect: boolean) => void;
  onNext?: () => void;
  showHint?: boolean;
  
};

export function PitchMemoryExercise({ onAnswer, onNext, showHint }: PitchMemoryExerciseProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  
  const targetNote = useRef<{note: string, octave: number}>({note: 'C', octave: 4});
  const options = useRef<{note: string, octave: number}[]>([]);
  const correctIndex = useRef<number>(0);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    setHasPlayed(false);
    setIsRetry(false);
    setShowOptions(false);
    
    const startOctave = 4;
    const DIATONIC_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    
    // Choose target
    const targetIdx = Math.floor(Math.random() * DIATONIC_NOTES.length);
    targetNote.current = { note: DIATONIC_NOTES[targetIdx], octave: startOctave };
    
    // Generate 2 other distinct notes
    let otherIdx1 = (targetIdx + Math.floor(Math.random() * 3) + 1) % 7;
    let otherIdx2 = (targetIdx + Math.floor(Math.random() * 3) + 4) % 7;
    
    const opts = [
      targetNote.current,
      { note: DIATONIC_NOTES[otherIdx1], octave: startOctave },
      { note: DIATONIC_NOTES[otherIdx2], octave: startOctave }
    ];
    
    // Shuffle options
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    
    options.current = opts;
    correctIndex.current = opts.findIndex(o => o.note === targetNote.current.note);
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setHasPlayed(true);
    setShowOptions(false);
    
    stopAllAudio();
    playNote(targetNote.current.note, targetNote.current.octave, 1.5, 1);
    
    // Wait 4 seconds then show options
    setTimeout(() => {
      setIsPlaying(false);
      setShowOptions(true);
    }, 4000);
  };

  const playOption = (idx: number) => {
    stopAllAudio();
    const opt = options.current[idx];
    playNote(opt.note, opt.octave, 1, 1);
  };

  const submitAnswer = (idx: number) => {
    const isCorrect = idx === correctIndex.current;
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
    <div className="flex flex-col items-center p-8 bg-orange-50 dark:bg-card rounded-xl min-h-[400px] relative overflow-hidden">

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
          Hint: Try humming the note softly to yourself during the silence!
        </p>
      )}

      {!showOptions && (
        <button 
          onClick={playSequence}
          disabled={isPlaying}
          className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
        >
          <Music className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
        </button>
      )}

      {isPlaying && <p className="text-orange-500 font-bold mb-8 animate-pulse text-xl">Memorize the pitch...</p>}
      {!hasPlayed && !isPlaying && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press play to hear the target note</p>}

      {showOptions && (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 `}>
          {[0, 1, 2].map((idx) => (
            <Card key={idx} className="p-6 flex flex-col items-center gap-4 bg-white dark:bg-black/20 border-2 border-orange-100 dark:border-white/10 hover:border-orange-300 dark:hover:border-white/20 transition-all">
              <h3 className="text-xl font-bold text-orange-900 dark:text-white">Option {idx + 1}</h3>
              <Button 
                variant="outline" 
                size="lg" 
                onClick={() => playOption(idx)}
                className="w-full text-lg rounded-full"
              >
                <Play className="w-4 h-4 mr-2" /> Listen
              </Button>
              <Button 
                size="lg" 
                onClick={() => submitAnswer(idx)}
                className="w-full text-lg bg-orange-500 hover:bg-orange-600 text-white"
              >
                Select
              </Button>
            </Card>
          ))}
        </div>
      )}
    
      
      
    </div>
  );
}
