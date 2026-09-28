import DiagnosticRouter from './diagnostics/DiagnosticRouter';
import OclefIntegrationGate from './integration/OclefIntegrationGate';

function App() {
  return (
    <OclefIntegrationGate>
      {(session) => <DiagnosticRouter session={session} />}
    </OclefIntegrationGate>
  );
}

export default App;
