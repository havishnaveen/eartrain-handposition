import { useState, useEffect, useCallback } from 'react';
import { ExerciseLayout } from './ExerciseLayout';
import { MusicStaff } from '../../MusicStaff';
import { WalkthroughFocus } from "./WalkthroughFocus";
import { playSequenceWithUI, SequenceEvent } from '@/lib/audio';
import { transposeNoteObj } from '@/lib/musicHelpers';
import { Home, ArrowLeft, ArrowRight, Play, Music } from 'lucide-react';

const MAX_STEPS = 5;
const STORAGE_KEY = 'et_v3_seen_example_triad_tracking';

type TriadType = 'I' | 'IV' | 'V';

type Question = {
  id: string;
  type: TriadType;
  notes: { note: string; octave: number }[];
};

const QUESTIONS: Question[] = [
  { id: 'chord-I', type: 'I', notes: [{note:'C4',octave:4},{note:'E4',octave:4},{note:'G4',octave:4},{note:'C4',octave:4}] },
  { id: 'chord-IV', type: 'IV', notes: [{note:'F4',octave:4},{note:'A4',octave:4},{note:'C5',octave:5},{note:'F4',octave:4}] },
  { id: 'chord-V', type: 'V', notes: [{note:'G4',octave:4},{note:'B4',octave:4},{note:'D5',octave:5},{note:'G4',octave:4}] },
];

const KEYS = [
  { name: 'C Major', semitones: 0 },
  { name: 'F Major', semitones: 5 },
  { name: 'G Major', semitones: 7 },
  { name: 'D Major', semitones: 2 },
];

function MiniStaff({ phrase, label, isTarget }: { phrase: number[], label: string, isTarget: boolean }) {
  return (
    <div className={`flex flex-col items-center p-4 rounded-2xl transition-all w-full flex-1 ${isTarget ? 'bg-slate-100 scale-100 shadow-[0_0_25px_rgba(59,130,246,0.5)] ring-4 ring-blue-500' : 'bg-slate-200 scale-95 opacity-60 border-4 border-slate-400'}`}>
      <span className={`font-black text-lg mb-4 tracking-wide ${isTarget ? 'text-blue-600' : 'text-slate-600'}`}>{label}</span>
      <svg width="120" height="110" viewBox="0 0 120 110" className="overflow-visible">
        {/* Treble lines */}
        {[20, 30, 40, 50, 60].map(y => (
          <line key={y} x1="0" y1={y} x2="120" y2={y} stroke="#000000" strokeWidth="1.5" />
        ))}
        {phrase.map((cy, i) => {
          const cx = 30 + i * 20;
          return (
            <g key={i}>
              {cy >= 70 && <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke="#000000" strokeWidth="2" />}
              {cy <= 10 && <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke="#000000" strokeWidth="2" />}
              <ellipse cx={cx} cy={cy} rx="6.5" ry="4.5" transform={`rotate(-15 ${cx} ${cy})`} fill="#000000" />
              <line x1={cx + 6} y1={cy} x2={cx + 6} y2={cy - 30} stroke="#000000" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TriadMapVisual = ({ correct }: { correct: TriadType }) => (
  <div className="flex flex-col items-center p-8 bg-slate-900 border-2 border-red-500/30 rounded-2xl my-4 w-full shadow-lg">
    <div className="text-red-400 font-bold text-2xl mb-4">
      Not quite!
    </div>
    <p className="text-slate-300 text-center max-w-lg mb-8 leading-relaxed text-lg">
      Listen to the root note of the chord. The <strong>I (Tonic)</strong> starts on the key center. <strong>IV (Subdominant)</strong> starts a Perfect 4th above the Tonic, and <strong>V (Dominant)</strong> starts a Perfect 5th above the Tonic.
    </p>
    
    <div className="flex flex-col md:flex-row gap-4 w-full justify-center items-center">
      <MiniStaff phrase={[70, 60, 50, 70]} label="I (Tonic)" isTarget={correct === 'I'} />
      <MiniStaff phrase={[55, 45, 35, 55]} label="IV (Sub)" isTarget={correct === 'IV'} />
      <MiniStaff phrase={[50, 40, 30, 50]} label="V (Dom)" isTarget={correct === 'V'} />
    </div>
  </div>
);

export function TriadTrackingExercise({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [currentKey, setCurrentKey] = useState(KEYS[0]);
  const [history, setHistory] = useState<Question[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [examplePhase, setExamplePhase] = useState<'none' | 'play' | 'guess'>(() => {
    const saved = localStorage.getItem('eartrain_triad-tracking_progress');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.step > 0) return 'none';
      } catch (e) {}
    }
    return 'play';
  });


  const [feedback, setFeedback] = useState('');
  const [showWrongVisual, setShowWrongVisual] = useState(false);

  const initStep = useCallback((isExample: boolean) => {
    const key = isExample ? KEYS[0] : KEYS[Math.floor(Math.random() * KEYS.length)];
    setCurrentKey(key);

    let baseQ: Question;
    if (isExample) {
      baseQ = QUESTIONS.find(q => q.id === 'chord-I')!;
    } else {
      const types: TriadType[] = ['I', 'IV', 'V'];
      const recentType = history.length > 0 ? history[history.length - 1].type : null;
      const choices = recentType ? types.filter(type => type !== recentType) : types;
      const nextType = choices[Math.floor(Math.random() * choices.length)];
      baseQ = QUESTIONS.find(q => q.type === nextType)!;
    }
    
    const nextQ: Question = {
      ...baseQ,
      notes: baseQ.notes.map(n => transposeNoteObj(n, key.semitones))
    };

    setHistory(prev => [...prev, nextQ]);
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

  const playReference = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setCursorIndex(-1);
    const events: SequenceEvent[] = [
      { notes: [
        transposeNoteObj({note:'C4',octave:4}, currentKey.semitones),
        transposeNoteObj({note:'E4',octave:4}, currentKey.semitones),
        transposeNoteObj({note:'G4',octave:4}, currentKey.semitones)
      ], duration: 1.5, gapAfter: 0.5 }
    ];
    await playSequenceWithUI(events, () => {});
    setIsPlaying(false);
  };

  const playQuestion = async () => {
    if (!question || isPlaying) return;
    if (step === 0 && examplePhase === 'play') setExamplePhase('guess');
    setIsPlaying(true);
    setCursorIndex(0);
    const events: SequenceEvent[] = [
      ...question.notes.map(n => ({ notes: [n], duration: 0.5, gapAfter: 0 })),
      { notes: [], duration: 0.5, gapAfter: 0.5 }
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
      localStorage.setItem('et_v3_seen_example_triad-tracking', 'true');
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
      setShowWrongVisual(true);
    }
  };

  if (!question) return null;

  return (
    <ExerciseLayout
      title="Lesson 17: Triad Progressions"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Listen to this arpeggiated triad. It establishes the Tonic (I) chord."
      practiceInstruction="Which harmonic function did you hear?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete || (() => {})}
      storageKeyId="triad-tracking"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="flex flex-col items-center w-full max-w-3xl mx-auto space-y-8">
        <div className="flex w-full justify-between items-end mb-4 px-2">
          <div className="bg-slate-700/50 px-4 py-2 rounded-lg text-slate-200 font-bold tracking-widest text-lg uppercase shadow-sm border border-slate-600/50 flex items-center gap-2">
            <Music className="w-5 h-5 text-orange-400" />
            Key: {currentKey.name}
          </div>
        </div>
        <div className="w-full bg-slate-800/50 rounded-2xl p-8 mb-8 border border-slate-700/50 relative overflow-x-auto min-h-[200px] flex flex-col items-center justify-center">
          <MusicStaff 
            notes={question.notes} 
            cursorIndex={cursorIndex}
            keySignature={currentKey.name}
          />
          
          <div className="flex justify-center mt-8 w-full gap-4">
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
                onClick={playQuestion}
                disabled={isPlaying}
                className="flex items-center gap-3 px-10 py-4 bg-orange-500 text-white font-black text-xl rounded-full hover:bg-orange-600 active:scale-95 disabled:opacity-50 transition-all shadow-xl border-b-4 border-orange-700 relative z-50"
              >
                <Play className={isPlaying ? "animate-pulse" : ""} fill="currentColor" />
                {isPlaying ? "PLAYING..." : "PLAY CHORD"}
              </button>
            </WalkthroughFocus>
          </div>
        </div>

        {showWrongVisual && <TriadMapVisual correct={question.type} />}

        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 w-full ${feedback === 'none' ? 'relative z-50' : 'relative z-10'}`}>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => handleAnswer('IV')}
              disabled={isPlaying || feedback === 'success' || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && question.type === "IV" 
                  ? "bg-green-500/20 border-green-500 text-green-400" 
                  : feedback === "error" && question.type !== "IV"
                  ? "bg-slate-800/50 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <ArrowLeft className="w-12 h-12 mb-4" />
              <span className="text-xl font-bold">IV (SUBDOMINANT)</span>
            </button>
          </WalkthroughFocus>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => handleAnswer('I')}
              disabled={isPlaying || feedback === 'success' || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && question.type === "I" 
                  ? "bg-blue-500/20 border-blue-500 text-blue-400" 
                  : feedback === "error" && question.type !== "I"
                  ? "bg-slate-800/50 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <Home className="w-12 h-12 mb-4" />
              <span className="text-xl font-bold">I (TONIC)</span>
            </button>
          </WalkthroughFocus>
          <WalkthroughFocus isActive={step === 0 && examplePhase === "guess"} pointerPosition="-top-12 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => handleAnswer('V')}
              disabled={isPlaying || feedback === 'success' || (step === 0 && examplePhase === "play")}
              className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 transition-all w-full
                ${feedback === "success" && question.type === "V" 
                  ? "bg-amber-500/20 border-amber-500 text-amber-400" 
                  : feedback === "error" && question.type !== "V"
                  ? "bg-slate-800/50 border-slate-700 text-slate-500 opacity-50"
                  : "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-500"}
              `}
            >
              <ArrowRight className="w-12 h-12 mb-4" />
              <span className="text-xl font-bold">V (DOMINANT)</span>
            </button>
          </WalkthroughFocus>
        </div>
      </div>
    </ExerciseLayout>
  );
}
