import { motion } from "framer-motion";
import { Play } from "lucide-react";

export interface MajorMinorCompareVisualProps {
  targetIsMajor: boolean;

  onPlayComparison: () => void;
  isPlayingComparison: boolean;
  playingPhase?: 'wrong' | 'right' | 'none';
}

const MAJOR_OFFSETS = [0, 2, 4, 5, 7];
const MINOR_OFFSETS = [0, 2, 3, 5, 7];

function MiniKeyboard({ highlightNotes }: { highlightNotes: number[] }) {
  // A generic mini keyboard representation
  return (
    <div className="relative flex bg-white p-1 rounded-md shadow-inner border border-slate-300">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div 
          key={i} 
          className={`w-8 shrink-0 min-w-[32px] h-28 border-r last:border-r-0 border-slate-300 flex items-end justify-center pb-2 transition-colors ${highlightNotes.includes(i) ? 'bg-orange-100 shadow-[inset_0_-8px_16px_rgba(249,115,22,0.3)]' : 'bg-white'}`}
        >
          {highlightNotes.includes(i) && <div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm" />}
        </div>
      ))}
      <div className="absolute top-1 left-[26px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
      <div className="absolute top-1 left-[58px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
      <div className="absolute top-1 left-[122px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
      <div className="absolute top-1 left-[154px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
      <div className="absolute top-1 left-[186px] w-5 h-16 bg-slate-800 rounded-b-sm z-10 shadow-sm" />
    </div>
  );
}

export function MajorMinorCompareVisual({ 
  targetIsMajor, 
   
  onPlayComparison, 
  isPlayingComparison,
  playingPhase = 'none' 
}: MajorMinorCompareVisualProps) {

  const isMajorPlaying = (playingPhase === 'right' && targetIsMajor) || (playingPhase === 'wrong' && !targetIsMajor);
  const isMinorPlaying = (playingPhase === 'right' && !targetIsMajor) || (playingPhase === 'wrong' && targetIsMajor);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 w-full max-w-4xl p-6 bg-slate-800 rounded-2xl my-4 text-white shadow-xl border border-slate-700 relative z-50"
    >
      <div className="text-center mb-2">
        <h3 className="text-2xl font-bold text-orange-400 mb-2">Let's look at the difference!</h3>
        <p className="text-slate-300">Notice how the middle note (the 3rd) shifts down slightly for the minor chord.</p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8 justify-center">
        {/* Major */}
        <div className={`flex flex-col items-center p-6 rounded-xl border flex-1 relative overflow-hidden transition-all duration-300 ${isMajorPlaying ? 'bg-slate-700 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]' : 'bg-slate-700/50 border-slate-600'}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400" />
          <h4 className="font-bold text-xl mb-4 text-yellow-400 flex flex-col items-center gap-2">
            <span>MAJOR</span>
            {targetIsMajor && <span className="bg-green-500/20 text-green-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">Correct Answer</span>}
            {!targetIsMajor && <span className="bg-red-500/20 text-red-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">You Chose</span>}
          </h4>
          <div className="scale-75 origin-top"><MiniKeyboard highlightNotes={MAJOR_OFFSETS} /></div>
          <p className="mt-4 text-sm text-slate-300 text-center font-medium">Bright, happy sound.</p>
        </div>

        {/* Minor */}
        <div className={`flex flex-col items-center p-6 rounded-xl border flex-1 relative overflow-hidden transition-all duration-300 ${isMinorPlaying ? 'bg-slate-700 border-indigo-400 shadow-[0_0_20px_rgba(129,140,248,0.3)]' : 'bg-slate-700/50 border-slate-600'}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400" />
          <h4 className="font-bold text-xl mb-4 text-indigo-400 flex flex-col items-center gap-2">
            <span>MINOR</span>
            {!targetIsMajor && <span className="bg-green-500/20 text-green-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">Correct Answer</span>}
            {targetIsMajor && <span className="bg-red-500/20 text-red-400 font-bold uppercase tracking-widest text-xs px-2 py-1 rounded-md">You Chose</span>}
          </h4>
          <div className="scale-75 origin-top"><MiniKeyboard highlightNotes={MINOR_OFFSETS} /></div>
          <p className="mt-4 text-sm text-slate-300 text-center font-medium">Darker, sadder sound.</p>
        </div>
      </div>

      <div className="mt-2 flex justify-center w-full">
        <button 
          onClick={onPlayComparison}
          disabled={isPlayingComparison}
          className="w-full max-w-sm py-4 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-black text-lg rounded-2xl hover:bg-orange-200 transition-all flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" /> COMPARE (PLAY BOTH)
        </button>
      </div>
    </motion.div>
  );
}
