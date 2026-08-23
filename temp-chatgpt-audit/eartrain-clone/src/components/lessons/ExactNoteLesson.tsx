import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

export function ExactNoteLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetNote = useRef<string>("C");
  const quizEvents = useRef<SequenceEvent[]>([]);

  // The C Major scale
  const scale = ["C", "D", "E", "F", "G", "A", "B"];

  const playDemoNote = async (note: string) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    // Build sequence climbing from C4 up to the target note
    const targetIndex = scale.indexOf(note);
    const events: SequenceEvent[] = [];
    
    for (let i = 0; i <= targetIndex; i++) {
      const isLast = i === targetIndex;
      events.push({
        notes: [{ note: scale[i], octave: 4 }],
        duration: isLast ? 1.5 : 0.4,
        gapAfter: isLast ? 0 : 0
      });
    }

    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const randomNote = scale[Math.floor(Math.random() * scale.length)];
    targetNote.current = randomNote;
    
    quizEvents.current = [
      { notes: [{ note: randomNote, octave: 4 }], duration: 1.5, gapAfter: 0 }
    ];
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    
    if (quizStatus === "correct" || quizEvents.current.length === 0) {
      generateQuiz();
    }
    
    // Hide keyboard highlights during the test!
    await playSequenceWithUI(quizEvents.current, () => {}); 
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: string) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetNote.current) {
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
          <strong>Absolute Pitch</strong> (or Perfect Pitch) is the rare ability to identify a musical note without any reference point. However, you can develop something very similar called <strong>Pitch Memory</strong> by deeply memorizing a single reference note, usually <strong>Middle C</strong>.
          <br /><br />
          <strong>Theory:</strong> Unlike relative pitch, which measures the exact interval distance in semitones between two notes, Absolute (Perfect) Pitch is the ability to identify the exact pitch class and octave without a reference. It relies on internalizing the exact frequency profile of each note.
        </p>
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="C5" activeNotes={activeNotes} />
      </div>

      {/* Audio Demos */}
      <div>
        <h3 className="text-xl font-bold mb-4">Scale Builder</h3>
        <p className="text-stone-500 text-sm mb-4">Click a note below. Notice how it uses C as an anchor and counts up the major scale to find the pitch.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {scale.map((n) => (
            <Button 
              key={n}
              variant="outline" 
              className={`h-auto p-4 flex flex-col items-center justify-center gap-2 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 ${n === 'C' ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20' : ''}`}
              onClick={() => playDemoNote(n)}
              disabled={isPlaying}
            >
              <span className={`font-bold text-lg ${n === 'C' ? 'text-orange-600 dark:text-orange-400' : ''}`}>{n === 'C' ? 'Reference C' : `Note ${n}`}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Press play to hear a random note. Try to hum Middle C in your head, then count up the scale to identify the hidden pitch!</p>
        
        <div className="flex flex-col md:flex-row items-center gap-4 flex-wrap">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Random Note
          </Button>
          
          <div className="flex gap-2 w-full sm:w-auto flex-wrap justify-center">
            {scale.map((n) => (
              <Button 
                key={`guess-${n}`}
                size="lg"
                variant="outline"
                disabled={isPlaying}
                className={`w-14 h-14 border-2 ${quizStatus === 'correct' && targetNote.current === n ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetNote.current === n ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-stone-400'}`}
                onClick={() => handleGuess(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was {targetNote.current}, try humming the mystery note out loud. Keep humming it while you press the "Reference C" button above. Sing the scale upwards from C until you hit the note you were humming. Count how many steps you took!</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Incredible pitch!
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
