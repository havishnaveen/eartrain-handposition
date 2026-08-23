import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, Home, ArrowUpRight } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getNotesForHandShape, LEAP_ROOTS, getUniqueQuestion } from "@/lib/musicHelpers";
import { NeighborhoodVisual } from "./NeighborhoodVisual";

const ANCHORS = [
  { note: "C4", octave: 4 },
  { note: "G4", octave: 4 }
];

// Different melodic shapes so it doesn't sound the same every time
const TRIAD_PATTERNS = [
  [0, 2, 4],       // Arpeggio up: C-E-G
  [4, 2, 0],       // Arpeggio down: G-E-C
  [0, 1, 2, 3, 4], // Scale up
  [0, 2, 4, 2, 0], // Up-down arpeggio
  [0, 1, 2, 1, 0], // Small hill
];

interface Props {
  onComplete: () => void;
}

export function NeighborhoodLeapExercise({ onComplete }: Props) {
  const [anchor, setAnchor] = useState(ANCHORS[0]);
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{root: string, patternIndex: number}[]>([]);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_neighborhood-leap') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'guess' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_neighborhood-leap') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const generateMelody = (nextStep: number) => {
    let randomAnchor;
    let patternIndex;
    
    if (nextStep === 0) {
      randomAnchor = "G4"; // Example: leap to G4
      patternIndex = 0; // The first pattern is [0, 2, 4]
      setHistory([{ root: "G4", patternIndex: 0 }]);
    } else {
      const OPTIONS = LEAP_ROOTS.flatMap(r => TRIAD_PATTERNS.map((_, i) => ({ root: r, patternIndex: i })));
      const chosen = getUniqueQuestion(OPTIONS, history, (a, b) => a.root === b.root && a.patternIndex === b.patternIndex);
      randomAnchor = chosen.root;
      patternIndex = chosen.patternIndex;
      setHistory(prev => [...prev, chosen]);
    }
    setAnchor({ note: randomAnchor, octave: parseInt(randomAnchor.slice(-1)) });
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    const pattern = TRIAD_PATTERNS[patternIndex];
    const handNotes = getNotesForHandShape(randomAnchor, true);
    setMelody(pattern.map(i => handNotes[i]));
  };

  useEffect(() => {
    generateMelody(step);
  }, []);

  const play = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setCursorIndex(-1);
    
    // Play Reference Chord (C Major block)
    await playSequenceWithUI([{ notes: [{note: "C4", octave: 4}, {note: "E4", octave: 4}, {note: "G4", octave: 4}], duration: 1.0, gapAfter: 0.5 }], () => {});
    
    const session = getAudioSession();
    for (let i = 0; i < melody.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(i);
      const ev: SequenceEvent = {
        notes: [melody[i]],
        duration: 0.4,
        gapAfter: 0.05
      };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') {
      setExamplePhase('guess');
    }
  };

  const handleGuess = (guessedNote: string) => {
    if (guessedNote === anchor.note) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_neighborhood-leap', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateMelody(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 4: C and G Leaps"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="First you'll hear a C Major chord (the Orange Zone). Then a melody plays. Is it in the Orange Zone, or did it jump up to the Blue Zone (G Major)?"
      practiceInstruction="Listen to the C Major reference chord, then the melody. Did it stay in the Orange Zone, or jump up to the Blue Zone?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="neighborhood-leap"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="w-full mb-8 relative z-50">
        {step === 0 && <NeighborhoodVisual />}
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
            Hint: G Major sounds higher and brighter than C!
          </motion.div>
        )}

        {feedback === "none" && (
          <div className="flex gap-4 w-full">
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess("C4")} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-orange-500 text-white font-black text-xl rounded-2xl hover:bg-orange-600 active:scale-95 transition-all shadow-xl border-b-4 border-orange-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><Home className="w-6 h-6" /> C MAJOR</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Stayed Home)</span>
              </button>
            </div>
            <div className={`relative flex-1 ${examplePhase === 'guess' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'guess' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess("G4")} 
                className={`relative ${step === 0 && examplePhase === 'guess' ? 'z-50' : 'z-10'} w-full py-4 bg-blue-500 text-white font-black text-xl rounded-2xl hover:bg-blue-600 active:scale-95 transition-all shadow-xl border-b-4 border-blue-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><ArrowUpRight className="w-6 h-6" /> G MAJOR</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Leaped Up)</span>
              </button>
            </div>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-full max-w-sm relative z-50">
            <p className="text-red-500 font-bold text-lg text-center">Not quite! Listen again — did the melody stay in the low C neighborhood, or jump up to the higher G neighborhood?</p>
            <button onClick={() => setFeedback("none")} className="w-full py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </div>
    </ExerciseLayout>
  );
}
