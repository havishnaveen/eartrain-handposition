import { useState, useEffect } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { MusicStaff } from "../../MusicStaff";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { Play, Sun, Moon } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { MajorMinorCompareVisual } from "./MajorMinorCompareVisual";
import { motion } from "framer-motion";
import { WalkthroughFocus } from "./WalkthroughFocus";
import { getNotesForHandShape, getRandomMelodyPattern, VALID_ROOTS } from "@/lib/musicHelpers";

interface Props {
  onComplete: () => void;
}

export function MajorMinorIntroExercise({ onComplete }: Props) {
  const [anchor, setAnchor] = useState<{note: string, octave: number}>({note: "C4", octave: 4});
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [targetIsMajor, setTargetIsMajor] = useState(true);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [step, setStep] = useState(() => {
    return localStorage.getItem('et_v3_seen_example_major-minor-intro') ? 1 : 0;
  });
  const [examplePhase, setExamplePhase] = useState<'play' | 'major' | 'none'>(() => {
    return localStorage.getItem('et_v3_seen_example_major-minor-intro') ? 'none' : 'play';
  });
  const [melody, setMelody] = useState<{note: string, octave: number}[]>([]);
  const [isPlayingComparison, setIsPlayingComparison] = useState(false);
  const [playingComparisonPhase, setPlayingComparisonPhase] = useState<'wrong' | 'right' | 'none'>('none');
  const MAX_STEPS = 5;

  const generateMelody = (nextStep: number) => {
    let randomAnchor, isMajor;
    if (nextStep === 0) {
      randomAnchor = "C4";
      isMajor = true;
    } else {
      const choices = VALID_ROOTS.flatMap(note => [
        { note, isMajor: true },
        { note, isMajor: false },
      ]).filter(choice => (
        nextStep <= 1 || choice.note !== anchor.note || choice.isMajor !== targetIsMajor
      ));
      const choice = choices[Math.floor(Math.random() * choices.length)];
      randomAnchor = choice.note;
      isMajor = choice.isMajor;
    }

    setAnchor({ note: randomAnchor, octave: parseInt(randomAnchor.slice(-1)) });
    setTargetIsMajor(isMajor);
    setFeedback("none");
    setCursorIndex(null);
    setExamplePhase(nextStep === 0 ? 'play' : 'none');
    
    const pattern = nextStep === 0 ? [0, 1, 2, 3, 4] : getRandomMelodyPattern();
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
      setExamplePhase('major');
    }
  };

  const playComparison = async () => {
    if (isPlayingComparison) return;
    setIsPlayingComparison(true);
    
    const wrongIsMajor = !targetIsMajor;
    const getMelodyForMajor = (major: boolean) => {
      // In the comparison, we just play a straight 1-2-3-4-5 block to hear the difference clearly, 
      // or we can use the same generated pattern. Let's use the straight 5-finger ascending.
      const handNotes = getNotesForHandShape(anchor.note, major);
      return [0, 1, 2, 3, 4].map(i => handNotes[i]);
    };

    const wrongNotes = getMelodyForMajor(wrongIsMajor);
    const rightNotes = getMelodyForMajor(targetIsMajor);

    setMelody(wrongNotes);
    setPlayingComparisonPhase('wrong');
    let session = getAudioSession();
    for (let i = 0; i < wrongNotes.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(i);
      await playSequenceWithUI([{ notes: [wrongNotes[i]], duration: 0.3, gapAfter: 0.05 }], () => {});
    }
    setCursorIndex(null);
    setPlayingComparisonPhase('none');
    
    await new Promise(r => setTimeout(r, 600));

    setMelody(rightNotes);
    setPlayingComparisonPhase('right');
    session = getAudioSession();
    for (let i = 0; i < rightNotes.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(i);
      await playSequenceWithUI([{ notes: [rightNotes[i]], duration: 0.3, gapAfter: 0.05 }], () => {});
    }
    setCursorIndex(null);

    setPlayingComparisonPhase('none');
    setIsPlayingComparison(false);
  };

  const handleGuess = (guessedMajor: boolean) => {
    if (guessedMajor === targetIsMajor) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step === 0) {
      localStorage.setItem('et_v3_seen_example_major-minor-intro', 'true');
    }
    if (step < MAX_STEPS) {
      const next = step + 1;
      setStep(next);
      generateMelody(next);
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 1: Major vs Minor Basics"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="Let's try an example! Listen to the melody. Does it sound bright and happy (Major) or dark and spooky (Minor)?"
      practiceInstruction="Listen to the melody carefully. Does it sound happy (Major) or spooky (Minor)?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="major-minor-intro"
      showExampleOverlay={step === 0 && examplePhase !== "none"}
    >
      <div className="w-full mb-8">
        <MusicStaff notes={melody} cursorIndex={cursorIndex} />
        
        <div className="flex justify-center mt-8">
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
        {examplePhase === 'major' && feedback === 'none' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-bold text-blue-500 bg-blue-50 px-6 py-2 rounded-full mb-16 border border-blue-200">
            Hint: Choose Major or Minor.
          </motion.div>
        )}

        {feedback === "none" && (
          <div className="flex gap-4 w-full">
            <div className={`relative flex-1 ${examplePhase !== 'none' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'major' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(true)} 
                className={`relative ${step === 0 && examplePhase === 'major' && targetIsMajor === true ? 'z-50' : 'z-10'} w-full py-4 bg-orange-500 text-white font-black text-xl rounded-2xl hover:bg-orange-600 active:scale-95 transition-all shadow-xl border-b-4 border-orange-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><Sun className="w-6 h-6" /> MAJOR</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Happy)</span>
              </button>
            </div>
            <div className={`relative flex-1 ${examplePhase !== 'none' ? 'z-50' : 'z-10'}`}>
              {examplePhase === 'major' && <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />}
              <button 
                onClick={() => handleGuess(false)} 
                className={`relative ${step === 0 && examplePhase === 'major' && targetIsMajor === false ? 'z-50' : 'z-10'} w-full py-4 bg-blue-500 text-white font-black text-xl rounded-2xl hover:bg-blue-600 active:scale-95 transition-all shadow-xl border-b-4 border-blue-700 flex flex-col items-center justify-center gap-1`}
              >
                <div className="flex items-center gap-2"><Moon className="w-6 h-6" /> MINOR</div>
                <span className="text-sm opacity-80 uppercase tracking-widest">(Spooky)</span>
              </button>
            </div>
          </div>
        )}
        
        {feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 w-full relative z-50">
            <MajorMinorCompareVisual 
              targetIsMajor={targetIsMajor} 
              onPlayComparison={playComparison} 
              isPlayingComparison={isPlayingComparison} 
              playingPhase={playingComparisonPhase}
            />
            <button onClick={() => setFeedback("none")} className="w-full max-w-sm py-4 bg-stone-200 text-stone-700 font-black text-lg rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md mt-4 relative z-50">
              TRY AGAIN
            </button>
          </motion.div>
        )}

      </div>
    </ExerciseLayout>
  );
}
