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
}

/** A friendly symbol with only slight variation between finger heights. */
const HandIcon = ({ mirrored }: { mirrored: boolean }) => (
  <svg
    viewBox="0 0 146 158"
    className="lp-hand__icon"
    style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    fill="none"
    stroke="currentColor"
    strokeWidth="3.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M43 96 31 84c-6-6-15-6-21 0-6 6-6 15 0 22l24 30c8 10 18 15 32 15h21c32 0 51-20 51-54V43c0-7-5-12-12-12s-12 5-12 12v31-38c0-7-5-12-12-12s-12 5-12 12v34-40c0-7-5-12-12-12s-12 5-12 12v40-34c0-7-5-12-12-12s-12 5-12 12v63" />
  </svg>
);

export function LessonPanel({
  keyName,
  hands,
  anchorNote,
  subtitle,
  onStart,
  startLabel = 'Start',
  disabled = false,
}: LessonPanelProps) {
  const bothHands = hands.length > 1;
  const handLabel = bothHands
    ? 'Both Hands'
    : hands[0] === 'left'
      ? 'Left Hand'
      : 'Right Hand';

  return (
    <section className="lp" aria-label={`${keyName}, ${handLabel}, start on ${anchorNote}`}>
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
              <HandIcon mirrored={hand === 'left'} />
              <span className="lp-placement__figure-label">
                {hand === 'left' ? 'Left' : 'Right'}<br />Hand
              </span>
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
