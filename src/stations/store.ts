import { addDays, calendarDate, createSession, emptyData, sessionId, transition } from './engine';
import type { SessionEvent } from './engine';
import { fixedBatch } from './generator';
import { isStationTopic } from './types';
import type { StationData, StationNeed, StationSession, StationTopic } from './types';

export interface StationStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const phases = ['ready', 'answering', 'clue', 'clue-feedback', 'retry', 'feedback'];

/** Reject broken snapshots rather than granting mastery from partial/corrupt data. */
export function decodeSnapshot(raw: string | null, timeZone: string): StationData {
  if (!raw) return emptyData(timeZone);
  const data = JSON.parse(raw) as StationData;
  if (data.schemaVersion !== 1 || !Number.isInteger(data.revision) || !Array.isArray(data.assignments)
    || !data.assignments.every(isStationTopic) || !data.sessions || !data.summaries || !data.preferences || !data.progress) throw new Error('Invalid station snapshot');
  calendarDate(Date.now(), data.timeZone);
  for (const s of Object.values(data.sessions)) {
    if (!isStationTopic(s.topic) || s.id !== sessionId(s.date, s.topic) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)
      || s.questions.length !== 3 || new Set(s.questions.map(q => q.fingerprint)).size !== 3 || s.results.length > 3 || !phases.includes(s.run.phase)
      || s.questions.some(q => q.topic !== s.topic || !q.musicXML || q.correct < 0 || q.correct >= q.choices.length)
      || s.results.some((r, i) => r.questionId !== s.questions[i].id)
      || Boolean(s.completedAt) !== (s.results.length === 3)) throw new Error('Invalid station session');
  }
  for (const s of Object.values(data.summaries)) {
    if (!isStationTopic(s.topic) || s.id !== sessionId(s.date, s.topic) || !s.completedAt || s.results.length !== 3
      || s.results.some(r => typeof r.firstAttemptCorrect !== 'boolean' || !Number.isFinite(r.responseMs) || !Number.isInteger(r.hintsUsed) || r.hintsUsed < 0)) throw new Error('Invalid station history');
  }
  for (const [topic, progress] of Object.entries(data.progress)) {
    if (!isStationTopic(topic) || !progress || !['active', 'maintenance'].includes(progress.status)
      || !Number.isInteger(progress.streak) || progress.streak < 0
      || progress.status === 'maintenance' && (!progress.masteredOn || !progress.nextDue)
      || [progress.masteredOn, progress.nextDue, progress.lastPerfectDate].some(date => date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('Invalid station progress');
  }
  return data;
}

export function stationIdentity(verifiedStudent?: string): string {
  if (verifiedStudent) return `verified:${verifiedStudent}`;
  try {
    let identity = window.localStorage.getItem('eartrain.station.identity');
    if (!identity) { identity = crypto.randomUUID(); window.localStorage.setItem('eartrain.station.identity', identity); }
    return `device:${identity}`;
  } catch { return `temporary:${crypto.randomUUID()}`; }
}

export class StationStore {
  readonly key: string;
  data: StationData;
  warning = '';
  private listeners = new Set<() => void>();
  constructor(readonly student: string, private storage?: StationStorage, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.key = `keystance.fixed-batches.v2.${encodeURIComponent(student)}`;
    this.data = emptyData(timeZone);
    this.refresh();
    if (!storage) this.warning = 'Progress is temporary: browser storage is unavailable.';
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  notify() { this.listeners.forEach(listener => listener()); }
  refresh() {
    if (!this.storage) return;
    try { this.data = decodeSnapshot(this.storage.getItem(this.key), this.data.timeZone); }
    catch { this.warning = 'Saved station progress could not be read. This session is temporary; your saved data has not been overwritten.'; this.storage = undefined; }
  }
  private save(data: StationData) {
    data.revision++;
    // Keep complete musical snapshots for three weeks; lightweight daily summaries retain the mastery history.
    const cutoff = addDays(calendarDate(Date.now(), data.timeZone), -21);
    for (const [id, s] of Object.entries(data.sessions)) if (s.completedAt && s.date < cutoff) delete data.sessions[id];
    this.data = data;
    try { this.storage?.setItem(this.key, JSON.stringify(data)); }
    catch { this.warning = 'Progress is temporary: browser storage is full or unavailable.'; this.storage = undefined; }
    this.notify();
  }
  assign(topic: StationTopic, assigned: boolean) {
    this.refresh(); const next = structuredClone(this.data);
    next.assignments = assigned ? [...new Set([...next.assignments, topic])] : next.assignments.filter(t => t !== topic);
    this.save(next);
  }
  open(topic: StationTopic, need: StationNeed, now = Date.now(), batch = 1): StationSession {
    this.refresh();
    const date = calendarDate(now, this.data.timeZone), id = sessionId(date, topic);
    const next = structuredClone(this.data);
    const questions = fixedBatch(topic, batch);
    // An opening is a new attempt. Unique IDs reject delayed events from an older attempt.
    const attempt = crypto.randomUUID();
    for (const q of questions) q.id = `${q.id}/${attempt}`;
    const session = createSession(date, topic, need, 'balanced', `fixed-v2/${topic}/${batch}`, questions);
    next.sessions[id] = session; next.preferences[topic] = need;
    if (!next.assignments.includes(topic)) next.assignments.push(topic);
    this.save(next); return session;
  }
  dispatch(id: string, questionId: string, event: SessionEvent) {
    // Web Locks serialize tabs; expected question ID also rejects delayed/duplicate clicks.
    const update = () => {
      this.refresh(); const current = this.data.sessions[id];
      if (!current || current.completedAt || current.questions[current.results.length]?.id !== questionId) return;
      const next = transition(current, event);
      if (next !== current) this.save({ ...this.data, sessions: { ...this.data.sessions, [id]: next } });
    };
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(this.key, update);
    update(); return Promise.resolve();
  }
}

export function browserStationStore(identity: string): StationStore {
  try { return new StationStore(identity, window.localStorage); }
  catch { return new StationStore(identity); }
}
