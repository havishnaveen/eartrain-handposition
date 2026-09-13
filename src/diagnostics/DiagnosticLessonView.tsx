import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseLayout from '../components/ExerciseLayout';
import AcousticDrill from './AcousticDrill';
import { DiagnosticScore } from './DiagnosticScore';
import DiagnosticTip from './DiagnosticTip';
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
      prepareProfessorNotification({
        diagnosticId: lesson.question.conceptId,
        lessonTitle: lesson.title,
        stage: 1,
        questionPrompt: 'Did the piano match the notes?',
        attemptsCount: 2,
        details: 'ListenAndJudge: Student failed retry on starter question despite guided clue.',
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
      <div className="diagnostic-professor-notice" role="alert">
        <span className="diagnostic-professor-notice__badge">Note for your teacher</span>
        <h3 className="diagnostic-professor-notice__title">We'll review this with your teacher</h3>
        <p className="diagnostic-professor-notice__text">
          We've saved a note for your teacher so you can practice this concept together. Let's keep going!
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
  const [subStage, setSubStage] = useState<'listening' | 'incorrectFeedback' | 'identifying' | 'identifyingCorrect' | 'correctFeedback' | 'professorNotified'>('listening');
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
          diagnosticId: 'clef-transposition',
          lessonTitle: lesson.title,
          stage: 1,
          questionIndex: roundIdx,
          questionPrompt: 'Did the piano match the notes?',
          attemptsCount: 2,
          details: `Round ${roundIdx + 1}: Student answered "Wrong" when the piano matched, despite guided instruction.`,
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
          diagnosticId: 'clef-transposition',
          lessonTitle: lesson.title,
          stage: 1,
          questionIndex: roundIdx,
          questionPrompt: 'Did the piano match the notes?',
          attemptsCount: 2,
          details: `Round ${roundIdx + 1}: Student answered "Correct" when the clef was mismatched, despite guided instruction.`,
        });
        setSubStage('professorNotified');
      } else {
        setSubStage('incorrectFeedback');
      }
    }
  };

  // User selected clef in the identification question
  const onPickFeatureChoice = (index: number) => {
    if (index === featureCheck.correct) {
      setSubStage('identifyingCorrect');
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
            Check clue
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
              {currentRound?.correctFeedback ?? lesson.correctFeedback ?? 'The piano played in the wrong clef!'}
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
        <div className="diagnostic-professor-notice" role="alert">
          <span className="diagnostic-professor-notice__badge">Note for your teacher</span>
          <h3 className="diagnostic-professor-notice__title">We'll review this with your teacher</h3>
          <p className="diagnostic-professor-notice__text">
            We've saved a note for your teacher so you can practice this concept together. Let's keep going!
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
              {isMatch
                ? 'This phrase is written in treble clef, and the piano matched the notes.'
                : currentRound.notation.clef === 'bass'
                  ? 'This phrase is written in bass clef, but the piano played in treble clef.'
                  : 'This phrase is written in treble clef, but the piano played in bass clef.'}
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
  const [subStage, setSubStage] = useState<'prompting' | 'incorrectFeedback' | 'identifying' | 'identifyingCorrect' | 'correctFeedback' | 'professorNotified'>('prompting');
  const [retrying, setRetrying] = useState(false);
  const [playingA, setPlayingA] = useState(false);
  const [playingB, setPlayingB] = useState(false);
  const [heardA, setHeardA] = useState(false);
  const [heardB, setHeardB] = useState(false);
  const [error, setError] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const [highlightCue, setHighlightCue] = useState(false);
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
  const hasAudio = Boolean(currentRound?.audioClipA && currentRound?.audioClipB);
  const featureCheck = currentRound?.featureCheck ?? lesson.featureCheck;

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
    if (roundIdx < rounds.length - 1) {
      setRoundIdx(r => r + 1);
    } else {
      onNext();
    }
  };

  const onPickChoice = (index: number) => {
    playback.current?.stop();
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
        setSubStage('professorNotified');
      } else {
        setSubStage('incorrectFeedback');
      }
    }
  };

  const onPickFeatureChoice = (index: number) => {
    if (featureCheck && index === featureCheck.correct) {
      setSubStage('identifyingCorrect');
    } else {
      setEnlarged(true);
      setHighlightCue(true);
      setShowForced(true);
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
        highlightNoteIndex={currentRound?.highlightNoteIndex}
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
            onClick={() => setSubStage('identifying')}
          >
            <span className="et-start__dot"><RecordDot /></span>
            Check clue
          </button>
        </div>
      )}

      {subStage === 'identifying' && featureCheck && (
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
        <div className="diagnostic-professor-notice" role="alert">
          <span className="diagnostic-professor-notice__badge">Note for your teacher</span>
          <h3 className="diagnostic-professor-notice__title">We'll review this with your teacher</h3>
          <p className="diagnostic-professor-notice__text">
            We've saved a note for your teacher so you can practice this concept together. Let's keep going!
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
      <div className="diagnostic-professor-notice" role="alert">
        <span className="diagnostic-professor-notice__badge">Note for your teacher</span>
        <h3 className="diagnostic-professor-notice__title">We'll review this with your teacher</h3>
        <p className="diagnostic-professor-notice__text">
          We've saved a note for your teacher so you can practice this concept together. Let's keep going!
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
        <p>Try another answer.</p>
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
          isClefSwap ? (
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
            forcedErrorMessage={lesson.forcedErrorMessage}
            mistakePitches={lesson.mistakePitches}
            onPassed={() => { if (stage === 3) setStage(4); else setDone(true); }}
          />
        )}
    </div>
  </ExerciseLayout>;
}
