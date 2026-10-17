import type { CapturedPcm } from '../audio/scoreAnalysis';
import type { DrillPlan } from '../audio/timing';
import { openingLessonForProblem } from '../curriculum/progressiveCurriculum';
import { REMEDIATION_PROBLEMS } from '../curriculum/types';
import type { RemediationProblem } from '../curriculum/types';
import { learningProfileStore } from '../profiles/learningProfileStore';
import { flushLearningSync } from '../profiles/sync';
import type {
  LearningSyncEnvelope,
  ResolvedStudentLaunch,
} from '../profiles/types';

const SESSION_KEY = 'keystance.oclef-launch.v1';
const HANDOFF_PARAM = 'handoff';
const TOKEN_PARAM = 'token';
const DEFAULT_LAUNCH_API_PATH = '/api/oclef/launch';
const DEFAULT_SESSION_API_PATH = '/api/oclef/session';
const DEFAULT_RESULTS_API_PATH = '/api/oclef/results';
const DEFAULT_HEAR_API_PATH = '/api/oclef/hear';
const DEFAULT_GRADE_API_PATH = '/api/oclef/grade';
const DEFAULT_INGEST_PATH = '/api/integration/oclef/events';

const REMEDIATION_PROBLEM_SET = new Set<RemediationProblem>(REMEDIATION_PROBLEMS);

export const OCLEF_PARTNER_REASONS = [
  'demo',
  'clef-confusion',
  'wrong-register',
  'accidental-persistence',
  'starting-position',
  'key-signature',
] as const;

export type OclefPartnerReason = (typeof OCLEF_PARTNER_REASONS)[number];
const OCLEF_PARTNER_REASON_SET = new Set<string>(OCLEF_PARTNER_REASONS);

export interface OclefIntegrationSession {
  launch: ResolvedStudentLaunch;
  /** Short-lived, student-scoped token returned by the trusted server. */
  syncToken: string;
  startedAt: number;
  expiresAt: number;
  ingestUrl: string;
}

export type IntegrationBootstrap =
  | { mode: 'local'; session: null }
  | { mode: 'oclef'; session: OclefIntegrationSession }
  | { mode: 'error'; session: null; message: string };

export interface OclefVisitLessonSummary {
  id: string;
  title: string;
  completed: boolean;
  score?: number;
}

export interface OclefHearResponse {
  ok: boolean;
  notes?: Array<{
    pitch: string;
    midi: number;
    onset_s: number;
    duration_s: number;
  }>;
  seconds?: number;
  engine?: string | null;
  retryAfterSeconds?: number;
}

export interface OclefGradeResponse {
  ok: boolean;
  engine?: string | null;
  rhythm?: boolean;
  pitch_accuracy?: number;
  counts?: {
    written: number;
    matched: number;
    missed: number;
    wrong: number;
    extra: number;
  };
  matched?: Array<{ index: number; pitch: string; midi: number; bar: number; beat: number; timing_error_s?: number }>;
  missed?: Array<{ index: number; pitch: string; midi: number; bar: number; beat: number }>;
  wrong?: Array<{
    index: number;
    pitch: string;
    midi: number;
    bar: number;
    beat: number;
    played: string;
    played_midi: number;
    timing_error_s?: number;
  }>;
  extra?: Array<{ pitch: string; midi: number; at_s: number }>;
  rhythm_grade?: { stars: number; label: string } | null;
  diagnosis?: {
    kind: 'clef-confusion' | 'wrong-register' | 'wrong-start' | 'key-signature' | 'none';
    reason: string | null;
    confidence: number | null;
    detail: Record<string, unknown>;
    because?: string;
  };
  retryAfterSeconds?: number;
}

function sessionStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRemediationProblem(value: unknown): value is RemediationProblem {
  return typeof value === 'string' && REMEDIATION_PROBLEM_SET.has(value as RemediationProblem);
}

/**
 * Validates that return_url points to an approved Oclef/KeyStance origin,
 * and returns the exact string untouched (KEYSTANCE.md Section 4:
 * "send her browser to return_url exactly as given... Never build this
 * address yourself and never add anything to it").
 */
export function sanitizeReturnUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return undefined;
  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://keystance.vercel.app';
    const url = new URL(value, baseOrigin);
    const isSameOrigin = typeof window !== 'undefined' && url.origin === window.location.origin;
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isOclef =
      url.protocol === 'https:' &&
      (url.hostname === 'reading.oclef.com' || url.hostname.endsWith('.oclef.com'));
    if (!isOclef && !isSameOrigin && !isLocal) return undefined;
    // Return the exact string as given if it is already an absolute URL
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function sanitizeApiUrl(value: unknown, fallback: string): string {
  if (typeof window === 'undefined' || typeof value !== 'string') return fallback;
  try {
    const url = new URL(value, window.location.origin);
    const approvedHost =
      url.origin === window.location.origin ||
      url.hostname === 'reading.oclef.com' ||
      url.hostname.endsWith('.oclef.com');
    if (!approvedHost || (url.protocol !== 'https:' && url.origin !== window.location.origin)) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function referralText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120 ? value.trim() : undefined;
}

export function normalizePartnerReason(value: unknown): OclefPartnerReason {
  if (typeof value === 'string' && OCLEF_PARTNER_REASON_SET.has(value)) {
    return value as OclefPartnerReason;
  }
  return 'demo';
}

export function recommendedLessonForStage(stage: string | null | undefined): number {
  if (!stage) return 1;
  const normalized = stage.trim().toUpperCase();
  if (normalized.startsWith('ES1')) return 1;
  if (normalized.startsWith('ES2') || normalized.startsWith('ES3')) return 3;
  if (normalized.startsWith('MS1')) return 5;
  if (normalized.startsWith('MS2') || normalized.startsWith('MS3')) return 7;
  if (normalized.startsWith('LS1')) return 9;
  if (normalized.startsWith('LS2') || normalized.startsWith('LS3')) return 11;
  return 1;
}

export function parseLaunch(value: unknown): ResolvedStudentLaunch | null {
  if (!isRecord(value)) return null;

  // Support both KEYSTANCE.md partner claims ({ sub, jti, stage, reason, return_url })
  // and internal ResolvedStudentLaunch objects.
  const studentId = referralText(value.sub) ?? referralText(value.studentId);
  const launchId = referralText(value.jti) ?? referralText(value.sessionId) ?? referralText(value.launchId);
  if (!studentId || !launchId) return null;

  const provider =
    value.provider === undefined || value.provider === 'reading.oclef.com'
      ? ('reading.oclef.com' as const)
      : null;
  if (!provider) return null;

  const externalSubject = referralText(value.externalSubject) ?? studentId;
  const stage = typeof value.stage === 'string' && value.stage.trim() ? value.stage.trim().slice(0, 32) : null;
  const hasPartnerReason = value.reason !== undefined;
  const partnerReason = hasPartnerReason ? normalizePartnerReason(value.reason) : undefined;
  const exactReturnUrl = sanitizeReturnUrl(value.return_url ?? value.returnUrl);

  const assignmentValue = value.assignment;
  let assignment: ResolvedStudentLaunch['assignment'] = null;
  if (assignmentValue !== null && assignmentValue !== undefined) {
    if (!isRecord(assignmentValue) || !referralText(assignmentValue.problem)) return null;
    if (typeof assignmentValue.id !== 'string' || assignmentValue.id.length < 1) return null;
    const recommended = Number(assignmentValue.recommendedLessonIndex);
    const questionCap = Number(assignmentValue.questionCap);
    const assignReturnUrl = sanitizeReturnUrl(assignmentValue.returnUrl) ?? exactReturnUrl;
    assignment = {
      id: assignmentValue.id,
      problem: referralText(assignmentValue.problem)!,
      ...(referralText(assignmentValue.key) ? { key: referralText(assignmentValue.key) } : {}),
      recommendedLessonIndex: Number.isInteger(recommended)
        ? Math.min(24, Math.max(1, recommended))
        : isRemediationProblem(assignmentValue.problem)
          ? openingLessonForProblem(assignmentValue.problem)
          : recommendedLessonForStage(stage),
      ...(Number.isInteger(questionCap) && questionCap > 0
        ? { questionCap: Math.min(216, questionCap) }
        : {}),
      ...(assignReturnUrl ? { returnUrl: assignReturnUrl } : {}),
    };
  } else if (partnerReason) {
    assignment = {
      id: launchId,
      problem: partnerReason,
      recommendedLessonIndex: recommendedLessonForStage(stage),
      questionCap: partnerReason === 'demo' ? 4 : undefined,
      ...(exactReturnUrl ? { returnUrl: exactReturnUrl } : {}),
    };
  }

  const checkpointValue = value.checkpoint;
  const checkpoint = isRecord(checkpointValue)
    ? {
        lessonIndex: Math.min(24, Math.max(1, Math.round(Number(checkpointValue.lessonIndex) || 1))),
        questionNumber: Math.max(1, Math.round(Number(checkpointValue.questionNumber) || 1)),
        difficulty: Math.min(1, Math.max(0, Number(checkpointValue.difficulty) || 0)),
      }
    : null;

  const diagnosticReason =
    referralText(value.diagnosticReason) ??
    (partnerReason && partnerReason !== 'demo' ? partnerReason : undefined);

  return {
    launchId,
    studentId,
    provider: 'reading.oclef.com',
    externalSubject,
    sourceApp: 'reading.oclef.com',
    stage,
    ...(partnerReason ? { reason: partnerReason } : {}),
    ...(exactReturnUrl ? { return_url: exactReturnUrl } : {}),
    assignment,
    ...(diagnosticReason ? { diagnosticReason } : {}),
    ...(referralText(value.diagnosticCode) ? { diagnosticCode: referralText(value.diagnosticCode) } : {}),
    ...(referralText(value.key) ? { key: referralText(value.key) } : {}),
    checkpoint,
  };
}

function parseSession(value: unknown): OclefIntegrationSession | null {
  if (!isRecord(value)) return null;
  const launch = parseLaunch(value.launch ?? value);
  const expiresAt = Number(value.expiresAt);
  const startedAt = Number(value.startedAt) || Date.now();
  if (
    !launch ||
    typeof value.syncToken !== 'string' ||
    value.syncToken.length < 16 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() + 5_000
  ) return null;
  return {
    launch,
    syncToken: value.syncToken,
    startedAt,
    expiresAt,
    ingestUrl: sanitizeApiUrl(value.ingestUrl, DEFAULT_INGEST_PATH),
  };
}

function readCachedSession(): OclefIntegrationSession | null {
  const storage = sessionStorageSafe();
  if (!storage) return null;
  try {
    return parseSession(JSON.parse(storage.getItem(SESSION_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function cacheSession(session: OclefIntegrationSession): void {
  const storage = sessionStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // A locked-down browser can still use the in-memory launch for this tab.
  }
}

function removeTokensFromAddressBar(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const hadToken =
    url.searchParams.has(TOKEN_PARAM) ||
    url.searchParams.has(HANDOFF_PARAM) ||
    url.searchParams.has('launch_code');
  if (!hadToken) return;
  url.searchParams.delete(TOKEN_PARAM);
  url.searchParams.delete(HANDOFF_PARAM);
  url.searchParams.delete('launch_code');
  const nextPath = url.pathname === '/oclef/launch' ? '/' : url.pathname;
  window.history.replaceState(window.history.state, '', `${nextPath}${url.search}${url.hash}`);
}

let currentSession: OclefIntegrationSession | null = null;
const visitLessons = new Map<string, OclefVisitLessonSummary>();
let lastEarDiagnosisNote = '';
let earCooldownUntilMs = 0;
let hearCalledThisVisit = false;

export function getOclefIntegrationSession(): OclefIntegrationSession | null {
  if (currentSession && currentSession.expiresAt > Date.now() + 5_000) return currentSession;
  currentSession = readCachedSession();
  return currentSession;
}

let bootstrapPromise: Promise<IntegrationBootstrap> | null = null;

export function initializeOclefIntegration(): Promise<IntegrationBootstrap> {
  bootstrapPromise ??= initializeOclefIntegrationOnce();
  return bootstrapPromise;
}

async function initializeOclefIntegrationOnce(): Promise<IntegrationBootstrap> {
  if (typeof window === 'undefined') return { mode: 'local', session: null };
  const url = new URL(window.location.href);
  const tokenParam =
    url.searchParams.get(TOKEN_PARAM) ??
    url.searchParams.get(HANDOFF_PARAM) ??
    url.searchParams.get('launch_code');

  // Always strip any token from the address bar immediately so it never sits in history.
  if (tokenParam) {
    removeTokensFromAddressBar();
    try {
      const response = await fetch(DEFAULT_LAUNCH_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ token: tokenParam }),
      });
      if (!response.ok) {
        const errData: unknown = await response.json().catch(() => null);
        const message =
          isRecord(errData) && typeof errData.error === 'string'
            ? errData.error
            : 'This practice link could not be verified. Please return to Oclef and tap KeyStance again.';
        return { mode: 'error', session: null, message };
      }
      const data: unknown = await response.json();
      if (isRecord(data) && isRecord(data.visit) && typeof data.syncToken === 'string') {
        const launch = parseLaunch(data.visit);
        const expiresAt = Number(data.visit.expiresAt) || Date.now() + 2 * 60 * 60 * 1000;
        const startedAt = Number(data.visit.startedAt) || Date.now();
        if (launch) {
          const session: OclefIntegrationSession = {
            launch,
            syncToken: data.syncToken,
            startedAt,
            expiresAt,
            ingestUrl: DEFAULT_INGEST_PATH,
          };
          currentSession = session;
          visitLessons.clear();
          lastEarDiagnosisNote = '';
          hearCalledThisVisit = false;
          cacheSession(session);
          learningProfileStore.activateResolvedLaunch(launch);
          return { mode: 'oclef', session };
        }
      }
    } catch {
      return {
        mode: 'error',
        session: null,
        message: 'This practice link could not be verified. Please return to Oclef and tap KeyStance again.',
      };
    }
  }

  // Standard flow: /oclef/launch verified the token on the server, set the
  // HttpOnly session cookie, and redirected to clean URL /.
  try {
    const response = await fetch(DEFAULT_SESSION_API_PATH, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (response.ok) {
      const payload: unknown = await response.json();
      if (isRecord(payload) && payload.active === true && isRecord(payload.session)) {
        const launch = parseLaunch(payload.session);
        const syncToken = typeof payload.session.syncToken === 'string' ? payload.session.syncToken : '';
        const expiresAt = Number(payload.session.expiresAt);
        const startedAt = Number(payload.session.startedAt) || Date.now();
        if (launch && syncToken.length >= 16 && Number.isFinite(expiresAt) && expiresAt > Date.now() + 5_000) {
          const session: OclefIntegrationSession = {
            launch,
            syncToken,
            startedAt,
            expiresAt,
            ingestUrl: DEFAULT_INGEST_PATH,
          };
          currentSession = session;
          cacheSession(session);
          learningProfileStore.activateResolvedLaunch(launch);
          return { mode: 'oclef', session };
        }
      }
    }
  } catch {
    // Fall back to tab sessionStorage if offline
  }

  const cached = getOclefIntegrationSession();
  if (!cached) return { mode: 'local', session: null };
  learningProfileStore.activateResolvedLaunch(cached.launch);
  return { mode: 'oclef', session: cached };
}

/**
 * Encodes captured mono PCM float32 chunks into a 16-bit mono WAV at 22.05 kHz
 * (or 16 kHz if longer than 45s), bounded to <= 60 seconds and <= 4 MB
 * per KEYSTANCE.md Sections 9 & 10.
 */
export function encodeCapturedPcmToWav(
  captureInput: Pick<CapturedPcm, 'chunks' | 'sampleRate'> | Float32Array,
  preferredSampleRate = 22050,
): Uint8Array {
  const capture: Pick<CapturedPcm, 'chunks' | 'sampleRate'> =
    captureInput instanceof Float32Array
      ? { chunks: [captureInput], sampleRate: preferredSampleRate }
      : captureInput;
  const totalInputSamples = capture.chunks.reduce((sum, c) => sum + c.length, 0);
  const inputRate = Number.isFinite(capture.sampleRate) && capture.sampleRate >= 8000 ? capture.sampleRate : 48000;
  const maxInputSamples = Math.min(totalInputSamples, Math.floor(inputRate * 60));

  const combined = new Float32Array(maxInputSamples);
  let offset = 0;
  for (const chunk of capture.chunks) {
    if (offset >= maxInputSamples) break;
    const slice = offset + chunk.length > maxInputSamples ? chunk.subarray(0, maxInputSamples - offset) : chunk;
    combined.set(slice, offset);
    offset += slice.length;
  }

  const durationSec = maxInputSamples / inputRate;
  const targetRate = durationSec > 45 ? 16000 : preferredSampleRate;
  const ratio = inputRate / targetRate;
  const outputSamples = Math.max(1, Math.min(Math.floor(60 * targetRate), Math.floor(maxInputSamples / ratio)));

  const wavByteLength = 44 + outputSamples * 2;
  const buffer = new ArrayBuffer(wavByteLength);
  const view = new DataView(buffer);

  const writeAscii = (byteOffset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(byteOffset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, wavByteLength - 8, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (mono)
  view.setUint32(24, targetRate, true); // SampleRate
  view.setUint32(28, targetRate * 2, true); // ByteRate (SampleRate * 1 * 2)
  view.setUint16(32, 2, true); // BlockAlign (1 * 2)
  view.setUint16(34, 16, true); // BitsPerSample = 16
  writeAscii(36, 'data');
  view.setUint32(40, outputSamples * 2, true);

  let writePos = 44;
  for (let i = 0; i < outputSamples; i++) {
    const srcStart = Math.floor(i * ratio);
    const srcEnd = Math.min(maxInputSamples, Math.max(srcStart + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = srcStart; j < srcEnd; j++) {
      sum += combined[j];
    }
    const sample = Math.max(-1, Math.min(1, sum / (srcEnd - srcStart)));
    const int16 = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(writePos, int16, true);
    writePos += 2;
  }

  return new Uint8Array(buffer);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
    binary += String.fromCharCode(...sub);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

/**
 * Calls KeyStance's server adapter for /api/stations/keystance/hear (KEYSTANCE.md Section 9).
 */
export async function hearRecordingWithOclef(
  capture: Pick<CapturedPcm, 'chunks' | 'sampleRate'>,
): Promise<OclefHearResponse | null> {
  const session = getOclefIntegrationSession();
  if (!session || Date.now() < earCooldownUntilMs) return null;

  const wavBytes = encodeCapturedPcmToWav(capture);
  if (wavBytes.byteLength <= 44 || wavBytes.byteLength > 4 * 1024 * 1024) return null;

  try {
    const response = await fetch(DEFAULT_HEAR_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.syncToken}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        audioBase64: uint8ArrayToBase64(wavBytes),
      }),
    });

    if (response.status === 503 || response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 30;
      earCooldownUntilMs = Date.now() + retryAfter * 1000;
      return { ok: false, retryAfterSeconds: retryAfter };
    }

    if (!response.ok) return null;
    return (await response.json()) as OclefHearResponse;
  } catch {
    return null;
  }
}

/**
 * Calls KeyStance's server adapter for /api/stations/keystance/grade (KEYSTANCE.md Section 10).
 */
export async function gradeRecordingWithOclef(
  capture: Pick<CapturedPcm, 'chunks' | 'sampleRate'>,
  plan: DrillPlan,
  options?: { rhythm?: boolean; keySignature?: string; musicxml?: string },
): Promise<OclefGradeResponse | null> {
  const session = getOclefIntegrationSession();
  if (!session || Date.now() < earCooldownUntilMs) return null;

  const wavBytes = encodeCapturedPcmToWav(capture);
  if (wavBytes.byteLength <= 44 || wavBytes.byteLength > 4 * 1024 * 1024) return null;

  const tempo_bpm = Math.min(300, Math.max(20, Math.round(60 / Math.max(0.2, plan.secondsPerBeat))));
  const beats_per_bar = Math.min(16, Math.max(1, Math.round(plan.beatsPerBar || 4)));
  const getSlotHand = (slot: unknown): 'right' | 'left' | undefined => {
    if (!isRecord(slot)) return undefined;
    return slot.hand === 'right' || slot.hand === 'left' ? slot.hand : undefined;
  };
  const allHaveHand = plan.expectedNotes.every((n) => getSlotHand(n) !== undefined);
  const reference = options?.musicxml
    ? { musicxml: options.musicxml, tempo_bpm }
    : {
        tempo_bpm,
        beats_per_bar,
        ...(options?.keySignature ? { key_signature: options.keySignature } : {}),
        notes: plan.expectedNotes.slice(0, 1000).map((slot) => {
          const hand = getSlotHand(slot);
          return {
            pitch: slot.pitch,
            onset_beats: Number(slot.beat.toFixed(4)),
            duration_beats: Number(Math.max(0.125, slot.beats).toFixed(4)),
            ...(allHaveHand && hand ? { hand } : {}),
          };
        }),
      };

  try {
    const response = await fetch(DEFAULT_GRADE_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.syncToken}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        audioBase64: uint8ArrayToBase64(wavBytes),
        reference,
        rhythm: options?.rhythm ?? true,
      }),
    });

    if (response.status === 503 || response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 30;
      earCooldownUntilMs = Date.now() + retryAfter * 1000;
      return { ok: false, retryAfterSeconds: retryAfter };
    }

    if (!response.ok) return null;
    const grade = (await response.json()) as OclefGradeResponse;
    if (grade?.ok && grade.diagnosis && grade.diagnosis.kind !== 'none') {
      const pct = typeof grade.pitch_accuracy === 'number' ? `${Math.round(grade.pitch_accuracy * 100)}% pitch` : '';
      lastEarDiagnosisNote = `Oclef ear diagnosis: ${grade.diagnosis.kind}${pct ? ` (${pct})` : ''}.`.slice(0, 200);
    }
    return grade;
  } catch {
    return null;
  }
}

/**
 * Invoked automatically when a student completes an acoustic piano take during an Oclef visit.
 * Runs non-blocking so local grading never stalls if Oclef's ear is busy (503).
 */
export function submitTakeToOclefEar(
  capture: Pick<CapturedPcm, 'chunks' | 'sampleRate'>,
  plan: DrillPlan,
): void {
  const session = getOclefIntegrationSession();
  if (!session || Date.now() < earCooldownUntilMs) return;
  void (async () => {
    if (!hearCalledThisVisit) {
      hearCalledThisVisit = true;
      await hearRecordingWithOclef(capture);
    }
    await gradeRecordingWithOclef(capture, plan, { rhythm: true });
  })();
}

export function recordOclefVisitLesson(lesson: OclefVisitLessonSummary): void {
  const id = lesson.id.trim().slice(0, 64);
  const title = lesson.title.trim().slice(0, 120);
  if (!id || !title) return;
  const existing = visitLessons.get(id);
  const score =
    typeof lesson.score === 'number' && Number.isFinite(lesson.score)
      ? Math.min(100, Math.max(0, Math.round(lesson.score)))
      : existing?.score;
  visitLessons.set(id, {
    id,
    title,
    completed: Boolean(lesson.completed || existing?.completed),
    ...(score !== undefined ? { score } : {}),
  });
}

function collectLessonsForResults(): OclefVisitLessonSummary[] {
  const snap = learningProfileStore.getSnapshot();
  const activeSessionId = snap.activeSessionId;
  for (const attempt of snap.attempts) {
    if (activeSessionId && attempt.sessionId !== activeSessionId) continue;
    const id = String(attempt.attempt.conceptId || `lesson-${attempt.attempt.conceptIndex}`).slice(0, 64);
    const title = String(attempt.attempt.conceptTitle || `Lesson ${attempt.attempt.conceptIndex}`).slice(0, 120);
    const score = Math.min(100, Math.max(0, Math.round((attempt.attempt.scores.overall / 5) * 100)));
    recordOclefVisitLesson({
      id,
      title,
      completed: Boolean(attempt.attempt.passed),
      score,
    });
  }
  for (const activity of snap.activities) {
    if (activeSessionId && activity.sessionId !== activeSessionId) continue;
    if (activity.type === 'exercise.completed' || activity.type === 'session.completed') {
      const topic = typeof activity.properties.topic === 'string' ? activity.properties.topic : '';
      const batch = typeof activity.properties.batch === 'number' ? activity.properties.batch : null;
      if (topic) {
        const id = (batch ? `${topic}-batch-${batch}` : topic).slice(0, 64);
        const title = (batch ? `${topic} · Batch ${batch}` : topic).slice(0, 120);
        const passed = activity.properties.passed === true || activity.type === 'session.completed';
        const score =
          typeof activity.properties.score === 'number'
            ? Math.min(100, Math.max(0, Math.round(activity.properties.score)))
            : passed
              ? 100
              : 60;
        recordOclefVisitLesson({ id, title, completed: passed, score });
      }
    }
  }
  return [...visitLessons.values()].slice(0, 50);
}

/**
 * Posts the visit's cumulative results to /api/oclef/results (KEYSTANCE.md Section 3).
 * Safe to call multiple times during a visit: Oclef replaces the earlier report for the same jti.
 */
export async function flushOclefResults(options?: {
  completed?: boolean;
  note?: string;
  lessons?: OclefVisitLessonSummary[];
}): Promise<{ ok: boolean; replaced?: boolean } | null> {
  const session = getOclefIntegrationSession();
  if (!session) return null;

  if (options?.lessons) {
    for (const item of options.lessons) {
      recordOclefVisitLesson(item);
    }
  }

  const lessons = collectLessonsForResults();
  const minutes = Math.min(600, Math.max(0, Math.round((Date.now() - session.startedAt) / 60000)));
  const completed = options?.completed ?? lessons.some((l) => l.completed);
  const defaultNote =
    lessons.length > 0
      ? `Practiced ${lessons.map((l) => l.title).slice(0, 3).join(', ')}.${lastEarDiagnosisNote ? ` ${lastEarDiagnosisNote}` : ''}`
      : lastEarDiagnosisNote || undefined;
  const note = (options?.note ?? defaultNote)?.trim().slice(0, 500);

  try {
    const response = await fetch(DEFAULT_RESULTS_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.syncToken}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        minutes,
        completed,
        lessons,
        ...(note ? { note } : {}),
      }),
    });
    if (!response.ok) return { ok: false };
    return (await response.json()) as { ok: boolean; replaced?: boolean };
  } catch {
    return null;
  }
}

/**
 * Flushes the final results for the visit and sends her browser to return_url
 * in the same tab, exactly as given in the launch token (KEYSTANCE.md Sections 3 & 4).
 */
export async function finishOclefVisitAndReturn(
  options?:
    | string
    | {
        note?: string;
        lessons?: OclefVisitLessonSummary[];
        returnUrl?: string;
      },
): Promise<void> {
  const session = getOclefIntegrationSession();
  const opts = typeof options === 'string' ? { returnUrl: options } : options;
  const returnUrl =
    opts?.returnUrl ?? session?.launch.return_url ?? session?.launch.assignment?.returnUrl;
  await flushOclefResults({
    completed: true,
    note: opts?.note,
    lessons: opts?.lessons,
  }).catch(() => null);

  if (typeof window !== 'undefined' && returnUrl) {
    window.location.href = returnUrl;
  }
}

export async function flushConfiguredOclefSync(): Promise<void> {
  const session = getOclefIntegrationSession();
  if (!session || session.expiresAt <= Date.now() + 5_000) return;
  await flushLearningSync(async (batch: readonly LearningSyncEnvelope[]) => {
    const response = await fetch(session.ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.syncToken}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ schemaVersion: 1, events: batch }),
    });
    if (!response.ok) throw new Error(`sync-${response.status}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.acceptedEventIds)) {
      throw new Error('invalid-sync-response');
    }
    return {
      acceptedEventIds: payload.acceptedEventIds.filter(
        (id): id is string => typeof id === 'string',
      ),
    };
  });
  await flushOclefResults();
}

/** Debounced, retry-safe outbox drain. Returns a complete cleanup function. */
export function startAutomaticOclefSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let timer = 0;
  let running = false;
  let rerun = false;
  let disposed = false;
  const schedule = (delay = 450) => {
    if (disposed || !getOclefIntegrationSession()) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      void flushConfiguredOclefSync()
        .catch(() => {
          // The durable outbox remains intact. Online/future state changes
          // retry; no score or credit is acknowledged on a failed request.
        })
        .finally(() => {
          running = false;
          if (rerun) {
            rerun = false;
            schedule(900);
          }
        });
    }, delay);
  };
  const unsubscribe = learningProfileStore.subscribe(() => schedule());
  const online = () => schedule(80);
  window.addEventListener('online', online);
  schedule(50);
  return () => {
    disposed = true;
    unsubscribe();
    window.removeEventListener('online', online);
    if (timer) window.clearTimeout(timer);
  };
}
