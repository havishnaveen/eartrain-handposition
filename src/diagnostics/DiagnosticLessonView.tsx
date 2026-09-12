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
  const [subStage, setSubStage] = useState<'listening' | 'incorrectFeedback' | 'identifying' | 'correctFeedback'>('listening');
  const [retrying, setRetrying] = useState(false);
  const [playing, setPlaying] = useState(false), [heard, setHeard] = useState(false);
  const [error, setError] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const [highlightClef, setHighlightClef] = useState(false);
  const [showForced, setShowForced] = useState(false);
  const playback = useRef<ReturnType<typeof playDiagnosticExample> | null>(null), alive = useRef(true), locked = useRef(false);

  useEffect(() => { alive.current = true; return () => { alive.current = false; playback.current?.stop(); }; }, []);

  const featureCheck = lesson.featureCheck ?? {
    prompt: 'Which clef is this sheet music written in?',
    choices: ['Bass Clef', 'Treble Clef'],
    correct: 0,
    explanation: 'Check the clef symbol on the left of the staff.',
  };

  const play = async () => {
    if (locked.current) return;
    locked.current = true; setPlaying(true); setError('');
    const run = playDiagnosticExample(lesson.mistakePitches, lesson.hesitationBefore); playback.current = run;
    try { await run.done; if (alive.current) setHeard(true); }
    catch { if (alive.current) setError('The piano recording could not load. Check your connection and press Play again.'); }
    finally { locked.current = false; if (alive.current) setPlaying(false); }
  };

  const onPickWrong = () => {
    playback.current?.stop();
    setEnlarged(false); setHighlightClef(false);
    setSubStage('correctFeedback');
  };

  const onPickCorrect = () => {
    playback.current?.stop();
    if (retrying) {
      setEnlarged(true); setHighlightClef(true);
      setShowForced(true);
    } else {
      setSubStage('incorrectFeedback');
    }
  };

  const onPickFeatureChoice = (index: number) => {
    if (index === featureCheck.correct) {
      setSubStage('listening');
      setRetrying(true);
      setHeard(false);
      setPlaying(false);
      setEnlarged(false);
      setHighlightClef(false);
    } else {
      setEnlarged(true);
      setHighlightClef(true);
      setShowForced(true);
    }
  };

  return <section className="diagnostic-card" aria-label="Listen and judge">
    {retrying && subStage === 'listening' && (
      <span className="diagnostic-try-again-badge" aria-label="Try again attempt">
        Try Again
      </span>
    )}

    <DiagnosticScore question={lesson.question} notation={lesson.notation} enlarged={enlarged} highlightClef={highlightClef} />

    {subStage === 'listening' && (
      <>
        <div className="diagnostic-action-area">
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
          <h2 className="diagnostic-prompt">Did the piano match the notes?</h2>
          <div className="diagnostic-choices">
            <button
              type="button"
              disabled={!heard || playing || showForced}
              onClick={onPickCorrect}
            >
              Correct
            </button>
            <button
              type="button"
              disabled={!heard || playing || showForced}
              onClick={onPickWrong}
            >
              Wrong
            </button>
          </div>
        </div>
      </>
    )}

    {subStage === 'incorrectFeedback' && (
      <div className="diagnostic-brief-feedback diagnostic-brief-feedback--wrong" role="status">
        <span className="diagnostic-brief-badge diagnostic-brief-badge--wrong">Incorrect</span>
        <button
          type="button"
          className="et-start diagnostic-brief-btn"
          onClick={() => setSubStage('identifying')}
        >
          <span className="et-start__dot"><RecordDot /></span>
          Next question
        </button>
      </div>
    )}

    {subStage === 'identifying' && (
      <div className="diagnostic-prompt-section">
        <h2 className="diagnostic-prompt">{featureCheck.prompt}</h2>
        <div className="diagnostic-choices">
          {featureCheck.choices.map((choice, i) => (
            <button
              key={choice}
              type="button"
              onClick={() => onPickFeatureChoice(i)}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
    )}

    {subStage === 'correctFeedback' && (
      <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
        <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
        <p className="diagnostic-brief-text diagnostic-brief-text--correct">
          {lesson.correctFeedback ?? 'The piano played in the wrong clef!'}
        </p>
        <button
          type="button"
          className="et-start diagnostic-brief-btn"
          onClick={onNext}
        >
          <span className="et-start__dot"><RecordDot /></span>
          Discover the clue
        </button>
      </div>
    )}

    {showForced && (
      <div className="diagnostic-forced-overlay" role="alertdialog" aria-modal="true" aria-labelledby="forced-listen-title">
        <div className="diagnostic-forced-card">
          <h3 id="forced-listen-title" className="diagnostic-forced-title">Check the notation</h3>
          <p className="diagnostic-forced-body">
            The piano did not match the written notes above.
          </p>
          <button
            type="button"
            className="diagnostic-btn-primary diagnostic-forced-btn"
            onClick={() => {
              setShowForced(false);
              setEnlarged(false);
              setHighlightClef(false);
              setSubStage('listening');
              setRetrying(true);
              setHeard(false);
              setPlaying(false);
            }}
          >
            I understand
          </button>
        </div>
      </div>
    )}
  </section>;
}

function WrongClefListening({ lesson, onNext }: { lesson: DiagnosticLesson; onNext: () => void }) {
  const rounds = lesson.wrongClefRounds ?? [];
  const [roundIdx, setRoundIdx] = useState(0);
  const [subStage, setSubStage] = useState<'listening' | 'incorrectFeedback' | 'identifying' | 'correctFeedback'>('listening');
  const [retrying, setRetrying] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [error, setError] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const [highlightClef, setHighlightClef] = useState(false);
  const [showForced, setShowForced] = useState(false);
  const playback = useRef<ReturnType<typeof playDiagnosticExample> | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      playback.current?.stop();
    };
  }, []);

  const currentRound = rounds[roundIdx] ?? rounds[0];
  const featureCheck = currentRound?.featureCheck ?? lesson.featureCheck ?? {
    prompt: 'Which clef is this sheet music written in?',
    choices: ['Bass Clef', 'Treble Clef'],
    correct: 0,
    explanation: 'This phrase is written in bass clef.',
  };

  const play = async () => {
    if (locked.current || !currentRound) return;
    locked.current = true;
    setPlaying(true);
    setError('');
    const run = playDiagnosticExample(currentRound.wrongClefPitches);
    playback.current = run;
    try {
      await run.done;
      if (alive.current) setHeard(true);
    } catch {
      if (alive.current) setError('Piano audio could not load. Press play again.');
    } finally {
      locked.current = false;
      if (alive.current) setPlaying(false);
    }
  };

  const advanceRound = () => {
    playback.current?.stop();
    setEnlarged(false);
    setHighlightClef(false);
    setSubStage('listening');
    setRetrying(false);
    setHeard(false);
    setError('');
    if (roundIdx < rounds.length - 1) {
      setRoundIdx(r => r + 1);
    } else {
      onNext();
    }
  };

  // User clicked "Wrong" -> they caught the mistake (Right answer!)
  const onPickWrong = () => {
    playback.current?.stop();
    setEnlarged(false);
    setHighlightClef(false);
    setSubStage('correctFeedback');
  };

  // User clicked "Correct" -> they thought the piano matched (Wrong answer!)
  const onPickCorrect = () => {
    playback.current?.stop();
    if (retrying) {
      // Still got it wrong after clef check!
      setEnlarged(true);
      setHighlightClef(true);
      setShowForced(true);
    } else {
      // First mistake: show concise "Incorrect" feedback without explanation
      setSubStage('incorrectFeedback');
    }
  };

  // User selected clef in the identification question
  const onPickFeatureChoice = (index: number) => {
    if (index === featureCheck.correct) {
      // Correct clef identified -> return to first listening question with "Try Again" in top corner
      setSubStage('listening');
      setRetrying(true);
      setHeard(false);
      setPlaying(false);
      setEnlarged(false);
      setHighlightClef(false);
    } else {
      // Wrong clef chosen -> show forced acknowledgment notice
      setEnlarged(true);
      setHighlightClef(true);
      setShowForced(true);
    }
  };

  return (
    <section className="diagnostic-card" aria-label={`Question ${roundIdx + 1} of ${rounds.length}`}>
      {retrying && subStage === 'listening' && (
        <span className="diagnostic-try-again-badge" aria-label="Try again attempt">
          Try Again
        </span>
      )}

      <DiagnosticScore
        question={currentRound.question}
        notation={currentRound.notation}
        enlarged={enlarged}
        highlightClef={highlightClef}
      />

      {subStage === 'listening' && (
        <>
          <div className="diagnostic-action-area">
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
            <h2 className="diagnostic-prompt">Did the piano match the notes?</h2>
            <div className="diagnostic-choices">
              <button
                type="button"
                disabled={!heard || playing || showForced}
                onClick={onPickCorrect}
              >
                Correct
              </button>
              <button
                type="button"
                disabled={!heard || playing || showForced}
                onClick={onPickWrong}
              >
                Wrong
              </button>
            </div>
          </div>
        </>
      )}

      {subStage === 'incorrectFeedback' && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--wrong" role="status">
          <span className="diagnostic-brief-badge diagnostic-brief-badge--wrong">Incorrect</span>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={() => setSubStage('identifying')}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Next question
          </button>
        </div>
      )}

      {subStage === 'identifying' && (
        <div className="diagnostic-prompt-section">
          <h2 className="diagnostic-prompt">{featureCheck.prompt}</h2>
          <div className="diagnostic-choices">
            {featureCheck.choices.map((choice, i) => (
              <button
                key={choice}
                type="button"
                onClick={() => onPickFeatureChoice(i)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      )}

      {subStage === 'correctFeedback' && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
          <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
          <p className="diagnostic-brief-text diagnostic-brief-text--correct">
            {currentRound?.correctFeedback ?? lesson.correctFeedback ?? 'The piano played in the wrong clef!'}
          </p>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={advanceRound}
          >
            <span className="et-start__dot"><RecordDot /></span>
            {roundIdx < rounds.length - 1 ? 'Next question' : 'Continue'}
          </button>
        </div>
      )}

      {showForced && (
        <div className="diagnostic-forced-overlay" role="alertdialog" aria-modal="true" aria-labelledby="forced-listen-title">
          <div className="diagnostic-forced-card">
            <h3 id="forced-listen-title" className="diagnostic-forced-title">Check the clef</h3>
            <p className="diagnostic-forced-body">
              This phrase is written in bass clef, but the piano played in treble clef.
            </p>
            <button
              type="button"
              className="diagnostic-btn-primary diagnostic-forced-btn"
              onClick={() => {
                setShowForced(false);
                setEnlarged(false);
                setHighlightClef(false);
                setSubStage('listening');
                setRetrying(true);
                setHeard(false);
                setPlaying(false);
              }}
            >
              I understand
            </button>
          </div>
        </div>
      )}
    </section>
  );
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
  const isClefSwap = definition.id === 'clef-transposition' && Boolean(lesson.wrongClefRounds?.length);

  return <ExerciseLayout lessonNumber={1} totalLessons={1} questionNumber={stage} questionsInLoop={isClefSwap ? 3 : 4} lessonTitle={lesson.title} lessonFocus={lesson.focus} phaseLabel="Your practice prescription">
    <div className="diagnostic-flow" data-diagnostic={definition.id} data-stage={stage}>
      {done ? <section className="diagnostic-card diagnostic-complete">
        <h2 className="diagnostic-prompt">You carried the clue into a new phrase!</h2>
        <p className="diagnostic-complete__p">You read and played the phrase accurately in bass clef. Keep checking your clef when you practice!</p>
        <div className="diagnostic-action-area">
          <button type="button" className="et-start" onClick={onStandard}>
            <span className="et-start__dot"><RecordDot /></span>
            Return to standard curriculum
          </button>
        </div>
      </section> :
        stage === 1 ? (
          isClefSwap ? <WrongClefListening lesson={lesson} onNext={() => setStage(2)} /> : <ListenAndJudge lesson={lesson} onNext={() => setStage(2)} />
        ) :
        stage === 2 ? <ConceptQuestion lesson={lesson} onNext={() => setStage(3)} /> :
        isClefSwap ? (
          <AcousticDrill
            key="clef-swap-drill"
            question={lesson.question}
            notation={lesson.notation}
            transfer={false}
            skipProof={true}
            forcedErrorMessage={lesson.forcedErrorMessage}
            onPassed={() => setDone(true)}
          />
        ) : (
          <AcousticDrill key={stage} question={stage === 3 ? lesson.question : lesson.transfer} notation={stage === 3 ? lesson.notation : lesson.transferNotation} transfer={stage === 4} onPassed={() => { if (stage === 3) setStage(4); else setDone(true); }} />
        )}
    </div>
  </ExerciseLayout>;
}
