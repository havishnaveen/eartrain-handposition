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
import { useDrillAudio } from '../audio/useDrillAudio';
import type { RecognitionDiagnostics } from '../audio/useDrillAudio';
import { DEFAULT_BPM, gradeSequence, planForQuestion } from '../audio/timing';
import type {
  DetectedNote,
  DrillPlan,
  GradeResult,
  SpatialChordPerformance,
} from '../audio/timing';
import { CURRICULUM_VERSION } from '../profiles/types';

const MAX_ATTEMPTS = 2;
const REPS_ADDED_PER_MISS = 2;
/** Product pacing: Antigravity's extended constellation window. */
const MIN_ANALYSIS_VISIBLE_MS = 3500;
const ORIENTATION_STORAGE_KEY = 'eartrain.orientation-cues.v1';

type OrientationSeen = Record<OrientationNoticeKind, boolean>;

const EMPTY_ORIENTATION_SEEN: OrientationSeen = {
  register: false,
  'left-hand': false,
  'both-hands': false,
};

function readOrientationSeen(): OrientationSeen {
  if (typeof window === 'undefined') return { ...EMPTY_ORIENTATION_SEEN };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORIENTATION_STORAGE_KEY) ?? '{}');
    return {
      register: parsed?.register === true,
      'left-hand': parsed?.['left-hand'] === true,
      'both-hands': parsed?.['both-hands'] === true,
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
        title: 'New piano area',
        message: `${register} ${noteName}. Move your hand ${register === 'Bass' ? 'lower' : 'higher'} on the piano.`,
      });
    }
  }

  const actualHand = question.cue.staves[0]?.hand;
  const handScope = question.handScope ?? actualHand;
  if (handScope === 'left') {
    notices.push({
      kind: 'left-hand',
      title: 'Hand change',
      message: 'Use your left hand now. Follow the purple hand picture.',
    });
  } else if (handScope === 'both') {
    notices.push({
      kind: 'both-hands',
      title: 'Both hands now',
      message: 'This exercise uses both hands. Follow both hand pictures.',
    });
  }
  return notices;
}

function firstUnseenOrientationNotice(question: Question): OrientationNotice | null {
  const seen = readOrientationSeen();
  return orientationNoticesFor(question).find((notice) => !seen[notice.kind]) ?? null;
}

interface PathwayState {
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

type PathwayAction =
  | { type: 'PROOF_START'; questionId: string }
  | { type: 'PROOF_SUCCESS'; questionId: string }
  | { type: 'PROOF_CANCEL'; questionId: string }
  | { type: 'PROOF_UNLOCK'; questionId: string }
  | { type: 'CHORD_START'; questionId: string }
  | { type: 'CHORD_LISTEN'; questionId: string; now: number }
  | { type: 'CHORD_ROOT'; questionId: string }
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
    }
  | { type: 'CONTINUE'; difficultyNudge: number };

const clampDifficulty = (difficulty: number): number =>
  Math.min(1, Math.max(0, difficulty));

function initialStatusFor(
  question: Question,
  proofCompleted = false,
): ExerciseStatus {
  return question.exerciseMode === 'prove-it' && !proofCompleted ? 'position-prompt' : 'prompt';
}

function difficultyNudgeFor(lesson: number, positionLabel: string): number {
  const conceptId = getConcept(lesson).id;
  const positionKey = positionKeyOf(positionLabel);
  return (
    adaptiveProfile(telemetry.getSnapshot()).find(
      (suggestion) =>
        suggestion.conceptId === conceptId && suggestion.positionKey === positionKey,
    )?.difficultyNudge ?? 0
  );
}

function generateFor(
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

function createInitialPathwayState({ seed, cap }: { seed: number; cap: number }): PathwayState {
  const current = generateFor(1, 1, 0, 0, INITIAL_SIGNAL, seed);
  return {
    lesson: 1,
    question: 1,
    loopSize: CONCEPTS[0].baseQuestionCount,
    attempt: 1,
    status: initialStatusFor(current),
    report: null,
    performedNotes: [],
    repeatQuestion: false,
    proofCompleted: false,
    ordinal: 0,
    difficulty: 0,
    current,
    signal: INITIAL_SIGNAL,
    listeningStartedAt: 0,
    analysisStartedAt: 0,
    questionsServed: 0,
    finished: false,
    endedOnCap: false,
    lessonsReached: 1,
    pendingRecord: null,
    recordSeq: 0,
    seed,
    cap,
  };
}

function pathwayReducer(state: PathwayState, action: PathwayAction): PathwayState {
  if (state.finished) return state;

  switch (action.type) {
    case 'PROOF_START':
      return action.questionId === state.current.id && state.status === 'position-prompt'
        ? { ...state, status: 'proving' }
        : state;

    case 'PROOF_SUCCESS':
      return action.questionId === state.current.id && state.status === 'proving'
        ? { ...state, status: 'proof-success', proofCompleted: true }
        : state;

    case 'PROOF_CANCEL':
      return action.questionId === state.current.id && state.status === 'proving'
        ? { ...state, status: 'position-prompt' }
        : state;

    case 'PROOF_UNLOCK':
      return action.questionId === state.current.id && state.status === 'proof-success'
        ? { ...state, status: 'prompt' }
        : state;

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
      const passed = action.result.passed;
      const performanceEndedAt = state.analysisStartedAt || action.now;
      const timeToAnswerMs = Math.max(0, performanceEndedAt - state.listeningStartedAt);

      const record: Omit<AttemptRecord, 'seq'> = {
        at: action.now,
        conceptId: concept.id,
        conceptIndex: concept.index,
        conceptTitle: concept.title,
        phase: concept.phase,
        phaseLabel: concept.phaseLabel,
        questionId: state.current.id,
        questionNumber: state.question,
        difficulty: state.difficulty,
        mode: state.current.mode,
        exerciseMode: state.current.exerciseMode,
        curriculumVersion: CURRICULUM_VERSION,
        attemptNumber: state.attempt,
        passed,
        timeToAnswerMs,
        positionLabel: state.current.positionLabel,
        positionKey: positionKeyOf(state.current.positionLabel),
        scores: action.result.scores,
        expectedSequence: state.current.expectedSequence,
        tempoWindowSec: state.current.tempoWindowSec,
        fingeringInferred: Boolean(state.current.fingeringInferred),
        grading: {
          recognition: action.recognition,
          matched: action.result.matched,
          expectedCount: action.result.expectedCount,
          missed: action.result.missed,
          benignExtras: action.result.benignExtras,
          echoExtras: action.result.echoExtras,
          pedalled: action.result.pedalled,
          hesitations: action.result.hesitations,
          hardExtras: action.result.hardExtras,
          rhythm: action.result.rhythm,
          transition: action.result.transition,
          spatialChord: action.result.spatialChord,
        },
      };

      const retry = !passed && state.attempt < MAX_ATTEMPTS;

      return {
        ...state,
        status: 'report',
        report: action.result,
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
              difficulty: state.difficulty,
              attempts: state.attempt,
              timeMs: timeToAnswerMs,
              tempoWindowSec: state.current.tempoWindowSec,
            }),
      };
    }

    case 'CONTINUE': {
      if (state.status !== 'report' || !state.report) return state;
      const base = {
        ...state,
        status: initialStatusFor(state.current, state.proofCompleted),
        report: null,
        performedNotes: [],
        repeatQuestion: false,
        analysisStartedAt: 0,
        pendingRecord: null,
      };

      if (state.repeatQuestion) return { ...base, attempt: state.attempt + 1 };

      const concept = getConcept(state.lesson);
      const questionsServed = state.questionsServed + 1;

      if (questionsServed >= state.cap) {
        return { ...base, questionsServed, finished: true, endedOnCap: true };
      }

      const grownLoop =
        !state.report.passed
          ? Math.min(concept.maxQuestionCount, state.loopSize + REPS_ADDED_PER_MISS)
          : state.loopSize;

      if (state.question < grownLoop) {
        const question = state.question + 1;
        const ordinal = state.ordinal + 1;
        const difficulty = clampDifficulty(
          nextDifficulty(state.difficulty, state.signal, concept.baseQuestionCount) +
            action.difficultyNudge,
        );
        const current = generateFor(state.lesson, question, ordinal, difficulty, state.signal, state.seed);
        return {
          ...base,
          status: initialStatusFor(current),
          questionsServed,
          loopSize: grownLoop,
          question,
          ordinal,
          attempt: 1,
          difficulty,
          current,
          proofCompleted: false,
        };
      }

      if (state.lesson >= TOTAL_CONCEPTS) {
        return { ...base, questionsServed, finished: true, endedOnCap: false };
      }

      const lesson = state.lesson + 1;
      const ordinal = state.ordinal + 1;
      const difficulty = openingDifficulty(state.signal);
      const current = generateFor(lesson, 1, ordinal, difficulty, state.signal, state.seed);
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
        difficulty,
        current,
        proofCompleted: false,
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
  sessionQuestionCap = 15,
  returnUrl,
  bpm = DEFAULT_BPM,
}: PathwayRouterProps) {
  const [state, dispatch] = useReducer(
    pathwayReducer,
    { seed, cap: sessionQuestionCap },
    createInitialPathwayState,
  );
  const attempts = useAttempts();
  const sessionStartSeq = useRef(telemetry.peekSeq()).current;
  const sessionAttempts = attempts.filter((attempt) => attempt.seq > sessionStartSeq);
  const concept = getConcept(state.lesson);
  const question = state.current;
  const difficultyNudge = difficultyNudgeFor(state.lesson, question.positionLabel);

  const staffRef = useRef<StaffCueHandle>(null);
  const exerciseViewRef = useRef<ExerciseViewHandle>(null);
  const [memorySecondsRemaining, setMemorySecondsRemaining] = useState(3);
  const [orientationNotice, setOrientationNotice] = useState<OrientationNotice | null>(null);

  // Read by onFinish, which is created once and must not close over a stale
  // question after the pathway advances.
  const questionRef = useRef(question);
  questionRef.current = question;
  const lessonRef = useRef(state.lesson);
  lessonRef.current = state.lesson;

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
    staffRef.current?.hide();
    dispatch({ type: 'ANALYSIS_START', questionId, now });
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
    const result = gradeSequence(active.expectedSequence, detected, {
      plan: planRef.current ?? undefined,
      playStartTime: playStartRef.current,
      lessonLevel: lessonRef.current,
      totalLessons: TOTAL_CONCEPTS,
      anchorShift: active.anchorShift,
      spatialChord: active.spatialChord,
      spatialPerformance,
    });

    // Audio analysis is genuinely complete here. Keep the visual transition
    // on screen for a consistent minimum without pretending the delay makes
    // the underlying grade more accurate.
    const elapsed = Date.now() - analysisStartedAtRef.current;
    const remaining = Math.max(0, MIN_ANALYSIS_VISIBLE_MS - elapsed);
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

  const audio = useDrillAudio({
    onFrame: handleFrame,
    onPlayStart: handlePlayStart,
    onAnalysisStart: handleAnalysisStart,
    onFinish: handleFinish,
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

    if (active.exerciseMode === 'prove-it' && active.positionProof && state.status === 'position-prompt') {
      if (proofStartingRef.current) return;
      proofStartingRef.current = true;
      const questionId = active.id;
      activeProofQuestionIdRef.current = questionId;
      // Own the transition before awaiting microphone warm-up. Otherwise a
      // fast audio success can arrive while the reducer still says prompt.
      dispatch({ type: 'PROOF_START', questionId });
      // Enter the visual listening state only after the worklet has finished
      // its short room-baseline warm-up and is genuinely accepting onsets.
      // This prevents a child from playing the highlighted first note into a
      // detector that is not ready yet.
      void beginProofRef.current(active.positionProof)
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
        const previewSeconds = active.blindMemory?.previewSeconds ?? 3;
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
  }, [bpm, clearMemoryTimers, startActualDrill, state.status]);

  /* Telemetry drain. Ref-guarded so it cannot dispatch and therefore cannot
     loop, and idempotent under StrictMode's double-invoked effects. */
  const drainedRef = useRef(0);
  useEffect(() => {
    if (state.pendingRecord && state.recordSeq > drainedRef.current) {
      drainedRef.current = state.recordSeq;
      telemetry.record(state.pendingRecord);
    }
  }, [state.recordSeq, state.pendingRecord]);

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

  useEffect(() => () => {
    if (reportTimerRef.current) window.clearTimeout(reportTimerRef.current);
    if (proofUnlockTimerRef.current) window.clearTimeout(proofUnlockTimerRef.current);
    clearMemoryTimers();
  }, [clearMemoryTimers]);

  if (state.finished) {
    const passes = sessionAttempts.filter((a) => a.passed).length;
    const report = buildReport(sessionAttempts);
    return (
      <SessionComplete
        meanScores={sessionAttempts.length === 0 ? null : report.meanScores}
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
        positionProof={question.positionProof}
        handScope={question.handScope}
        blindMemory={question.blindMemory}
        anchorShift={question.anchorShift}
        spatialChord={question.spatialChord}
        memorySecondsRemaining={memorySecondsRemaining}
        onStart={handleStart}
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
        proofProgress={audio.proofProgress}
        spatialProgress={audio.spatialProgress}
        spatialFoundMidi={audio.spatialFoundMidi}
        spatialWrongGuesses={audio.spatialWrongGuesses}
        orientationNotice={orientationNotice}
        onAcknowledgeOrientation={acknowledgeOrientation}
      >
        <StaffCue ref={staffRef} cue={question.cue} accentColor="#ef6a47" inkColor="#242237" />
      </ExerciseView>
    </ExerciseLayout>
  );
}

export default PathwayRouter;
