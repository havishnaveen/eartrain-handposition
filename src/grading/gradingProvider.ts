import { gradeSequence } from '../audio/timing';
import type { DetectedNote, GradeResult } from '../audio/timing';

/**
 * Stable boundary between exercise capture and scoring.
 *
 * reading.oclef.com can replace this provider without changing the recorder,
 * curriculum, report UI, or telemetry payload. The browser must never receive
 * the partner API key; a remote provider should call an EarTrain server route.
 */
export interface GradingRequest {
  expectedSequence: readonly string[];
  detectedNotes: readonly DetectedNote[];
  options: NonNullable<Parameters<typeof gradeSequence>[2]>;
}

export interface GradingProvider {
  readonly id: string;
  grade(request: GradingRequest): GradeResult | Promise<GradeResult>;
}

export const localGradingProvider: GradingProvider = {
  id: 'eartrain-local-v1',
  grade: ({ expectedSequence, detectedNotes, options }) =>
    gradeSequence([...expectedSequence], [...detectedNotes], options),
};

let activeProvider: GradingProvider = localGradingProvider;

/** Install a verified provider during app bootstrap. */
export function setGradingProvider(provider: GradingProvider): void {
  activeProvider = provider;
}

export function activeGradingProviderId(): string {
  return activeProvider.id;
}

export async function gradeTake(request: GradingRequest): Promise<GradeResult> {
  return activeProvider.grade(request);
}
