import PathwayRouter from './components/PathwayRouter';
import OclefIntegrationGate from './integration/OclefIntegrationGate';


function App() {
  return (
    <OclefIntegrationGate>
      {(session) => {
        const launch = session?.launch;
        const initialLesson = launch?.assignment?.recommendedLessonIndex ??
          launch?.checkpoint?.lessonIndex ??
          1;
        return (
          <PathwayRouter
            initialLesson={initialLesson}
            initialProofCompleted={false}
            sessionQuestionCap={launch?.assignment?.questionCap}
            returnUrl={launch?.assignment?.returnUrl}
            externalLaunch={launch}
          />
        );
      }}
    </OclefIntegrationGate>
  );
}

export default App;
