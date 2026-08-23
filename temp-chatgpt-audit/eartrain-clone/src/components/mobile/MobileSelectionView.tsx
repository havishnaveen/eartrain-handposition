import { useState, useEffect } from "react";
import { ExerciseList } from "../ExerciseList";
import { ActiveExerciseRouter } from "../ActiveExerciseRouter";
import { ActiveLessonRouter } from "../ActiveLessonRouter";
import { MobileHeader } from "./MobileHeader";
import { useLocation, useNavigate } from "react-router-dom";
import { ALL_EXERCISES } from "../ExerciseList";
import { LESSONS } from "@/lib/lessons";

export function MobileSelectionView() {
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

  if (activeExercise) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col">
        <ActiveExerciseRouter 
          exerciseId={activeExercise.id} 
          name={activeExercise.name} 
          stage={1} 
          onExit={exitExerciseOrLesson} 
        />
      </div>
    );
  }

  if (activeLesson) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col">
        <ActiveLessonRouter 
          lessonId={activeLesson.id} 
          name={activeLesson.name} 
          stage={1} 
          onExit={exitExerciseOrLesson} 
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <MobileHeader />
      
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif font-bold mb-2 tracking-tight">Train Your Musical Ear</h2>
          <p className="text-muted-foreground text-sm">Master your Hand Positions!</p>
        </div>

        <div className="space-y-6">
          <ExerciseList stage={1} onSelectExercise={selectExercise} />
        </div>
      </div>
    </div>
  );
}
