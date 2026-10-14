export interface MiniLessonBatchStep {
  batch: number;
  title: string;
  shortLabel: string;
  kind: 'visual' | 'rule' | 'audio' | 'cause';
}

export const MINI_LESSON_BATCHES: readonly MiniLessonBatchStep[] = [
  { batch: 1, title: 'Batch 1 · Visual & Rule Fundamentals', shortLabel: 'Visual & Rule', kind: 'visual' },
  { batch: 2, title: 'Batch 2 · Visual Reading & Audio Check', shortLabel: 'Visual & Audio', kind: 'audio' },
  { batch: 3, title: 'Batch 3 · Ear-Led Listening & Error Cause', shortLabel: 'Ear & Cause', kind: 'cause' },
  { batch: 4, title: 'Batch 4 · Context Clues & Rule Execution', shortLabel: 'Context Clues', kind: 'rule' },
  { batch: 5, title: 'Batch 5 · Advanced Aural Discrimination', shortLabel: 'Audio Drill', kind: 'audio' },
  { batch: 6, title: 'Batch 6 · Cause Analysis & Mastery', shortLabel: 'Mastery Check', kind: 'cause' },
];

const StepIcon = ({ kind }: { kind: MiniLessonBatchStep['kind'] }) => {
  if (kind === 'audio') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    );
  }
  if (kind === 'rule') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }
  if (kind === 'visual') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
};

/**
 * Graphic image component rendered in the Lesson Hopper showing all 6 batches
 * for the current mini-lesson and prominently displaying which batch the teacher is on.
 */
export function MiniLessonVisualProgress({
  topicId: _topicId,
  topicLabel,
  currentBatch,
  onSelectBatch,
}: {
  topicId?: string;
  topicLabel?: string;
  currentBatch: number;
  onSelectBatch?: (batch: number) => void;
}) {
  const steps = MINI_LESSON_BATCHES;
  const total = steps.length;
  const safeBatch = Math.min(total, Math.max(1, currentBatch));
  const activeIdx = safeBatch - 1;
  const currentStep = steps[activeIdx];

  return (
    <div className="diagnostic-mini-lesson-card" role="region" aria-label="Mini-lesson batch roadmap">
      <div className="diagnostic-mini-lesson-card__header">
        <div className="diagnostic-mini-lesson-card__title-row">
          <span className="diagnostic-mini-lesson-card__badge">
            Batch {safeBatch} of {total}
          </span>
          <span className="diagnostic-mini-lesson-card__label">
            {topicLabel ? `${topicLabel} · ` : ''}All Batches Sequence
          </span>
        </div>
        <span className="diagnostic-mini-lesson-card__status">
          <span className="diagnostic-pulse-dot" /> On Batch {safeBatch}: {currentStep.shortLabel}
        </span>
      </div>

      {/* SVG Image Graphic Visualizing the 6 Batches */}
      <div className="diagnostic-mini-lesson-graphic-wrap">
        <svg
          viewBox="0 0 460 96"
          className="diagnostic-mini-lesson-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="ml-batch-track-active" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <filter id="ml-batch-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#f97316" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Background Track Line */}
          <line
            x1="45"
            y1="40"
            x2="415"
            y2="40"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Active Progress Line */}
          {activeIdx > 0 && (
            <line
              x1="45"
              y1="40"
              x2={45 + activeIdx * (370 / (total - 1))}
              y2="40"
              stroke="url(#ml-batch-track-active)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}

          {/* Nodes for each of the 6 batches */}
          {steps.map((step, idx) => {
            const x = 45 + idx * (370 / (total - 1));
            const y = 40;
            const isCurrent = step.batch === safeBatch;
            const isPassed = idx < activeIdx;

            return (
              <g key={step.batch}>
                {/* Active Outer Pulsing Halo */}
                {isCurrent && (
                  <circle
                    cx={x}
                    cy={y}
                    r="22"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    opacity="0.85"
                  />
                )}

                {/* Node Circle */}
                <circle
                  cx={x}
                  cy={y}
                  r="16"
                  fill={isCurrent ? '#f97316' : isPassed ? '#10b981' : '#27272a'}
                  stroke={isCurrent ? '#ffffff' : isPassed ? '#34d399' : 'rgba(255, 255, 255, 0.25)'}
                  strokeWidth={isCurrent ? '3' : '2'}
                  filter={isCurrent ? 'url(#ml-batch-glow)' : undefined}
                />

                {/* Step Number in Center */}
                <text
                  x={x}
                  y={y + 4.5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="12"
                  fontWeight="800"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {step.batch}
                </text>

                {/* Arrow pointer above active node */}
                {isCurrent && (
                  <path
                    d={`M${x - 5} 14 L${x + 5} 14 L${x} 20 Z`}
                    fill="#f97316"
                  />
                )}

                {/* Text Label Below Node */}
                <text
                  x={x}
                  y="74"
                  textAnchor="middle"
                  fill={isCurrent ? '#fb923c' : isPassed ? '#d1d5db' : '#9ca3af'}
                  fontSize="10"
                  fontWeight={isCurrent ? '800' : '500'}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {step.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interactive Quick-Jump Batch Cards */}
      <div className="diagnostic-mini-lesson-steps-row">
        {steps.map((step, idx) => {
          const isCurrent = step.batch === safeBatch;
          return (
            <button
              key={step.batch}
              type="button"
              className={`diagnostic-mini-step-btn ${isCurrent ? 'is-active' : ''}`}
              onClick={() => onSelectBatch?.(step.batch)}
              title={`Jump to Batch ${step.batch}: ${step.title}`}
            >
              <span className="diagnostic-mini-step-btn__icon">
                <StepIcon kind={step.kind} />
              </span>
              <span className="diagnostic-mini-step-btn__text">
                <span className="diagnostic-mini-step-btn__num">Batch {idx + 1}</span>
                <span className="diagnostic-mini-step-btn__label">{step.shortLabel}</span>
              </span>
              {isCurrent && <span className="diagnostic-mini-step-btn__you-tag">YOU ARE HERE</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
