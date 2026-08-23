import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

export function MajorMinorLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetChord = useRef<"Major" | "Minor">("Major");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const playMajor = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [
      // Play chord
      { notes: [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }], duration: 1.5, gapAfter: 1 },
      // Play broken (arpeggio)
      { notes: [{ note: "C", octave: 4 }], duration: 0.8, gapAfter: 0 },
      { notes: [{ note: "E", octave: 4 }], duration: 0.8, gapAfter: 0 },
      { notes: [{ note: "G", octave: 4 }], duration: 0.8, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const playMinor = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const events: SequenceEvent[] = [
      // Play chord
      { notes: [{ note: "C", octave: 4 }, { note: "D#", octave: 4 }, { note: "G", octave: 4 }], duration: 1.5, gapAfter: 1 },
      // Play broken (arpeggio)
      { notes: [{ note: "C", octave: 4 }], duration: 0.8, gapAfter: 0 },
      { notes: [{ note: "D#", octave: 4 }], duration: 0.8, gapAfter: 0 },
      { notes: [{ note: "G", octave: 4 }], duration: 0.8, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const isMajor = Math.random() > 0.5;
    targetChord.current = isMajor ? "Major" : "Minor";
    
    // Simplistic quiz generator for F major/minor bounds
    const baseOct = 4;
    
    if (isMajor) {
      quizEvents.current = [
        { notes: [{ note: "F", octave: baseOct }, { note: "A", octave: baseOct }, { note: "C", octave: baseOct+1 }], duration: 1.5, gapAfter: 1 },
        { notes: [{ note: "F", octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: "A", octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: "C", octave: baseOct+1 }], duration: 0.8, gapAfter: 0 }
      ];
    } else {
      quizEvents.current = [
        { notes: [{ note: "F", octave: baseOct }, { note: "G#", octave: baseOct }, { note: "C", octave: baseOct+1 }], duration: 1.5, gapAfter: 1 },
        { notes: [{ note: "F", octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: "G#", octave: baseOct }], duration: 0.8, gapAfter: 0 },
        { notes: [{ note: "C", octave: baseOct+1 }], duration: 0.8, gapAfter: 0 }
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

  const handleGuess = (guess: "Major" | "Minor") => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetChord.current) {
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
          When three or more notes are played together, they form a <strong>Chord</strong>. The most common type of chord is a triad (3 notes), and the two most foundational triads are <strong>Major</strong> and <strong>Minor</strong>.
          <br /><br />
          <strong>Theory:</strong> The defining difference between a Major and Minor chord is the 3rd interval. A Major triad stacks a Major 3rd (4 semitones) and a Perfect 5th (7 semitones) above the root. A Minor triad lowers the 3rd by one half-step, creating a Minor 3rd (3 semitones) interval, which completely shifts the harmonic tension.
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
          onClick={playMajor}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: Major Triad</span>
          <span className="text-sm text-stone-500 font-normal">Plays the chord, then each note individually</span>
        </Button>
        
        <Button 
          variant="outline" 
          className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          onClick={playMinor}
          disabled={isPlaying}
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Audio Demo: Minor Triad</span>
          <span className="text-sm text-stone-500 font-normal">Notice the flattened middle note</span>
        </Button>
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Press play to hear a hidden chord. Listen to the overall mood to decide if it's Major or Minor.</p>
        
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
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetChord.current === 'Major' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetChord.current === 'Major' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-orange-500'}`}
              onClick={() => handleGuess("Major")}
            >
              Major
            </Button>
            <Button 
              size="lg"
              variant="outline"
              disabled={isPlaying}
              className={`flex-1 sm:w-32 border-2 ${quizStatus === 'correct' && targetChord.current === 'Minor' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetChord.current === 'Minor' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-emerald-500'}`}
              onClick={() => handleGuess("Minor")}
            >
              Minor
            </Button>
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was a {targetChord.current === "Major" ? "Minor" : "Major"} chord, you might have been distracted by the top or bottom note. Replay the audio and listen closely to the middle note when the chord is broken apart. Does it sound slightly lowered and melancholic (Minor), or bright and stable (Major)?</p>
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
