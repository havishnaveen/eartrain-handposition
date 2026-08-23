import { useState, useRef, useEffect } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ArrowRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent, stopAllAudio } from "@/lib/audio";
import { Link } from "react-router-dom";

type InversionType = "Root Position" | "1st Inversion" | "2nd Inversion";

const INVERSIONS: Record<InversionType, { note: string; octave: number }[]> = {
  "Root Position": [
    { note: "C", octave: 4 },
    { note: "E", octave: 4 },
    { note: "G", octave: 4 },
  ],
  "1st Inversion": [
    { note: "E", octave: 4 },
    { note: "G", octave: 4 },
    { note: "C", octave: 5 },
  ],
  "2nd Inversion": [
    { note: "G", octave: 4 },
    { note: "C", octave: 5 },
    { note: "E", octave: 5 },
  ],
};

export function ChordInversionsLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Try It state
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<InversionType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const quizAnswerRef = useRef<InversionType | null>(null);
  const quizEventsRef = useRef<SequenceEvent[] | null>(null);

  useEffect(() => {
    const types: InversionType[] = ["Root Position", "1st Inversion", "2nd Inversion"];
    const randomType = types[Math.floor(Math.random() * types.length)];
    quizAnswerRef.current = randomType;

    const chord = INVERSIONS[randomType];
    quizEventsRef.current = [
      { notes: chord, duration: 1.5, gapAfter: 1.0 },
      ...chord.map(n => ({ notes: [n], duration: 0.8, gapAfter: 0.2 }))
    ];
  }, []);

  const playDemo = async (type: InversionType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();
    const chord = INVERSIONS[type];
    const events: SequenceEvent[] = [
      { notes: chord, duration: 2.0, gapAfter: 0 }
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

  const handleGuess = (type: InversionType) => {
    setSelectedAnswer(type);
    setIsCorrect(type === quizAnswerRef.current);
  };

  return (
    <div className="space-y-10">
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          Inversions change the lowest note (bass note) of the chord.
          <br /><br />
          <strong>Theory:</strong> Inversions occur when a note other than the root is in the bass (lowest) position. In 1st Inversion, the 3rd of the chord is in the bass, fundamentally changing the intervals above it (e.g., in a Major triad, the intervals from the bass up become a Minor 3rd then a Perfect 4th). In 2nd Inversion, the 5th is in the bass.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C4" endNote="E5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["Root Position", "1st Inversion", "2nd Inversion"] as InversionType[]).map((type) => (
          <Button
            key={type}
            variant="outline"
            className="h-auto p-6 flex flex-col items-center justify-center gap-3 border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            onClick={() => playDemo(type)}
            disabled={isPlaying}
          >
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Play className="w-6 h-6 ml-1" />
            </div>
            <span className="font-bold text-lg">{type}</span>
          </Button>
        ))}
      </div>

      <div className="mt-12 bg-white dark:bg-stone-900 rounded-2xl p-8 border-2 border-stone-200 dark:border-stone-800 shadow-sm">
        <h3 className="text-2xl font-bold mb-6 text-stone-800 dark:text-stone-100">Try It!</h3>
        <p className="text-stone-600 dark:text-stone-400 mb-6">
          Listen to the chord (played simultaneously, then broken) and identify its inversion.
        </p>

        <div className="flex flex-wrap gap-4 mb-8">
          <Button
            size="lg"
            className="bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-full px-8"
            onClick={playQuiz}
            disabled={isPlaying}
          >
            <Play className="w-5 h-5 mr-2" />
            Play Mystery Chord
          </Button>
        </div>

        {isQuizMode && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["Root Position", "1st Inversion", "2nd Inversion"] as InversionType[]).map((type) => (
                <Button
                  key={type}
                  variant={selectedAnswer === type ? (isCorrect ? "default" : "destructive") : "outline"}
                  size="lg"
                  className={`h-16 text-lg ${selectedAnswer === type && isCorrect ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
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
                    {selectedAnswer === "Root Position" && "You guessed Root Position. Remember, Root position sounds very stable. Listen closely to the bottom note: does it sound like the 'home' note of the chord?"}
                    {selectedAnswer === "1st Inversion" && "You guessed 1st Inversion. In 1st inversion, the bottom note is the 3rd of the chord. It sounds lighter and less grounded than root position."}
                    {selectedAnswer === "2nd Inversion" && "You guessed 2nd Inversion. 2nd inversion has a very distinct, unstable 'cadential' sound because the 5th is in the bass. It strongly wants to resolve downwards."}
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
                    <p className="text-sm opacity-90">You correctly identified {quizAnswerRef.current}.</p>
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
