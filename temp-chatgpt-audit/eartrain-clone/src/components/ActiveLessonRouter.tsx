import { LessonContainer } from "./lessons/LessonContainer";
import { NoteDirectionLesson } from "./lessons/NoteDirectionLesson";
import { MelodicContourLesson } from "./lessons/MelodicContourLesson";
import { SingleOrChordLesson } from "./lessons/SingleOrChordLesson";
import { PitchMemoryLesson } from "./lessons/PitchMemoryLesson";
import { ConsonanceDissonanceLesson } from "./lessons/ConsonanceDissonanceLesson";
import { TuningLesson } from "./lessons/TuningLesson";
import { SecondsThirdsLesson } from "./lessons/SecondsThirdsLesson";
import { NoteDurationLesson } from "./lessons/NoteDurationLesson";
import { MajorMinorLesson } from "./lessons/MajorMinorLesson";
import { FourthsFifthsLesson } from "./lessons/FourthsFifthsLesson";
import { IntervalTrainingLesson } from "./lessons/IntervalTrainingLesson";
import { ChordQualityLesson } from "./lessons/ChordQualityLesson";
import { ScaleTypeLesson } from "./lessons/ScaleTypeLesson";
import { TimeSignatureLesson } from "./lessons/TimeSignatureLesson";
import { SeventhChordsLesson } from "./lessons/SeventhChordsLesson";
import { ChordInversionsLesson } from "./lessons/ChordInversionsLesson";
import { CadencesLesson } from "./lessons/CadencesLesson";
import { ExtendedIntervalTrainingLesson } from "./lessons/ExtendedIntervalTrainingLesson";
import { ExtendedCadencesLesson } from "./lessons/ExtendedCadencesLesson";
import { AdvancedScalesLesson } from "./lessons/AdvancedScalesLesson";
import { WideIntervalsLesson } from "./lessons/WideIntervalsLesson";
import { ExactNoteLesson } from "./lessons/ExactNoteLesson";
import { ModeClassificationLesson } from "./lessons/ModeClassificationLesson";
import { VeryWideIntervalsLesson } from "./lessons/VeryWideIntervalsLesson";

type ActiveLessonRouterProps = {
  lessonId: string;
  stage: number;
  name: string;
  onExit: () => void;
}

export function ActiveLessonRouter({ lessonId, stage, name, onExit }: ActiveLessonRouterProps) {
  
  const getLessonComponent = () => {
    switch (lessonId) {
      // Stage 1
      case "direction": return <NoteDirectionLesson />;
      case "melodic-contour": return <MelodicContourLesson onExit={onExit} onComplete={onExit} />;
      case "single-chord": return <SingleOrChordLesson onExit={onExit} onComplete={onExit} />;
      case "pitch-memory": return <PitchMemoryLesson onExit={onExit} onComplete={onExit} />;
      case "interval-2-3": return <SecondsThirdsLesson />;
      case "note-duration-basic": return <NoteDurationLesson extended={false} />;
      
      // Stage 2
      case "major-minor": return <MajorMinorLesson />;
      case "consonance-dissonance": return <ConsonanceDissonanceLesson onExit={onExit} onComplete={onExit} />;
      case "tuning": return <TuningLesson onExit={onExit} onComplete={onExit} />;
      case "note-duration-extended": return <NoteDurationLesson extended={true} />;
      case "fourths-fifths": return <FourthsFifthsLesson />;
      
      // Stage 3
      case "interval-training": return <IntervalTrainingLesson />;
      case "chord-quality": return <ChordQualityLesson />;
      case "scale-type": return <ScaleTypeLesson />;
      case "time-signature": return <TimeSignatureLesson />;
      case "seventh-chords": return <SeventhChordsLesson />;
      case "chord-inversions": return <ChordInversionsLesson />;
      case "cadences": return <CadencesLesson />;
      case "interval-extended": return <ExtendedIntervalTrainingLesson />;
      case "cadences-extended": return <ExtendedCadencesLesson />;
      case "advanced-scales": return <AdvancedScalesLesson />;
      case "wide-intervals": return <WideIntervalsLesson />;
      
      // Stage 4
      case "exact-note": return <ExactNoteLesson />;
      case "mode-classification": return <ModeClassificationLesson />;
      case "very-wide-intervals": return <VeryWideIntervalsLesson />;
      
      default:
        return (
          <div className="py-20 text-center text-muted-foreground">
            <p>Lesson "{name}" is under construction!</p>
            <p className="text-sm mt-2">More lessons coming soon.</p>
          </div>
        );
    }
  }

  return (
    <LessonContainer id={lessonId} name={name} stage={stage} onExit={onExit}>
      {getLessonComponent()}
    </LessonContainer>
  );
}
