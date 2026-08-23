import { useState } from "react";
import { AnimatedPointer } from "../../AnimatedPointer";
import { playSequenceWithUI, SequenceEvent , getAudioSession} from "@/lib/audio";
import { MusicStaff } from "../../MusicStaff";
import { Play, Footprints, FastForward, Rocket, ArrowUp, ArrowDown } from "lucide-react";
import { ExerciseLayout } from "./ExerciseLayout";
import { motion } from "framer-motion";


interface Props {
  onComplete: () => void;
}

const FULL_MELODY = [
  // Measure 1
  { note: "E5", octave: 5, duration: 0.4 }, { note: "D#5", octave: 5, duration: 0.4 }, 
  { note: "E5", octave: 5, duration: 0.4 }, { note: "D#5", octave: 5, duration: 0.4 }, 
  // Measure 2
  { note: "E5", octave: 5, duration: 0.4 }, { note: "B4", octave: 4, duration: 0.4 }, 
  { note: "D5", octave: 5, duration: 0.4 }, { note: "C5", octave: 5, duration: 0.4 }, 
  // Measure 3
  { note: "A4", octave: 4, duration: 1.2 }, { note: "C4", octave: 4, duration: 0.4 }, 
  // Measure 4
  { note: "E4", octave: 4, duration: 0.4 }, { note: "A4", octave: 4, duration: 0.4 }, 
  { note: "B4", octave: 4, duration: 0.8, tiedToNext: true }, 
  // Measure 5
  { note: "B4", octave: 4, duration: 0.4 }, { note: "E4", octave: 4, duration: 0.4 }, 
  { note: "G#4", octave: 4, duration: 0.4 }, { note: "B4", octave: 4, duration: 0.4 }, 
  // Measure 6
  { note: "C5", octave: 5, duration: 1.2 }, { note: "E4", octave: 4, duration: 0.4 },
  // Measure 7
  { note: "E5", octave: 5, duration: 0.4 }, { note: "D#5", octave: 5, duration: 0.4 }, 
  { note: "E5", octave: 5, duration: 0.4 }, { note: "D#5", octave: 5, duration: 0.4 }, 
  // Measure 8
  { note: "E5", octave: 5, duration: 0.4 }, { note: "B4", octave: 4, duration: 0.4 }, 
  { note: "D5", octave: 5, duration: 0.4 }, { note: "C5", octave: 5, duration: 0.4 }, 
  // Measure 9
  { note: "A4", octave: 4, duration: 1.2 }, { note: "C4", octave: 4, duration: 0.4 }, 
  // Measure 10
  { note: "E4", octave: 4, duration: 0.4 }, { note: "A4", octave: 4, duration: 0.4 }, 
  { note: "B4", octave: 4, duration: 0.8, tiedToNext: true }, 
  // Measure 11
  { note: "B4", octave: 4, duration: 0.4 }, { note: "E4", octave: 4, duration: 0.4 }, 
  { note: "C5", octave: 5, duration: 0.4 }, { note: "B4", octave: 4, duration: 0.4 }, 
  // Measure 12
  { note: "A4", octave: 4, duration: 1.6 }
];

const SEGMENTS = [
  { start: 0, end: 3, answer: 'steps' },                   // 0 to 3: E5 D#5 E5 D#5
  { start: 5, end: 6, answer: 'skip' },                    // 5 to 6: B4 to D5 (3rd)
  { start: 6, end: 7, answer: 'steps' },                   // 6 to 7: D5 to C5 (2nd)
  { start: 8, end: 9, answer: 'low_out_of_bounds' },       // 8 to 9: A4 down to C4 (6th)
  { start: 9, end: 10, answer: 'skip' },                   // 9 to 10: C4 to E4 (3rd)
  { start: 13, end: 14, answer: 'leap' },                  // 13 to 14: B4 down to E4 (5th)
  { start: 17, end: 18, answer: 'low_out_of_bounds' },     // 17 to 18: C5 down to E4 (6th)
  { start: 18, end: 19, answer: 'high_out_of_bounds' },    // 18 to 19: E4 up to E5 (Octave)
  { start: 24, end: 25, answer: 'skip' },                  // 24 to 25: B4 to D5 (3rd)
  { start: 27, end: 28, answer: 'low_out_of_bounds' },     // 27 to 28: A4 down to C4 (6th)
  { start: 32, end: 33, answer: 'leap' },                  // 32 to 33: B4 down to E4 (5th)
  { start: 34, end: 36, answer: 'steps' }                  // 34 to 36: C5 B4 A4
];

export function MelodyTrackerExercise({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [examplePlayed, setExamplePlayed] = useState(false);

  const MAX_STEPS = 12;

  const play = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setFeedback("none");
    
    let playNotes = FULL_MELODY;
    let offset = 0;
    
    if (step > 0) {
      const seg = SEGMENTS[step - 1];
      playNotes = FULL_MELODY.slice(seg.start, seg.end + 1);
      offset = seg.start;
    }
    
    let skipAudioOnNext = false;
    const session = getAudioSession();
    for (let i = 0; i < playNotes.length; i++) {
      if (getAudioSession() !== session) break;
      setCursorIndex(offset + i);
      
      let playDuration = playNotes[i].duration + (playNotes[i].duration >= 0.8 ? 0.15 : 0);
      let isSilent = skipAudioOnNext;
      
      if ((playNotes[i] as any).tiedToNext) {
         skipAudioOnNext = true;
         // If we are playing the whole sequence, we can add the next note's duration
         if (i + 1 < playNotes.length) {
             playDuration += playNotes[i+1].duration;
         }
      } else {
         skipAudioOnNext = false;
      }
      
      const ev: SequenceEvent = {
        notes: isSilent ? [] : [{ note: playNotes[i].note, octave: playNotes[i].octave }],
        duration: playNotes[i].duration, // wait time is normal
        gapAfter: (playNotes[i] as any).restAfter || 0.01
      };
      
      // If it's silent, we just sleep for the duration to move the cursor visually
      if (isSilent) {
        await new Promise(r => setTimeout(r, playNotes[i].duration * 1000));
      } else {
        // Send the extended duration to the audio engine asynchronously
        const actualEv = { ...ev, duration: playDuration };
        playSequenceWithUI([actualEv], () => {}).catch(console.error);
        // Await the visual duration for the cursor
        await new Promise(r => setTimeout(r, playNotes[i].duration * 1000));
      }
    }
    setCursorIndex(null);
    setIsPlaying(false);
    
    if (step === 0 && !examplePlayed) {
      setExamplePlayed(true);
    }
  };

  const handleGuess = (guess: string) => {
    if (step === 0) return;
    const target = SEGMENTS[step - 1].answer;
    if (guess === target) {
      setFeedback("success");
    } else {
      setFeedback("error");
    }
  };

  const nextStep = () => {
    if (step < MAX_STEPS) {
      setStep(step + 1);
      setFeedback("none");
    }
  };

  return (
    <ExerciseLayout
      title="Lesson 11: The Position Tracker (Final)"
      step={step}
      maxSteps={MAX_STEPS}
      exampleInstruction="This is Für Elise! Listen to the whole melody, then we'll go through it piece by piece."
      practiceInstruction="Listen to just this part. What happened?"
      feedback={feedback}
      onNextStep={nextStep}
      onComplete={onComplete}
      storageKeyId="melody-tracker"
      showExampleOverlay={step === 0 && !examplePlayed && !isPlaying}
    >
      <div className="w-full mb-8">
        <MusicStaff 
          notes={FULL_MELODY} 
          cursorIndex={cursorIndex} 
          highlightRange={step > 0 ? [SEGMENTS[step - 1].start, SEGMENTS[step - 1].end] : null}
          timeSignature="4/4"
          measureLines={[3, 7, 9, 12, 16, 18, 22, 26, 28, 31, 35]}
        />
        
        <div className="flex justify-center mt-4">
          <div className={`relative ${step === 0 && !examplePlayed && !isPlaying ? "z-50" : "z-10"}`}>
            {step === 0 && !examplePlayed && !isPlaying && (
              <AnimatedPointer className="-top-12 left-1/2 -translate-x-1/2" />
            )}
            <button 
              onClick={play} 
              disabled={isPlaying || (step === 0 && examplePlayed)}
              className={`flex items-center gap-3 px-10 py-4 font-black text-xl rounded-full transition-all shadow-xl border-b-4 
                ${isPlaying || (step === 0 && examplePlayed)
                  ? 'bg-stone-300 text-stone-500 border-stone-400 cursor-not-allowed opacity-50'
                  : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95 border-orange-700'
                }`}
            >
              <Play className="w-6 h-6 fill-current" /> {step === 0 ? "PLAY MUSIC" : "PLAY SEGMENT"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 min-h-[16rem] mt-4 w-full max-w-2xl mx-auto">
        {step === 0 && examplePlayed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 w-full max-w-sm relative z-50">
            <p className="text-lg font-bold text-center text-blue-700 bg-blue-50 px-6 py-4 rounded-2xl border border-blue-200 shadow-sm">
              Great! Now let's look at each section. For each part, tell me what happened!
            </p>
            <button onClick={nextStep} className="w-full py-4 bg-blue-500 text-white font-black text-xl rounded-2xl hover:bg-blue-600 active:scale-95 transition-all shadow-xl border-b-4 border-blue-700">
              START PRACTICE
            </button>
          </motion.div>
        )}

        {step > 0 && feedback === "none" && (
          <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 w-full relative ${step === 0 && !examplePlayed && !isPlaying ? "z-50" : "z-10"}`}>
            <button 
              onClick={() => handleGuess("steps")} 
              className={`relative z-10 w-full py-3 bg-emerald-500 text-white font-black text-lg rounded-2xl hover:bg-emerald-600 active:scale-95 transition-all shadow-xl border-b-4 border-emerald-700 flex flex-col items-center justify-center gap-1`}
            >
              <Footprints className="w-8 h-8 mb-1" />
              <span>STEPS (2nd)</span>
              <span className="text-[10px] opacity-90 uppercase tracking-widest font-bold">Moved by step</span>
            </button>
            <button 
              onClick={() => handleGuess("skip")} 
              className={`relative z-10 w-full py-3 bg-sky-500 text-white font-black text-lg rounded-2xl hover:bg-sky-600 active:scale-95 transition-all shadow-xl border-b-4 border-sky-700 flex flex-col items-center justify-center gap-1`}
            >
              <FastForward className="w-8 h-8 mb-1" />
              <span>SKIP (3rd)</span>
              <span className="text-[10px] opacity-90 uppercase tracking-widest font-bold">Small jump (3rd)</span>
            </button>
            <button 
              onClick={() => handleGuess("leap")} 
              className={`relative z-10 w-full py-3 bg-amber-500 text-white font-black text-lg rounded-2xl hover:bg-amber-600 active:scale-95 transition-all shadow-xl border-b-4 border-amber-700 flex flex-col items-center justify-center gap-1`}
            >
              <Rocket className="w-8 h-8 mb-1" />
              <span>LEAP (5th)</span>
              <span className="text-[10px] opacity-90 uppercase tracking-widest font-bold">Big jump</span>
            </button>
            <button 
              onClick={() => handleGuess("high_out_of_bounds")} 
              className={`relative z-10 w-full py-3 bg-fuchsia-500 text-white font-black text-lg rounded-2xl hover:bg-fuchsia-600 active:scale-95 transition-all shadow-xl border-b-4 border-fuchsia-700 flex flex-col items-center justify-center gap-1`}
            >
              <ArrowUp className="w-8 h-8 mb-1" />
              <span>HIGH JUMP</span>
              <span className="text-[10px] opacity-90 uppercase tracking-widest font-bold">High out of bounds</span>
            </button>
            <button 
              onClick={() => handleGuess("low_out_of_bounds")} 
              className={`relative z-10 w-full py-3 bg-indigo-500 text-white font-black text-lg rounded-2xl hover:bg-indigo-600 active:scale-95 transition-all shadow-xl border-b-4 border-indigo-700 flex flex-col items-center justify-center gap-1`}
            >
              <ArrowDown className="w-8 h-8 mb-1" />
              <span>LOW JUMP</span>
              <span className="text-[10px] opacity-90 uppercase tracking-widest font-bold">Low out of bounds</span>
            </button>
          </div>
        )}
        
        {step > 0 && feedback === "error" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2 w-full max-w-sm relative z-50">
            <p className="text-red-500 font-bold text-lg text-center">Not quite! Listen again and look at how the notes move.</p>
            <button onClick={() => setFeedback("none")} className="w-full py-4 bg-stone-200 text-stone-700 font-black text-xl rounded-2xl hover:bg-stone-300 active:scale-95 transition-all shadow-md">
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </div>
    </ExerciseLayout>
  );
}
