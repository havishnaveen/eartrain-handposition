import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { MusicStaff } from "../../MusicStaff";
import { InteractiveKeyboard, HandShape } from "../../lessons/InteractiveKeyboard";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { Play, Check } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getNotesForHandShape, getRandomMelodyPattern, VALID_ROOTS, getUniqueQuestion } from "@/lib/musicHelpers";

const MAJOR_OFFSETS = [0, 2, 4, 5, 7];
const ANCHORS = [
  { note: "C4", octave: 4 },
  { note: "G4", octave: 4 },
  { note: "F4", octave: 4 }
];

interface Props {
  onComplete: () => void;
}

export function MajorAnchorExercise({ onComplete }: Props) {
  const [anchor, setAnchor] = useState(ANCHORS[0]);
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [shape, setShape] = useState<HandShape>({ rootNote: "C4", fingerOffsets: MAJOR_OFFSETS });
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_major-anchor') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'drag' | 'check' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_major-anchor') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const generateMelody = (nextStep: number) => {
    let randomAnchor: string;
    if (nextStep === 0) {
      randomAnchor = "G4"; // Example is always G4
      setHistory(["G4"]);
    } else {
      randomAnchor = getUniqueQuestion(VALID_ROOTS, history);
      setHistory(prev => [...prev, randomAnchor]);
    }

    setAnchor({ note: randomAnchor, octave: parseInt(randomAnchor.slice(-1)) });
    setShape({ rootNote: "C4", fingerOffsets: MAJOR_OFFSETS });
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    const pattern = nextStep === 0 ? [0, 1, 2, 3, 4] : getRandomMelodyPattern();
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
    
    const session = getAudioSession();
    for (let i = 0; i < melody.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(i);
      const ev: SequenceEvent = {
        notes: [melody[i]],
        duration: 0.5,
        gapAfter: 0.05
      };
      await playSequenceWithUI([ev], () => {});
    }
    setCursorIndex(null);
    setIsPlaying(false);
    if (step === 0 && examplePhase === 'play') {
      setExamplePhase('drag');
    }
  };

  const handleLockIn = () => {
    if (shape.rootNote === anchor.note) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_major-anchor', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateMelody(next);
    }
  };

  const getNoteName = () => {
    // Format note like "G4" into friendly "G (octave 4)"
    const letter = anchor.note.replace(/[0-9]/g, '');
    const oct = anchor.note.slice(-1);
    return { letter, octave: oct, full: anchor.note };
  };

  return (
    <ExerciseLayout
      title="Lesson 2: The Major Anchor"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Let's try an example! Listen to the melody. Your whole hand needs to move to start on the correct first note."
      practiceInstruction="Listen to the melody. Can you drag the orange hand block to match the very first note you heard?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="major-anchor"
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

      <div className={`w-full mb-12 relative ${examplePhase === 'drag' || examplePhase === 'check' ? 'z-50' : 'z-20'}`}>
        <InteractiveKeyboard 
          shape={shape} 
          onChangeShape={(newShape) => {
            setShape(newShape);
            if (examplePhase === 'drag') setExamplePhase('check');
          }} 
          isLocked={feedback === "success"}
          pointAtDragHandle={examplePhase === 'drag'}
        />
      </div>

      <div className="flex flex-col items-center gap-4 min-h-[16rem] mt-4">
        {examplePhase === 'drag' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-blue-500 bg-blue-50 px-6 py-2 rounded-full mb-16 border border-blue-200">
            Hint: Drag the orange block to the correct starting note!
          </motion.div>
        )}
        {examplePhase === 'check' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-blue-500 bg-blue-50 px-6 py-2 rounded-full mb-2 border border-blue-200">
            Great! Now click Check Answer.
          </motion.div>
        )}
        
        {feedback === "none" && (
          <div className={`relative ${examplePhase === 'check' ? 'z-50' : 'z-10'}`}>
            {(examplePhase === 'check' || (examplePhase === 'drag' && shape.rootNote === anchor.note)) && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
            <button 
              onClick={handleLockIn} 
              className="px-12 py-4 bg-orange-500 text-white font-black text-xl rounded-2xl flex items-center justify-center gap-3 hover:bg-orange-600 active:scale-95 transition-all shadow-xl border-b-4 border-orange-700 whitespace-nowrap overflow-visible"
            >
              <Check className="w-8 h-8 stroke-[3]" /> CHECK ANSWER
            </button>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 w-full max-w-sm relative z-50">
            <p className="text-red-500 font-bold text-lg text-center">
              The starting note is <span className="font-black text-2xl text-red-600">{getNoteName().letter}</span> in octave <span className="font-black text-2xl text-red-600">{getNoteName().octave}</span>.
            </p>
            <p className="text-stone-600 dark:text-stone-400 font-bold text-base text-center">
              Move the orange block so the bottom note lines up with <span className="font-black text-orange-500">{getNoteName().full}</span>.
            </p>
            <button onClick={() => setFeedback("none")} className="w-full py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}

      </div>
    </ExerciseLayout>
  );
}
