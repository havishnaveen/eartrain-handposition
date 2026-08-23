
import { ArrowDown } from "lucide-react";

export type PianoKeyProps = {
  note: string; // e.g. "C4", "C#4"
  isBlack: boolean;
  isHighlighted: boolean;
  highlightColor?: string; // default orange
};

export const PIANO_KEYS = [
  { note: "C4", isBlack: false },
  { note: "C#4", isBlack: true },
  { note: "D4", isBlack: false },
  { note: "D#4", isBlack: true },
  { note: "E4", isBlack: false },
  { note: "F4", isBlack: false },
  { note: "F#4", isBlack: true },
  { note: "G4", isBlack: false },
  { note: "G#4", isBlack: true },
  { note: "A4", isBlack: false },
  { note: "A#4", isBlack: true },
  { note: "B4", isBlack: false },
  { note: "C5", isBlack: false },
];

type VisualPianoProps = {
  highlightedNotes?: string[]; // array of notes to highlight
  highlightColor?: string;
  highlightMode?: 'color' | 'arrow';
  className?: string;
};

export function VisualPiano({ highlightedNotes = [], highlightColor = "bg-orange-500", highlightMode = "color", className = "" }: VisualPianoProps) {
  const whiteKeys = PIANO_KEYS.filter(k => !k.isBlack);
  
  return (
    <div className={`relative flex justify-center w-full max-w-md mx-auto pt-10 ${className}`}>
      {/* Container for piano */}
      <div className="relative flex bg-stone-900 p-2 rounded-t-xl rounded-b-md shadow-2xl border-b-8 border-stone-800 w-full">
        {whiteKeys.map((wk) => {
          const isHighlighted = highlightedNotes.includes(wk.note);
          return (
            <div 
              key={wk.note}
              className={`relative flex-1 h-32 sm:h-40 rounded-b-md border border-stone-300 mx-[1px] shadow-sm transition-colors duration-300 ${isHighlighted && highlightMode === 'color' ? highlightColor : 'bg-white'}`}
            >
              {isHighlighted && highlightMode === 'color' && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white/50 blur-[2px] animate-pulse" />}
              {isHighlighted && highlightMode === 'arrow' && (
                <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-50">
                  <ArrowDown className="w-10 h-10 text-orange-500 drop-shadow-md animate-bounce" />
                </div>
              )}
            </div>
          );
        })}
        
        {/* Black keys overlaid absolutely */}
        <div className="absolute top-2 left-2 right-2 h-20 sm:h-24 pointer-events-none">
          {PIANO_KEYS.map((k) => {
            if (!k.isBlack) return null;
            const isHighlighted = highlightedNotes.includes(k.note);
            const prevWhiteKeyIndex = whiteKeys.findIndex(wk => wk.note[0] === k.note[0]);
            const totalWhiteKeys = whiteKeys.length;
            const keyWidthPct = 100 / totalWhiteKeys;
            const leftPct = (prevWhiteKeyIndex + 1) * keyWidthPct;
            
            return (
              <div 
                key={k.note}
                className={`absolute w-[8%] sm:w-[10%] max-w-[32px] h-20 sm:h-24 rounded-b-md border border-black transform -translate-x-1/2 transition-colors duration-300 ${isHighlighted && highlightMode === 'color' ? highlightColor : 'bg-stone-900'}`}
                style={{ left: `${leftPct}%` }}
              >
                {isHighlighted && highlightMode === 'color' && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/50 blur-[1px] animate-pulse" />}
                {isHighlighted && highlightMode === 'arrow' && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50">
                    <ArrowDown className="w-10 h-10 text-orange-500 drop-shadow-md animate-bounce" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
