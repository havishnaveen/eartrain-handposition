
import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

export function TuningLesson(_props: any) {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetDirection = useRef<string>("In Tune");

  const playDemo1 = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [{ notes: [{ note: "A", octave: 4 }, { note: "A", octave: 4 }], duration: 2, gapAfter: 0.5 }];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const playDemo2 = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [{ notes: [{ note: "A", octave: 4 }, { note: "G#", octave: 4 }], duration: 2, gapAfter: 0.5 }];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const currentSequence = useRef<SequenceEvent[]>([]);

  const generateQuiz = () => {
      const isFirst = Math.random() > 0.5;
      targetDirection.current = isFirst ? "In Tune" : "Out of Tune";
      
      const events: SequenceEvent[] = isFirst ? [{ notes: [{ note: "A", octave: 4 }, { note: "A", octave: 4 }], duration: 2, gapAfter: 0.5 }] : [{ notes: [{ note: "A", octave: 4 }, { note: "G#", octave: 4 }], duration: 2, gapAfter: 0.5 }];
      currentSequence.current = events;
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    
    if (currentSequence.current.length === 0) {
      generateQuiz();
    }
    
    await playSequenceWithUI(currentSequence.current, () => {}); 
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: string) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetDirection.current) {
      setQuizStatus("correct");
      setUnlocked(true);
      setTimeout(() => {
        generateQuiz();
        setQuizStatus("idle");
      }, 1500);
    } else {
      setQuizStatus("wrong");
    }
  };

  return (
    <div className="space-y-10">
      
      {/* Brief Text */}
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Tuning involves comparing two pitches to see if they are exactly the same (in tune) or if one is slightly off (out of tune). When two notes are out of tune, you can often hear a 'wobbly' or 'beating' sound. When they are perfectly in tune, the sound is smooth.
        </p>
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800">
        <PianoKeyboard startNote="C3" endNote="B4" activeNotes={activeNotes} />
      </div>

      {/* Audio Demos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
          onClick={playDemo1}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: In Tune</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          onClick={playDemo2}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: Out of Tune</span>
        </Button>
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Press play to hear two notes played together. Identify if they sound perfectly IN TUNE (smooth) or OUT OF TUNE (clashing or wobbly).</p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto gap-2 bg-stone-800 hover:bg-stone-700 text-white"
          >
            <Play className="w-4 h-4" /> Hear Sequence
          </Button>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              size="lg"
              variant="outline"
              disabled={isPlaying}
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetDirection.current === 'In Tune' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDirection.current === 'In Tune' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-orange-500'}`}
              onClick={() => handleGuess("In Tune")}
            >
              In Tune
            </Button>
            <Button 
              size="lg"
              variant="outline"
              disabled={isPlaying}
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetDirection.current === 'Out of Tune' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDirection.current === 'Out of Tune' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-amber-500'}`}
              onClick={() => handleGuess("Out of Tune")}
            >
              Out of Tune
            </Button>
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you guessed {targetDirection.current === "In Tune" ? "Out of Tune" : "In Tune"}, try listening again and comparing the notes.</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Great ear!
            </div>
            <Link to="/exercises">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                Go to Exercise <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>

    </div>
  )
}
