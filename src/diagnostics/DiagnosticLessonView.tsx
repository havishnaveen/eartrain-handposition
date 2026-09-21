import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseLayout from '../components/ExerciseLayout';
import AcousticDrill from './AcousticDrill';
import { DiagnosticScore } from './DiagnosticScore';
import DiagnosticTip from './DiagnosticTip';
import { StaffChoiceDiagram } from './StaffVisualGuide';
import { playDiagnosticExample } from './playback';
import { prepareProfessorNotification } from './professorNotifications';
import type { DiagnosticDefinition, DiagnosticKey, DiagnosticLesson, DiagnosticStage } from './registry';

const RecordDot = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <circle cx="12" cy="12" r="7" fill="currentColor" />
  </svg>
);

const MorphingCheckmark = () => (
  <svg className="diagnostic-morph-check" viewBox="0 0 52 52" aria-hidden="true">
    <circle className="diagnostic-morph-check__circle" cx="26" cy="26" r="25" />
    <path className="diagnostic-morph-check__path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
  </svg>
);

function sendFailureReport(params: { lessonTitle: string; stageName: string; detail: string; conceptId: string }) {
  if (typeof window === 'undefined') return;
  try {
    const diagnostic = [
      `EarTrain issue — ${params.lessonTitle}`,
      `Stage: ${params.stageName}`,
      `Concept: ${params.conceptId}`,
      `Detail: ${params.detail}`,
      `Page: ${window.location.href}`,
      `Viewport: ${window.innerWidth}×${window.innerHeight}`,
      `Browser: ${window.navigator.userAgent}`,
    ].join('\n');
    fetch('/api/report-problem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: `Struggle report: student failed question after reviewing clue on ${params.lessonTitle} (${params.detail})`,
        diagnostic,
      }),
    }).catch(() => {});
  } catch {}
}

const AudioCluesPlayer = ({ clues }: { clues?: readonly { label: string; pitches: readonly string[]; tag?: string }[] }) => {
  if (!clues || clues.length === 0) return null;
  return (
    <div className="diagnostic-audio-clues">
      <div className="diagnostic-audio-clue-title">Listen & Compare Pitch:</div>
      {clues.map((clue, idx) => (
        <button
          key={idx}
          type="button"
          className="diagnostic-audio-clue-btn"
          onClick={() => playDiagnosticExample(clue.pitches)}
        >
          <span>🔊 {clue.label}</span>
          {clue.tag && <span className="diagnostic-audio-clue-tag">{clue.tag}</span>}
        </button>
      ))}
    </div>
  );
};

function ListenAndJudge({ lesson, onNext }: { lesson: DiagnosticLesson; onNext: () => void }) {
  const [subStage, setSubStage] = useState<'listening' | 'incorrectFeedback' | 'identifying' | 'identifyingCorrect' | 'correctFeedback' | 'professorNotified'>('listening');
  const [retrying, setRetrying] = useState(false);
  const [playing, setPlaying] = useState(false), [heard, setHeard] = useState(false);
  const [error, setError] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const [highlightClef, setHighlightClef] = useState(false);
  const [showForced, setShowForced] = useState(false);
  const playback = useRef<ReturnType<typeof playDiagnosticExample> | null>(null), alive = useRef(true), locked = useRef(false);

  useEffect(() => { alive.current = true; return () => { alive.current = false; playback.current?.stop(); }; }, []);

  const isClefLesson = Boolean(lesson.question.conceptId.includes('clef'));
  const isOctaveLesson = Boolean(lesson.question.conceptId.includes('octave'));

  const featureCheck = lesson.featureCheck ?? {
    prompt: isClefLesson ? 'Which clef is this sheet music written in?' : isOctaveLesson ? 'Where does Note 1 sit on the staff?' : 'Check the sheet music notes',
    choices: isClefLesson ? ['Bass Clef', 'Treble Clef'] : ['Option 1', 'Option 2'],
    correct: 0,
    explanation: lesson.explanation ?? 'Check the sheet music notation.',
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
      prepareProfessorNotification({
        diagnosticId: lesson.question.conceptId,
        lessonTitle: lesson.title,
        stage: 1,
        questionPrompt: 'Did the piano match the notes?',
        attemptsCount: 2,
        details: 'ListenAndJudge: Student failed retry on starter question despite guided clue.',
      });
      sendFailureReport({
        lessonTitle: lesson.title,
        stageName: 'Stage 1: Starter Question',
        conceptId: lesson.question.conceptId,
        detail: 'Student failed retry on starter question despite guided clue.',
      });
      setSubStage('professorNotified');
    } else {
      setSubStage('incorrectFeedback');
    }
  };

  const onPickFeatureChoice = (index: number) => {
    if (index === featureCheck.correct) {
      setSubStage('identifyingCorrect');
    } else {
      setEnlarged(true);
      setHighlightClef(isClefLesson);
      setShowForced(true);
    }
  };

  return <section className="diagnostic-card" aria-label="Listen and judge">
    {retrying && subStage === 'listening' && (
      <span className="diagnostic-try-again-badge" aria-label="Try again attempt">
        Try Again
      </span>
    )}

    <DiagnosticScore
      question={lesson.question}
      notation={lesson.notation}
      enlarged={enlarged}
      highlightClef={highlightClef && isClefLesson}
      highlightNoteIndex={subStage === 'identifying' ? featureCheck.highlightNoteIndex : undefined}
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
          Check clue
        </button>
      </div>
    )}

    {subStage === 'identifying' && (
      <div className="diagnostic-prompt-section">
        <h2 className="diagnostic-prompt">{featureCheck.prompt}</h2>
        <AudioCluesPlayer clues={featureCheck.audioClues} />
        <div className={`diagnostic-choices ${featureCheck.choiceVisuals?.length ? 'diagnostic-choices--with-visuals' : ''}`}>
          {featureCheck.choices.map((choice, i) => {
            const visual = featureCheck.choiceVisuals?.[i];
            return (
              <button
                key={choice}
                type="button"
                className={visual ? 'diagnostic-choice-card-with-visual' : ''}
                onClick={() => onPickFeatureChoice(i)}
              >
                {visual && <StaffChoiceDiagram visual={visual} />}
                <span className="diagnostic-choice-label">{choice}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}

    {subStage === 'identifyingCorrect' && (
      <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
        <div className="diagnostic-morph-box">
          <MorphingCheckmark />
          <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
          <p className="diagnostic-brief-text diagnostic-brief-text--correct">
            {featureCheck.explanation}
          </p>
        </div>
        <button
          type="button"
          className="et-start diagnostic-brief-btn"
          onClick={() => {
            setSubStage('listening');
            setRetrying(true);
            setHeard(false);
            setPlaying(false);
            setEnlarged(false);
            setHighlightClef(false);
          }}
        >
          <span className="et-start__dot"><RecordDot /></span>
          Try question again
        </button>
      </div>
    )}

    {subStage === 'correctFeedback' && (
      <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
        <div className="diagnostic-morph-box">
          <MorphingCheckmark />
          <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
          <p className="diagnostic-brief-text diagnostic-brief-text--correct">
            {lesson.correctFeedback ?? 'The piano played in the wrong clef!'}
          </p>
        </div>
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

    {subStage === 'professorNotified' && (
      <div className="diagnostic-brief-feedback" role="status">
        <p className="diagnostic-brief-text">
          Let's keep going to the next question!
        </p>
        <button
          type="button"
          className="et-start diagnostic-brief-btn"
          onClick={onNext}
        >
          <span className="et-start__dot"><RecordDot /></span>
          Next question
        </button>
      </div>
    )}

    {showForced && (
      <div className="diagnostic-forced-overlay" role="alertdialog" aria-modal="true" aria-labelledby="forced-listen-title">
        <div className="diagnostic-forced-card">
          <h3 id="forced-listen-title" className="diagnostic-forced-title">
            {isClefLesson ? 'Check the clef' : isOctaveLesson ? 'Check the octave' : 'Check the notation'}
          </h3>
          <p className="diagnostic-forced-body">
            {featureCheck.explanation ?? lesson.explanation ?? 'The piano did not match the written notes above.'}
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
  const rounds = lesson.listenRounds ?? lesson.wrongClefRounds ?? [];
  const [roundIdx, setRoundIdx] = useState(0);
  const [subStage, setSubStage] = useState<
    | 'listening'
    | 'incorrectFeedback'
    | 'identifying'
    | 'identifyingFollowUp'
    | 'followUpFeedback'
    | 'identifyingCorrect'
    | 'correctFeedback'
    | 'professorNotified'
  >('listening');
  const [featureHint, setFeatureHint] = useState<string | null>(null);
  const [followUpCorrect, setFollowUpCorrect] = useState(false);
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

  const isClefLesson = Boolean(lesson.question.conceptId.includes('clef'));
  const isOctaveLesson = Boolean(lesson.question.conceptId.includes('octave'));

  const currentRound = rounds[roundIdx] ?? rounds[0];
  const featureCheck = currentRound?.featureCheck ?? lesson.featureCheck ?? {
    prompt: isClefLesson
      ? 'Which clef is this sheet music written in?'
      : isOctaveLesson
        ? 'Where does Note 1 sit on the staff?'
        : 'Check the notation',
    choices: isClefLesson ? ['Bass Clef', 'Treble Clef'] : ['Option 1', 'Option 2'],
    correct: 0,
    explanation: currentRound?.explanation ?? lesson.explanation ?? 'Check the sheet music notes.',
  };

  const play = async () => {
    if (locked.current || !currentRound) return;
    locked.current = true;
    setPlaying(true);
    setError('');
    const run = playDiagnosticExample(currentRound.wrongClefPitches, undefined, currentRound.question.cue.staves[0].notes.map(note => note.duration));
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
    setFeatureHint(null);
    setFollowUpCorrect(false);
    if (roundIdx < rounds.length - 1) {
      setRoundIdx(r => r + 1);
    } else {
      onNext();
    }
  };

  const isMatch = Boolean(currentRound?.isMatch);

  // User clicked "Wrong"
  const onPickWrong = () => {
    playback.current?.stop();
    if (!isMatch) {
      setEnlarged(false);
      setHighlightClef(false);
      setSubStage('correctFeedback');
    } else {
      if (retrying) {
        prepareProfessorNotification({
          diagnosticId: lesson.question.conceptId,
          lessonTitle: lesson.title,
          stage: 1,
          questionIndex: roundIdx,
          questionPrompt: 'Did the piano match the notes?',
          attemptsCount: 2,
          details: `Round ${roundIdx + 1}: Student answered "Wrong" when the piano matched, despite guided instruction.`,
        });
        sendFailureReport({
          lessonTitle: lesson.title,
          stageName: `Stage 3: Round ${roundIdx + 1}`,
          conceptId: lesson.question.conceptId,
          detail: `Failed retry after clue: answered "Wrong" when piano matched.`,
        });
        setSubStage('professorNotified');
      } else {
        setSubStage('incorrectFeedback');
      }
    }
  };

  // User clicked "Correct"
  const onPickCorrect = () => {
    playback.current?.stop();
    if (isMatch) {
      setEnlarged(false);
      setHighlightClef(false);
      setSubStage('correctFeedback');
    } else {
      if (retrying) {
        prepareProfessorNotification({
          diagnosticId: lesson.question.conceptId,
          lessonTitle: lesson.title,
          stage: 1,
          questionIndex: roundIdx,
          questionPrompt: 'Did the piano match the notes?',
          attemptsCount: 2,
          details: `Round ${roundIdx + 1}: Student answered "Correct" when mismatched, despite guided instruction.`,
        });
        sendFailureReport({
          lessonTitle: lesson.title,
          stageName: `Stage 3: Round ${roundIdx + 1}`,
          conceptId: lesson.question.conceptId,
          detail: `Failed retry after clue: answered "Correct" when mismatched.`,
        });
        setSubStage('professorNotified');
      } else {
        setSubStage('incorrectFeedback');
      }
    }
  };

  const onPickFeatureChoice = (index: number) => {
    if (index === featureCheck.correct) {
      setFeatureHint(null);
      if (isOctaveLesson) {
        setSubStage('identifyingFollowUp');
      } else {
        setSubStage('identifyingCorrect');
      }
    } else {
      setFeatureHint(
        isOctaveLesson
          ? 'Note 1 sits in the 3rd space of the staff (High C, 5th octave).'
          : (featureCheck.explanation ?? 'Check the notes on the sheet music.')
      );
    }
  };

  const onPickFollowUp = (choiceIndex: number) => {
    // 0 = "Correct register", 1 = "Wrong register"
    const correctIndex = isMatch ? 0 : 1;
    const isCorrect = choiceIndex === correctIndex;
    setFollowUpCorrect(isCorrect);
    setSubStage('followUpFeedback');
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
        highlightClef={highlightClef && isClefLesson}
        highlightNoteIndex={subStage === 'identifying' || showForced ? (featureCheck.highlightNoteIndex ?? currentRound.highlightNoteIndex) : undefined}
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
            Check clue
          </button>
        </div>
      )}

      {subStage === 'identifying' && (
        <div className="diagnostic-prompt-section">
          <h2 className="diagnostic-prompt">{featureCheck.prompt}</h2>
          <AudioCluesPlayer clues={featureCheck.audioClues} />
          <div className={`diagnostic-choices ${featureCheck.choiceVisuals?.length ? 'diagnostic-choices--with-visuals' : ''}`}>
            {featureCheck.choices.map((choice, i) => {
              const visual = featureCheck.choiceVisuals?.[i];
              return (
                <button
                  key={choice}
                  type="button"
                  className={visual ? 'diagnostic-choice-card-with-visual' : ''}
                  onClick={() => onPickFeatureChoice(i)}
                >
                  {visual && <StaffChoiceDiagram visual={visual} />}
                  <span className="diagnostic-choice-label">{choice}</span>
                </button>
              );
            })}
          </div>
          {featureHint && (
            <p className="diagnostic-inline-hint" role="status">
              {featureHint}
            </p>
          )}
        </div>
      )}

      {subStage === 'identifyingFollowUp' && (
        <div className="diagnostic-prompt-section">
          <div className="diagnostic-step-pill">Step 2 of 2 · Register Check</div>
          <p className="diagnostic-context-note">Note 1 is High C (5th octave).</p>
          <h2 className="diagnostic-prompt">Does the example play the music in the right register?</h2>
          <div className="diagnostic-action-area" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className="et-start diagnostic-brief-btn"
              disabled={playing}
              onClick={() => { void play(); }}
            >
              <span className="et-start__dot"><RecordDot /></span>
              {playing ? 'Playing…' : '🔊 Replay piano example'}
            </button>
          </div>
          <div className="diagnostic-choices">
            <button
              type="button"
              onClick={() => onPickFollowUp(0)}
            >
              Correct register
            </button>
            <button
              type="button"
              onClick={() => onPickFollowUp(1)}
            >
              Wrong register
            </button>
          </div>
        </div>
      )}

      {subStage === 'followUpFeedback' && (
        <div className={`diagnostic-brief-feedback ${followUpCorrect ? 'diagnostic-brief-feedback--correct' : 'diagnostic-brief-feedback--wrong'}`} role="status">
          <div className="diagnostic-morph-box">
            {followUpCorrect ? (
              <>
                <MorphingCheckmark />
                <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
              </>
            ) : (
              <span className="diagnostic-brief-badge diagnostic-brief-badge--wrong">Incorrect</span>
            )}
            <p className={`diagnostic-brief-text ${followUpCorrect ? 'diagnostic-brief-text--correct' : 'diagnostic-brief-text--wrong'}`}>
              {followUpCorrect
                ? (isMatch
                    ? 'The piano played in the high register (5th octave), matching the sheet music.'
                    : 'The music is written in High C (5th octave), but the piano played in the wrong register (at Middle C).')
                : (isMatch
                    ? 'The piano played in the correct register — matching the 5th octave.'
                    : 'The piano played in the wrong register — it played down at Middle C instead of High C.')}
            </p>
          </div>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={() => {
              setSubStage('listening');
              setRetrying(true);
              setHeard(false);
              setPlaying(false);
              setEnlarged(false);
              setHighlightClef(false);
            }}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Try question again
          </button>
        </div>
      )}

      {subStage === 'identifyingCorrect' && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
          <div className="diagnostic-morph-box">
            <MorphingCheckmark />
            <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
            <p className="diagnostic-brief-text diagnostic-brief-text--correct">
              {featureCheck.explanation}
            </p>
          </div>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={() => {
              setSubStage('listening');
              setRetrying(true);
              setHeard(false);
              setPlaying(false);
              setEnlarged(false);
              setHighlightClef(false);
            }}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Try question again
          </button>
        </div>
      )}

      {subStage === 'correctFeedback' && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
          <div className="diagnostic-morph-box">
            <MorphingCheckmark />
            <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
            <p className="diagnostic-brief-text diagnostic-brief-text--correct">
              {currentRound?.correctFeedback ?? lesson.correctFeedback ?? (isClefLesson ? 'The piano played in the wrong clef!' : isOctaveLesson ? 'The piano played in the wrong octave!' : 'The piano matched the notes!')}
            </p>
          </div>
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

      {subStage === 'professorNotified' && (
        <div className="diagnostic-brief-feedback" role="status">
          <p className="diagnostic-brief-text">
            Let's keep going to the next question!
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
            <h3 id="forced-listen-title" className="diagnostic-forced-title">
              {isClefLesson ? 'Check the clef' : isOctaveLesson ? 'Check the octave' : 'Check the notation'}
            </h3>
            <p className="diagnostic-forced-body">
              {isClefLesson
                ? (isMatch
                    ? 'This phrase is written in treble clef, and the piano matched the notes.'
                    : currentRound.notation.clef === 'bass'
                      ? 'This phrase is written in bass clef, but the piano played in treble clef.'
                      : 'This phrase is written in treble clef, but the piano played in bass clef.')
                : isOctaveLesson
                  ? 'Note 1 sits in the 3rd space of the treble staff (High C / 5th octave).'
                  : (featureCheck.explanation ?? currentRound.explanation ?? lesson.explanation)}
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

function DiagnosticInteractiveFlow({ lesson, onNext }: { lesson: DiagnosticLesson; onNext: () => void }) {
  const rounds = lesson.interactiveRounds ?? [];
  const [roundIdx, setRoundIdx] = useState(0);
  const [subStage, setSubStage] = useState<'prompting' | 'incorrectFeedback' | 'identifying' | 'identifyingFollowUp' | 'followUpFeedback' | 'identifyingCorrect' | 'correctFeedback' | 'professorNotified'>('prompting');
  const [retrying, setRetrying] = useState(false);
  const [playingA, setPlayingA] = useState(false);
  const [playingB, setPlayingB] = useState(false);
  const [heardA, setHeardA] = useState(false);
  const [heardB, setHeardB] = useState(false);
  const [error, setError] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const [highlightCue, setHighlightCue] = useState(false);
  const [showForced, setShowForced] = useState(false);
  const [featureHint, setFeatureHint] = useState('');
  const [followUpHint, setFollowUpHint] = useState('');
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
  const hasAudio = Boolean(currentRound?.audioClipA && currentRound?.audioClipB);
  const featureCheck = currentRound?.featureCheck ?? lesson.featureCheck;
  const isAccidentalLesson = Boolean(lesson.question.conceptId.includes('accidental'));

  const playAudioClip = async (which: 'A' | 'B') => {
    if (locked.current || !currentRound) return;
    locked.current = true;
    playback.current?.stop();
    const clip = which === 'A' ? currentRound.audioClipA : currentRound.audioClipB;
    if (!clip) { locked.current = false; return; }
    if (which === 'A') setPlayingA(true); else setPlayingB(true);
    setError('');
    const run = playDiagnosticExample(clip.pitches, clip.hesitationBefore);
    playback.current = run;
    try {
      await run.done;
      if (alive.current) {
        if (which === 'A') setHeardA(true); else setHeardB(true);
      }
    } catch {
      if (alive.current) setError('Piano audio could not load. Press play again.');
    } finally {
      locked.current = false;
      if (alive.current) {
        if (which === 'A') setPlayingA(false); else setPlayingB(false);
      }
    }
  };

  const advanceRound = () => {
    playback.current?.stop();
    setEnlarged(false);
    setHighlightCue(false);
    setSubStage('prompting');
    setRetrying(false);
    setHeardA(false);
    setHeardB(false);
    setError('');
    setFeatureHint('');
    setFollowUpHint('');
    if (roundIdx < rounds.length - 1) {
      setRoundIdx(r => r + 1);
    } else {
      onNext();
    }
  };

  const onPickChoice = (index: number) => {
    playback.current?.stop();
    setFeatureHint('');
    setFollowUpHint('');
    if (index === currentRound.correct) {
      setEnlarged(false);
      setHighlightCue(false);
      setSubStage('correctFeedback');
    } else {
      if (retrying) {
        prepareProfessorNotification({
          diagnosticId: lesson.question.conceptId,
          lessonTitle: lesson.title,
          stage: 1,
          questionIndex: roundIdx,
          questionPrompt: currentRound.prompt,
          attemptsCount: 2,
          details: `Round ${roundIdx + 1} (${currentRound.title}): Learner selected "${currentRound.choices[index]}" on retry after guided review.`,
        });
        sendFailureReport({
          lessonTitle: lesson.title,
          stageName: `Stage 3: Round ${roundIdx + 1} (${currentRound.title})`,
          conceptId: lesson.question.conceptId,
          detail: `Learner selected "${currentRound.choices[index]}" on retry after guided clue.`,
        });
        setSubStage('professorNotified');
      } else {
        setSubStage('incorrectFeedback');
      }
    }
  };

  const onPickFeatureChoice = (index: number) => {
    if (featureCheck && index === featureCheck.correct) {
      setFeatureHint('');
      if (featureCheck.followUpCheck) {
        setSubStage('identifyingFollowUp');
      } else {
        setSubStage('identifyingCorrect');
      }
    } else {
      setFeatureHint(
        isAccidentalLesson
          ? 'Note 3 is before the barline — it is still inside Measure 1.'
          : (featureCheck?.explanation ?? 'Look closely at the notation.')
      );
    }
  };

  const onPickFollowUpChoice = (index: number) => {
    const followUp = featureCheck?.followUpCheck;
    if (!followUp) return;
    if (index === followUp.correct) {
      setFollowUpHint('');
      setSubStage('followUpFeedback');
    } else {
      setFollowUpHint(
        isAccidentalLesson
          ? 'A sharp doesn’t stop after one note — it carries through the full measure until the barline.'
          : (followUp.explanation ?? 'Check the rule.')
      );
    }
  };

  return (
    <section className="diagnostic-card" aria-label={`Question ${roundIdx + 1} of ${rounds.length}`}>


      {retrying && subStage === 'prompting' && (
        <span className="diagnostic-try-again-badge" aria-label="Try again attempt">
          Try Again
        </span>
      )}

      <DiagnosticScore
        question={lesson.question}
        notation={lesson.notation}
        enlarged={enlarged}
        highlightClef={highlightCue && Boolean(currentRound?.highlightClef)}
        highlightClefChange={Boolean(currentRound?.highlightClefChange)}
        highlight8va={Boolean(currentRound?.highlight8va)}
        highlightNoteIndex={
          subStage === 'identifying' || subStage === 'identifyingFollowUp'
            ? (featureCheck?.highlightNoteIndex ?? currentRound?.highlightNoteIndex)
            : currentRound?.highlightNoteIndex
        }
      />

      {hasAudio && (
        <div className="diagnostic-ab-row" aria-label="Audio clips comparison">
          <div className={`diagnostic-ab-card ${playingA ? 'is-playing' : ''}`}>
            <div className="diagnostic-ab-header">
              <span className="diagnostic-ab-tag">Option A</span>
              <span className="diagnostic-ab-label">{currentRound.audioClipA!.label}</span>
            </div>
            <button
              type="button"
              className="diagnostic-ab-btn"
              disabled={playingA || playingB}
              onClick={() => { void playAudioClip('A'); }}
            >
              <span className="et-start__dot"><RecordDot /></span>
              <span>{playingA ? 'Playing…' : heardA ? 'Replay Clip A' : `Play ${currentRound.audioClipA!.label}`}</span>
            </button>
          </div>

          <div className={`diagnostic-ab-card ${playingB ? 'is-playing' : ''}`}>
            <div className="diagnostic-ab-header">
              <span className="diagnostic-ab-tag">Option B</span>
              <span className="diagnostic-ab-label">{currentRound.audioClipB!.label}</span>
            </div>
            <button
              type="button"
              className="diagnostic-ab-btn"
              disabled={playingA || playingB}
              onClick={() => { void playAudioClip('B'); }}
            >
              <span className="et-start__dot"><RecordDot /></span>
              <span>{playingB ? 'Playing…' : heardB ? 'Replay Clip B' : `Play ${currentRound.audioClipB!.label}`}</span>
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="diagnostic-error">{error}</p>}

      {subStage === 'prompting' && (
        <div className="diagnostic-prompt-section">
          <h2 className="diagnostic-prompt">{currentRound.prompt}</h2>
          <div className="diagnostic-choices">
            {currentRound.choices.map((choice, i) => (
              <button
                key={choice}
                type="button"
                disabled={playingA || playingB || showForced}
                onClick={() => onPickChoice(i)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      )}

      {subStage === 'incorrectFeedback' && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--wrong" role="status">
          <span className="diagnostic-brief-badge diagnostic-brief-badge--wrong">Incorrect</span>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={() => {
              setSubStage('identifying');
              setFeatureHint('');
              setFollowUpHint('');
            }}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Check clue
          </button>
        </div>
      )}

      {subStage === 'identifying' && featureCheck && (
        <div className="diagnostic-prompt-section">
          {featureCheck.followUpCheck && (
            <div className="diagnostic-step-pill">Step 1 of 2 · Measure Check</div>
          )}
          <h2 className="diagnostic-prompt">{featureCheck.prompt}</h2>
          <AudioCluesPlayer clues={featureCheck.audioClues} />
          <div className={`diagnostic-choices ${featureCheck.choiceVisuals?.length ? 'diagnostic-choices--with-visuals' : ''}`}>
            {featureCheck.choices.map((choice, i) => {
              const visual = featureCheck.choiceVisuals?.[i];
              return (
                <button
                  key={choice}
                  type="button"
                  className={visual ? 'diagnostic-choice-card-with-visual' : ''}
                  onClick={() => onPickFeatureChoice(i)}
                >
                  {visual && <StaffChoiceDiagram visual={visual} />}
                  <span className="diagnostic-choice-label">{choice}</span>
                </button>
              );
            })}
          </div>
          {featureHint && (
            <p className="diagnostic-inline-hint" role="status">
              {featureHint}
            </p>
          )}
        </div>
      )}

      {subStage === 'identifyingFollowUp' && featureCheck?.followUpCheck && (
        <div className="diagnostic-prompt-section">
          <div className="diagnostic-step-pill">Step 2 of 2 · Accidental Rule</div>
          <p className="diagnostic-context-note">Note 3 is in Measure 1 with the C#.</p>
          <h2 className="diagnostic-prompt">{featureCheck.followUpCheck.prompt}</h2>
          <div className="diagnostic-choices">
            {featureCheck.followUpCheck.choices.map((choice, i) => (
              <button
                key={choice}
                type="button"
                onClick={() => onPickFollowUpChoice(i)}
              >
                {choice}
              </button>
            ))}
          </div>
          {followUpHint && (
            <p className="diagnostic-inline-hint" role="status">
              {followUpHint}
            </p>
          )}
        </div>
      )}

      {subStage === 'followUpFeedback' && featureCheck?.followUpCheck && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
          <div className="diagnostic-morph-box">
            <MorphingCheckmark />
            <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
            <p className="diagnostic-brief-text diagnostic-brief-text--correct">
              {featureCheck.followUpCheck.explanation}
            </p>
          </div>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={() => {
              setSubStage('prompting');
              setRetrying(true);
              setHeardA(false);
              setHeardB(false);
              setPlayingA(false);
              setPlayingB(false);
              setEnlarged(false);
              setHighlightCue(false);
              setFeatureHint('');
              setFollowUpHint('');
            }}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Try question again
          </button>
        </div>
      )}

      {subStage === 'identifyingCorrect' && featureCheck && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
          <div className="diagnostic-morph-box">
            <MorphingCheckmark />
            <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
            <p className="diagnostic-brief-text diagnostic-brief-text--correct">
              {featureCheck.explanation}
            </p>
          </div>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={() => {
              setSubStage('prompting');
              setRetrying(true);
              setHeardA(false);
              setHeardB(false);
              setPlayingA(false);
              setPlayingB(false);
              setEnlarged(false);
              setHighlightCue(false);
              setFeatureHint('');
              setFollowUpHint('');
            }}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Try question again
          </button>
        </div>
      )}

      {subStage === 'correctFeedback' && (
        <div className="diagnostic-brief-feedback diagnostic-brief-feedback--correct" role="status">
          <div className="diagnostic-morph-box">
            <MorphingCheckmark />
            <span className="diagnostic-brief-badge diagnostic-brief-badge--correct">Correct!</span>
            <p className="diagnostic-brief-text diagnostic-brief-text--correct">
              {currentRound.explanation}
            </p>
          </div>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={advanceRound}
          >
            <span className="et-start__dot"><RecordDot /></span>
            {roundIdx < rounds.length - 1 ? 'Next question' : 'Continue to piano'}
          </button>
        </div>
      )}

      {subStage === 'professorNotified' && (
        <div className="diagnostic-brief-feedback" role="status">
          <p className="diagnostic-brief-text">
            Let's keep going to the next question!
          </p>
          <button
            type="button"
            className="et-start diagnostic-brief-btn"
            onClick={advanceRound}
          >
            <span className="et-start__dot"><RecordDot /></span>
            {roundIdx < rounds.length - 1 ? 'Next question' : 'Continue to piano'}
          </button>
        </div>
      )}

      {showForced && (
        <div className="diagnostic-forced-overlay" role="alertdialog" aria-modal="true" aria-labelledby="forced-listen-title">
          <div className="diagnostic-forced-card">
            <h3 id="forced-listen-title" className="diagnostic-forced-title">Check the notation</h3>
            <p className="diagnostic-forced-body">
              {featureCheck?.explanation ?? currentRound.explanation}
            </p>
            <button
              type="button"
              className="diagnostic-btn-primary diagnostic-forced-btn"
              onClick={() => {
                setShowForced(false);
                setEnlarged(false);
                setHighlightCue(false);
                setSubStage('prompting');
                setRetrying(true);
                setHeardA(false);
                setHeardB(false);
                setPlayingA(false);
                setPlayingB(false);
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
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [professorNotified, setProfessorNotified] = useState(false);
  const correct = choice === lesson.mcq.correct;

  const onSelectChoice = (i: number) => {
    setChoice(i);
    if (i !== lesson.mcq.correct) {
      const nextCount = wrongAttempts + 1;
      setWrongAttempts(nextCount);
      if (nextCount >= 2) {
        prepareProfessorNotification({
          diagnosticId: lesson.question.conceptId,
          lessonTitle: lesson.title,
          stage: 2,
          questionPrompt: lesson.mcq.prompt,
          attemptsCount: nextCount,
          details: `Stage 2 Concept MCQ: Student failed 2 attempts, selecting "${lesson.mcq.choices[i]}" instead of "${lesson.mcq.choices[lesson.mcq.correct]}".`,
        });
        sendFailureReport({
          lessonTitle: lesson.title,
          stageName: 'Stage 2: Concept Question',
          conceptId: lesson.question.conceptId,
          detail: `Failed after clue on: "${lesson.mcq.prompt}". Selected "${lesson.mcq.choices[i]}".`,
        });
        setProfessorNotified(true);
      }
    }
  };

  return <section className="diagnostic-card" aria-label="Discover the clue">
    <h2 className="diagnostic-prompt">{lesson.mcq.prompt}</h2>
    <DiagnosticTip lesson={lesson} />
    <div className="diagnostic-choices">
      {lesson.mcq.choices.map((answer, i) => (
        <button key={answer} type="button" disabled={correct || professorNotified} aria-pressed={choice === i} onClick={() => onSelectChoice(i)}>
          {answer}
        </button>
      ))}
    </div>
    {professorNotified ? (
      <div className="diagnostic-brief-feedback" role="status">
        <p className="diagnostic-brief-text">
          Let's continue to the piano exercise!
        </p>
        <button type="button" className="et-start diagnostic-brief-btn" onClick={onNext}>
          <span className="et-start__dot"><RecordDot /></span>
          Continue to piano
        </button>
      </div>
    ) : choice !== null && <div className={`diagnostic-feedback ${correct ? 'diagnostic-feedback--correct' : ''}`} role="status">
      {correct ? (
        <div className="diagnostic-morph-box">
          <MorphingCheckmark />
          <p><strong>Correct!</strong> {lesson.mcq.explanation}</p>
        </div>
      ) : (
        <div>
          <p>Try another answer.</p>
          {lesson.tip && <p className="diagnostic-feedback__sub"><strong>Clue:</strong> {lesson.tip.text}</p>}
        </div>
      )}
      {correct && (
        <div className="diagnostic-action-area diagnostic-action-area--feedback">
          <button type="button" className="et-start" onClick={onNext}>
            <span className="et-start__dot"><RecordDot /></span>
            Continue to piano
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
  const hasListenRounds = Boolean(lesson.listenRounds?.length || lesson.wrongClefRounds?.length);
  const hasInteractiveRounds = Boolean(lesson.interactiveRounds?.length);

  return <ExerciseLayout lessonNumber={1} totalLessons={1} questionNumber={stage} questionsInLoop={isClefSwap ? 3 : 4} lessonTitle={lesson.title} lessonFocus={lesson.focus} phaseLabel="Your practice prescription">
    <div className="diagnostic-flow" data-diagnostic={definition.id} data-stage={stage}>
      {done ? <section className="diagnostic-card diagnostic-complete">
        <h2 className="diagnostic-prompt">You carried the clue into a new phrase!</h2>
        <p className="diagnostic-complete__p">You read and played the phrase accurately. Keep checking your notes when you practice!</p>
        <div className="diagnostic-action-area">
          <button type="button" className="et-start" onClick={onStandard}>
            <span className="et-start__dot"><RecordDot /></span>
            Return to standard curriculum
          </button>
        </div>
      </section> :
        stage === 1 ? (
          hasListenRounds ? (
            <WrongClefListening lesson={lesson} onNext={() => setStage(2)} />
          ) : hasInteractiveRounds ? (
            <DiagnosticInteractiveFlow lesson={lesson} onNext={() => setStage(2)} />
          ) : (
            <ListenAndJudge lesson={lesson} onNext={() => setStage(2)} />
          )
        ) :
        stage === 2 ? <ConceptQuestion lesson={lesson} onNext={() => setStage(3)} /> :
        isClefSwap ? (
          <AcousticDrill
            key="clef-swap-drill"
            diagnosticId={definition.id}
            question={lesson.question}
            notation={lesson.notation}
            transfer={false}
            skipProof={true}
            forcedErrorMessage={lesson.forcedErrorMessage}
            mistakePitches={lesson.mistakePitches}
            onPassed={() => setDone(true)}
          />
        ) : (
          <AcousticDrill
            key={stage}
            diagnosticId={definition.id}
            question={stage === 3 ? lesson.question : lesson.transfer}
            notation={stage === 3 ? lesson.notation : lesson.transferNotation}
            transfer={stage === 4}
            skipProof={definition.id === 'octave-displacement'}
            forcedErrorMessage={lesson.forcedErrorMessage}
            mistakePitches={lesson.mistakePitches}
            onPassed={() => { if (stage === 3) setStage(4); else setDone(true); }}
          />
        )}
    </div>
  </ExerciseLayout>;
}
