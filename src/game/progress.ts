const PROGRESS_STORE = 'chronostrophe:progress';
const DRAFT_STORE = 'chronostrophe:draft';
const MUTE_STORE = 'chronostrophe:muted';

interface Progress {
  completed: number[];
}

/** Completed authored levels, stored separately from the editor's draft. */
export function loadCompletedLevels(): Set<number> {
  try {
    const raw = localStorage.getItem(PROGRESS_STORE);
    if (!raw) return new Set();
    const saved = JSON.parse(raw) as Partial<Progress>;
    if (!Array.isArray(saved.completed)) return new Set();
    return new Set(saved.completed.filter((index): index is number => Number.isInteger(index) && index >= 0));
  } catch {
    return new Set();
  }
}

export function markLevelComplete(index: number): void {
  const completed = loadCompletedLevels();
  completed.add(index);
  try {
    localStorage.setItem(PROGRESS_STORE, JSON.stringify({ completed: [...completed].sort((a, b) => a - b) }));
  } catch {
    // Failing to save progress must never prevent a successful level from ending.
  }
}

/** Temporary all-saves reset while progression is still being tuned. */
export function clearStoredGameData(): void {
  try {
    localStorage.removeItem(PROGRESS_STORE);
    localStorage.removeItem(DRAFT_STORE);
    localStorage.removeItem(MUTE_STORE);
    localStorage.removeItem('chronostrophe:theme'); // clears the retired theme preference
  } catch {
    // Storage can be unavailable in privacy-restricted browser sessions.
  }
}
