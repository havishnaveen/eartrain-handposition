import { motion } from "framer-motion";
import { AlertTriangle, Hand } from "lucide-react";

export interface OutOfBoundsVisualProps {

  outOfBoundsNote: string;
  direction: "high" | "low";
}

export function OutOfBoundsVisual({ outOfBoundsNote, direction }: OutOfBoundsVisualProps) {
  const oobLetter = outOfBoundsNote.replace(/[^A-G]/g, "");

  const OutOfBoundsNote = () => (
    <motion.div 
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ repeat: Infinity, duration: 2 }}
      className="flex flex-col items-center justify-center"
    >
      <div className="w-12 h-12 rounded-full bg-red-500 text-white font-black text-xl flex items-center justify-center shadow-lg border-2 border-red-200 shrink-0">
        {oobLetter}
      </div>
      <span className="text-red-500 font-bold text-[10px] sm:text-xs mt-2 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
        Out of Bounds
      </span>
    </motion.div>
  );

  const DashedLine = () => (
    <div className="h-16 border-l-2 border-dashed border-stone-300 dark:border-stone-600 mx-3 sm:mx-6 shrink-0" />
  );

  const HandPositionPill = () => (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="px-3 sm:px-5 py-2 sm:py-3 bg-orange-500 rounded-full shadow-md text-white font-bold flex items-center gap-2 text-xs sm:text-sm">
        <Hand className="w-4 h-4 sm:w-5 sm:h-5" />
        <span>5 Finger Position</span>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center p-4 sm:p-6 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 mt-4 mx-auto w-fit"
    >
      <div className="flex items-center justify-center">
        {direction === "low" ? (
          <>
            <OutOfBoundsNote />
            <DashedLine />
            <HandPositionPill />
          </>
        ) : (
          <>
            <HandPositionPill />
            <DashedLine />
            <OutOfBoundsNote />
          </>
        )}
      </div>
    </motion.div>
  );
}
