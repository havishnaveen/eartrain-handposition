import { cn } from "@/lib/utils";

type MetronomeDotsProps = {
  activeBeat: number | null; // 1 to 4, or 1.5 for subdivisions
  subdivisions?: "quarter" | "eighth" | "sixteenth";
  accentFirstBeat?: boolean;
  beats?: number;
}

export function MetronomeDots({ activeBeat, subdivisions = "quarter", accentFirstBeat = false, beats = 4 }: MetronomeDotsProps) {
  
  const beatArray = Array.from({length: beats}, (_, i) => i + 1);
  
  return (
    <div className="flex items-center justify-center gap-4 sm:gap-8 py-8">
      {beatArray.map(beat => {
        const isMainActive = Math.floor(activeBeat || 0) === beat && (activeBeat! % 1 === 0 || subdivisions === "quarter");
        
        return (
          <div key={beat} className="flex items-center gap-1 sm:gap-2">
            <div 
              className={cn(
                "w-4 h-4 sm:w-6 sm:h-6 rounded-full transition-all duration-75",
                isMainActive ? "bg-orange-500 scale-125 shadow-[0_0_15px_rgba(249,115,22,0.8)]" : "bg-stone-200 dark:bg-stone-800",
                accentFirstBeat && beat === 1 && !isMainActive && "bg-stone-300 dark:bg-stone-700 w-5 h-5 sm:w-7 sm:h-7",
                accentFirstBeat && beat === 1 && isMainActive && "bg-amber-500 shadow-[0_0_15px_rgba(244,63,94,0.8)] scale-150"
              )}
            />
            
            {/* Subdivisions */}
            {subdivisions === "eighth" && beat < beats && (
              <div 
                className={cn(
                  "w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-75",
                  activeBeat === beat + 0.5 ? "bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)] scale-125" : "bg-stone-100 dark:bg-stone-900"
                )}
              />
            )}
            
            {subdivisions === "sixteenth" && beat < beats && (
              <>
                <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-75", activeBeat === beat + 0.25 ? "bg-amber-400 scale-150" : "bg-stone-100 dark:bg-stone-900")} />
                <div className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-75", activeBeat === beat + 0.5 ? "bg-orange-400 scale-125" : "bg-stone-100 dark:bg-stone-900")} />
                <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-75", activeBeat === beat + 0.75 ? "bg-amber-400 scale-150" : "bg-stone-100 dark:bg-stone-900")} />
              </>
            )}
            
            {/* If it's the last beat, we need to show the subdivisions after it IF we want a full measure, but usually the measure just loops. */}
            {subdivisions === "eighth" && beat === beats && (
              <div className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-75", activeBeat === beats + 0.5 ? "bg-orange-400 scale-125" : "bg-stone-100 dark:bg-stone-900")} />
            )}
            {subdivisions === "sixteenth" && beat === beats && (
              <>
                <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-75", activeBeat === beats + 0.25 ? "bg-amber-400 scale-150" : "bg-stone-100 dark:bg-stone-900")} />
                <div className={cn("w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-75", activeBeat === beats + 0.5 ? "bg-orange-400 scale-125" : "bg-stone-100 dark:bg-stone-900")} />
                <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-75", activeBeat === beats + 0.75 ? "bg-amber-400 scale-150" : "bg-stone-100 dark:bg-stone-900")} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
