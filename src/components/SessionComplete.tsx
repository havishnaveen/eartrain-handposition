import './exercise.css';

import type { ScoreBreakdown } from '../audio/timing';

export interface SessionCompleteProps {
  /** Session mean across all attempts. Omit to hide the breakdown. */
  meanScores?: ScoreBreakdown | null;
  /** Position the student scored lowest on, for the teacher-facing line. */
  weakestPosition?: string | null;
  /** Questions actually answered this session. */
  questionsAnswered: number;
  /** 0–1 across all attempts. */
  passRate: number;
  /** Lessons reached in the pathway. */
  lessonsReached: number;
  totalLessons: number;
  /** True when the session ended on the cap rather than finishing the pathway. */
  endedOnCap: boolean;
  /** Where to send the student next. Omit to hide the control. */
  returnUrl?: string;
}

const DoneIcon = () => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
);

/**
 * SessionComplete
 *
 * The graceful exit. A student who keeps missing is capped out rather than
 * left in an unbounded loop, and either way the pathway ends here instead of
 * dead-ending. No score theatre — the number goes to the instructor, not the
 * student, so this screen just confirms the work is banked and sends them on.
 */
export function SessionComplete({
  questionsAnswered,
  passRate,
  lessonsReached,
  totalLessons,
  endedOnCap,
  returnUrl,
  meanScores = null,
  weakestPosition = null,
}: SessionCompleteProps) {
  return (
    <div className="et-shell">
      <main className="et-stage">
        <div className="et-stage__inner et-stage__inner--narrow">
          <div className="et-done">
            <span className="et-done__mark"><DoneIcon /></span>

            <h1 className="et-done__title">Practice complete</h1>
            <p className="et-done__sub">
              {endedOnCap
                ? 'That is enough for this session. Your teacher has the results.'
                : 'You worked through the whole pathway. Your teacher has the results.'}
            </p>

            {meanScores ? (
              <div className="et-done__scores">
                <div className="et-done__score">
                  <span>Notes</span>
                  <strong>{meanScores.pitch.toFixed(1)}</strong>
                </div>
                <div className="et-done__score">
                  <span>Timing</span>
                  <strong>{meanScores.timing === null ? '—' : meanScores.timing.toFixed(1)}</strong>
                </div>
                <div className="et-done__score">
                  <span>Clean</span>
                  <strong>{meanScores.cleanliness.toFixed(1)}</strong>
                </div>
              </div>
            ) : null}

            {weakestPosition ? (
              <p className="et-done__note">
                Most to work on: <strong>{weakestPosition} position</strong>.
              </p>
            ) : null}

            <dl className="et-done__stats">
              <div className="et-done__stat">
                <dt>Drills played</dt>
                <dd>{questionsAnswered}</dd>
              </div>
              <div className="et-done__stat">
                <dt>Accuracy</dt>
                <dd>{Math.round(passRate * 100)}%</dd>
              </div>
              <div className="et-done__stat">
                <dt>Lessons reached</dt>
                <dd>
                  {lessonsReached} of {totalLessons}
                </dd>
              </div>
            </dl>

            {returnUrl ? (
              <a className="et-start et-start--link" href={returnUrl}>
                Back to sight-reading
              </a>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

export default SessionComplete;
