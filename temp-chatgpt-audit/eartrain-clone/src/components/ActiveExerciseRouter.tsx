import { ExerciseContainer } from "./ExerciseContainer";
import { MajorMinorIntroExercise } from "./exercises/hand_positions/MajorMinorIntroExercise";
import { MajorAnchorExercise } from "./exercises/hand_positions/MajorAnchorExercise";
import { MinorAdjustmentExercise } from "./exercises/hand_positions/MinorAdjustmentExercise";
import { NeighborhoodLeapExercise } from "./exercises/hand_positions/NeighborhoodLeapExercise";
import { StepOrSkipExercise } from "./exercises/hand_positions/StepOrSkipExercise";
import { BoundaryJumpExercise } from "./exercises/hand_positions/BoundaryJumpExercise";
import { HighOutOfBoundsExercise } from "./exercises/hand_positions/HighOutOfBoundsExercise";
import { LowOutOfBoundsExercise } from "./exercises/hand_positions/LowOutOfBoundsExercise";
import { NeighborShiftExercise } from "./exercises/hand_positions/NeighborShiftExercise";
import { ItoVLeapExercise } from "./exercises/hand_positions/ItoVLeapExercise";
import { MelodyTrackerExercise } from "./exercises/hand_positions/MelodyTrackerExercise";
import { FourthVsFifthExercise } from "./exercises/hand_positions/FourthVsFifthExercise";
import { OctaveTeleportExercise } from "./exercises/hand_positions/OctaveTeleportExercise";
import { ThumbTuckExercise } from "./exercises/hand_positions/ThumbTuckExercise";
import { ParallelSlideExercise } from "./exercises/hand_positions/ParallelSlideExercise";
import { TriadTrackingExercise } from "./exercises/hand_positions/TriadTrackingExercise";
import { SixthVsSeventhExercise } from "./exercises/hand_positions/SixthVsSeventhExercise";
import { Degrees123Exercise } from "./exercises/hand_positions/Degrees123Exercise";
import { Degrees45Exercise } from "./exercises/hand_positions/Degrees45Exercise";
import { Degrees67Exercise } from "./exercises/hand_positions/Degrees67Exercise";
import { MasterNavigatorExercise } from "./exercises/hand_positions/MasterNavigatorExercise";

type ActiveExerciseRouterProps = {
  exerciseId: string;
  stage: number;
  name: string;
  onExit: () => void;
}

export function ActiveExerciseRouter({ exerciseId, stage, name, onExit }: ActiveExerciseRouterProps) {
  const getExerciseComponent = () => {
    switch (exerciseId) {
      case "major-minor-intro": return <MajorMinorIntroExercise onComplete={onExit} />;
      case "major-anchor": return <MajorAnchorExercise onComplete={onExit} />;
      case "minor-adjustment": return <MinorAdjustmentExercise onComplete={onExit} />;
      case "neighborhood-leap": return <NeighborhoodLeapExercise onComplete={onExit} />;
      case "step-skip": return <StepOrSkipExercise onComplete={onExit} />;
      case "boundary-jump": return <BoundaryJumpExercise onComplete={onExit} />;
      case "high-out-of-bounds": return <HighOutOfBoundsExercise onComplete={onExit} />;
      case "low-out-of-bounds": return <LowOutOfBoundsExercise onComplete={onExit} />;
      case "neighbor-shift": return <NeighborShiftExercise onComplete={onExit} />;
      case "i-to-v-leap": return <ItoVLeapExercise onComplete={onExit} />;
      case "melody-tracker": return <MelodyTrackerExercise onComplete={onExit} />;
      case "fourth-vs-fifth": return <FourthVsFifthExercise onComplete={onExit} />;
      case "octave-teleport": return <OctaveTeleportExercise onComplete={onExit} />;
      case "thumb-tuck": return <ThumbTuckExercise onComplete={onExit} />;
      case "parallel-slide": return <ParallelSlideExercise onComplete={onExit} />;
      case "triad-tracking": return <TriadTrackingExercise onComplete={onExit} />;
      case "sixth-vs-seventh": return <SixthVsSeventhExercise onComplete={onExit} />;
      case "degrees-123": return <Degrees123Exercise onComplete={onExit} />;
      case "degrees-45": return <Degrees45Exercise onComplete={onExit} />;
      case "degrees-67": return <Degrees67Exercise onComplete={onExit} />;
      case "master-navigator": return <MasterNavigatorExercise onComplete={onExit} />;
      default:
        return (
          <div className="py-20 text-center text-muted-foreground">
            <p>Exercise "{name}" is under construction!</p>
          </div>
        );
    }
  }

  return (
    <ExerciseContainer id={exerciseId} name={name} stage={stage} onExit={onExit}>
      {() => getExerciseComponent()}
    </ExerciseContainer>
  );
}
