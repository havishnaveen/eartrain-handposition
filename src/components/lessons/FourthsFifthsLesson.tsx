import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

export function FourthsFifthsLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetInterval = useRef<"4th" | "5th">("4th");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const play4th = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [
      // Play chord
      { notes: [{ note: "C", octave: 4 }, { note: "F", octave: 4 }], duration: 1.5, gapAfter: 1 },
      // Play broken
      { notes: [{ note: "C", octave: 4 }], duration: 0.8, gapAfter: 0 },
      { notes: [{ note: "F", octave: 4 }], duration: 0.8, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const play5th = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [
      // Play chord
      { notes: [{ note: "C", octave: 4 }, { note: "G", octave: 4 }], duration: 1.5, gapAfter: 1 },
      // Play broken
      { notes: [{ note: "C", octave: 4 }], duration: 0.8, gapAfter: 0 },
      { notes: [{ note: "G", octave: 4 }], duration: 0.8, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const is4th = Math.random() > 0.5;
    targetInterval.current = is4th ? "4th" : "5th";
    
    // Pick a random starting note
    const possibleNotes = ["C", "D", "E", "F", "G", "A"];
    const baseNote = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];
    const baseOct = 4;
    
    // Simplistic mapping for the quiz
    const topNote4th = String.fromCharCode(baseNote.charCodeAt(0) + 3);
    const topNote5th = String.fromCharCode(baseNote.charCodeAt(0) + 4);
    
    const safeTopNote4th = baseNote === "F" ? "A#" : baseNote === "G" ? "C" : baseNote === "A" ? "D" : topNote4th;
    const safeTopNote5th = baseNote === "F" ? "C" : baseNote === "G" ? "D" : baseNote === "A" ? "E" : topNote5th;
    
    const topOct4th = (baseNote === "F" && safeTopNote4th === "A#") ? baseOct : (baseNote === "F" || baseNote === "G" || baseNote === "A") && (safeTopNote4th === "C" || safeTopNote4th === "D") ? baseOct + 1 : baseOct;
    const topOct5th = (baseNote === "F" || baseNote === "G" || baseNote === "A") && (safeTopNote5th === "C" || safeTopNote5th === "D" || safeTopNote5th === "E") ? baseOct + 1 : baseOct;

    if (is4th) {
      quizEvents.current = [
        { notes: [{ note: baseNote, octave: baseOct }, { note: safeTopNote4th, octave: topOct4th }], duration: 1.5, gapAfter: 1 },
        { notes: [{ note: baseNote, octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: safeTopNote4th, octave: topOct4th }], duration: 0.8, gapAfter: 0 }
      ];
    } else {
      quizEvents.current = [
        { notes: [{ note: baseNote, octave: baseOct }, { note: safeTopNote5th, octave: topOct5th }], duration: 1.5, gapAfter: 1 },
        { notes: [{ note: baseNote, octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: safeTopNote5th, octave: topOct5th }], duration: 0.8, gapAfter: 0 }
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

  const handleGuess = (guess: "4th" | "5th") => {
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
          Outside of 2nds and 3rds, two extremely common and culturally significant intervals are the <strong>Perfect 4th</strong> and the <strong>Perfect 5th</strong>. They are called "Perfect" because they sound incredibly pure and lack the distinct "Major" or "Minor" color.
          <br /><br />
          <strong>Theory:</strong> A Perfect 4th spans exactly 5 semitones from the root, while a Perfect 5th spans exactly 7 semitones. They are inversions of each other. The Perfect 5th provides strong harmonic stability rooted in the overtone series, while the Perfect 4th creates a distinct suspension that seeks to resolve.
        </p>
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="B4" activeNotes={activeNotes} />
      </div>

      {/* Audio Demos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
          onClick={play4th}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: Perfect 4th</span>
          <span className="text-sm text-stone-500 font-normal">Plays the chord, then each note</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          onClick={play5th}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: Perfect 5th</span>
          <span className="text-sm text-stone-500 font-normal">Notice the powerful resonance</span>
        </Button>
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Press play to hear a hidden interval. Listen to decide if it's an open, floating 4th or a powerful, grounded 5th.</p>
        
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
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetInterval.current === '4th' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetInterval.current === '4th' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-orange-500'}`}
              onClick={() => handleGuess("4th")}
            >
              Perfect 4th
            </Button>
            <Button 
              size="lg"
              variant="outline"
              disabled={isPlaying}
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetInterval.current === '5th' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetInterval.current === '5th' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-emerald-500'}`}
              onClick={() => handleGuess("5th")}
            >
              Perfect 5th
            </Button>
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was a {targetInterval.current === "4th" ? "5th" : "4th"}, you might be mixing up their similar open sounds. Replay the audio and hum along. A Perfect 4th sounds like it "wants to go somewhere" (it feels suspended). A Perfect 5th sounds incredibly solid, like it doesn't need to move at all. Listen to the first chord again!</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Outstanding work.
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
