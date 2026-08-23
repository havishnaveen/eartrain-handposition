import React from "react";
import { Button } from "./ui/button";
import { ArrowLeft } from "lucide-react";
import { stopAllAudio } from "@/lib/audio";
import { motion } from "framer-motion";

export type ExerciseContainerProps = {
  id: string;
  name: string;
  stage: number;
  onExit: () => void;
  children: () => React.ReactNode;
};

export function ExerciseContainer({ onExit, children }: ExerciseContainerProps) {
  React.useEffect(() => {
    return () => { stopAllAudio(); };
  }, []);

  const handleExit = () => {
    stopAllAudio();
    onExit();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto pt-6 pb-20 px-4">
      <div className="sticky top-4 z-[60] bg-background/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-border flex justify-between items-center mb-8">
        <Button variant="outline" onClick={handleExit}><ArrowLeft className="w-4 h-4 mr-2" /> Leave Lesson</Button>
      </div>

      <div className="bg-white dark:bg-card border-2 shadow-2xl border-orange-300 dark:border-orange-500/30 rounded-xl overflow-hidden p-6 sm:p-12">
        {children()}
      </div>
    </motion.div>
  );
}
