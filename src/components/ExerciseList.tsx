import { useState } from "react";
import { Hand, Lock, ChevronDown, ChevronUp, CheckCircle, Music, Compass, Layers, Award, Ruler, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ExerciseListProps = {
  stage: number;
  onSelectExercise: (id: string, name: string) => void;
}

export const ALL_EXERCISES = [
  // Phase 1
  { id: "major-minor-intro", name: "Lesson 1: Major vs Minor Basics", desc: "Listen to the melody. Is it Major (Happy) or Minor (Sad)?", phase: "Phase 1: Hand Positions", icon: Music },
  { id: "major-anchor", name: "Lesson 2: The Major Anchor", desc: "Map a full 5-finger position and lock it in.", phase: "Phase 1: Hand Positions", icon: Hand },
  { id: "minor-adjustment", name: "Lesson 3: The Minor Adjustment", desc: "Adjust your fingers to match minor key signatures.", phase: "Phase 1: Hand Positions", icon: Hand },
  { id: "neighborhood-leap", name: "Lesson 4: High vs Low Neighborhoods", desc: "Leap between C and G treble positions.", phase: "Phase 1: Hand Positions", icon: Hand },
  
  // Phase 2
  { id: "step-skip", name: "Lesson 5: Step or Skip?", desc: "Differentiate between steps (2nds) and skips (3rds).", phase: "Phase 2: Intervals Inside the Hand", icon: Music },
  { id: "boundary-jump", name: "Lesson 6: The Boundary Jump", desc: "Identify internal skips (3rds) vs full hand jumps (5ths).", phase: "Phase 2: Intervals Inside the Hand", icon: Music },

  // Phase 3
  { id: "high-out-of-bounds", name: "Lesson 7: High Out-of-Bounds", desc: "Hear when a melody reaches above the 5-finger range to A.", phase: "Phase 3: Catching Out-of-Bounds Notes", icon: Compass },
  { id: "low-out-of-bounds", name: "Lesson 8: Low Out-of-Bounds", desc: "Hear when a melody dips below G position to F#.", phase: "Phase 3: Catching Out-of-Bounds Notes", icon: Compass },

  // Phase 4
  { id: "neighbor-shift", name: "Lesson 9: The Neighbor Shift", desc: "Hear key center shifts up 1 step (C Major to D Minor).", phase: "Phase 4: Gentle Shifting", icon: Layers },
  { id: "i-to-v-leap", name: "Lesson 10: The I to V Jump", desc: "Hear leaps from the Home key (I) to Dominant (V).", phase: "Phase 4: Gentle Shifting", icon: Layers },
  { id: "melody-tracker", name: "Lesson 11: The Position Tracker", desc: "Track key shifts and reaches in real-time with F\u00FCr Elise.", phase: "Phase 4: Gentle Shifting", icon: Award },

  // Phase 5
  { id: "fourth-vs-fifth", name: "Lesson 12: 4th vs 5th", desc: "Distinguish between the compact 4th and the full-stretch 5th.", phase: "Phase 5: Expanding the Map", icon: Ruler },
  { id: "sixth-vs-seventh", name: "Lesson 13: 6th vs 7th", desc: "Differentiate between the large 6th leap and the dissonant 7th stretch.", phase: "Phase 5: Expanding the Map", icon: Ruler },
  { id: "octave-teleport", name: "Lesson 14: Octave (8th)", desc: "Hear when a melody jumps to the same note in a new register.", phase: "Phase 5: Expanding the Map", icon: Target },
  { id: "thumb-tuck", name: "Lesson 15: Tuck & Cross", desc: "Recognize scale runs that go beyond 5 fingers.", phase: "Phase 5: Expanding the Map", icon: Hand },

  // Phase 6
  { id: "parallel-slide", name: "Lesson 16: Parallel Shift", desc: "Hear the entire hand shift up or down one step.", phase: "Phase 6: Seamless Navigation", icon: Layers },
  { id: "triad-tracking", name: "Lesson 17: Tonic (I) & Dominant (V)", desc: "Identify I, IV, and V chord zones by ear.", phase: "Phase 6: Seamless Navigation", icon: Music },

  // Phase 7
  { id: "degrees-123", name: "Lesson 18: I, II, III", desc: "Identify the Tonic, Supertonic, and Mediant degrees.", phase: "Phase 7: Scale Degrees", icon: Music },
  { id: "degrees-45", name: "Lesson 19: IV, V", desc: "Identify the Subdominant and Dominant degrees.", phase: "Phase 7: Scale Degrees", icon: Music },
  { id: "degrees-67", name: "Lesson 20: VI, VII", desc: "Identify the Submediant and Leading Tone degrees.", phase: "Phase 7: Scale Degrees", icon: Music },
  { id: "master-navigator", name: "Lesson 21: Master Navigator", desc: "Final Challenge: Track complex movements in a complete composition.", phase: "Phase 7: Scale Degrees", icon: Award },
];

export function ExerciseList({ onSelectExercise }: ExerciseListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const checkUnlocked = (_index: number) => {
    const ex = ALL_EXERCISES[_index];
    if (ex.id === "master-navigator") {
      return false; // TEMPORARILY LOCK LESSON 21
    }
    return true; // TEMPORARILY UNLOCKED ALL OTHER LESSONS
    /*
    if (_index === 0) return true;
    
    // Unlock if the previous exercise has been completed
    const prevExercise = ALL_EXERCISES[_index - 1];
    return prevExercise ? checkCompleted(prevExercise.id) : false;
    */
  };

  const checkCompleted = (id: string) => {
    return localStorage.getItem(`et_v3_completed_${id}`) === 'true';
  };

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6">
      <div 
        className="bg-orange-500/10 border-2 border-orange-200 dark:border-orange-500/30 rounded-xl p-4 flex justify-between items-center cursor-pointer hover:bg-orange-500/20 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 className="text-xl font-serif font-bold text-orange-950 dark:text-orange-100">Keyboard Position Ear Training (21 Lessons)</h3>
          <p className="text-sm text-orange-800/70 dark:text-orange-200/60 font-medium mt-1">Master anchoring, intervals, stretches, and key center shifts by ear.</p>
        </div>
        <div>
          {isExpanded ? <ChevronUp className="w-6 h-6 text-orange-500" /> : <ChevronDown className="w-6 h-6 text-orange-500" />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-4"
          >
            {(() => {
              // Group exercises by phase
              const grouped: Record<string, typeof ALL_EXERCISES> = {};
              ALL_EXERCISES.forEach(ex => {
                if (!grouped[ex.phase]) grouped[ex.phase] = [];
                grouped[ex.phase].push(ex);
              });

              return Object.entries(grouped).map(([phaseName, phaseExercises]) => (
                <div key={phaseName} className="mb-8 last:mb-0">
                  <h4 className="text-sm font-bold text-orange-700/60 dark:text-orange-300/50 uppercase tracking-widest mb-4 px-2 border-b-2 border-orange-200/50 dark:border-orange-500/20 pb-2">
                    {phaseName}
                  </h4>
                  <div className="space-y-4">
                    {phaseExercises.map((ex) => {
                      const globalIndex = ALL_EXERCISES.findIndex(e => e.id === ex.id);
                      const unlocked = checkUnlocked(globalIndex);
                      const completed = checkCompleted(ex.id);
                      const Icon = unlocked ? ex.icon : Lock;
                      
                      return (
                        <div 
                          key={ex.id}
                          onClick={() => unlocked && onSelectExercise(ex.id, ex.name)}
                          className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 flex items-center p-4 sm:p-6 ${
                            unlocked 
                              ? "cursor-pointer bg-white dark:bg-card border-orange-200 dark:border-orange-500/30 hover:border-orange-500 hover:shadow-lg hover:-translate-y-1" 
                              : "cursor-not-allowed bg-stone-100 dark:bg-stone-900 border-stone-200 dark:border-stone-800 opacity-60 grayscale"
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-6 shrink-0 ${
                            unlocked 
                              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" 
                              : "bg-stone-200 dark:bg-stone-800 text-stone-500"
                          }`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h4 className={`font-serif text-xl font-bold ${
                                unlocked ? "text-orange-950 dark:text-white" : "text-stone-700 dark:text-stone-400"
                              }`}>{ex.name}</h4>
                              {completed && <CheckCircle className="w-5 h-5 text-green-500" />}
                            </div>
                            <p className={`text-sm mt-1 font-medium ${
                              unlocked ? "text-orange-800/70 dark:text-white/60" : "text-stone-500 dark:text-stone-500"
                            }`}>{ex.desc}</p>
                          </div>
                          
                          {!unlocked && (
                            <div className="absolute right-6 text-stone-400 font-bold uppercase tracking-widest text-xs hidden sm:block">
                              Locked
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ));
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
