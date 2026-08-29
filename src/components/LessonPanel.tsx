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
      fill={activeFinger ? `url(#${id})` : "currentColor"}
      stroke="none"
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
      <path d="M40 158c-13 0-25-5.4-34.3-15L2 139c-4.9-5.1-3.9-13.4 2-17.3 5.1-3.4 11.9-2.6 16.1 1.7l9.6 10.1c1.9 2 5.1.6 5.1-2.1V44a10.5 10.5 0 0 1 21 0v45a4 4 0 0 0 8 0V22a10.5 10.5 0 0 1 21 0v67a4 4 0 0 0 8 0V32a10.5 10.5 0 0 1 21 0v57a4 4 0 0 0 8 0V44a10.5 10.5 0 0 1 21 0v58c0 30.9-25.1 56-56 56Z" />
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
