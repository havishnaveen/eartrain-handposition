import { useSyncExternalStore } from 'react';
import { learningProfileStore } from './learningProfileStore';
import type { LearningDataState } from './types';

/** Live profile/session/attempt state for the future instructor dashboard. */
export function useLearningProfiles(): LearningDataState {
  return useSyncExternalStore(
    learningProfileStore.subscribe,
    learningProfileStore.getSnapshot,
    learningProfileStore.getSnapshot,
  );
}
