/**
 * Pure mapping from simulation snapshots to visual descriptors.
 *
 * No Phaser, no DOM: the scene reads these descriptors each frame and applies
 * them to its sprite pools. Texture keys returned here are base keys; the
 * concrete Phaser texture is `${textureKey}${frame}` (e.g. "hatchling0"),
 * matching the keys baked by `view/textures.ts`.
 */
import type { Hatchling, Predator } from "../sim";

/** Visual descriptor applied to a sprite (image) by the scene. */
export interface SpriteVisual {
  /** Base texture key ("hatchling", "ghostCrab", "frigatebird", "lavaHeron"). */
  textureKey: string;
  /** Animation frame index; the Phaser texture is `${textureKey}${frame}`. */
  frame: number;
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  flipX: boolean;
  depth: number;
}

/** Growing telegraph shadow for a windup strike. */
export interface DiveTelegraph {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

/** Frigatebirds fly above everything else in the world (world height is 640). */
export const FRIGATEBIRD_DEPTH = 1000;

/** Depth floor for dynamic world objects (sea starts at y = 96). */
const DYNAMIC_DEPTH_OFFSET = 0;

/** Shadow sprite is 12 px wide; scale multiplies the half-width for the radius. */
const SHADOW_HALF_WIDTH = 6;
const TELEGRAPH_MIN_RADIUS = 4;
const TELEGRAPH_MIN_ALPHA = 0.2;
const TELEGRAPH_MAX_ALPHA = 0.8;

/**
 * Map a hatchling snapshot to its visual.
 * - crawling: fully visible, crawl frames alternate roughly every 6 px of travel.
 * - caught: hidden.
 * - safe: fading into the sea (semi-transparent).
 * Depth equals y so sprites farther down the beach render on top.
 */
export function hatchlingVisual(h: Hatchling, _elapsedSec: number): SpriteVisual {
  if (h.state === "caught") {
    return { textureKey: "hatchling", frame: 0, x: h.x, y: h.y, alpha: 1, visible: false, flipX: false, depth: h.y };
  }
  const alpha = h.state === "safe" ? 0.5 : 1;
  const frame = Math.floor(h.y / 6 + h.wobblePhase) % 2;
  return {
    textureKey: "hatchling",
    frame,
    x: h.x,
    y: h.y,
    alpha,
    visible: true,
    flipX: false,
    depth: h.y + DYNAMIC_DEPTH_OFFSET,
  };
}

/**
 * Map a predator snapshot to its visual.
 * - ghostCrab idle: hidden inside the burrow (the burrow hole sprite marks it).
 * - digesting: slightly translucent. scared: semi-transparent + flipX (fleeing).
 * - lavaHeron windup: lunge frame.
 * - frigatebird: drawn at a high fixed depth (airborne above the beach).
 * Other predators order by y.
 */
export function predatorVisual(p: Predator, elapsedSec: number): SpriteVisual {
  const base: SpriteVisual = {
    textureKey: p.kind,
    frame: 0,
    x: p.x,
    y: p.y,
    alpha: 1,
    visible: true,
    flipX: false,
    depth: p.y + DYNAMIC_DEPTH_OFFSET,
  };

  switch (p.kind) {
    case "ghostCrab": {
      if (p.state === "idle") {
        base.visible = false;
        return base;
      }
      if (p.state === "digesting") base.alpha = 0.9;
      if (p.state === "hunting") base.frame = Math.floor(elapsedSec * 8) % 2;
      break;
    }
    case "frigatebird": {
      base.depth = FRIGATEBIRD_DEPTH;
      base.frame = Math.floor(elapsedSec * 6) % 2;
      break;
    }
    case "lavaHeron": {
      if (p.state === "windup") base.frame = 1;
      break;
    }
  }

  if (p.state === "scared") {
    base.alpha = 0.5;
    base.flipX = true;
  }
  return base;
}

/**
 * Telegraph shadow for a windup strike, or null when there is no dive.
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
  };
}

/** Scale to apply to the 12 px shadow sprite so it covers `radius`. */
export function telegraphScale(radius: number): number {
  return radius / SHADOW_HALF_WIDTH;
}
