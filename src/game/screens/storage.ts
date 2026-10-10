/**
 * Robust storage primitives for the game shell.
 *
 * All reads/writes are defensive: private browsing, blocked storage and quota
 * errors must never crash the game, so every operation catches and degrades
 * (missing/corrupt reads return null/false; failed writes are dropped).
 */

/** Minimal Storage-like surface (satisfied by window.localStorage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read a stored non-negative integer; null when missing or corrupt. */
export function readNumber(storage: StorageLike, key: string): number | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : null;
  } catch {
    return null;
  }
}

/** Write a non-negative integer; errors (e.g. quota) are silently dropped. */
export function writeNumber(storage: StorageLike, key: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    // Quota exceeded or storage blocked: the write is best-effort.
  }
}

/** Read a "1"/"0" flag; false when missing, corrupt or storage is blocked. */
export function readFlag(storage: StorageLike, key: string): boolean {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Write a "1"/"0" flag; errors are silently dropped. */
export function writeFlag(storage: StorageLike, key: string, value: boolean): void {
  try {
    storage.setItem(key, value ? "1" : "0");
  } catch {
    // Best-effort, like every other storage write.
  }
}
