import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, ArrowRight, Footprints } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { IntervalVisual } from "./IntervalVisual";
import { getUniqueQuestion } from "@/lib/musicHelpers";

// Variety of starting notes so intervals don't always start on C
const STEP_PAIRS: [{ note: string; octave: number }, { note: string; octave: number }][] = [
  [{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "F4", octave: 4 }],
  [{ note: "F4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "A4", octave: 4 }],
];

const SKIP_PAIRS: [{ note: string; octave: number }, { note: string; octave: number }][] = [
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "F4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "F4", octave: 4 }, { note: "A4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "B4", octave: 4 }],
];

interface Props {
  onComplete: () => void;
}

export function StepOrSkipExercise({ onComplete }: Props) {
  const [targetType, setTargetType] = useState<"step" | "skip">("step");
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{type: "step"|"skip", pairIndex: number}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_step-skip') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_step-skip') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    if (nextStep === 0) {
      // Example always C→D
      setTargetType("step");
      setHistory([{ type: "step", pairIndex: 0 }]);
      setMelody([{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }]);
    } else {
      const OPTIONS: {type: "step"|"skip", pairIndex: number}[] = [
        ...STEP_PAIRS.map((_, i) => ({ type: "step" as const, pairIndex: i })),
        ...SKIP_PAIRS.map((_, i) => ({ type: "skip" as const, pairIndex: i }))
      ];
      const chosen = getUniqueQuestion(OPTIONS, history, (a, b) => a.type === b.type && a.pairIndex === b.pairIndex);
      
      setTargetType(chosen.type);
      setHistory(prev => [...prev, chosen]);
      
      if (chosen.type === "step") {
        setMelody([STEP_PAIRS[chosen.pairIndex][0], STEP_PAIRS[chosen.pairIndex][1]]);
      } else {
        setMelody([SKIP_PAIRS[chosen.pairIndex][0], SKIP_PAIRS[chosen.pairIndex][1]]);
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
        duration: 0.5,
        gapAfter: 0.1
      };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') {
      setExamplePhase('guess');
    }
  };

  const handleGuess = (guess: "step" | "skip") => {
    if (guess === targetType) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_step-skip', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateQuestion(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 5: Step or Skip?"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="You'll hear two notes. A Step moves to the very next note (like walking up one stair). A Skip jumps over a note (like hopping over a stair). Which one is it?"
      practiceInstruction="Listen to the two notes. Did they move by Step (next-door neighbor note) or Skip (jumped over a note)?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="step-skip"
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

      <div className="flex flex-col items-center gap-4 min-h-[16rem] mt-4 w-full max-w-lg mx-auto">
        {examplePhase === 'guess' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-blue-500 bg-blue-50 px-6 py-2 rounded-full mb-16 border border-blue-200">
            Hint: A Step sounds close together. A Skip sounds wider apart!
          </motion.div>
        )}

        {feedback === "none" && (
          <div className="flex gap-4 w-full">
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess("step")} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-emerald-500 text-white font-black text-xl rounded-2xl hover:bg-emerald-600 active:scale-95 transition-all shadow-xl border-b-4 border-emerald-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><Footprints className="w-6 h-6" /> STEP</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Next Door)</span>
              </button>
            </div>
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess("skip")} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-indigo-500 text-white font-black text-xl rounded-2xl hover:bg-indigo-600 active:scale-95 transition-all shadow-xl border-b-4 border-indigo-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><ArrowRight className="w-6 h-6" /> SKIP</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Jumped Over)</span>
              </button>
            </div>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-full max-w-sm relative z-50">
            <div className="mb-2 w-full">
              <p className="text-center text-stone-600 dark:text-stone-400 font-semibold mb-2">
                A step is right next door. A skip jumps over a note.
              </p>
              <IntervalVisual 
                note1={melody[0].note} 
                note2={melody[1].note} 
                intervalType={targetType === "step" ? "step" : "skip"} 
              />
            </div>
            <button onClick={() => setFeedback("none")} className="w-full py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </div>
    </ExerciseLayout>
  );
}
