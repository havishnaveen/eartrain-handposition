import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ExerciseLayout from '../components/ExerciseLayout';
import AnswerFeedback from './AnswerFeedback';
import AcousticDrill from './AcousticDrill';
import { DiagnosticScore } from './DiagnosticScore';
import { playDiagnosticExample } from './playback';
import { prepareProfessorNotification } from './professorNotifications';
import { KEY_SIGNATURE_CHECKS, KEY_SIGNATURE_NATURAL_CHECK } from './keySignatureContent';
import type { KeySignatureCheck } from './keySignatureContent';
import type { DiagnosticLesson, DiagnosticStage } from './registry';

function ReadingCheck({ check, stage, index, onNext }: {
  check: KeySignatureCheck; stage: number; index: number; onNext: (needsReview: boolean) => void;
}) {
  const [phase, setPhase] = useState<'question' | 'clue' | 'clue-feedback' | 'retry' | 'result'>('question');
  const [clueIndex, setClueIndex] = useState(0);
  const [clueFailed, setClueFailed] = useState(false);
  const [passed, setPassed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState('');
  const [clueFeedback, setClueFeedback] = useState('');
  const [clueCorrect, setClueCorrect] = useState(false);
  const playback = useRef<ReturnType<typeof playDiagnosticExample> | null>(null);
  const alive = useRef(true), locked = useRef(false);
  const clue = check.clues[clueIndex];
  const options = useMemo(() => check.choices.map((text, answer) => ({ text, answer }))
    .map(option => ({ ...option, order: Math.random() })).sort((a, b) => a.order - b.order), [check]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; playback.current?.stop(); };
  }, []);

  const play = async () => {
    if (!check.audio || locked.current) return;
    locked.current = true; setPlaying(true); setError('');
    const run = playDiagnosticExample(check.audio); playback.current = run;
    try { await run.done; if (alive.current) setHeard(true); }
    catch { if (alive.current) setError('Piano audio could not load. Press Play again.'); }
    finally { locked.current = false; if (alive.current) setPlaying(false); }
  };

  const answer = (choice: number) => {
    if (playing || (check.audio && !heard) || !['question', 'retry'].includes(phase)) return;
    if (choice === check.correct) { setPassed(true); setPhase('result'); }
    else if (phase === 'question') { setPhase('clue'); }
    else {
      if (clueFailed) {
        prepareProfessorNotification({ diagnosticId: 'key-signature', lessonTitle: 'Key Signature Reading', stage,
          questionIndex: index, questionPrompt: check.prompt, attemptsCount: 3,
          details: 'Initial answer, guided check, and retry were incorrect. Teacher review recommended; delivery is not confirmed.' });
      }
      setPassed(false); setPhase('result');
    }
  };

  const continueClue = () => {
    if (clueIndex + 1 < check.clues.length) { setClueIndex(i => i + 1); setPhase('clue'); }
    else { setHeard(false); setPhase('retry'); }
  };

  const guiding = phase === 'clue' || phase === 'clue-feedback';
  return <section className="diagnostic-card" aria-label={stage === 1 ? `Question ${index + 1} of ${KEY_SIGNATURE_CHECKS.length}` : 'Natural sign check'}>
    <DiagnosticScore question={check.question} notation={check.notation}
      highlightNoteIndex={guiding ? clue.highlightNoteIndex : check.target} />
    {error && <p className="diagnostic-feedback" role="alert">{error}</p>}
    {(phase === 'question' || phase === 'retry') && <>
      {phase === 'retry' && <p className="diagnostic-context-note">Try the original question again.</p>}
      <h2 className="diagnostic-prompt">{check.prompt}</h2>
      {check.audio && <div className="diagnostic-action-area">
        <button type="button" className="et-start" disabled={playing} onClick={() => { void play(); }}>
          {playing ? 'Playing…' : heard ? 'Replay piano example' : 'Play piano example'}
        </button>
      </div>}
      <div className="diagnostic-choices">
        {options.map(option => <button key={option.answer} type="button" disabled={playing || Boolean(check.audio && !heard)}
          onClick={() => answer(option.answer)}>{option.text}</button>)}
      </div>
    </>}
    {guiding && <>
      <p className="diagnostic-context-note">Check the clue.</p>
      <h2 className="diagnostic-prompt">{clue.prompt}</h2>
      <div className="diagnostic-choices">
        {clue.choices.map((choice, i) => <button key={choice} type="button" disabled={phase === 'clue-feedback'} onClick={() => {
          if (phase !== 'clue') return;
          if (i !== clue.correct) setClueFailed(true);
          setClueCorrect(i === clue.correct);
          setClueFeedback(clue.explanation);
          setPhase('clue-feedback');
        }}>{choice}</button>)}
      </div>
      {phase === 'clue-feedback' && <AnswerFeedback correct={clueCorrect} explanation={clueFeedback}
        onContinue={continueClue} label={clueIndex + 1 < check.clues.length ? 'Next clue' : 'Retry original question'} />}
    </>}
    {phase === 'result' && <AnswerFeedback correct={passed} answer={check.choices[check.correct]} explanation={check.explanation} onContinue={() => onNext(!passed)} />}
  </section>;
}

export default function KeySignatureLessonView({ lesson, initialStage, onStandard }: {
  lesson: DiagnosticLesson; initialStage: DiagnosticStage; onStandard: () => void;
}) {
  const [stage, setStage] = useState(initialStage);
  const [index, setIndex] = useState(0);
  const [needsReview, setNeedsReview] = useState(false);
  const [done, setDone] = useState(false);
  const advance = (review: boolean) => {
    if (review) setNeedsReview(true);
    if (stage === 1 && index + 1 < KEY_SIGNATURE_CHECKS.length) setIndex(i => i + 1);
    else if (stage < 4) setStage(s => (s + 1) as DiagnosticStage);
    else setDone(true);
  };
  let content: ReactNode;
  if (done) content = <section className="diagnostic-card diagnostic-complete">
    <h2 className="diagnostic-prompt">{needsReview ? 'Keep practicing the key-signature rule' : 'You applied the key signature to fresh phrases!'}</h2>
    <p className="diagnostic-complete__p">{needsReview ? 'Some checks still need practice. Read the signature before starting, and keep its notes in mind across every measure.' : 'Barlines do not end the signature. A written accidental temporarily overrides it.'}</p>
    <div className="diagnostic-action-area"><button type="button" className="et-start" onClick={onStandard}>Return to standard curriculum</button></div>
  </section>;
  else if (stage < 3) content = <ReadingCheck key={`${stage}/${index}`} stage={stage} index={index}
    check={stage === 1 ? KEY_SIGNATURE_CHECKS[index] : KEY_SIGNATURE_NATURAL_CHECK} onNext={advance} />;
  else {
    const transfer = stage === 4;
    content = <AcousticDrill key={stage} diagnosticId="key-signature" question={transfer ? lesson.transfer : lesson.question}
    notation={transfer ? lesson.transferNotation : lesson.notation} transfer={transfer} skipProof
    forcedErrorMessage={transfer ? 'Check the one-flat signature: unmarked Bs are B♭ unless a written accidental is active.' : lesson.forcedErrorMessage}
    mistakePitches={transfer ? lesson.transfer.expectedSequence.map((pitch, i) => i === 6 ? 'B4' : pitch) : lesson.mistakePitches}
    onPassed={() => advance(false)} onNeedsReview={() => advance(true)} />;
  }
  return <ExerciseLayout lessonNumber={1} totalLessons={1} questionNumber={stage} questionsInLoop={4}
    lessonTitle={lesson.title} lessonFocus={lesson.focus} phaseLabel="Your practice prescription">
    <div className="diagnostic-flow" data-diagnostic="key-signature" data-stage={stage}>{content}</div>
  </ExerciseLayout>;
}
