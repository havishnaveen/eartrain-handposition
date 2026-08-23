import type { AttemptRecord } from '../curriculum/telemetry';
import {
  CURRICULUM_ID,
  CURRICULUM_VERSION,
  LEARNING_DATA_SCHEMA_VERSION,
} from './types';
import type {
  ExternalIdentityLink,
  IdentityProvider,
  LearnerProfile,
  LearningCheckpoint,
  LearningActivityRecord,
  LearningActivityType,
  LearningDataState,
  PracticeSessionRecord,
  ResolvedStudentLaunch,
  StudentAttemptRecord,
  LearningSyncEnvelope,
  SyncOutboxEvent,
} from './types';

const STORAGE_KEY = 'eartrain.learning-data.v1';
const SESSION_IDLE_LIMIT_MS = 30 * 60 * 1000;
type Listener = () => void;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122-shaped fallback for older WebViews. Randomness is sufficient for
  // client IDs; the backend still enforces uniqueness.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function makeId(prefix: string): string {
  return `${prefix}_${makeUuid()}`;
}

/** Small deterministic hash for importing the same legacy row more than once. */
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function attemptIdFor(record: AttemptRecord): string {
  return `attempt_${stableHash([
    record.at,
    record.seq,
    record.questionId,
    record.attemptNumber,
    record.positionKey,
  ].join('|'))}`;
}

function freshState(): LearningDataState {
  const now = Date.now();
  const student: LearnerProfile = {
    id: makeUuid(),
    instructorId: null,
    displayName: 'Local learner',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  return {
    schemaVersion: LEARNING_DATA_SCHEMA_VERSION,
    installationId: makeId('device'),
    activeStudentId: student.id,
    activeSessionId: null,
    students: [student],
    externalIdentities: [],
    sessions: [],
    attempts: [],
    checkpoints: [],
    activities: [],
    outbox: [],
  };
}

function isState(value: unknown): value is LearningDataState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<LearningDataState>;
  return (
    state.schemaVersion === LEARNING_DATA_SCHEMA_VERSION &&
    typeof state.installationId === 'string' &&
    typeof state.activeStudentId === 'string' &&
    Array.isArray(state.students) &&
    Array.isArray(state.externalIdentities) &&
    Array.isArray(state.sessions) &&
    Array.isArray(state.attempts) &&
    Array.isArray(state.checkpoints) &&
    (state.activities === undefined || Array.isArray(state.activities)) &&
    Array.isArray(state.outbox)
  );
}

function loadState(): LearningDataState {
  const localStorage = storage();
  if (!localStorage) return freshState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed)
      ? { ...parsed, activities: parsed.activities ?? [] }
      : freshState();
  } catch {
    return freshState();
  }
}

class LearningProfileStore {
  private state: LearningDataState = loadState();
  private listeners = new Set<Listener>();

  constructor() {
    // Persist the anonymous learner immediately, before their first attempt.
    // That gives later instructor claiming/redirect resolution a stable ID
    // even if the tab closes before any exercise is completed.
    const localStorage = storage();
    if (localStorage && localStorage.getItem(STORAGE_KEY) === null) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // The in-memory profile remains usable in restricted browsers.
      }
    }
  }

  private commit(next: LearningDataState): void {
    this.state = next;
    const localStorage = storage();
    if (localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // A quota/privacy failure must never interrupt the student's drill.
      }
    }
    this.listeners.forEach((listener) => listener());
  }

  private ensureActiveStudent(): LearnerProfile {
    const active = this.state.students.find(
      (student) => student.id === this.state.activeStudentId,
    );
    if (active) return active;

    const now = Date.now();
    const fallback: LearnerProfile = {
      id: makeUuid(),
      instructorId: null,
      displayName: 'Local learner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.commit({
      ...this.state,
      activeStudentId: fallback.id,
      students: [...this.state.students, fallback],
    });
    return fallback;
  }

  private ensureSession(
    sourceApp: PracticeSessionRecord['sourceApp'],
    launch?: ResolvedStudentLaunch,
  ): PracticeSessionRecord {
    const now = Date.now();
    const active = this.state.sessions.find(
      (session) => session.id === this.state.activeSessionId,
    );
    if (
      active &&
      active.studentId === this.state.activeStudentId &&
      active.endedAt === null &&
      now - active.lastActivityAt <= SESSION_IDLE_LIMIT_MS
    ) {
      return active;
    }

    const session: PracticeSessionRecord = {
      id: makeUuid(),
      studentId: this.ensureActiveStudent().id,
      sourceApp,
      startedAt: now,
      lastActivityAt: now,
      endedAt: null,
      ...(launch
        ? {
            launchId: launch.launchId,
            assignmentId: launch.assignment?.id,
            remediationProblem: launch.assignment?.problem,
          }
        : {}),
    };
    this.commit({
      ...this.state,
      activeSessionId: session.id,
      sessions: [...this.state.sessions, session],
    });
    return session;
  }

  private checkpointFor(record: AttemptRecord, attemptId: string): LearningCheckpoint {
    return {
      studentId: this.state.activeStudentId,
      curriculumId: CURRICULUM_ID,
      curriculumVersion: CURRICULUM_VERSION,
      lessonIndex: record.conceptIndex,
      questionNumber: record.questionNumber,
      difficulty: record.difficulty,
      lastAttemptId: attemptId,
      updatedAt: record.at,
    };
  }

  getSnapshot = (): LearningDataState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getActiveStudent(): LearnerProfile {
    return this.ensureActiveStudent();
  }

  createStudent(displayName: string, instructorId: string | null): LearnerProfile {
    const now = Date.now();
    const student: LearnerProfile = {
      id: makeUuid(),
      instructorId,
      displayName: displayName.trim() || 'Student',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.commit({ ...this.state, students: [...this.state.students, student] });
    return student;
  }

  setActiveStudent(studentId: string): boolean {
    if (!this.state.students.some((student) => student.id === studentId)) return false;
    this.endActiveSession();
    this.commit({ ...this.state, activeStudentId: studentId, activeSessionId: null });
    return true;
  }

  endActiveSession(): void {
    if (!this.state.activeSessionId) return;
    const now = Date.now();
    this.commit({
      ...this.state,
      activeSessionId: null,
      sessions: this.state.sessions.map((session) =>
        session.id === this.state.activeSessionId
          ? { ...session, endedAt: session.endedAt ?? now, lastActivityAt: now }
          : session,
      ),
    });
  }

  linkExternalIdentity(
    studentId: string,
    provider: IdentityProvider,
    externalSubject: string,
  ): ExternalIdentityLink {
    const existing = this.state.externalIdentities.find(
      (link) => link.provider === provider && link.externalSubject === externalSubject,
    );
    if (existing) return existing;
    const link: ExternalIdentityLink = {
      id: makeUuid(),
      studentId,
      provider,
      externalSubject,
      linkedAt: Date.now(),
    };
    this.commit({
      ...this.state,
      externalIdentities: [...this.state.externalIdentities, link],
    });
    return link;
  }

  /** Accept only a launch context already verified by the future backend. */
  activateResolvedLaunch(launch: ResolvedStudentLaunch): LearnerProfile {
    let student = this.state.students.find((candidate) => candidate.id === launch.studentId);
    if (!student) {
      const now = Date.now();
      student = {
        id: launch.studentId,
        instructorId: launch.instructorId,
        displayName: launch.displayName,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      this.commit({ ...this.state, students: [...this.state.students, student] });
    } else if (
      student.instructorId !== launch.instructorId ||
      student.displayName !== launch.displayName ||
      student.status !== 'active'
    ) {
      student = {
        ...student,
        instructorId: launch.instructorId,
        displayName: launch.displayName,
        status: 'active',
        updatedAt: Date.now(),
      };
      this.commit({
        ...this.state,
        students: this.state.students.map((candidate) =>
          candidate.id === launch.studentId ? student! : candidate,
        ),
      });
    }
    this.linkExternalIdentity(student.id, launch.provider, launch.externalSubject);
    this.setActiveStudent(student.id);
    this.ensureSession(launch.sourceApp, launch);
    return student;
  }

  /**
   * Claims an anonymous local learner for an instructor without changing its
   * ID or losing any existing attempts. Instructor profile creation can call
   * this before the first sync.
   */
  attachInstructor(
    studentId: string,
    instructorId: string,
    displayName?: string,
  ): LearnerProfile | null {
    const existing = this.state.students.find((student) => student.id === studentId);
    if (!existing) return null;
    const updated: LearnerProfile = {
      ...existing,
      instructorId,
      displayName: displayName?.trim() || existing.displayName,
      updatedAt: Date.now(),
    };
    this.commit({
      ...this.state,
      students: this.state.students.map((student) =>
        student.id === studentId ? updated : student,
      ),
    });
    return updated;
  }

  recordAttempt(
    record: AttemptRecord,
    sourceApp: PracticeSessionRecord['sourceApp'] = 'eartrain-web',
  ): StudentAttemptRecord {
    const id = attemptIdFor(record);
    const existing = this.state.attempts.find((attempt) => attempt.id === id);
    if (existing) return existing;

    const student = this.ensureActiveStudent();
    const session = this.ensureSession(sourceApp);
    const attempt: StudentAttemptRecord = {
      id,
      schemaVersion: LEARNING_DATA_SCHEMA_VERSION,
      studentId: student.id,
      sessionId: session.id,
      installationId: this.state.installationId,
      occurredAt: record.at,
      attempt: record,
      syncedAt: null,
    };
    const checkpoint = this.checkpointFor(record, id);
    const priorCheckpoint = this.state.checkpoints.find(
      (item) => item.studentId === student.id && item.curriculumId === CURRICULUM_ID,
    );
    const checkpoints = [
      ...this.state.checkpoints.filter((item) => item !== priorCheckpoint),
      checkpoint,
    ];
    const sessionUpdated = this.state.sessions.map((item) =>
      item.id === session.id ? { ...item, lastActivityAt: record.at } : item,
    );
    const outbox: SyncOutboxEvent[] = [
      ...this.state.outbox,
      {
        id: `event_${id}`,
        type: 'learning.attempt.recorded',
        aggregateId: id,
        studentId: student.id,
        occurredAt: record.at,
        retryCount: 0,
      },
    ];

    this.commit({
      ...this.state,
      sessions: sessionUpdated,
      attempts: [...this.state.attempts, attempt],
      checkpoints,
      outbox,
    });
    return attempt;
  }

  recordActivity(
    type: LearningActivityType,
    properties: LearningActivityRecord['properties'] = {},
    sourceApp: PracticeSessionRecord['sourceApp'] = 'eartrain-web',
  ): LearningActivityRecord {
    const student = this.ensureActiveStudent();
    const session = this.ensureSession(sourceApp);
    const occurredAt = Date.now();
    const activity: LearningActivityRecord = {
      id: makeId('activity'),
      schemaVersion: LEARNING_DATA_SCHEMA_VERSION,
      studentId: student.id,
      sessionId: session.id,
      occurredAt,
      type,
      properties,
      syncedAt: null,
    };
    const event: SyncOutboxEvent = {
      id: `event_${activity.id}`,
      type: 'learning.activity.recorded',
      aggregateId: activity.id,
      studentId: student.id,
      occurredAt,
      retryCount: 0,
    };
    this.commit({
      ...this.state,
      sessions: this.state.sessions.map((item) =>
        item.id === session.id ? { ...item, lastActivityAt: occurredAt } : item,
      ),
      activities: [...this.state.activities, activity],
      outbox: [...this.state.outbox, event],
    });
    return activity;
  }

  /** Idempotently imports every pre-profile telemetry row. */
  migrateLegacyAttempts(records: readonly AttemptRecord[]): void {
    records.forEach((record) => this.recordAttempt(record));
  }

  getAttemptsForStudent(studentId = this.state.activeStudentId): StudentAttemptRecord[] {
    return this.state.attempts.filter((attempt) => attempt.studentId === studentId);
  }

  getCheckpoint(studentId = this.state.activeStudentId): LearningCheckpoint | null {
    return this.state.checkpoints.find(
      (checkpoint) =>
        checkpoint.studentId === studentId && checkpoint.curriculumId === CURRICULUM_ID,
    ) ?? null;
  }

  /** Payloads are joined lazily so the outbox does not duplicate attempt data. */
  getSyncBatch(limit = 50): LearningSyncEnvelope[] {
    const envelopes: LearningSyncEnvelope[] = [];
    for (const event of this.state.outbox) {
      const student = this.state.students.find((item) => item.id === event.studentId);
      if (!student) continue;
      if (event.type === 'learning.attempt.recorded') {
        const attempt = this.state.attempts.find((item) => item.id === event.aggregateId);
        if (!attempt) continue;
        const session = this.state.sessions.find((item) => item.id === attempt.sessionId);
        if (!session) continue;
        envelopes.push({
          kind: 'attempt',
          event,
          student,
          session,
          attempt,
          checkpoint: this.getCheckpoint(student.id),
        });
      } else if (event.type === 'learning.activity.recorded') {
        const activity = this.state.activities.find((item) => item.id === event.aggregateId);
        if (!activity) continue;
        const session = this.state.sessions.find((item) => item.id === activity.sessionId);
        if (!session) continue;
        envelopes.push({ kind: 'activity', event, student, session, activity });
      }
      if (envelopes.length >= Math.max(1, limit)) break;
    }
    return envelopes;
  }

  acknowledgeSynced(eventIds: readonly string[], syncedAt = Date.now()): void {
    const accepted = new Set(eventIds);
    const attemptIds = new Set(
      this.state.outbox
        .filter((event) => accepted.has(event.id) && event.type === 'learning.attempt.recorded')
        .map((event) => event.aggregateId),
    );
    const activityIds = new Set(
      this.state.outbox
        .filter((event) => accepted.has(event.id) && event.type === 'learning.activity.recorded')
        .map((event) => event.aggregateId),
    );
    this.commit({
      ...this.state,
      outbox: this.state.outbox.filter((event) => !accepted.has(event.id)),
      attempts: this.state.attempts.map((attempt) =>
        attemptIds.has(attempt.id) ? { ...attempt, syncedAt } : attempt,
      ),
      activities: this.state.activities.map((activity) =>
        activityIds.has(activity.id) ? { ...activity, syncedAt } : activity,
      ),
    });
  }
}

export const learningProfileStore = new LearningProfileStore();
