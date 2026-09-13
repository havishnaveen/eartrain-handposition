import { getOclefIntegrationSession } from '../integration/oclefBridge';

export interface ProfessorNotification {
  id: string;
  timestamp: string;
  epochMs: number;
  studentId?: string;
  instructorId?: string;
  launchId?: string;
  displayName?: string;
  diagnosticId: string;
  lessonTitle: string;
  stage: number;
  questionIndex?: number;
  questionPrompt: string;
  attemptsCount: number;
  message: string;
  details?: string;
}

export const PROFESSOR_NOTIFICATIONS_STORAGE_KEY = 'eartrain_professor_notifications';

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function prepareProfessorNotification(params: {
  diagnosticId: string;
  lessonTitle: string;
  stage: number;
  questionIndex?: number;
  questionPrompt: string;
  attemptsCount: number;
  details?: string;
}): ProfessorNotification {
  const session = getOclefIntegrationSession();
  const now = Date.now();
  const id = `prof_notif_${now}_${Math.random().toString(36).slice(2, 8)}`;

  const notification: ProfessorNotification = {
    id,
    timestamp: new Date(now).toISOString(),
    epochMs: now,
    studentId: session?.launch.studentId,
    instructorId: session?.launch.instructorId,
    launchId: session?.launch.launchId,
    displayName: session?.launch.displayName,
    diagnosticId: params.diagnosticId,
    lessonTitle: params.lessonTitle,
    stage: params.stage,
    questionIndex: params.questionIndex,
    questionPrompt: params.questionPrompt,
    attemptsCount: params.attemptsCount,
    message: 'Teacher review recommended: student needs practice on this concept.',
    details: params.details,
  };

  const storage = safeStorage();
  if (storage) {
    try {
      const existingRaw = storage.getItem(PROFESSOR_NOTIFICATIONS_STORAGE_KEY);
      const existing: ProfessorNotification[] = existingRaw ? JSON.parse(existingRaw) : [];
      existing.unshift(notification);
      storage.setItem(PROFESSOR_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(existing.slice(0, 50)));
    } catch {
      // Storage quota or privacy restriction fallback
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('eartrain:professor-notification', { detail: notification })
      );
    } catch {
      // Ignore in non-DOM test environments
    }
  }

  console.warn('[PROFESSOR NOTIFICATION PREPARED]', notification);
  return notification;
}

export function getPreparedProfessorNotifications(): ProfessorNotification[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(PROFESSOR_NOTIFICATIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearPreparedProfessorNotifications(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(PROFESSOR_NOTIFICATIONS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
