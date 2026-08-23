import { useState, useRef, useEffect } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ArrowRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent, stopAllAudio, getRandomNote, getNoteAtInterval } from "@/lib/audio";
import { Link } from "react-router-dom";

type WideIntervalType = "Minor 9th" | "Major 9th" | "Minor 10th" | "Major 10th";

const WIDE_INTERVALS: Record<WideIntervalType, number> = {
  "Minor 9th": 13,
  "Major 9th": 14,
  "Minor 10th": 15,
  "Major 10th": 16,
};

export function WideIntervalsLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isQuizMode, setIsQuizMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<WideIntervalType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const quizAnswerRef = useRef<WideIntervalType | null>(null);
  const quizEventsRef = useRef<SequenceEvent[] | null>(null);

  useEffect(() => {
    const types = Object.keys(WIDE_INTERVALS) as WideIntervalType[];
    const randomType = types[Math.floor(Math.random() * types.length)];
    quizAnswerRef.current = randomType;

    const baseNote = getRandomNote(3, 4);
    const topNote = getNoteAtInterval(baseNote, WIDE_INTERVALS[randomType]);

    quizEventsRef.current = [
      { notes: [baseNote, topNote], duration: 1.5, gapAfter: 1.0 },
      { notes: [baseNote], duration: 0.8, gapAfter: 0.2 },
      { notes: [topNote], duration: 0.8, gapAfter: 0.2 }
    ];
  }, []);

  const playDemo = async (type: WideIntervalType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();
    const baseNote = { note: "C", octave: 4 };
    const topNote = getNoteAtInterval(baseNote, WIDE_INTERVALS[type]);
    const events: SequenceEvent[] = [
      { notes: [baseNote], duration: 0.8, gapAfter: 0 },
      { notes: [topNote], duration: 1.5, gapAfter: 0 }
    ];
    await playSequenceWithUI(events, setActiveNotes);
    setIsPlaying(false);
  };

  const playQuiz = async () => {
    if (isPlaying || !quizEventsRef.current) return;
    setIsPlaying(true);
    setIsQuizMode(true);
    stopAllAudio();
    await playSequenceWithUI(quizEventsRef.current, setActiveNotes);
    setIsPlaying(false);
  };

  const handleGuess = (type: WideIntervalType) => {
    setSelectedAnswer(type);
    setIsCorrect(type === quizAnswerRef.current);
  };

  return (
    <div className="space-y-10">
      <div className="prose prose-emerald dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Compound intervals are wider than an octave. A <strong>9th</strong> is an octave plus a 2nd. A <strong>10th</strong> is an octave plus a 3rd. These wide intervals have a beautiful, expansive sound often used in jazz and classical piano music.
          <br /><br />
          <strong>Theory:</strong> Compound intervals exceed an octave. A 9th is an octave plus a 2nd (e.g., a Major 9th is 14 semitones). A 10th is an octave plus a 3rd (16 semitones). Because of octave equivalence, they share the same harmonic function as their simple counterparts, but the acoustic 'beating' of dissonant overtones is reduced by the wide frequency gap.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C4" endNote="E5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.keys(WIDE_INTERVALS) as WideIntervalType[]).map((type) => (
          <Button
            key={type}
            variant="outline"
            className="h-auto py-4 flex flex-col items-center justify-center gap-2 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            onClick={() => playDemo(type)}
            disabled={isPlaying}
          >
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Play className="w-5 h-5 ml-1" />
            </div>
            <span className="font-semibold text-sm text-center">{type}</span>
          </Button>
        ))}
      </div>

      <div className="mt-12 bg-white dark:bg-stone-900 rounded-2xl p-8 border-2 border-stone-200 dark:border-stone-800 shadow-sm">
        <h3 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-100">Try It!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">
          Listen to the wide interval (played harmonically, then melodically) and identify it. 
          Hint: Try to imagine dropping the top note down an octave to identify if it's a 2nd or 3rd!
        </p>

        <div className="flex flex-wrap gap-4 mb-8">
          <Button
            size="lg"
            className="bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-full px-8"
            onClick={playQuiz}
            disabled={isPlaying}
          >
            <Play className="w-5 h-5 mr-2" />
            Play Mystery Interval
          </Button>
        </div>

        {isQuizMode && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.keys(WIDE_INTERVALS) as WideIntervalType[]).map((type) => (
                <Button
                  key={type}
                  variant={selectedAnswer === type ? (isCorrect ? "default" : "destructive") : "outline"}
                  size="sm"
                  className={`h-12 text-sm ${selectedAnswer === type && isCorrect ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  onClick={() => handleGuess(type)}
                  disabled={isCorrect === true || isPlaying}
                >
                  {type}
                </Button>
              ))}
            </div>

            {selectedAnswer && !isCorrect && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-xl flex items-start gap-3">
                <X className="w-6 h-6 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold mb-1">Not quite!</p>
                  <p className="text-sm">
                    {selectedAnswer.includes("9th") && "You guessed a 9th. A 9th is essentially a 2nd plus an octave, so it sounds quite dissonant when played harmonically. Did the interval sound more consonant, like a 3rd?"}
                    {selectedAnswer.includes("10th") && "You guessed a 10th. A 10th is essentially a 3rd plus an octave, so it sounds very pleasant and consonant. Did the interval sound more tense or dissonant?"}
                  </p>
                </div>
              </div>
            )}

            {isCorrect && (
              <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in zoom-in">
                <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
                  <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-800/50 rounded-full flex items-center justify-center shrink-0">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-lg">Excellent!</p>
                    <p className="text-sm opacity-90">You correctly identified the {quizAnswerRef.current}.</p>
                  </div>
                </div>
                <Link to="/exercises">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6 shadow-sm">
                    Go to Exercise
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
