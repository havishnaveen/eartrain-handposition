import { useRef, useState } from 'react';
import AcousticDrill from '../diagnostics/AcousticDrill';
import type { AcousticResult } from '../diagnostics/AcousticDrill';
import AnswerFeedback from '../diagnostics/AnswerFeedback';
import { DiagnosticScore } from '../diagnostics/DiagnosticScore';
import type { StationQuestion } from './types';
import { playingFollowUp } from './playingFeedback';

export interface PerformanceResult { correct: boolean; firstAttemptCorrect: boolean; attempts: number; guidedCorrect: boolean | null }

function PerformanceReview({ q, result, onGuided, onComplete, label, disabled }: {
  q: StationQuestion; result: AcousticResult; onGuided: (correct: boolean) => void;
  onComplete: () => void; label: string; disabled: boolean;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const clue = playingFollowUp(q, result.report);
  const guiding = !result.passed && result.failedTakes === 1 && clue;
  const explanation = result.passed ? 'You played the written notes with a steady beat.'
    : clue?.explanation ?? (result.report.hardExtras ? 'Extra notes were heard. Play only the written notes.' : 'Keep the written rhythm steady through the phrase.');
  return <>
    <DiagnosticScore question={q.question} notation={q.notation} musicXML={q.musicXML} wrapSystems />
    <h2 className="diagnostic-prompt">{q.prompt}</h2>
    {guiding ? <>
      <p className="diagnostic-brief-badge diagnostic-brief-badge--wrong">Incorrect</p>
      <h2 className="diagnostic-prompt">{clue.prompt}</h2>
      <div className="diagnostic-choices">{clue.choices.map((text, i) => <button key={text} disabled={choice !== null} aria-pressed={choice === i}
        onClick={() => { setChoice(i); onGuided(i === clue.correct); }}>{text}</button>)}</div>
      {choice !== null && <AnswerFeedback correct={choice === clue.correct} explanation={clue.explanation} answer={clue.choices[clue.correct]} label="Play again" onContinue={result.retry} />}
    </> : <AnswerFeedback correct={result.passed} explanation={explanation} disabled={disabled}
      label={!result.passed && result.failedTakes < 2 ? 'Play again' : label}
      onContinue={!result.passed && result.failedTakes < 2 ? result.retry : onComplete} />}
  </>;
}

/** Uses the established microphone and grading engine. A clue/retry stays inside this slot. */
export default function PlayingQuestion({ q, onComplete, label, disabled }: {
  q: StationQuestion; onComplete: (result: PerformanceResult) => void; label: string; disabled: boolean;
}) {
  const guided = useRef<boolean | null>(null);
  return <AcousticDrill question={q.question} notation={q.notation} musicXML={q.musicXML}
    diagnosticId={q.topic} transfer={false} skipProof onPassed={() => {}}
    renderResult={result => <PerformanceReview key={`${result.failedTakes}/${result.passed}`} q={q} result={result} label={label} disabled={disabled}
      onGuided={correct => { guided.current = correct; }}
      onComplete={() => onComplete({ correct: result.passed, firstAttemptCorrect: result.passed && result.failedTakes === 0,
        attempts: result.failedTakes + (result.passed ? 1 : 0), guidedCorrect: guided.current })} />} />;
}
