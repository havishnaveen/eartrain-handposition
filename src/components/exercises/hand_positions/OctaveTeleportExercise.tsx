import { useState, useEffect } from "react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, ArrowRight, ArrowUpCircle } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

const LEAD_INS = [
  [{ note: "C4", octave: 4 }, { note: "D4", octave: 4 }, { note: "E4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "D4", octave: 4 }, { note: "C4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "A4", octave: 4 }, { note: "B4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "E4", octave: 4 }, { note: "F4", octave: 4 }],
];

const OCTAVES = [
  [{ note: "C4", octave: 4 }, { note: "C5", octave: 5 }],
  [{ note: "D4", octave: 4 }, { note: "D5", octave: 5 }],
  [{ note: "E4", octave: 4 }, { note: "E5", octave: 5 }],
  [{ note: "G4", octave: 4 }, { note: "G5", octave: 5 }],
];

const LEAPS = [
  [{ note: "C4", octave: 4 }, { note: "G4", octave: 4 }],
  [{ note: "D4", octave: 4 }, { note: "A4", octave: 4 }],
  [{ note: "E4", octave: 4 }, { note: "B4", octave: 4 }],
  [{ note: "G4", octave: 4 }, { note: "D5", octave: 5 }],
];

type QuestionType = "leap" | "octave";

function MiniStaff({ notes, label, isTarget }: { notes: number[], label: string, isTarget: boolean }) {
  return (
    <div className={`flex flex-col items-center p-6 rounded-2xl transition-all ${isTarget ? 'bg-slate-100 scale-100 shadow-[0_0_25px_rgba(59,130,246,0.5)] ring-4 ring-blue-500' : 'bg-slate-200 scale-90 opacity-60 border-4 border-slate-400'}`}>
      <span className={`font-black text-xl mb-6 tracking-wide ${isTarget ? 'text-blue-600' : 'text-slate-600'}`}>{label}</span>
      <svg width="140" height="110" viewBox="0 0 140 110" className="overflow-visible">
        {/* Highlight Box */}
        <rect x="25" y="10" width="90" height="90" fill={isTarget ? "#3b82f6" : "#64748b"} fillOpacity="0.2" rx="6" />
        
        {/* Treble lines */}
        {[20, 30, 40, 50, 60].map(y => (
          <line key={y} x1="0" y1={y} x2="140" y2={y} stroke="#000000" strokeWidth="1.5" />
        ))}
        
        {/* Note 1 (Always C4) */}
        <line x1="28" y1="70" x2="52" y2="70" stroke="#000000" strokeWidth="2" />
        <ellipse cx="40" cy="70" rx="7" ry="5" transform="rotate(-15 40 70)" fill="#000000" />
        <line x1="46" y1="70" x2="46" y2="35" stroke="#000000" strokeWidth="2" />
        
        {/* Note 2 */}
        <ellipse cx="100" cy={notes[1]} rx="7" ry="5" transform={`rotate(-15 100 ${notes[1]})`} fill="#000000" />
        {notes[1] < 45 ? (
          <line x1="94" y1={notes[1]} x2="94" y2={notes[1] + 35} stroke="#000000" strokeWidth="2" />
        ) : (
          <line x1="106" y1={notes[1]} x2="106" y2={notes[1] - 35} stroke="#000000" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

function OctaveTeleportVisual({ targetType }: { targetType: QuestionType }) {
  const isTargetOctave = targetType === "octave";
  
  return (
    <div className="flex flex-col items-center p-8 bg-slate-900 border-2 border-red-500/30 rounded-2xl my-4 w-full shadow-lg">
      <div className="text-red-400 font-bold text-2xl mb-4">
        Not quite!
      </div>
      <p className="text-slate-300 text-center max-w-lg mb-8 leading-relaxed text-lg">
        Compare the visual distance. The <strong>Octave</strong> spans a much wider gap than a <strong>Melodic Leap</strong> because it lands on the exact same pitch class, one full 8-note scale apart.
      </p>
      
      <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-center">
        <MiniStaff notes={[70, 35]} label="Octave (8th)" isTarget={isTargetOctave} />
        <MiniStaff notes={[70, 50]} label="Melodic Leap" isTarget={!isTargetOctave} />
      </div>
    </div>
  );
}

export function OctaveTeleportExercise({ onComplete }: Props) {
  const [targetType, setTargetType] = useState<QuestionType>("octave");
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{type: QuestionType, melody: typeof melody}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_octave-teleport') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_octave-teleport') ? 'none' : 'play';
  });

  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    let type: QuestionType = Math.random() > 0.5 ? "leap" : "octave";
    if (nextStep === 0) type = "octave";
    
    const leadIn = LEAD_INS[Math.floor(Math.random() * LEAD_INS.length)];
    const pool = type === "octave" ? OCTAVES : LEAPS;
    
    const pair = getUniqueQuestion(pool, history.filter(h => h.type === type).map(h => [h.melody[3], h.melody[4]]), (a, b) => 
      a[0].note === b[0].note && a[0].octave === b[0].octave
    );
    
    if (nextStep === 0) {
      setMelody([...LEAD_INS[0], ...OCTAVES[0]]); // C D E + C4 C5
    } else {
      setMelody([...leadIn, ...pair]);
    }
    
    setTargetType(type);
  };

  useEffect(() => {
    generateQuestion(step);
  }, []);

  const play = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setCursorIndex(0);
    
    const events: SequenceEvent[] = melody.map((n) => {
      return { notes: [n], duration: 0.5, gapAfter: 0.05 };
    });
    
    let noteCount = 0;
    await playSequenceWithUI(events, (notes) => {
      if (notes.length > 0) {
        setCursorIndex(noteCount);
        noteCount++;
      }
    });
    
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
      localStorage.setItem('et_v3_seen_example_octave-teleport', 'true');
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
      title="Lesson 13: Octave (8th)"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="That's an Octave (8th)! The same pitch class, one register higher."
      practiceInstruction="Did the melody end with a melodic leap or an Octave (8th)?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="octave-teleport"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto mt-8">
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8  border border-slate-700/50 relative">
          <MusicStaff 
            notes={melody} 
            cursorIndex={cursorIndex} 
            highlightRange={melody.length > 1 ? [melody.length - 2, melody.length - 1] : null}
          />
          
          <div className="flex justify-center mt-8">
            <WalkthroughFocus isActive={step === 0 && examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button
                onClick={play}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700 relative z-50"
              >
                <Play className={isPlaying ? "animate-pulse" : ""} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY MELODY"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {feedback === "error" && <OctaveTeleportVisual targetType={targetType} />}

        <div className="grid grid-cols-2 gap-6 w-full relative z-50">
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("leap")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && targetType === "leap" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && targetType === "octave"
                  ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <ArrowRight size={48} className="mb-4" />
              <span className="text-xl font-bold">MELODIC LEAP</span>
            </button>
          </WalkthroughFocus>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("octave")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && targetType === "octave" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && targetType === "leap"
                  ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <ArrowUpCircle size={48} className="mb-4" />
              <span className="text-xl font-bold">OCTAVE (8TH)</span>
            </button>
          </WalkthroughFocus>
        </div>
      </div>
    </ExerciseLayout>
  );
}
