import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { MusicStaff } from "../../MusicStaff";
import { InteractiveKeyboard, HandShape, PIANO_KEYS_2_OCT } from "../../lessons/InteractiveKeyboard";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { Play, Check } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { MajorMinorCompareVisual } from "./MajorMinorCompareVisual";
import { motion } from "framer-motion";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getNotesForHandShape, getRandomMelodyPattern, VALID_ROOTS, getUniqueQuestion } from "@/lib/musicHelpers";

const MAJOR_OFFSETS = [0, 2, 4, 5, 7];
const ANCHORS = [
  { note: "C4", octave: 4 },
  { note: "G4", octave: 4 }
];

interface Props {
  onComplete: () => void;
}

export function MinorAdjustmentExercise({ onComplete }: Props) {
  const [anchor, setAnchor] = useState(ANCHORS[0]);
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<{root: string, isMajor: boolean}[]>([]);
  const [currentPattern, setCurrentPattern] = useState<number[]>([0,1,2,3,4]);
  const [shape, setShape] = useState<HandShape>({ rootNote: "C4", fingerOffsets: MAJOR_OFFSETS });
  const [targetIsMajor, setTargetIsMajor] = useState(true);
  const [feedback, setFeedback] = useState<"none" | "success" | "error_root" | "error_tonality">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_minor-adjustment') ? 1 : 0;
  });
  const [isPlayingComparison, setIsPlayingComparison] = useState(false);
  const [playingComparisonPhase, setPlayingComparisonPhase] = useState<'wrong' | 'right' | 'none'>('none');
  const [examplePhase, setExamplePhase] = useState<'play' | 'finger' | 'check' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_minor-adjustment') ? 'none' : 'play';
  });
  const MAX_STEPS = 5;

  const generateMelody = (nextStep: number) => {
    let randomAnchor, isMajor;
    if (nextStep === 0) {
      randomAnchor = "C4";
      isMajor = false; // Example: they have to make it minor
      setHistory([{ root: "C4", isMajor: false }]);
    } else {
      const OPTIONS = VALID_ROOTS.flatMap(r => [{ root: r, isMajor: true }, { root: r, isMajor: false }]);
      const chosen = getUniqueQuestion(OPTIONS, history, (a, b) => a.root === b.root && a.isMajor === b.isMajor);
      randomAnchor = chosen.root;
      isMajor = chosen.isMajor;
      setHistory(prev => [...prev, chosen]);
    }

    setAnchor({ note: randomAnchor, octave: parseInt(randomAnchor.slice(-1)) });
    setTargetIsMajor(isMajor);
    
    // Start them off on C4 with a MAJOR shape, so they have to drag to the correct anchor.
    // If it's the example, they start on C4 and the anchor is C4.
    setShape({ rootNote: "C4", fingerOffsets: MAJOR_OFFSETS });
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    const pattern = nextStep === 0 ? [0, 1, 2, 3, 4] : getRandomMelodyPattern();
    setCurrentPattern(pattern);
    const handNotes = getNotesForHandShape(randomAnchor, isMajor);
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
      setExamplePhase('finger');
    }
  };

  const handleLockIn = () => {
    if (shape.rootNote !== anchor.note) {
      setFeedback("error_root");
    } else {
      const isCurrentlyMajor = shape.fingerOffsets[2] === 4;
      if (isCurrentlyMajor === targetIsMajor) {
        setFeedback("success");
      } else {
        setFeedback("error_tonality");
      }
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_minor-adjustment', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateMelody(next);
    }
  };

  const playComparison = async () => {
    if (isPlayingComparison) return;
    setIsPlayingComparison(true);
    
    const getMelodyForMajor = (major: boolean) => {
      const handNotes = getNotesForHandShape(anchor.note, major);
      return currentPattern.map(i => handNotes[i]);
    };

    const wrongMelody = getMelodyForMajor(!targetIsMajor);
    const correctMelody = getMelodyForMajor(targetIsMajor);

    setPlayingComparisonPhase('wrong');
    let session = getAudioSession();
    for (let i = 0; i < wrongMelody.length; i++) {
      if (getAudioSession() !== session) break;
      await playSequenceWithUI([{ notes: [wrongMelody[i]], duration: 0.3, gapAfter: 0.05 }], () => {});
    }
    setPlayingComparisonPhase('none');
    
    await new Promise(r => setTimeout(r, 600));

    setPlayingComparisonPhase('right');
    session = getAudioSession();
    for (let i = 0; i < correctMelody.length; i++) {
      if (getAudioSession() !== session) break;
      await playSequenceWithUI([{ notes: [correctMelody[i]], duration: 0.3, gapAfter: 0.05 }], () => {});
    }

    setPlayingComparisonPhase('none');
    setIsPlayingComparison(false);
  };

  return (
    <ExerciseLayout
      title="Lesson 3: The Minor Adjustment"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Let's try an example! Listen to the melody. If it sounds sad (Minor), we have to click the 3rd finger to move it down a half-step."
      practiceInstruction="Listen to the melody! Find the starting note first. Then, if the melody sounds spooky or sad, click the 3rd finger to fix your hand position!"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="minor-adjustment"
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

      <div className={`w-full mb-12 relative ${examplePhase === 'finger' ? 'z-50' : 'z-10'}`}>
        <InteractiveKeyboard 
          shape={shape} 
          onChangeShape={(newShape) => {
            setShape(newShape);
            if (examplePhase === 'finger') setExamplePhase('check');
          }} 
          isLocked={feedback === "success"} 
          disableMove={examplePhase === 'finger'}
        />
      </div>

      <div className="flex flex-col items-center gap-4 min-h-[16rem] mt-4">
        {examplePhase === 'finger' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-blue-500 bg-blue-50 px-6 py-2 rounded-full mb-16 border border-blue-200">
            Hint: Does this sound Major or Minor? Toggle the 3rd finger if it's Minor!
          </motion.div>
        )}
        {examplePhase === 'check' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-blue-500 bg-blue-50 px-6 py-2 rounded-full mb-2 border border-blue-200">
            Notice how moving the 3rd finger down a half-step makes it sound sad (Minor)! Now click Check Answer.
          </motion.div>
        )}

        {feedback === "none" && (
          <div className={`relative ${examplePhase === 'check' ? 'z-50' : 'z-10'}`}>
            {examplePhase === 'check' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
            <button 
              onClick={handleLockIn} 
              className="px-12 py-4 bg-orange-500 text-white font-black text-xl rounded-2xl flex items-center justify-center gap-3 hover:bg-orange-600 active:scale-95 transition-all shadow-xl border-b-4 border-orange-700 whitespace-nowrap overflow-visible"
            >
              <Check className="w-8 h-8 stroke-[3]" /> CHECK ANSWER
            </button>
          </div>
        )}
        
        {feedback === "error_root" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-full max-w-sm relative z-50">
            <p className="text-red-500 font-bold text-lg text-center">
              Not quite! You are on the wrong starting note. Try moving it {
                PIANO_KEYS_2_OCT.findIndex(k => k.note === anchor.note) > PIANO_KEYS_2_OCT.findIndex(k => k.note === shape.rootNote)
                  ? "HIGHER (to the right)" 
                  : "LOWER (to the left)"
              }.
            </p>
            <button onClick={() => setFeedback("none")} className="w-full py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}

        {feedback === "error_tonality" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 w-full relative z-50">
            <MajorMinorCompareVisual 
              targetIsMajor={targetIsMajor} 
              onPlayComparison={playComparison} 
              isPlayingComparison={isPlayingComparison} 
              playingPhase={playingComparisonPhase}
            />
            <button onClick={() => {
              setFeedback("none");
              setShape({ rootNote: anchor.note, fingerOffsets: MAJOR_OFFSETS });
            }} className="w-full max-w-sm py-4 bg-stone-200 text-stone-700 font-black text-lg rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md mt-4 relative z-50">
              TRY AGAIN
            </button>
          </motion.div>
        )}

      </div>
    </ExerciseLayout>
  );
}
