export const AUTOSAVE_MIN_INTERVAL_MS = 45_000;

export function remainingAutosaveDelay(lastSavedAt: number, now: number): number {
  return Math.max(0, AUTOSAVE_MIN_INTERVAL_MS - Math.max(0, now - lastSavedAt));
}
