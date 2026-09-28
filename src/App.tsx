import DevLessonJumper from './dev/DevLessonJumper';
import DiagnosticRouter from './diagnostics/DiagnosticRouter';
import OclefIntegrationGate from './integration/OclefIntegrationGate';

function App() {
  return (
    <OclefIntegrationGate>
      {(session) => {
        const launch = session?.launch;
        const initialLesson =
          launch?.assignment?.recommendedLessonIndex ??
          launch?.checkpoint?.lessonIndex ??
          1;
        return (
          <DevLessonJumper baseInitialLesson={initialLesson}>
            {({ initialLesson: routedLesson, initialProofCompleted, remountKey }) => (
              <DiagnosticRouter
                key={remountKey}
                session={session}
                initialLesson={routedLesson}
                initialProofCompleted={initialProofCompleted}
              />
            )}
          </DevLessonJumper>
        );
      }}
    </OclefIntegrationGate>
  );
}

export default App;
