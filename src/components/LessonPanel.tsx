import { useId } from 'react';
import './lesson-panel.css';

export type PanelHand = 'right' | 'left';

export interface LessonPanelProps {
  keyName: string;
  hands: PanelHand[];
  anchorNote?: string;
  subtitle?: string;
  onStart?: () => void;
  startLabel?: string;
  disabled?: boolean;
  activeFinger?: 1 | 2 | 3 | 4 | 5;
  showHandLabel?: boolean;
}

/** One shared hand SVG for position proof and chord-quality guidance. */
export function HandIcon({
  mirrored,
  activeFinger,
  className = 'lp-hand__icon',
}: {
  mirrored: boolean;
  activeFinger?: 1 | 2 | 3 | 4 | 5;
  className?: string;
}) {
  const id = `hand-gradient-${useId().replace(/:/g, '')}`;
  const centers = [0, 9, 31, 48, 66, 84];
  const center = centers[activeFinger ?? 0];
  const start = Math.max(0, center - 10);
  const end = Math.min(100, center + 10);
  return (
    <svg
      viewBox="0 0 146 158"
      className={className}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      fill="none"
      stroke={activeFinger ? `url(#${id})` : 'currentColor'}
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {activeFinger ? <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#d8d1d9" />
          <stop offset={`${start}%`} stopColor="#d8d1d9" />
          <stop offset={`${center}%`} stopColor="#ef6a47" />
          <stop offset={`${end}%`} stopColor="#d8d1d9" />
          <stop offset="100%" stopColor="#d8d1d9" />
        </linearGradient>
      </defs> : null}
      <path d="M43 96 31 84c-6-6-15-6-21 0-6 6-6 15 0 22l24 30c8 10 18 15 32 15h21c32 0 51-20 51-54V43c0-7-5-12-12-12s-12 5-12 12v31-38c0-7-5-12-12-12s-12 5-12 12v34-40c0-7-5-12-12-12s-12 5-12 12v40-34c0-7-5-12-12-12s-12 5-12 12v63" />
    </svg>
  );
}

export function LessonPanel({
  keyName,
  hands,
  anchorNote,
  subtitle,
  onStart,
  startLabel = 'Start',
  disabled = false,
  activeFinger,
  showHandLabel = true,
}: LessonPanelProps) {
  const bothHands = hands.length > 1;
  const handLabel = bothHands
    ? 'Both Hands'
    : hands[0] === 'left'
      ? 'Left Hand'
      : 'Right Hand';

  return (
    <section
      className="lp"
      aria-label={`${keyName}, ${handLabel}${anchorNote ? `, start on ${anchorNote}` : ''}`}
    >
      <header className="lp__head">
        <span className="lp__eyebrow">Key</span>
        <h1 className="lp__title">{keyName}</h1>
        {subtitle ? <p className="lp__subtitle">{subtitle}</p> : null}
      </header>

      <div className={`lp-placement${bothHands ? ' lp-placement--pair' : ''}${!anchorNote ? ' lp-placement--no-anchor' : ''}`}>
        <div className="lp-placement__figures" aria-hidden="true">
          {hands.map((hand) => (
            <span
              key={hand}
              className={`lp-placement__figure lp-placement__figure--${hand}`}
            >
              <HandIcon mirrored={hand === 'left'} activeFinger={activeFinger} />
              {showHandLabel ? <span className="lp-placement__figure-label">
                {hand === 'left' ? 'Left' : 'Right'}<br />Hand
              </span> : null}
            </span>
          ))}
        </div>

        {anchorNote ? (
          <div className="lp-placement__copy">
            <span className="lp-placement__anchor">
              <span>Start on</span>
              <b>{anchorNote}</b>
            </span>
          </div>
        ) : null}
      </div>

      {onStart ? (
        <button type="button" className="lp__start" onClick={onStart} disabled={disabled}>
          <span className="lp__start-dot" aria-hidden="true" />
          {startLabel}
        </button>
      ) : null}
    </section>
  );
}

export default LessonPanel;
