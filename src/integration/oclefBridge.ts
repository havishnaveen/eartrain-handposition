import { openingLessonForProblem } from '../curriculum/progressiveCurriculum';
import type { RemediationProblem } from '../curriculum/types';
import { learningProfileStore } from '../profiles/learningProfileStore';
import { flushLearningSync } from '../profiles/sync';
import type {
  LearningSyncEnvelope,
  ResolvedStudentLaunch,
} from '../profiles/types';

const SESSION_KEY = 'eartrain.oclef-launch.v1';
const HANDOFF_PARAM = 'handoff';
const DEFAULT_EXCHANGE_PATH = '/api/integration/oclef/exchange';
const DEFAULT_INGEST_PATH = '/api/integration/oclef/events';

const REMEDIATION_PROBLEMS = new Set<RemediationProblem>([
  'right-hand-position',
  'left-hand-position',
  'treble-clef-recognition',
  'bass-clef-recognition',
  'register-placement',
  'hand-coordination',
  'key-signature-orientation',
  'position-memory',
  'rhythm-pulse',
  'rapid-subdivision',
  'hand-shift',
  'chord-anchor',
  'chord-shell',
  'chord-quality-spacing',
  'background-piano-separation',
  'chord-shape-transfer',
]);

export interface OclefIntegrationSession {
  launch: ResolvedStudentLaunch;
  /** Short-lived, student-scoped token returned by the trusted exchange. */
  syncToken: string;
  expiresAt: number;
  ingestUrl: string;
}

export type IntegrationBootstrap =
  | { mode: 'local'; session: null }
  | { mode: 'oclef'; session: OclefIntegrationSession }
  | { mode: 'error'; session: null; message: string };

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
  return typeof value === 'string' && REMEDIATION_PROBLEMS.has(value as RemediationProblem);
}

function sanitizeReturnUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || typeof window === 'undefined') return undefined;
  try {
    const url = new URL(value, window.location.origin);
    // Oclef may choose its production host later. Never let an arbitrary
    // third-party URL become the post-session navigation target.
    if (url.protocol !== 'https:' && url.origin !== window.location.origin) return undefined;
    if (
      url.origin !== window.location.origin &&
      url.hostname !== 'reading.oclef.com' &&
      !url.hostname.endsWith('.oclef.com')
    ) return undefined;
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

function parseLaunch(value: unknown): ResolvedStudentLaunch | null {
  if (!isRecord(value)) return null;
  const assignmentValue = value.assignment;
  let assignment: ResolvedStudentLaunch['assignment'] = null;
  if (assignmentValue !== null && assignmentValue !== undefined) {
    if (!isRecord(assignmentValue) || !isRemediationProblem(assignmentValue.problem)) return null;
    if (typeof assignmentValue.id !== 'string' || assignmentValue.id.length < 1) return null;
    const recommended = Number(assignmentValue.recommendedLessonIndex);
    const questionCap = Number(assignmentValue.questionCap);
    assignment = {
      id: assignmentValue.id,
      problem: assignmentValue.problem,
      recommendedLessonIndex: Number.isInteger(recommended)
        ? Math.min(24, Math.max(1, recommended))
        : openingLessonForProblem(assignmentValue.problem),
      ...(Number.isInteger(questionCap) && questionCap > 0
        ? { questionCap: Math.min(216, questionCap) }
        : {}),
      ...(sanitizeReturnUrl(assignmentValue.returnUrl)
        ? { returnUrl: sanitizeReturnUrl(assignmentValue.returnUrl) }
        : {}),
    };
  }

  if (
    typeof value.launchId !== 'string' ||
    typeof value.studentId !== 'string' ||
    typeof value.instructorId !== 'string' ||
    typeof value.displayName !== 'string' ||
    value.provider !== 'reading.oclef.com' ||
    typeof value.externalSubject !== 'string'
  ) return null;

  const checkpointValue = value.checkpoint;
  const checkpoint = isRecord(checkpointValue)
    ? {
        lessonIndex: Math.min(24, Math.max(1, Math.round(Number(checkpointValue.lessonIndex) || 1))),
        questionNumber: Math.max(1, Math.round(Number(checkpointValue.questionNumber) || 1)),
        difficulty: Math.min(1, Math.max(0, Number(checkpointValue.difficulty) || 0)),
      }
    : null;

  return {
    launchId: value.launchId,
    studentId: value.studentId,
    instructorId: value.instructorId,
    displayName: value.displayName.slice(0, 120),
    provider: 'reading.oclef.com',
    externalSubject: value.externalSubject,
    sourceApp: 'reading.oclef.com',
    assignment,
    checkpoint,
  };
}

function parseSession(value: unknown): OclefIntegrationSession | null {
  if (!isRecord(value)) return null;
  const launch = parseLaunch(value.launch);
  const expiresAt = Number(value.expiresAt);
  if (
    !launch ||
    typeof value.syncToken !== 'string' ||
    value.syncToken.length < 16 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() + 5_000 ||
    typeof value.ingestUrl !== 'string'
  ) return null;
  return {
    launch,
    syncToken: value.syncToken,
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

function removeHandoffFromAddressBar(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(HANDOFF_PARAM);
  url.searchParams.delete('launch_code');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

let currentSession: OclefIntegrationSession | null = null;

export function getOclefIntegrationSession(): OclefIntegrationSession | null {
  if (currentSession && currentSession.expiresAt > Date.now() + 5_000) return currentSession;
  currentSession = readCachedSession();
  return currentSession;
}

let bootstrapPromise: Promise<IntegrationBootstrap> | null = null;

export function initializeOclefIntegration(): Promise<IntegrationBootstrap> {
  // React StrictMode intentionally re-runs mount effects in development. A
  // single-use handoff code must still be exchanged exactly once.
  bootstrapPromise ??= initializeOclefIntegrationOnce();
  return bootstrapPromise;
}

async function initializeOclefIntegrationOnce(): Promise<IntegrationBootstrap> {
  if (typeof window === 'undefined') return { mode: 'local', session: null };
  const url = new URL(window.location.href);
  const handoff = url.searchParams.get(HANDOFF_PARAM) ?? url.searchParams.get('launch_code');

  if (!handoff) {
    const cached = getOclefIntegrationSession();
    if (!cached) return { mode: 'local', session: null };
    learningProfileStore.activateResolvedLaunch(cached.launch);
    return { mode: 'oclef', session: cached };
  }

  // Raw handoff values are opaque, one-use credentials. They are never
  // decoded or trusted in this browser and are removed from the address bar
  // immediately after the exchange attempt.
  const exchangeUrl =
    import.meta.env.VITE_OCLEF_HANDOFF_EXCHANGE_URL || DEFAULT_EXCHANGE_PATH;
  try {
    const response = await fetch(exchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify({
        handoff,
        audience: 'eartrain-web',
        curriculumId: 'eartrain-position-pathway',
      }),
    });
    if (!response.ok) throw new Error(`exchange-${response.status}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new Error('invalid-exchange-response');
    const launch = parseLaunch(payload.launch);
    const syncToken = payload.syncToken;
    const expiresAt = Number(payload.expiresAt);
    if (
      !launch ||
      typeof syncToken !== 'string' ||
      syncToken.length < 16 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() + 5_000
    ) throw new Error('invalid-exchange-response');
    const ingestCandidate = typeof payload.ingestUrl === 'string'
      ? payload.ingestUrl
      : import.meta.env.VITE_OCLEF_ATTEMPT_INGEST_URL || DEFAULT_INGEST_PATH;
    const session: OclefIntegrationSession = {
      launch,
      syncToken,
      expiresAt,
      ingestUrl: sanitizeApiUrl(ingestCandidate, DEFAULT_INGEST_PATH),
    };
    currentSession = session;
    cacheSession(session);
    learningProfileStore.activateResolvedLaunch(launch);
    removeHandoffFromAddressBar();
    return { mode: 'oclef', session };
  } catch {
    removeHandoffFromAddressBar();
    return {
      mode: 'error',
      session: null,
      message: 'This practice link could not be verified. Please ask your teacher for a new link.',
    };
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
      credentials: 'omit',
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
