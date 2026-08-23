import { useState, useRef, useEffect } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { Button } from "@/components/ui/button";
import { Play, Check, X, ArrowRight } from "lucide-react";
import { playSequenceWithUI, SequenceEvent, stopAllAudio } from "@/lib/audio";
import { Link } from "react-router-dom";

type CadenceType = "Authentic (V-I)" | "Plagal (IV-I)" | "Half (I-V)" | "Deceptive (V-vi)";

const CADENCES: Record<CadenceType, { note: string; octave: number }[][]> = {
  "Authentic (V-I)": [
    [{ note: "G", octave: 3 }, { note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
    [{ note: "C", octave: 3 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "C", octave: 5 }]
  ],
  "Plagal (IV-I)": [
    [{ note: "F", octave: 3 }, { note: "C", octave: 4 }, { note: "F", octave: 4 }, { note: "A", octave: 4 }],
    [{ note: "C", octave: 3 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "C", octave: 5 }]
  ],
  "Half (I-V)": [
    [{ note: "C", octave: 3 }, { note: "E", octave: 4 }, { note: "G", octave: 4 }, { note: "C", octave: 5 }],
    [{ note: "G", octave: 3 }, { note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }]
  ],
  "Deceptive (V-vi)": [
    [{ note: "G", octave: 3 }, { note: "D", octave: 4 }, { note: "G", octave: 4 }, { note: "B", octave: 4 }],
    [{ note: "A", octave: 3 }, { note: "E", octave: 4 }, { note: "A", octave: 4 }, { note: "C", octave: 5 }]
  ]
};

export function CadencesLesson() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Try It state
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<CadenceType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const quizAnswerRef = useRef<CadenceType | null>(null);
  const quizEventsRef = useRef<SequenceEvent[] | null>(null);

  useEffect(() => {
    const types: CadenceType[] = ["Authentic (V-I)", "Plagal (IV-I)", "Half (I-V)", "Deceptive (V-vi)"];
    const randomType = types[Math.floor(Math.random() * types.length)];
    quizAnswerRef.current = randomType;

    const c1 = CADENCES[randomType][0];
    const c2 = CADENCES[randomType][1];
    
    quizEventsRef.current = [
      { notes: c1, duration: 1.5, gapAfter: 0.1 },
      { notes: c2, duration: 2.0, gapAfter: 0 }
    ];
  }, []);

  const playDemo = async (type: CadenceType) => {
    if (isPlaying) return;
    setIsPlaying(true);
    stopAllAudio();
    const c1 = CADENCES[type][0];
    const c2 = CADENCES[type][1];
    const events: SequenceEvent[] = [
      { notes: c1, duration: 1.5, gapAfter: 0.1 },
      { notes: c2, duration: 2.0, gapAfter: 0 }
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

  const handleGuess = (type: CadenceType) => {
    setSelectedAnswer(type);
    setIsCorrect(type === quizAnswerRef.current);
  };

  return (
    <div className="space-y-10">
      <div className="prose prose-orange dark:prose-invert max-w-none">
        <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300 mb-6">
          A cadence is a two-chord progression at the end of a phrase. 
          <br /><br />
          <strong>Theory:</strong> Cadences are harmonic resolutions. An Authentic Cadence moves from the Dominant V chord to the Tonic I chord, resolving the leading tone upward by a half-step to the root. A Plagal Cadence moves from IV to I, a softer resolution avoiding the leading tone. A Half Cadence ends unresolved on the V chord. A Deceptive Cadence moves from V to the minor vi chord, thwarting the expected resolution to I.
        </p>
      </div>

      <div className="bg-stone-100 dark:bg-stone-900/50 rounded-2xl p-6 border border-stone-200 dark:border-stone-800 flex justify-center">
        <PianoKeyboard startNote="C3" endNote="C5" activeNotes={activeNotes} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["Authentic (V-I)", "Plagal (IV-I)", "Half (I-V)", "Deceptive (V-vi)"] as CadenceType[]).map((type) => (
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
          Listen to the two-chord cadence (played together, then broken into arpeggios) and identify it.
        </p>

        <div className="flex flex-wrap gap-4 mb-8">
          <Button
            size="lg"
            className="bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-full px-8"
            onClick={playQuiz}
            disabled={isPlaying}
          >
            <Play className="w-5 h-5 mr-2" />
            Play Mystery Cadence
          </Button>
        </div>

        {isQuizMode && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(["Authentic (V-I)", "Plagal (IV-I)", "Half (I-V)", "Deceptive (V-vi)"] as CadenceType[]).map((type) => (
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
                    {selectedAnswer === "Authentic (V-I)" && "Authentic sounds very final and strong. Does this progression sound like a strong finish, or did it trick you?"}
                    {selectedAnswer === "Plagal (IV-I)" && "Plagal has that classic 'Amen' sound. It's softer than Authentic. Listen to the bass movement."}
                    {selectedAnswer === "Half (I-V)" && "Half cadences end on the V chord, leaving you hanging and wanting more. Did the progression sound finished or unfinished?"}
                    {selectedAnswer === "Deceptive (V-vi)" && "Deceptive sets you up for an Authentic resolution but unexpectedly goes to a minor chord at the end."}
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
