import { useState, useRef, useEffect } from 'react';

interface FingerTuckVideoGuideProps {
  initialMode?: 'correct' | 'wrong';
  compact?: boolean;
}

export function FingerTuckVideoGuide({
  initialMode = 'correct',
  compact = false,
}: FingerTuckVideoGuideProps) {
  const [mode, setMode] = useState<'correct' | 'wrong'>(initialMode);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc =
    mode === 'correct'
      ? '/videos/finger-tuck-correct.mp4'
      : '/videos/finger-tuck-wrong-jump.mp4';

  const posterSrc =
    mode === 'correct'
      ? '/videos/finger-tuck-correct.webp'
      : '/videos/finger-tuck-wrong-jump.webp';

  const hasSwitchedMode = useRef(false);

  useEffect(() => {
    if (hasSwitchedMode.current && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {
        // Auto-play policies may prevent playback if unmuted
      });
    }
    hasSwitchedMode.current = true;
  }, [mode]);

  return (
    <div
      className="diagnostic-video-guide"
      style={{
        width: '100%',
        maxWidth: compact ? '460px' : '540px',
        margin: '12px auto 16px',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1.5px solid #e2e8f0',
        backgroundColor: '#0f172a',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        boxSizing: 'border-box',
      }}
    >
      {/* Mode Selector Tabs */}
      <div
        style={{
          display: 'flex',
          backgroundColor: '#1e293b',
          padding: '6px',
          gap: '6px',
          borderBottom: '1px solid #334155',
        }}
      >
        <button
          type="button"
          onClick={() => setMode('correct')}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: mode === 'correct' ? '#10b981' : 'transparent',
            color: mode === 'correct' ? '#ffffff' : '#94a3b8',
            transition: 'all 0.18s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          aria-pressed={mode === 'correct'}
        >
          <span>✓ Thumb Glides Under</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('wrong')}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: mode === 'wrong' ? '#ef4444' : 'transparent',
            color: mode === 'wrong' ? '#ffffff' : '#94a3b8',
            transition: 'all 0.18s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          aria-pressed={mode === 'wrong'}
        >
          <span>⚠️ Hand Jumps (Mistake)</span>
        </button>
      </div>

      {/* Video Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1280 / 560',
          backgroundColor: '#000000',
        }}
      >
        <video
          ref={videoRef}
          key={videoSrc}
          src={videoSrc}
          poster={posterSrc}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          controls
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* Audio Mute/Unmute Quick Toggle */}
        <button
          type="button"
          onClick={() => setIsMuted(prev => !prev)}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '4px 8px',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: 'pointer',
            zIndex: 2,
            transition: 'all 0.15s ease',
          }}
          title={isMuted ? 'Click to unmute piano sound' : 'Click to mute'}
        >
          {isMuted ? '🔇 Muted' : '🔊 Sound On'}
        </button>
      </div>

      {/* Caption Banner */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: mode === 'correct' ? '#064e3b' : '#7f1d1d',
          color: '#ffffff',
          fontSize: '0.85rem',
          fontWeight: 600,
          textAlign: 'center',
          lineHeight: 1.4,
          transition: 'background-color 0.2s ease',
        }}
        role="status"
      >
        {mode === 'correct'
          ? '✓ Thumb glides smoothly under finger 3 — tempo stays unbroken.'
          : '⚠️ Hand leaps across the keys — causes hesitation and pause at note 4.'}
      </div>
    </div>
  );
}
