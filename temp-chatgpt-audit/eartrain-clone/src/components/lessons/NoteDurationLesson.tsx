import { useState, useRef } from "react";
import { MetronomeDots } from "./MetronomeDots";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ChevronRight } from "lucide-react";
import { getAudioContext, loadSample, scheduleNote, playMetronomeClick, getAudioSession } from "@/lib/audio";
import { Link } from "react-router-dom";

export function NoteDurationLesson({ extended = false }: { extended?: boolean }) {
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Try It State
  const [unlocked, setUnlocked] = useState(false);
  const [quizStatus, setQuizStatus] = useState<"idle" | "playing" | "wrong" | "correct">("idle");
  const targetDuration = useRef<number>(1); // e.g. 1 for Quarter, 0.5 for Eighth

  const playDemo = async (beatsPerNote: number) => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    await loadSample("C", 4);
    const session = getAudioSession();
    if (session !== getAudioSession()) return;
    
    const bpm = 80;
    const secPerBeat = 60 / bpm;
    const startTime = audioCtx.currentTime + 0.1;
    
    // Always play 4 beats total for the demo
    const totalBeats = 4;
    
    // Schedule Metronome
    for (let i = 0; i < totalBeats; i++) {
      const delayMs = (startTime + (i * secPerBeat) - audioCtx.currentTime) * 1000;
      playMetronomeClick(i === 0, delayMs);
    }
    
    // Schedule Piano Notes (Only on beat 1 to demonstrate the duration explicitly)
    const totalNotesToPlay = beatsPerNote >= 1 ? 1 : 1 / beatsPerNote;
    for (let i = 0; i < totalNotesToPlay; i++) {
      const noteStartTime = startTime + (i * beatsPerNote * secPerBeat);
      scheduleNote("C", 4, beatsPerNote * secPerBeat * 0.95, 1, noteStartTime);
    }
    
    // UI Updates
    for (let i = 0; i < totalBeats; i++) {
      const waitTime = (startTime + (i * secPerBeat) - audioCtx.currentTime) * 1000;
      if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
      if (session !== getAudioSession()) return;
      
      setActiveBeat(i + 1);
    }
    
    const finalWait = (startTime + (totalBeats * secPerBeat) - audioCtx.currentTime) * 1000;
    if (finalWait > 0) await new Promise(r => setTimeout(r, finalWait));
    setActiveBeat(null);
    setIsPlaying(false);
  };

  const playTryIt = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setQuizStatus("playing");
    
    // Randomize
    if (quizStatus === "correct") {
      const options = extended ? [0.5, 0.25] : [1, 2, 4];
      const choice = options[Math.floor(Math.random() * options.length)];
      targetDuration.current = choice;
    }
    const choice = targetDuration.current;
    
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    await loadSample("G", 4);
    const session = getAudioSession();
    if (session !== getAudioSession()) return;
    
    const bpm = 80;
    const secPerBeat = 60 / bpm;
    const startTime = audioCtx.currentTime + 0.1;
    const totalBeats = 4;
    
    // Schedule Metronome
    for (let i = 0; i < totalBeats; i++) {
      const delayMs = (startTime + (i * secPerBeat) - audioCtx.currentTime) * 1000;
      playMetronomeClick(i === 0, delayMs);
    }
    
    // Schedule Piano Notes (Only on beat 1)
    const totalNotesToPlay = choice >= 1 ? 1 : 1 / choice;
    for (let i = 0; i < totalNotesToPlay; i++) {
      const noteStartTime = startTime + (i * choice * secPerBeat);
      scheduleNote("G", 4, choice * secPerBeat * 0.95, 1, noteStartTime);
    }
    
    const finalWait = (startTime + (totalBeats * secPerBeat) - audioCtx.currentTime) * 1000;
    if (finalWait > 0) await new Promise(r => setTimeout(r, finalWait));
    
    setIsPlaying(false);
    setQuizStatus(prev => prev === "wrong" ? "wrong" : "idle");
  };

  const handleGuess = (guess: number) => {
    if (quizStatus === "playing" || isPlaying) return;
    if (guess === targetDuration.current) {
      setQuizStatus("correct");
      setUnlocked(true);
      setTimeout(() => {
        const options = extended ? [0.5, 0.25] : [1, 2, 4];
        targetDuration.current = options[Math.floor(Math.random() * options.length)];
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
        {!extended ? (
          <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
            Music is divided into equal chunks of time called <strong>Measures</strong>. The steady pulse you tap your foot to are the <strong>Beats</strong>. A standard measure has 4 beats.
            <br /><br />
            <strong>Theory:</strong> Musical time is divided into beats based on a time signature. In 4/4 time, a Whole note spans 4 beats, a Half note spans 2 beats, and a Quarter note spans 1 beat. The duration represents the exact mathematical division of time.
          </p>
        ) : (
          <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
            Notes can also be split to be <em>shorter</em> than a single beat!
            <br /><br />
            <strong>Theory:</strong> Building on basic durations, an Eighth note divides a beat exactly in half, so two Eighth notes fit into one Quarter note. A Sixteenth note divides a beat into quarters, meaning four Sixteenth notes fit into a single Quarter note beat.
          </p>
        )}
      </div>

      {/* Visual Anchor */}
      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <MetronomeDots activeBeat={activeBeat} subdivisions={extended ? "sixteenth" : "quarter"} accentFirstBeat={true} />
      </div>

      {/* Audio Demos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {!extended ? (
          <>
            <Button 
              variant="outline" 
              className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              onClick={() => playDemo(1)}
              disabled={isPlaying}
            >
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Play className="w-6 h-6 ml-1" />
              </div>
              <span className="font-bold text-lg text-center">Quarter Note<br/><span className="text-sm font-normal text-stone-500">(1 Beat)</span></span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              onClick={() => playDemo(2)}
              disabled={isPlaying}
            >
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Play className="w-6 h-6 ml-1" />
              </div>
              <span className="font-bold text-lg text-center">Half Note<br/><span className="text-sm font-normal text-stone-500">(2 Beats)</span></span>
            </Button>

            <Button 
              variant="outline" 
              className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={() => playDemo(4)}
              disabled={isPlaying}
            >
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Play className="w-6 h-6 ml-1" />
              </div>
              <span className="font-bold text-lg text-center">Whole Note<br/><span className="text-sm font-normal text-stone-500">(4 Beats)</span></span>
            </Button>
          </>
        ) : (
          <>
            <Button 
              variant="outline" 
              className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              onClick={() => playDemo(0.5)}
              disabled={isPlaying}
            >
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Play className="w-6 h-6 ml-1" />
              </div>
              <span className="font-bold text-lg text-center">Eighth Notes<br/><span className="text-sm font-normal text-stone-500">(2 per Beat)</span></span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={() => playDemo(0.25)}
              disabled={isPlaying}
            >
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Play className="w-6 h-6 ml-1" />
              </div>
              <span className="font-bold text-lg text-center">Sixteenth Notes<br/><span className="text-sm font-normal text-stone-500">(4 per Beat)</span></span>
            </Button>
            
            <div className="hidden md:block"></div> {/* Spacer for grid */}
          </>
        )}
      </div>

      {/* Try It Mechanic */}
      <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
        <h3 className="text-2xl font-bold mb-4">Try It Yourself!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">Press play to hear a sequence of notes played over the metronome. Can you identify the duration?</p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 flex-wrap">
          <Button 
            size="lg"
            onClick={playTryIt}
            disabled={isPlaying}
            className="w-full sm:w-auto gap-2 bg-stone-800 hover:bg-stone-700 text-white shrink-0"
          >
            <Play className="w-4 h-4" /> Hear Sequence
          </Button>
          
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            {!extended ? (
              <>
                <Button 
                  size="lg" variant="outline" disabled={isPlaying}
                  className={`flex-1 sm:flex-none sm:w-28 border-2 ${quizStatus === 'correct' && targetDuration.current === 1 ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDuration.current === 1 ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-orange-500'}`}
                  onClick={() => handleGuess(1)}
                >
                  Quarter
                </Button>
                <Button 
                  size="lg" variant="outline" disabled={isPlaying}
                  className={`flex-1 sm:flex-none sm:w-28 border-2 ${quizStatus === 'correct' && targetDuration.current === 2 ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDuration.current === 2 ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-emerald-500'}`}
                  onClick={() => handleGuess(2)}
                >
                  Half
                </Button>
                <Button 
                  size="lg" variant="outline" disabled={isPlaying}
                  className={`flex-1 sm:flex-none sm:w-28 border-2 ${quizStatus === 'correct' && targetDuration.current === 4 ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDuration.current === 4 ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-amber-500'}`}
                  onClick={() => handleGuess(4)}
                >
                  Whole
                </Button>
              </>
            ) : (
              <>
                <Button 
                  size="lg" variant="outline" disabled={isPlaying}
                  className={`flex-1 sm:flex-none sm:w-32 border-2 ${quizStatus === 'correct' && targetDuration.current === 0.5 ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDuration.current === 0.5 ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-orange-500'}`}
                  onClick={() => handleGuess(0.5)}
                >
                  Eighths
                </Button>
                <Button 
                  size="lg" variant="outline" disabled={isPlaying}
                  className={`flex-1 sm:flex-none sm:w-32 border-2 ${quizStatus === 'correct' && targetDuration.current === 0.25 ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : quizStatus === 'wrong' && targetDuration.current === 0.25 ? 'border-amber-500 bg-amber-50 text-amber-600' : 'hover:border-amber-500'}`}
                  onClick={() => handleGuess(0.25)}
                >
                  Sixteenths
                </Button>
              </>
            )}
          </div>
        </div>
        
        {quizStatus === "wrong" && (
           <div className="mt-4 text-amber-600 font-medium animate-in fade-in slide-in-from-top-2">
             <p className="font-bold mb-1"><X className="w-4 h-4 inline-block mr-1 mb-0.5" /> Incorrect! Let's break it down.</p>
             <p className="text-sm">
               {extended 
                 ? "Listen closely to the very first click of the metronome. Are there exactly TWO notes played over that single click (Eighth Notes) or FOUR very fast notes (Sixteenth Notes)?"
                 : "Listen to how long the single note lasts compared to the metronome clicks. Does it end right before the 2nd click (Quarter), right before the 3rd click (Half), or does it ring out for the entire 4 clicks (Whole)?"
               }
             </p>
           </div>
        )}

        {unlocked && (
          <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-bottom-4">
            <div className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Check className="w-5 h-5" /> Lesson Unlocked! Great rhythm!
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
