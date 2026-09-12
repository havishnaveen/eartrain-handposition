import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseLayout from '../components/ExerciseLayout';
import AcousticDrill from './AcousticDrill';
import { DiagnosticScore } from './DiagnosticScore';
import DiagnosticTip from './DiagnosticTip';
import { playDiagnosticExample } from './playback';
import type { DiagnosticDefinition, DiagnosticKey, DiagnosticLesson, DiagnosticStage } from './registry';

const RecordDot = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <circle cx="12" cy="12" r="7" fill="currentColor" />
  </svg>
);

function ListenAndJudge({ lesson, onNext }: { lesson: DiagnosticLesson; onNext: () => void }) {
  const [playing, setPlaying] = useState(false), [heard, setHeard] = useState(false);
  const [answer, setAnswer] = useState<boolean | null>(null), [error, setError] = useState('');
  const playback = useRef<ReturnType<typeof playDiagnosticExample> | null>(null), alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; playback.current?.stop(); }; }, []);
  const play = async () => {
    if (locked.current) return;
    locked.current = true; setPlaying(true); setError('');
    const run = playDiagnosticExample(lesson.mistakePitches, lesson.hesitationBefore); playback.current = run;
    try { await run.done; if (alive.current) setHeard(true); }
    catch { if (alive.current) setError('The piano recording could not load. Check your connection and press Play again.'); }
    finally { locked.current = false; if (alive.current) setPlaying(false); }
  };
  return <section className="diagnostic-card" aria-label="Listen and judge">
    <DiagnosticScore question={lesson.question} notation={lesson.notation} highlight={answer !== null} />
    <div className="diagnostic-action-area">
      <div className="et-start-callout" role="note">
        {playing
          ? 'Listening to the piano example…'
          : heard
            ? (answer !== null ? 'Clue revealed below' : 'Did the piano play what is written, or was there a mistake?')
            : 'Listen closely to the piano example'}
      </div>
      <button
        type="button"
        className="et-start"
        disabled={playing}
        onClick={() => { void play(); }}
      >
        <span className="et-start__dot"><RecordDot /></span>
        {playing ? 'Playing…' : heard ? 'Play again' : 'Play piano example'}
      </button>
      {error && <p role="alert" className="diagnostic-error">{error}</p>}
    </div>

    <div className="diagnostic-prompt-section">
      <h2 className="diagnostic-prompt">Did the piano play what is written, or was there a mistake?</h2>
      <div className="diagnostic-choices">
        <button
          type="button"
          disabled={!heard || playing || answer !== null}
          aria-pressed={answer === false}
          onClick={() => setAnswer(false)}
        >
          Sounds Right
        </button>
        <button
          type="button"
          disabled={!heard || playing || answer !== null}
          aria-pressed={answer === true}
          onClick={() => setAnswer(true)}
        >
          Spot the Mistake
        </button>
      </div>
    </div>

    {answer !== null && <div className="diagnostic-feedback" role="status">
      <strong>{answer ? 'Good listening! You spotted it.' : 'Good try. Let’s listen for this clue together.'}</strong>
      <p>{lesson.explanation}</p>
      <p className="diagnostic-feedback__sub">The orange notes mark where the sound went off track.</p>
      <div className="diagnostic-action-area diagnostic-action-area--feedback">
        <div className="et-start-callout" role="note">
          Ready to discover the clue?
        </div>
        <button type="button" className="et-start" disabled={playing} onClick={onNext}>
          <span className="et-start__dot"><RecordDot /></span>
          Discover the clue
        </button>
      </div>
    </div>}
  </section>;
}

function ConceptQuestion({ lesson, onNext }: { lesson: DiagnosticLesson; onNext: () => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const correct = choice === lesson.mcq.correct;
  return <section className="diagnostic-card" aria-label="Discover the clue">
    <h2 className="diagnostic-prompt">{lesson.mcq.prompt}</h2>
    <DiagnosticTip lesson={lesson} />
    <div className="diagnostic-choices">
      {lesson.mcq.choices.map((answer, i) => (
        <button key={answer} type="button" disabled={correct} aria-pressed={choice === i} onClick={() => setChoice(i)}>
          {answer}
        </button>
      ))}
    </div>
    {choice !== null && <div className="diagnostic-feedback" role="status">
      <p>{correct ? `You’ve got it! ${lesson.mcq.explanation}` : `Nearly! Look at the picture and try another answer. ${lesson.mcq.explanation}`}</p>
      {correct && (
        <div className="diagnostic-action-area diagnostic-action-area--feedback">
          <div className="et-start-callout" role="note">
            Ready to play it on your piano?
          </div>
          <button type="button" className="et-start" onClick={onNext}>
            <span className="et-start__dot"><RecordDot /></span>
            Try it on your piano
          </button>
        </div>
      )}
    </div>}
  </section>;
}

export default function DiagnosticLessonView({ definition, selectedKey, initialStage, onStandard }: {
  definition: DiagnosticDefinition; selectedKey: DiagnosticKey; initialStage: DiagnosticStage; onStandard: () => void;
}) {
  const lesson = useMemo(() => definition.create(selectedKey), [definition, selectedKey]);
  const [stage, setStage] = useState<DiagnosticStage>(initialStage), [done, setDone] = useState(false);
  return <ExerciseLayout lessonNumber={1} totalLessons={1} questionNumber={stage} questionsInLoop={4} lessonTitle={lesson.title} lessonFocus={lesson.focus} phaseLabel="Your practice prescription">
    <div className="diagnostic-flow" data-diagnostic={definition.id} data-stage={stage}>
      <p className="diagnostic-stage-label">{done ? 'Practice complete' : `Stage ${stage} of 4 · ${['Listen & judge', 'Discover the clue', 'Acoustic playthrough', 'Transfer drill'][stage - 1]}`}</p>
      {done ? <section className="diagnostic-card diagnostic-complete">
        <h2 className="diagnostic-prompt">You carried the clue into a new phrase!</h2>
        <p className="diagnostic-complete__p">You played both phrases successfully. Keep using this clue when you read your next piece.</p>
        <div className="diagnostic-action-area">
          <div className="et-start-callout" role="note">
            Ready to return to your lessons
          </div>
          <button type="button" className="et-start" onClick={onStandard}>
            <span className="et-start__dot"><RecordDot /></span>
            Return to standard curriculum
          </button>
        </div>
      </section> :
        stage === 1 ? <ListenAndJudge lesson={lesson} onNext={() => setStage(2)} /> :
        stage === 2 ? <ConceptQuestion lesson={lesson} onNext={() => setStage(3)} /> :
        <AcousticDrill key={stage} question={stage === 3 ? lesson.question : lesson.transfer} notation={stage === 3 ? lesson.notation : lesson.transferNotation} transfer={stage === 4} onPassed={() => { if (stage === 3) setStage(4); else setDone(true); }} />}
    </div>
  </ExerciseLayout>;
}
