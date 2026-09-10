import { useState, useEffect, type ReactNode } from 'react';
import './exercise.css';

export interface ExerciseLayoutProps {
  /** 1-based question inside the current lesson loop. */
  questionNumber: number;
  /** Size of the current loop. Grows when the student needs more reps. */
  questionsInLoop: number;
  /** 1-based lesson index in the macro pathway. */
  lessonNumber: number;
  totalLessons: number;
  /** Lesson name — the headline of the sidebar. */
  lessonTitle: string;
  /** One line on what this lesson trains. */
  lessonFocus?: string;
  /** Phase name, e.g. "Anchor plants". */
  phaseLabel?: string;
  children: ReactNode;
}

const NoteMark = () => (
  <svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">
    <path d="M9.7 10.2c-2.8 2.7-2.8 8.9 0 11.6M13 12.7c-1.3 1.4-1.3 4.6 0 6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    <ellipse cx="17.1" cy="21.9" rx="4.15" ry="3.05" fill="currentColor" transform="rotate(-12 17.1 21.9)" />
    <path d="M20.65 20.7V7.5l5.2-1.2v3l-5.2 1.2" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * A deliberately asymmetric pathway shell: curriculum context lives in a
 * vertical rail while the score gets an uninterrupted studio-like stage.
 * On narrow screens the rail folds into a compact top card.
 */
export function ExerciseLayout({
  questionNumber,
  questionsInLoop,
  lessonNumber,
  totalLessons,
  lessonTitle,
  lessonFocus,
  phaseLabel,
  children,
}: ExerciseLayoutProps) {
  const loopSize = Math.max(1, questionsInLoop);
  const current = Math.min(Math.max(1, questionNumber), loopSize);
  const lesson = Math.min(Math.max(1, lessonNumber), Math.max(1, totalLessons));
  // Collapsed by default: the pathway rail is reference material, not the
  // focus of the page — a first-time student's attention belongs on the
  // staff, and this keeps the stage uncluttered until they ask for context.
  const [collapsed, setCollapsed] = useState(true);
  const [clicks, setClicks] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // Automatically unlocks after the next exercise/question begins
  useEffect(() => {
    setLocked(false);
    setShowWarning(false);
    setClicks([]);
  }, [questionNumber, lessonNumber]);

  const handleToggle = () => {
    if (locked) return;
    const now = Date.now();
    // 5 clicks in rapid succession (6–7 seconds window)
    const recent = clicks.filter((time) => now - time < 6500);
    recent.push(now);
    if (recent.length >= 5) {
      setLocked(true);
      setShowWarning(true);
      setCollapsed(true);
      setClicks([]);
    } else {
      setClicks(recent);
      setCollapsed((isCollapsed) => !isCollapsed);
    }
  };

  return (
    <div className={`et-shell et-shell--pathway${collapsed ? ' et-shell--sidebar-collapsed' : ''}`}>
      <button
        type="button"
        className="et-sidebar-toggle"
        disabled={locked}
        onClick={handleToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show learning pathway' : 'Hide learning pathway'}
      >
        <span className="et-sidebar-toggle__icon" aria-hidden="true">
          <NoteMark />
        </span>
        <span className="et-sidebar-toggle__chevron" aria-hidden="true">{collapsed ? '›' : '‹'}</span>
      </button>
      {showWarning ? (
        <div
          className="et-sidebar-warning-modal"
          role="alert"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="et-sidebar-warning-modal__backdrop"
            style={{
              position: 'absolute',
              inset: 0,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              backgroundColor: 'rgba(36, 34, 55, 0.35)',
            }}
          />
          <div
            className="et-sidebar-warning-modal__content"
            style={{
              position: 'relative',
              backgroundColor: 'white',
              padding: '28px 36px',
              borderRadius: '16px',
              boxShadow: '0 16px 48px rgba(36, 34, 55, 0.18)',
              textAlign: 'center',
              maxWidth: '380px',
              width: '90%',
            }}
          >
            <h2 style={{ color: '#ef6a47', margin: '0 0 12px 0', fontSize: '20px', fontWeight: 750 }}>
              Too many clicks
            </h2>
            <p style={{ fontSize: '15px', color: '#4a4659', margin: '0 0 20px 0', lineHeight: 1.45 }}>
              Please focus on the exercise. The sidebar is locked and will unlock on the next exercise.
            </p>
            <button
              type="button"
              onClick={() => setShowWarning(false)}
              style={{
                backgroundColor: '#ef6a47',
                color: 'white',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '15px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Acknowledge
            </button>
          </div>
        </div>
      ) : null}
      <aside className="et-sidebar" aria-label="Current learning pathway" aria-hidden={collapsed}>
        <div className="et-sidebar__inner">
          <div className="et-sidebar__brand">
            <span className="et-sidebar__mark"><NoteMark /></span>
            <span>
              <strong>EarTrain</strong>
              <small>Sight-reading studio · Oclef</small>
            </span>
          </div>

          <div className="et-sidebar__lesson">
            <p className="et-sidebar__eyebrow">
              {phaseLabel ? <span>{phaseLabel}</span> : <span>Learning pathway</span>}
              <b>{lesson}/{totalLessons}</b>
            </p>
            <h1>{lessonTitle}</h1>
            {lessonFocus ? <p className="et-sidebar__focus">{lessonFocus}</p> : null}
          </div>

          <section className="et-sidebar__journey" aria-labelledby="et-pathway-label">
            <div className="et-sidebar__section-title">
              <span id="et-pathway-label">Lesson pathway</span>
              <span>{Math.round((lesson / Math.max(1, totalLessons)) * 100)}%</span>
            </div>
            <div
              className="et-lesson-progress"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={totalLessons}
              aria-valuenow={lesson}
              aria-label={`Lesson ${lesson} of ${totalLessons}`}
            >
              {Array.from({ length: totalLessons }, (_, index) => {
                const number = index + 1;
                const state = number < lesson ? 'done' : number === lesson ? 'active' : 'todo';
                return (
                  <span key={number} className={`et-lesson-progress__tick et-lesson-progress__tick--${state}`}>
                    <i />
                    <b>{number}</b>
                    {state === 'active' ? <em>Current lesson</em> : null}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="et-sidebar__set" aria-label={`Drill ${current} of ${loopSize}`}>
            <div className="et-sidebar__set-copy">
              <span>Current set</span>
              <strong>{current}<small> / {loopSize}</small></strong>
            </div>
            <div
              className="et-drill-progress"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={loopSize}
              aria-valuenow={current}
            >
              {Array.from({ length: loopSize }, (_, index) => {
                const number = index + 1;
                const state = number < current ? 'done' : number === current ? 'active' : 'todo';
                return <span key={number} className={`et-drill-progress__tick et-drill-progress__tick--${state}`} />;
              })}
            </div>
          </section>

          <footer className="et-sidebar__credit">
            <span>Created by <strong>Havish Naveen</strong></span>
            <small>in collaboration with <strong>Oclef</strong></small>
          </footer>
        </div>
      </aside>

      <main className="et-stage">
        <div
          className="et-collab-tag"
          role="note"
          aria-label="Created by Havish Naveen in collaboration with Oclef"
        >
          <span className="et-collab-tag__dot" aria-hidden="true" />
          <span className="et-collab-tag__label">
            Created by <strong className="et-collab-tag__name">Havish Naveen</strong> in collaboration with <strong className="et-collab-tag__partner">Oclef</strong>
          </span>
        </div>

        <div className="et-stage__ambient" aria-hidden="true">
          <span className="et-stage__shape et-stage__shape--rhythm" />
          <span className="et-stage__shape et-stage__shape--pebble" />
          <span className="et-stage__shape et-stage__shape--diamond" />
          <span className="et-stage__shape et-stage__shape--dots" />
        </div>
        <div className="et-stage__inner">{children}</div>
      </main>
    </div>
  );
}

export default ExerciseLayout;
