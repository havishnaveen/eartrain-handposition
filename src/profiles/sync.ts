import { learningProfileStore } from './learningProfileStore';
import type { LearningSyncEnvelope } from './types';

export interface LearningSyncResult {
  /** Event IDs committed transactionally by the backend. */
  acceptedEventIds: string[];
}

export type LearningSyncTransport = (
  batch: readonly LearningSyncEnvelope[],
) => Promise<LearningSyncResult>;

/**
 * Transport-neutral outbox drain. The future Edge Function becomes the
 * transport; no student bearer token or Supabase service key belongs here.
 */
export async function flushLearningSync(
  transport: LearningSyncTransport,
  limit = 50,
): Promise<LearningSyncResult> {
  const batch = learningProfileStore.getSyncBatch(limit);
  if (batch.length === 0) return { acceptedEventIds: [] };
  const result = await transport(batch);

  // Never acknowledge an ID the server did not return, and never allow a
  // malformed response to erase a different student's pending credit.
  const sent = new Set(batch.map((envelope) => envelope.event.id));
  const acceptedEventIds = [...new Set(result.acceptedEventIds)].filter((id) => sent.has(id));
  if (acceptedEventIds.length > 0) {
    learningProfileStore.acknowledgeSynced(acceptedEventIds);
  }
  return { acceptedEventIds };
}
