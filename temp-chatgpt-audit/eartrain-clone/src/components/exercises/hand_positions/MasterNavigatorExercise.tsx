import { useState, useEffect, useRef } from "react";
import { Play, Check, Navigation, AlertCircle, Hand } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion, AnimatePresence } from "framer-motion";
import { InteractiveKeyboard, HandShape } from "../../lessons/InteractiveKeyboard";
import { OSMDScore, OSMDScoreRef } from "../../OSMDScore";

interface Props {
  onComplete: () => void;
}

type EventDefinition = {
  id: number;
  pauseMeasure: number;
  pauseRealValue: number;
  title: string;
  instruction: string;
  validateHand: (shape: HandShape, lHTapped?: boolean) => boolean;
  question: string;
  options: { text: string; isCorrect: boolean }[];
  explanation: string;
  showLeftHandTap?: boolean;
};

// 4/4 Time Signature. RealValue mapping:
// Beat 1 = 0.0
// Beat 2 = 0.25
// Beat 3 = 0.50
// Beat 4 = 0.75

const EVENTS: EventDefinition[] = [
  {
    id: 1,
    pauseMeasure: 1,
    pauseRealValue: 0.0,
    title: "Event 1: Starting Position",
    instruction: "Drag the Right Hand onto the 5-key framework starting with Finger 1 (Thumb) anchored on C4.",
    validateHand: (shape) => shape.rootNote === "C4",
    question: "What key are we in, and what scale degree is Finger 1 starting on?",
    options: [
      { text: "G Major – Dominant", isCorrect: false },
      { text: "C Major – Tonic", isCorrect: true },
      { text: "F Major – Subdominant", isCorrect: false },
      { text: "A Minor – Mediant", isCorrect: false },
    ],
    explanation: "The piece begins in C Major with Finger 1 anchored on C4, which serves as the Tonic (I) of the home key."
  },
  {
    id: 2,
    pauseMeasure: 2,
    pauseRealValue: 0.0, // Measure 2, Beat 1
    title: "Event 2: The Thumb Tuck",
    instruction: "Drag Finger 1 (Thumb) under Fingers 2 and 3 to strike D4 while maintaining continuous legato movement.",
    validateHand: (shape) => shape.rootNote === "D4",
    question: "What hand technique did you just use, and what interval was the skip right before it?",
    options: [
      { text: "Hand Shift – Perfect 5th Skip", isCorrect: false },
      { text: "Octave Jump – Major 2nd Step", isCorrect: false },
      { text: "Thumb Tuck (Finger 1 Under) – Minor 3rd Skip Down (F4 -> D4)", isCorrect: true },
      { text: "Finger Crossing Over – Perfect 4th Skip", isCorrect: false },
    ],
    explanation: "After climbing C4–D4–E4–F4, the melody skips down a minor 3rd to D4. Finger 1 tucks under to take over D4 so the hand can extend up to G4."
  },
  {
    id: 3,
    pauseMeasure: 3,
    pauseRealValue: 0.0, // Measure 3, Beat 1
    title: "Event 3: Hand Position Shift",
    instruction: "Drag the entire Right Hand framework up by 1 whole step, re-anchoring Finger 1 from C4 to D5.",
    validateHand: (shape) => shape.rootNote === "D5",
    question: "What did the hand just do, and what scale degree is the new position anchored on?",
    options: [
      { text: "Key Change – Leading Tone", isCorrect: false },
      { text: "Hand Position Shift up a Major 2nd – Supertonic (ii)", isCorrect: true },
      { text: "Tempo Change – Dominant (V)", isCorrect: false },
      { text: "Octave Displacement – Subdominant (IV)", isCorrect: false },
    ],
    explanation: "Measure 3 repeats the opening motive exactly one step higher in sequence. The entire hand shifts up to start on D5, which is the Supertonic (ii) scale degree."
  },
  {
    id: 4,
    pauseMeasure: 7,
    pauseRealValue: 0.0, // Measure 7, Beat 1
    title: "Event 4: First Key Modulation",
    instruction: "Move the Right Hand to the G Major frame (start on G4) and toggle the F natural to F# (or adjust finger offset).",
    validateHand: (shape) => shape.rootNote === "G4",
    question: "What new accidental appeared in Measure 7, and what new key have we shifted to?",
    options: [
      { text: "Bb – Subdominant Key (F Major)", isCorrect: false },
      { text: "G# – Relative Minor (A Minor)", isCorrect: false },
      { text: "F# – Dominant Key (G Major)", isCorrect: true },
      { text: "C# – Supertonic Key (D Minor)", isCorrect: false },
    ],
    explanation: "The introduction of F# acts as the new Leading Tone (vii°), confirming a key modulation to the Dominant key of G Major."
  },
  {
    id: 5,
    pauseMeasure: 12,
    pauseRealValue: 0.75, // Measure 12, Beat 4
    title: "Event 5: Relative Minor Modulation & Wide Leap",
    instruction: "Stretch Finger 5 (Pinky) up to hit F5, expanding the hand span across the bar line. (Drag the pinky circle to increase its offset)",
    validateHand: (shape) => shape.fingerOffsets[4] > 7, // stretched pinky
    question: "What is the wide interval leap across the bar line into Measure 13, and what key is it setting up?",
    options: [
      { text: "Perfect 5th – G Major", isCorrect: false },
      { text: "Major 6th – C Major", isCorrect: false },
      { text: "Minor 7th – A Minor", isCorrect: true },
      { text: "Octave – D Minor", isCorrect: false },
    ],
    explanation: "The distance from G#4 to F5 across the bar line is a wide Minor 7th leap. The G#4 serves as the Leading Tone to establish the key of A Minor."
  },
  {
    id: 6,
    pauseMeasure: 19,
    pauseRealValue: 0.0, // Measure 19, Beat 1
    title: "Event 6: Left-Hand Octave Anchor",
    instruction: "Tap the Left Hand Octave (G2-G3) to execute the jump gesture while keeping the bass anchored.",
    showLeftHandTap: true,
    validateHand: (_shape, lhTapped) => !!lhTapped,
    question: "What is the Left Hand doing in Measure 19 to build tension before returning home?",
    options: [
      { text: "Tonic Pedal Point on C", isCorrect: false },
      { text: "Dominant Pedal Point on G with Octave Leaps", isCorrect: true },
      { text: "Subdominant Scale Run on F", isCorrect: false },
      { text: "Chromatic Sequence", isCorrect: false },
    ],
    explanation: "The Left Hand leaps between G2 and G3 on the Dominant (V) scale degree. This creates a Dominant Pedal Point that builds harmonic tension before resolving back home to C Major at the cadence."
  }
];

export function MasterNavigatorExercise({ onComplete }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  
  const [phase, setPhase] = useState<'IDLE' | 'PLAYING' | 'PHYSICAL_MOVE' | 'QUESTION' | 'EXPLANATION' | 'DONE'>('IDLE');
  
  const [shape, setShape] = useState<HandShape>({ rootNote: "C4", fingerOffsets: [0, 2, 4, 5, 7] });
  const [lhTapped, setLhTapped] = useState(false);
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");

  const osmdRef = useRef<OSMDScoreRef>(null);

  useEffect(() => {
    return () => {
      if (osmdRef.current) {
        osmdRef.current.stop();
      }
    };
  }, []);

  const playUntilNextEvent = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setPhase('PLAYING');
    
    // Find where we are currently at in time
    const startEvent = EVENTS[currentEventIndex === 0 ? 0 : currentEventIndex - 1];
    let currentMeasure = currentEventIndex === 0 ? 1 : startEvent.pauseMeasure;
    let currentRealValue = currentEventIndex === 0 ? 0.0 : startEvent.pauseRealValue;
    
    const targetEvent = EVENTS[currentEventIndex];
    const targetMeasure = targetEvent ? targetEvent.pauseMeasure : 22; // max measures in piece
    const targetRealValue = targetEvent ? targetEvent.pauseRealValue : 1.0;

    if (osmdRef.current) {
      osmdRef.current.playSegment(currentMeasure, currentRealValue, targetMeasure, targetRealValue, () => {
        setIsPlaying(false);
        if (targetEvent) {
          setPhase('PHYSICAL_MOVE');
          setLhTapped(false);
        } else {
          setPhase('DONE');
        }
      });
    }
  };

  const handlePhysicalCheck = () => {
    const ev = EVENTS[currentEventIndex];
    if (ev.validateHand(shape, lhTapped)) {
      setPhase('QUESTION');
      setSelectedOption(null);
      setFeedback("none");
    } else {
      setFeedback("error");
      setTimeout(() => setFeedback("none"), 3000);
    }
  };

  const handleAnswerSubmit = (index: number) => {
    setSelectedOption(index);
    const ev = EVENTS[currentEventIndex];
    if (ev.options[index].isCorrect) {
      setPhase('EXPLANATION');
    }
  };

  const nextEvent = () => {
    setCurrentEventIndex(prev => prev + 1);
    setPhase('IDLE');
  };

  const currentEv = EVENTS[currentEventIndex];

  return (
    <ExerciseLayout
      title="Lesson 21: Master Navigator"
      step={currentEventIndex}
      maxSteps={EVENTS.length}
      exampleInstruction=""
      practiceInstruction=""
      feedback={feedback}
      onNextStep={() => {}}
      onComplete={onComplete}
      storageKeyId="master-navigator-final-v2"
      showExampleOverlay={false}
    >
      <div className="w-full mb-8">
        
        <OSMDScore 
          ref={osmdRef}
          fileUrl="/invention-bwv-772-in-c-major.mxl"
        />
        
        <div className="flex justify-center mt-6">
          {(phase === 'IDLE' || phase === 'DONE') && (
            <button 
              onClick={phase === 'DONE' ? onComplete : playUntilNextEvent} 
              disabled={isPlaying}
              className={`flex items-center gap-3 px-12 py-5 font-black text-xl rounded-full transition-all shadow-xl border-b-4 
                ${isPlaying
                  ? 'bg-stone-300 text-stone-500 border-stone-400 cursor-not-allowed opacity-50'
                  : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95 border-orange-700'
                }`}
            >
              {phase === 'DONE' ? (
                <><Check className="w-6 h-6 stroke-[3]" /> COMPLETE LESSON</>
              ) : (
                <><Play className="w-6 h-6 fill-current" /> {currentEventIndex === 0 ? "START FULL PIECE" : "RESUME PIECE"}</>
              )}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'PHYSICAL_MOVE' && currentEv && (
          <motion.div 
            key="physical"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center w-full"
          >
            <div className="bg-orange-900/50 text-white p-6 rounded-2xl shadow-xl w-full max-w-4xl border border-orange-700/50 flex flex-col items-center">
              <h3 className="text-orange-300 font-bold uppercase tracking-widest text-sm mb-2">{currentEv.title}</h3>
              <p className="text-2xl font-black text-center mb-8">{currentEv.instruction}</p>
              
              {currentEv.showLeftHandTap && (
                <button 
                  onClick={() => setLhTapped(!lhTapped)}
                  className={`px-8 py-6 rounded-xl font-bold text-xl transition-all shadow-lg border-b-4 mb-8 flex items-center gap-3
                    ${lhTapped 
                      ? 'bg-emerald-500 text-white border-emerald-700' 
                      : 'bg-stone-200 text-stone-700 border-stone-300 hover:bg-stone-300'}`}
                >
                  <Hand className="w-6 h-6" /> {lhTapped ? "LEFT HAND OCTAVE (G2-G3) PLAYED!" : "TAP LEFT HAND OCTAVE (G2-G3)"}
                </button>
              )}

              <div className="w-full relative z-20 mb-8 bg-black/20 p-4 rounded-xl border border-orange-800/30">
                <InteractiveKeyboard 
                  shape={shape}
                  onChangeShape={setShape}
                  pointAtDragHandle={currentEv.id === 1}
                />
              </div>
              
              {feedback === "error" && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 text-red-400 font-bold bg-red-900/30 px-4 py-2 rounded-lg mb-4">
                  <AlertCircle className="w-5 h-5" />
                  Incorrect physical position. Please adjust your hand block.
                </motion.div>
              )}

              <button 
                onClick={handlePhysicalCheck}
                className="px-12 py-4 bg-emerald-500 text-white font-black text-xl rounded-full flex items-center justify-center gap-3 hover:bg-emerald-600 active:scale-95 transition-all shadow-xl border-b-4 border-emerald-700"
              >
                <Check className="w-6 h-6 stroke-[3]" /> VERIFY HAND POSITION
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'QUESTION' && currentEv && (
          <motion.div 
            key="question"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="flex justify-center w-full relative z-50"
          >
            <div className="bg-white dark:bg-stone-900 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.3)] w-full max-w-2xl border-4 border-emerald-500 flex flex-col items-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6">
                <Navigation className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-2xl font-black text-stone-800 dark:text-white text-center mb-8">{currentEv.question}</h3>
              
              <div className="flex flex-col gap-3 w-full">
                {currentEv.options.map((opt, i) => {
                  const isSelected = selectedOption === i;
                  const isWrong = isSelected && !opt.isCorrect;
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswerSubmit(i)}
                      className={`text-left p-4 rounded-xl font-bold text-lg transition-all border-2 
                        ${isWrong 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400 shake-animation' 
                          : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                    >
                      {["A", "B", "C", "D"][i]}) {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'EXPLANATION' && currentEv && (
          <motion.div 
            key="explanation"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex justify-center w-full"
          >
            <div className="bg-emerald-600 text-white p-8 rounded-3xl shadow-xl w-full max-w-2xl border-b-8 border-emerald-800 flex flex-col items-center">
              <div className="bg-white/20 p-4 rounded-full mb-6">
                <Check className="w-12 h-12 stroke-[3]" />
              </div>
              <h3 className="text-3xl font-black text-center mb-4">Correct!</h3>
              <p className="text-emerald-50 text-xl text-center mb-10 leading-relaxed">
                {currentEv.explanation}
              </p>
              
              <button 
                onClick={nextEvent}
                className="w-full py-5 bg-white text-emerald-700 font-black text-2xl rounded-2xl hover:bg-emerald-50 active:scale-95 transition-all shadow-xl"
              >
                CONTINUE PIECE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ExerciseLayout>
  );
}
