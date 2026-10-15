import type { Question } from '../curriculum/types';
import type { DiagnosticNotation } from '../diagnostics/registry';

export const STATION_TOPICS = [
  { id: 'clef-transposition', label: 'Clef Confusion' },
  { id: 'key-signature', label: 'Key Signatures' },
  { id: 'mid-line-clef-change', label: 'Clef Changes' },
  { id: 'octave-displacement', label: 'Register Reading' },
  { id: 'accidental-carryover', label: 'Accidental Carryover' },
  { id: 'hand-position', label: 'Finger-to-Note Reading' },
  { id: 'cross-over-under', label: 'Crossing Continuity' },
] as const;
export type StationTopic = typeof STATION_TOPICS[number]['id'];
export type PracticeMode = 'station' | 'exhaustive';
export type StationNeed = 'adaptive' | 'audio' | 'visual';
export type Archetype = 'ear' | 'visual' | 'classification' | 'balanced';
export type QuestionKind = 'audio' | 'visual' | 'rule' | 'cause' | 'play';
export type DailyTriad = [StationQuestion, StationQuestion, StationQuestion];

export interface StationQuestion {
  id: string;
  topic: StationTopic;
  kind: QuestionKind;
  fingerprint: string;
  keyName: string;
  question: Question;
  notation: DiagnosticNotation;
  musicXML: string;
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
  targetIndex: number;
  clue: { prompt: string; choices: string[]; correct: number; explanation: string };
  audio?: { pitches: string[]; durations: string[]; hesitationBefore?: number; hesitationSeconds?: number };
}

export interface QuestionResult {
  questionId: string;
  kind: QuestionKind;
  firstChoice: number;
  finalChoice: number;
  firstAttemptCorrect: boolean;
  correct: boolean;
  hintsUsed: number;
  guidedCorrect: boolean | null;
  attempts: number;
  /** Active reading/decision time; sample loading, playback, and hidden time excluded. */
  responseMs: number;
  replayCount: number;
  completedAt: number;
}
export interface QuestionRun {
  phase: 'ready' | 'answering' | 'clue' | 'clue-feedback' | 'retry' | 'feedback';
  firstChoice: number | null;
  finalChoice: number | null;
  guidedChoice: number | null;
  hintsUsed: number;
  heard: boolean;
  responseMs: number;
  replayCount: number;
}
export interface StationSession {
  id: string;
  date: string;
  topic: StationTopic;
  need: StationNeed;
  archetype: Archetype;
  seed: string;
  questions: DailyTriad;
  results: QuestionResult[];
  run: QuestionRun;
  startedAt: number | null;
  completedAt: number | null;
}
export interface StationProgress {
  status: 'active' | 'maintenance';
  masteredOn: string | null;
  nextDue: string | null;
  streak: number;
  lastPerfectDate: string | null;
}
export interface StationData {
  schemaVersion: 1;
  revision: number;
  timeZone: string;
  assignments: StationTopic[];
  preferences: Partial<Record<StationTopic, StationNeed>>;
  sessions: Record<string, StationSession>;
  summaries: Record<string, Pick<StationSession, 'id' | 'date' | 'topic' | 'results' | 'completedAt'>>;
  progress: Partial<Record<StationTopic, StationProgress>>;
}
export const isStationTopic = (id: string): id is StationTopic => STATION_TOPICS.some(topic => topic.id === id);
