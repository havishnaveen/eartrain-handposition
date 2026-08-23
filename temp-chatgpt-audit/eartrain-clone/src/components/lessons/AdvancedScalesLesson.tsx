import { useState, useRef, useEffect } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ArrowRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent, stopAllAudio, SCALE_PATTERNS, getNoteAtInterval } from "@/lib/audio";
import { Link } from "react-router-dom";

type ScaleType = "pentatonic" | "blues" | "wholeTone";

const SCALE_NAMES: Record<ScaleType, string> = {
  pentatonic: "Pentatonic Scale",
  blues: "Blues Scale",
  wholeTone: "Whole Tone Scale"
};

export function AdvancedScalesLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isQuizMode, setIsQuizMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<ScaleType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const quizAnswerRef = useRef<ScaleType | null>(null);
  const quizEventsRef = useRef<SequenceEvent[] | null>(null);

  const generateQuiz = () => {
    const types: ScaleType[] = ["pentatonic", "blues", "wholeTone"];
    const randomType = types[Math.floor(Math.random() * types.length)];
    quizAnswerRef.current = randomType;

    const baseNote = { note: "C", octave: 4 };
    const pattern = SCALE_PATTERNS[randomType];
    const notes = pattern.map(semitones => getNoteAtInterval(baseNote, semitones));

    const ascending = notes.map(n => ({ notes: [n], duration: 0.4, gapAfter: 0 }));
    const descending = [...notes].reverse().slice(1).map(n => ({ notes: [n], duration: 0.4, gapAfter: 0 }));

    quizEventsRef.current = [...ascending, ...descending];
  };

  useEffect(() => {
    generateQuiz();
  }, []);

  const playDemo = async (type: ScaleType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();
    const baseNote = { note: "C", octave: 4 };
    const pattern = SCALE_PATTERNS[type];
    const notes = pattern.map(semitones => getNoteAtInterval(baseNote, semitones));
    
    const events: SequenceEvent[] = notes.map(n => ({ notes: [n], duration: 0.5, gapAfter: 0 }));
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

  const handleGuess = (type: ScaleType) => {
    setSelectedAnswer(type);
    const correct = type === quizAnswerRef.current;
    setIsCorrect(correct);
    if (correct) {
      setTimeout(() => {
        generateQuiz();
        setIsCorrect(null);
        setSelectedAnswer(null);
      }, 1500);
    }
  };

  return (
    <div className="space-y-10">
      <div className="prose prose-amber dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Beyond major and minor scales, there are many colorful scales used in different styles of music.
          <br /><br />
          <strong>Theory:</strong> The Pentatonic scale removes the 4th and 7th scale degrees from the Major scale, eliminating all dissonant half-step intervals. The Blues scale adds a chromatic flat-5th interval (the 'blue note') to the minor pentatonic. The Whole Tone scale consists exclusively of Major 2nd intervals (2 semitones), eliminating perfect intervals and leading tones.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C4" endNote="C5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(SCALE_NAMES) as ScaleType[]).map((type) => (
          <Button
            key={type}
            variant="outline"
            className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            onClick={() => playDemo(type)}
            disabled={isPlaying}
          >
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Play className="w-6 h-6 ml-1" />
            </div>
            <span className="font-bold text-lg">{SCALE_NAMES[type]}</span>
          </Button>
        ))}
      </div>

      <div className="mt-12 bg-white dark:bg-stone-900 rounded-2xl p-8 border-2 border-stone-200 dark:border-stone-800 shadow-sm">
        <h3 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-100">Try It!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">
          Listen to the scale (played ascending and descending) and identify it.
        </p>

        <div className="flex flex-wrap gap-4 mb-8">
          <Button
            size="lg"
            className="bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-full px-8"
            onClick={playQuiz}
            disabled={isPlaying}
          >
            <Play className="w-5 h-5 mr-2" />
            Play Mystery Scale
          </Button>
        </div>

        {isQuizMode && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(Object.keys(SCALE_NAMES) as ScaleType[]).map((type) => (
                <Button
                  key={type}
                  variant={selectedAnswer === type ? (isCorrect ? "default" : "destructive") : "outline"}
                  size="lg"
                  className={`h-16 text-lg ${selectedAnswer === type && isCorrect ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  onClick={() => handleGuess(type)}
                  disabled={isCorrect === true || isPlaying}
                >
                  {SCALE_NAMES[type]}
                </Button>
              ))}
            </div>

            {selectedAnswer && !isCorrect && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-xl flex items-start gap-3">
                <X className="w-6 h-6 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold mb-1">Not quite!</p>
                  <p className="text-sm">
                    {selectedAnswer === "pentatonic" && "You guessed Pentatonic. Pentatonic sounds very open and consonant, like folk music. Did this scale sound more tense?"}
                    {selectedAnswer === "blues" && "You guessed Blues. The Blues scale has a very distinctive, gritty 'blue note' right in the middle. Did you hear that crunch?"}
                    {selectedAnswer === "wholeTone" && "You guessed Whole Tone. Whole tone has a floaty, dream-like quality, often used in cartoons for dream sequences or magic."}
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
                    <p className="text-sm opacity-90">You correctly identified the {quizAnswerRef.current ? SCALE_NAMES[quizAnswerRef.current] : ""}.</p>
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
