/**
 * Best-score persistence for Level 1 (Bahía Las Bachas).
 *
 * Backed by the robust storage primitives: missing storage, corrupt values
 * and quota errors degrade to "no best score" instead of throwing.
 */
import { readNumber, writeNumber, type StorageLike } from "./storage";

export type { StorageLike } from "./storage";

export const BEST_SCORE_KEY = "hatchling-run:best:las-bachas";

/** Stored best score, or null when none was ever saved. */
export function loadBest(storage: StorageLike): number | null {
  return readNumber(storage, BEST_SCORE_KEY);
}

/**
 * Persist a best score. Negative values are ignored (scores are 0..1000);
 * storage errors are silently dropped.
 */
export function saveBest(storage: StorageLike, score: number): void {
  writeNumber(storage, BEST_SCORE_KEY, score);
}
