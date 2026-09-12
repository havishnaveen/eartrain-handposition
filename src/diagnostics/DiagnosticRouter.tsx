import { useMemo, useState } from 'react';
import PathwayRouter from '../components/PathwayRouter';
import DiagnosticNavigator from '../dev/DiagnosticNavigator';
import type { DiagnosticSelection } from '../dev/DiagnosticNavigator';
import type { OclefIntegrationSession } from '../integration/oclefBridge';
import { DIAGNOSTIC_KEYS, DIAGNOSTIC_REGISTRY } from './registry';
import DiagnosticLessonView from './DiagnosticLessonView';
import { diagnosticReferral } from './routing';
import './diagnostics.css';

export default function DiagnosticRouter({ session }: { session: OclefIntegrationSession | null }) {
  const launch = session?.launch;
  const referral = useMemo(() => diagnosticReferral(launch, window.location.search), [launch]);
  const [selection, setSelection] = useState<DiagnosticSelection | null>(() => referral ? { problem: referral.definition.id, key: referral.key.id, stage: 1, revision: 0 } : null);
  const [keyError, setKeyError] = useState(referral?.invalidKey);
  const [standardRevision, setStandardRevision] = useState(0);
  const standard = () => { setSelection(null); setKeyError(undefined); setStandardRevision(value => value + 1); };
  const definition = DIAGNOSTIC_REGISTRY.find(item => item.id === selection?.problem);
  const selectedKey = DIAGNOSTIC_KEYS.find(key => key.id === selection?.key) ?? DIAGNOSTIC_KEYS[0];
  const tester = import.meta.env.DEV || new URLSearchParams(window.location.search).get('dev') === 'diagnostics';
  return <>
    {keyError ? <main className="diagnostic-card"><h1>Choose your practice key</h1><p>That link’s musical key was not recognized. Choose the key your teacher assigned.</p><select aria-label="Practice key" defaultValue="" onChange={e => { setSelection(current => current ? { ...current, key: e.target.value, revision: current.revision + 1 } : null); setKeyError(undefined); }}><option value="" disabled>Choose a key</option>{DIAGNOSTIC_KEYS.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}</select></main> :
      selection && definition ? <DiagnosticLessonView key={`${selection.problem}/${selection.key}/${selection.revision}`} definition={definition} selectedKey={selectedKey} initialStage={selection.stage} onStandard={standard} /> :
        <PathwayRouter key={standardRevision} initialLesson={launch?.assignment?.recommendedLessonIndex ?? launch?.checkpoint?.lessonIndex ?? 1} sessionQuestionCap={launch?.assignment?.questionCap} returnUrl={launch?.assignment?.returnUrl} externalLaunch={launch} />}
    {tester && <DiagnosticNavigator selection={selection} onSelect={next => { setKeyError(undefined); setSelection(next); }} onStandard={standard} />}
  </>;
}
