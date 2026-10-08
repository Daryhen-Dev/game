import type { HatchlingConfig, WorldConfig } from "./config";
import type { Rng } from "./rng";
import type { Hatchling } from "./types";

/** Spawn margin so the wobble clamp never pushes a fresh hatchling out of bounds. */
const EDGE_MARGIN = 4;

/** Create one hatchling near the nest. Consumes 3 Rng draws (x, y, speed+phase). */
export function makeHatchling(
  id: number,
  cfg: HatchlingConfig,
  world: WorldConfig,
  rng: Rng,
): Hatchling {
  const { nest } = world;
  const half = nest.spreadX / 2;
  const x = rng.range(nest.x - half, nest.x + half);
  const y = rng.range(nest.y - 6, nest.y + 6);
  const speed = rng.range(cfg.speedMin, cfg.speedMax);
  const wobblePhase = rng.next() * Math.PI * 2;
  return { id, x, y, state: "crawling", speed, wobblePhase };
}

/**
 * Advance one hatchling for dt seconds: crawl upward with a sine lateral
 * wobble clamped to the world; become safe upon crossing the sea line.
 * Non-crawling hatchlings do not move. Mutates in place.
 */
export function stepHatchling(
  h: Hatchling,
  dt: number,
  cfg: HatchlingConfig,
  world: WorldConfig,
  elapsedSec: number,
): void {
  if (h.state !== "crawling") return;

  h.y -= h.speed * dt;
  const wobbleVx = cfg.wobble * Math.sin(elapsedSec * 2 + h.wobblePhase);
  h.x += wobbleVx * dt;
  h.x = Math.min(world.width - EDGE_MARGIN, Math.max(EDGE_MARGIN, h.x));

  if (h.y <= world.seaLineY) {
    h.state = "safe";
  }
}
