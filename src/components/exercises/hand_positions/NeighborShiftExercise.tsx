import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, TrendingUp, Home } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";
import { PhraseCompareVisual } from "./PhraseCompareVisual";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

// Phrase 1 is always C Major. Phrase 2 is either C Major (same) or D Minor (shifted up 1 step).
// Multiple melodic shapes for each to prevent repetition.
const C_PHRASE_SHAPES = [
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "D4", octave: 4 }, { note: "C4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }, { note: "C4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "E4", octave: 4 }, { note: "C4", octave: 4 }],
];

const D_MINOR_SHAPES = [
  [{ note: "D4", octave: 4 }, { note: "F4", octave: 4 }, { note: "A4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "E4", octave: 4 }, { note: "F4", octave: 4 }],
  [{ note: "F4", octave: 4 }, { note: "E4", octave: 4 }, { note: "D4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "F4", octave: 4 }, { note: "D4", octave: 4 }],
  [{ note: "A4", octave: 4 }, { note: "F4", octave: 4 }, { note: "D4", octave: 4 }],
];

export function NeighborShiftExercise({ onComplete }: Props) {
  const [isShifted, setIsShifted] = useState(false);
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{shifted: boolean, phrase1Index: number, phrase2Index: number}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_neighbor-shift') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_neighbor-shift') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    if (nextStep === 0) {
      setIsShifted(true);
      setHistory([{ shifted: true, phrase1Index: 0, phrase2Index: 0 }]);
      setMelody([...C_PHRASE_SHAPES[0], ...D_MINOR_SHAPES[0]]);
    } else {
      const OPTIONS = [
        ...C_PHRASE_SHAPES.flatMap((_, p1) => C_PHRASE_SHAPES.map((_, p2) => ({ shifted: false, phrase1Index: p1, phrase2Index: p2 }))),
        ...C_PHRASE_SHAPES.flatMap((_, p1) => D_MINOR_SHAPES.map((_, p2) => ({ shifted: true, phrase1Index: p1, phrase2Index: p2 })))
      ];
      
      const chosen = getUniqueQuestion(OPTIONS, history, (a, b) => a.shifted === b.shifted && a.phrase1Index === b.phrase1Index && a.phrase2Index === b.phrase2Index);
      
      setIsShifted(chosen.shifted);
      setHistory(prev => [...prev, chosen]);
      
      const phrase1 = C_PHRASE_SHAPES[chosen.phrase1Index];
      const phrase2 = chosen.shifted ? D_MINOR_SHAPES[chosen.phrase2Index] : C_PHRASE_SHAPES[chosen.phrase2Index];
      
      setMelody([...phrase1, ...phrase2]);
    }
  };

  useEffect(() => {
    generateQuestion(step);
  }, []);

  const play = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const halfLen = Math.floor(melody.length / 2);
    const session = getAudioSession();
    for (let i = 0; i < melody.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(i);
      const ev: SequenceEvent = {
        notes: [melody[i]],
        duration: 0.4,
        gapAfter: i === halfLen - 1 ? 0.4 : 0.05 // Pause between phrase 1 and phrase 2
      };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') {
      setExamplePhase('guess');
    }
  };

  const handleGuess = (guessShifted: boolean) => {
    if (guessShifted === isShifted) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_neighbor-shift', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateQuestion(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 9: The Neighbor Shift"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="You'll hear two short phrases with a pause between them. Phrase 1 is always in C Major. Does Phrase 2 stay in C Major, or does it slide up one white key to D Minor (sounds darker)?"
      practiceInstruction="Listen to both phrases! Did the second phrase stay in C Major (same sound), or shift up one step to D Minor (sounds darker and sadder)?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="neighbor-shift"
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
            Hint: The second phrase sounds darker — it shifted up to D Minor!
          </motion.div>
        )}

        {feedback === "none" && (
          <div className="flex gap-4 w-full">
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(false)} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-orange-500 text-white font-black text-xl rounded-2xl hover:bg-orange-600 active:scale-95 transition-all shadow-xl border-b-4 border-orange-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><Home className="w-6 h-6" /> STAYED IN C</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Same Key)</span>
              </button>
            </div>
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(true)} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-teal-500 text-white font-black text-xl rounded-2xl hover:bg-teal-600 active:scale-95 transition-all shadow-xl border-b-4 border-teal-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><TrendingUp className="w-6 h-6" /> SHIFTED UP</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Moved to D Minor)</span>
              </button>
            </div>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-full max-w-lg relative z-50">
            <PhraseCompareVisual phrase1Anchor={melody[0]?.note || "C4"} phrase2Anchor={melody[Math.floor(melody.length / 2)]?.note || "C4"} />
            <button onClick={() => setFeedback("none")} className="w-full mt-4 py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </div>
    </ExerciseLayout>
  );
}
