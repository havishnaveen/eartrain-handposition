import type { Archetype, DailyTriad, QuestionResult, QuestionRun, StationData, StationNeed, StationProgress, StationSession, StationTopic } from './types';

export function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619); }
  return result >>> 0;
}
export function seeded(seed: string): () => number {
  let value = hash(seed);
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function calendarDate(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
export const sessionId = (date: string, topic: StationTopic) => `${date}/${topic}`;
export const freshRun = (): QuestionRun => ({ phase: 'ready', firstChoice: null, finalChoice: null, guidedChoice: null, hintsUsed: 0, heard: false, responseMs: 0, replayCount: 0 });
export const emptyProgress = (): StationProgress => ({ status: 'active', masteredOn: null, nextDue: null, streak: 0, lastPerfectDate: null });
export function emptyData(timeZone: string): StationData {
  return { schemaVersion: 1, revision: 0, timeZone, assignments: [], preferences: {}, sessions: {}, summaries: {}, progress: {} };
}

export function chooseArchetype(data: StationData, topic: StationTopic, need: StationNeed, date: string): Archetype {
  if (need === 'audio') return 'ear';
  if (need === 'visual') return 'visual';
  const recent = Object.values(data.sessions).filter(s => s.topic === topic && s.completedAt && s.date < date && s.date >= addDays(date, -14))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).flatMap(s => s.results);
  if (recent.length < 3) return 'balanced';
  const errors = (kind: QuestionResult['kind']) => {
    const items = recent.filter(r => r.kind === kind);
    return items.length ? items.filter(r => !r.firstAttemptCorrect).length / items.length : 0;
  };
  if (errors('cause') >= .5 && errors('audio') < .5) return 'classification';
  if (recent.some(r => r.kind === 'audio' && r.firstAttemptCorrect) && errors('audio') === 0 && errors('rule') >= .34) return 'classification';
  if (errors('audio') >= .34 && errors('audio') >= errors('visual')) return 'ear';
  if (errors('visual') >= .34 || errors('rule') >= .5) return 'visual';
  // Slow but accurate reading gets more visual recognition without adding a graduation speed gate.
  const decisions = recent.filter(r => r.kind === 'visual' && r.firstAttemptCorrect).map(r => r.responseMs).sort((a, b) => a - b);
  if (decisions.length >= 2 && decisions[Math.floor(decisions.length / 2)] > 15000) return 'visual';
  return 'balanced';
}
export function recentFingerprints(data: StationData, date: string): Set<string> {
  return new Set(Object.values(data.sessions).filter(s => s.date >= addDays(date, -7) && s.date <= date).flatMap(s => s.questions.map(q => q.fingerprint)));
}
export function createSession(date: string, topic: StationTopic, need: StationNeed, archetype: Archetype, seed: string, questions: DailyTriad): StationSession {
  if (questions.length !== 3 || new Set(questions.map(q => q.fingerprint)).size !== 3) throw new Error('A station requires three distinct musical examples.');
  if (!questions.some(q => q.kind === 'audio' || q.kind === 'cause')) throw new Error('Every station must include mistake spotting or error diagnosis.');
  return { id: sessionId(date, topic), date, topic, need, archetype, seed, questions, results: [], run: freshRun(), startedAt: null, completedAt: null };
}

export type SessionEvent =
  | { type: 'performance'; correct: boolean; firstAttemptCorrect: boolean; attempts: number; guidedCorrect: boolean | null; now: number }
  | { type: 'start'; now: number }
  | { type: 'time'; responseMs: number }
  | { type: 'heard'; replayCount: number }
  | { type: 'hint'; responseMs: number }
  | { type: 'answer'; choice: number; responseMs: number }
  | { type: 'guided'; choice: number }
  | { type: 'retry' }
  | { type: 'record'; now: number };

/** Pure, guarded transitions. Stale or duplicated events cannot add a fourth answer. */
export function transition(session: StationSession, event: SessionEvent): StationSession {
  if (session.completedAt || session.results.length >= 3) return session;
  const next = structuredClone(session), run = next.run, q = next.questions[next.results.length];
  switch (event.type) {
    case 'performance': {
      if (q.kind !== 'play' || run.phase !== 'answering' || ![1, 2].includes(event.attempts)
        || event.firstAttemptCorrect && (!event.correct || event.attempts !== 1)) return session;
      next.results.push({ questionId: q.id, kind: 'play', firstChoice: event.firstAttemptCorrect ? q.correct : -1,
        finalChoice: event.correct ? q.correct : -1, firstAttemptCorrect: event.firstAttemptCorrect, correct: event.correct,
        hintsUsed: event.guidedCorrect === null ? 0 : 1, guidedCorrect: event.guidedCorrect, attempts: event.attempts,
        responseMs: run.responseMs, replayCount: 0, completedAt: event.now });
      next.run = freshRun();
      if (next.results.length === 3) next.completedAt = event.now;
      break;
    }
    case 'time':
      if (run.phase !== 'answering') return session;
      run.responseMs = Math.max(run.responseMs, event.responseMs); break;
    case 'start':
      if (run.phase !== 'ready') return session;
      next.startedAt ??= event.now; run.phase = 'answering'; break;
    case 'heard':
      if (!['answering', 'retry'].includes(run.phase)) return session;
      run.heard = true; run.replayCount = event.replayCount; break;
    case 'hint':
      if (run.phase !== 'answering' || (q.audio && !run.heard)) return session;
      run.hintsUsed++; run.responseMs = event.responseMs; run.phase = 'clue'; break;
    case 'answer': {
      if (q.kind === 'play') return session;
      if (!['answering', 'retry'].includes(run.phase) || (q.audio && !run.heard) || !Number.isInteger(event.choice) || event.choice < 0 || event.choice >= q.choices.length) return session;
      const first = run.phase === 'answering';
      if (first) { run.firstChoice = event.choice; run.responseMs = event.responseMs; }
      run.finalChoice = event.choice;
      if (event.choice === q.correct || !first) run.phase = 'feedback';
      else { run.hintsUsed++; run.phase = 'clue'; }
      break;
    }
    case 'guided':
      if (run.phase !== 'clue' || !Number.isInteger(event.choice) || event.choice < 0 || event.choice >= q.clue.choices.length) return session;
      run.guidedChoice = event.choice; run.phase = 'clue-feedback'; break;
    case 'retry':
      if (run.phase !== 'clue-feedback') return session;
      run.phase = 'retry'; run.heard = false; break;
    case 'record': {
      if (run.phase !== 'feedback' || run.finalChoice === null) return session;
      next.results.push({ questionId: q.id, kind: q.kind, firstChoice: run.firstChoice ?? -1, finalChoice: run.finalChoice,
        firstAttemptCorrect: run.firstChoice === q.correct && run.hintsUsed === 0,
        correct: run.finalChoice === q.correct, hintsUsed: run.hintsUsed,
        guidedCorrect: run.guidedChoice === null ? null : run.guidedChoice === q.clue.correct,
        attempts: run.firstChoice === null || run.firstChoice === run.finalChoice && run.hintsUsed === 0 ? 1 : 2,
        responseMs: Math.max(0, run.responseMs), replayCount: run.replayCount, completedAt: event.now });
      next.run = freshRun();
      if (next.results.length === 3) next.completedAt = event.now;
      break;
    }
  }
  return next;
}

export function applyProgress(data: StationData, session: StationSession, student: string): StationData {
  const next = structuredClone(data); next.sessions[session.id] = session;
  if (!session.completedAt || session.results.length !== 3) return next;
  next.summaries[session.id] = { id: session.id, date: session.date, topic: session.topic, results: session.results, completedAt: session.completedAt };
  // Recompute from completed daily records: reloads, repeated writes, and out-of-order tabs are idempotent.
  let progress = emptyProgress();
  const days = Object.values(next.summaries).filter(s => s.topic === session.topic && s.completedAt && s.results.length === 3)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const day of days) {
    const perfect = day.results.every(r => r.firstAttemptCorrect && r.hintsUsed === 0) && calendarDate(day.completedAt!, next.timeZone) === day.date;
    if (progress.status === 'maintenance') {
      if (!perfect) progress = emptyProgress();
      else progress.nextDue = addDays(day.date, 7 + hash(`${student}/${day.topic}/${day.date}/maintenance`) % 8);
    } else if (perfect) {
      progress.streak = progress.lastPerfectDate === addDays(day.date, -1) ? progress.streak + 1 : 1;
      progress.lastPerfectDate = day.date;
      if (progress.streak >= 2) {
        progress.status = 'maintenance'; progress.masteredOn = day.date;
        progress.nextDue = addDays(day.date, 7 + hash(`${student}/${day.topic}/${day.date}/maintenance`) % 8);
      }
    } else progress = emptyProgress();
  }
  next.progress[session.topic] = progress;
  return next;
}
export function dailyQueue(data: StationData, date: string, student: string): StationTopic[] {
  return data.assignments.filter(topic => {
    const progress = data.progress[topic] ?? emptyProgress();
    return progress.status === 'active' || !progress.nextDue || progress.nextDue <= date;
  }).sort((a, b) => hash(`${student}/${date}/${a}/rotation`) - hash(`${student}/${date}/${b}/rotation`));
}
