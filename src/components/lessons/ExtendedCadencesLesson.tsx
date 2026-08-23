import { useState, useRef, useEffect } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ArrowRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent, stopAllAudio } from "@/lib/audio";
import { Link } from "react-router-dom";

type ProgressionType = "I - IV - V - I (Authentic)" | "I - vi - ii - V (Half)" | "I - V - vi - IV (Pop)" | "I - IV - V - vi (Deceptive)";

const PROGRESSIONS: Record<ProgressionType, { note: string; octave: number }[][]> = {
  "I - IV - V - I (Authentic)": [
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "F", octave: 4 }, { note: "A", octave: 4 }],
    [{ note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }],
  ],
  "I - vi - ii - V (Half)": [
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "A", octave: 4 }],
    [{ note: "D", octave: 4 }, { note: "F", octave: 4 }, { note: "A", octave: 4 }],
    [{ note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
  ],
  "I - V - vi - IV (Pop)": [
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }],
    [{ note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "A", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "F", octave: 4 }, { note: "A", octave: 4 }],
  ],
  "I - IV - V - vi (Deceptive)": [
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "F", octave: 4 }, { note: "A", octave: 4 }],
    [{ note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
    [{ note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "A", octave: 4 }],
  ]
};

export function ExtendedCadencesLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isQuizMode, setIsQuizMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<ProgressionType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const quizAnswerRef = useRef<ProgressionType | null>(null);
  const quizEventsRef = useRef<SequenceEvent[] | null>(null);

  useEffect(() => {
    const types = Object.keys(PROGRESSIONS) as ProgressionType[];
    const randomType = types[Math.floor(Math.random() * types.length)];
    quizAnswerRef.current = randomType;

    const progression = PROGRESSIONS[randomType];
    
    quizEventsRef.current = [
      ...progression.map(chord => ({ notes: chord, duration: 1.2, gapAfter: 0.1 }))
    ];
  }, []);

  const playDemo = async (type: ProgressionType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();
    const progression = PROGRESSIONS[type];
    const events: SequenceEvent[] = progression.map(chord => ({
      notes: chord,
      duration: 1.2,
      gapAfter: 0.1
    }));
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

  const handleGuess = (type: ProgressionType) => {
    setSelectedAnswer(type);
    setIsCorrect(type === quizAnswerRef.current);
  };

  return (
    <div className="space-y-10">
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          In real music, cadences are often the end of longer <strong>chord progressions</strong>. Listening to the sequence of chords leading up to the final cadence helps contextualize the resolution. Can you identify these common 4-chord loops?
          <br /><br />
          <strong>Theory:</strong> Common chord progressions rely on functional harmony built on diatonic scale degrees. The Authentic I-IV-V-I moves through subdominant and dominant functions to resolve. The Half I-vi-ii-V progression utilizes the circle of fifths (moving from vi to ii to V) to build continuous tension without returning home.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C4" endNote="B4" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(PROGRESSIONS) as ProgressionType[]).map((type) => (
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
          Listen to the 4-chord progression (played simultaneously, then broken) and identify it.
        </p>

        <div className="flex flex-wrap gap-4 mb-8">
          <Button
            size="lg"
            className="bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-full px-8"
            onClick={playQuiz}
            disabled={isPlaying}
          >
            <Play className="w-5 h-5 mr-2" />
            Play Mystery Progression
          </Button>
        </div>

        {isQuizMode && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.keys(PROGRESSIONS) as ProgressionType[]).map((type) => (
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
                    {selectedAnswer.includes("Authentic") && "You guessed the Authentic progression. Listen to the last chord: does it sound completely resolved to the home key?"}
                    {selectedAnswer.includes("Half") && "You guessed the Half progression. The Half progression leaves you hanging on the V chord at the very end. Did it sound unfinished?"}
                    {selectedAnswer.includes("Pop") && "You guessed the Pop progression. This ends on the IV chord and feels like it wants to loop back to the start. It has a very modern sound."}
                    {selectedAnswer.includes("Deceptive") && "You guessed the Deceptive progression. This ends on the minor vi chord, tricking you after the V chord."}
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
