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

/**
 * One shared hand SVG for position proof and chord-quality guidance.
 *
 * Six separate closed shapes (palm + thumb + four fingers) rather than one
 * fused outline, so highlighting "which finger to use" is just giving that
 * one shape the accent color — a real highlight tied to real geometry,
 * never a gradient band painted across the whole icon regardless of where
 * the finger actually sits.
 */
export function HandIcon({
  mirrored,
  activeFinger,
  className = 'lp-hand__icon',
}: {
  mirrored: boolean;
  activeFinger?: 1 | 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={mirrored ? undefined : { transform: 'scaleX(-1)' }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {activeFinger === 1 ? <path d="M 6.8 15.2 L 3.2 11.6 a 2 2 0 0 1 2.8 -2.8 L 9.6 12.4 Z" fill="#ef6a47" stroke="none" /> : null}
      {activeFinger === 2 ? <rect x="6" y="4" width="4" height="12" rx="2" fill="#ef6a47" stroke="none" /> : null}
      {activeFinger === 3 ? <rect x="10" y="2" width="4" height="15" rx="2" fill="#ef6a47" stroke="none" /> : null}
      {activeFinger === 4 ? <rect x="14" y="4" width="4" height="13" rx="2" fill="#ef6a47" stroke="none" /> : null}
      {activeFinger === 5 ? <rect x="18" y="6" width="4" height="10" rx="2" fill="#ef6a47" stroke="none" /> : null}

      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
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
