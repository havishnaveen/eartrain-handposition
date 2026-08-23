import { MusicStaff } from "../MusicStaff";
import { Button } from "./button";
import { Play } from "lucide-react";
import { useState } from "react";
import { playNote, stopAllAudio, loadSample } from "@/lib/audio";

export type VisualHintProps = {
  type: "scale-walkup" | "static";
  notes: { note: string, octave: number }[];
  caption: string;
};

const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function getNoteValue(note: string, octave: number) {
  const index = CHROMATIC_SCALE.indexOf(note.replace(/[^A-G#]/g, ''));
  return octave * 12 + index;
}

export function VisualHint({ type, notes, caption }: VisualHintProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayedNotes, setDisplayedNotes] = useState<{note: string, octave: number}[]>(
    type === "scale-walkup" ? [{ note: "C", octave: 4 }] : notes
  );

  const handlePlayWalkup = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();

    if (type === "scale-walkup" && notes.length > 0) {
      const targetNote = notes[0];
      const startNote = { note: "C", octave: 4 };
      
      const startVal = getNoteValue(startNote.note, startNote.octave);
      const targetVal = getNoteValue(targetNote.note, targetNote.octave);
      
      const walkupNotes = [];
      const step = startVal <= targetVal ? 1 : -1;
      
      for (let v = startVal; step > 0 ? v <= targetVal : v >= targetVal; v += step) {
        const oct = Math.floor(v / 12);
        const nt = CHROMATIC_SCALE[v % 12];
        walkupNotes.push({ note: nt, octave: oct });
      }

      // Preload all notes so audio is perfectly in sync with visuals
      await Promise.all(walkupNotes.map(n => loadSample(n.note, n.octave)));

      setDisplayedNotes([walkupNotes[0]]);
      
      for (let i = 0; i < walkupNotes.length; i++) {
        setDisplayedNotes(walkupNotes.slice(0, i + 1));
        // Wait for DOM to actually paint before firing audio so it's perfectly synced visually
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        playNote(walkupNotes[i].note, walkupNotes[i].octave, 0.5, 1, 0);
        await new Promise(r => setTimeout(r, 600));
      }
    } else if (type === "static") {
      await Promise.all(notes.map(n => loadSample(n.note, n.octave)));
      for (let i = 0; i < notes.length; i++) {
        playNote(notes[i].note, notes[i].octave, 1, 1, 0);
        await new Promise(r => setTimeout(r, 800));
      }
    }
    
    setIsPlaying(false);
  };

  return (
    <div className="w-full flex flex-col items-center my-8 bg-orange-500/5 border border-orange-500/20 p-6 rounded-2xl">
      <div className="flex items-center justify-between w-full mb-4">
        <h3 className="text-xl font-bold text-orange-950 dark:text-orange-100">{caption}</h3>
        {type === "scale-walkup" && (
          <Button onClick={handlePlayWalkup} disabled={isPlaying} variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white">
            <Play className="w-4 h-4 mr-2" /> Play Anchor Sequence
          </Button>
        )}
      </div>
      
      <MusicStaff notes={displayedNotes} caption="" />
    </div>
  );
}
