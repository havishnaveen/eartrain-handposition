import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, ArrowUpRight, ShieldCheck } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { OutOfBoundsVisual } from "./OutOfBoundsVisual";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

// Different melody shapes for the in-bounds and out-of-bounds cases
const IN_BOUNDS_MELODIES = [
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }, { note: "G4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }, { note: "E4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "E4", octave: 4 }, { note: "C4", octave: 4 }, { note: "D4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "G4", octave: 4 }, { note: "F4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "F4", octave: 4 }, { note: "G4", octave: 4 }, { note: "F4", octave: 4 }],
];

const OUT_OF_BOUNDS_MELODIES = [
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }, { note: "G4", octave: 4 }, { note: "A4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }, { note: "G4", octave: 4 }, { note: "B4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "G4", octave: 4 }, { note: "A4", octave: 4 }, { note: "C5", octave: 5 }],
  [{ note: "G4", octave: 4 }, { note: "E4", octave: 4 }, { note: "A4", octave: 4 }, { note: "B4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "F4", octave: 4 }, { note: "G4", octave: 4 }, { note: "C5", octave: 5 }],
];

export function HighOutOfBoundsExercise({ onComplete }: Props) {
  const [isOutOfBounds, setIsOutOfBounds] = useState(false);
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{isOutOfBounds: boolean, index: number}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_high-out-of-bounds') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_high-out-of-bounds') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const noteOrder = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5"];
  const outNote = melody.find(n => noteOrder.indexOf(n.note) > noteOrder.indexOf("G4"))?.note || "A4";

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    if (nextStep === 0) {
      // Example: always the classic C-E-G-A
      setIsOutOfBounds(true);
      setHistory([{ isOutOfBounds: true, index: 0 }]);
      setMelody(OUT_OF_BOUNDS_MELODIES[0]);
    } else {
      const OPTIONS = [
        ...IN_BOUNDS_MELODIES.map((_, i) => ({ isOutOfBounds: false, index: i })),
        ...OUT_OF_BOUNDS_MELODIES.map((_, i) => ({ isOutOfBounds: true, index: i }))
      ];
      const chosen = getUniqueQuestion(OPTIONS, history, (a, b) => a.isOutOfBounds === b.isOutOfBounds && a.index === b.index);
      
      setIsOutOfBounds(chosen.isOutOfBounds);
      setHistory(prev => [...prev, chosen]);
      
      if (chosen.isOutOfBounds) {
        setMelody(OUT_OF_BOUNDS_MELODIES[chosen.index]);
      } else {
        setMelody(IN_BOUNDS_MELODIES[chosen.index]);
      }
    }
  };

  useEffect(() => {
    generateQuestion(step);
  }, []);

  const play = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const session = getAudioSession();
    for (let i = 0; i < melody.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(i);
      const ev: SequenceEvent = {
        notes: [melody[i]],
        duration: 0.4,
        gapAfter: 0.05
      };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') {
      setExamplePhase('guess');
    }
  };

  const handleGuess = (guessOutOfBounds: boolean) => {
    if (guessOutOfBounds === isOutOfBounds) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_high-out-of-bounds', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateQuestion(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 7: High Out-of-Bounds"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Your 5 fingers cover C-D-E-F-G. Listen to the melody — does it stay inside those 5 notes, or does the last note reach UP to A (above your top finger)?"
      practiceInstruction="Listen carefully! Did the melody stay safely inside C-G (your 5 fingers), or did it stretch HIGH above G to the note A?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="high-out-of-bounds"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="w-full mb-8">
        <MusicStaff notes={melody} cursorIndex={cursorIndex} />
        
        <div className="flex justify-center mt-4">
          <WalkthroughFocus isActive={examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button 
              onClick={play} 
              disabled={isPlaying}
              className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700"
            >
              <Play className="w-6 h-6 fill-current" /> PLAY MUSIC
            </button>
          </WalkthroughFocus>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 min-h-32 mt-4 w-full max-w-lg mx-auto">
        {examplePhase === 'guess' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-12 w-full max-w-sm relative z-50">
            <OutOfBoundsVisual outOfBoundsNote={outNote} direction="high" />
          </motion.div>
        )}

        {feedback === "none" && (
          <div className="flex gap-4 w-full">
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(false)} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-emerald-500 text-white font-black text-xl rounded-2xl hover:bg-emerald-600 active:scale-95 transition-all shadow-xl border-b-4 border-emerald-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><ShieldCheck className="w-6 h-6" /> IN BOUNDS</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Stayed C–G)</span>
              </button>
            </div>
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(true)} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-purple-500 text-white font-black text-xl rounded-2xl hover:bg-purple-600 active:scale-95 transition-all shadow-xl border-b-4 border-purple-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><ArrowUpRight className="w-6 h-6" /> HIGH REACH</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Reached higher!)</span>
              </button>
            </div>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 w-full max-w-sm relative z-50">
            {isOutOfBounds ? (
              <OutOfBoundsVisual outOfBoundsNote={outNote} direction="high" />
            ) : (
              <p className="text-red-500 font-bold text-lg text-center">The melody stayed within your 5 fingers!</p>
            )}
            <button onClick={() => setFeedback("none")} className="w-full py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </div>
    </ExerciseLayout>
  );
}
