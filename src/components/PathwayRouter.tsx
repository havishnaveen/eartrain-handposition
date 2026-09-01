import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import ExerciseLayout from './ExerciseLayout';
import ExerciseView from './ExerciseView';
import type {
  ExerciseStatus,
  ExerciseViewHandle,
  OrientationNotice,
  OrientationNoticeKind,
} from './ExerciseView';
import SessionComplete from './SessionComplete';
import AnchorShiftCue from './AnchorShiftCue';
import StaffCue from './StaffCue';
import type { StaffCueHandle } from './StaffCue';
import {
  CONCEPTS,
  INITIAL_SIGNAL,
  TOTAL_CONCEPTS,
  getConcept,
  nextDifficulty,
  nextMode,
  openingDifficulty,
  updateSignal,
} from '../curriculum/curriculum';
import type { PerformanceSignal } from '../curriculum/curriculum';
import { makeRandom } from '../curriculum/positions';
import {
  adaptiveProfile,
  buildReport,
  positionKeyOf,
  telemetry,
  useAttempts,
} from '../curriculum/telemetry';
import type { AttemptRecord } from '../curriculum/telemetry';
import type { Question } from '../curriculum/types';
import type { PositionProofSpec } from '../curriculum/types';
import { useDrillAudio } from '../audio/useDrillAudio';
import type { RecognitionDiagnostics } from '../audio/useDrillAudio';
import {
  DEFAULT_BPM,
  gradeSequence,
  passesOverallScore,
  pitchToMidi,
  planForQuestion,
} from '../audio/timing';
import type {
  DetectedNote,
  DrillPlan,
  GradeResult,
  SpatialChordPerformance,
} from '../audio/timing';
import { CURRICULUM_VERSION } from '../profiles/types';
import type { ResolvedStudentLaunch } from '../profiles/types';
import { learningProfileStore } from '../profiles/learningProfileStore';

const MAX_ATTEMPTS = 2;
const REPS_ADDED_PER_MISS = 2;
/** Briefly acknowledge analysis without delaying an already-complete grade. */
const MIN_ANALYSIS_VISIBLE_MS = 320;
const ORIENTATION_STORAGE_KEY = 'eartrain.orientation-cues.v1';
/**
 * A standalone run must be able to reach every lesson. Integrations may pass a
 * smaller cap, but the app default covers even the maximum expanded loop in
 * every lesson so later material is never stranded behind a hidden stop.
 */
export const DEFAULT_SESSION_QUESTION_CAP = CONCEPTS.reduce(
  (total, concept) => total + concept.maxQuestionCount,
  0,
);

type OrientationSeen = Record<OrientationNoticeKind, boolean>;

const EMPTY_ORIENTATION_SEEN: OrientationSeen = {
  register: false,
  'left-hand': false,
  'both-hands': false,
  'dual-proof': false,
};

function readOrientationSeen(): OrientationSeen {
  if (typeof window === 'undefined') return { ...EMPTY_ORIENTATION_SEEN };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORIENTATION_STORAGE_KEY) ?? '{}');
    return {
      register: parsed?.register === true,
      'left-hand': parsed?.['left-hand'] === true,
      'both-hands': parsed?.['both-hands'] === true,
      'dual-proof': parsed?.['dual-proof'] === true,
    };
  } catch {
    return { ...EMPTY_ORIENTATION_SEEN };
  }
}

function markOrientationSeen(kind: OrientationNoticeKind): void {
  if (typeof window === 'undefined') return;
  const next = { ...readOrientationSeen(), [kind]: true };
  try {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can reject storage; the current in-memory dismissal
    // still works and the teaching flow must remain usable.
  }
}

function orientationNoticesFor(question: Question): OrientationNotice[] {
  const notices: OrientationNotice[] = [];
  const anchorPitch = question.positionProof?.proofNotes[0]?.pitch ?? question.expectedSequence[0];
  const pitchMatch = /^([A-G](?:#|b)?)(-?\d+)$/.exec(anchorPitch ?? '');
  if (pitchMatch) {
    const [, noteName, octaveText] = pitchMatch;
    const octave = Number(octaveText);
    if (octave !== 4) {
      const register = octave <= 3 ? 'Bass' : 'Treble';
      notices.push({
        kind: 'register',
        title: `Stop — find ${register} ${noteName}`,
        message: `This is not Middle ${noteName}. Move to the ${register === 'Bass' ? 'lower, left side' : 'higher, right side'} of the piano and find ${register} ${noteName} before continuing.`,
        buttonLabel: `I found ${register} ${noteName}`,
      });
    }
  }

  const actualHand = question.cue.staves[0]?.hand;
  const handScope = question.handScope ?? actualHand;
  const hasDualProof = handScope === 'both' && positionProofsForQuestion(question).length > 1;
  if (handScope === 'left') {
    notices.push({
      kind: 'left-hand',
      title: 'Stop — switch hands',
      message: 'Use your LEFT HAND for this exercise. Put your right hand in your lap before continuing.',
      buttonLabel: 'My left hand is ready',
    });
  } else if (hasDualProof) {
    notices.push({
      kind: 'dual-proof',
      title: 'Two hand checks — one at a time',
      message: 'First prove the RIGHT HAND position. Then prove the LEFT HAND position. Complete both checks before the two-hand exercise begins.',
      buttonLabel: 'I’ll check RH, then LH',
    });
  } else if (handScope === 'both') {
    notices.push({
      kind: 'both-hands',
      title: 'Stop — use both hands',
      message: 'This exercise uses your LEFT HAND and RIGHT HAND. Place both hands before continuing; follow the score to see whether they alternate or play together.',
      buttonLabel: 'Both hands are ready',
    });
  }
  return notices;
}

function firstUnseenOrientationNotice(question: Question): OrientationNotice | null {
  const seen = readOrientationSeen();
  return orientationNoticesFor(question).find((notice) => !seen[notice.kind]) ?? null;
}

export interface PathwayState {
  lesson: number;
  question: number;
  loopSize: number;
  attempt: number;
  status: ExerciseStatus;
  report: GradeResult | null;
  performedNotes: readonly DetectedNote[];
  repeatQuestion: boolean;
  /** True once this exact generated question has passed its position gate. */
  proofCompleted: boolean;
  /** Zero-based gate within Question.positionProofs. */
  proofIndex: number;
  ordinal: number;

  difficulty: number;
  current: Question;
  signal: PerformanceSignal;

  listeningStartedAt: number;
  analysisStartedAt: number;

  questionsServed: number;
  finished: boolean;
  endedOnCap: boolean;
  lessonsReached: number;

  pendingRecord: Omit<AttemptRecord, 'seq'> | null;
  recordSeq: number;

  seed: number;
  cap: number;
}

export type PathwayAction =
  | { type: 'PROOF_START'; questionId: string }
  | { type: 'PROOF_SUCCESS'; questionId: string }
  | { type: 'PROOF_CANCEL'; questionId: string }
  | { type: 'PROOF_UNLOCK'; questionId: string }
  | { type: 'CHORD_START'; questionId: string }
  | { type: 'CHORD_LISTEN'; questionId: string; now: number }
  | { type: 'CHORD_ROOT'; questionId: string }
  | { type: 'CHORD_DISCOVERED'; questionId: string }
  | { type: 'CHORD_CANCEL'; questionId: string }
  | { type: 'MEMORY_START'; questionId: string }
  | { type: 'START'; questionId: string }
  | { type: 'START_CANCEL'; questionId: string }
  | { type: 'PLAY_START'; questionId: string; now: number }
  | { type: 'ANALYSIS_START'; questionId: string; now: number }
  | {
      type: 'RESOLVE';
      result: GradeResult;
      detected: readonly DetectedNote[];
      recognition: RecognitionDiagnostics;
      questionId: string;
      now: number;
      identity?: {
        studentId: string;
        launchId?: string;
        assignmentId?: string;
      };
    }
  | { type: 'CONTINUE'; difficultyNudge: number };

const clampDifficulty = (difficulty: number): number =>
  Math.min(1, Math.max(0, difficulty));

export function initialStatusFor(
  question: Question,
  proofCompleted = false,
): ExerciseStatus {
  return question.positionProof && !proofCompleted ? 'position-prompt' : 'prompt';
}

export function positionProofsForQuestion(question: Question): readonly PositionProofSpec[] {
  return question.positionProofs?.length
    ? question.positionProofs
    : question.positionProof
      ? [question.positionProof]
      : [];
}

function difficultyNudgeFor(
  lesson: number,
  positionLabel: string,
  studentId: string,
): number {
  const conceptId = getConcept(lesson).id;
  const positionKey = positionKeyOf(positionLabel);
  return (
    adaptiveProfile(
      telemetry.getSnapshot().filter(
        (attempt) => attempt.studentId === undefined || attempt.studentId === studentId,
      ),
    ).find(
      (suggestion) =>
        suggestion.conceptId === conceptId && suggestion.positionKey === positionKey,
    )?.difficultyNudge ?? 0
  );
}

export function generateFor(
  lesson: number,
  question: number,
  ordinal: number,
  difficulty: number,
  signal: PerformanceSignal,
  seed: number,
): Question {
  const concept = getConcept(lesson);
  const rand = makeRandom(seed + lesson * 7919 + question * 131 + ordinal);
  return concept.generate(ordinal, rand, difficulty, nextMode(signal), question);
}

export function createInitialPathwayState({
  seed,
  cap,
  initialLesson = 1,
  initialProofCompleted = false,
}: {
  seed: number;
  cap: number;
  initialLesson?: number;
  /**
   * Dev-only escape hatch (see src/dev/DevLessonJumper.tsx): seeds
   * `proofCompleted` so a jumped-to `prove-it` lesson opens straight on
   * `prompt` instead of gating on `position-prompt`. Always false in the
   * normal student flow.
   */
  initialProofCompleted?: boolean;
}): PathwayState {
  const lesson = Math.min(TOTAL_CONCEPTS, Math.max(1, Math.round(initialLesson)));
  const current = generateFor(lesson, 1, 0, 0, INITIAL_SIGNAL, seed);
  return {
    lesson,
    question: 1,
    loopSize: getConcept(lesson).baseQuestionCount,
    attempt: 1,
    status: initialStatusFor(current, initialProofCompleted),
    report: null,
    performedNotes: [],
    repeatQuestion: false,
    proofCompleted: initialProofCompleted,
    proofIndex: 0,
    ordinal: 0,
    difficulty: current.difficulty,
    current,
    signal: INITIAL_SIGNAL,
    listeningStartedAt: 0,
    analysisStartedAt: 0,
    questionsServed: 0,
    finished: false,
    endedOnCap: false,
    lessonsReached: lesson,
    pendingRecord: null,
    recordSeq: 0,
    seed,
    cap,
  };
}

export function pathwayReducer(state: PathwayState, action: PathwayAction): PathwayState {
  if (state.finished) return state;

  switch (action.type) {
    case 'PROOF_START':
      return action.questionId === state.current.id && state.status === 'position-prompt'
        ? { ...state, status: 'proving' }
        : state;

    case 'PROOF_SUCCESS':
      if (action.questionId !== state.current.id || state.status !== 'proving') return state;
      return {
        ...state,
        status: 'proof-success',
        proofCompleted:
          state.proofIndex >= positionProofsForQuestion(state.current).length - 1,
      };

    case 'PROOF_CANCEL':
      return action.questionId === state.current.id && state.status === 'proving'
        ? { ...state, status: 'position-prompt' }
        : state;

    case 'PROOF_UNLOCK':
      if (action.questionId !== state.current.id || state.status !== 'proof-success') return state;
      if (state.proofIndex + 1 < positionProofsForQuestion(state.current).length) {
        return {
          ...state,
          status: 'position-prompt',
          proofIndex: state.proofIndex + 1,
          proofCompleted: false,
        };
      }
      return { ...state, status: 'prompt', proofCompleted: true };

    case 'CHORD_START':
      return action.questionId === state.current.id &&
        state.status === 'prompt' &&
        state.current.exerciseMode === 'spatial-chord'
        ? { ...state, status: 'chord-cue' }
        : state;

    case 'CHORD_LISTEN':
      return action.questionId === state.current.id && state.status === 'chord-cue'
        ? { ...state, status: 'chord-root', listeningStartedAt: action.now }
        : state;

    case 'CHORD_ROOT':
      return action.questionId === state.current.id && state.status === 'chord-root'
        ? { ...state, status: 'chord-build' }
        : state;

    case 'CHORD_DISCOVERED':
      if (
        action.questionId !== state.current.id ||
        !(['chord-root', 'chord-build'] as ExerciseStatus[]).includes(state.status)
      ) return state;
      return {
        ...state,
        status: 'chord-complete',
        // Completion metadata only; no acoustic score is calculated or shown.
        report: {
          scores: { pitch: 5, timing: null, cleanliness: 5, overall: 5 },
          passed: true,
          matched: 0,
          expectedCount: 0,
          missed: 0,
          benignExtras: 0,
          echoExtras: 0,
          pedalled: false,
          hesitations: 0,
          hardExtras: 0,
          extras: [],
          firstMissIndex: -1,
          playedNames: [],
          rhythm: null,
          transition: null,
          spatialChord: null,
          detail: 'Self-directed nearby-chord discovery complete.',
        },
        repeatQuestion: false,
      };

    case 'CHORD_CANCEL':
      return action.questionId === state.current.id && state.status === 'chord-cue'
        ? { ...state, status: 'prompt' }
        : state;

    case 'MEMORY_START':
      return action.questionId === state.current.id && state.status === 'prompt' && state.current.exerciseMode === 'blind-memory'
        ? { ...state, status: 'memory-preview' }
        : state;

    case 'START':
      return action.questionId === state.current.id && (state.status === 'prompt' || state.status === 'memory-preview')
        ? { ...state, status: 'leadin' }
        : state;

    case 'START_CANCEL':
      return action.questionId === state.current.id && state.status === 'leadin'
        ? { ...state, status: 'prompt' }
        : state;

    case 'PLAY_START':
      // The audio clock reached the downbeat. Timing starts here, so
      // timeToAnswer measures playing rather than counting in.
      if (action.questionId !== state.current.id || state.status !== 'leadin') return state;
      return { ...state, status: 'listening', listeningStartedAt: action.now };

    case 'ANALYSIS_START':
      if (
        action.questionId !== state.current.id ||
        !(['listening', 'chord-root', 'chord-build'] as ExerciseStatus[]).includes(state.status)
      ) return state;
      return { ...state, status: 'grading', analysisStartedAt: action.now };

    case 'RESOLVE': {
      if (action.questionId !== state.current.id || state.status !== 'grading') return state;

      const concept = getConcept(state.lesson);
      // The displayed Overall score is the only retry authority. Normalize
      // here as a routing boundary as well as in the grader so an older,
      // cached or externally supplied `passed` flag can never retry a 4.6.
      const passed = state.current.exerciseMode === 'spatial-chord'
        ? action.result.passed
        : passesOverallScore(action.result.scores.overall);
      const result = action.result.passed === passed
        ? action.result
        : { ...action.result, passed };
      const performanceEndedAt = state.analysisStartedAt || action.now;
      const timeToAnswerMs = Math.max(0, performanceEndedAt - state.listeningStartedAt);

      const record: Omit<AttemptRecord, 'seq'> = {
        at: action.now,
        studentId: action.identity?.studentId,
        launchId: action.identity?.launchId,
        assignmentId: action.identity?.assignmentId,
        conceptId: concept.id,
        conceptIndex: concept.index,
        conceptTitle: concept.title,
        phase: concept.phase,
        phaseLabel: concept.phaseLabel,
        primaryProblem: concept.primaryProblem,
        problemTags: concept.problemTags,
        questionId: state.current.id,
        questionNumber: state.question,
        difficulty: state.current.difficulty,
        mode: state.current.mode,
        exerciseMode: state.current.exerciseMode,
        curriculumVersion: CURRICULUM_VERSION,
        attemptNumber: state.attempt,
        passed,
        timeToAnswerMs,
        positionLabel: state.current.positionLabel,
        positionKey: positionKeyOf(state.current.positionLabel),
        scores: result.scores,
        expectedSequence: state.current.expectedSequence,
        tempoWindowSec: state.current.tempoWindowSec,
        fingeringInferred: Boolean(state.current.fingeringInferred),
        grading: {
          recognition: action.recognition,
          matched: result.matched,
          expectedCount: result.expectedCount,
          missed: result.missed,
          benignExtras: result.benignExtras,
          echoExtras: result.echoExtras,
          pedalled: result.pedalled,
          hesitations: result.hesitations,
          hardExtras: result.hardExtras,
          rhythm: result.rhythm,
          transition: result.transition,
          spatialChord: result.spatialChord,
        },
      };

      const retry = !passed && state.attempt < MAX_ATTEMPTS;

      return {
        ...state,
        // Chord by Ear is a guided physical-discovery task, not a recital.
        // Keep its measurements for adaptive telemetry, but do not send a
        // young student through the conventional Pitch/Timing/Cleanliness
        // report after every three-note shape.
        status: state.current.exerciseMode === 'spatial-chord'
          ? 'chord-complete'
          : 'report',
        report: result,
        performedNotes: action.detected,
        repeatQuestion: retry,
        listeningStartedAt: 0,
        analysisStartedAt: 0,
        pendingRecord: record,
        recordSeq: state.recordSeq + 1,
        signal: retry
          ? state.signal
          : updateSignal(state.signal, {
              passed,
              difficulty: state.current.difficulty,
              attempts: state.attempt,
              timeMs: timeToAnswerMs,
              tempoWindowSec: state.current.tempoWindowSec,
            }),
      };
    }

    case 'CONTINUE': {
      if (
        (state.status !== 'report' && state.status !== 'chord-complete') ||
        !state.report
      ) return state;
      const base = {
        ...state,
        status: initialStatusFor(state.current, state.proofCompleted),
        report: null,
        performedNotes: [],
        repeatQuestion: false,
        analysisStartedAt: 0,
        pendingRecord: null,
      };

      if (state.repeatQuestion) {
        return {
          ...base,
          status: initialStatusFor(state.current, false),
          proofCompleted: false,
          proofIndex: 0,
          attempt: state.attempt + 1,
        };
      }

      const concept = getConcept(state.lesson);
      const questionsServed = state.questionsServed + 1;

      const grownLoop =
        !state.report.passed
          ? Math.min(concept.maxQuestionCount, state.loopSize + REPS_ADDED_PER_MISS)
          : state.loopSize;

      // Natural pathway completion wins over the safety cap. This matters
      // when a caller deliberately sets the cap to the exact pathway length.
      const completedFinalLesson =
        state.lesson >= TOTAL_CONCEPTS && state.question >= grownLoop;
      if (completedFinalLesson) {
        return { ...base, questionsServed, finished: true, endedOnCap: false };
      }

      if (questionsServed >= state.cap) {
        return { ...base, questionsServed, finished: true, endedOnCap: true };
      }

      if (state.question < grownLoop) {
        const question = state.question + 1;
        const ordinal = state.ordinal + 1;
        const adaptiveDifficulty = clampDifficulty(
          nextDifficulty(state.difficulty, state.signal, concept.baseQuestionCount) +
            action.difficultyNudge,
        );
        const current = generateFor(
          state.lesson,
          question,
          ordinal,
          adaptiveDifficulty,
          state.signal,
          state.seed,
        );
        return {
          ...base,
          status: initialStatusFor(current),
          questionsServed,
          loopSize: grownLoop,
          question,
          ordinal,
          attempt: 1,
          difficulty: current.difficulty,
          current,
          proofCompleted: false,
          proofIndex: 0,
        };
      }

      const lesson = state.lesson + 1;
      const ordinal = state.ordinal + 1;
      const adaptiveDifficulty = openingDifficulty(state.signal);
      const current = generateFor(lesson, 1, ordinal, adaptiveDifficulty, state.signal, state.seed);
      return {
        ...base,
        status: initialStatusFor(current),
        questionsServed,
        lesson,
        lessonsReached: Math.max(state.lessonsReached, lesson),
        question: 1,
        loopSize: getConcept(lesson).baseQuestionCount,
        attempt: 1,
        ordinal,
        difficulty: current.difficulty,
        current,
        proofCompleted: false,
        proofIndex: 0,
      };
    }

    default:
      return state;
  }
}

export interface PathwayRouterProps {
  seed?: number;
  sessionQuestionCap?: number;
  returnUrl?: string;
  bpm?: number;
  initialLesson?: number;
  /** Dev-only: see `createInitialPathwayState`. Always false for students. */
  initialProofCompleted?: boolean;
  externalLaunch?: ResolvedStudentLaunch;
}

/**
 * PathwayRouter
 *
 * Owns the pathway, the adaptive loop, the session cap, and the bridge to
 * the audio engine.
 *
 * Two rules keep this stable:
 *  1. The current Question lives in state and is produced INSIDE the reducer.
 *     Once the next question depends on the last result, deriving it in
 *     render reads state that the effect writing it also depends on.
 *  2. The scrubber never touches React state. onFrame writes straight to the
 *     SVG through StaffCue's imperative handle, 60 times a second, with zero
 *     renders.
 */
export function PathwayRouter({
  seed = 20260802,
  sessionQuestionCap = DEFAULT_SESSION_QUESTION_CAP,
  returnUrl,
  bpm = DEFAULT_BPM,
  initialLesson = 1,
  initialProofCompleted = false,
  externalLaunch,
}: PathwayRouterProps) {
  const resolvedCap = sessionQuestionCap ?? DEFAULT_SESSION_QUESTION_CAP;
  const [state, dispatch] = useReducer(
    pathwayReducer,
    { seed, cap: resolvedCap, initialLesson, initialProofCompleted },
    createInitialPathwayState,
  );
  const attempts = useAttempts();
  const sessionStartSeq = useRef(telemetry.peekSeq()).current;
  const activeStudentId = learningProfileStore.getSnapshot().activeStudentId;
  const sessionAttempts = attempts.filter(
    (attempt) =>
      attempt.seq > sessionStartSeq &&
      (attempt.studentId === undefined || attempt.studentId === activeStudentId),
  );
  const concept = getConcept(state.lesson);
  const question = state.current;
  const activePositionProof =
    positionProofsForQuestion(question)[state.proofIndex] ?? question.positionProof;
  const difficultyNudge = difficultyNudgeFor(
    state.lesson,
    question.positionLabel,
    activeStudentId,
  );

  const staffRef = useRef<StaffCueHandle>(null);
  const exerciseViewRef = useRef<ExerciseViewHandle>(null);
  const [memorySecondsRemaining, setMemorySecondsRemaining] = useState(6);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [orientationNotice, setOrientationNotice] = useState<OrientationNotice | null>(
    () => firstUnseenOrientationNotice(question),
  );

  // Read by onFinish, which is created once and must not close over a stale
  // question after the pathway advances.
  const questionRef = useRef(question);
  questionRef.current = question;
  const lessonRef = useRef(state.lesson);
  lessonRef.current = state.lesson;
  const externalLaunchRef = useRef(externalLaunch);
  externalLaunchRef.current = externalLaunch;

  // Plan for the drill currently running. Read inside onFrame, which is
  // created once and must not close over a stale plan.
  const planRef = useRef<DrillPlan | null>(null);
  const activeProofQuestionIdRef = useRef<string | null>(null);
  const activeDrillQuestionIdRef = useRef<string | null>(null);

  const handleFrame = useCallback((beatPosition: number) => {
    const plan = planRef.current;
    if (plan) {
      exerciseViewRef.current?.seekToProgress(
        Math.max(0, beatPosition) / Math.max(1, plan.totalBeats),
      );
    }
    // Guide-note drills have one notehead and five played notes — there is
    // nothing for a scrubber to track, so it stays hidden while the
    // metronome keeps time.
    if (planRef.current?.guideNote) return;
    staffRef.current?.seekToBeat(beatPosition);
  }, []);

  const handlePlayStart = useCallback((audioTime: number) => {
    const questionId = activeDrillQuestionIdRef.current;
    if (!questionId) return;
    // Audio-clock time of the downbeat, so rhythm can be scored against it.
    playStartRef.current = audioTime;
    dispatch({ type: 'PLAY_START', questionId, now: Date.now() });
  }, []);

  const playStartRef = useRef(0);
  const analysisStartedAtRef = useRef(0);
  const reportTimerRef = useRef(0);
  const proofUnlockTimerRef = useRef(0);
  const proofStartingRef = useRef(false);
  const drillStartingRef = useRef(false);
  const chordStartingRef = useRef(false);
  const memoryStartingRef = useRef(false);
  const memoryTickTimerRef = useRef(0);
  const memoryFinishTimerRef = useRef(0);

  const handleAnalysisStart = useCallback(() => {
    const questionId = activeDrillQuestionIdRef.current;
    if (!questionId) return;
    const now = Date.now();
    analysisStartedAtRef.current = now;
    setAnalysisProgress(8);
    staffRef.current?.hide();
    dispatch({ type: 'ANALYSIS_START', questionId, now });
  }, []);

  const handleAnalysisProgress = useCallback((percent: number) => {
    setAnalysisProgress((current) => Math.max(current, Math.min(100, Math.max(0, percent))));
  }, []);

  const handleFinish = useCallback((
    detected: DetectedNote[],
    recognition: RecognitionDiagnostics,
    spatialPerformance?: SpatialChordPerformance,
  ) => {
    const questionId = activeDrillQuestionIdRef.current;
    if (!questionId || questionRef.current.id !== questionId) return;
    if (!analysisStartedAtRef.current) {
      const now = Date.now();
      analysisStartedAtRef.current = now;
      dispatch({ type: 'ANALYSIS_START', questionId, now });
    }
    const active = questionRef.current;
    setAnalysisProgress(100);
    const result = gradeSequence(active.expectedSequence, detected, {
      plan: planRef.current ?? undefined,
      playStartTime: playStartRef.current,
      lessonLevel: lessonRef.current,
      totalLessons: TOTAL_CONCEPTS,
      anchorShift: active.anchorShift,
      spatialChord: active.spatialChord,
      spatialPerformance,
      exerciseMode: active.exerciseMode,
    });

    // Audio analysis is genuinely complete here. Keep the visual transition
    // on screen for a consistent minimum without pretending the delay makes
    // the underlying grade more accurate.
    const elapsed = Date.now() - analysisStartedAtRef.current;
    const remaining = active.exerciseMode === 'spatial-chord'
      ? 0
      : Math.max(120, MIN_ANALYSIS_VISIBLE_MS - elapsed);
    if (reportTimerRef.current) window.clearTimeout(reportTimerRef.current);
    reportTimerRef.current = window.setTimeout(() => {
      reportTimerRef.current = 0;
      dispatch({
        type: 'RESOLVE',
        result,
        detected,
        recognition,
        questionId,
        now: Date.now(),
        identity: {
          studentId: learningProfileStore.getSnapshot().activeStudentId,
          launchId: externalLaunchRef.current?.launchId,
          assignmentId: externalLaunchRef.current?.assignment?.id,
        },
      });
    }, remaining);
  }, []);

  const handleProofSuccess = useCallback(() => {
    const questionId = activeProofQuestionIdRef.current;
    if (!questionId || questionRef.current.id !== questionId) return;
    dispatch({ type: 'PROOF_SUCCESS', questionId });
    if (proofUnlockTimerRef.current) window.clearTimeout(proofUnlockTimerRef.current);
    proofUnlockTimerRef.current = window.setTimeout(() => {
      proofUnlockTimerRef.current = 0;
      dispatch({ type: 'PROOF_UNLOCK', questionId });
      if (activeProofQuestionIdRef.current === questionId) {
        activeProofQuestionIdRef.current = null;
      }
    }, 1050);
  }, []);

  const handleProofListenStart = useCallback(() => {
    const questionId = activeProofQuestionIdRef.current;
    if (!questionId || questionRef.current.id !== questionId) return;
    dispatch({ type: 'PROOF_START', questionId });
  }, []);

  const handleSpatialListenStart = useCallback((audioTime: number) => {
    const questionId = activeDrillQuestionIdRef.current;
    if (!questionId || questionRef.current.id !== questionId) return;
    playStartRef.current = audioTime;
    dispatch({ type: 'CHORD_LISTEN', questionId, now: Date.now() });
  }, []);

  const handleSpatialRootFound = useCallback(() => {
    const questionId = activeDrillQuestionIdRef.current;
    if (!questionId || questionRef.current.id !== questionId) return;
    dispatch({ type: 'CHORD_ROOT', questionId });
  }, []);

  const handleSpatialFound = useCallback(() => {
    const active = questionRef.current;
    if (active.exerciseMode !== 'spatial-chord') return;
    if (state.status === 'chord-root') {
      dispatch({ type: 'CHORD_ROOT', questionId: active.id });
    } else if (state.status === 'chord-build') {
      dispatch({ type: 'CHORD_DISCOVERED', questionId: active.id });
    }
  }, [state.status]);

  const audio = useDrillAudio({
    onFrame: handleFrame,
    onPlayStart: handlePlayStart,
    onAnalysisStart: handleAnalysisStart,
    onAnalysisProgress: handleAnalysisProgress,
    onFinish: handleFinish,
    onProofListenStart: handleProofListenStart,
    onProofSuccess: handleProofSuccess,
    onSpatialListenStart: handleSpatialListenStart,
    onSpatialRootFound: handleSpatialRootFound,
  });

  const beginRef = useRef(audio.begin);
  beginRef.current = audio.begin;
  const prepareRef = useRef(audio.prepare);
  prepareRef.current = audio.prepare;
  const beginProofRef = useRef(audio.beginProof);
  beginProofRef.current = audio.beginProof;
  const beginSpatialChordRef = useRef(audio.beginSpatialChord);
  beginSpatialChordRef.current = audio.beginSpatialChord;

  const startActualDrill = useCallback((requestedQuestionId?: string) => {
    const active = questionRef.current;
    const questionId = requestedQuestionId ?? active.id;
    if (active.id !== questionId || drillStartingRef.current) return;
    drillStartingRef.current = true;
    activeDrillQuestionIdRef.current = questionId;
    activeProofQuestionIdRef.current = null;
    if (proofUnlockTimerRef.current) window.clearTimeout(proofUnlockTimerRef.current);
    proofUnlockTimerRef.current = 0;
    const plan = planForQuestion(active, bpm);
    planRef.current = plan;
    if (reportTimerRef.current) window.clearTimeout(reportTimerRef.current);
    reportTimerRef.current = 0;
    analysisStartedAtRef.current = 0;
    setAnalysisProgress(0);
    exerciseViewRef.current?.resetProgress();
    staffRef.current?.hide();
    dispatch({ type: 'START', questionId });
    void beginRef.current(plan)
      .then((started) => {
        drillStartingRef.current = false;
        if (!started && activeDrillQuestionIdRef.current === questionId) {
          activeDrillQuestionIdRef.current = null;
          dispatch({ type: 'START_CANCEL', questionId });
        }
      })
      .catch(() => {
        drillStartingRef.current = false;
        if (activeDrillQuestionIdRef.current === questionId) {
          activeDrillQuestionIdRef.current = null;
          dispatch({ type: 'START_CANCEL', questionId });
        }
      });
  }, [bpm]);

  const clearMemoryTimers = useCallback(() => {
    if (memoryTickTimerRef.current) window.clearInterval(memoryTickTimerRef.current);
    if (memoryFinishTimerRef.current) window.clearTimeout(memoryFinishTimerRef.current);
    memoryTickTimerRef.current = 0;
    memoryFinishTimerRef.current = 0;
  }, []);

  const handleStart = useCallback(() => {
    // Orientation changes are deliberately blocking. A young student must
    // confirm the new register/hand before any microphone or count-in starts.
    if (orientationNotice) return;
    const active = questionRef.current;

    if (
      active.exerciseMode === 'spatial-chord' &&
      active.spatialChord &&
      state.status === 'prompt'
    ) {
      if (chordStartingRef.current) return;
      chordStartingRef.current = true;
      const questionId = active.id;
      activeDrillQuestionIdRef.current = questionId;
      activeProofQuestionIdRef.current = null;
      planRef.current = planForQuestion(active, bpm);
      analysisStartedAtRef.current = 0;
      exerciseViewRef.current?.resetProgress();
      staffRef.current?.hide();
      dispatch({ type: 'CHORD_START', questionId });
      void beginSpatialChordRef.current(active.spatialChord)
        .then((started) => {
          chordStartingRef.current = false;
          if (!started && activeDrillQuestionIdRef.current === questionId) {
            activeDrillQuestionIdRef.current = null;
            dispatch({ type: 'CHORD_CANCEL', questionId });
          }
        })
        .catch(() => {
          chordStartingRef.current = false;
          if (activeDrillQuestionIdRef.current === questionId) {
            activeDrillQuestionIdRef.current = null;
            dispatch({ type: 'CHORD_CANCEL', questionId });
          }
        });
      return;
    }

    const activeProof = positionProofsForQuestion(active)[state.proofIndex] ?? active.positionProof;
    if (activeProof && state.status === 'position-prompt') {
      if (proofStartingRef.current) return;
      proofStartingRef.current = true;
      const questionId = active.id;
      activeProofQuestionIdRef.current = questionId;
      // beginProof emits PROOF_START at the exact point its worklet becomes
      // ready. Until then the prompt stays visible and the requesting mic
      // state disables Start, so the highlighted first note never invites an
      // attack during calibration.
      void beginProofRef.current(activeProof)
        .then((started) => {
          proofStartingRef.current = false;
          if (!started && activeProofQuestionIdRef.current === questionId) {
            activeProofQuestionIdRef.current = null;
            dispatch({ type: 'PROOF_CANCEL', questionId });
          }
        })
        .catch(() => {
          proofStartingRef.current = false;
          if (activeProofQuestionIdRef.current === questionId) {
            activeProofQuestionIdRef.current = null;
            dispatch({ type: 'PROOF_CANCEL', questionId });
          }
        });
      return;
    }

    if (active.exerciseMode === 'blind-memory' && state.status === 'prompt') {
      if (memoryStartingRef.current) return;
      memoryStartingRef.current = true;
      const questionId = active.id;
      // Warm the graph before the clock starts. Browser permission time must
      // never consume part of the student's three-second memory preview.
      void prepareRef.current().then((ready) => {
        memoryStartingRef.current = false;
        if (!ready || questionRef.current.id !== questionId) return;
        clearMemoryTimers();
        const previewSeconds = active.blindMemory?.previewSeconds ?? 6;
        const deadline = performance.now() + previewSeconds * 1000;
        setMemorySecondsRemaining(previewSeconds);
        dispatch({ type: 'MEMORY_START', questionId });
        memoryTickTimerRef.current = window.setInterval(() => {
          setMemorySecondsRemaining(Math.max(0, (deadline - performance.now()) / 1000));
        }, 50);
        memoryFinishTimerRef.current = window.setTimeout(() => {
          clearMemoryTimers();
          setMemorySecondsRemaining(0);
          startActualDrill(questionId);
        }, previewSeconds * 1000);
      }).catch(() => {
        memoryStartingRef.current = false;
      });
      return;
    }

    startActualDrill(active.id);
  }, [bpm, clearMemoryTimers, orientationNotice, startActualDrill, state.proofIndex, state.status]);

  // Lets a student mid-search re-hear the chord demo without losing the
  // lesson — e.g. after a CDN hiccup left them listening for a sound that
  // never played, or they simply want another pass before guessing again.
  // beginSpatialChord already resets its own detection state safely, so
  // this is just handleStart's spatial-chord branch minus the 'prompt' gate.
  const handleReplayChord = useCallback(() => {
    const active = questionRef.current;
    if (active.exerciseMode !== 'spatial-chord' || !active.spatialChord) return;
    if (!(['chord-cue', 'chord-root', 'chord-build'] as ExerciseStatus[]).includes(state.status)) return;
    if (chordStartingRef.current) return;
    chordStartingRef.current = true;
    const questionId = active.id;
    activeDrillQuestionIdRef.current = questionId;
    activeProofQuestionIdRef.current = null;
    planRef.current = planForQuestion(active, bpm);
    analysisStartedAtRef.current = 0;
    exerciseViewRef.current?.resetProgress();
    staffRef.current?.hide();
    dispatch({ type: 'CHORD_START', questionId });
    void beginSpatialChordRef.current(active.spatialChord)
      .then((started) => {
        chordStartingRef.current = false;
        if (!started && activeDrillQuestionIdRef.current === questionId) {
          activeDrillQuestionIdRef.current = null;
          dispatch({ type: 'CHORD_CANCEL', questionId });
        }
      })
      .catch(() => {
        chordStartingRef.current = false;
        if (activeDrillQuestionIdRef.current === questionId) {
          activeDrillQuestionIdRef.current = null;
          dispatch({ type: 'CHORD_CANCEL', questionId });
        }
      });
  }, [bpm, state.status]);

  /* Telemetry drain. Ref-guarded so it cannot dispatch and therefore cannot
     loop, and idempotent under StrictMode's double-invoked effects. */
  const drainedRef = useRef(0);
  useEffect(() => {
    if (state.pendingRecord && state.recordSeq > drainedRef.current) {
      drainedRef.current = state.recordSeq;
      telemetry.record(state.pendingRecord);
      learningProfileStore.recordActivity(
        'exercise.completed',
        {
          conceptId: state.pendingRecord.conceptId,
          lessonIndex: state.pendingRecord.conceptIndex,
          questionNumber: state.pendingRecord.questionNumber,
          attemptNumber: state.pendingRecord.attemptNumber,
          exerciseMode: state.pendingRecord.exerciseMode ?? 'standard',
          overallScore: state.pendingRecord.scores.overall,
          passed: state.pendingRecord.passed,
          remediationProblem: state.pendingRecord.primaryProblem ?? '',
        },
        externalLaunchRef.current ? 'reading.oclef.com' : 'eartrain-web',
      );
    }
  }, [state.recordSeq, state.pendingRecord]);

  const sessionActivityStartedRef = useRef(false);
  useEffect(() => {
    if (sessionActivityStartedRef.current) return;
    sessionActivityStartedRef.current = true;
    learningProfileStore.recordActivity(
      'session.started',
      {
        initialLesson: state.lesson,
        assignmentId: externalLaunchRef.current?.assignment?.id ?? '',
        remediationProblem: externalLaunchRef.current?.assignment?.problem ?? '',
      },
      externalLaunchRef.current ? 'reading.oclef.com' : 'eartrain-web',
    );
  }, [state.lesson]);

  const viewedQuestionsRef = useRef(new Set<string>());
  useEffect(() => {
    if (viewedQuestionsRef.current.has(question.id)) return;
    viewedQuestionsRef.current.add(question.id);
    learningProfileStore.recordActivity(
      'exercise.viewed',
      {
        conceptId: question.conceptId,
        lessonIndex: state.lesson,
        questionNumber: state.question,
        exerciseMode: question.exerciseMode,
        remediationProblem: concept.primaryProblem ?? '',
      },
      externalLaunchRef.current ? 'reading.oclef.com' : 'eartrain-web',
    );
  }, [concept.primaryProblem, question.conceptId, question.exerciseMode, question.id, state.lesson, state.question]);

  const startedAttemptKeysRef = useRef(new Set<string>());
  useEffect(() => {
    if (!(['proving', 'leadin', 'chord-cue'] as ExerciseStatus[]).includes(state.status)) return;
    const key = `${question.id}:${state.attempt}`;
    if (startedAttemptKeysRef.current.has(key)) return;
    startedAttemptKeysRef.current.add(key);
    learningProfileStore.recordActivity(
      'exercise.started',
      {
        conceptId: question.conceptId,
        lessonIndex: state.lesson,
        questionNumber: state.question,
        attemptNumber: state.attempt,
        exerciseMode: question.exerciseMode,
      },
      externalLaunchRef.current ? 'reading.oclef.com' : 'eartrain-web',
    );
  }, [question.conceptId, question.exerciseMode, question.id, state.attempt, state.lesson, state.question, state.status]);

  const handleContinue = useCallback(() => {
    activeProofQuestionIdRef.current = null;
    activeDrillQuestionIdRef.current = null;
    proofStartingRef.current = false;
    drillStartingRef.current = false;
    chordStartingRef.current = false;
    memoryStartingRef.current = false;
    clearMemoryTimers();
    if (proofUnlockTimerRef.current) window.clearTimeout(proofUnlockTimerRef.current);
    proofUnlockTimerRef.current = 0;
    dispatch({ type: 'CONTINUE', difficultyNudge });
  }, [clearMemoryTimers, difficultyNudge]);

  useEffect(() => {
    setOrientationNotice(firstUnseenOrientationNotice(question));
    proofStartingRef.current = false;
    drillStartingRef.current = false;
    chordStartingRef.current = false;
    memoryStartingRef.current = false;
  }, [question.id]);

  const acknowledgeOrientation = useCallback(() => {
    if (!orientationNotice) return;
    markOrientationSeen(orientationNotice.kind);
    if (orientationNotice.kind === 'dual-proof') markOrientationSeen('both-hands');
    setOrientationNotice(firstUnseenOrientationNotice(questionRef.current));
  }, [orientationNotice]);

  const handlePlaybackFrame = useCallback((beat: number) => {
    staffRef.current?.seekToBeat(beat);
  }, []);

  const handlePlaybackEnd = useCallback(() => {
    staffRef.current?.hide();
  }, []);

  // Park the scrubber whenever a new question is on screen.
  useEffect(() => {
    if (state.status === 'prompt' || state.status === 'position-prompt') {
      staffRef.current?.hide();
      exerciseViewRef.current?.resetProgress();
    }
  }, [state.status, state.current.id]);

  // Stop any drill still in flight if the session ends underneath it.
  const abortRef = useRef(audio.abort);
  abortRef.current = audio.abort;
  useEffect(() => {
    if (state.finished) {
      activeProofQuestionIdRef.current = null;
      activeDrillQuestionIdRef.current = null;
      abortRef.current();
    }
  }, [state.finished]);

  const completedActivityRef = useRef(false);
  useEffect(() => {
    if (!state.finished || completedActivityRef.current) return;
    completedActivityRef.current = true;
    learningProfileStore.recordActivity(
      'session.completed',
      {
        questionsServed: state.questionsServed,
        lessonsReached: state.lessonsReached,
        endedOnCap: state.endedOnCap,
      },
      externalLaunchRef.current ? 'reading.oclef.com' : 'eartrain-web',
    );
    learningProfileStore.endActiveSession();
  }, [state.endedOnCap, state.finished, state.lessonsReached, state.questionsServed]);

  useEffect(() => () => {
    if (reportTimerRef.current) window.clearTimeout(reportTimerRef.current);
    if (proofUnlockTimerRef.current) window.clearTimeout(proofUnlockTimerRef.current);
    clearMemoryTimers();
  }, [clearMemoryTimers]);

  // Only reachable during the two-measure count-in ('leadin'), before the
  // downbeat hands off to 'listening'. Once recording has actually started,
  // there is no cancel: an interrupted attempt would otherwise be graded as
  // a real, silent playthrough. audio.abort() tears down the scheduled
  // clicks and the not-yet-armed detector before the state resets to
  // 'prompt', so a re-Start begins completely fresh.
  const handleCancelStart = useCallback(() => {
    if (state.status !== 'leadin') return;
    const questionId = questionRef.current.id;
    drillStartingRef.current = false;
    activeDrillQuestionIdRef.current = null;
    abortRef.current();
    dispatch({ type: 'START_CANCEL', questionId });
  }, [state.status]);

  if (state.finished) {
    const passes = sessionAttempts.filter((a) => a.passed).length;
    const scoredAttempts = sessionAttempts.filter(
      (attempt) => attempt.exerciseMode !== 'spatial-chord',
    );
    const report = buildReport(sessionAttempts);
    return (
      <SessionComplete
        meanScores={scoredAttempts.length === 0 ? null : report.meanScores}
        weakestPosition={report.positions[0]?.positionKey ?? null}
        questionsAnswered={state.questionsServed}
        passRate={sessionAttempts.length === 0 ? 0 : passes / sessionAttempts.length}
        lessonsReached={state.lessonsReached}
        totalLessons={TOTAL_CONCEPTS}
        endedOnCap={state.endedOnCap}
        returnUrl={returnUrl}
      />
    );
  }

  return (
    <ExerciseLayout
      questionNumber={state.question}
      questionsInLoop={state.loopSize}
      lessonNumber={state.lesson}
      totalLessons={TOTAL_CONCEPTS}
      lessonTitle={concept.title}
      lessonFocus={concept.focus}
      phaseLabel={concept.phaseLabel}
    >
      <ExerciseView
        ref={exerciseViewRef}
        status={state.status}
        instruction={question.instruction}
        exerciseMode={question.exerciseMode}
        positionProof={activePositionProof}
        positionProofIndex={state.proofIndex}
        positionProofCount={positionProofsForQuestion(question).length}
        handScope={question.handScope}
        blindMemory={question.blindMemory}
        anchorShift={question.anchorShift}
        spatialChord={question.spatialChord}
        memorySecondsRemaining={memorySecondsRemaining}
        analysisProgress={analysisProgress}
        onStart={handleStart}
        onCancelStart={handleCancelStart}
        startLabel={
          state.attempt > 1
            ? 'Try again'
            : 'Start'
        }
        micStatus={audio.micStatus}
        beatLabel={audio.beatLabel}
        isDownbeat={audio.isDownbeat}
        report={state.report}
        reportPlan={planRef.current}
        reportDetectedNotes={state.performedNotes}
        reportPlayStartTime={playStartRef.current}
        recordingUrl={audio.recordingUrl}
        onPlaybackFrame={handlePlaybackFrame}
        onPlaybackEnd={handlePlaybackEnd}
        onNext={handleContinue}
        nextLabel={state.repeatQuestion ? 'Try This Drill Again' : 'Next Drill'}
        inputLevel={audio.inputLevel}
        detectedNotes={audio.detectedNames}
        guidedFeedback={audio.guidedFeedback}
        proofProgress={audio.proofProgress}
        spatialProgress={audio.spatialProgress}
        spatialFoundMidi={audio.spatialFoundMidi}
        spatialWrongGuesses={audio.spatialWrongGuesses}
        spatialAudioIssue={audio.spatialAudioIssue}
        onReplayChord={handleReplayChord}
        onSpatialFound={handleSpatialFound}
        orientationNotice={orientationNotice}
        onAcknowledgeOrientation={acknowledgeOrientation}
      >
        {question.anchorShift ? (
          <AnchorShiftCue
            ref={staffRef}
            cue={question.cue}
            notationScale={2.3}
            shift={question.anchorShift}
            secondsPerBeat={60 / bpm}
            accentColor="#ef6a47"
            inkColor="#242237"
          />
        ) : (
          <StaffCue
            ref={staffRef}
            cue={question.cue}
            notationScale={2.3}
            accentColor="#ef6a47"
            inkColor="#242237"
            successPitches={
              question.exerciseMode === 'spatial-chord' && question.spatialChord
                ? question.spatialChord.chordPitches.filter((pitch) => {
                    const midi = pitchToMidi(pitch);
                    return midi !== null && audio.spatialFoundMidi.includes(midi);
                  })
                : []
            }
          />
        )}
      </ExerciseView>
    </ExerciseLayout>
  );
}

export default PathwayRouter;
