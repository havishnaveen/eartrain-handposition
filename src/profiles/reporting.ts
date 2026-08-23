import { buildReport } from '../curriculum/telemetry';
import { learningProfileStore } from './learningProfileStore';
import type { RemediationProblem } from '../curriculum/types';
import type {
  LearnerProfile,
  LearningActivityRecord,
  LearningCheckpoint,
  PracticeSessionRecord,
} from './types';

export interface RemediationScoringSummary {
  problem: RemediationProblem;
  attempts: number;
  passRate: number;
  meanOverall: number;
  missedNotes: number;
  liveNotesPreserved: number;
}

export interface StudentScoringReport {
  generatedAt: number;
  student: LearnerProfile;
  checkpoint: LearningCheckpoint | null;
  sessions: PracticeSessionRecord[];
  activities: LearningActivityRecord[];
  remediation: RemediationScoringSummary[];
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
  const remediationMap = new Map<RemediationProblem, {
    attempts: number;
    passes: number;
    scoreTotal: number;
    missedNotes: number;
    liveNotesPreserved: number;
  }>();
  attempts.forEach((attempt) => {
    if (!attempt.primaryProblem) return;
    const aggregate = remediationMap.get(attempt.primaryProblem) ?? {
      attempts: 0,
      passes: 0,
      scoreTotal: 0,
      missedNotes: 0,
      liveNotesPreserved: 0,
    };
    aggregate.attempts += 1;
    aggregate.passes += attempt.passed ? 1 : 0;
    aggregate.scoreTotal += attempt.scores.overall;
    aggregate.missedNotes += attempt.grading?.missed ?? 0;
    aggregate.liveNotesPreserved +=
      attempt.grading?.recognition?.offlineLivePreserved ?? 0;
    remediationMap.set(attempt.primaryProblem, aggregate);
  });
  const remediation = [...remediationMap.entries()].map(([problem, aggregate]) => ({
    problem,
    attempts: aggregate.attempts,
    passRate: aggregate.attempts === 0 ? 0 : aggregate.passes / aggregate.attempts,
    meanOverall: aggregate.attempts === 0 ? 0 : aggregate.scoreTotal / aggregate.attempts,
    missedNotes: aggregate.missedNotes,
    liveNotesPreserved: aggregate.liveNotesPreserved,
  })).sort((left, right) => left.meanOverall - right.meanOverall);
  return {
    generatedAt: Date.now(),
    student,
    checkpoint: learningProfileStore.getCheckpoint(studentId),
    sessions: state.sessions.filter((session) => session.studentId === studentId),
    activities: state.activities.filter((activity) => activity.studentId === studentId),
    remediation,
    scoring: buildReport(attempts),
  };
}
