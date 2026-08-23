import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, ArrowUpRight, Home } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";
import { PhraseCompareVisual } from "./PhraseCompareVisual";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

// Multiple phrase shapes for C Major (Phrase 1 and "stayed home" Phrase 2)
const C_PHRASE_SHAPES = [
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "D4", octave: 4 }, { note: "C4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "E4", octave: 4 }, { note: "C4", octave: 4 }],
  [{ note: "C4", octave: 4 }, { note: "E4", octave: 4 }, { note: "C4", octave: 4 }],
];

// Multiple phrase shapes for G Major (the V leap)
const G_PHRASE_SHAPES = [
  [{ note: "G4", octave: 4 }, { note: "B4", octave: 4 }, { note: "D5", octave: 5 }],
  [{ note: "G4", octave: 4 }, { note: "A4", octave: 4 }, { note: "B4", octave: 4 }],
  [{ note: "B4", octave: 4 }, { note: "A4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "D5", octave: 5 }, { note: "B4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "B4", octave: 4 }, { note: "G4", octave: 4 }],
];

export function ItoVLeapExercise({ onComplete }: Props) {
  const [isLeapV, setIsLeapV] = useState(false);
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{leap: boolean, phrase1Index: number, phrase2Index: number}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_i-to-v-leap') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_i-to-v-leap') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    if (nextStep === 0) {
      setIsLeapV(true);
      setHistory([{ leap: true, phrase1Index: 0, phrase2Index: 0 }]);
      setMelody([...C_PHRASE_SHAPES[0], ...G_PHRASE_SHAPES[0]]);
    } else {
      const OPTIONS = [
        ...C_PHRASE_SHAPES.flatMap((_, p1) => C_PHRASE_SHAPES.map((_, p2) => ({ leap: false, phrase1Index: p1, phrase2Index: p2 }))),
        ...C_PHRASE_SHAPES.flatMap((_, p1) => G_PHRASE_SHAPES.map((_, p2) => ({ leap: true, phrase1Index: p1, phrase2Index: p2 })))
      ];
      
      const chosen = getUniqueQuestion(OPTIONS, history, (a, b) => a.leap === b.leap && a.phrase1Index === b.phrase1Index && a.phrase2Index === b.phrase2Index);
      
      setIsLeapV(chosen.leap);
      setHistory(prev => [...prev, chosen]);
      
      const phrase1 = C_PHRASE_SHAPES[chosen.phrase1Index];
      const phrase2 = chosen.leap ? G_PHRASE_SHAPES[chosen.phrase2Index] : C_PHRASE_SHAPES[chosen.phrase2Index];
      
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
        gapAfter: i === halfLen - 1 ? 0.4 : 0.05 // Pause between phrase 1 and 2
      };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') {
      setExamplePhase('guess');
    }
  };

  const handleGuess = (guessLeap: boolean) => {
    if (guessLeap === isLeapV) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_i-to-v-leap', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateQuestion(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 10: The I to V Jump"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="You'll hear two phrases. Phrase 1 is always in C Major (Home). Does Phrase 2 stay in C Major, or does it make a BIG leap up to G Major? G Major sounds much higher and brighter!"
      practiceInstruction="Listen to both phrases! Did the second phrase stay home in C Major, or leap way up to the bright G Major sound?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="i-to-v-leap"
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
            Hint: G Major sounds much higher — it's a big jump up from C!
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
                <div className="flex items-center gap-2"><Home className="w-6 h-6" /> STAYED HOME</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(C Major)</span>
              </button>
            </div>
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(true)} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-blue-500 text-white font-black text-xl rounded-2xl hover:bg-blue-600 active:scale-95 transition-all shadow-xl border-b-4 border-blue-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><ArrowUpRight className="w-6 h-6" /> BIG LEAP</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(G Major)</span>
              </button>
            </div>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-full max-w-lg relative z-50">
            <PhraseCompareVisual phrase1Anchor={melody[0]?.note || "C4"} phrase2Anchor={melody[Math.floor(melody.length / 2)]?.note || "G4"} />
            <button onClick={() => setFeedback("none")} className="w-full mt-4 py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </div>
    </ExerciseLayout>
  );
}
