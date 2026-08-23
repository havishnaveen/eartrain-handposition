import { useEffect, useState, type ReactNode } from 'react';
import {
  initializeOclefIntegration,
  startAutomaticOclefSync,
  type IntegrationBootstrap,
  type OclefIntegrationSession,
} from './oclefBridge';

export interface OclefIntegrationGateProps {
  children: (session: OclefIntegrationSession | null) => ReactNode;
}

export default function OclefIntegrationGate({ children }: OclefIntegrationGateProps) {
  const [bootstrap, setBootstrap] = useState<IntegrationBootstrap | null>(null);

  useEffect(() => {
    let alive = true;
    let stopSync: () => void = () => undefined;
    void initializeOclefIntegration().then((result) => {
      if (!alive) return;
      setBootstrap(result);
      if (result.mode === 'oclef') stopSync = startAutomaticOclefSync();
    });
    return () => {
      alive = false;
      stopSync();
    };
  }, []);

  if (!bootstrap) {
    return (
      <main className="et-integration-gate" aria-live="polite">
        <div className="et-integration-gate__pulse" aria-hidden="true" />
        <p>Opening your practice…</p>
      </main>
    );
  }

  if (bootstrap.mode === 'error') {
    return (
      <main className="et-integration-gate et-integration-gate--error" role="alert">
        <div aria-hidden="true">♪</div>
        <h1>Practice link expired</h1>
        <p>{bootstrap.message}</p>
      </main>
    );
  }

  return <>{children(bootstrap.session)}</>;
}
