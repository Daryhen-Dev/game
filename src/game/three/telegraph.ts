/**
 * Pure dive-telegraph model for windup strikes (frigatebird dive, lava heron
 * lunge). Renderer-agnostic: no Three.js, no DOM — the renderer maps the
 * returned sim-space descriptor to a ground marker each frame.
 *
 * This lives next to the renderer (not in `view/`) because `view/` holds only
 * the DOM-free HUD model; every remaining visual descriptor is consumed
 * exclusively by the Three.js renderer.
 */
import type { Predator } from "../sim";

/** Growing telegraph marker for a windup strike. */
export interface DiveTelegraph {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  /** Clamped windup progress in [0, 1] (0 = windup start, 1 = strike). */
  progress: number;
}

const TELEGRAPH_MIN_RADIUS = 4;
const TELEGRAPH_MIN_ALPHA = 0.2;
const TELEGRAPH_MAX_ALPHA = 0.8;

/**
 * Telegraph marker for a windup strike, or null when there is no dive.
 * Frigatebirds center on the point locked at windup start (lockX/lockY) and
 * grow to `diveRadius`; lava herons lunge around their own position and grow
 * to `reachRadius`. Crabs never dive.
 *
 * Progress comes from the snapshot (`cooldown` counts the windup seconds
 * remaining); an explicit `elapsedSec` overrides it (clamped to the windup).
 */
export function diveTelegraph(p: Predator, elapsedSec?: number): DiveTelegraph | null {
  if (p.kind === "ghostCrab" || p.state !== "windup") return null;

  let maxRadius: number;
  let windupSec: number;
  let x: number;
  let y: number;
  const def = p.tunables;
  if (def.kind === "frigatebird") {
    maxRadius = def.diveRadius;
    windupSec = def.windupSec;
    x = p.lockX;
    y = p.lockY;
  } else if (def.kind === "lavaHeron") {
    maxRadius = def.reachRadius;
    windupSec = def.windupSec;
    x = p.x;
    y = p.y;
  } else {
    return null; // ghostCrab: no dive (already guarded above)
  }

  const progress =
    elapsedSec === undefined
      ? 1 - p.cooldown / windupSec
      : elapsedSec / windupSec;
  const clamped = Math.min(1, Math.max(0, progress));
  return {
    x,
    y,
    radius: TELEGRAPH_MIN_RADIUS + (maxRadius - TELEGRAPH_MIN_RADIUS) * clamped,
    alpha: TELEGRAPH_MIN_ALPHA + (TELEGRAPH_MAX_ALPHA - TELEGRAPH_MIN_ALPHA) * clamped,
    progress: clamped,
  };
}
