import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { DiagnosticKey } from './registry';
import { useDrillAudio } from '../audio/useDrillAudio';

const RecordDot = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <circle cx="12" cy="12" r="7" fill="currentColor" />
  </svg>
);

const MorphingCheckmark = () => (
  <svg className="diagnostic-morph-check" viewBox="0 0 52 52" aria-hidden="true">
    <circle className="diagnostic-morph-check__circle" cx="26" cy="26" r="25" />
    <path className="diagnostic-morph-check__path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
  </svg>
);

export interface HandPositionDrillKey {
  id: string;
  name: string;
  tonic: string;
  hand: 'right' | 'left';
  pattern: string[];
  anchors: Array<{ pitch: string; finger: 1 | 3 | 5; label: string; isBlack: boolean }>;
  blackKeys: string[];
  tip: string;
}

const DEFAULT_CHORDS: HandPositionDrillKey[] = [
  {
    id: 'c-major',
    name: 'C Major',
    tonic: 'C',
    hand: 'right',
    pattern: ['C4', 'D4', 'E4', 'F4', 'G4'],
    anchors: [
      { pitch: 'C4', finger: 1, label: 'C4', isBlack: false },
      { pitch: 'E4', finger: 3, label: 'E4', isBlack: false },
      { pitch: 'G4', finger: 5, label: 'G4', isBlack: false },
    ],
    blackKeys: [],
    tip: 'All 5 fingers rest comfortably on white keys: C4 to G4.',
  },
  {
    id: 'g-major',
    name: 'G Major',
    tonic: 'G',
    hand: 'right',
    pattern: ['G4', 'A4', 'B4', 'C5', 'D5'],
    anchors: [
      { pitch: 'G4', finger: 1, label: 'G4', isBlack: false },
      { pitch: 'B4', finger: 3, label: 'B4', isBlack: false },
      { pitch: 'D5', finger: 5, label: 'D5', isBlack: false },
    ],
    blackKeys: [],
    tip: 'G Major position sits on white keys: G4 to D5.',
  },
  {
    id: 'd-major',
    name: 'D Major',
    tonic: 'D',
    hand: 'right',
    pattern: ['D4', 'E4', 'F#4', 'G4', 'A4'],
    anchors: [
      { pitch: 'D4', finger: 1, label: 'D4', isBlack: false },
      { pitch: 'F#4', finger: 3, label: 'F#4', isBlack: true },
      { pitch: 'A4', finger: 5, label: 'A4', isBlack: false },
    ],
    blackKeys: ['F#4'],
    tip: 'Finger 3 rests up on the black key F# (first black key of the group of 3)!',
  },
  {
    id: 'a-major',
    name: 'A Major',
    tonic: 'A',
    hand: 'right',
    pattern: ['A4', 'B4', 'C#5', 'D5', 'E5'],
    anchors: [
      { pitch: 'A4', finger: 1, label: 'A4', isBlack: false },
      { pitch: 'C#5', finger: 3, label: 'C#5', isBlack: true },
      { pitch: 'E5', finger: 5, label: 'E5', isBlack: false },
    ],
    blackKeys: ['C#5'],
    tip: 'Finger 3 rests up on the black key C# (first black key of the group of 2)!',
  },
  {
    id: 'e-major',
    name: 'E Major',
    tonic: 'E',
    hand: 'right',
    pattern: ['E4', 'F#4', 'G#4', 'A4', 'B4'],
    anchors: [
      { pitch: 'E4', finger: 1, label: 'E4', isBlack: false },
      { pitch: 'G#4', finger: 3, label: 'G#4', isBlack: true },
      { pitch: 'B4', finger: 5, label: 'B4', isBlack: false },
    ],
    blackKeys: ['F#4', 'G#4'],
    tip: 'Fingers 2 and 3 both rest up on black keys (F# and G#)!',
  },
  {
    id: 'b-minor',
    name: 'B minor',
    tonic: 'B',
    hand: 'right',
    pattern: ['B3', 'C#4', 'D4', 'E4', 'F#4'],
    anchors: [
      { pitch: 'B3', finger: 1, label: 'B3', isBlack: false },
      { pitch: 'D4', finger: 3, label: 'D4', isBlack: false },
      { pitch: 'F#4', finger: 5, label: 'F#4', isBlack: true },
    ],
    blackKeys: ['C#4', 'F#4'],
    tip: 'Pinky (finger 5) rests on black key F#, with finger 3 on white key D4!',
  },
  {
    id: 'f-major',
    name: 'F Major',
    tonic: 'F',
    hand: 'right',
    pattern: ['F4', 'G4', 'A4', 'Bb4', 'C5'],
    anchors: [
      { pitch: 'F4', finger: 1, label: 'F4', isBlack: false },
      { pitch: 'A4', finger: 3, label: 'A4', isBlack: false },
      { pitch: 'C5', finger: 5, label: 'C5', isBlack: false },
    ],
    blackKeys: ['Bb4'],
    tip: 'Anchors 1-3-5 are white keys (F-A-C), while finger 4 rests on Bb!',
  },
];

// 14 white keys spanning B3 to A5
const WHITE_KEYS = [
  'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5',
];

// Black keys with their positioning between white keys
const BLACK_KEYS: Array<{ pitch: string; betweenWhiteIdx: number; label: string }> = [
  { pitch: 'C#4', betweenWhiteIdx: 1, label: 'C#' },
  { pitch: 'D#4', betweenWhiteIdx: 2, label: 'D#' },
  { pitch: 'F#4', betweenWhiteIdx: 4, label: 'F#' },
  { pitch: 'G#4', betweenWhiteIdx: 5, label: 'G#' },
  { pitch: 'A#4', betweenWhiteIdx: 6, label: 'A#/Bb' },
  { pitch: 'C#5', betweenWhiteIdx: 8, label: 'C#' },
  { pitch: 'D#5', betweenWhiteIdx: 9, label: 'D#' },
  { pitch: 'F#5', betweenWhiteIdx: 11, label: 'F#' },
  { pitch: 'G#5', betweenWhiteIdx: 12, label: 'G#' },
];

function isKeyMatch(pitchA: string, pitchB: string): boolean {
  if (pitchA === pitchB) return true;
  const enharmonics: Record<string, string> = {
    'Bb4': 'A#4',
    'A#4': 'Bb4',
    'Db5': 'C#5',
    'C#5': 'Db5',
    'Eb4': 'D#4',
    'D#4': 'Eb4',
  };
  return enharmonics[pitchA] === pitchB;
}

export function HandPositionProveItView({
  selectedKey,
  onStandard,
}: {
  selectedKey?: DiagnosticKey;
  onStandard: () => void;
}) {
  // Build initial queue: If a specific key was passed, place it first if matching or custom
  const initialQueue = useMemo(() => {
    if (!selectedKey) return DEFAULT_CHORDS;
    const matchIdx = DEFAULT_CHORDS.findIndex(c => c.name.toLowerCase() === selectedKey.name.toLowerCase() || c.id === selectedKey.id);
    if (matchIdx > 0) {
      const match = DEFAULT_CHORDS[matchIdx];
      const rest = DEFAULT_CHORDS.filter((_, i) => i !== matchIdx);
      return [match, ...rest];
    }
    return DEFAULT_CHORDS;
  }, [selectedKey]);

  const [queue, setQueue] = useState<HandPositionDrillKey[]>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [struggledKeys, setStruggledKeys] = useState<Set<string>>(new Set());
  const [showStruggleTip, setShowStruggleTip] = useState(false);
  const [proofProgress, setProofProgress] = useState<0 | 1 | 2 | 3>(0);
  const [isListening, setIsListening] = useState(false);
  const [successCelebration, setSuccessCelebration] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [starting, setStarting] = useState(false);

  const currentKey = queue[currentIndex] || queue[0];
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStartedRef = useRef(false);

  const handleProofSuccess = useCallback(() => {
    setProofProgress(3);
    setSuccessCelebration(true);
    if (timerRef.current) clearTimeout(timerRef.current);

    setTimeout(() => {
      setSuccessCelebration(false);
      setProofProgress(0);
      setShowStruggleTip(false);
      audioStartedRef.current = false;

      if (currentIndex + 1 >= queue.length) {
        setAllDone(true);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    }, 1400);
  }, [currentIndex, queue.length]);

  const audio = useDrillAudio({
    onProofListenStart: () => {
      setIsListening(true);
    },
    onProofSuccess: () => {
      handleProofSuccess();
    },
  });

  // Keep proofProgress synced with audio when in proof mode
  useEffect(() => {
    if (audio.proofProgress > proofProgress && !successCelebration) {
      setProofProgress(audio.proofProgress);
    }
  }, [audio.proofProgress, proofProgress, successCelebration]);

  // Start microphone proof for the current key
  const startProof = useCallback(async () => {
    if (!currentKey) return;
    setStarting(true);
    setProofProgress(0);
    audioStartedRef.current = true;

    try {
      const proofNotes: [
        { pitch: string; finger: 1 | 3 | 5 },
        { pitch: string; finger: 1 | 3 | 5 },
        { pitch: string; finger: 1 | 3 | 5 }
      ] = [
        { pitch: currentKey.anchors[0].pitch, finger: currentKey.anchors[0].finger },
        { pitch: currentKey.anchors[1].pitch, finger: currentKey.anchors[1].finger },
        { pitch: currentKey.anchors[2].pitch, finger: currentKey.anchors[2].finger },
      ];

      await audio.beginProof({
        requireHeld: false,
        acceptWindowMs: 15000,
        proofNotes,
      });
    } catch {
      // Fallback if mic not available
    } finally {
      setStarting(false);
    }

    // Adaptive struggle timer: If user takes > 11 seconds on a key, surface tip & re-queue it
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStruggledKeys(prev => new Set(prev).add(currentKey.id));
      setShowStruggleTip(true);

      // Re-insert this struggled key 2 positions later in the queue (if not already done)
      setQueue(prevQueue => {
        const alreadyRequeued = prevQueue.slice(currentIndex + 1).some(k => k.id === currentKey.id);
        if (alreadyRequeued) return prevQueue;
        const insertIdx = Math.min(currentIndex + 3, prevQueue.length);
        const newQueue = [...prevQueue];
        newQueue.splice(insertIdx, 0, currentKey);
        return newQueue;
      });
    }, 11000);
  }, [audio, currentKey, currentIndex]);

  // Auto-start listening when key changes
  useEffect(() => {
    if (!allDone && currentKey) {
      void startProof();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIndex, currentKey?.id, allDone]);

  // Handle clicking anchor or keys directly (for web audit / manual interaction)
  const onKeyClick = (pitch: string) => {
    if (!currentKey || successCelebration) return;
    const targetAnchor = currentKey.anchors[proofProgress];
    if (targetAnchor && isKeyMatch(targetAnchor.pitch, pitch)) {
      const nextProgress = (proofProgress + 1) as 1 | 2 | 3;
      setProofProgress(nextProgress);
      if (nextProgress === 3) {
        handleProofSuccess();
      }
    } else {
      // Missed key: count as struggle
      setStruggledKeys(prev => new Set(prev).add(currentKey.id));
      setShowStruggleTip(true);
      setQueue(prevQueue => {
        const alreadyRequeued = prevQueue.slice(currentIndex + 1).some(k => k.id === currentKey.id);
        if (alreadyRequeued) return prevQueue;
        const insertIdx = Math.min(currentIndex + 3, prevQueue.length);
        const newQueue = [...prevQueue];
        newQueue.splice(insertIdx, 0, currentKey);
        return newQueue;
      });
    }
  };

  if (allDone) {
    return (
      <section className="diagnostic-card diagnostic-complete">
        <div className="diagnostic-morph-box" style={{ margin: '0 auto 1.5rem', display: 'flex', justifyContent: 'center' }}>
          <MorphingCheckmark />
        </div>
        <h2 className="diagnostic-prompt" style={{ textAlign: 'center' }}>
          All Hand Positions Mastered!
        </h2>
        <p className="diagnostic-complete__p" style={{ textAlign: 'center', maxWidth: '520px', margin: '0 auto 1.5rem' }}>
          You proved your physical hand position across {queue.length} chords.
          {struggledKeys.size > 0 && (
            <span> Reinforced black-key transitions on <strong>{[...struggledKeys].join(', ')}</strong>.</span>
          )}
        </p>
        <div className="diagnostic-action-area" style={{ display: 'flex', justifyContent: 'center' }}>
          <button type="button" className="et-start" onClick={onStandard}>
            <span className="et-start__dot"><RecordDot /></span>
            Return to standard curriculum
          </button>
        </div>
      </section>
    );
  }

  // Keyboard dimensions
  const whiteKeyW = 42;
  const whiteKeyH = 130;
  const blackKeyW = 26;
  const blackKeyH = 82;
  const totalSvgWidth = WHITE_KEYS.length * whiteKeyW;

  const isStruggling = struggledKeys.has(currentKey.id);

  return (
    <section className="diagnostic-card" aria-label={`Hand Position Prove-It ${currentIndex + 1} of ${queue.length}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div className="diagnostic-step-pill">
          Position {currentIndex + 1} of {queue.length} · Physical Hand Placement
        </div>
        {isStruggling && (
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef6a47', backgroundColor: 'rgba(239, 106, 71, 0.12)', padding: '2px 8px', borderRadius: '12px' }}>
            Reinforcement key
          </span>
        )}
      </div>

      <h2 className="diagnostic-prompt" style={{ marginBottom: '0.4rem' }}>
        Find <strong>{currentKey.name}</strong> Hand Position
      </h2>
      <p style={{ margin: '0 0 1rem', color: '#4b5563', fontSize: '0.95rem' }}>
        Place your right hand over <strong>{currentKey.pattern.join(' - ')}</strong>. Play fingers <strong>1 · 3 · 5</strong> on your piano to prove it!
      </p>

      {/* Sheet-music-free Piano Keyboard SVG (inside .diagnostic-score for audit compliance and zero overflow) */}
      <div
        className="diagnostic-score diagnostic-score--keyboard"
        aria-label={`${currentKey.name} piano keyboard hand position`}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '12px 8px',
          background: '#fafaf9',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          marginBottom: '24px',
        }}
      >
        <svg
          viewBox={`0 0 ${totalSvgWidth} ${whiteKeyH}`}
          style={{ width: '100%', maxWidth: `${totalSvgWidth}px`, height: 'auto', maxHeight: '135px', display: 'block' }}
          role="img"
          aria-label="Piano keyboard showing hand position"
        >
          {/* White keys */}
          {WHITE_KEYS.map((pitch, idx) => {
            const isPatternKey = currentKey.pattern.includes(pitch);
            const anchor = currentKey.anchors.find(a => a.pitch === pitch);
            const anchorIdx = anchor ? currentKey.anchors.indexOf(anchor) : -1;
            const isHeard = anchorIdx >= 0 && proofProgress > anchorIdx;

            return (
              <g key={pitch} onClick={() => onKeyClick(pitch)} style={{ cursor: 'pointer' }}>
                <rect
                  x={idx * whiteKeyW}
                  y={0}
                  width={whiteKeyW}
                  height={whiteKeyH}
                  fill={isHeard ? '#dcfce7' : isPatternKey ? 'rgba(239, 106, 71, 0.15)' : '#ffffff'}
                  stroke="#242237"
                  strokeWidth="1.5"
                  rx="3"
                  ry="3"
                />
                {/* Note name at bottom */}
                <text
                  x={idx * whiteKeyW + whiteKeyW / 2}
                  y={whiteKeyH - 10}
                  textAnchor="middle"
                  fill="#4b5563"
                  fontSize="11"
                  fontWeight="600"
                >
                  {pitch.replace(/\d/, '')}
                </text>
                {/* Anchor finger badge */}
                {anchor && (
                  <g transform={`translate(${idx * whiteKeyW + whiteKeyW / 2}, ${whiteKeyH - 32})`}>
                    <circle
                      r="12"
                      fill={isHeard ? '#10b981' : '#ef6a47'}
                    />
                    <text
                      textAnchor="middle"
                      dy="4"
                      fill="#ffffff"
                      fontSize="12"
                      fontWeight="bold"
                    >
                      {isHeard ? '✓' : anchor.finger}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Black keys */}
          {BLACK_KEYS.map(({ pitch, betweenWhiteIdx }) => {
            const isPatternKey = currentKey.pattern.some(p => isKeyMatch(p, pitch));
            const anchor = currentKey.anchors.find(a => isKeyMatch(a.pitch, pitch));
            const anchorIdx = anchor ? currentKey.anchors.indexOf(anchor) : -1;
            const isHeard = anchorIdx >= 0 && proofProgress > anchorIdx;
            const bx = (betweenWhiteIdx + 1) * whiteKeyW - blackKeyW / 2;

            return (
              <g key={pitch} onClick={() => onKeyClick(pitch)} style={{ cursor: 'pointer' }}>
                <rect
                  x={bx}
                  y={0}
                  width={blackKeyW}
                  height={blackKeyH}
                  fill={isHeard ? '#15803d' : isPatternKey ? '#9a3412' : '#242237'}
                  stroke="#111827"
                  strokeWidth="1"
                  rx="2"
                  ry="2"
                />
                {anchor && (
                  <g transform={`translate(${bx + blackKeyW / 2}, ${blackKeyH - 18})`}>
                    <circle
                      r="10"
                      fill={isHeard ? '#10b981' : '#ef6a47'}
                    />
                    <text
                      textAnchor="middle"
                      dy="3.5"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      {isHeard ? '✓' : anchor.finger}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Live Anchor Target Progress Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        {currentKey.anchors.map((anchor, i) => {
          const isDone = proofProgress > i;
          const isCurrentTarget = proofProgress === i;

          return (
            <div
              key={anchor.pitch}
              style={{
                padding: '12px 10px',
                borderRadius: '10px',
                border: isDone ? '2px solid #10b981' : isCurrentTarget ? '2px solid #ef6a47' : '1px solid #e5e7eb',
                backgroundColor: isDone ? '#f0fdf4' : isCurrentTarget ? 'rgba(239, 106, 71, 0.06)' : '#ffffff',
                textAlign: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                Finger {anchor.finger}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: isDone ? '#10b981' : '#1f2937', margin: '2px 0' }}>
                {anchor.label}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: anchor.isBlack ? '#ea580c' : '#6b7280' }}>
                {anchor.isBlack ? '● Black Key' : '○ White Key'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Adaptive Struggle Clue Card */}
      {showStruggleTip && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#fff7ed',
            border: '1px solid #fdba74',
            color: '#9a3412',
            fontSize: '0.9rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>💡</span>
          <div>
            <strong>Position Clue:</strong> {currentKey.tip}
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successCelebration && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            fontSize: '1rem',
            fontWeight: 600,
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          ✓ {currentKey.name} Hand Position Locked!
        </div>
      )}

      {/* Action Area with button.et-start satisfying >= 20px gap */}
      <div className="diagnostic-action-area" style={{ marginTop: '20px' }}>
        <button
          type="button"
          className="et-start"
          disabled={starting || successCelebration}
          onClick={() => { void startProof(); }}
        >
          <span className="et-start__dot"><RecordDot /></span>
          {starting ? 'Starting microphone…' : isListening ? `Listening for Finger ${currentKey.anchors[proofProgress]?.finger ?? 1} (${currentKey.anchors[proofProgress]?.label ?? ''})…` : 'Restart Position Proof'}
        </button>
      </div>
    </section>
  );
}
