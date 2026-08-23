import { useState, useEffect } from "react";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, Navigation, AlertTriangle } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { SolfegeReferenceChart } from "./SolfegeReferenceChart";
import { getUniqueQuestion } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

const SUBMEDIANT = [
  [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "A", octave: 4 }],
  [{ note: "G", octave: 4 }, { note: "A", octave: 4 }],
  [{ note: "E", octave: 4 }, { note: "A", octave: 4 }],
  [{ note: "C", octave: 5 }, { note: "A", octave: 4 }],
];

const LEADING_TONE = [
  [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
  [{ note: "C", octave: 5 }, { note: "B", octave: 4 }],
  [{ note: "G", octave: 4 }, { note: "B", octave: 4 }],
  [{ note: "A", octave: 4 }, { note: "B", octave: 4 }],
];

type QuestionType = "submediant" | "leading_tone";

function MiniStaff({ note, label, isTarget }: { note: number, label: string, isTarget: boolean }) {
  return (
    <div className={`flex flex-col items-center p-4 rounded-2xl transition-all ${isTarget ? 'bg-slate-100 scale-100 shadow-[0_0_25px_rgba(59,130,246,0.5)] ring-4 ring-blue-500' : 'bg-slate-200 scale-95 opacity-80 border-4 border-slate-400'}`}>
      <span className={`font-black text-lg mb-2 tracking-wide ${isTarget ? 'text-blue-600' : 'text-slate-600'}`}>{label}</span>
      <svg width="80" height="90" viewBox="0 0 80 90" className="overflow-visible">
        {/* Treble lines */}
        {[10, 20, 30, 40, 50].map(y => (
          <line key={y} x1="0" y1={y} x2="80" y2={y} stroke="#000000" strokeWidth="1.5" />
        ))}
        {/* Ledger line if note is 60 (C4) */}
        {note >= 60 && <line x1="25" y1="60" x2="55" y2="60" stroke="#000000" strokeWidth="2" />}
        <ellipse cx="40" cy={note} rx="7" ry="5" transform={`rotate(-15 40 ${note})`} fill="#000000" />
        <line x1="46" y1={note} x2="46" y2={note - 35} stroke="#000000" strokeWidth="2" />
      </svg>
    </div>
  );
}

function DegreeCompareVisual({ targetType }: { targetType: QuestionType }) {
  return (
    <div className="flex flex-col gap-4 w-full p-6 bg-slate-800 rounded-2xl my-4 text-white shadow-xl border border-slate-700">
      <div className="text-center mb-2">
        <h3 className="text-2xl font-bold text-orange-400 mb-2">VI vs VII</h3>
        <p className="text-slate-300">These degrees sit right at the top of the scale before the octave.</p>
      </div>
      
      <SolfegeReferenceChart />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Submediant */}
        <div className={`flex flex-col items-center bg-slate-700/50 p-4 rounded-xl border-2 flex-1 relative ${targetType === "submediant" ? "border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]" : "border-slate-600"}`}>
          <h4 className="font-bold text-lg mb-2 text-cyan-400">Submediant (VI) - La</h4>
          <MiniStaff note={35} label="A" isTarget={targetType === "submediant"} />
          <p className="text-sm text-slate-300 text-center font-medium mt-4">The 6th degree.<br/>A colorful, floating tone.</p>
        </div>

        {/* Leading Tone */}
        <div className={`flex flex-col items-center bg-slate-700/50 p-4 rounded-xl border-2 flex-1 relative ${targetType === "leading_tone" ? "border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "border-slate-600"}`}>
          <h4 className="font-bold text-lg mb-2 text-rose-400">Leading Tone (VII) - Ti</h4>
          <MiniStaff note={30} label="B" isTarget={targetType === "leading_tone"} />
          <p className="text-sm text-slate-300 text-center font-medium mt-4">The 7th degree.<br/>Creates massive tension pulling to the octave.</p>
        </div>
      </div>
    </div>
  );
}

export function Degrees67Exercise({ onComplete }: Props) {
  const [targetType, setTargetType] = useState<QuestionType>("submediant");
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{type: QuestionType, melody: typeof melody}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_degrees67') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_degrees67') ? 'none' : 'play';
  });

  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    let type: QuestionType = Math.random() > 0.5 ? "submediant" : "leading_tone";
    if (nextStep === 0) type = "leading_tone"; // Example is Leading Tone
    
    const pool = type === "submediant" ? SUBMEDIANT : LEADING_TONE;
    
    const nextMelody = getUniqueQuestion(pool, history.filter(h => h.type === type).map(h => h.melody), (a, b) => 
      a.length === b.length && a.every((n, i) => n.note === b[i].note && n.octave === b[i].octave)
    );
    
    if (nextStep === 0) {
      setMelody(LEADING_TONE[1]); // Force C5-B4 for example
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
      localStorage.setItem('et_v3_seen_example_degrees67', 'true');
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
      title="Lesson 20: VI, VII"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Listen to the melody. It lands on the Leading Tone (VII), or 'Ti'."
      practiceInstruction="Which scale degree does the phrase land on?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="degrees67"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-4xl mx-auto mt-8">
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8  border border-slate-700/50 relative">
          <MusicStaff 
            notes={melody} 
            cursorIndex={cursorIndex} 
            highlightRange={melody.length > 1 ? [melody.length - 1, melody.length - 1] : null}
          />
          
          <div className="flex justify-center mt-8">
            <WalkthroughFocus isActive={step === 0 && examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button
                onClick={play}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700"
              >
                <Play className={isPlaying ? "animate-pulse" : "w-6 h-6 fill-current"} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY PHRASE"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {feedback === "error" && <DegreeCompareVisual targetType={targetType} />}

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 w-full relative ${step === 0 && examplePhase === "guess" ? "z-50" : "z-10"}`}>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("submediant")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative w-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all
                ${feedback === "success" && targetType === "submediant" 
                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400" 
                  : feedback === "error" && targetType !== "submediant"
                  ? "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <Navigation size={32} className="mb-2" />
              <span className="text-lg font-bold">SUBMEDIANT (VI) / La</span>
            </button>
          </WalkthroughFocus>
          
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("leading_tone")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative w-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all
                ${feedback === "success" && targetType === "leading_tone" 
                  ? "bg-rose-500/20 border-rose-500 text-rose-400" 
                  : feedback === "error" && targetType !== "leading_tone"
                  ? "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <AlertTriangle size={32} className="mb-2" />
              <span className="text-lg font-bold">LEADING TONE (VII) / Ti</span>
            </button>
          </WalkthroughFocus>
        </div>
      </div>
    </ExerciseLayout>
  );
}
