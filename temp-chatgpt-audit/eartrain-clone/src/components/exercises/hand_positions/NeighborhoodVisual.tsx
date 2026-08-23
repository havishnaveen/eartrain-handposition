import { motion } from "framer-motion";

export function NeighborhoodVisual() {
  const NOTES = ["C", "D", "E", "F", "G", "A", "B", "C", "D"];

  return (
    <div className="flex flex-col items-center p-6 bg-white dark:bg-stone-800 rounded-3xl shadow-md border border-stone-200 dark:border-stone-700 mt-2 mb-6 w-full relative">
      <div className="flex w-full max-w-md justify-between items-end mb-4 relative z-10 px-2">
        <div className="flex flex-col items-center w-[120px]">
          <span className="text-orange-500 font-black text-sm mb-1">Orange Zone</span>
          <span className="text-orange-600/80 font-bold text-xs">C Major</span>
        </div>
        <div className="flex flex-col items-center w-[120px]">
          <span className="text-blue-500 font-black text-sm mb-1">Blue Zone</span>
          <span className="text-blue-600/80 font-bold text-xs">G Major</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 sm:gap-2 relative w-full">
        {/* Background highlight zones */}
        <div className="absolute left-[5%] right-[55%] top-0 bottom-0 bg-orange-100 dark:bg-orange-900/30 rounded-2xl border-2 border-orange-200 dark:border-orange-800/50" />
        <div className="absolute left-[45%] right-[5%] top-0 bottom-0 bg-blue-100 dark:bg-blue-900/30 rounded-2xl border-2 border-blue-200 dark:border-blue-800/50" />
        
        {NOTES.map((note, idx) => {
          const isOrange = idx < 5;
          const isBlue = idx >= 4;
          const isOverlap = isOrange && isBlue; // The 'G' note overlaps

          return (
            <div key={idx} className="flex flex-col items-center relative z-10 p-2">
              <div 
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full text-white font-bold text-sm sm:text-base flex items-center justify-center shadow-sm ${
                  isOverlap ? 'bg-gradient-to-r from-orange-500 to-blue-500' : 
                  isOrange ? 'bg-orange-500' : 'bg-blue-500'
                }`}
              >
                {note}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Arrow indicating jump */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
        <motion.div 
          animate={{ x: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="bg-white/80 dark:bg-stone-800/80 rounded-full p-1 backdrop-blur-sm"
        >
          <svg width="40" height="24" viewBox="0 0 40 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12H35M35 12L25 5M35 12L25 19" stroke="#9ca3af" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </div>
    </div>
  );
}
