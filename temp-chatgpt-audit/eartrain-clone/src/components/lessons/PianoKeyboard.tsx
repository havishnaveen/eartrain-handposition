import { cn } from "@/lib/utils";

type PianoKeyboardProps = {
  startNote?: string; // e.g. "C3"
  endNote?: string; // e.g. "C5"
  highlightedNotes?: string[]; // e.g. ["C4", "E4"]
  activeNotes?: string[]; // Currently playing notes
  size?: 'normal' | 'small'; // Allow smaller rendering
}

// A simple map for standard piano keys
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function PianoKeyboard({ startNote = "C3", endNote = "C5", highlightedNotes = [], activeNotes = [], size = 'normal' }: PianoKeyboardProps) {
  
  // Parse start/end
  const startOctave = parseInt(startNote.replace(/[^0-9]/g, '')) || 3;
  const endOctave = parseInt(endNote.replace(/[^0-9]/g, '')) || 5;
  const startNoteName = startNote.replace(/[0-9]/g, '');
  const endNoteName = endNote.replace(/[0-9]/g, '');
  
  const keys: { note: string; isBlack: boolean }[] = [];
  
  let started = false;
  
  for (let oct = Math.min(startOctave, endOctave); oct <= Math.max(startOctave, endOctave); oct++) {
    for (const note of NOTES) {
      if (!started && oct === startOctave && note === startNoteName) started = true;
      if (started) {
        const fullNote = `${note}${oct}`;
        const isBlack = note.includes("#");
        keys.push({ note: fullNote, isBlack });
      }
      if (started && oct === endOctave && note === endNoteName) {
        started = false;
        break; // Stop after end note
      }
    }
  }

  // Dimensions based on size
  const whiteKeyClass = size === 'normal' ? "w-10 sm:w-12 h-32 sm:h-40" : "w-6 sm:w-8 h-20 sm:h-24";
  const blackKeyClass = size === 'normal' ? "w-6 sm:w-8 h-20 sm:h-24" : "w-4 sm:w-5 h-12 sm:h-16";
  const blackKeyLeftOffsetMobile = size === 'normal' ? "2.5rem" : "1.5rem";
  const blackKeyLeftOffsetMobileSubtract = size === 'normal' ? "0.75rem" : "0.5rem";
  
  const blackKeyLeftOffsetDesktop = size === 'normal' ? "3rem" : "2rem";
  const blackKeyLeftOffsetDesktopSubtract = size === 'normal' ? "1rem" : "0.625rem";

  return (
    <div className="relative w-full overflow-x-auto select-none pt-4 pb-8">
      <div className="flex relative shadow-xl rounded-b-lg border-t-8 border-orange-950 dark:border-stone-900 bg-black w-max mx-auto">
        {keys.map((k) => {
          if (k.isBlack) return null;
          
          const isHighlighted = highlightedNotes.includes(k.note);
          const isActive = activeNotes.includes(k.note);
          
          return (
            <div 
              key={k.note}
              className={cn(
                `relative bg-white border border-stone-300 rounded-b-md z-0 flex items-end justify-center pb-2 transition-colors duration-75 ${whiteKeyClass}`,
                isHighlighted && !isActive && "bg-orange-100",
                isActive && "bg-orange-300 shadow-[inset_0_-10px_20px_rgba(234,88,12,0.4)]"
              )}
            >
              {(isHighlighted || isActive) && (
                <div className="text-[10px] font-bold text-orange-800/50 absolute bottom-2">{k.note}</div>
              )}
            </div>
          );
        })}
        
        {/* Absolute position black keys over the white keys */}
        {keys.map((k, i) => {
          if (!k.isBlack) return null;
          
          // Calculate left position based on how many white keys came before it
          const whiteKeysBefore = keys.slice(0, i).filter(key => !key.isBlack).length;
          const isHighlighted = highlightedNotes.includes(k.note);
          const isActive = activeNotes.includes(k.note);
          
          return (
            <div 
              key={k.note}
              data-note={k.note}
              className={cn(
                `absolute top-0 bg-stone-900 rounded-b-sm z-10 flex items-end justify-center pb-2 transition-colors duration-75 shadow-md ${blackKeyClass}`,
                isHighlighted && !isActive && "bg-stone-700",
                isActive && "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.6)]"
              )}
              style={{
                left: `calc(${whiteKeysBefore} * (${blackKeyLeftOffsetMobile}) - ${blackKeyLeftOffsetMobileSubtract})`,
              }}
            >
              {(isHighlighted || isActive) && (
                <div className="text-[9px] font-bold text-white/70 absolute bottom-1">{k.note}</div>
              )}
            </div>
          );
        })}
        {/* We need a custom style to handle responsive left offset */}
        <style dangerouslySetInnerHTML={{__html: `
          @media (min-width: 640px) {
            ${keys.filter(k => k.isBlack).map((k) => {
              const whiteKeysBefore = keys.slice(0, keys.findIndex(x => x.note === k.note)).filter(key => !key.isBlack).length;
              return `
                div[data-note="${k.note}"] {
                  left: calc(${whiteKeysBefore} * ${blackKeyLeftOffsetDesktop} - ${blackKeyLeftOffsetDesktopSubtract}) !important;
                }
              `;
            }).join('\n')}
          }
        `}} />
      </div>
    </div>
  );
}
