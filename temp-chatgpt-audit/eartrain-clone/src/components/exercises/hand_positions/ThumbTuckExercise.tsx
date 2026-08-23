import { useState, useEffect } from "react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, Hand, RotateCcw } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];

function buildScale(root: string, octave: number, count: number) {
  const notes: {note: string, octave: number, fingering?: number}[] = [];
  const fingerings = count === 8 ? [1, 2, 3, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
  let idx = CHROMATIC.indexOf(root);
  let oct = octave;
  for (let i = 0; i < count; i++) {
    notes.push({ note: `${CHROMATIC[idx]}${oct}`, octave: oct, fingering: fingerings[i] });
    if (i < count - 1) { 
      idx += MAJOR_STEPS[i % 7]; 
      if (idx >= 12) { 
        idx -= 12; 
        oct++; 
      } 
    }
  }
  return notes;
}

const HAND_RUNS = [
  buildScale("C", 4, 5),
  buildScale("G", 4, 5),
  buildScale("F", 4, 5),
];

const TUCK_RUNS = [
  buildScale("C", 4, 8),
  buildScale("G", 4, 8),
  buildScale("F", 4, 8),
];

type QuestionType = "hand" | "tuck";

function MiniStaff({ count, label, isTarget }: { count: number, label: string, isTarget: boolean }) {
  return (
    <div className={`flex flex-col items-center p-6 rounded-2xl transition-all ${isTarget ? 'bg-slate-100 scale-100 shadow-[0_0_25px_rgba(59,130,246,0.5)] ring-4 ring-blue-500' : 'bg-slate-200 scale-90 opacity-60 border-4 border-slate-400'}`}>
      <span className={`font-black text-xl mb-6 tracking-wide ${isTarget ? 'text-blue-600' : 'text-slate-600'}`}>{label}</span>
      <svg width="200" height="110" viewBox="0 0 200 110" className="overflow-visible">
        {/* Treble lines */}
        {[20, 30, 40, 50, 60].map(y => (
          <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="#000000" strokeWidth="1.5" />
        ))}
        {Array.from({ length: count }).map((_, i) => {
          const cx = 20 + i * (160 / (count - 1));
          const cy = 70 - i * 5;
          const fingering = count === 8 ? [1, 2, 3, 1, 2, 3, 4, 5][i] : [1, 2, 3, 4, 5][i];
          const isTuck = count === 8 && i === 3;
          return (
            <g key={i}>
              <text x={cx} y={cy - 35} textAnchor="middle" fontSize={isTuck ? "18" : "16"} fontWeight="900" fill={isTuck ? "#3b82f6" : "#64748b"}>{fingering}</text>
              {cy >= 70 && <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke="#000000" strokeWidth="2" />}
              <ellipse cx={cx} cy={cy} rx="6.5" ry="4.5" transform={`rotate(-15 ${cx} ${cy})`} fill="#000000" />
              <line x1={cx + 6} y1={cy} x2={cx + 6} y2={cy - 30} stroke="#000000" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TuckDiagram({ targetType }: { targetType: QuestionType }) {
  const isTargetTuck = targetType === "tuck";
  return (
    <div className="flex flex-col items-center p-8 bg-slate-900 border-2 border-red-500/30 rounded-2xl my-4 w-full shadow-lg">
      <div className="text-red-400 font-bold text-2xl mb-4">
        Not quite!
      </div>
      <p className="text-slate-300 text-center max-w-lg mb-8 leading-relaxed text-lg">
        Listen to how the scale behaves. A <strong>Stationary Run</strong> stays within a single hand position. A <strong>Tuck & Cross</strong> uses the thumb to smoothly shift positions and continue the scale further.
      </p>
      
      <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-center">
        <MiniStaff count={8} label="Tucks to Continue" isTarget={isTargetTuck} />
        <MiniStaff count={5} label="Stays in Position" isTarget={!isTargetTuck} />
      </div>
    </div>
  );
}

export function ThumbTuckExercise({ onComplete }: Props) {
  const [targetType, setTargetType] = useState<QuestionType>("tuck");
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{type: QuestionType, root: string}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_thumb-tuck') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_thumb-tuck') ? 'none' : 'play';
  });

  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    let type: QuestionType = Math.random() > 0.5 ? "hand" : "tuck";
    if (nextStep === 0) type = "tuck";
    
    const pool = type === "hand" ? HAND_RUNS : TUCK_RUNS;
    
    const nextMelody = getUniqueQuestion(pool, history.filter(h => h.type === type).map(h => pool.find(p => p[0].note === h.root) || pool[0]), (a, b) => 
      a[0].note === b[0].note && a[0].octave === b[0].octave
    );
    
    if (nextStep === 0) {
      setMelody(TUCK_RUNS[0]); // C major scale
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
    setCursorIndex(0);
    
    const events: SequenceEvent[] = melody.map((n) => ({
      notes: [n], duration: 0.3, gapAfter: 0.05
    }));
    
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
      localStorage.setItem('et_v3_seen_example_thumb-tuck', 'true');
    }
    const next = step + 1;
    if (next > MAX_STEPS) {
      onComplete();
    } else {
      setHistory(prev => [...prev, { type: targetType, root: melody[0].note }]);
      setStep(next);
      generateQuestion(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 14: Tuck & Cross"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="That was a Tuck & Cross! The thumb passes under to extend the scale."
      practiceInstruction="Did the melody stay within a Hand Run, or utilize a Tuck & Cross?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="thumb-tuck"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto mt-8">
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8  border border-slate-700/50 relative overflow-x-auto">
          <MusicStaff 
            notes={melody} 
            cursorIndex={cursorIndex} 
          />
          
          <div className="flex justify-center mt-8">
            <WalkthroughFocus isActive={step === 0 && examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button
                onClick={play}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700 relative z-50"
              >
                <Play className={isPlaying ? "animate-pulse" : ""} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY SCALE RUN"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {feedback === "error" && <TuckDiagram targetType={targetType} />}

        <div className={`grid grid-cols-2 gap-6 w-full ${feedback === 'none' ? 'relative z-50' : 'relative z-10'}`}>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("hand")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && targetType === "hand" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && targetType === "tuck"
                  ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <Hand size={48} className="mb-4" />
              <span className="text-xl font-bold">STAYS IN POSITION</span>
            </button>
          </WalkthroughFocus>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("tuck")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && targetType === "tuck" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && targetType === "hand"
                  ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <RotateCcw size={48} className="mb-4" />
              <span className="text-xl font-bold">TUCKS TO CONTINUE</span>
            </button>
          </WalkthroughFocus>
        </div>
      </div>
    </ExerciseLayout>
  );
}
