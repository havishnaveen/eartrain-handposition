import { useState, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent } from "@/lib/audio";
import { Link } from "react-router-dom";

type Interval = "Minor 6th" | "Major 6th" | "Minor 7th" | "Major 7th";

export function IntervalTrainingLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetInterval = useRef<Interval>("Minor 6th");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const intervalsData: Record<Interval, { notes: { note: string; octave: number }[]; desc: string }> = {
    "Minor 6th": { notes: [{ note: "C", octave: 4 }, { note: "G#", octave: 4 }], desc: "Sad, romantic, 'Love Story' theme." },
    "Major 6th": { notes: [{ note: "C", octave: 4 }, { note: "A", octave: 4 }], desc: "Happy, bright, 'NBC' chimes." },
    "Minor 7th": { notes: [{ note: "C", octave: 4 }, { note: "A#", octave: 4 }], desc: "Bluesy, unresolved, funky." },
    "Major 7th": { notes: [{ note: "C", octave: 4 }, { note: "B", octave: 4 }], desc: "Dreamy, jazzy, sharp dissonance right below the octave." },
  };

  const playInterval = async (interval: Interval) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const notes = intervalsData[interval].notes;
    const events: SequenceEvent[] = [
      // Chord
      { notes, duration: 1.5, gapAfter: 0.8 },
      // Broken
      { notes: [notes[0]], duration: 0.8, gapAfter: 0 },
      { notes: [notes[1]], duration: 0.8, gapAfter: 0 }
    ];

    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const keys: Interval[] = ["Minor 6th", "Major 6th", "Minor 7th", "Major 7th"];
    const randomInterval = keys[Math.floor(Math.random() * keys.length)];
    targetInterval.current = randomInterval;
    
    // Pick random root note
    const roots = ["C", "D", "E", "F", "G", "A"];
    const root = roots[Math.floor(Math.random() * roots.length)];
    
    // Calculate top note roughly
    let topNote = "";
    if (randomInterval === "Minor 6th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 5);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
      topNote += "#"; // simplistic mapping just for ear training
    } else if (randomInterval === "Major 6th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 5);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
    } else if (randomInterval === "Minor 7th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 6);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
      topNote += "#";
    } else if (randomInterval === "Major 7th") {
      topNote = String.fromCharCode(root.charCodeAt(0) + 6);
      if (topNote > "G") topNote = String.fromCharCode(topNote.charCodeAt(0) - 7);
    }

    // fallback to C root
    const notes = intervalsData[randomInterval].notes;
    
    quizEvents.current = [
      { notes, duration: 1.5, gapAfter: 0.8 },
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
    
    await playSequenceWithUI(quizEvents.current, () => {}); 
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: Interval) => {
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
      
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Expand your interval training by recognizing 6ths and 7ths. These are wider intervals that often serve as the color notes in jazz and advanced harmony.
          <br /><br />
          <strong>Theory:</strong> Every interval corresponds to an exact semitone distance from the root. A Major 6th is 9 semitones, a Minor 7th is 10 semitones, and a Major 7th is 11 semitones. Recognizing these wider intervals requires identifying the exact degree of tension relative to the octave (12 semitones).
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="C5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(intervalsData) as Interval[]).map((interval) => (
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
        <p className="text-stone-600 dark:text-stone-400 mb-6">Listen to the interval (played harmonically, then broken). Which wide interval is it?</p>
        
        <div className="flex flex-col gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto self-start gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Mystery Interval
          </Button>
          
          <div className="grid grid-cols-2 gap-2 w-full">
            {(Object.keys(intervalsData) as Interval[]).map((interval) => (
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
             <p className="text-sm">If you thought that was a {targetInterval.current}, you might be confusing the tension levels. A Minor 6th sounds quite sad, a Major 6th is very happy. A Minor 7th sounds like blues/rock, and a Major 7th sounds extremely dreamy but very tense right next to the octave. Listen again and try to categorize the "flavor" first!</p>
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
