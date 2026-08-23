import { useState, useRef } from "react";
import { MetronomeDots } from "./MetronomeDots";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight, Music } from "lucide-react";
import { playMetronomeClick, playSequenceWithUI, SequenceEvent, getAudioSession, waitAudio } from "@/lib/audio";
import { Link } from "react-router-dom";

type TimeSignature = "3/4 Time" | "4/4 Time";

export function TimeSignatureLesson() {
  const [activeBeat, setActiveBeat] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatsCount, setBeatsCount] = useState<number>(4);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetTime = useRef<TimeSignature>("4/4 Time");
  const quizEvents = useRef<SequenceEvent[]>([]);

  const play44Metronome = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setBeatsCount(4);
    const session = getAudioSession();
    
    // Play 2 measures
    for (let m = 0; m < 2; m++) {
      for (let i = 0; i < 4; i++) {
        if (session !== getAudioSession()) {
          setActiveBeat(-1);
          setIsPlaying(false);
          return;
        }
        setActiveBeat(i + 1);
        playMetronomeClick(i === 0, 0); // Accent on beat 1
        const ok = await waitAudio(600);
        if (!ok) {
          setActiveBeat(-1);
          setIsPlaying(false);
          return;
        }
      }
    }
    setActiveBeat(-1);
    setIsPlaying(false);
  };

  const play34Metronome = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setBeatsCount(3);
    const session = getAudioSession();
    
    // Play 2 measures
    for (let m = 0; m < 2; m++) {
      for (let i = 0; i < 3; i++) {
        if (session !== getAudioSession()) {
          setActiveBeat(-1);
          setIsPlaying(false);
          return;
        }
        setActiveBeat(i + 1);
        playMetronomeClick(i === 0, 0); // Accent on beat 1
        const ok = await waitAudio(600);
        if (!ok) {
          setActiveBeat(-1);
          setIsPlaying(false);
          return;
        }
      }
    }
    setActiveBeat(-1);
    setIsPlaying(false);
  };

  const generateQuiz = () => {
    const is34 = Math.random() > 0.5;
    targetTime.current = is34 ? "3/4 Time" : "4/4 Time";
    
    // Generate a simple melody in that time signature
    // We'll just map to generic scale degrees to keep it simple, played as a sequence
    const events: SequenceEvent[] = [];
    const beatDuration = 0.5;
    
    if (is34) {
      // 3/4 melody: e.g., C - E - G | F - D - B | C
      events.push(
        { notes: [{ note: "C", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "E", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "G", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        
        { notes: [{ note: "F", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "D", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "B", octave: 3 }], duration: beatDuration, gapAfter: 0 },
        
        { notes: [{ note: "C", octave: 4 }], duration: beatDuration * 3, gapAfter: 0 }
      );
    } else {
      // 4/4 melody: e.g., C - D - E - F | G - F - D - B | C
      events.push(
        { notes: [{ note: "C", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "D", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "E", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "F", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        
        { notes: [{ note: "G", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "F", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "D", octave: 4 }], duration: beatDuration, gapAfter: 0 },
        { notes: [{ note: "B", octave: 3 }], duration: beatDuration, gapAfter: 0 },
        
        { notes: [{ note: "C", octave: 4 }], duration: beatDuration * 4, gapAfter: 0 }
      );
    }
    
    quizEvents.current = events;
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    setBeatsCount(targetTime.current === "3/4 Time" ? 3 : 4);
    
    if (quizStatus === "correct" || quizEvents.current.length === 0) {
      generateQuiz();
    }
    
    // Play with UI updates for dots
    const session = getAudioSession();
    let currentBeat = 1;
    let measureBeats = targetTime.current === "3/4 Time" ? 3 : 4;
    
    // Instead of playSequenceWithUI (which doesn't do our custom dots easily), 
    // we'll loop through the events ourselves so we can update the activeBeat dots perfectly!
    for (const ev of quizEvents.current) {
      if (session !== getAudioSession()) break;
      
      setActiveBeat(currentBeat);
      // We use playSequenceWithUI for a single note just to trigger the sound without needing low-level imports here
      playSequenceWithUI([ev], () => {});
      
      currentBeat++;
      if (currentBeat > measureBeats) currentBeat = 1;
      
      const ok = await waitAudio((ev.duration + (ev.gapAfter || 0)) * 1000);
      if (!ok) break;
    }
    
    setActiveBeat(-1);
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: TimeSignature) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetTime.current) {
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
          Time signatures tell you how the beats are grouped. Every measure starts with a strong accent (Beat 1).
          <br /><br />
          <strong>Theory:</strong> A time signature indicates the meter. The top number dictates the number of beats per measure. 3/4 time emphasizes the 1st beat in groups of three. 4/4 time has a primary emphasis on the 1st beat and a secondary emphasis on the 3rd. 6/8 time is a compound meter, grouping 6 eighth notes into two strong pulses of 3.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <MetronomeDots beats={beatsCount} activeBeat={activeBeat} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button variant="outline" className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20" onClick={play44Metronome} disabled={isPlaying}>
          <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Metronome: 4/4 Beat</span>
        </Button>
        <Button variant="outline" className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={play34Metronome} disabled={isPlaying}>
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Play className="w-6 h-6 ml-1" />
          </div>
          <span className="font-bold text-lg">Metronome: 3/4 Beat</span>
        </Button>
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Listen to the piano melody. Tap your foot to the beat. Is it marching in 4, or waltzing in 3?</p>
        
        <div className="flex flex-col gap-4">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto self-start gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Music className="w-4 h-4" /> Hear Mystery Melody
          </Button>
          
          <div className="grid grid-cols-2 gap-2 w-full">
            {(["3/4 Time", "4/4 Time"] as TimeSignature[]).map((sig) => (
              <Button 
                key={`guess-${sig}`}
                size="lg"
                variant="outline"
                disabled={isPlaying}
                className={`border-2 h-auto py-3 ${quizStatus === 'correct' && targetTime.current === sig ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetTime.current === sig ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-stone-400'}`}
                onClick={() => handleGuess(sig)}
              >
                {sig}
              </Button>
            ))}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">If you thought that was {targetTime.current}, try to find the "ONE" - the strongest, most accented note where the pattern repeats. Once you find "ONE", count every beat until the next "ONE". If you count "ONE, two, three, ONE", it's 3/4. If you count "ONE, two, three, four, ONE", it's 4/4. Listen closely to the dots as they light up!</p>
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
