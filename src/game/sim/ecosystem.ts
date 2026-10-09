import type { HealthyBand } from "./config";

export type Outcome = "balanced" | "turtle-collapse" | "predators-starve";

/** Final survival rate: safe / total (0 for an empty level, clamped to 1). */
export function survivalRate(safe: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, safe / total));
}

/**
 * Win/lose evaluation. Inclusive band edges count as balanced:
 * below min -> turtle population collapse; above max -> predators starve.
 */
export function evaluateOutcome(rate: number, band: HealthyBand): Outcome {
  if (rate < band.min) return "turtle-collapse";
  if (rate > band.max) return "predators-starve";
  return "balanced";
}

/**
 * Integer score 0..1000, peaking at 1000 at the band center and falling
 * linearly to 0 at the inclusive band edges; 0 outside the band.
 */
export function score(rate: number, band: HealthyBand): number {
  if (rate < band.min || rate > band.max) return 0;
  const center = (band.min + band.max) / 2;
  const halfWidth = (band.max - band.min) / 2;
  const t = 1 - Math.abs(rate - center) / halfWidth;
  return Math.round(1000 * Math.max(0, Math.min(1, t)));
}

/**
 * Live HUD projection: (safe + crawling) / total, i.e. the rate that would
 * result if every hatchling still crawling reached the sea. Returns 0 for an
 * empty level.
 */
export function projectedRate(
  safe: number,
  crawling: number,
  _caught: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (safe + crawling) / total));
}
