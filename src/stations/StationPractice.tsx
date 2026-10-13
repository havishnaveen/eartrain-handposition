import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseLayout from '../components/ExerciseLayout';
import AnswerFeedback from '../diagnostics/AnswerFeedback';
import type { DiagnosticDefinition, DiagnosticKey } from '../diagnostics/registry';
import { DiagnosticScore } from '../diagnostics/DiagnosticScore';
import { playDiagnosticExample } from '../diagnostics/playback';
import { calendarDate, dailyQueue } from './engine';
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

export default function StationPractice({ store, topic, need, definition, selectedKey, onRotate, onExhaustive, onStandard }: {
  store: StationStore; topic: StationTopic; need: StationNeed;
  definition: DiagnosticDefinition; selectedKey: DiagnosticKey;
  onRotate: (topic: StationTopic) => void; onExhaustive: () => void; onStandard: () => void;
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
    if (!session || !q) return;
    setBusy(true);
    try { await store.dispatch(session.id, q.id, event); }
    catch { setError('Progress could not be updated. Please try again.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    try { setSession(store.open(topic, need)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The daily station could not load.'); }
    const refresh = () => {
      setSession(current => current ? store.data.sessions[current.id] ?? current : null); redraw(v => v + 1);
    };
    const unsubscribe = store.subscribe(refresh);
    const storage = (event: StorageEvent) => { if (event.key === store.key) { store.refresh(); refresh(); } };
    window.addEventListener('storage', storage);
    return () => { unsubscribe(); window.removeEventListener('storage', storage); playback.current?.stop(); };
  }, [store, topic, need]);

  // A batch opens directly on its question. This initializes telemetry, not audio playback.
  useEffect(() => {
    if (session && q && phase === 'ready') void store.dispatch(session.id, q.id, { type: 'start', now: Date.now() });
  }, [store, session?.id, q?.id, phase]);

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
    if (!host || phase === 'ready' || phase === 'clue' || phase === 'clue-feedback') return;
    const check = () => setScoreReady(Boolean(host.querySelector('svg')));
    const observer = new MutationObserver(check); observer.observe(host, { subtree: true, childList: true }); check();
    return () => observer.disconnect();
  }, [q?.id, phase]);

  const play = async () => {
    if (!q?.audio || !session || playing || busy) return;
    setPlaying(true); setError('');
    const token = playDiagnosticExample(q.audio.pitches, q.audio.hesitationBefore, q.audio.durations, q.audio.hesitationSeconds);
    playback.current = token;
    try {
      await token.done;
      if (playback.current === token) await emit({ type: 'heard', replayCount: session.run.replayCount + 1 });
    } catch { if (playback.current === token) setError('Piano audio could not load. Retry playback; no attempt has been used.'); }
    finally { if (playback.current === token) { playback.current = null; setPlaying(false); } }
  };
  useEffect(() => () => { const token = playback.current; playback.current = null; token?.stop(); }, []);

  const date = calendarDate(Date.now(), store.data.timeZone);
  const queue = dailyQueue(store.data, date, store.student);
  const nextTopic = queue.find(t => t !== topic && !store.data.sessions[`${date}/${t}`]?.completedAt);
  const progress = store.data.progress[topic];
  return <ExerciseLayout lessonNumber={1} totalLessons={1} questionNumber={Math.min((session?.results.length ?? 0) + 1, 3)} questionsInLoop={3}
    lessonTitle={lesson.title} lessonFocus={lesson.focus} phaseLabel="Your practice prescription">
    <div className="diagnostic-flow diagnostic-flow--batch" data-diagnostic={topic}>
    <section className="diagnostic-card" aria-label={session?.completedAt ? 'Batch complete' : `Question ${(session?.results.length ?? 0) + 1} of 3`}>
      {store.warning && <p role="status" className="diagnostic-feedback">{store.warning}</p>}
      {error && <p role="alert">{error}</p>}
      {!session ? <><p>{progress?.status === 'maintenance' ? `Mastered · next retention check ${progress.nextDue}.` : 'Preparing today’s station…'}</p><button onClick={onExhaustive}>Open full practice</button></> :
        session.completedAt ? <div className="diagnostic-brief-feedback" aria-live="polite">
          <p className="diagnostic-brief-text">Batch complete · {session.results.filter(r => r.firstAttemptCorrect).length}/3 correct on the first attempt.</p>
          <button className="et-start" onClick={nextTopic ? () => onRotate(nextTopic) : onStandard}>{nextTopic ? 'Continue' : 'Return to standard curriculum'}</button>
        </div> : q && <>
          {phase === 'clue' || phase === 'clue-feedback' ? <div>
              <h2 className="diagnostic-prompt">{q.clue.prompt}</h2>
              <div className="diagnostic-choices">{q.clue.choices.map((text, i) => <button key={text} disabled={busy || phase !== 'clue'} onClick={() => void emit({ type: 'guided', choice: i })}>{text}</button>)}</div>
              {phase === 'clue-feedback' && <AnswerFeedback correct={session.run.guidedChoice === q.clue.correct} explanation={q.clue.explanation}
                answer={q.clue.choices[q.clue.correct]} disabled={busy} label="Retry" onContinue={() => void emit({ type: 'retry' })} />}
            </div> : <>
              <div ref={scoreHost}><DiagnosticScore question={q.question} notation={q.notation} musicXML={q.musicXML} wrapSystems /></div>
              <h2 className="diagnostic-prompt">{q.prompt}</h2>
              {q.audio && phase !== 'feedback' && <div className="diagnostic-action-area"><button className="et-start" disabled={playing || busy || !scoreReady} onClick={() => void play()}>{playing ? 'Playing…' : 'Play piano example'}</button></div>}
              <div className="diagnostic-choices">{q.choices.map((text, i) => <button key={text} disabled={busy || playing || !scoreReady || phase === 'ready' || phase === 'feedback' || Boolean(q.audio && !session.run.heard)} onClick={() => void emit({ type: 'answer', choice: i, responseMs: responseMs() })}>{text}</button>)}</div>
              {phase === 'feedback' && <AnswerFeedback correct={session.run.finalChoice === q.correct} explanation={stationExplanation(q)} answer={q.choices[q.correct]}
                disabled={busy} onContinue={() => void emit({ type: 'record', now: Date.now() })} />}
            </>}
        </>}
    </section>
    </div>
  </ExerciseLayout>;
}
