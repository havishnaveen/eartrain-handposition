import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseLayout from '../components/ExerciseLayout';
import AnswerFeedback from '../diagnostics/AnswerFeedback';
import type { DiagnosticDefinition, DiagnosticKey } from '../diagnostics/registry';
import { DiagnosticScore } from '../diagnostics/DiagnosticScore';
import { playDiagnosticExample } from '../diagnostics/playback';
import {
  finishOclefVisitAndReturn,
  flushOclefResults,
  recordOclefVisitLesson,
} from '../integration/oclefBridge';
import { learningProfileStore } from '../profiles/learningProfileStore';
import { BATCH_COUNT } from './generator';
import PlayingQuestion from './PlayingQuestion';
import type { SessionEvent } from './engine';
import type { StationStore } from './store';
import { stationExplanation } from './feedback';
import type { StationNeed, StationSession, StationTopic } from './types';

export function StationControls({ mode, onMode }: {
  mode: 'station' | 'exhaustive'; onMode: (value: 'station' | 'exhaustive') => void;
}) {
  return <div className="diagnostic-section"><span className="diagnostic-section-title">Practice mode</span>
    <label className="diagnostic-select-wrap"><select aria-label="Practice mode" value={mode} onChange={e => onMode(e.target.value as 'station' | 'exhaustive')}>
      <option value="station">Three-question batches</option><option value="exhaustive">All exercises</option>
    </select></label></div>;
}

export default function StationPractice({ store, topic, need, definition, selectedKey, batch, returnUrl, onNextBatch, onStandard }: {
  store: StationStore; topic: StationTopic; need: StationNeed;
  definition: DiagnosticDefinition; selectedKey: DiagnosticKey;
  batch: number; returnUrl?: string; onNextBatch: () => void; onStandard: () => void;
}) {
  const [, redraw] = useState(0);
  const lesson = useMemo(() => definition.create(selectedKey), [definition, selectedKey]);
  const [session, setSession] = useState<StationSession | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [playing, setPlaying] = useState(false);
  const [scoreReady, setScoreReady] = useState(false);
  const scoreHost = useRef<HTMLDivElement>(null);
  const playback = useRef<ReturnType<typeof playDiagnosticExample> | null>(null);
  const clock = useRef({ accumulated: 0, start: 0 });
  const phase = session?.run.phase, q = session?.questions[session.results.length];
  const emit = async (event: SessionEvent) => {
    if (!session || !q) return false;
    setBusy(true);
    try { await store.dispatch(session.id, q.id, event); return true; }
    catch { setError('Progress could not be updated. Please try again.'); return false; }
    finally { setBusy(false); }
  };
  useEffect(() => {
    try { setSession(store.open(topic, need, Date.now(), batch)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The daily station could not load.'); }
    const refresh = () => {
      setSession(current => current ? store.data.sessions[current.id] ?? current : null); redraw(v => v + 1);
    };
    const unsubscribe = store.subscribe(refresh);
    const storage = (event: StorageEvent) => { if (event.key === store.key) { store.refresh(); refresh(); } };
    window.addEventListener('storage', storage);
    return () => { unsubscribe(); window.removeEventListener('storage', storage); playback.current?.stop(); };
  }, [store, topic, need, batch]);

  // A batch opens directly on its question. This initializes telemetry, not audio playback.
  useEffect(() => {
    if (session && q && phase === 'ready') {
      void store.dispatch(session.id, q.id, { type: 'start', now: Date.now() });
      learningProfileStore.recordActivity('exercise.started', {
        topic,
        batch,
        questionIndex: session.results.length + 1,
        questionId: q.id,
        kind: q.kind,
      });
    }
  }, [store, session?.id, q?.id, phase, topic, batch]);

  // Only visible decision time counts. Persist checkpoints so reload never makes a slow attempt fast.
  useEffect(() => {
    clock.current = { accumulated: session?.run.responseMs ?? 0, start: 0 };
    if (!session || !q || phase !== 'answering') return;
    const tick = () => {
      if (clock.current.start) clock.current.accumulated += performance.now() - clock.current.start;
      clock.current.start = !document.hidden && !playing && scoreReady && (!q.audio || session.run.heard) ? performance.now() : 0;
    };
    const checkpoint = () => { tick(); void store.dispatch(session.id, q.id, { type: 'time', responseMs: clock.current.accumulated }); };
    tick(); document.addEventListener('visibilitychange', checkpoint); window.addEventListener('pagehide', checkpoint);
    const interval = window.setInterval(checkpoint, 3000);
    return () => {
      window.clearInterval(interval); document.removeEventListener('visibilitychange', checkpoint); window.removeEventListener('pagehide', checkpoint);
      tick(); void store.dispatch(session.id, q.id, { type: 'time', responseMs: clock.current.accumulated });
    };
    // Snapshot object changes on each save; only phase/heard/render/play state should restart the clock.
  }, [store, session?.id, q?.id, phase, session?.run.heard, playing, scoreReady]);
  const responseMs = () => clock.current.accumulated + (clock.current.start ? performance.now() - clock.current.start : 0);

  useEffect(() => {
    setScoreReady(false);
    const host = scoreHost.current;
    if (!host) return;
    const check = () => setScoreReady(Boolean(host.querySelector('svg')));
    const observer = new MutationObserver(check); observer.observe(host, { subtree: true, childList: true }); check();
    return () => observer.disconnect();
  }, [q?.id, phase]);

  const play = async () => {
    if (!q?.audio || !session || playing || busy) return;
    setPlaying(true); setError('');
    const token = playDiagnosticExample(q.audio.pitches, q.audio.hesitationBefore, q.audio.durations, q.audio.hesitationSeconds, q.question.handScope === 'both' ? q.question : undefined);
    playback.current = token;
    try {
      await token.done;
      if (playback.current === token) await emit({ type: 'heard', replayCount: session.run.replayCount + 1 });
    } catch { if (playback.current === token) setError('Piano audio could not load. Retry playback; no attempt has been used.'); }
    finally { if (playback.current === token) { playback.current = null; setPlaying(false); } }
  };
  useEffect(() => () => { const token = playback.current; playback.current = null; token?.stop(); }, []);

  const guiding = phase === 'clue' || phase === 'clue-feedback';
  const advance = async () => {
    const completedIndex = (session?.results.length ?? 0) + 1;
    const passed = session && q ? session.run.finalChoice === q.correct : false;
    const firstAttemptCorrect = session ? session.run.firstChoice === q?.correct : false;
    const elapsedMs = Math.round(session?.run.responseMs ?? 0);
    if (!await emit({ type: 'record', now: Date.now() })) return;
    learningProfileStore.recordActivity('exercise.completed', {
      topic,
      batch,
      questionIndex: completedIndex,
      questionId: q?.id ?? null,
      passed,
      firstAttemptCorrect,
      responseMs: elapsedMs,
    });
    if (session?.results.length === 2) {
      const priorCorrect = session.results.filter(r => r.firstAttemptCorrect).length + (firstAttemptCorrect ? 1 : 0);
      const score = Math.round((priorCorrect / 3) * 100);
      recordOclefVisitLesson({
        id: `${topic}-batch-${batch}`,
        title: `${lesson.title} · Batch ${batch}`,
        completed: true,
        score,
      });
      learningProfileStore.recordActivity('session.completed', {
        topic,
        batch,
        questionsCompleted: 3,
        score,
      });
      void flushOclefResults({ completed: true });
      if (batch < BATCH_COUNT) onNextBatch(); else onStandard();
    }
  };
  return <ExerciseLayout lessonNumber={1} totalLessons={1} questionNumber={Math.min((session?.results.length ?? 0) + 1, 3)} questionsInLoop={3}
    lessonTitle={lesson.title} lessonFocus={lesson.focus} phaseLabel={`Batch ${batch} of ${BATCH_COUNT}`}>
    <div className="diagnostic-flow diagnostic-flow--batch" data-diagnostic={topic}>
    {returnUrl ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <a
          href={returnUrl}
          onClick={(e) => {
            e.preventDefault();
            void finishOclefVisitAndReturn();
          }}
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#ef6a47',
            textDecoration: 'none',
            padding: '6px 14px',
            borderRadius: '999px',
            border: '1px solid rgba(239, 106, 71, 0.35)',
            background: '#fffaf7',
          }}
        >
          ← Back to Oclef
        </a>
      </div>
    ) : null}
    <section className="diagnostic-card" aria-label={session?.completedAt ? 'Batch complete' : `Question ${(session?.results.length ?? 0) + 1} of 3`}>
      {store.warning && <p role="status" className="diagnostic-feedback">{store.warning}</p>}
      {error && <p role="alert">{error}</p>}
      {q && session && (q.kind === 'play' ? <PlayingQuestion key={q.id} q={q} disabled={busy || phase === 'ready'} label={batch < BATCH_COUNT ? 'Next batch' : (returnUrl ? 'Back to Oclef' : 'Finish')}
        onComplete={async result => {
          const priorCorrect = session.results.filter(r => r.firstAttemptCorrect).length + (result.firstAttemptCorrect ? 1 : 0);
          const score = Math.round((priorCorrect / 3) * 100);
          if (!await emit({ type: 'performance', ...result, now: Date.now() })) return;
          recordOclefVisitLesson({
            id: `${topic}-batch-${batch}`,
            title: `${lesson.title} · Batch ${batch}`,
            completed: true,
            score,
          });
          learningProfileStore.recordActivity('session.completed', {
            topic,
            batch,
            questionsCompleted: 3,
            score,
          });
          void flushOclefResults({ completed: true });
          if (batch < BATCH_COUNT) onNextBatch(); else onStandard();
        }} /> : <>
              <div ref={scoreHost}><DiagnosticScore question={q.question} notation={q.notation} musicXML={q.musicXML} wrapSystems /></div>
              <h2 className="diagnostic-prompt">{q.prompt}</h2>
              {q.audio && <div className="diagnostic-action-area"><button className="et-start" disabled={playing || busy || !scoreReady} onClick={() => void play()}>{playing ? 'Playing…' : 'Play piano example'}</button></div>}
              <div className="diagnostic-choices">{q.choices.map((text, i) => <button key={text} aria-pressed={session.run.finalChoice === i} disabled={busy || playing || !scoreReady || !['answering', 'retry'].includes(phase ?? '') || Boolean(q.audio && !session.run.heard)} onClick={() => void emit({ type: 'answer', choice: i, responseMs: responseMs() })}>{text}</button>)}</div>
              {session.run.finalChoice !== null && session.run.finalChoice !== q.correct && phase !== 'retry' && <p className="diagnostic-brief-badge diagnostic-brief-badge--wrong" role="status">Incorrect: {q.choices[session.run.finalChoice]}.</p>}
          {guiding ? <div>
              <h2 className="diagnostic-prompt">{q.clue.prompt}</h2>
              <div className="diagnostic-choices">{q.clue.choices.map((text, i) => <button key={text} disabled={busy || playing || phase !== 'clue'} onClick={() => void emit({ type: 'guided', choice: i })}>{text}</button>)}</div>
              {phase === 'clue-feedback' && <AnswerFeedback correct={session.run.guidedChoice === q.clue.correct} explanation={q.clue.explanation}
                answer={q.clue.choices[q.clue.correct]} disabled={busy || playing} label="Retry" onContinue={() => void emit({ type: 'retry' })} />}
            </div> : <>
              {phase === 'feedback' && <AnswerFeedback correct={session.run.finalChoice === q.correct} explanation={stationExplanation(q)} answer={q.choices[q.correct]}
                disabled={busy || playing} label={session.results.length === 2 ? batch < BATCH_COUNT ? 'Next batch' : (returnUrl ? 'Back to Oclef' : 'Finish') : 'Continue'} onContinue={() => void advance()} />}
            </>}
        </>)}
    </section>
    </div>
  </ExerciseLayout>;
}
