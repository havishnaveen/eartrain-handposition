import { useMemo, useState } from 'react';
import PathwayRouter from '../components/PathwayRouter';
import DiagnosticNavigator from '../dev/DiagnosticNavigator';
import type { DiagnosticSelection } from '../dev/DiagnosticNavigator';
import type { OclefIntegrationSession } from '../integration/oclefBridge';
import { DIAGNOSTIC_KEYS, DIAGNOSTIC_REGISTRY } from './registry';
import type { DiagnosticStage } from './registry';
import DiagnosticLessonView from './DiagnosticLessonView';
import { diagnosticReferral } from './routing';
import './diagnostics.css';

export default function DiagnosticRouter({ session }: { session: OclefIntegrationSession | null }) {
  const launch = session?.launch;
  const referral = useMemo(() => diagnosticReferral(launch, window.location.search), [launch]);
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const parsedStage = searchParams ? parseInt(searchParams.get('stage') || '', 10) : NaN;
  const initialStage = (!isNaN(parsedStage) && parsedStage >= 1 && parsedStage <= 4) ? (parsedStage as DiagnosticStage) : 1;
  const [selection, setSelection] = useState<DiagnosticSelection | null>(() => referral ? { problem: referral.definition.id, key: referral.key.id, stage: initialStage, revision: 0 } : null);
  const [keyError, setKeyError] = useState(referral?.invalidKey);
  const [standardRevision, setStandardRevision] = useState(0);
  const [standardState, setStandardState] = useState<{
    lesson: number;
    question: number;
    proofCompleted: boolean;
  } | null>(null);

  const parsedLesson = searchParams ? parseInt(searchParams.get('lesson') || '', 10) : NaN;
  const initialLesson = !isNaN(parsedLesson)
    ? parsedLesson
    : (launch?.assignment?.recommendedLessonIndex ?? launch?.checkpoint?.lessonIndex ?? 1);
  const initialProofCompleted = searchParams ? searchParams.get('noproof') === '1' : false;
  const parsedQuestion = searchParams ? parseInt(searchParams.get('drill') || '', 10) : NaN;
  const initialQuestion = !isNaN(parsedQuestion) ? parsedQuestion : 1;

  const handleJumpStandard = (lesson: number, drill: number, noProof: boolean) => {
    setSelection(null);
    setKeyError(undefined);
    setStandardState({ lesson, question: drill, proofCompleted: noProof });
    setStandardRevision(v => v + 1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('diagnosis');
      url.searchParams.delete('stage');
      url.searchParams.delete('key');
      url.searchParams.set('lesson', String(lesson));
      url.searchParams.set('drill', String(drill));
      if (noProof) {
        url.searchParams.set('noproof', '1');
      } else {
        url.searchParams.delete('noproof');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleSelectDiagnostic = (next: DiagnosticSelection) => {
    setKeyError(undefined);
    setSelection(next);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('diagnosis', next.problem);
      url.searchParams.set('stage', String(next.stage));
      url.searchParams.set('key', next.key);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const standard = () => {
    setSelection(null);
    setKeyError(undefined);
    setStandardRevision(value => value + 1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('diagnosis');
      url.searchParams.delete('stage');
      url.searchParams.delete('key');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const definition = DIAGNOSTIC_REGISTRY.find(item => item.id === selection?.problem);
  const selectedKey = DIAGNOSTIC_KEYS.find(key => key.id === selection?.key) ?? DIAGNOSTIC_KEYS[0];
  const tester = true;

  return <>
    {keyError ? <main className="diagnostic-card"><h1>Choose your practice key</h1><p>That link’s musical key was not recognized. Choose the key your teacher assigned.</p><select aria-label="Practice key" defaultValue="" onChange={e => { setSelection(current => current ? { ...current, key: e.target.value, revision: current.revision + 1 } : null); setKeyError(undefined); }}><option value="" disabled>Choose a key</option>{DIAGNOSTIC_KEYS.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}</select></main> :
      selection && definition ? <DiagnosticLessonView key={`${selection.problem}/${selection.key}/${selection.revision}`} definition={definition} selectedKey={selectedKey} initialStage={selection.stage} onStandard={standard} /> :
        <PathwayRouter
          key={standardRevision}
          initialLesson={standardState ? standardState.lesson : initialLesson}
          initialQuestion={standardState ? standardState.question : initialQuestion}
          initialProofCompleted={standardState ? standardState.proofCompleted : initialProofCompleted}
          sessionQuestionCap={launch?.assignment?.questionCap}
          returnUrl={launch?.assignment?.returnUrl}
          externalLaunch={launch}
        />}
    {tester && (
      <DiagnosticNavigator
        selection={selection}
        onSelect={handleSelectDiagnostic}
        onStandard={standard}
        onJumpStandard={handleJumpStandard}
        currentLesson={standardState?.lesson ?? initialLesson}
        currentQuestion={standardState?.question ?? initialQuestion}
      />
    )}
  </>;
}
