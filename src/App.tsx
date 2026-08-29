import PathwayRouter from './components/PathwayRouter';
import OclefIntegrationGate from './integration/OclefIntegrationGate';
import DevLessonJumper from './dev/DevLessonJumper';

function App() {
  return (
    <OclefIntegrationGate>
      {(session) => {
        const launch = session?.launch;
        const initialLesson = launch?.assignment?.recommendedLessonIndex ??
          launch?.checkpoint?.lessonIndex ??
          1;
        const renderPathway = (
          routedLesson: number,
          initialProofCompleted: boolean,
          remountKey: string,
        ) => (
          <PathwayRouter
            key={remountKey}
            initialLesson={routedLesson}
            initialProofCompleted={initialProofCompleted}
            sessionQuestionCap={launch?.assignment?.questionCap}
            returnUrl={launch?.assignment?.returnUrl}
            externalLaunch={launch}
          />
        );

        // Production safety boundary: DevLessonJumper is intentionally useful
        // in local builds, but must never render or bypass Prove It for students.
        if (!import.meta.env.DEV) {
          return renderPathway(initialLesson, false, 'live');
        }

        return (
          <DevLessonJumper baseInitialLesson={initialLesson}>
            {({ initialLesson: routedLesson, initialProofCompleted, remountKey }) => (
              renderPathway(routedLesson, initialProofCompleted, remountKey)
            )}
          </DevLessonJumper>
        );
      }}
    </OclefIntegrationGate>
  );
}

export default App;
