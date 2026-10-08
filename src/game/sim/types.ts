import type { FrigatebirdDef, GhostCrabDef, LavaHeronDef } from "./config";

export type HatchlingState = "crawling" | "safe" | "caught";

export interface Hatchling {
  id: number;
  x: number;
  y: number;
  state: HatchlingState;
  /** Forward crawl speed in px/s (fixed at spawn). */
  speed: number;
  /** Sine phase for lateral wobble (fixed at spawn). */
  wobblePhase: number;
}

export type PredatorKind = GhostCrabDef["kind"] | FrigatebirdDef["kind"] | LavaHeronDef["kind"];

/**
 * idle: crab = hidden in burrow (not scareable); bird/heron = perched (scareable).
 * hunting: crab walking toward a target (scareable).
 * windup: bird/heron telegraphed strike (scareable).
 * digesting: crab pausing after a catch (scareable).
 * scared: retreating to home, then cooling down (not scareable).
 */
export type PredatorState = "idle" | "hunting" | "windup" | "digesting" | "scared";

export interface Predator {
  id: string;
  kind: PredatorKind;
  x: number;
  y: number;
  state: PredatorState;
  /** Seconds remaining in the current cooldown (idle/scared timers). */
  cooldown: number;
  /** Total hatchlings caught by this predator. */
  catches: number;
  /** Home point: burrow (crab), perch (bird), rock (heron). */
  home: { x: number; y: number };
  /** Per-predator tunables copied from its level definition. */
  tunables: GhostCrabDef | FrigatebirdDef | LavaHeronDef;
  /** Current target hatchling id (hunting/windup), if any. */
  targetId: number | null;
  /** Point locked at frigatebird windup start. */
  lockX: number;
  lockY: number;
}

export type SimEvent =
  | { type: "hatchling-spawned"; id: number; x: number; y: number }
  | { type: "hatchling-safe"; id: number }
  | { type: "hatchling-caught"; id: number; predatorId: string }
  | { type: "predator-scared"; predatorId: string }
  | { type: "dive-warning"; predatorId: string; targetId: number; x: number; y: number; windupSec: number }
  | {
      type: "level-ended";
      outcome: "balanced" | "turtle-collapse" | "predators-starve";
      rate: number;
      score: number;
    };

export interface ScareResult {
  ok: boolean;
  /** Predator ids scared this call (empty when not ok). */
  scared: string[];
  /** "no-energy" when energy < scareCost; "miss" when no predator in radius. */
  reason?: "no-energy" | "miss";
}
