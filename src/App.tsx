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
        return (
          <DevLessonJumper baseInitialLesson={initialLesson}>
            {({ initialLesson: routedLesson, initialProofCompleted, remountKey }) => (
              <PathwayRouter
                key={remountKey}
                initialLesson={routedLesson}
                initialProofCompleted={initialProofCompleted}
                sessionQuestionCap={launch?.assignment?.questionCap}
                returnUrl={launch?.assignment?.returnUrl}
                externalLaunch={launch}
              />
            )}
          </DevLessonJumper>
        );
      }}
    </OclefIntegrationGate>
  );
}

export default App;
