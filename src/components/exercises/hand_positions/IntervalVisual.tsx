import { motion } from "framer-motion";
import { Footprints, Rabbit, Bird } from "lucide-react";

export interface IntervalVisualProps {
  note1: string;
  note2: string;
  intervalType: "step" | "skip" | "leap";
}

export function IntervalVisual({ note1, note2, intervalType }: IntervalVisualProps) {
  const ALL_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
  
  // Extract just the letter
  const getNoteLetter = (note: string) => note.replace(/[^A-G]/g, "");
  
  const letter1 = getNoteLetter(note1);
  const letter2 = getNoteLetter(note2);
  
  let idx1 = ALL_NOTES.indexOf(letter1);
  let idx2 = ALL_NOTES.indexOf(letter2);
  
  if (idx1 === -1) idx1 = 0;
  if (idx2 === -1) idx2 = 0;
  
  const startIdx = Math.min(idx1, idx2);
  const endIdx = Math.max(idx1, idx2);
  
  // Show notes from note1 to note2 inclusive
  const visibleNotes = ALL_NOTES.slice(startIdx, endIdx + 1);

  const getLabel = () => {
    switch (intervalType) {
      case "step": return <span className="flex items-center gap-2">Next door neighbors! <Footprints className="w-5 h-5" /></span>;
      case "skip": return <span className="flex items-center gap-2">Jumped over one note! <Rabbit className="w-5 h-5" /></span>;
      case "leap": return <span className="flex items-center gap-2">Big stretch across the hand! <Bird className="w-5 h-5" /></span>;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center p-6 bg-white dark:bg-stone-800 rounded-3xl shadow-md border border-stone-200 dark:border-stone-700 mt-4 w-full"
    >
      <div className="flex items-end justify-center gap-2 sm:gap-4 mb-2 min-h-[80px]">
        {visibleNotes.map((note) => {
          const isNote1 = note === letter1;
          const isNote2 = note === letter2;
          const isPlayed = isNote1 || isNote2;
          
          return (
            <div key={note} className="flex flex-col items-center justify-end h-full">
              <div 
                className={`flex items-center justify-center rounded-full text-white font-black transition-all duration-300 ${
                  isNote1 ? 'w-16 h-16 bg-orange-500 shadow-lg text-3xl' : 
                  isNote2 ? 'w-16 h-16 bg-blue-500 shadow-lg text-3xl' : 
                  'w-6 h-6 bg-stone-300 dark:bg-stone-600 text-[0px]'
                }`}
              >
                {isPlayed ? note : ''}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Curved Bracket */}
      <div 
        className="h-6 border-b-4 border-l-4 border-r-4 border-transparent border-b-stone-400 dark:border-b-stone-500 rounded-b-3xl"
        style={{ width: `calc(100% - ${100 / visibleNotes.length}%)`, minWidth: '60px' }} 
      />
      
      {/* Label */}
      <div className="mt-4 text-xl font-bold text-stone-700 dark:text-stone-300 flex items-center justify-center">
        {getLabel()}
      </div>
    </motion.div>
  );
}
