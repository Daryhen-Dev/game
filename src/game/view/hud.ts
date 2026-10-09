/**
 * Pure HUD model for Level 1: energy bar, ecosystem meter and scare feedback.
 *
 * No Phaser, no DOM: the scene calls these once per frame with the current
 * simulation snapshot and paints the returned numbers.
 */
import type { EnergyConfig, HealthyBand, ScareResult } from "../sim";

// --- energy bar ---

export interface EnergyBar {
  /** Energy as a fraction of max, clamped to 0..1 (bar fill width). */
  fraction: number;
  /** True when the player can afford at least one scare right now. */
  canScare: boolean;
  /** How many full scares are affordable (floor(energy / scareCost)). */
  segments: number;
}

/** Derive the energy bar state from the current energy and the level config. */
export function energyBar(energy: number, cfg: Pick<EnergyConfig, "max" | "scareCost">): EnergyBar {
  const fraction = cfg.max > 0 ? Math.min(1, Math.max(0, energy / cfg.max)) : 0;
  return {
    fraction,
    canScare: energy >= cfg.scareCost,
    segments: Math.floor(energy / cfg.scareCost),
  };
}

// --- ecosystem meter ---

/**
 * Outcome certainty for the live meter:
 * - collapse-certain: even if every pending hatchling reaches the sea, the
 *   survival rate stays below the band minimum (turtle collapse is locked in).
 * - starve-certain: the safe rate already exceeds the band maximum (predators
 *   starve is locked in).
 * - in-band-secured: the final rate is guaranteed to land inside the band
 *   (best case <= max and safe rate >= min, inclusive edges — matching
 *   `evaluateOutcome`, where inclusive edges are balanced).
 * - open: the outcome is still undecided.
 */
export type EcosystemStatus = "open" | "in-band-secured" | "collapse-certain" | "starve-certain";

export interface EcosystemMeter {
  /** Safe hatchlings as a fraction of the whole nest. */
  safe: number;
  /** Caught hatchlings as a fraction of the whole nest. */
  caught: number;
  /** Everything not yet decided (crawling + unspawned) as a fraction. */
  pending: number;
  /** Band marker positions as fractions of the bar width. */
  bandMin: number;
  bandMax: number;
  status: EcosystemStatus;
}

/**
 * Build the stacked meter over the WHOLE nest: `totalHatchlings` is the level
 * config total, not the spawned count, so unspawned hatchlings count as
 * pending from the first frame.
 */
export function ecosystemMeter(
  counts: { safe: number; caught: number },
  totalHatchlings: number,
  band: HealthyBand,
): EcosystemMeter {
  const total = Math.max(0, totalHatchlings);
  const rawPending = total - counts.safe - counts.caught;
  const safeFrac = total > 0 ? counts.safe / total : 0;
  const caughtFrac = total > 0 ? counts.caught / total : 0;
  const pendingFrac = total > 0 ? Math.max(0, rawPending) / total : 0;

  // Certainty checks use the raw projection (pending includes unspawned).
  // Inclusive band edges stay balanced, mirroring evaluateOutcome.
  let status: EcosystemStatus = "open";
  if (total > 0) {
    const bestCase = (counts.safe + rawPending) / total;
    if (bestCase < band.min) {
      status = "collapse-certain";
    } else if (safeFrac > band.max) {
      status = "starve-certain";
    } else if (safeFrac >= band.min && bestCase <= band.max) {
      status = "in-band-secured";
    }
  }

  return {
    safe: safeFrac,
    caught: caughtFrac,
    pending: pendingFrac,
    bandMin: band.min,
    bandMax: band.max,
    status,
  };
}

/** Spanish status copy shown under the ecosystem meter. */
const STATUS_LABELS: Record<EcosystemStatus, string> = {
  open: "En curso",
  "in-band-secured": "Equilibrio asegurado",
  "collapse-certain": "Colapso inevitable",
  "starve-certain": "Depredadores sin alimento",
};

export function statusLabel(status: EcosystemStatus): string {
  return STATUS_LABELS[status];
}

// --- scare feedback ---

export type ScareFeedbackKind = "hit" | "miss" | "no-energy";

export interface ScareFeedback {
  kind: ScareFeedbackKind;
  /** Short Spanish label shown at the tap point. */
  label: string;
}

/** Map a scare attempt to the feedback shown to the player. */
export function scareFeedback(result: ScareResult): ScareFeedback {
  if (result.ok) return { kind: "hit", label: "¡Fuera!" };
  if (result.reason === "no-energy") return { kind: "no-energy", label: "Sin energía" };
  return { kind: "miss", label: "Nada aquí" };
}
