import { useEffect, useState } from 'react';
import { DIAGNOSTIC_KEYS, DIAGNOSTIC_REGISTRY } from '../diagnostics/registry';
import type { DiagnosticStage } from '../diagnostics/registry';

export interface DiagnosticSelection {
  problem: string;
  key: string;
  stage: DiagnosticStage;
  revision: number;
}

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

  const problem = DIAGNOSTIC_REGISTRY.find(p => p.id === selection?.problem) ?? DIAGNOSTIC_REGISTRY[0];
  const key = DIAGNOSTIC_KEYS.find(k => k.id === selection?.key) ?? DIAGNOSTIC_KEYS[0];
  const currentStage = selection?.stage ?? 1;

  const select = (problemId: string, keyId: string, stage: DiagnosticStage = 1) => {
    setActiveTab('diagnostics');
    onSelect({
      problem: problemId,
      key: keyId,
      stage,
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
      } else if (['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        select(problem.id, key.id, Number(event.key) as DiagnosticStage);
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const delta = event.key === '[' ? -1 : 1;
        if (problem.usesKey && !event.shiftKey) {
          const index = DIAGNOSTIC_KEYS.indexOf(key);
          select(
            problem.id,
            DIAGNOSTIC_KEYS[(index + delta + DIAGNOSTIC_KEYS.length) % DIAGNOSTIC_KEYS.length].id,
            currentStage
          );
        } else {
          const index = DIAGNOSTIC_REGISTRY.indexOf(problem);
          select(
            DIAGNOSTIC_REGISTRY[(index + delta + DIAGNOSTIC_REGISTRY.length) % DIAGNOSTIC_REGISTRY.length].id,
            key.id,
            currentStage
          );
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });

  const majorKeys = DIAGNOSTIC_KEYS.filter(k => !k.minor);
  const minorKeys = DIAGNOSTIC_KEYS.filter(k => k.minor);

  return (
    <aside className="diagnostic-navigator" aria-label="Diagnostic testing navigator">
      <button
        type="button"
        className="diagnostic-navigator-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="diagnostic-controls"
      >
        <span className="diagnostic-navigator-toggle__badge">{open ? '✕' : '⚡'}</span>
        <span className="diagnostic-navigator-toggle__label">Diagnostic tester</span>
        {!open && (
          <span className="diagnostic-navigator-toggle__info">
            {selection ? `${problem.label.split(' ')[0]} · S${currentStage}` : `L${currentLesson}`}
          </span>
        )}
      </button>

      {open && (
        <div id="diagnostic-controls" className="diagnostic-navigator__panel">
          <div className="diagnostic-navigator__header">
            <strong>EarTrain Dev Studio</strong>
            <div className="diagnostic-navigator__mode-tabs">
              <button
                type="button"
                className={`diagnostic-tab ${activeTab === 'diagnostics' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('diagnostics')}
              >
                Diagnostic Remediation (6)
              </button>
              <button
                type="button"
                className={`diagnostic-tab ${activeTab === 'standard' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('standard')}
              >
                Standard Curriculum (24)
              </button>
            </div>
            <button
              type="button"
              className="diagnostic-close"
              onClick={() => setOpen(false)}
              aria-label="Close tester"
            >
              ✕
            </button>
          </div>

          {activeTab === 'diagnostics' ? (
            <div className="diagnostic-navigator__body">
              <div className="diagnostic-section">
                <span className="diagnostic-section-title">Problem ({DIAGNOSTIC_REGISTRY.length})</span>
                <label className="diagnostic-select-wrap">
                  <select
                    value={problem.id}
                    onChange={e => select(e.target.value, key.id, currentStage)}
                  >
                    {DIAGNOSTIC_REGISTRY.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="diagnostic-pill-chips">
                  {DIAGNOSTIC_REGISTRY.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`diagnostic-chip ${problem.id === p.id && selection ? 'is-active' : ''}`}
                      onClick={() => select(p.id, key.id, currentStage)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="diagnostic-section">
                <span className="diagnostic-section-title">
                  Musical Key (24 keys) {problem.usesKey ? '· Active' : '· Hand Position only'}
                </span>
                <label className="diagnostic-select-wrap">
                  <select
                    value={key.id}
                    onChange={e => select(problem.id, e.target.value, currentStage)}
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

              <div className="diagnostic-section">
                <span className="diagnostic-section-title">Jump to Stage (1–4)</span>
                <div className="diagnostic-jumps">
                  {(
                    [
                      '1: Listen & Judge',
                      '2: Child MCQ',
                      '3: Acoustic Playthrough',
                      '4: Transfer Drill',
                    ] as const
                  ).map((label, i) => {
                    const stg = (i + 1) as DiagnosticStage;
                    const isActive = selection !== null && currentStage === stg;
                    return (
                      <button
                        key={label}
                        type="button"
                        className={`diagnostic-jump-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => select(problem.id, key.id, stg)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

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
            <small>[ / ] cycle keys/problems · 1–4 jump stages · Esc close</small>
          </div>
        </div>
      )}
    </aside>
  );
}
