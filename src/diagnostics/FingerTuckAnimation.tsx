import { useState, useEffect } from 'react';

export interface FingerTuckAnimationProps {
  initialMode?: 'tuck' | 'jump';
  interactive?: boolean;
}

interface FingerPoint {
  x: number;
  y: number;
  active: boolean;
  tucking?: boolean;
  tucked?: boolean;
  jumping?: boolean;
}

interface HandStepConfig {
  wrist: { x: number; y: number };
  palm: { x: number; y: number };
  f1: FingerPoint;
  f2: FingerPoint;
  f3: FingerPoint;
  f4: FingerPoint;
  f5: FingerPoint;
  activeKey: string | null;
  caption: string;
}

export function FingerTuckAnimation({
  initialMode = 'tuck',
  interactive = true,
}: FingerTuckAnimationProps) {
  const [mode, setMode] = useState<'tuck' | 'jump'>(initialMode);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Auto-advance through the 4 steps
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStep(prev => ((prev + 1) % 4) as 0 | 1 | 2 | 3);
    }, mode === 'tuck' ? 1900 : 2100);
    return () => clearInterval(interval);
  }, [isPlaying, mode]);

  // Keyboard layout: 8 white keys from C4 to C5
  // ViewBox: 0 0 460 265
  const whiteKeyWidth = 48;
  const whiteKeyHeight = 98;
  const startX = 38;
  const whiteKeys = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  const blackKeys = [
    { pitch: 'C#4', x: startX + whiteKeyWidth - 14 },
    { pitch: 'D#4', x: startX + whiteKeyWidth * 2 - 14 },
    { pitch: 'F#4', x: startX + whiteKeyWidth * 4 - 14 },
    { pitch: 'G#4', x: startX + whiteKeyWidth * 5 - 14 },
    { pitch: 'A#4', x: startX + whiteKeyWidth * 6 - 14 },
  ];

  // Active key centers
  const keyCenters: Record<string, number> = {
    C4: startX + whiteKeyWidth * 0.5,
    D4: startX + whiteKeyWidth * 1.5,
    E4: startX + whiteKeyWidth * 2.5,
    F4: startX + whiteKeyWidth * 3.5,
    G4: startX + whiteKeyWidth * 4.5,
    A4: startX + whiteKeyWidth * 5.5,
    B4: startX + whiteKeyWidth * 6.5,
    C5: startX + whiteKeyWidth * 7.5,
  };

  // Hand configurations for Tuck mode
  const tuckHandConfigs: HandStepConfig[] = [
    // Step 0: C Position (1 on C, 2 on D, 3 on E)
    {
      wrist: { x: 155, y: 248 },
      palm: { x: 155, y: 178 },
      f1: { x: keyCenters.C4, y: 84, active: true },
      f2: { x: keyCenters.D4, y: 78, active: false },
      f3: { x: keyCenters.E4, y: 74, active: false },
      f4: { x: keyCenters.F4, y: 80, active: false },
      f5: { x: keyCenters.G4, y: 86, active: false },
      activeKey: 'C4',
      caption: '1. Start in C Position: Fingers 1, 2, 3 play C · D · E',
    },
    // Step 1: Finger 3 holds E4, Thumb glides UNDER toward F4
    {
      wrist: { x: 165, y: 248 },
      palm: { x: 165, y: 178 },
      f1: { x: keyCenters.D4 + 20, y: 102, active: false, tucking: true },
      f2: { x: keyCenters.D4 + 2, y: 84, active: false },
      f3: { x: keyCenters.E4, y: 74, active: true },
      f4: { x: keyCenters.F4 + 8, y: 84, active: false },
      f5: { x: keyCenters.G4 + 10, y: 90, active: false },
      activeKey: 'E4',
      caption: '2. Finger 3 holds E: Thumb glides UNDER toward F',
    },
    // Step 2: Thumb arrives cleanly on F4
    {
      wrist: { x: 195, y: 248 },
      palm: { x: 195, y: 178 },
      f1: { x: keyCenters.F4, y: 84, active: true, tucked: true },
      f2: { x: keyCenters.D4 + 24, y: 92, active: false },
      f3: { x: keyCenters.E4 + 12, y: 82, active: false },
      f4: { x: keyCenters.G4 + 4, y: 88, active: false },
      f5: { x: keyCenters.A4 + 4, y: 94, active: false },
      activeKey: 'F4',
      caption: '3. Thumb lands smoothly on F (finger 3 releases)',
    },
    // Step 3: Hand smoothly swivels forward into F-G-A-B-C
    {
      wrist: { x: 275, y: 248 },
      palm: { x: 275, y: 178 },
      f1: { x: keyCenters.F4, y: 84, active: false },
      f2: { x: keyCenters.G4, y: 78, active: true },
      f3: { x: keyCenters.A4, y: 74, active: false },
      f4: { x: keyCenters.B4, y: 80, active: false },
      f5: { x: keyCenters.C5, y: 86, active: false },
      activeKey: 'G4',
      caption: '4. Hand unfolds smoothly: tempo stays unbroken!',
    },
  ];

  // Hand configurations for Jump mode (The common mistake)
  const jumpHandConfigs: HandStepConfig[] = [
    // Step 0: C Position
    {
      wrist: { x: 155, y: 248 },
      palm: { x: 155, y: 178 },
      f1: { x: keyCenters.C4, y: 84, active: true },
      f2: { x: keyCenters.D4, y: 78, active: false },
      f3: { x: keyCenters.E4, y: 74, active: false },
      f4: { x: keyCenters.F4, y: 80, active: false },
      f5: { x: keyCenters.G4, y: 86, active: false },
      activeKey: 'C4',
      caption: '1. Plays C · D · E with fingers 1, 2, 3...',
    },
    // Step 1: Hand prepares to jump off keys
    {
      wrist: { x: 155, y: 248 },
      palm: { x: 155, y: 178 },
      f1: { x: keyCenters.C4 + 10, y: 92, active: false },
      f2: { x: keyCenters.D4, y: 84, active: false },
      f3: { x: keyCenters.E4, y: 74, active: true },
      f4: { x: keyCenters.F4, y: 84, active: false },
      f5: { x: keyCenters.G4, y: 90, active: false },
      activeKey: 'E4',
      caption: '2. Finger 3 plays E, but thumb stays stuck outside!',
    },
    // Step 2: The Mistake - Whole hand leaps into the air
    {
      wrist: { x: 215, y: 260 },
      palm: { x: 215, y: 148 },
      f1: { x: keyCenters.E4 + 6, y: 68, active: false, jumping: true },
      f2: { x: keyCenters.F4, y: 60, active: false, jumping: true },
      f3: { x: keyCenters.G4, y: 56, active: false, jumping: true },
      f4: { x: keyCenters.A4, y: 60, active: false, jumping: true },
      f5: { x: keyCenters.B4, y: 66, active: false, jumping: true },
      activeKey: null,
      caption: '3. ⚠️ MISTAKE: Entire hand lifts up and leaps across keys!',
    },
    // Step 3: Lands with hesitation
    {
      wrist: { x: 275, y: 248 },
      palm: { x: 275, y: 178 },
      f1: { x: keyCenters.F4, y: 84, active: true },
      f2: { x: keyCenters.G4, y: 78, active: false },
      f3: { x: keyCenters.A4, y: 74, active: false },
      f4: { x: keyCenters.B4, y: 80, active: false },
      f5: { x: keyCenters.C5, y: 86, active: false },
      activeKey: 'F4',
      caption: '4. Hand lands on F with an awkward stumble and delay.',
    },
  ];

  const currentConfig = mode === 'tuck' ? tuckHandConfigs[step] : jumpHandConfigs[step];

  const stepLabelsTuck = [
    '1. C Position',
    '2. Thumb Under',
    '3. Lands on F',
    '4. Smooth Flow',
  ];

  const stepLabelsJump = [
    '1. C Position',
    '2. Thumb Stuck',
    '3. Hand Leaps ⚠️',
    '4. Stumbles on F',
  ];

  const currentStepLabels = mode === 'tuck' ? stepLabelsTuck : stepLabelsJump;

  return (
    <div
      className="finger-tuck-animation-card"
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        padding: '16px 16px 14px',
        margin: '0 0 20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      {/* Mode Switcher Tabs */}
      {interactive && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setMode('tuck');
                setStep(0);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: mode === 'tuck' ? '#10b981' : '#f3f4f6',
                color: mode === 'tuck' ? '#ffffff' : '#4b5563',
                boxShadow: mode === 'tuck' ? '0 2px 6px rgba(16,185,129,0.3)' : 'none',
              }}
            >
              ✓ Correct: Thumb Tuck
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('jump');
                setStep(0);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: mode === 'jump' ? '#ef4444' : '#f3f4f6',
                color: mode === 'jump' ? '#ffffff' : '#4b5563',
                boxShadow: mode === 'jump' ? '0 2px 6px rgba(239,68,68,0.3)' : 'none',
              }}
            >
              ✗ Mistake: Hand Jump
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      )}

      {/* Main SVG Animation Canvas */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <svg
          viewBox="0 0 460 265"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label="Interactive hand animation showing thumb tuck under finger 3"
        >
          <defs>
            {/* Soft shadow for finger 3 hovering over tucked thumb */}
            <filter id="finger-shadow" x="-20%" y="-20%" width="150%" height="150%">
              <feDropShadow dx="1" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.28" />
            </filter>
            {/* Subtle shadow for keys */}
            <filter id="key-shadow" x="-5%" y="-5%" width="110%" height="115%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.12" />
            </filter>
          </defs>

          {/* Keyboard Drop Shadow Box */}
          <rect
            x={startX - 2}
            y={24}
            width={whiteKeyWidth * 8 + 4}
            height={whiteKeyHeight + 4}
            rx="5"
            fill="#e2e8f0"
          />

          {/* White Piano Keys */}
          {whiteKeys.map((k, i) => {
            const x = startX + i * whiteKeyWidth;
            const isTarget = k === 'F4';
            const isActive = currentConfig.activeKey === k;

            return (
              <g key={k}>
                <rect
                  x={x}
                  y={22}
                  width={whiteKeyWidth - 1.5}
                  height={whiteKeyHeight}
                  rx="4"
                  fill={
                    isActive
                      ? '#ffedd5'
                      : isTarget
                      ? '#ecfdf5'
                      : '#ffffff'
                  }
                  stroke={isTarget ? '#10b981' : '#cbd5e1'}
                  strokeWidth={isTarget ? '2' : '1.2'}
                />
                {/* Key Note Name */}
                <text
                  x={x + whiteKeyWidth / 2 - 0.75}
                  y={22 + whiteKeyHeight - 6}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill={isTarget ? '#059669' : '#64748b'}
                >
                  {k.replace('4', '').replace('5', '')}
                </text>
              </g>
            );
          })}

          {/* Black Piano Keys */}
          {blackKeys.map(bk => (
            <rect
              key={bk.pitch}
              x={bk.x}
              y={22}
              width={26}
              height={58}
              rx="3"
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth="1"
            />
          ))}

          {/* Top Cue: Tuck Under Path with Arrow */}
          {mode === 'tuck' && (step === 1 || step === 2) && (
            <g>
              {/* Badge on the open left side - zero collision! */}
              <rect x={12} y={124} width={92} height={22} rx={11} fill="#10b981" />
              <text x={58} y={139} textAnchor="middle" fontSize="10.5" fontWeight="bold" fill="#ffffff">
                Tuck Under ↪
              </text>
              {/* Curved guide arrow into F4 key */}
              <path
                d={`M 108 135 Q 140 145, 175 110 Q 192 95, ${keyCenters.F4} 84`}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="4 3"
              />
              <circle cx={keyCenters.F4} cy={84} r="4.5" fill="#10b981" />
            </g>
          )}

          {/* Top Cue: Hand Jump Trajectory in Jump mode Step 2 */}
          {mode === 'jump' && step === 2 && (
            <g>
              <rect x={keyCenters.E4 - 24} y={2} width={96} height={18} rx={9} fill="#ef4444" />
              <text x={keyCenters.E4 + 24} y={14.5} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ffffff">
                ⚠️ Hand Leaps!
              </text>
              <path
                d={`M ${keyCenters.E4} 75 Q ${keyCenters.E4 + 25} 12, ${keyCenters.F4} 75`}
                fill="none"
                stroke="#ef4444"
                strokeWidth="3"
                strokeDasharray="4 3"
              />
              <circle cx={keyCenters.F4} cy={75} r="4.5" fill="#ef4444" />
            </g>
          )}

          {/* Hand Silhouette */}
          <g
            style={{
              transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            {/* Forearm */}
            <path
              d={`M ${currentConfig.wrist.x - 34} 265 L ${currentConfig.wrist.x - 28} 210 L ${currentConfig.wrist.x + 28} 210 L ${currentConfig.wrist.x + 34} 265 Z`}
              fill="#fde68a"
              opacity="0.9"
            />

            {/* Palm */}
            <path
              d={`M ${currentConfig.wrist.x - 28} 210 C ${currentConfig.wrist.x - 32} 185, ${currentConfig.palm.x - 38} 156, ${currentConfig.palm.x} 150 C ${currentConfig.palm.x + 38} 156, ${currentConfig.wrist.x + 32} 185, ${currentConfig.wrist.x + 28} 210 Z`}
              fill="#fed7aa"
              stroke="#f97316"
              strokeWidth="1.5"
            />

            {/* Finger 5 (Pinky) */}
            <line
              x1={currentConfig.palm.x + 26}
              y1={currentConfig.palm.y - 4}
              x2={currentConfig.f5.x}
              y2={currentConfig.f5.y}
              stroke="#fed7aa"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Finger 4 (Ring) */}
            <line
              x1={currentConfig.palm.x + 13}
              y1={currentConfig.palm.y - 12}
              x2={currentConfig.f4.x}
              y2={currentConfig.f4.y}
              stroke="#fed7aa"
              strokeWidth="15"
              strokeLinecap="round"
            />

            {/* Finger 1 (Thumb) - Drawn BEFORE Finger 3 so Finger 3 can cover it */}
            <line
              x1={currentConfig.palm.x - 24}
              y1={currentConfig.palm.y + 12}
              x2={currentConfig.f1.x}
              y2={currentConfig.f1.y}
              stroke={currentConfig.f1.tucking ? '#f59e0b' : '#fed7aa'}
              strokeWidth={currentConfig.f1.tucking ? '17' : '18'}
              strokeLinecap="round"
            />

            {/* Finger 2 (Index) */}
            <line
              x1={currentConfig.palm.x - 13}
              y1={currentConfig.palm.y - 12}
              x2={currentConfig.f2.x}
              y2={currentConfig.f2.y}
              stroke="#fed7aa"
              strokeWidth="16"
              strokeLinecap="round"
            />

            {/* Finger 3 (Middle) - With 3D drop-shadow when thumb tucks under! */}
            <line
              x1={currentConfig.palm.x}
              y1={currentConfig.palm.y - 16}
              x2={currentConfig.f3.x}
              y2={currentConfig.f3.y}
              stroke="#fed7aa"
              strokeWidth="16"
              strokeLinecap="round"
              filter={mode === 'tuck' && (step === 1 || step === 2) ? 'url(#finger-shadow)' : undefined}
            />

            {/* Fingertip Badges with Finger Numbers 1-5 */}
            {[
              { f: currentConfig.f1, num: 1, name: 'Thumb' },
              { f: currentConfig.f2, num: 2, name: 'Index' },
              { f: currentConfig.f3, num: 3, name: 'Middle' },
              { f: currentConfig.f4, num: 4, name: 'Ring' },
              { f: currentConfig.f5, num: 5, name: 'Pinky' },
            ].map(({ f, num }) => (
              <g key={num} transform={`translate(${f.x}, ${f.y})`}>
                <circle
                  r={num === 1 ? '11' : '10'}
                  fill={
                    f.active
                      ? mode === 'tuck'
                        ? '#10b981'
                        : '#ef4444'
                      : num === 1 && mode === 'tuck' && (step === 1 || step === 2)
                      ? '#10b981'
                      : '#ea580c'
                  }
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter={num === 3 && mode === 'tuck' && (step === 1 || step === 2) ? 'url(#finger-shadow)' : undefined}
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fill="#ffffff"
                  fontSize={num === 1 ? '12' : '11'}
                  fontWeight="bold"
                >
                  {num}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Labeled Step Pills */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '6px',
          margin: '12px 0 10px',
          flexWrap: 'wrap',
        }}
      >
        {currentStepLabels.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setStep(i as 0 | 1 | 2 | 3);
              setIsPlaying(false);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.78rem',
              fontWeight: step === i ? 700 : 500,
              backgroundColor:
                step === i
                  ? mode === 'tuck'
                    ? '#10b981'
                    : '#ef4444'
                  : '#f3f4f6',
              color: step === i ? '#ffffff' : '#4b5563',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            aria-label={`Step ${i + 1}: ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Dynamic Animated Caption Banner */}
      <div
        role="status"
        style={{
          textAlign: 'center',
          fontSize: '0.94rem',
          fontWeight: 600,
          color: mode === 'tuck' ? '#065f46' : '#991b1b',
          backgroundColor: mode === 'tuck' ? '#ecfdf5' : '#fef2f2',
          padding: '8px 12px',
          borderRadius: '8px',
          border: `1px solid ${mode === 'tuck' ? '#a7f3d0' : '#fecaca'}`,
          transition: 'all 0.2s ease',
        }}
      >
        {currentConfig.caption}
      </div>
    </div>
  );
}
