import { useEffect, useState } from 'react';
import { DIAGNOSTIC_KEYS } from '../diagnostics/registry';
import type { DiagnosticStage } from '../diagnostics/registry';
import { BATCH_COUNT } from '../stations/generator';
import type { PracticeMode, StationNeed } from '../stations/types';
import { MiniLessonVisualProgress } from '../diagnostics/MiniLessonVisualProgress';

export interface DiagnosticSelection {
  problem: string;
  key: string;
  stage: DiagnosticStage;
  revision: number;
  practiceMode?: PracticeMode;
  stationNeed?: StationNeed;
  batch?: number;
}

export const MINI_LESSONS = [
  { id: 'key-signature', label: 'Key Signatures' },
  { id: 'clef-transposition', label: 'Clef Confusion' },
  { id: 'mid-line-clef-change', label: 'Clef Changes' },
  { id: 'accidental-carryover', label: 'Accidental Carryover' },
  { id: 'octave-displacement', label: 'Register Reading' },
  { id: 'hand-position', label: 'Finger-to-Note Reading' },
  { id: 'cross-over-under', label: 'Crossing Continuity' },
] as const;

export default function DiagnosticNavigator({
  selection,
  onSelect,
  onStandard,
  onJumpStandard,
  currentLesson = 1,
  currentQuestion = 1,
}: {
  selection: DiagnosticSelection | null;
  onSelect: (selection: DiagnosticSelection) => void;
  onStandard: () => void;
  onJumpStandard?: (lesson: number, drill: number, noProof: boolean) => void;
  currentLesson?: number;
  currentQuestion?: number;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'standard'>(selection ? 'diagnostics' : 'standard');
  const [targetLesson, setTargetLesson] = useState(currentLesson);
  const [targetDrill, setTargetDrill] = useState(currentQuestion);
  const [skipProof, setSkipProof] = useState(true);

  useEffect(() => {
    if (selection) setActiveTab('diagnostics');
  }, [selection]);

  const currentProblemId = selection?.problem === 'clef-change'
    ? 'mid-line-clef-change'
    : (selection?.problem ?? MINI_LESSONS[0].id);

  const selectedProblem = MINI_LESSONS.find(p => p.id === currentProblemId) ?? MINI_LESSONS[0];
  const selectedKey = DIAGNOSTIC_KEYS.find(k => k.id === selection?.key) ?? DIAGNOSTIC_KEYS[0];
  const isClefConfusion = selectedProblem.id === 'clef-transposition' && selection?.practiceMode === 'exhaustive';
  const currentBatch = Math.min(BATCH_COUNT, Math.max(1, selection?.batch ?? 1));
  const currentStage = (selection?.stage && selection.stage >= 1 && selection.stage <= 4) ? selection.stage : 1;

  const select = (problemId: string, keyId: string, unitNum?: number, practiceMode?: PracticeMode) => {
    setActiveTab('diagnostics');
    const mode = practiceMode ?? (problemId !== selection?.problem ? 'station' : selection?.practiceMode ?? 'station');
    const isClef = problemId === 'clef-transposition' && mode === 'exhaustive';
    onSelect({
      problem: problemId,
      key: keyId,
      stage: isClef ? ((unitNum as DiagnosticStage) ?? 1) : 1,
      batch: !isClef ? (unitNum ?? selection?.batch ?? 1) : 1,
      practiceMode: mode,
      stationNeed: selection?.stationNeed ?? 'adaptive',
      revision: (selection?.revision ?? 0) + 1,
    });
  };

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          target.closest('input,select,textarea,button,[contenteditable="true"]'))
      )
        return;

      if (event.key === 'Escape') {
        setOpen(false);
      } else if (selection && ['1', '2', '3', '4', '5', '6'].includes(event.key)) {
        event.preventDefault();
        select(selectedProblem.id, selectedKey.id, Number(event.key));
      } else if (selection && (event.key === '[' || event.key === ']')) {
        event.preventDefault();
        const delta = event.key === '[' ? -1 : 1;
        const index = MINI_LESSONS.findIndex(m => m.id === selectedProblem.id);
        const nextProblem = MINI_LESSONS[(index + delta + MINI_LESSONS.length) % MINI_LESSONS.length];
        select(nextProblem.id, selectedKey.id, 1);
      } else if (!selection && (event.key === '[' || event.key === ']')) {
        event.preventDefault();
        const delta = event.key === '[' ? -1 : 1;
        const nextLesson = Math.min(24, Math.max(1, currentLesson + delta));
        if (onJumpStandard) {
          onJumpStandard(nextLesson, 1, true);
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  const majorKeys = DIAGNOSTIC_KEYS.filter(k => !k.minor);
  const minorKeys = DIAGNOSTIC_KEYS.filter(k => k.minor);

  return (
    <aside className="diagnostic-navigator" aria-label="Teacher Lesson Hopper">
      <button
        type="button"
        className="diagnostic-navigator-toggle hopper-toggle-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="hopper-controls"
      >
        <span className="diagnostic-navigator-toggle__badge">{open ? '✕' : '🧭'}</span>
        <span className="diagnostic-navigator-toggle__label">Lesson Hopper</span>
        {!open && (
          <span className="diagnostic-navigator-toggle__info">
            {selection ? `${selectedProblem.label.split(' ')[0]} · ${isClefConfusion ? `S${currentStage}` : `B${currentBatch}`}` : `L${currentLesson}`}
          </span>
        )}
      </button>

      {open && (
        <div id="hopper-controls" className="diagnostic-navigator__panel">
          <div className="diagnostic-navigator__header">
            <div className="hopper-title-wrap">
              <strong>Lesson Hopper</strong>
              <span className="hopper-badge">Teacher Access</span>
            </div>
            <div className="diagnostic-navigator__mode-tabs">
              <button
                type="button"
                className={`diagnostic-tab ${activeTab === 'diagnostics' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('diagnostics')}
              >
                Mini Lessons ({MINI_LESSONS.length})
              </button>
              <button
                type="button"
                className={`diagnostic-tab ${activeTab === 'standard' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('standard')}
              >
                Standard Curriculum (1–24)
              </button>
            </div>
            <button
              type="button"
              className="diagnostic-close"
              onClick={() => setOpen(false)}
              aria-label="Close hopper"
            >
              ✕
            </button>
          </div>

          {activeTab === 'diagnostics' ? (
            <div className="diagnostic-navigator__body">
              {/* Mini Lesson Topic Selector */}
              <div className="diagnostic-section">
                <span className="diagnostic-section-title">Mini Lesson ({MINI_LESSONS.length})</span>
                <label className="diagnostic-select-wrap">
                  <select
                    value={selectedProblem.id}
                    onChange={e => select(e.target.value, selectedKey.id, 1)}
                  >
                    {MINI_LESSONS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="diagnostic-pill-chips">
                  {MINI_LESSONS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`diagnostic-chip ${selectedProblem.id === p.id && selection ? 'is-active' : ''}`}
                      onClick={() => select(p.id, selectedKey.id, 1)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clef Confusion specific view: 3 stages */}
              {isClefConfusion ? (
                <>
                  <button className="diagnostic-jump-btn" onClick={() => select(selectedProblem.id, selectedKey.id, 1, 'station')}>3-Question Batches</button>
                  <div className="diagnostic-section">
                    <span className="diagnostic-section-title">Clef Confusion Exercise Stages (3 Stages)</span>
                    <div className="diagnostic-jumps">
                      {[
                        { stage: 1, label: 'Stage 1: Clef Sound Check' },
                        { stage: 2, label: 'Stage 2: Clef Rule Check' },
                        { stage: 3, label: 'Stage 3: Clef Swap Playthrough' },
                      ].map(s => (
                        <button
                          key={s.stage}
                          type="button"
                          className={`diagnostic-jump-btn ${currentStage === s.stage ? 'is-active' : ''}`}
                          onClick={() => select('clef-transposition', selectedKey.id, s.stage)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="diagnostic-section">
                    <MiniLessonVisualProgress
                      topicId="clef-transposition"
                      topicLabel="Clef Confusion"
                      currentBatch={currentStage}
                      onSelectBatch={s => select('clef-transposition', selectedKey.id, s)}
                    />
                  </div>
                </>
              ) : (
                /* Station mini lessons: 3-question batches vs All Lessons */
                <>
                  <div className="diagnostic-section">
                    <span className="diagnostic-section-title">Practice Mode</span>
                    <div className="diagnostic-practice-mode-tabs" role="tablist" aria-label="Practice mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selection?.practiceMode !== 'exhaustive'}
                        className={`diagnostic-tab ${selection?.practiceMode !== 'exhaustive' ? 'is-active' : ''}`}
                        onClick={() => select(selectedProblem.id, selectedKey.id, currentBatch, 'station')}
                      >
                        3-Question Batches
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selection?.practiceMode === 'exhaustive'}
                        className={`diagnostic-tab ${selection?.practiceMode === 'exhaustive' ? 'is-active' : ''}`}
                        onClick={() => select(selectedProblem.id, selectedKey.id, currentBatch, 'exhaustive')}
                      >
                        All Lessons
                      </button>
                    </div>
                  </div>

                  {/* When 3-Question Batches mode: fast batch selector */}
                  {selection?.practiceMode !== 'exhaustive' && (
                    <div className="diagnostic-section">
                      <span className="diagnostic-section-title">Choose Batch ({BATCH_COUNT} Batches)</span>
                      <label className="diagnostic-select-wrap">
                        <select
                          aria-label="Batch"
                          value={currentBatch}
                          onChange={e => select(selectedProblem.id, selectedKey.id, Number(e.target.value), 'station')}
                        >
                          {Array.from({ length: BATCH_COUNT }, (_, i) => (
                            <option key={i} value={i + 1}>Batch {i + 1} of {BATCH_COUNT}</option>
                          ))}
                        </select>
                      </label>
                      <div className="diagnostic-jumps">
                        {Array.from({ length: BATCH_COUNT }, (_, i) => {
                          const bNum = i + 1;
                          const isActive = selection !== null && currentBatch === bNum;
                          return (
                            <button
                              key={bNum}
                              type="button"
                              className={`diagnostic-jump-btn ${isActive ? 'is-active' : ''}`}
                              onClick={() => select(selectedProblem.id, selectedKey.id, bNum, 'station')}
                            >
                              Batch {bNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Musical Key Selection */}
                  <div className="diagnostic-section">
                    <span className="diagnostic-section-title">Musical Key (24 keys)</span>
                    <label className="diagnostic-select-wrap">
                      <select
                        value={selectedKey.id}
                        onChange={e => select(selectedProblem.id, e.target.value, currentBatch)}
                      >
                        <optgroup label="Major Keys (12)">
                          {majorKeys.map(k => (
                            <option key={k.id} value={k.id}>
                              {k.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Minor Keys (12)">
                          {minorKeys.map(k => (
                            <option key={k.id} value={k.id}>
                              {k.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>
                  </div>

                  {/* For All Lessons mode: visual roadmap image at the bottom showing the 6 batches */}
                  {selection?.practiceMode === 'exhaustive' && (
                    <div className="diagnostic-section">
                      <span className="diagnostic-section-title">
                        All Lessons Sequence ({BATCH_COUNT} Batches · 18 Questions)
                      </span>
                      <MiniLessonVisualProgress
                        topicId={selectedProblem.id}
                        fixedBatches
                        topicLabel={selectedProblem.label}
                        currentBatch={currentBatch}
                        onSelectBatch={b => select(selectedProblem.id, selectedKey.id, b, 'exhaustive')}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="diagnostic-actions-row">
                <button
                  type="button"
                  className="diagnostic-btn-return"
                  onClick={onStandard}
                >
                  Return to Standard Curriculum
                </button>
              </div>
            </div>
          ) : (
            <div className="diagnostic-navigator__body">
              <div className="diagnostic-section">
                <span className="diagnostic-section-title">Standard Curriculum Lesson (1–24)</span>
                <div className="diagnostic-standard-grid">
                  <label>
                    Lesson:
                    <select
                      value={targetLesson}
                      onChange={e => setTargetLesson(Number(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Lesson {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Drill:
                    <select
                      value={targetDrill}
                      onChange={e => setTargetDrill(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map(d => (
                        <option key={d} value={d}>
                          Drill {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="diagnostic-checkbox-label">
                    <input
                      type="checkbox"
                      checked={skipProof}
                      onChange={e => setSkipProof(e.target.checked)}
                    />
                    Skip Proof Gate
                  </label>
                </div>
                <div className="diagnostic-actions-row">
                  <button
                    type="button"
                    className="diagnostic-btn-primary"
                    onClick={() => {
                      if (onJumpStandard) {
                        onJumpStandard(targetLesson, targetDrill, skipProof);
                      } else {
                        onStandard();
                      }
                    }}
                  >
                    Go to Lesson {targetLesson} (Drill {targetDrill})
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="diagnostic-navigator__footer">
            <small>[ / ] cycle mini lessons · 1–6 switch batches/stages · Esc close</small>
          </div>
        </div>
      )}
    </aside>
  );
}
