import { Play } from "lucide-react";
import { Button } from "./button";

export type BeatGridProps = {
  beats: number;
  timeSig: string;
  onPlay?: () => void;
  isPlaying?: boolean;
};

export function BeatGrid({ beats, timeSig, onPlay, isPlaying }: BeatGridProps) {
  // Generate 2 measures
  const totalBeats = beats * 2;
  const blocks = [];
  
  for (let i = 0; i < totalBeats; i++) {
    const isAccent = (i % beats === 0) || (timeSig === "6/8" && i % beats === 3);
    blocks.push(
      <div 
        key={i}
        className={`h-16 rounded-lg transition-all flex items-center justify-center font-bold text-lg
          ${isAccent 
            ? 'w-16 bg-orange-500 text-white shadow-md' 
            : 'w-12 bg-orange-100 dark:bg-orange-950/40 text-orange-400 border border-orange-200 dark:border-orange-900/50'
          }`}
      >
        {isAccent ? '>' : ''}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center my-8 bg-orange-500/5 border border-orange-500/20 p-6 rounded-2xl">
      <div className="flex items-center justify-between w-full mb-6">
        <h3 className="text-xl font-bold text-orange-950 dark:text-orange-100">Visualize the Accents</h3>
        {onPlay && (
          <Button onClick={onPlay} disabled={isPlaying} variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white">
            <Play className="w-4 h-4 mr-2" /> Play Rhythm
          </Button>
        )}
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
        {blocks}
      </div>
    </div>
  );
}
