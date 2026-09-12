import { useEffect, useState } from 'react';
import { DIAGNOSTIC_KEYS, DIAGNOSTIC_REGISTRY } from '../diagnostics/registry';
import type { DiagnosticStage } from '../diagnostics/registry';

export interface DiagnosticSelection { problem: string; key: string; stage: DiagnosticStage; revision: number }
export default function DiagnosticNavigator({ selection, onSelect, onStandard }: {
  selection: DiagnosticSelection | null; onSelect: (selection: DiagnosticSelection) => void; onStandard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const problem = DIAGNOSTIC_REGISTRY.find(p => p.id === selection?.problem) ?? DIAGNOSTIC_REGISTRY[0];
  const key = DIAGNOSTIC_KEYS.find(k => k.id === selection?.key) ?? DIAGNOSTIC_KEYS[0];
  const select = (problemId: string, keyId: string, stage: DiagnosticStage = 1) => onSelect({ problem: problemId, key: keyId, stage, revision: (selection?.revision ?? 0) + 1 });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target instanceof HTMLElement && (target.closest('input,select,textarea,button,[contenteditable="true"]'))) return;
      if (['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault(); select(problem.id, key.id, Number(event.key) as DiagnosticStage);
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault(); const delta = event.key === '[' ? -1 : 1;
        if (problem.usesKey && !event.shiftKey) {
          const index = DIAGNOSTIC_KEYS.indexOf(key);
          select(problem.id, DIAGNOSTIC_KEYS[(index + delta + DIAGNOSTIC_KEYS.length) % DIAGNOSTIC_KEYS.length].id);
        } else {
          const index = DIAGNOSTIC_REGISTRY.indexOf(problem);
          select(DIAGNOSTIC_REGISTRY[(index + delta + DIAGNOSTIC_REGISTRY.length) % DIAGNOSTIC_REGISTRY.length].id, key.id);
        }
      }
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  });
  return <aside className="diagnostic-navigator" aria-label="Diagnostic testing navigator">
    <button className="diagnostic-navigator-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="diagnostic-controls">{open ? '−' : '+'} Diagnostic tester</button>
    {open && <div id="diagnostic-controls">
      <label>Problem<select value={problem.id} onChange={e => select(e.target.value, key.id)}>{DIAGNOSTIC_REGISTRY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      {problem.usesKey && <label>Key<select value={key.id} onChange={e => select(problem.id, e.target.value)}>{DIAGNOSTIC_KEYS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>}
      <div className="diagnostic-jumps">{(['1: Listen & Judge', '2: Child MCQ', '3: Acoustic Playthrough', '4: Transfer Drill'] as const).map((label, i) => <button key={label} onClick={() => select(problem.id, key.id, (i + 1) as DiagnosticStage)}>{label}</button>)}</div>
      <button onClick={onStandard}>Return to Standard Curriculum</button>
      <small>[ / ] cycle {problem.usesKey ? 'keys' : 'problems'} · 1–4 jump stages</small>
    </div>}
  </aside>;
}
