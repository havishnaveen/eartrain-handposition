import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

type SeventhChord = "Major 7" | "Dominant 7" | "Minor 7" | "Half-Dim 7" | "Full-Dim 7";

export function SeventhChordsLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetChord = useRef<SeventhChord>("Major 7");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const chordsData: Record<SeventhChord, { notes: { note: string; octave: number }[]; desc: string }> = {
    "Major 7": { notes: [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }], desc: "Dreamy, nostalgic. Major triad + Major 7th." },
    "Dominant 7": { notes: [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "A#", octave: 4 }], desc: "Bluesy, wants to resolve. Major triad + Minor 7th." },
    "Minor 7": { notes: [{ note: "C", octave: 4 }, { note: "D#", octave: 4 }, { note: "G", octave: 4 }, { note: "A#", octave: 4 }], desc: "Smooth, jazzy. Minor triad + Minor 7th." },
    "Half-Dim 7": { notes: [{ note: "C", octave: 4 }, { note: "D#", octave: 4 }, { note: "F#", octave: 4 }, { note: "A#", octave: 4 }], desc: "Suspenseful, romantic. Diminished triad + Minor 7th." },
    "Full-Dim 7": { notes: [{ note: "C", octave: 4 }, { note: "D#", octave: 4 }, { note: "F#", octave: 4 }, { note: "A", octave: 4 }], desc: "Scary, villainous. Diminished triad + Diminished 7th." },
  };

  const playChord = async (chord: SeventhChord) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const notes = chordsData[chord].notes;
    const events: SequenceEvent[] = [
      // Chord
      { notes, duration: 1.5, gapAfter: 0.8 },
      // Broken
      { notes: [notes[0]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[1]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[2]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[3]], duration: 0.8, gapAfter: 0 }
    ];

    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const keys: SeventhChord[] = ["Major 7", "Dominant 7", "Minor 7", "Half-Dim 7", "Full-Dim 7"];
    const randomChord = keys[Math.floor(Math.random() * keys.length)];
    targetChord.current = randomChord;
    
    // Pick random root note
    const roots = ["C", "D", "E", "F", "G", "A"];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const rootOct = 4;
    
    const scale = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const rootIdx = scale.indexOf(root);
    
    const getNote = (semitones: number) => {
      const idx = (rootIdx + semitones) % 12;
      const octaveOffset = Math.floor((rootIdx + semitones) / 12);
      return { note: scale[idx], octave: rootOct + octaveOffset };
    };

    let notes: {note: string, octave: number}[] = [];
    if (randomChord === "Major 7") notes = [getNote(0), getNote(4), getNote(7), getNote(11)];
    else if (randomChord === "Dominant 7") notes = [getNote(0), getNote(4), getNote(7), getNote(10)];
    else if (randomChord === "Minor 7") notes = [getNote(0), getNote(3), getNote(7), getNote(10)];
    else if (randomChord === "Half-Dim 7") notes = [getNote(0), getNote(3), getNote(6), getNote(10)];
    else if (randomChord === "Full-Dim 7") notes = [getNote(0), getNote(3), getNote(6), getNote(9)];
    
    quizEvents.current = [
      { notes, duration: 1.5, gapAfter: 0.8 },
      { notes: [notes[0]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[1]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[2]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[3]], duration: 0.8, gapAfter: 0 }
    ];
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    
    if (quizStatus === "correct" || quizEvents.current.length === 0) {
      generateQuiz();
    }
    
    await playSequenceWithUI(quizEvents.current, () => {}); 
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: SeventhChord) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetChord.current) {
      setQuizStatus("correct");
      setUnlocked(true);
      setTimeout(() => {
        generateQuiz();
        setQuizStatus("idle");
      }, 1500);
    } else {
      setQuizStatus("wrong");
    }
  };

  return (
    <div className="space-y-10">
      
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Seventh chords add a 4th note to a triad, creating a lush, jazzy, or bluesy sound.
          <br /><br />
          <strong>Theory:</strong> 7th chords add another 3rd interval on top of a triad. A Major 7th chord adds a Major 7th interval (11 semitones) above the root. A Dominant 7th adds a Minor 7th interval (10 semitones) to a Major triad, creating a dissonant tritone between the 3rd and 7th that demands resolution. A Minor 7th adds a Minor 7th interval to a Minor triad.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="C5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {(Object.keys(chordsData) as SeventhChord[]).map((chord) => (
          <Button 
            key={chord}
            variant="outline" 
            className="h-auto p-4 flex flex-col items-center justify-center gap-2 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            onClick={() => playChord(chord)}
            disabled={isPlaying}
          >
            <div className={`w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-900/50 flex items-center justify-center text-stone-600 dark:text-stone-400`}>
              <Play className="w-4 h-4 ml-1" />
            </div>
            <div className="text-center">
              <div className="font-bold text-sm">{chord}</div>
              <div className="text-[10px] text-stone-500 whitespace-normal mt-1 leading-tight">{chordsData[chord].desc}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Listen to the 7th chord (played harmonically, then broken). Which is it?</p>
        
        <div className="flex flex-col gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto self-start gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Mystery Chord
          </Button>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
            {(Object.keys(chordsData) as SeventhChord[]).map((chord) => (
              <Button 
                key={`guess-${chord}`}
                size="lg"
                variant="outline"
                disabled={isPlaying}
                className={`border-2 h-auto py-3 ${quizStatus === 'correct' && targetChord.current === chord ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetChord.current === chord ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-stone-400'}`}
                onClick={() => handleGuess(chord)}
              >
                {chord}
              </Button>
            ))}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was {targetChord.current}, focus on the base triad first! Does it sound happy (Major/Dominant), sad (Minor), or scary/tense (Half-Dim/Full-Dim)? Once you have the base triad, listen to the very top note. If it clashes beautifully with the root, it's a Major 7th. If it's a bit flatter and bluesy, it's a Minor 7th!</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Great listening!
            </div>
            <Link to="/exercises">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                Go to Exercise <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>

    </div>
  )
}
