import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

export function SecondsThirdsLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetInterval = useRef<"2nd" | "3rd">("2nd");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const play2nd = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [
      // Play chord
      { notes: [{ note: "C", octave: 4 }, { note: "D", octave: 4 }], duration: 1.5, gapAfter: 1 },
      // Play broken
      { notes: [{ note: "C", octave: 4 }], duration: 1, gapAfter: 0 },
      { notes: [{ note: "D", octave: 4 }], duration: 1, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const play3rd = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [
      // Play chord
      { notes: [{ note: "C", octave: 4 }, { note: "E", octave: 4 }], duration: 1.5, gapAfter: 1 },
      // Play broken
      { notes: [{ note: "C", octave: 4 }], duration: 1, gapAfter: 0 },
      { notes: [{ note: "E", octave: 4 }], duration: 1, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const is2nd = Math.random() > 0.5;
    targetInterval.current = is2nd ? "2nd" : "3rd";
    
    const possibleNotes = ["C", "D", "E", "F", "G", "A"];
    const baseNote = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
    const baseOct = 4;
    
    // Simplistic mapping for the quiz
    const topNote2nd = String.fromCharCode(baseNote.charCodeAt(0) + 1);
    const topNote3rd = String.fromCharCode(baseNote.charCodeAt(0) + 2);
    
    // Handle wrap around for simplistic notes (A->B, B->C) - this is just a quick hack for the lesson to stay in C major bounds
    const safeTopNote2nd = baseNote === "A" ? "B" : baseNote === "B" ? "C" : topNote2nd;
    const safeTopNote3rd = baseNote === "G" ? "B" : baseNote === "A" ? "C" : baseNote === "B" ? "D" : topNote3rd;
    const topOct2nd = (baseNote === "A" || baseNote === "B") && safeTopNote2nd === "C" ? baseOct + 1 : baseOct;
    const topOct3rd = (baseNote === "A" || baseNote === "B" || baseNote === "G") && (safeTopNote3rd === "C" || safeTopNote3rd === "D") ? baseOct + 1 : baseOct;

    if (is2nd) {
      quizEvents.current = [
        { notes: [{ note: baseNote, octave: baseOct }, { note: safeTopNote2nd, octave: topOct2nd }], duration: 1.5, gapAfter: 1 },
        { notes: [{ note: baseNote, octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: safeTopNote2nd, octave: topOct2nd }], duration: 0.8, gapAfter: 0 }
      ];
    } else {
      quizEvents.current = [
        { notes: [{ note: baseNote, octave: baseOct }, { note: safeTopNote3rd, octave: topOct3rd }], duration: 1.5, gapAfter: 1 },
        { notes: [{ note: baseNote, octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: safeTopNote3rd, octave: topOct3rd }], duration: 0.8, gapAfter: 0 }
      ];
    }
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

  const handleGuess = (guess: "2nd" | "3rd") => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetInterval.current) {
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
          The building blocks of all chords are <strong>intervals</strong>—the distance between two notes. The two smallest and most common intervals are the <strong>2nd</strong> and the <strong>3rd</strong>.
          <br /><br />
          <strong>Theory:</strong> Intervals measure the exact distance between two notes. A 2nd is the interval between adjacent scale degrees (e.g., a Major 2nd spans 2 semitones or one whole step). A 3rd skips one scale degree (e.g., a Major 3rd spans 4 semitones or two whole steps). Hearing the difference means distinguishing a stepwise motion from a leap.
        </p>
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800">
        <PianoKeyboard startNote="C4" endNote="A4" highlightedNotes={["C4", "D4", "E4", "F4", "G4", "A4"]} activeNotes={activeNotes} />
      </div>

      {/* Audio Demos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
          onClick={play2nd}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: 2nd</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          onClick={play3rd}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: 3rd</span>
        </Button>
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Press play to hear a hidden chord. Decide if the two notes are crunched together (2nd) or spaced apart (3rd).</p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto gap-2 bg-stone-800 hover:bg-stone-700 text-white"
          >
            <Play className="w-4 h-4" /> Hear Chord
          </Button>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <Button 
              size="lg"
              variant="outline"
              disabled={isPlaying}
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetInterval.current === '2nd' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetInterval.current === '2nd' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-orange-500'}`}
              onClick={() => handleGuess("2nd")}
            >
              2nd
            </Button>
            <Button 
              size="lg"
              variant="outline"
              disabled={isPlaying}
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetInterval.current === '3rd' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetInterval.current === '3rd' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-emerald-500'}`}
              onClick={() => handleGuess("3rd")}
            >
              3rd
            </Button>
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was a {targetInterval.current === "2nd" ? "3rd" : "2nd"}, you might have been guessing based on pitch instead of tension. Replay the audio and listen closely to the very first chord. Does it sound tight and crunchy, rubbing against itself (2nd)? Or does it sound relatively harmonious and bright, like a doorbell (3rd)?</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Great ears.
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
