import { useSyncExternalStore } from 'react';
import type { ScoreBreakdown, SpatialChordReport } from '../audio/timing';
import { learningProfileStore } from '../profiles/learningProfileStore';
import type { CURRICULUM_VERSION } from '../profiles/types';
import type { ExerciseMode, GenerationMode, PhaseId } from './types';

/**
 * Telemetry.
 *
 * One record per ATTEMPT, not per question — a student who fails at 0.8 and
 * passes at 0.4 produces two rows, and that difference is the whole point.
 * "4 out of 5" tells an instructor nothing actionable; "misses wide jumps,
 * clean on narrow ones" tells them what to teach on Tuesday.
 *
 * The store is a module singleton read through useSyncExternalStore, so
 * components subscribe without prop drilling and without the re-render
 * churn a Context holding a growing array would cause.
 */

export interface AttemptRecord {
  /** Monotonic within a session. */
  seq: number;
  /** Epoch ms when the attempt resolved. */
  at: number;

  conceptId: string;
  conceptIndex: number;
  conceptTitle: string;
  phase: PhaseId;
  phaseLabel: string;

  questionId: string;
  /** 1-based question inside the lesson loop. */
  questionNumber: number;
  /** 0-1 rung on the concept's ladder. The key field for reporting. */
  difficulty: number;
  mode: GenerationMode;
  /** Exercise presentation used for this attempt. Optional on legacy rows. */
  exerciseMode?: ExerciseMode;
  /** Curriculum revision, so future edits never reinterpret old credit. */
  curriculumVersion?: typeof CURRICULUM_VERSION;

  /** 1-based attempt at this question. */
  attemptNumber: number;
  passed: boolean;
  /** Listening start to resolution. */
  timeToAnswerMs: number;

  positionLabel: string;
  /**
   * The hand position itself, e.g. "C" or "Bb" — extracted from the label so
   * scores can be aggregated per shape across every concept that used it.
   * This is the axis the adaptive engine will eventually key on: a student
   * is rarely bad at "jumps", they are bad at jumps FROM a particular shape.
   */
  positionKey: string;
  /** Granular 0-5 breakdown for this attempt. */
  scores: ScoreBreakdown;
  expectedSequence: string[];
  tempoWindowSec: number | null;
  /** Fingering was inferred from reach, not detected. Lower confidence. */
  fingeringInferred: boolean;
  /** Instructor-facing evidence. Raw microphone audio is deliberately absent. */
  grading?: {
    recognition?: {
      strictAccepted: number;
      expectedRecovered: number;
      candidatesIgnored: number;
      pitchRejected: number;
      contextDisambiguated: number;
    };
    matched: number;
    expectedCount: number;
    missed: number;
    benignExtras: number;
    echoExtras: number;
    pedalled: boolean;
    hesitations: number;
    hardExtras: number;
    rhythm: {
      onBeat: number;
      evaluated: number;
      accuracy: number;
      meanAbsBeats: number;
      meanOnsetErrorBeats: number;
      meanIntervalErrorBeats: number;
      durationEvaluated: number;
      releaseEvaluated: number;
      durationAccuracy: number | null;
      meanDurationErrorBeats: number | null;
    } | null;
    transition: {
      measured: boolean;
      transitionSeconds: number | null;
      transitionBeats: number | null;
      writtenGapBeats: number;
      excessBeats: number | null;
      allowedExtraBeats: number;
      score: number;
      onTime: boolean;
    } | null;
    /** Root latency, chord completion, and random-search efficiency. */
    spatialChord?: SpatialChordReport | null;
  };
}

type Listener = () => void;

const STORAGE_KEY = 'eartrain.telemetry.v1';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Access can be denied in private/locked-down browsing contexts.
    return null;
  }
}

function isAttemptRecord(value: unknown): value is AttemptRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<AttemptRecord>;
  const scores = record.scores;
  const isFiniteNumber = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isFinite(candidate);
  return (
    isFiniteNumber(record.seq) &&
    isFiniteNumber(record.at) &&
    typeof record.conceptId === 'string' &&
    isFiniteNumber(record.conceptIndex) &&
    typeof record.conceptTitle === 'string' &&
    isFiniteNumber(record.phase) &&
    Number.isInteger(record.phase) &&
    record.phase >= 0 &&
    record.phase <= 7 &&
    typeof record.phaseLabel === 'string' &&
    typeof record.questionId === 'string' &&
    isFiniteNumber(record.questionNumber) &&
    isFiniteNumber(record.difficulty) &&
    typeof record.mode === 'string' &&
    (record.exerciseMode === undefined || typeof record.exerciseMode === 'string') &&
    (record.curriculumVersion === undefined || typeof record.curriculumVersion === 'string') &&
    isFiniteNumber(record.attemptNumber) &&
    typeof record.positionLabel === 'string' &&
    typeof record.positionKey === 'string' &&
    typeof record.passed === 'boolean' &&
    isFiniteNumber(record.timeToAnswerMs) &&
    typeof scores === 'object' &&
    scores !== null &&
    isFiniteNumber(scores.pitch) &&
    (scores.timing === null || isFiniteNumber(scores.timing)) &&
    isFiniteNumber(scores.cleanliness) &&
    isFiniteNumber(scores.overall) &&
    Array.isArray(record.expectedSequence) &&
    record.expectedSequence.every((note) => typeof note === 'string') &&
    (record.tempoWindowSec === null || isFiniteNumber(record.tempoWindowSec)) &&
    typeof record.fingeringInferred === 'boolean'
  );
}

function loadRecords(): readonly AttemptRecord[] {
  const localStorage = storage();
  if (!localStorage) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAttemptRecord) : [];
  } catch {
    // A malformed or inaccessible cache must never prevent the app loading.
    return [];
  }
}

class TelemetryStore {
  private records: readonly AttemptRecord[] = loadRecords();
  private listeners = new Set<Listener>();
  private seq = this.records.reduce((highest, record) => Math.max(highest, record.seq), 0);

  constructor() {
    // Idempotent stable attempt IDs make this safe on every reload. This is
    // the one-time bridge that preserves all pre-profile local credit.
    learningProfileStore.migrateLegacyAttempts(this.records);
  }

  private persist(): void {
    const localStorage = storage();
    if (!localStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // Telemetry is best-effort; quota/security errors should not stop drills.
    }
  }

  /** Next sequence number without consuming it. */
  peekSeq(): number {
    return this.seq;
  }

  record(entry: Omit<AttemptRecord, 'seq'>): AttemptRecord {
    const full: AttemptRecord = { ...entry, seq: ++this.seq };
    // New array identity — useSyncExternalStore needs the snapshot to change.
    this.records = [...this.records, full];
    this.persist();
    learningProfileStore.recordAttempt(full);
    this.listeners.forEach((fn) => fn());
    return full;
  }

  getSnapshot = (): readonly AttemptRecord[] => this.records;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  clear(): void {
    this.records = [];
    this.seq = 0;
    const localStorage = storage();
    if (localStorage) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Keep the in-memory clear successful even if storage is unavailable.
      }
    }
    this.listeners.forEach((fn) => fn());
  }
}

export const telemetry = new TelemetryStore();

/** Live view of every persisted attempt. */
export function useAttempts(): readonly AttemptRecord[] {
  return useSyncExternalStore(
    telemetry.subscribe,
    telemetry.getSnapshot,
    telemetry.getSnapshot,
  );
}

/* ---------------------------------------------------------------------------
   Analysis — turns raw attempts into something an instructor can act on.
   --------------------------------------------------------------------------- */

export type DifficultyBand = 'easy' | 'moderate' | 'hard';

/**
 * "C position (C4)" -> "C", "C Major chord (C4)" -> "C", and a movement
 * such as "C position (C4) → G position (G4)" -> "C→G".
 *
 * Keeping a shift as a pair matters: a weak C→G landing must not lower every
 * later drill that merely starts in C.
 */
export function positionKeyOf(label: string): string {
  const matches = [...label.matchAll(/([A-G][b#]?)\s+(?:position|(?:major|minor)\s+chord)/gi)];
  if (label.includes('→') && matches.length >= 2) {
    return `${matches[0][1]}→${matches[1][1]}`;
  }
  return matches[0]?.[1] ?? label;
}

export function bandOf(difficulty: number): DifficultyBand {
  if (difficulty < 0.34) return 'easy';
  if (difficulty < 0.67) return 'moderate';
  return 'hard';
}

export interface BandStats {
  band: DifficultyBand;
  attempts: number;
  passes: number;
  passRate: number;
  medianTimeMs: number | null;
}

export interface ConceptSummary {
  conceptId: string;
  conceptIndex: number;
  conceptTitle: string;
  phaseLabel: string;
  attempts: number;
  passes: number;
  passRate: number;
  firstAttemptPassRate: number;
  /** Hardest rung cleared. null if never passed. */
  highestDifficultyPassed: number | null;
  /** Easiest rung missed — where the ceiling actually is. */
  lowestDifficultyFailed: number | null;
  medianTimeMs: number | null;
  bands: BandStats[];
  /** True where fingering was inferred from reach rather than detected. */
  containsInferredFingering: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function statsForBand(records: AttemptRecord[], band: DifficultyBand): BandStats {
  const inBand = records.filter((r) => bandOf(r.difficulty) === band);
  const passes = inBand.filter((r) => r.passed).length;
  return {
    band,
    attempts: inBand.length,
    passes,
    passRate: inBand.length === 0 ? 0 : passes / inBand.length,
    medianTimeMs: median(inBand.map((r) => r.timeToAnswerMs)),
  };
}

export function summariseConcept(records: readonly AttemptRecord[]): ConceptSummary[] {
  const byConcept = new Map<string, AttemptRecord[]>();
  records.forEach((r) => {
    const bucket = byConcept.get(r.conceptId);
    if (bucket) bucket.push(r);
    else byConcept.set(r.conceptId, [r]);
  });

  return [...byConcept.values()]
    .map((group) => {
      const head = group[0];
      const passed = group.filter((r) => r.passed);
      const failed = group.filter((r) => !r.passed);
      const firstAttempts = group.filter((r) => r.attemptNumber === 1);
      const firstPasses = firstAttempts.filter((r) => r.passed).length;

      return {
        conceptId: head.conceptId,
        conceptIndex: head.conceptIndex,
        conceptTitle: head.conceptTitle,
        phaseLabel: head.phaseLabel,
        attempts: group.length,
        passes: passed.length,
        passRate: group.length === 0 ? 0 : passed.length / group.length,
        firstAttemptPassRate:
          firstAttempts.length === 0 ? 0 : firstPasses / firstAttempts.length,
        highestDifficultyPassed:
          passed.length === 0 ? null : Math.max(...passed.map((r) => r.difficulty)),
        lowestDifficultyFailed:
          failed.length === 0 ? null : Math.min(...failed.map((r) => r.difficulty)),
        medianTimeMs: median(group.map((r) => r.timeToAnswerMs)),
        bands: (['easy', 'moderate', 'hard'] as const).map((b) => statsForBand(group, b)),
        containsInferredFingering: group.some((r) => r.fingeringInferred),
      };
    })
    .sort((a, b) => a.conceptIndex - b.conceptIndex);
}

/* ---------------------------------------------------------------------------
   Per-position analysis — the scaffolding the adaptive engine will read.
   --------------------------------------------------------------------------- */

export interface PositionStats {
  positionKey: string;
  attempts: number;
  passes: number;
  passRate: number;
  meanPitch: number;
  meanTiming: number | null;
  meanCleanliness: number;
  meanOverall: number;
  /** Hardest rung cleared on this shape, and the easiest one missed. */
  highestDifficultyPassed: number | null;
  lowestDifficultyFailed: number | null;
  /** Which of the three axes is dragging this position down. */
  weakestAxis: 'pitch' | 'timing' | 'cleanliness';
  /** Concepts this position has been drilled in. */
  conceptIds: string[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function summarisePositions(records: readonly AttemptRecord[]): PositionStats[] {
  const groups = new Map<string, AttemptRecord[]>();
  records.forEach((r) => {
    const key = r.positionKey || positionKeyOf(r.positionLabel);
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  });

  return [...groups.entries()]
    .map(([positionKey, group]) => {
      const passed = group.filter((r) => r.passed);
      const failed = group.filter((r) => !r.passed);
      const timed = group.filter((r) => r.scores.timing !== null);

      const meanPitch = mean(group.map((r) => r.scores.pitch));
      const meanTiming = timed.length === 0 ? null : mean(timed.map((r) => r.scores.timing as number));
      const meanCleanliness = mean(group.map((r) => r.scores.cleanliness));

      const axes: [PositionStats['weakestAxis'], number][] = [
        ['pitch', meanPitch],
        ['cleanliness', meanCleanliness],
      ];
      if (meanTiming !== null) axes.push(['timing', meanTiming]);
      const weakestAxis = axes.sort((a, b) => a[1] - b[1])[0][0];

      return {
        positionKey,
        attempts: group.length,
        passes: passed.length,
        passRate: group.length === 0 ? 0 : passed.length / group.length,
        meanPitch,
        meanTiming,
        meanCleanliness,
        meanOverall: mean(group.map((r) => r.scores.overall)),
        highestDifficultyPassed:
          passed.length === 0 ? null : Math.max(...passed.map((r) => r.difficulty)),
        lowestDifficultyFailed:
          failed.length === 0 ? null : Math.min(...failed.map((r) => r.difficulty)),
        weakestAxis,
        conceptIds: [...new Set(group.map((r) => r.conceptId))],
      };
    })
    .sort((a, b) => a.meanOverall - b.meanOverall);
}

export interface AdaptiveSuggestion {
  positionKey: string;
  conceptId: string;
  meanOverall: number;
  attempts: number;
  /** Negative = ease off, positive = push harder. Feed to nextDifficulty. */
  difficultyNudge: number;
  reason: string;
}

/**
 * Scaffolding for automatic adaptation.
 *
 * Produces a per (position, concept) recommendation rather than a single
 * global level, because that is the resolution a teacher actually works at.
 * `minAttempts` guards against reacting to one bad take.
 */
export function adaptiveProfile(
  records: readonly AttemptRecord[],
  minAttempts = 3,
  recentAttemptLimit = 8,
): AdaptiveSuggestion[] {
  const groups = new Map<string, AttemptRecord[]>();
  records.forEach((r) => {
    const key = `${r.positionKey || positionKeyOf(r.positionLabel)}|${r.conceptId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  });

  return [...groups.entries()]
    .map(([key, group]) => [
      key,
      [...group]
        .sort((a, b) => a.seq - b.seq || a.at - b.at)
        .slice(-Math.max(minAttempts, recentAttemptLimit)),
    ] as const)
    .filter(([, g]) => g.length >= minAttempts)
    .map(([key, g]) => {
      const [positionKey, conceptId] = key.split('|');
      const meanOverall = mean(g.map((r) => r.scores.overall));
      let difficultyNudge = 0;
      let reason = 'Holding steady.';
      if (meanOverall >= 4.3) {
        difficultyNudge = 0.25;
        reason = 'Consistently clean — ready for harder material.';
      } else if (meanOverall < 2.5) {
        difficultyNudge = -0.35;
        reason = 'Struggling — ease back and rebuild.';
      } else if (meanOverall < 3.4) {
        difficultyNudge = -0.15;
        reason = 'Shaky — hold or ease slightly.';
      }
      return { positionKey, conceptId, meanOverall, attempts: g.length, difficultyNudge, reason };
    })
    .sort((a, b) => a.meanOverall - b.meanOverall);
}

export interface InstructorReport {
  generatedAt: number;
  totalAttempts: number;
  totalPasses: number;
  overallPassRate: number;
  sessionMs: number;
  concepts: ConceptSummary[];
  positions: PositionStats[];
  /** Root-finding and physical chord-building outcomes, grouped by chord root. */
  spatialChords: SpatialChordStats[];
  adaptive: AdaptiveSuggestion[];
  meanScores: ScoreBreakdown;
  /** Concepts where the student cleared easy rungs but missed harder ones. */
  weakSpots: {
    conceptId: string;
    conceptTitle: string;
    clearedUpTo: number | null;
    failsFrom: number | null;
    note: string;
  }[];
  /** Attempts whose fingering could not be verified acoustically. */
  lowConfidenceAttempts: number;
}

export interface SpatialChordStats {
  positionKey: string;
  attempts: number;
  completions: number;
  completionRate: number;
  medianRootLatencySec: number | null;
  medianBuildLatencySec: number | null;
  medianShellLatencySec: number | null;
  medianColorToneLatencySec: number | null;
  meanWrongGuesses: number;
  meanEfficiencyScore: number;
}

export function summariseSpatialChords(
  records: readonly AttemptRecord[],
): SpatialChordStats[] {
  const groups = new Map<string, AttemptRecord[]>();
  records.forEach((record) => {
    if (!record.grading?.spatialChord) return;
    const key = record.positionKey || positionKeyOf(record.positionLabel);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  });

  return [...groups.entries()].map(([positionKey, group]) => {
    const reports = group
      .map((record) => record.grading?.spatialChord)
      .filter((report): report is SpatialChordReport => Boolean(report));
    const rootLatencies = reports
      .map((report) => report.rootLatencySec)
      .filter((value): value is number => value !== null);
    const buildLatencies = reports
      .map((report) => report.buildLatencySec)
      .filter((value): value is number => value !== null);
    const shellLatencies = reports
      .map((report) => report.shellLatencySec)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const colorLatencies = reports
      .map((report) => report.colorToneLatencySec)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const completions = reports.filter((report) => report.completed).length;
    return {
      positionKey,
      attempts: reports.length,
      completions,
      completionRate: reports.length === 0 ? 0 : completions / reports.length,
      medianRootLatencySec: rootLatencies.length === 0
        ? null
        : (median(rootLatencies.map((value) => value * 1000)) as number) / 1000,
      medianBuildLatencySec: buildLatencies.length === 0
        ? null
        : (median(buildLatencies.map((value) => value * 1000)) as number) / 1000,
      medianShellLatencySec: shellLatencies.length === 0
        ? null
        : (median(shellLatencies.map((value) => value * 1000)) as number) / 1000,
      medianColorToneLatencySec: colorLatencies.length === 0
        ? null
        : (median(colorLatencies.map((value) => value * 1000)) as number) / 1000,
      meanWrongGuesses: mean(reports.map(
        (report) => report.wrongRootGuesses + report.wrongShapeGuesses,
      )),
      meanEfficiencyScore: mean(reports.map((report) => report.efficiencyScore)),
    };
  }).sort((a, b) => a.completionRate - b.completionRate || b.meanWrongGuesses - a.meanWrongGuesses);
}

/**
 * The payload Step 5 posts back to reading.oclef.com.
 *
 * `weakSpots` is the actionable part: the boundary between what a student
 * can do and what they cannot, per concept.
 */
export function buildReport(records: readonly AttemptRecord[]): InstructorReport {
  const concepts = summariseConcept(records);
  const passes = records.filter((r) => r.passed).length;
  const times = records.map((r) => r.at);

  const weakSpots = concepts
    .filter((c) => c.lowestDifficultyFailed !== null)
    .map((c) => {
      const cleared = c.highestDifficultyPassed;
      const fails = c.lowestDifficultyFailed;
      const note =
        cleared === null
          ? 'Missed every attempt, including the easiest.'
          : fails !== null && cleared >= fails
            ? 'Inconsistent — passed and failed at similar difficulty.'
            : 'Clean below this point, breaks down above it.';
      return {
        conceptId: c.conceptId,
        conceptTitle: c.conceptTitle,
        clearedUpTo: cleared,
        failsFrom: fails,
        note,
      };
    });

  const timed = records.filter((r) => r.scores.timing !== null);
  const meanScores: ScoreBreakdown = {
    pitch: mean(records.map((r) => r.scores.pitch)),
    timing: timed.length === 0 ? null : mean(timed.map((r) => r.scores.timing as number)),
    cleanliness: mean(records.map((r) => r.scores.cleanliness)),
    overall: mean(records.map((r) => r.scores.overall)),
  };

  return {
    generatedAt: Date.now(),
    positions: summarisePositions(records),
    spatialChords: summariseSpatialChords(records),
    adaptive: adaptiveProfile(records),
    meanScores,
    totalAttempts: records.length,
    totalPasses: passes,
    overallPassRate: records.length === 0 ? 0 : passes / records.length,
    sessionMs: times.length < 2 ? 0 : Math.max(...times) - Math.min(...times),
    concepts,
    weakSpots,
    lowConfidenceAttempts: records.filter((r) => r.fingeringInferred).length,
  };
}
