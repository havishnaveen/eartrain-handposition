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
      viewBox="0 0 120 120"
      className={className}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      fill="none"
      stroke="none"
      aria-hidden="true"
    >
      {activeFinger === 1 ? <path d="M 52,65 L 35,48 a 6,6 0 0,0 -8.5,8.5 L 44,73 Z" fill="#ef6a47" /> : null}
      {activeFinger === 2 ? <path d="M 52,55 v -25 a 6,6 0 0,1 12,0 v 25 Z" fill="#ef6a47" /> : null}
      {activeFinger === 3 ? <path d="M 64,55 v -35 a 6,6 0 0,1 12,0 v 35 Z" fill="#ef6a47" /> : null}
      {activeFinger === 4 ? <path d="M 76,55 v -25 a 6,6 0 0,1 12,0 v 25 Z" fill="#ef6a47" /> : null}
      {activeFinger === 5 ? <path d="M 88,55 v -15 a 6,6 0 0,1 12,0 v 15 Z" fill="#ef6a47" /> : null}
      
      <path d="M 90,100
               C 100,95 100,80 100,55
               v -15 a 6,6 0 0,0 -12,0
               v 15
               v -25 a 6,6 0 0,0 -12,0
               v 25
               v -35 a 6,6 0 0,0 -12,0
               v 35
               v -25 a 6,6 0 0,0 -12,0
               v 10
               L 35,48 a 6,6 0 0,0 -8.5,8.5 L 44,73
               C 40,90 45,100 50,100
               A 20,20 0 0,0 90,100 Z"
            stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
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
