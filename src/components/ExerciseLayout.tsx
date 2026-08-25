import type { ReactNode } from 'react';
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

  return (
    <div className="et-shell et-shell--pathway">
      <aside className="et-sidebar" aria-label="Current learning pathway">
        <div className="et-sidebar__inner">
          <div className="et-sidebar__brand">
            <span className="et-sidebar__mark"><NoteMark /></span>
            <span>
              <strong>EarTrain</strong>
              <small>Sight-reading studio</small>
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
        </div>
      </aside>

      <main className="et-stage">
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
