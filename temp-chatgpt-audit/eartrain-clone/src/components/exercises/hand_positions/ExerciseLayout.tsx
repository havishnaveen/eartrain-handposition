import { motion } from "framer-motion";
import { Trophy, RefreshCw } from "lucide-react";
import React, { useEffect } from "react";
import { stopAllAudio } from "@/lib/audio";

interface ExerciseLayoutProps {
  title: string;
  step: number;
  maxSteps: number;
  exampleInstruction: string;
  practiceInstruction: string;
  feedback: string;
  onNextStep: () => void;
  onComplete: () => void;
  storageKeyId: string;
  showExampleOverlay?: boolean;
  children: React.ReactNode;
}

export function ExerciseLayout({
  title,
  step,
  maxSteps,
  exampleInstruction,
  practiceInstruction,
  feedback,
  onNextStep,
  onComplete,
  storageKeyId,
  showExampleOverlay,
  children
}: ExerciseLayoutProps) {
  useEffect(() => {
    return () => stopAllAudio();
  }, []);

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto pb-24 relative">
      <div className="text-center mb-8 relative z-10">
        <h3 className="text-3xl font-serif font-black text-foreground drop-shadow-sm mb-4">{title}</h3>
        <div className="flex gap-2 justify-center">
          {Array.from({length: maxSteps}).map((_, i) => (
            <div key={i} className={`w-4 h-4 rounded-full ${step === 0 ? 'bg-stone-200 dark:bg-stone-700' : (i < step ? 'bg-orange-500 shadow-sm' : 'bg-stone-200 dark:bg-stone-700')}`} />
          ))}
        </div>
      </div>

      <div className={`w-full max-w-2xl p-6 rounded-2xl border-2 mb-8 text-center shadow-sm relative z-10 ${step === 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700'}`}>
        <h4 className={`text-lg font-black uppercase tracking-widest mb-2 ${step === 0 ? 'text-blue-500' : 'text-orange-500'}`}>
          {step === 0 ? "Example Problem" : "Instructions"}
        </h4>
        <p className="text-2xl font-bold text-stone-800 dark:text-stone-200">
          {step === 0 ? exampleInstruction : practiceInstruction}
        </p>
      </div>

      {showExampleOverlay && (
        <div className="fixed inset-0 z-40 bg-black/40" />
      )}

      {children}

      {feedback === "success" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-md p-4 rounded-2xl">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-8 p-12 bg-white dark:bg-stone-800 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-700 max-w-sm w-full text-center">
            <div className="flex flex-col items-center gap-4 text-green-500">
              <Trophy className="w-20 h-20" />
              <p className="font-black text-4xl">Perfect!</p>
            </div>
            
            {step === 0 ? (
              <button onClick={onNextStep} className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl text-xl hover:bg-orange-600 active:scale-95 transition-all shadow-xl">
                START PRACTICE
              </button>
            ) : step < maxSteps ? (
              <button onClick={onNextStep} className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl text-xl hover:bg-orange-600 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2">
                NEXT QUESTION <RefreshCw className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={() => {
                localStorage.setItem(`et_v3_completed_${storageKeyId}`, 'true');
                onComplete();
              }} className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl text-xl hover:bg-orange-600 active:scale-95 transition-all shadow-xl">
                NEXT LESSON
              </button>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
