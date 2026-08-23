import type { AttemptRecord } from '../curriculum/telemetry';

/** Versioned separately from the curriculum and database schema. */
export const LEARNING_DATA_SCHEMA_VERSION = 1 as const;
export const CURRICULUM_ID = 'eartrain-position-pathway';
export const CURRICULUM_VERSION = '2026-08-v1';

export type LearnerStatus = 'active' | 'paused' | 'archived';
export type IdentityProvider = 'eartrain' | 'reading.oclef.com';

/**
 * A student is intentionally not an auth user. Instructors authenticate;
 * students later enter through a short-lived, server-verified launch grant.
 */
export interface LearnerProfile {
  id: string;
  instructorId: string | null;
  displayName: string;
  status: LearnerStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ExternalIdentityLink {
  id: string;
  studentId: string;
  provider: IdentityProvider;
  /** Opaque stable subject from the provider; never an email address. */
  externalSubject: string;
  linkedAt: number;
}

export interface PracticeSessionRecord {
  id: string;
  studentId: string;
  sourceApp: 'eartrain-web' | 'reading.oclef.com';
  startedAt: number;
  lastActivityAt: number;
  endedAt: number | null;
}

export interface StudentAttemptRecord {
  /** Stable idempotency key used locally and as the future database PK. */
  id: string;
  schemaVersion: typeof LEARNING_DATA_SCHEMA_VERSION;
  studentId: string;
  sessionId: string;
  installationId: string;
  occurredAt: number;
  /** Complete, version-tolerant scoring payload. No raw microphone audio. */
  attempt: AttemptRecord;
  syncedAt: number | null;
}

export interface LearningCheckpoint {
  studentId: string;
  curriculumId: typeof CURRICULUM_ID;
  curriculumVersion: typeof CURRICULUM_VERSION;
  lessonIndex: number;
  questionNumber: number;
  difficulty: number;
  lastAttemptId: string;
  updatedAt: number;
}

export interface SyncOutboxEvent {
  /** Stable across retries so the server can safely upsert. */
  id: string;
  type: 'learning.attempt.recorded' | 'learning.checkpoint.updated';
  aggregateId: string;
  studentId: string;
  occurredAt: number;
  retryCount: number;
}

export interface LearningDataState {
  schemaVersion: typeof LEARNING_DATA_SCHEMA_VERSION;
  installationId: string;
  activeStudentId: string;
  activeSessionId: string | null;
  students: LearnerProfile[];
  externalIdentities: ExternalIdentityLink[];
  sessions: PracticeSessionRecord[];
  attempts: StudentAttemptRecord[];
  checkpoints: LearningCheckpoint[];
  outbox: SyncOutboxEvent[];
}

/**
 * Produced only after a backend/Edge Function verifies a signed launch token.
 * The browser must never trust raw URL claims from reading.oclef.com.
 */
export interface ResolvedStudentLaunch {
  studentId: string;
  instructorId: string;
  displayName: string;
  provider: IdentityProvider;
  externalSubject: string;
  sourceApp: PracticeSessionRecord['sourceApp'];
}

export interface SyncAttemptEnvelope {
  event: SyncOutboxEvent;
  student: LearnerProfile;
  session: PracticeSessionRecord;
  attempt: StudentAttemptRecord;
  checkpoint: LearningCheckpoint | null;
}
