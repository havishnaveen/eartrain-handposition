import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { DiagnosticKey } from './registry';
import { useDrillAudio } from '../audio/useDrillAudio';
import StaffCue from '../components/StaffCue';
import type { CueSpec } from '../curriculum/types';

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
    tip: 'All 5 fingers rest on white keys (C4–G4).',
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
    tip: 'All 5 fingers rest on white keys (G4–D5).',
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
    tip: 'Finger 3 on black key F#; 1 and 5 on D and A.',
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
    tip: 'Finger 3 on black key C#; 1 and 5 on A and E.',
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
    tip: 'Fingers 2 (F#) and 3 (G#) on black keys; 1 and 5 on E and B.',
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
    tip: 'Finger 5 on black key F#; 1 on B3 and 3 on D4.',
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
    tip: 'Anchors 1-3-5 on white keys (F4-A4-C5); finger 4 on Bb.',
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

function proofPitchToStaffKey(pitch: string): string {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(pitch);
  return match ? `${match[1].toLowerCase()}${match[2]}/${match[3]}` : 'c/4';
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
  const [showPiano, setShowPiano] = useState(
    typeof window !== 'undefined' && window.location.search.includes('showpiano')
  );
  const [hasStarted, setHasStarted] = useState(false);
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
      setShowPiano(false);
      setHasStarted(false);
      setIsListening(false);
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

    // Adaptive struggle timer: If user takes > 10 seconds on a key, show keyboard guide and re-queue
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowPiano(true);
      setStruggledKeys(prev => new Set(prev).add(currentKey.id));

      // Re-insert this struggled key 2 positions later in the queue (if not already done)
      setQueue(prevQueue => {
        const alreadyRequeued = prevQueue.slice(currentIndex + 1).some(k => k.id === currentKey.id);
        if (alreadyRequeued) return prevQueue;
        const insertIdx = Math.min(currentIndex + 3, prevQueue.length);
        const newQueue = [...prevQueue];
        newQueue.splice(insertIdx, 0, currentKey);
        return newQueue;
      });
    }, 10000);
  }, [audio, currentKey, currentIndex]);

  // Reset proof state and timer when key changes (do NOT auto-start listening; wait for Start button)
  useEffect(() => {
    setHasStarted(false);
    setShowPiano(typeof window !== 'undefined' && window.location.search.includes('showpiano'));
    setProofProgress(0);
    setIsListening(false);
    audioStartedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIndex, currentKey?.id]);

  const currentCue: CueSpec = useMemo(() => ({
    showTimeSignature: false,
    timeSignature: '3/4',
    staves: [{
      clef: currentKey.hand === 'left' ? 'bass' : 'treble',
      hand: currentKey.hand,
      notes: currentKey.anchors.map((anchor, idx) => ({
        keys: [proofPitchToStaffKey(anchor.pitch)],
        duration: 'q',
        finger: anchor.finger,
        anchor: proofProgress === idx,
      })),
    }],
  }), [currentKey, proofProgress]);

  const successPitches = useMemo(() => {
    if (proofProgress === 0) return [];
    return currentKey.anchors.slice(0, proofProgress).map(a => a.pitch);
  }, [currentKey, proofProgress]);

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
      // Missed key: count as struggle and reveal piano guide
      setShowPiano(true);
      setStruggledKeys(prev => new Set(prev).add(currentKey.id));
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

  return (
    <section className="diagnostic-card" aria-label={`Hand Position Prove-It ${currentIndex + 1} of ${queue.length}`}>
      <h2 className="diagnostic-prompt" style={{ marginBottom: '0.35rem', textAlign: 'center' }}>
        {currentKey.name} Hand Position
      </h2>
      <p style={{ margin: '0 0 1.25rem', color: '#4b5563', fontSize: '1.05rem', textAlign: 'center' }}>
        Play fingers <strong>1, 3, 5</strong> on your piano.
      </p>

      {/* Sheet Music Score - always displayed */}
      <div
        className="diagnostic-score"
        aria-label={`${currentKey.name} sheet music`}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '140px',
          padding: '12px 16px',
          background: '#fafaf9',
          borderRadius: '14px',
          border: '1.5px solid #e7e5e4',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        <StaffCue
          cue={currentCue}
          notationScale={2.2}
          compact
          accentColor="#ea580c"
          inkColor="#242237"
          successColor="#16a34a"
          successPitches={successPitches}
          highlightNoteIndex={proofProgress < currentKey.anchors.length ? proofProgress : undefined}
        />
      </div>

      {/* Piano Keyboard Guide (shown only after 10s struggle or key miss) */}
      {showPiano && (
        <div
          className="diagnostic-keyboard-guide"
          aria-label={`${currentKey.name} piano keyboard hand position`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '14px 8px',
            background: '#fafaf9',
            borderRadius: '14px',
            border: '1.5px solid #fed7aa',
            marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(234, 88, 12, 0.08)',
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
              const isTarget = anchorIdx >= 0 && proofProgress === anchorIdx;

              let keyFill = '#ffffff';
              let keyStroke = '#242237';
              let strokeW = 1.5;

              if (isHeard) {
                keyFill = '#dcfce7';
                keyStroke = '#16a34a';
                strokeW = 2;
              } else if (isTarget) {
                keyFill = '#ffedd5';
                keyStroke = '#ea580c';
                strokeW = 2.5;
              } else if (anchor) {
                keyFill = '#fff7ed';
                keyStroke = '#fdba74';
                strokeW = 1.5;
              } else if (isPatternKey) {
                keyFill = '#f8fafc';
                keyStroke = '#cbd5e1';
              }

              return (
                <g key={pitch} onClick={() => onKeyClick(pitch)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={idx * whiteKeyW}
                    y={0}
                    width={whiteKeyW}
                    height={whiteKeyH}
                    fill={keyFill}
                    stroke={keyStroke}
                    strokeWidth={strokeW}
                    rx="3"
                    ry="3"
                  />
                  {/* Note name at bottom */}
                  <text
                    x={idx * whiteKeyW + whiteKeyW / 2}
                    y={whiteKeyH - 10}
                    textAnchor="middle"
                    fill={isTarget ? '#ea580c' : isHeard ? '#16a34a' : isPatternKey ? '#1e293b' : '#94a3b8'}
                    fontSize={isTarget ? '12' : '11'}
                    fontWeight={isTarget || isHeard ? 'bold' : '600'}
                  >
                    {pitch.replace(/\d/, '')}
                  </text>
                  {/* Anchor finger badge */}
                  {anchor && (
                    <g transform={`translate(${idx * whiteKeyW + whiteKeyW / 2}, ${whiteKeyH - 34})`}>
                      {isTarget && (
                        <circle
                          r="16"
                          fill="none"
                          stroke="#ea580c"
                          strokeWidth="2"
                          strokeDasharray="3 2"
                          opacity="0.8"
                        />
                      )}
                      <circle
                        r={isTarget ? 13 : 11}
                        fill={isHeard ? '#16a34a' : isTarget ? '#ea580c' : '#fdba74'}
                        stroke={isTarget ? '#ffffff' : 'none'}
                        strokeWidth={isTarget ? 2 : 0}
                      />
                      <text
                        textAnchor="middle"
                        dy={isTarget ? 4.5 : 4}
                        fill="#ffffff"
                        fontSize={isTarget ? 12 : 11}
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
              const isTarget = anchorIdx >= 0 && proofProgress === anchorIdx;
              const bx = (betweenWhiteIdx + 1) * whiteKeyW - blackKeyW / 2;

              let keyFill = '#1e293b';
              let keyStroke = '#0f172a';
              let strokeW = 1;

              if (isHeard) {
                keyFill = '#15803d';
                keyStroke = '#86efac';
                strokeW = 2;
              } else if (isTarget) {
                keyFill = '#ea580c';
                keyStroke = '#ffffff';
                strokeW = 2;
              } else if (anchor) {
                keyFill = '#7c2d12';
                keyStroke = '#ea580c';
                strokeW = 1.5;
              } else if (isPatternKey) {
                keyFill = '#334155';
                keyStroke = '#475569';
              }

              return (
                <g key={pitch} onClick={() => onKeyClick(pitch)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={bx}
                    y={0}
                    width={blackKeyW}
                    height={blackKeyH}
                    fill={keyFill}
                    stroke={keyStroke}
                    strokeWidth={strokeW}
                    rx="3"
                    ry="3"
                  />
                  {anchor && (
                    <g transform={`translate(${bx + blackKeyW / 2}, ${blackKeyH - 18})`}>
                      {isTarget && (
                        <circle
                          r="13"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="2"
                          strokeDasharray="2 2"
                          opacity="0.9"
                        />
                      )}
                      <circle
                        r={isTarget ? 10 : 9}
                        fill={isHeard ? '#22c55e' : isTarget ? '#ffffff' : '#ea580c'}
                      />
                      <text
                        textAnchor="middle"
                        dy={3.5}
                        fill={isTarget ? '#ea580c' : '#ffffff'}
                        fontSize={isTarget ? 11 : 10}
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
      )}

      {/* Clean Anchor Target Progress Pills */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {currentKey.anchors.map((anchor, i) => {
          const isDone = proofProgress > i;
          const isCurrentTarget = proofProgress === i;

          return (
            <div
              key={anchor.pitch}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '999px',
                border: isDone ? '2px solid #22c55e' : isCurrentTarget ? '2px solid #ef6a47' : '1px solid #e5e7eb',
                backgroundColor: isDone ? '#f0fdf4' : isCurrentTarget ? '#fff7ed' : '#ffffff',
                color: isDone ? '#15803d' : isCurrentTarget ? '#c2410c' : '#4b5563',
                fontWeight: isCurrentTarget || isDone ? 700 : 500,
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
              }}
            >
              <span
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  backgroundColor: isDone ? '#22c55e' : isCurrentTarget ? '#ef6a47' : '#e5e7eb',
                  color: isDone || isCurrentTarget ? '#ffffff' : '#6b7280',
                }}
              >
                {isDone ? '✓' : anchor.finger}
              </span>
              <span>{anchor.label}</span>
            </div>
          );
        })}
      </div>

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
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          {currentKey.name} Hand Position Locked!
        </div>
      )}

      {/* Action Area with button.et-start satisfying >= 20px gap */}
      <div className="diagnostic-action-area" style={{ marginTop: '20px' }}>
        <button
          type="button"
          className="et-start"
          disabled={starting || successCelebration}
          onClick={() => {
            if (!hasStarted) {
              setHasStarted(true);
            }
            void startProof();
          }}
        >
          <span className="et-start__dot"><RecordDot /></span>
          {!hasStarted
            ? 'Start'
            : starting
            ? 'Starting microphone…'
            : isListening
            ? 'Listening for piano…'
            : 'Restart Microphone'}
        </button>
      </div>
    </section>
  );
}
