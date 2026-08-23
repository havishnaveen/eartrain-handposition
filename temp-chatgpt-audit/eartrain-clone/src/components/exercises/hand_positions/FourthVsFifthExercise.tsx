import { useState, useEffect } from "react";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, Ruler, Maximize2 } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { AnimatedPointer } from "../../AnimatedPointer";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

const FOURTHS = [
  [{ note: "C4", octave: 4 }, { note: "F4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "A4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "C5", octave: 5 }],
];

const FIFTHS = [
  [{ note: "C4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "A4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "B4", octave: 4 }],
  [{ note: "F4", octave: 4 }, { note: "C5", octave: 5 }],
  [{ note: "G4", octave: 4 }, { note: "D5", octave: 5 }],
];

type QuestionType = "4th" | "5th";

function MiniKeyboard({ highlightNotes }: { highlightNotes: number[] }) {
  return (
    <div className="relative flex bg-white p-1 rounded-md shadow-inner border border-slate-300">
      {[0, 1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          className={`w-8 h-28 border-r last:border-r-0 border-slate-300 flex items-end justify-center pb-2 transition-colors ${highlightNotes.includes(i) ? 'bg-orange-100 shadow-[inset_0_-8px_16px_rgba(249,115,22,0.3)]' : 'bg-white'}`}
        >
          {highlightNotes.includes(i) && <div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm" />}
        </div>
      ))}
      {/* Black keys for C position (C-D, D-E, F-G) */}
      <div className="absolute top-1 left-[26px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
      <div className="absolute top-1 left-[58px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
      <div className="absolute top-1 left-[122px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
    </div>
  );
}

function IntervalCompareVisual({ targetType }: { targetType: QuestionType }) {
  return (
    <div className="flex flex-col gap-6 w-full p-6 bg-slate-800 rounded-2xl my-4 text-white shadow-xl border border-slate-700">
      <div className="text-center mb-2">
        <h3 className="text-2xl font-bold text-orange-400 mb-2">Let's look at the difference!</h3>
        <p className="text-slate-300">A 5th uses your whole hand, but a 4th is just a little bit shorter.</p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8 justify-center">
        {/* 4th */}
        <div className="flex flex-col items-center bg-slate-700/50 p-6 rounded-xl border border-slate-600 flex-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-green-400" />
          <h4 className="font-bold text-xl mb-4 text-green-400 flex flex-col items-center gap-2">
            <span>4th (Almost full)</span>
            {targetType === "4th" && <span className="bg-green-500/20 text-green-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">Correct Answer</span>}
            {targetType === "5th" && <span className="bg-red-500/20 text-red-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">You Chose</span>}
          </h4>
          <MiniKeyboard highlightNotes={[0, 3]} />
          <p className="mt-4 text-sm text-slate-300 text-center font-medium">Spans 4 notes.<br/>(e.g. Thumb to Ring finger)</p>
        </div>

        {/* 5th */}
        <div className="flex flex-col items-center bg-slate-700/50 p-6 rounded-xl border border-slate-600 flex-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-400" />
          <h4 className="font-bold text-xl mb-4 text-blue-400 flex flex-col items-center gap-2">
            <span>5th (Full stretch)</span>
            {targetType === "5th" && <span className="bg-green-500/20 text-green-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">Correct Answer</span>}
            {targetType === "4th" && <span className="bg-red-500/20 text-red-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">You Chose</span>}
          </h4>
          <MiniKeyboard highlightNotes={[0, 4]} />
          <p className="mt-4 text-sm text-slate-300 text-center font-medium">Spans 5 notes.<br/>(e.g. Thumb to Pinky)</p>
        </div>
      </div>
    </div>
  );
}

export function FourthVsFifthExercise({ onComplete }: Props) {
  const [targetType, setTargetType] = useState<QuestionType>("4th");
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{type: QuestionType, melody: typeof melody}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_fourth-vs-fifth') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_fourth-vs-fifth') ? 'none' : 'play';
  });

  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    let type: QuestionType = Math.random() > 0.5 ? "4th" : "5th";
    if (nextStep === 0) type = "4th"; // Example is always a 4th
    
    const pool = type === "4th" ? FOURTHS : FIFTHS;
    
    const nextMelody = getUniqueQuestion(pool, history.filter(h => h.type === type).map(h => h.melody), (a, b) => 
      a[0].note === b[0].note && a[0].octave === b[0].octave
    );
    
    if (nextStep === 0) {
      setMelody(FOURTHS[0]); // Force C4->F4 for example
    } else {
      setMelody(nextMelody);
    }
    
    setTargetType(type);
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
      const ev: SequenceEvent = { notes: [melody[i]], duration: 0.5, gapAfter: 0.1 };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') setExamplePhase('guess');
  };

  const handleGuess = (guess: QuestionType) => {
    if (isPlaying || feedback === "success") return;
        
    if (guess === targetType) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_fourth-vs-fifth', 'true');
    }
    const next = step + 1;
    if (next > MAX_STEPS) {
      onComplete();
    } else {
      setHistory(prev => [...prev, { type: targetType, melody }]);
      setStep(next);
      generateQuestion(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 12: 4th vs 5th"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="This is a 4th - it stops just one note short of the full hand! Listen closely."
      practiceInstruction="Is this interval a 4th or a 5th?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="fourth-vs-fifth"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto mt-8">
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8  border border-slate-700/50 relative">
          <MusicStaff 
            notes={melody} 
            cursorIndex={cursorIndex} 
          />
          
          <div className="flex justify-center mt-8">
            <WalkthroughFocus isActive={step === 0 && examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button
                onClick={play}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700"
              >
                <Play className={isPlaying ? "animate-pulse" : "w-6 h-6 fill-current"} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY INTERVAL"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {feedback === "error" && <IntervalCompareVisual targetType={targetType} />}

        <div className={`grid grid-cols-2 gap-6 w-full relative ${step === 0 && examplePhase === "guess" ? "z-50" : "z-10"}`}>
          <button
            onClick={() => handleGuess("4th")}
            disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
            className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} 
              flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all
              ${feedback === "success" && targetType === "4th" 
                ? "bg-green-500/20 border-green-500 text-green-400" 
                : feedback === "error" && targetType === "5th"
                ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
            `}
          >
            {step === 0 && examplePhase === "guess" && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}

            <Ruler size={48} className="mb-4" />
            <span className="text-xl font-bold">4TH</span>
            
          </button>
          
          <button
            onClick={() => handleGuess("5th")}
            disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
            className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} 
              flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all
              ${feedback === "success" && targetType === "5th" 
                ? "bg-green-500/20 border-green-500 text-green-400" 
                : feedback === "error" && targetType === "4th"
                ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
            `}
          >
            {step === 0 && examplePhase === "guess" && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}

            <Maximize2 size={48} className="mb-4" />
            <span className="text-xl font-bold">5TH</span>
          </button>
        </div>
      </div>
    </ExerciseLayout>
  );
}
