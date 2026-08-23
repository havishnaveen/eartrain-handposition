import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ExerciseList } from "./ExerciseList";
import { ActiveExerciseRouter } from "./ActiveExerciseRouter";
import { ActiveLessonRouter } from "./ActiveLessonRouter";
import { useLocation, useNavigate } from "react-router-dom";
import { ALL_EXERCISES } from "./ExerciseList";
import { LESSONS } from "@/lib/lessons";

export function SelectionView() {
  const [activeExercise, setActiveExercise] = useState<{id: string, name: string} | null>(null);
  const [activeLesson, setActiveLesson] = useState<{id: string, name: string} | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/") {
      setActiveLesson(null);
      setActiveExercise(null);
    } else if (location.pathname === "/exercises") {
      setActiveLesson(null);
      setActiveExercise(null);
      navigate("/", { replace: true });
    } else if (location.pathname.startsWith('/exercises/')) {
      const id = location.pathname.split('/')[2];
      const ex = ALL_EXERCISES.find(e => e.id === id);
      if (ex) {
        setActiveExercise({id: ex.id, name: ex.name});
        setActiveLesson(null);
      }
    } else if (location.pathname.startsWith('/lessons/')) {
      const id = location.pathname.split('/')[2];
      const lesson = LESSONS.find(l => l.id === id);
      if (lesson) {
        setActiveLesson({id: lesson.id, name: lesson.name});
        setActiveExercise(null);
      }
    }
  }, [location, navigate]);

  const selectExercise = (id: string, _name: string) => {
    navigate('/exercises/' + id);
  };

  const exitExerciseOrLesson = () => {
    navigate('/');
  };

  return (
    <>
      {activeExercise ? (
        <motion.div key="exercise" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <ActiveExerciseRouter 
            exerciseId={activeExercise.id} 
            name={activeExercise.name} 
            stage={1} 
            onExit={exitExerciseOrLesson} 
          />
        </motion.div>
      ) : activeLesson ? (
        <motion.div key="lesson" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <ActiveLessonRouter 
            lessonId={activeLesson.id} 
            name={activeLesson.name} 
            stage={1} 
            onExit={exitExerciseOrLesson} 
          />
        </motion.div>
      ) : (
        <motion.div
          key="selection"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="container mx-auto max-w-7xl"
        >
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-4 tracking-tight">Train Your Musical Ear</h2>
            <p className="text-muted-foreground text-lg">Master your Hand Positions!</p>
          </div>

          <div className="w-full flex flex-col items-center">
            <div className="w-full">
              <ExerciseList stage={1} onSelectExercise={selectExercise} />
            </div>
          </div>
          <footer className="text-center text-xs text-muted-foreground/60 py-12 pb-6 w-full">&copy; 2026 EarTrain. All rights reserved. Do not copy.</footer>
        </motion.div>
      )}
    </>
  );
}
