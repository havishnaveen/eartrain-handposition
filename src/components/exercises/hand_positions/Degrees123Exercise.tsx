import { useState, useEffect } from "react";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, Home, TrendingUp, Music } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { SolfegeReferenceChart } from "./SolfegeReferenceChart";
import { getUniqueQuestion, transposeNoteObj } from "@/lib/musicHelpers";

const KEYS = [
  { name: 'C Major', semitones: 0 },
  { name: 'F Major', semitones: 5 },
  { name: 'G Major', semitones: 7 },
  { name: 'D Major', semitones: 2 },
];

interface Props {
  onComplete: () => void;
}

const TONIC = [
  [{ note: "C", octave: 4 }, { note: "D", octave: 4 }, { note: "E", octave: 4 }, { note: "C", octave: 4 }],
  [{ note: "E", octave: 4 }, { note: "D", octave: 4 }, { note: "C", octave: 4 }],
  [{ note: "G", octave: 4 }, { note: "E", octave: 4 }, { note: "C", octave: 4 }],
];

const SUPERTONIC = [
  [{ note: "C", octave: 4 }, { note: "D", octave: 4 }],
  [{ note: "E", octave: 4 }, { note: "D", octave: 4 }],
  [{ note: "G", octave: 4 }, { note: "F", octave: 4 }, { note: "D", octave: 4 }],
];

const MEDIANT = [
  [{ note: "C", octave: 4 }, { note: "D", octave: 4 }, { note: "E", octave: 4 }],
  [{ note: "G", octave: 4 }, { note: "F", octave: 4 }, { note: "E", octave: 4 }],
  [{ note: "C", octave: 4 }, { note: "E", octave: 4 }],
];

type QuestionType = "tonic" | "supertonic" | "mediant";

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
        <h3 className="text-2xl font-bold text-orange-400 mb-2">Scale Degrees Explained!</h3>
        <p className="text-slate-300">Each note in the scale has a formal name and a Solfege syllable (Do, Re, Mi).</p>
      </div>
      
      <SolfegeReferenceChart />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tonic */}
        <div className={`flex flex-col items-center bg-slate-700/50 p-4 rounded-xl border-2 flex-1 relative ${targetType === "tonic" ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]" : "border-slate-600"}`}>
          <h4 className="font-bold text-lg mb-2 text-blue-400">Tonic (I) - Do</h4>
          <MiniStaff note={60} label="C" isTarget={targetType === "tonic"} />
          <p className="text-sm text-slate-300 text-center font-medium mt-4">The home note.<br/>Stable and resolved.</p>
        </div>

        {/* Supertonic */}
        <div className={`flex flex-col items-center bg-slate-700/50 p-4 rounded-xl border-2 flex-1 relative ${targetType === "supertonic" ? "border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "border-slate-600"}`}>
          <h4 className="font-bold text-lg mb-2 text-purple-400">Supertonic (II) - Re</h4>
          <MiniStaff note={55} label="D" isTarget={targetType === "supertonic"} />
          <p className="text-sm text-slate-300 text-center font-medium mt-4">One step above Tonic.<br/>Wants to step down.</p>
        </div>

        {/* Mediant */}
        <div className={`flex flex-col items-center bg-slate-700/50 p-4 rounded-xl border-2 flex-1 relative ${targetType === "mediant" ? "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "border-slate-600"}`}>
          <h4 className="font-bold text-lg mb-2 text-amber-400">Mediant (III) - Mi</h4>
          <MiniStaff note={50} label="E" isTarget={targetType === "mediant"} />
          <p className="text-sm text-slate-300 text-center font-medium mt-4">Middle of the I chord.<br/>Sweet and peaceful.</p>
        </div>
      </div>
    </div>
  );
}

export function Degrees123Exercise({ onComplete }: Props) {
  const [targetType, setTargetType] = useState<QuestionType>("tonic");
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{type: QuestionType, melody: typeof melody}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_degrees123') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_degrees123') ? 'none' : 'play';
  });

  const [currentKey, setCurrentKey] = useState(KEYS[0]);
  const MAX_STEPS = 5;

  const generateQuestion = (nextStep: number) => {
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    const key = nextStep === 0 ? KEYS[0] : KEYS[Math.floor(Math.random() * KEYS.length)];
    setCurrentKey(key);
    
    let type: QuestionType = ["tonic", "supertonic", "mediant"][Math.floor(Math.random() * 3)] as QuestionType;
    if (nextStep === 0) type = "supertonic";
    
    const pool = type === "tonic" ? TONIC : type === "supertonic" ? SUPERTONIC : MEDIANT;
    const transposedPool = pool.map(m => m.map(n => transposeNoteObj(n, key.semitones)));
    
    const nextMelody = getUniqueQuestion(transposedPool, history.filter(h => h.type === type).map(h => h.melody), (a, b) => 
      a.length === b.length && a.every((n, i) => n.note === b[i].note && n.octave === b[i].octave)
    );
    
    if (nextStep === 0) {
      setMelody(transposedPool[0]); // Force C-D for example (transposed)
    } else {
      setMelody(nextMelody);
    }
    
    setTargetType(type);
  };

  useEffect(() => {
    generateQuestion(step);
  }, []);

  const playReference = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setCursorIndex(-1);
    const events: SequenceEvent[] = [
      { notes: [
        transposeNoteObj({note:'C',octave:4}, currentKey.semitones),
        transposeNoteObj({note:'E',octave:4}, currentKey.semitones),
        transposeNoteObj({note:'G',octave:4}, currentKey.semitones)
      ], duration: 1.5, gapAfter: 0.5 }
    ];
    await playSequenceWithUI(events, () => {});
    setIsPlaying(false);
  };

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
      localStorage.setItem('et_v3_seen_example_degrees123', 'true');
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
      title="Lesson 18: I, II, III"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Listen to the melody. It lands on the Supertonic (II), or 'Re'."
      practiceInstruction="Which scale degree does the phrase land on?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="degrees123"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-4xl mx-auto mt-8">
        <div className="flex w-full justify-between items-end mb-4 px-2">
          <div className="bg-slate-700/50 px-4 py-2 rounded-lg text-slate-200 font-bold tracking-widest text-lg uppercase shadow-sm border border-slate-600/50 flex items-center gap-2">
            <Music className="w-5 h-5 text-orange-400" />
            Key: {currentKey.name}
          </div>
        </div>
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8  border border-slate-700/50 relative">
          <MusicStaff 
            notes={melody} 
            cursorIndex={cursorIndex} 
            highlightRange={melody.length > 1 ? [melody.length - 1, melody.length - 1] : null}
            keySignature={currentKey.name}
          />
          
          <div className="flex justify-center mt-8 gap-4">
            <button 
              onClick={playReference}
              disabled={isPlaying}
              className="flex items-center gap-2 px-6 py-4 bg-slate-700 text-white font-bold text-lg rounded-full hover:bg-slate-600 active:scale-95 disabled:opacity-50 transition-all shadow-lg border-b-4 border-slate-900 relative z-50"
            >
              <Play className={isPlaying ? "animate-pulse" : ""} fill="currentColor" size={20} />
              KEY (I)
            </button>
            <WalkthroughFocus isActive={step === 0 && examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button
                onClick={play}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700 relative z-50"
              >
                <Play className={isPlaying ? "animate-pulse" : "w-6 h-6 fill-current"} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY PHRASE"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {feedback === "error" && <DegreeCompareVisual targetType={targetType} />}

        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 w-full relative ${step === 0 && examplePhase === "guess" ? "z-50" : "z-10"}`}>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("tonic")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative w-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all
                ${feedback === "success" && targetType === "tonic" 
                  ? "bg-blue-500/20 border-blue-500 text-blue-400" 
                  : feedback === "error" && targetType !== "tonic"
                  ? "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <Home size={32} className="mb-2" />
              <span className="text-lg font-bold">TONIC (I) / Do</span>
            </button>
          </WalkthroughFocus>
          
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("supertonic")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative w-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all
                ${feedback === "success" && targetType === "supertonic" 
                  ? "bg-purple-500/20 border-purple-500 text-purple-400" 
                  : feedback === "error" && targetType !== "supertonic"
                  ? "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <TrendingUp size={32} className="mb-2" />
              <span className="text-lg font-bold">SUPERTONIC (II) / Re</span>
            </button>
          </WalkthroughFocus>

          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => handleGuess("mediant")}
              disabled={isPlaying || feedback === "success" || (step === 0 && examplePhase === "play")}
              className={`relative w-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all
                ${feedback === "success" && targetType === "mediant" 
                  ? "bg-amber-500/20 border-amber-500 text-amber-400" 
                  : feedback === "error" && targetType !== "mediant"
                  ? "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <Music size={32} className="mb-2" />
              <span className="text-lg font-bold">MEDIANT (III) / Mi</span>
            </button>
          </WalkthroughFocus>
        </div>
      </div>
    </ExerciseLayout>
  );
}
