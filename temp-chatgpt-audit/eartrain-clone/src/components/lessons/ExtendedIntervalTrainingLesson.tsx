import { useState, useRef, useEffect } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ArrowRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent, stopAllAudio, getRandomNote, getNoteAtInterval } from "@/lib/audio";
import { Link } from "react-router-dom";

type IntervalType = "Major 2nd" | "Minor 3rd" | "Major 3rd" | "Perfect 4th" | "Perfect 5th" | "Major 6th" | "Minor 7th" | "Major 7th";

const INTERVALS: Record<IntervalType, number> = {
  "Major 2nd": 2,
  "Minor 3rd": 3,
  "Major 3rd": 4,
  "Perfect 4th": 5,
  "Perfect 5th": 7,
  "Major 6th": 9,
  "Minor 7th": 10,
  "Major 7th": 11,
};

export function ExtendedIntervalTrainingLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Try It state
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<IntervalType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const quizAnswerRef = useRef<IntervalType | null>(null);
  const quizEventsRef = useRef<SequenceEvent[] | null>(null);

  useEffect(() => {
    const types = Object.keys(INTERVALS) as IntervalType[];
    const randomType = types[Math.floor(Math.random() * types.length)];
    quizAnswerRef.current = randomType;

    const baseNote = getRandomNote(3, 4);
    const topNote = getNoteAtInterval(baseNote, INTERVALS[randomType]);

    quizEventsRef.current = [
      { notes: [baseNote, topNote], duration: 1.5, gapAfter: 1.0 },
      { notes: [baseNote], duration: 0.8, gapAfter: 0.2 },
      { notes: [topNote], duration: 0.8, gapAfter: 0.2 }
    ];
  }, []);

  const playDemo = async (type: IntervalType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();
    const baseNote = { note: "C", octave: 4 };
    const topNote = getNoteAtInterval(baseNote, INTERVALS[type]);
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

  const handleGuess = (type: IntervalType) => {
    setSelectedAnswer(type);
    setIsCorrect(type === quizAnswerRef.current);
  };

  return (
    <div className="space-y-10">
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          We've covered seconds, thirds, fourths, fifths, sixths, and sevenths separately. Now it's time to put all your knowledge together in one big challenge. Being able to distinguish between all diatonic and common chromatic intervals is the foundation of relative pitch.
          <br /><br />
          <strong>Theory:</strong> Absolute mastery of relative pitch requires instantaneously mapping the acoustic sensation of two notes to their exact semitone distance. Each interval, from a Minor 2nd (1 semitone) to a Major 7th (11 semitones), has a unique mathematical ratio that creates a specific degree of consonance or dissonance.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="C5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.keys(INTERVALS) as IntervalType[]).map((type) => (
          <Button
            key={type}
            variant="outline"
            className="h-auto py-4 flex flex-col items-center justify-center gap-2 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            onClick={() => playDemo(type)}
            disabled={isPlaying}
          >
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Play className="w-5 h-5 ml-1" />
            </div>
            <span className="font-semibold text-sm text-center">{type}</span>
          </Button>
        ))}
      </div>

      <div className="mt-12 bg-white dark:bg-stone-900 rounded-2xl p-8 border-2 border-stone-200 dark:border-stone-800 shadow-sm">
        <h3 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-100">Try It!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">
          Listen to the interval (played harmonically, then melodically) and identify it.
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
              {(Object.keys(INTERVALS) as IntervalType[]).map((type) => (
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
                    You guessed {selectedAnswer}. Try to associate the sound with famous songs. 
                    A Perfect 4th sounds like "Here Comes the Bride", Perfect 5th is "Star Wars" or "Twinkle Twinkle". 
                    Major 6th is "NBC" chimes or "My Bonnie". Minor 7th is "Somewhere" (West Side Story).
                    Listen again and try to sing the notes!
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
