import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio, getRandomNote, SCALE_PATTERNS, waitAudio } from "@/lib/audio";
import { Piano } from "lucide-react";
import { MusicStaff } from "../MusicStaff";

export function MajorMinorExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentMelody = useRef<{note: string, octave: number}[]>([]);
  const isMajor = useRef<boolean>(true);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const root = getRandomNote(3, 4);
    const major = Math.random() > 0.5;
    isMajor.current = major;
    
    const pattern = major ? SCALE_PATTERNS.major : SCALE_PATTERNS.naturalMinor;
    
    // Pick 4 random notes from the scale to form a short melody, always starting with the root
    const melody = [root];
    for (let i = 0; i < 3; i++) {
      const randomDegree = Math.floor(Math.random() * 5); // Pick from first 5 notes of scale
      const semitones = pattern[randomDegree];
      
      let idx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(root.note);
      let total = idx + semitones;
      let oct = root.octave + Math.floor(total / 12);
      let newIdx = ((total % 12) + 12) % 12;
      
      melody.push({ note: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][newIdx], octave: oct });
    }
    
    currentMelody.current = melody;
    setIsRetry(false);
  };

  useEffect(() => {
    generateQuestion();
  }, []);

  const playSequence = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    stopAllAudio();
    for (let i = 0; i < currentMelody.current.length; i++) {
      const n = currentMelody.current[i];
      playNote(n.note, n.octave, 0.5, 1);
      const _ok = await waitAudio(500); if (!_ok) return;
    }
    
    setIsPlaying(false);
  };

  const submitAnswer = (guessIsMajor: boolean) => {
    const isCorrect = guessIsMajor === isMajor.current;
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

      {isRetry && currentMelody.current.length > 0 && (
        <MusicStaff notes={currentMelody.current} 
          caption={`The melody was from a ${isMajor.current ? "Major" : "Minor"} scale`} 
        />
      )}

      {showHint && !isRetry && (
        <p className="text-emerald-400 bg-emerald-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Major scales sound bright and happy. Minor scales sound dark and sad.
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-gradient-to-br bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <Piano className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the melody</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-md">
        <Button variant="outline" size="lg" disabled={!hasPlayed || isPlaying} onClick={() => submitAnswer(true)} className="text-xl">
          Major
        </Button>
        <Button variant="outline" size="lg" disabled={!hasPlayed || isPlaying} onClick={() => submitAnswer(false)} className="text-xl">
          Minor
        </Button>
      </div>
    </div>
  );
}
