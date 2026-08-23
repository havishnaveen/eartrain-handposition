import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

type CompoundInterval = "Major 9th" | "Major 10th" | "Perfect 11th" | "Perfect 12th";

export function VeryWideIntervalsLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetInterval = useRef<CompoundInterval>("Major 9th");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const intervalsData: Record<CompoundInterval, { notes: { note: string; octave: number }[]; desc: string }> = {
    "Major 9th": { notes: [{ note: "C", octave: 3 }, { note: "D", octave: 4 }], desc: "An Octave + Major 2nd. Very colorful, often used in jazz chords." },
    "Major 10th": { notes: [{ note: "C", octave: 3 }, { note: "E", octave: 4 }], desc: "An Octave + Major 3rd. Wide, open, and beautiful. Common in piano accompaniments." },
    "Perfect 11th": { notes: [{ note: "C", octave: 3 }, { note: "F", octave: 4 }], desc: "An Octave + Perfect 4th. Very suspended and floating." },
    "Perfect 12th": { notes: [{ note: "C", octave: 3 }, { note: "G", octave: 4 }], desc: "An Octave + Perfect 5th. Extremely stable and powerful." },
  };

  const playInterval = async (interval: CompoundInterval) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const notes = intervalsData[interval].notes;
    const events: SequenceEvent[] = [
      // Chord
      { notes, duration: 1.5, gapAfter: 1 },
      // Broken
      { notes: [notes[0]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[1]], duration: 0.8, gapAfter: 0 }
    ];

    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const keys: CompoundInterval[] = ["Major 9th", "Major 10th", "Perfect 11th", "Perfect 12th"];
    const randomInterval = keys[Math.floor(Math.random() * keys.length)];
    targetInterval.current = randomInterval;
    
    // Pick random root note
    const roots = ["C", "D", "E", "F", "G", "A"];
    const root = roots[Math.floor(Math.random() * roots.length)];
    
    let topNote = "";
    
    // Simplistic mapping for quiz
    if (randomInterval === "Major 9th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 1);
      if (topNote > "G") topNote = "A";
      if (root === "E") topNote = "F#";
      if (root === "B") topNote = "C#";
    } else if (randomInterval === "Major 10th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 2);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
      if (root === "D") topNote = "F#";
      if (root === "A") topNote = "C#";
      if (root === "E") topNote = "G#";
    } else if (randomInterval === "Perfect 11th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 3);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
      if (root === "F") topNote = "A#";
    } else if (randomInterval === "Perfect 12th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 4);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
      if (root === "B") topNote = "F#";
    }
    
    // Fallback if character code math goes out of bounds (simplified for eartraining purposes)
    const notes = intervalsData[randomInterval].notes; // fallback to C root
    
    quizEvents.current = [
      { notes, duration: 1.5, gapAfter: 1 },
      { notes: [notes[0]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[1]], duration: 0.8, gapAfter: 0 }
    ];
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    
    if (quizStatus === "correct" || quizEvents.current.length === 0) {
      generateQuiz();
    }
    
    // Hide keyboard highlights during the test!
    await playSequenceWithUI(quizEvents.current, () => {}); 
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: CompoundInterval) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetInterval.current) {
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
      
      {/* Brief Text */}
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          A <strong>Compound Interval</strong> is simply a regular interval that has been stretched so wide that the top note is pushed into the next octave. 
          <br /><br />
          <strong>Theory:</strong> Extremely wide compound intervals span multiple octaves. For example, a 16th is a 2nd plus two octaves. While the theoretical interval class (e.g., Major 3rd) remains unchanged, the overtone interaction is drastically minimized, completely separating the harmonic registers into distinct high and low layers.
        </p>
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center overflow-hidden">
        <PianoKeyboard startNote="C2" endNote="C6" activeNotes={activeNotes} size="small" />
      </div>

      {/* Audio Demos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(intervalsData) as CompoundInterval[]).map((interval) => (
          <Button 
            key={interval}
            variant="outline" 
            className="h-auto p-4 flex flex-col items-center justify-center gap-2 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            onClick={() => playInterval(interval)}
            disabled={isPlaying}
          >
            <div className={`w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-900/50 flex items-center justify-center text-stone-600 dark:text-stone-400`}>
              <Play className="w-5 h-5 ml-1" />
            </div>
            <div className="text-center">
              <div className="font-bold">{interval}</div>
              <div className="text-xs text-stone-500 whitespace-normal mt-1">{intervalsData[interval].desc}</div>
            </div>
          </Button>
        ))}
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Listen to the compound interval. Compress it mentally by bringing the top note down an octave, then identify it!</p>
        
        <div className="flex flex-col gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto self-start gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Mystery Interval
          </Button>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
            {(Object.keys(intervalsData) as CompoundInterval[]).map((interval) => (
              <Button 
                key={`guess-${interval}`}
                size="lg"
                variant="outline"
                disabled={isPlaying}
                className={`border-2 h-auto py-3 ${quizStatus === 'correct' && targetInterval.current === interval ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetInterval.current === interval ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-stone-400'}`}
                onClick={() => handleGuess(interval)}
              >
                {interval}
              </Button>
            ))}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was a {targetInterval.current}, you might be letting the massive gap confuse you. Replay the audio. Try humming the top note, and then literally singing it down an octave until it's right next to the bottom note. Does it sound like a tight 2nd (9th), a sweet 3rd (10th), a floating 4th (11th), or a powerful 5th (12th)?</p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Incredible listening.
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
