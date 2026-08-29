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
  const restColor = '#d7d2da';
  const colorFor = (finger: 1 | 2 | 3 | 4 | 5) =>
    activeFinger === finger ? 'currentColor' : restColor;

  return (
    <svg
      viewBox="0 0 100 118"
      className={className}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      fill="none"
      aria-hidden="true"
    >
      {/* palm */}
      <path
        d="M22 118c-16 0-29-13-29-29V66c0-16 13-29 29-29h44c16 0 29 13 29 29v23c0 16-13 29-29 29H22Z"
        fill={activeFinger === undefined ? 'currentColor' : restColor}
      />
      {/* thumb */}
      <path
        d="M22 68c-2.6-7-10.4-10.6-17.4-8-7 2.6-10.6 10.4-8 17.4l10.6 28.7c2.6 7 10.4 10.6 17.4 8 7-2.6 10.6-10.4 8-17.4L22 68Z"
        fill={colorFor(1)}
      />
      {/* index */}
      <rect x="21" y="20" width="16.5" height="46" rx="8.25" fill={colorFor(2)} />
      {/* middle */}
      <rect x="41.75" y="6" width="16.5" height="60" rx="8.25" fill={colorFor(3)} />
      {/* ring */}
      <rect x="62.5" y="12" width="16.5" height="54" rx="8.25" fill={colorFor(4)} />
      {/* pinky */}
      <rect x="83" y="24" width="15" height="42" rx="7.5" fill={colorFor(5)} />
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
