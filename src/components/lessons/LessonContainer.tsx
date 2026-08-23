import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { stopAllAudio } from "@/lib/audio";

type LessonContainerProps = {
  id: string;
  name: string;
  stage: number;
  onExit: () => void;
  children: React.ReactNode;
}

export function LessonContainer({ name, stage, onExit, children }: LessonContainerProps) {
  
  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);
  
  const getStageColor = (s: number) => {
    switch (s) {
      case 1: return "text-orange-600 dark:text-orange-400";
      case 2: return "text-amber-600 dark:text-amber-400";
      case 3: return "text-amber-600 dark:text-amber-400";
      case 4: return "text-yellow-600 dark:text-yellow-400";
      default: return "text-orange-600 dark:text-orange-400";
    }
  }
  
  return (
    <div className="container mx-auto max-w-4xl pb-24">
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" onClick={onExit} className="gap-2 hover:bg-black/5 dark:hover:bg-white/5 font-bold">
          <ArrowLeft className="w-4 h-4" /> Back to Lessons
        </Button>
        <div className={`font-bold uppercase tracking-widest text-xs ${getStageColor(stage)}`}>
          Stage {stage}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="p-8 md:p-12 shadow-2xl border border-orange-200 dark:border-white/10 bg-white/90 dark:bg-[#151010]/90 backdrop-blur-xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/5 dark:bg-amber-500/10 rounded-full blur-3xl -z-10" />
          
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-orange-950 dark:text-white mb-8 tracking-tight">
            {name}
          </h2>
          
          <div className="space-y-8">
            {children}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
