import { motion } from "framer-motion";
import { Home, MoveRight } from "lucide-react";

export interface PhraseCompareVisualProps {
  phrase1Anchor: string;
  phrase2Anchor: string;
}

export function PhraseCompareVisual({ phrase1Anchor, phrase2Anchor }: PhraseCompareVisualProps) {
  const isSame = phrase1Anchor === phrase2Anchor;
  const p1Letter = phrase1Anchor.replace(/[^A-G]/g, "");
  const p2Letter = phrase2Anchor.replace(/[^A-G]/g, "");

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center p-6 bg-white dark:bg-stone-800 rounded-3xl shadow-md border border-stone-200 dark:border-stone-700 mt-4 w-full"
    >
      <div className="flex w-full items-center justify-center gap-4 sm:gap-8">
        
        {/* Phrase 1 block */}
        <div className="flex flex-col items-center">
          <span className="text-stone-500 font-bold mb-2">Phrase 1 started on</span>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-500 text-white font-black text-3xl sm:text-4xl flex items-center justify-center shadow-lg border-4 border-blue-200">
            {p1Letter}
          </div>
        </div>

        {/* Comparison operator */}
        <div className="flex flex-col items-center justify-center pt-8">
          {isSame ? (
            <div className="bg-green-100 text-green-600 font-black text-2xl px-4 py-2 rounded-xl border-2 border-green-300">
              =
            </div>
          ) : (
            <div className="bg-red-100 text-red-500 font-black text-2xl px-4 py-2 rounded-xl border-2 border-red-300">
              ≠
            </div>
          )}
        </div>

        {/* Phrase 2 block */}
        <div className="flex flex-col items-center">
          <span className="text-stone-500 font-bold mb-2">Phrase 2 started on</span>
          <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full text-white font-black text-3xl sm:text-4xl flex items-center justify-center shadow-lg border-4 ${isSame ? 'bg-blue-500 border-blue-200' : 'bg-orange-500 border-orange-200'}`}>
            {p2Letter}
          </div>
        </div>

      </div>

      <div className="mt-6 text-xl font-bold text-stone-700 dark:text-stone-300 text-center flex items-center justify-center gap-2">
        {isSame 
          ? <>The starting notes match! The hand stayed in place. <Home className="w-6 h-6" /></> 
          : <>The starting notes are different! The hand shifted. <MoveRight className="w-6 h-6" /></>}
      </div>
    </motion.div>
  );
}
