import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { playNote, stopAllAudio, getRandomNote, waitAudio } from "@/lib/audio";
import { ArrowUpDown } from "lucide-react";
import { MusicStaff } from "../MusicStaff";

export function NoteDirectionExercise({ onAnswer, showHint , onNext}: any) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  
  const currentSequence = useRef<{note: string, octave: number}[]>([]);
  const isAscending = useRef<boolean>(true);

  const handleNext = () => {
    setShowNext(false);
    generateQuestion();
    setTimeout(playSequence, 500);
  };

  const generateQuestion = () => {
    const startOctave = Math.random() > 0.5 ? 3 : 4;
    const startNoteStr = getRandomNote(startOctave, startOctave, true);
    // Force startNote to be natural
    const startNoteClean = startNoteStr.note.replace(/#|b/, '');
    
    const seqLength = Math.floor(Math.random() * 3) + 3; // 3 to 5 notes
    const direction = Math.random() > 0.5; // true = up, false = down
    
    isAscending.current = direction;
    
    const DIATONIC_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    let currentNoteIndex = DIATONIC_NOTES.indexOf(startNoteClean);
    let currentOctave = startOctave;

    const seq = [{ note: startNoteClean, octave: currentOctave }];
    
    for (let i = 1; i < seqLength; i++) {
      const step = Math.floor(Math.random() * 3) + 1; // 1 to 3 diatonic steps
      if (direction) {
        currentNoteIndex += step;
        if (currentNoteIndex >= 7) {
          currentNoteIndex -= 7;
          currentOctave++;
        }
      } else {
        currentNoteIndex -= step;
        if (currentNoteIndex < 0) {
          currentNoteIndex += 7;
          currentOctave--;
        }
      }
      seq.push({ note: DIATONIC_NOTES[currentNoteIndex], octave: currentOctave });
    }
    
    currentSequence.current = seq;
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
    for (let i = 0; i < currentSequence.current.length; i++) {
      const n = currentSequence.current[i];
      playNote(n.note, n.octave, 0.5, 1);
      const _ok = await waitAudio(600); if (!_ok) return;
    }
    
    setIsPlaying(false);
  };

  const submitAnswer = (guessIsAscending: boolean) => {
    const isCorrect = guessIsAscending === isAscending.current;
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

      {isRetry && currentSequence.current.length > 0 && (
        <MusicStaff notes={currentSequence.current} 
          caption={`The sequence was moving ${isAscending.current ? "Up (Ascending)" : "Down (Descending)"}`} 
        />
      )}

      {showHint && !isRetry && (
        <p className="text-orange-600 dark:text-orange-400 bg-orange-500/10 dark:bg-orange-500/10 p-4 rounded-xl text-sm font-medium mb-8 max-w-lg text-center">
          Hint: Try to hum the first note and the last note. Does your voice go higher or lower?
        </p>
      )}

      <button 
        onClick={playSequence}
        disabled={isPlaying}
        className="w-32 h-32 rounded-full bg-white dark:bg-orange-500 border-4 border-orange-500 dark:border-orange-400 flex items-center justify-center shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-all mb-12 disabled:opacity-50"
      >
        <ArrowUpDown className={`w-12 h-12 text-orange-500 dark:text-white ${isPlaying ? 'animate-pulse' : ''}`} />
      </button>

      {!hasPlayed && <p className="text-muted-foreground font-medium mb-8 animate-pulse">Press the play button to hear the sequence</p>}

      <div className="grid grid-cols-2 gap-6 w-full max-w-md">
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(true)}
          className="text-xl"
        >
          Up
        </Button>
        <Button 
          variant="outline" 
          size="lg" 
          disabled={!hasPlayed || isPlaying} 
          onClick={() => submitAnswer(false)}
          className="text-xl"
        >
          Down
        </Button>
      </div>
    </div>
  );
}
