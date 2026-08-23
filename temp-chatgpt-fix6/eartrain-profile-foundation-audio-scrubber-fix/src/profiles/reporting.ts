import { buildReport } from '../curriculum/telemetry';
import { learningProfileStore } from './learningProfileStore';
import type { LearnerProfile, LearningCheckpoint, PracticeSessionRecord } from './types';

export interface StudentScoringReport {
  generatedAt: number;
  student: LearnerProfile;
  checkpoint: LearningCheckpoint | null;
  sessions: PracticeSessionRecord[];
  /** Existing instructor analysis: scores, concepts, positions and weak spots. */
  scoring: ReturnType<typeof buildReport>;
}

export function buildStudentScoringReport(studentId: string): StudentScoringReport | null {
  const state = learningProfileStore.getSnapshot();
  const student = state.students.find((candidate) => candidate.id === studentId);
  if (!student) return null;
  const attempts = learningProfileStore
    .getAttemptsForStudent(studentId)
    .map((record) => record.attempt);
  return {
    generatedAt: Date.now(),
    student,
    checkpoint: learningProfileStore.getCheckpoint(studentId),
    sessions: state.sessions.filter((session) => session.studentId === studentId),
    scoring: buildReport(attempts),
  };
}
