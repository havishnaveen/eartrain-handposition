import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio, waitAudio } from "@/lib/audio";
import { ArrowUpDown } from "lucide-react";
import { MusicStaff } from "../MusicStaff";
import { PianoKeyboard } from "../lessons/PianoKeyboard";

type MelodicContourExerciseProps = {
  onAnswer: (isCorrect: boolean) => void;
  onNext?: () => void;
  showHint?: boolean;
  
};

export function MelodicContourExercise({ onAnswer, onNext, showHint }: MelodicContourExerciseProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentSequence = useRef<{note: string, octave: number}[]>([]);
  const isUpDown = useRef<boolean>(true); // true = Up-Down, false = Down-Up
  const [pianoBounds, setPianoBounds] = useState({ start: "C3", end: "B4" });
  const [activeNotes, setActiveNotes] = useState<string[]>([]);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    setHasPlayed(false);
    setIsRetry(false);
    const startOctave = 4;
    
    // Choose start note
    const DIATONIC_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const startIndex = Math.floor(Math.random() * 3) + 2; // E, F, G
    const startNoteClean = DIATONIC_NOTES[startIndex];
    
    const direction = Math.random() > 0.5; // true = Up-Down, false = Down-Up
    isUpDown.current = direction;
    
    const step1 = Math.floor(Math.random() * 2) + 2; // 2 or 3 steps up/down
    const step2 = Math.floor(Math.random() * 2) + 2; // 2 or 3 steps down/up
    
    let note2Index = direction ? startIndex + step1 : startIndex - step1;
    let note3Index = direction ? note2Index - step2 : note2Index + step2;
    
    const getNoteObj = (idx: number, baseOct: number) => {
      let oct = baseOct;
      let i = idx;
      if (i >= 7) { i -= 7; oct++; }
      if (i < 0) { i += 7; oct--; }
      return { note: DIATONIC_NOTES[i], octave: oct };
    };

    const seq = [
      { note: startNoteClean, octave: startOctave },
      getNoteObj(note2Index, startOctave),
      getNoteObj(note3Index, startOctave)
    ];
    
    currentSequence.current = seq;

        // Calc bounds ensuring it is at least 10 white keys wide (to fill mobile screen)
    let minNoteStr = seq[0].note;
    let minOct = seq[0].octave;
    let maxNoteStr = seq[0].note;
    let maxOct = seq[0].octave;

    const diatonicIndex = (n: string, o: number) => o * 7 + DIATONIC_NOTES.indexOf(n);
    let minIdx = diatonicIndex(minNoteStr, minOct);
    let maxIdx = diatonicIndex(maxNoteStr, maxOct);

    for (const n of seq) {
      const idx = diatonicIndex(n.note, n.octave);
      if (idx < minIdx) { minIdx = idx; minNoteStr = n.note; minOct = n.octave; }
      if (idx > maxIdx) { maxIdx = idx; maxNoteStr = n.note; maxOct = n.octave; }
    }

    const range = maxIdx - minIdx + 1;
    const TARGET_WIDTH = 12; // 12 white keys is about 480px, good size.

    if (range < TARGET_WIDTH) {
      const pad = TARGET_WIDTH - range;
      minIdx -= Math.floor(pad / 2);
      maxIdx += Math.ceil(pad / 2);
    }

    const getNoteFromIdx = (idx: number) => {
      let o = Math.floor(idx / 7);
      let n = idx % 7;
      if (n < 0) { n += 7; o -= 1; }
      return { note: DIATONIC_NOTES[n], octave: o };
    };

    const minBound = getNoteFromIdx(minIdx);
    const maxBound = getNoteFromIdx(maxIdx);

    setPianoBounds({ start: `${minBound.note}${minBound.octave}`, end: `${maxBound.note}${maxBound.octave}` });
  };

  useEffect(() => {
    generateQuestion();
    return () => stopAllAudio();
  }, []);

  const playSequence = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setHasPlayed(true);
    
    stopAllAudio();
    setActiveNotes([]);
    for (let i = 0; i < currentSequence.current.length; i++) {
      const n = currentSequence.current[i];
      setActiveNotes([n.note + n.octave]);
      playNote(n.note, n.octave, 0.5, 1);
      const _ok = await waitAudio(600);
      if (!_ok) {
        setActiveNotes([]);
        return;
      }
    }
    setActiveNotes(currentSequence.current.map(n => n.note + n.octave));
    setIsPlaying(false);
  };

  const submitAnswer = (guessIsUpDown: boolean) => {
    const isCorrect = guessIsUpDown === isUpDown.current;
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
    <div className="p-8 flex flex-col items-center relative overflow-hidden">

      {showNext && !onNext && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl animate-in fade-in duration-300">
          <Button size="lg" className="quiz-continue-btn text-xl px-8 py-6 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-emerald-500/20" onClick={handleNext}>CONTINUE</Button>
        </div>
      )}

      
      {isRetry && currentSequence.current.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-50 dark:bg-[#1a1c23] border border-orange-200 dark:border-stone-800 rounded-xl p-8 my-6 w-full text-center flex flex-col items-center gap-6">
          <MusicStaff notes={currentSequence.current} 
            caption={`The melody was moving ${isUpDown.current ? "Up then Down" : "Down then Up"}`} 
          />
          <div className="w-full max-w-2xl mb-4">
            <PianoKeyboard startNote={pianoBounds.start} endNote={pianoBounds.end} activeNotes={activeNotes} />
          </div>
        </div>
      )}

      {isRetry && (
        <div className="w-full bg-orange-500/10 border border-orange-500/50 text-orange-400 p-4 rounded-xl text-center font-bold mb-8">
          ⚠ Try again! Listen carefully and select a different answer.
        </div>
      )}

      {showHint && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Try to visualize the shape of the notes. Does it peak in the middle or dip in the middle?
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <ArrowUpDown className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press play to hear the melody</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-md">
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(true)}
          className="text-xl"
        >
          Up-Down
        </Button>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(false)}
          className="text-xl"
        >
          Down-Up
        </Button>
      
      
    </div>
    
      
      
    </div>
  );
}
