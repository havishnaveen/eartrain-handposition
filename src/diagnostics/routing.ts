import { DIAGNOSTIC_KEYS, resolveDiagnostic, resolveDiagnosticKey } from './registry';
import type { DiagnosticDefinition, DiagnosticKey } from './registry';

export interface DiagnosticReferral { definition: DiagnosticDefinition; key: DiagnosticKey; invalidKey?: string }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
/** Query parameters select practice content only; identity still comes from the verified handoff. */
export function diagnosticReferral(launch: unknown, search: string): DiagnosticReferral | null {
  const params = new URLSearchParams(search);
  const info = record(launch), assignment = record(info.assignment);
  const indicators = [params.get('diagnosis'), assignment.problem, info.diagnosticReason, info.diagnosticCode];
  const definition = indicators.map(resolveDiagnostic).find(Boolean);
  const keyValue = params.get('key') ?? assignment.key ?? info.key;
  const key = resolveDiagnosticKey(keyValue);
  // A musical-key URL by itself explicitly requests that key's hand-position lesson.
  const selected = definition ?? (key && !indicators.some(Boolean) ? resolveDiagnostic('hand-position') : undefined);
  if (!selected) return null;
  return { definition: selected, key: key ?? DIAGNOSTIC_KEYS[0],
    ...(selected.usesKey && typeof keyValue === 'string' && !key ? { invalidKey: keyValue.slice(0, 80) } : {}) };
}
