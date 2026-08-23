import { Card } from "./ui/card";
import { LESSONS } from "@/lib/lessons";
import { BookOpen } from "lucide-react";

type LessonsTabProps = {
  stage: number;
  level: number;
  onSelectLesson: (id: string, name: string) => void;
}

export function LessonsTab({ stage, level, onSelectLesson }: LessonsTabProps) {
  const filtered = LESSONS.filter(l => l.stage === stage && (stage !== 3 || l.level === level));

  return (
    <div>
      <h3 className="text-muted-foreground text-sm font-bold uppercase tracking-widest mb-5 ml-1">Curriculum</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {filtered.map((l, idx) => {
          const Icon = l.icon;
          return (
            <Card 
              key={l.id} 
              onClick={() => onSelectLesson(l.id, l.name)} 
              className="group cursor-pointer border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col justify-start transition-all duration-300 relative overflow-hidden hover:shadow-md hover:-translate-y-1"
            >
              {/* Top Accent Strip to look like a textbook spine */}
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-stone-300 dark:bg-stone-700 transition-colors group-hover:bg-orange-500 dark:group-hover:bg-orange-500" />
              
              <div className="p-7 pl-9 z-10 relative flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                    <BookOpen className="w-4 h-4" />
                    Lesson {idx + 1}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-500 dark:text-stone-400 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
                
                <h4 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-100 mb-2 leading-tight group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  {l.name}
                </h4>
                
                <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed flex-1">
                  {l.desc}
                </p>
                
                <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center text-sm font-semibold text-stone-500 dark:text-stone-500 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors">
                  Start Lesson &rarr;
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
