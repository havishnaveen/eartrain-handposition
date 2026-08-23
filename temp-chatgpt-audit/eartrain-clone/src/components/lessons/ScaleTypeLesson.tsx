import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

type ScaleType = "Natural Minor" | "Harmonic Minor" | "Melodic Minor";

export function ScaleTypeLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetScale = useRef<ScaleType>("Natural Minor");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const scalesData: Record<ScaleType, { notes: { note: string; octave: number }[]; desc: string }> = {
    "Natural Minor": { 
      notes: [
        { note: "C", octave: 4 }, { note: "D", octave: 4 }, { note: "D#", octave: 4 }, 
        { note: "F", octave: 4 }, { note: "G", octave: 4 }, { note: "G#", octave: 4 }, 
        { note: "A#", octave: 4 }, { note: "C", octave: 5 }
      ], 
      desc: "The standard minor scale (Aeolian). Flat 3, 6, and 7." 
    },
    "Harmonic Minor": { 
      notes: [
        { note: "C", octave: 4 }, { note: "D", octave: 4 }, { note: "D#", octave: 4 }, 
        { note: "F", octave: 4 }, { note: "G", octave: 4 }, { note: "G#", octave: 4 }, 
        { note: "B", octave: 4 }, { note: "C", octave: 5 }
      ], 
      desc: "Exotic and classical. Natural 7 creates a massive jump at the end." 
    },
    "Melodic Minor": { 
      notes: [
        { note: "C", octave: 4 }, { note: "D", octave: 4 }, { note: "D#", octave: 4 }, 
        { note: "F", octave: 4 }, { note: "G", octave: 4 }, { note: "A", octave: 4 }, 
        { note: "B", octave: 4 }, { note: "C", octave: 5 }
      ], 
      desc: "Smooth and jazzy. Natural 6 and 7 on the way up." 
    },
  };

  const playScale = async (scaleType: ScaleType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const notes = scalesData[scaleType].notes;
    const events: SequenceEvent[] = notes.map((n, i) => ({
      notes: [n],
      duration: 0.5,
      gapAfter: i === notes.length - 1 ? 0 : 0
    }));

    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const keys: ScaleType[] = ["Natural Minor", "Harmonic Minor", "Melodic Minor"];
    const randomScale = keys[Math.floor(Math.random() * keys.length)];
    targetScale.current = randomScale;
    
    // We'll just stick to C for the scale quizzes so it's easier to hear the top note differences
    const notes = scalesData[randomScale].notes;
    
    quizEvents.current = notes.map((n, i) => ({
      notes: [n],
      duration: 0.5,
      gapAfter: i === notes.length - 1 ? 0 : 0
    }));
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    
    if (quizStatus === "correct" || quizEvents.current.length === 0) {
      generateQuiz();
    }
    
    await playSequenceWithUI(quizEvents.current, () => {}); 
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: ScaleType) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetScale.current) {
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
      
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Different minor scales have distinct flavors depending on their 6th and 7th degrees.
          <br /><br />
          <strong>Theory:</strong> All minor scales feature a minor 3rd interval but differ in their 6th and 7th degrees. The Natural Minor scale follows the key signature exactly. The Harmonic Minor raises the 7th scale degree to create a strong leading-tone half-step to the root, resulting in a distinct 3-semitone jump between the 6th and 7th degrees. The Melodic Minor raises both the 6th and 7th degrees when ascending to smooth out that jump, and lowers them when descending.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="C5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(scalesData) as ScaleType[]).map((scale) => (
          <Button 
            key={scale}
            variant="outline" 
            className="h-auto p-4 flex flex-col items-center justify-center gap-2 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            onClick={() => playScale(scale)}
            disabled={isPlaying}
          >
            <div className={`w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-900/50 flex items-center justify-center text-stone-600 dark:text-stone-400`}>
              <Play className="w-5 h-5 ml-1" />
            </div>
            <div className="text-center">
              <div className="font-bold">{scale}</div>
              <div className="text-xs text-stone-500 whitespace-normal mt-1">{scalesData[scale].desc}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Listen to the ascending scale. Which type of minor scale is it?</p>
        
        <div className="flex flex-col gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto self-start gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Mystery Scale
          </Button>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
            {(Object.keys(scalesData) as ScaleType[]).map((scale) => (
              <Button 
                key={`guess-${scale}`}
                size="lg"
                variant="outline"
                disabled={isPlaying}
                className={`border-2 h-auto py-3 ${quizStatus === 'correct' && targetScale.current === scale ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetScale.current === scale ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-stone-400'}`}
                onClick={() => handleGuess(scale)}
              >
                {scale}
              </Button>
            ))}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was {targetScale.current}, focus completely on the very end of the scale right before it hits the top octave. If the end sounds totally normal and sad, it's Natural. If there's an unmistakably huge, middle-eastern sounding gap before the last note, it's Harmonic. If the last few notes sound almost like a happy Major scale but it started Minor, it's Melodic!</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Great listening!
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
