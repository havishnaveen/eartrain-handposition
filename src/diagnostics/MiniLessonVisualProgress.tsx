import type { DiagnosticStage } from './registry';

export interface MiniLessonStep {
  stage: DiagnosticStage;
  title: string;
  shortLabel: string;
  category: 'listening' | 'concept' | 'acoustic' | 'transfer';
}

export function getMiniLessonSteps(problemId: string): MiniLessonStep[] {
  if (problemId === 'clef-transposition') {
    return [
      { stage: 1, title: 'Starter Clef Check', shortLabel: 'Clef Sound', category: 'listening' },
      { stage: 2, title: 'Visual Clef Identification', shortLabel: 'Clef Rule', category: 'concept' },
      { stage: 3, title: 'Clef Swap Playthrough', shortLabel: 'Playthrough', category: 'acoustic' },
    ];
  }
  if (problemId === 'key-signature') {
    return [
      { stage: 1, title: 'Key Signature Checks', shortLabel: 'Signature Checks', category: 'listening' },
      { stage: 2, title: 'Natural Sign Rule Check', shortLabel: 'Natural Rule', category: 'concept' },
      { stage: 3, title: 'Acoustic Playthrough Drill', shortLabel: 'Playthrough', category: 'acoustic' },
      { stage: 4, title: 'Transfer to Fresh Phrase', shortLabel: 'Transfer', category: 'transfer' },
    ];
  }
  if (problemId === 'hand-position') {
    return [
      { stage: 1, title: 'Hand Position Mastery Drill', shortLabel: 'Prove Hand Anchors', category: 'acoustic' },
    ];
  }
  return [
    { stage: 1, title: 'Starter Listening & Evaluation', shortLabel: 'Listen & Judge', category: 'listening' },
    { stage: 2, title: 'Guided Concept Reading Check', shortLabel: 'Concept Check', category: 'concept' },
    { stage: 3, title: 'Acoustic Piano Playthrough', shortLabel: 'Playthrough', category: 'acoustic' },
    { stage: 4, title: 'Transfer to Fresh Phrase', shortLabel: 'Transfer', category: 'transfer' },
  ];
}

const StepIcon = ({ category }: { category: MiniLessonStep['category'] }) => {
  if (category === 'listening') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    );
  }
  if (category === 'concept') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }
  if (category === 'acoustic') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="6" y1="5" x2="6" y2="13" />
        <line x1="10" y1="5" x2="10" y2="13" />
        <line x1="14" y1="5" x2="14" y2="13" />
        <line x1="18" y1="5" x2="18" y2="13" />
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
 * Graphic image component rendered in the Lesson Hopper showing all X lessons
 * for the current mini-lesson and prominently displaying which one the user is on.
 */
export function MiniLessonVisualProgress({
  problemId,
  problemLabel,
  currentStage,
  onSelectStage,
}: {
  problemId: string;
  problemLabel?: string;
  currentStage: DiagnosticStage;
  onSelectStage?: (stage: DiagnosticStage) => void;
}) {
  const steps = getMiniLessonSteps(problemId);
  const total = steps.length;
  const currentStep = steps.find(s => s.stage === currentStage) ?? steps[0];
  const currentIndex = steps.findIndex(s => s.stage === currentStage);
  const activeIdx = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div className="diagnostic-mini-lesson-card" role="region" aria-label="Mini-lesson roadmap">
      <div className="diagnostic-mini-lesson-card__header">
        <div className="diagnostic-mini-lesson-card__title-row">
          <span className="diagnostic-mini-lesson-card__badge">
            Lesson {activeIdx + 1} of {total}
          </span>
          <span className="diagnostic-mini-lesson-card__label">
            {problemLabel ? `${problemLabel} · ` : ''}All Lessons Road Map
          </span>
        </div>
        <span className="diagnostic-mini-lesson-card__status">
          <span className="diagnostic-pulse-dot" /> On Lesson {activeIdx + 1}: {currentStep.shortLabel}
        </span>
      </div>

      {/* SVG Image Graphic Visualizing the X Lessons */}
      <div className="diagnostic-mini-lesson-graphic-wrap">
        <svg
          viewBox="0 0 440 96"
          className="diagnostic-mini-lesson-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="ml-track-active" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <filter id="ml-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#f97316" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Background Track Line */}
          <line
            x1="45"
            y1="40"
            x2={total > 1 ? 45 + (total - 1) * (350 / (total - 1)) : 45}
            y2="40"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Active Progress Line */}
          {activeIdx > 0 && total > 1 && (
            <line
              x1="45"
              y1="40"
              x2={45 + activeIdx * (350 / (total - 1))}
              y2="40"
              stroke="url(#ml-track-active)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}

          {/* Nodes for each of the X lessons */}
          {steps.map((step, idx) => {
            const x = total === 1 ? 220 : 45 + idx * (350 / (total - 1));
            const y = 40;
            const isCurrent = step.stage === currentStage;
            const isPassed = idx < activeIdx;

            return (
              <g key={step.stage}>
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
                  filter={isCurrent ? 'url(#ml-glow)' : undefined}
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
                  {idx + 1}
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
                  fontSize="11"
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

      {/* Interactive Quick-Jump Step Cards */}
      <div className="diagnostic-mini-lesson-steps-row">
        {steps.map((step, idx) => {
          const isCurrent = step.stage === currentStage;
          return (
            <button
              key={step.stage}
              type="button"
              className={`diagnostic-mini-step-btn ${isCurrent ? 'is-active' : ''}`}
              onClick={() => onSelectStage?.(step.stage)}
              title={`Jump to Lesson ${idx + 1}: ${step.title}`}
            >
              <span className="diagnostic-mini-step-btn__icon">
                <StepIcon category={step.category} />
              </span>
              <span className="diagnostic-mini-step-btn__text">
                <span className="diagnostic-mini-step-btn__num">Lesson {idx + 1}</span>
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

/**
 * Docked bottom bar displayed during "All Questions" testing on the exercise stage.
 * Shows a compact graphic indicator of which lesson out of X the tester is currently on.
 */
export function MiniLessonBottomBar({
  problemId,
  currentStage,
  onSelectStage,
}: {
  problemId: string;
  currentStage: DiagnosticStage;
  onSelectStage: (stage: DiagnosticStage) => void;
}) {
  const steps = getMiniLessonSteps(problemId);
  const total = steps.length;
  const currentStep = steps.find(s => s.stage === currentStage) ?? steps[0];
  const currentIndex = steps.findIndex(s => s.stage === currentStage);
  const activeIdx = currentIndex >= 0 ? currentIndex : 0;

  const prevStep = activeIdx > 0 ? steps[activeIdx - 1] : null;
  const nextStep = activeIdx < total - 1 ? steps[activeIdx + 1] : null;

  return (
    <nav className="diagnostic-tester-bottom-bar" aria-label="Mini-lesson tester navigation">
      <div className="diagnostic-tester-bottom-bar__inner">
        <div className="diagnostic-tester-bottom-bar__left">
          <span className="diagnostic-tester-bottom-bar__tag">Testing All Questions</span>
          <strong className="diagnostic-tester-bottom-bar__stage-readout">
            Lesson {activeIdx + 1} of {total}: <span className="diagnostic-tester-bottom-bar__current-name">{currentStep.title}</span>
          </strong>
        </div>

        {/* Compact Visual Mini-Map Nodes */}
        <div className="diagnostic-tester-bottom-bar__nodes">
          {steps.map((step, idx) => {
            const isCurrent = step.stage === currentStage;
            const isPassed = idx < activeIdx;
            return (
              <button
                key={step.stage}
                type="button"
                className={`diagnostic-bottom-node ${isCurrent ? 'is-active' : ''} ${isPassed ? 'is-passed' : ''}`}
                onClick={() => onSelectStage(step.stage)}
                aria-label={`Go to Lesson ${idx + 1}: ${step.title}`}
                title={`Lesson ${idx + 1}: ${step.title}${isCurrent ? ' (Active)' : ''}`}
              >
                <span className="diagnostic-bottom-node__dot">
                  {isCurrent ? <span className="diagnostic-bottom-node__pulse" /> : null}
                  <span className="diagnostic-bottom-node__num">{idx + 1}</span>
                </span>
                <span className="diagnostic-bottom-node__label">{step.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Stepper Controls */}
        <div className="diagnostic-tester-bottom-bar__controls">
          <button
            type="button"
            className="diagnostic-tester-nav-btn"
            disabled={!prevStep}
            onClick={() => prevStep && onSelectStage(prevStep.stage)}
            title={prevStep ? `Go to Lesson ${activeIdx}: ${prevStep.shortLabel}` : undefined}
          >
            ‹ Prev Lesson
          </button>
          <button
            type="button"
            className="diagnostic-tester-nav-btn diagnostic-tester-nav-btn--next"
            disabled={!nextStep}
            onClick={() => nextStep && onSelectStage(nextStep.stage)}
            title={nextStep ? `Go to Lesson ${activeIdx + 2}: ${nextStep.shortLabel}` : undefined}
          >
            Next Lesson ›
          </button>
        </div>
      </div>
    </nav>
  );
}
