import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TOTAL_CONCEPTS, getConcept } from '../curriculum/curriculum';

/**
 * DEV-ONLY lesson jumper.
 *
 * Lets you jump forward/backward through all TOTAL_CONCEPTS lessons without
 * playing a real piano and without passing a "Prove It" mic gate — for
 * manually exercising every lesson during development.
 *
 * Why this exists / how it stays out of the way of real students:
 *  - Enabled only when `import.meta.env.DEV` (i.e. `npm run dev`, never a
 *    production `vite build`) OR a `eartrain.dev-lesson-jump.v1` localStorage
 *    flag is set to '1'. A deployed build never shows this by accident —
 *    someone would have to open devtools and flip the flag on purpose.
 *  - The control renders through a React portal straight into `document.body`,
 *    completely outside ExerciseLayout's DOM subtree. `overflow: hidden` (or
 *    any other clipping/stacking-context rule) on an ancestor can only ever
 *    clip its own descendants — a portalled node isn't one, so no CSS in
 *    ExerciseLayout or exercise.css can hide or clip it, no matter how deeply
 *    nested those rules are.
 *  - Every jump forces PathwayRouter to fully unmount and remount (via the
 *    `key` prop passed from App.tsx). That's what actually guarantees a clean
 *    reset: React runs every effect's cleanup on unmount, which includes
 *    useDrillAudio's teardown effect (closes the AudioContext, stops mic
 *    tracks, disconnects the worklet, drops its message handler) before the
 *    new lesson's PathwayRouter instance mounts fresh. There is no
 *    hand-rolled "reset state" call to keep in sync with the reducer — the
 *    remount *is* the reset.
 *  - `initialProofCompleted: true` is threaded through so a jumped-to
 *    "prove-it" lesson opens straight on the normal prompt screen instead of
 *    gating on the position-proof mic check.
 */



function isEnabled(): boolean {
  return true;
}

function clampLesson(lesson: number): number {
  return Math.min(TOTAL_CONCEPTS, Math.max(1, Math.round(lesson)));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export interface DevLessonJumperRenderProps {
  initialLesson: number;
  initialProofCompleted: boolean;
  /** Pass straight through as PathwayRouter's `key`. */
  remountKey: string;
}

export interface DevLessonJumperProps {
  baseInitialLesson: number;
  children: (props: DevLessonJumperRenderProps) => ReactNode;
}

/**
 * Passthrough with zero footprint when disabled. When enabled, owns a local
 * "which lesson am I forcing" override and renders the floating controls
 * via a portal.
 */
export function DevLessonJumper({ baseInitialLesson, children }: DevLessonJumperProps) {
  const [enabled] = useState(isEnabled);
  const [lesson, setLesson] = useState(() => clampLesson(baseInitialLesson));
  const [jumpSeq, setJumpSeq] = useState(0);

  const jump = useCallback((delta: number) => {
    setLesson((prev) => clampLesson(prev + delta));
    // Bump unconditionally, even at a boundary where the lesson number
    // doesn't change — a jump is still a request for a guaranteed reset.
    setJumpSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === '[') {
        event.preventDefault();
        jump(-1);
      } else if (event.key === ']') {
        event.preventDefault();
        jump(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, jump]);

  if (!enabled) {
    // Stable key: PathwayRouter must NOT remount on every render for real
    // students, only ever on an explicit dev jump.
    return <>{children({ initialLesson: baseInitialLesson, initialProofCompleted: false, remountKey: 'live' })}</>;
  }

  const concept = getConcept(lesson);
  const panel = (
    <div style={panelStyle} role="region" aria-label="Dev lesson jumper">
      <button
        type="button"
        onClick={() => jump(-1)}
        disabled={lesson <= 1}
        style={buttonStyle}
        aria-label="Jump to previous lesson"
      >
        ‹ [
      </button>
      <div style={labelStyle}>
        <strong style={{ fontSize: 15 }}>DEV — Lesson {lesson}/{TOTAL_CONCEPTS}</strong>
        <span style={{ fontSize: 12, opacity: 0.85 }}>{concept.title}</span>
        <span style={{ fontSize: 11, opacity: 0.65 }}>[ / ] to jump · Prove It skipped</span>
      </div>
      <button
        type="button"
        onClick={() => jump(1)}
        disabled={lesson >= TOTAL_CONCEPTS}
        style={buttonStyle}
        aria-label="Jump to next lesson"
      >
        ] ›
      </button>
    </div>
  );

  return (
    <>
      {children({
        initialLesson: lesson,
        initialProofCompleted: true,
        remountKey: `dev-${lesson}-${jumpSeq}`,
      })}
      {createPortal(panel, document.body)}
    </>
  );
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 16,
  transform: 'translateX(-50%)',
  zIndex: 2147483647,
  display: 'flex',
  alignItems: 'stretch',
  gap: 10,
  padding: '10px 14px',
  background: '#111',
  color: '#fff',
  borderRadius: 14,
  boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
  border: '2px solid #f97316',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const buttonStyle: CSSProperties = {
  minWidth: 64,
  fontSize: 22,
  fontWeight: 800,
  color: '#111',
  background: '#f97316',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  padding: '4px 14px',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  minWidth: 220,
  textAlign: 'center',
  gap: 2,
};

export default DevLessonJumper;
