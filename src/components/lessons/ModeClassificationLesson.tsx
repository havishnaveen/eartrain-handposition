import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

type Mode = "Ionian" | "Dorian" | "Phrygian" | "Lydian" | "Mixolydian" | "Aeolian" | "Locrian";

export function ModeClassificationLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetMode = useRef<Mode>("Ionian");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const modesData: Record<Mode, { scale: string[]; color: string; desc: string }> = {
    Ionian: { scale: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"], color: "emerald", desc: "The standard Major scale. Happy, pure, resolved." },
    Dorian: { scale: ["D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5"], color: "indigo", desc: "Minor, but with a raised 6th. Cool, jazzy, funky, slightly bright minor." },
    Phrygian: { scale: ["E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5"], color: "rose", desc: "Minor, but with a flat 2nd. Exotic, dark, Spanish or Middle-Eastern flavor." },
    Lydian: { scale: ["F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5"], color: "amber", desc: "Major, but with a raised 4th. Dreamy, floating, magical, cinematic." },
    Mixolydian: { scale: ["G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5"], color: "blue", desc: "Major, but with a flat 7th. Bluesy, classic rock, unresolved dominant feel." },
    Aeolian: { scale: ["A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5"], color: "slate", desc: "The standard Natural Minor scale. Sad, serious, melancholy." },
    Locrian: { scale: ["B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5"], color: "purple", desc: "Diminished. Extremely dark, unstable, tense. Rarely used as a main key." },
  };

  const playMode = async (mode: Mode) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const scale = modesData[mode].scale;
    const events: SequenceEvent[] = scale.map((n) => {
      // Parse the note string like "C4" into { note: "C", octave: 4 }
      const note = n.slice(0, -1);
      const octave = parseInt(n.slice(-1));
      return { notes: [{ note, octave }], duration: 0.4, gapAfter: 0 };
    });
    
    // add chord at the end
    const root = scale[0].slice(0, -1);
    const rootOct = parseInt(scale[0].slice(-1));
    const third = scale[2].slice(0, -1);
    const thirdOct = parseInt(scale[2].slice(-1));
    const fifth = scale[4].slice(0, -1);
    const fifthOct = parseInt(scale[4].slice(-1));
    
    events.push({ notes: [{ note: root, octave: rootOct }, { note: third, octave: thirdOct }, { note: fifth, octave: fifthOct }], duration: 1.5, gapAfter: 0.5 });

    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const modes: Mode[] = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"];
    const randomMode = modes[Math.floor(Math.random() * modes.length)];
    targetMode.current = randomMode;
    
    const scale = modesData[randomMode].scale;
    const events: SequenceEvent[] = scale.map((n) => {
      const note = n.slice(0, -1);
      const octave = parseInt(n.slice(-1));
      return { notes: [{ note, octave }], duration: 0.4, gapAfter: 0 };
    });
    
    quizEvents.current = events;
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

  const handleGuess = (guess: Mode) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetMode.current) {
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
          The <strong>7 Church Modes</strong> are essentially the C Major scale started from a different note. For example, playing the white keys from C to C gives you Major (Ionian), but playing the white keys from D to D gives you Dorian.
          <br /><br />
          <strong>Theory:</strong> Modes are derived by taking a parent Major scale and starting on a different scale degree, shifting the entire sequence of whole and half steps relative to the root. For example, Dorian is the 2nd mode, featuring a Minor 3rd but a Major 6th. Phrygian is the 3rd mode, defined by its dissonant Minor 2nd interval. Lydian is the 4th mode, featuring an Augmented 4th (tritone).
        </p>
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C4" endNote="B5" activeNotes={activeNotes} />
      </div>

      {/* Audio Demos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.keys(modesData) as Mode[]).map((mode) => (
          <Button 
            key={mode}
            variant="outline" 
            className="h-auto p-4 flex flex-col items-center justify-center gap-2 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            onClick={() => playMode(mode)}
            disabled={isPlaying}
          >
            <div className={`w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-900/50 flex items-center justify-center text-stone-600 dark:text-stone-400`}>
              <Play className="w-5 h-5 ml-1" />
            </div>
            <div className="text-center">
              <div className="font-bold">{mode}</div>
              <div className="text-xs text-stone-500 whitespace-normal mt-1">{modesData[mode].desc}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Listen to the scale. Try to categorize its overall mood to identify which mode it is.</p>
        
        <div className="flex flex-col gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto self-start gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Mystery Mode
          </Button>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
            {(Object.keys(modesData) as Mode[]).map((mode) => (
              <Button 
                key={`guess-${mode}`}
                size="lg"
                variant="outline"
                disabled={isPlaying}
                className={`border-2 h-auto py-3 ${quizStatus === 'correct' && targetMode.current === mode ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetMode.current === mode ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-stone-400'}`}
                onClick={() => handleGuess(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was {targetMode.current}, compare your guess to the actual flavor of the scale. Does the scale sound fundamentally Happy (Major) or Sad (Minor)? That will narrow your choices significantly! Replay the scale and listen to the final resolving note.</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Great analytical ear.
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
