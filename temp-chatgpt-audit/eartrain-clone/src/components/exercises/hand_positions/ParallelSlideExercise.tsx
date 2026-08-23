import { useState, useEffect, useCallback } from 'react';
import { ExerciseLayout } from './ExerciseLayout';
import { MusicStaff } from '../../MusicStaff';
import { WalkthroughFocus } from "./WalkthroughFocus";
import { playSequenceWithUI, SequenceEvent } from '@/lib/audio';
import { getUniqueQuestion } from '@/lib/musicHelpers';
import { Home, MoveRight, Play } from 'lucide-react';

const MAX_STEPS = 5;
const STORAGE_KEY = 'et_v3_seen_example_parallel_slide';

type Question = {
  id: string;
  type: 'stay' | 'slide';
  phraseA: { note: string; octave: number }[];
  phraseB: { note: string; octave: number }[];
};

const QUESTIONS: Question[] = [
  { id: 'c-stay', type: 'stay', phraseA: [{note:'C4',octave:4},{note:'E4',octave:4},{note:'G4',octave:4},{note:'E4',octave:4}], phraseB: [{note:'C4',octave:4},{note:'E4',octave:4},{note:'G4',octave:4},{note:'E4',octave:4}] },
  { id: 'g-stay', type: 'stay', phraseA: [{note:'G4',octave:4},{note:'B4',octave:4},{note:'D5',octave:5},{note:'B4',octave:4}], phraseB: [{note:'G4',octave:4},{note:'B4',octave:4},{note:'D5',octave:5},{note:'B4',octave:4}] },
  { id: 'f-stay', type: 'stay', phraseA: [{note:'F4',octave:4},{note:'A4',octave:4},{note:'C5',octave:5},{note:'A4',octave:4}], phraseB: [{note:'F4',octave:4},{note:'A4',octave:4},{note:'C5',octave:5},{note:'A4',octave:4}] },
  { id: 'c-slide', type: 'slide', phraseA: [{note:'C4',octave:4},{note:'E4',octave:4},{note:'G4',octave:4},{note:'E4',octave:4}], phraseB: [{note:'D4',octave:4},{note:'F4',octave:4},{note:'A4',octave:4},{note:'F4',octave:4}] },
  { id: 'g-slide', type: 'slide', phraseA: [{note:'G4',octave:4},{note:'B4',octave:4},{note:'D5',octave:5},{note:'B4',octave:4}], phraseB: [{note:'A4',octave:4},{note:'C5',octave:5},{note:'E5',octave:5},{note:'C5',octave:5}] },
  { id: 'f-slide', type: 'slide', phraseA: [{note:'F4',octave:4},{note:'A4',octave:4},{note:'C5',octave:5},{note:'A4',octave:4}], phraseB: [{note:'G4',octave:4},{note:'B4',octave:4},{note:'D5',octave:5},{note:'B4',octave:4}] },
];

function MiniStaff({ notesList, label, isTarget }: { notesList: number[][], label: string, isTarget: boolean }) {
  return (
    <div className={`flex flex-col items-center p-6 rounded-2xl transition-all ${isTarget ? 'bg-slate-100 scale-100 shadow-[0_0_25px_rgba(59,130,246,0.5)] ring-4 ring-blue-500' : 'bg-slate-200 scale-90 opacity-60 border-4 border-slate-400'}`}>
      <span className={`font-black text-xl mb-6 tracking-wide ${isTarget ? 'text-blue-600' : 'text-slate-600'}`}>{label}</span>
      <svg width="220" height="110" viewBox="0 0 220 110" className="overflow-visible">
        {/* Treble lines */}
        {[20, 30, 40, 50, 60].map(y => (
          <line key={y} x1="0" y1={y} x2="220" y2={y} stroke="#000000" strokeWidth="1.5" />
        ))}
        {notesList.map((phrase, pIdx) => {
          return phrase.map((cy, i) => {
            const cx = 20 + pIdx * 110 + i * 20;
            return (
              <g key={`${pIdx}-${i}`}>
                {cy >= 70 && <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke="#000000" strokeWidth="2" />}
                <ellipse cx={cx} cy={cy} rx="6.5" ry="4.5" transform={`rotate(-15 ${cx} ${cy})`} fill="#000000" />
                <line x1={cx + 6} y1={cy} x2={cx + 6} y2={cy - 30} stroke="#000000" strokeWidth="2" />
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}

const SlideVisual = ({ targetType }: { targetType: 'stay' | 'slide' }) => {
  const isTargetSlide = targetType === "slide";
  return (
    <div className="flex flex-col items-center p-8 bg-slate-900 border-2 border-red-500/30 rounded-2xl my-4 w-full shadow-lg">
      <div className="text-red-400 font-bold text-2xl mb-4">
        Not quite!
      </div>
      <p className="text-slate-300 text-center max-w-lg mb-8 leading-relaxed text-lg">
        Listen to whether the second phrase shifts. A <strong>Stationary</strong> phrase repeats at the exact same pitch. A <strong>Parallel Shift</strong> moves the entire phrase up or down.
      </p>
      
      <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-center">
        <MiniStaff notesList={[[70, 60, 50, 60], [65, 55, 45, 55]]} label="Parallel Shift" isTarget={isTargetSlide} />
        <MiniStaff notesList={[[70, 60, 50, 60], [70, 60, 50, 60]]} label="Stationary" isTarget={!isTargetSlide} />
      </div>
    </div>
  );
};

export function ParallelSlideExercise({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [history, setHistory] = useState<Question[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [examplePhase, setExamplePhase] = useState<'none' | 'play' | 'guess'>(() => {
    const saved = localStorage.getItem('eartrain_parallel-slide_progress');
    if (saved) {
      try {
        const h = JSON.parse(saved);
        if (h.length > 0) return 'none';
      } catch (e) {}
    }
    return 'play';
  });
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);


  const [feedback, setFeedback] = useState('');
  const [showWrongVisual, setShowWrongVisual] = useState(false);

  const initStep = useCallback((isExample: boolean) => {
    let nextQ: Question;
    if (isExample) {
      nextQ = QUESTIONS.find(q => q.id === 'c-slide')!;
    } else {
      nextQ = getUniqueQuestion(QUESTIONS, history);
      setHistory(prev => [...prev, nextQ]);
    }
    setQuestion(nextQ);
    setFeedback('');
    setShowWrongVisual(false);
  }, [history]);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setStep(0);
      initStep(true);
    } else {
      setStep(1);
      initStep(false);
    }
  }, []);

  const playQuestion = async () => {
    if (!question || isPlaying) return;
    if (step === 0 && examplePhase === 'play') setExamplePhase('guess');
    setIsPlaying(true);
    setCursorIndex(0);
    const events: SequenceEvent[] = [
      ...question.phraseA.map(n => ({ notes: [n], duration: 0.5, gapAfter: 0 })),
      { notes: [], duration: 0.5, gapAfter: 0.5 },
      ...question.phraseB.map(n => ({ notes: [n], duration: 0.5, gapAfter: 0 }))
    ];
    let noteCount = 0;
    await playSequenceWithUI(events, (notes) => {
      if (notes.length > 0) {
        setCursorIndex(noteCount);
        noteCount++;
      }
    });
    setCursorIndex(null);
    setIsPlaying(false);
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_parallel-slide', 'true');
    }
    const next = step + 1;
    if (next > MAX_STEPS) {
      onComplete?.();
    } else {
      setStep(next);
      initStep(false);
    }
  };

  const handleAnswer = (answer: string) => {
    if (isPlaying || feedback === 'success') return;
    
    if (answer === question?.type) {
      setFeedback('success');
    } else {
      setFeedback('error');
      if (question?.type === 'slide') {
        setShowWrongVisual(true);
      }
    }
  };

  if (!question) return null;

  return (
    <ExerciseLayout
      title="Lesson 16: Parallel Shift"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Observe how the entire hand position shifts in parallel motion."
      practiceInstruction="Did the second phrase remain stationary or execute a Parallel Shift?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete || (() => {})}
      storageKeyId="parallel-slide"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto space-y-8">
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8 border border-slate-700/50 relative overflow-x-auto min-h-[200px] flex flex-col items-center justify-center">
          <MusicStaff 
            notes={[...question.phraseA, ...question.phraseB]} 
            cursorIndex={cursorIndex}
          />
          
          <div className="flex justify-center mt-8 w-full">
            <WalkthroughFocus isActive={step === 0 && examplePhase === "play"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
              <button 
                onClick={playQuestion}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700 relative z-50"
              >
                <Play className={isPlaying ? "animate-pulse" : ""} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY PHRASES"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {showWrongVisual && <SlideVisual targetType={question.type} />}

        <div className={`grid grid-cols-2 gap-6 w-full ${feedback === 'none' ? 'relative z-50' : 'relative z-10'}`}>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => handleAnswer('stay')}
              disabled={isPlaying || feedback === 'success' || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && question.type === "stay" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && question.type === "slide"
                  ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <Home className="w-12 h-12 mb-4" />
              <span className="text-xl font-bold">STATIONARY</span>
            </button>
          </WalkthroughFocus>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => handleAnswer('slide')}
              disabled={isPlaying || feedback === 'success' || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && question.type === "slide" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && question.type === "stay"
                  ? "bg-red-500/20 border-red-500 text-red-400 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <MoveRight className="w-12 h-12 mb-4" />
              <span className="text-xl font-bold">PARALLEL SHIFT</span>
            </button>
          </WalkthroughFocus>
        </div>
      </div>
    </ExerciseLayout>
  );
}
