import type { FrigatebirdDef, GhostCrabDef, LavaHeronDef, PredatorDef } from "./config";
import type { Hatchling, Predator, SimEvent } from "./types";

const ARRIVE_EPSILON = 2;
const SCARED_SPEED_MULT = 1.6;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function nearestCrawling(
  hatchlings: Hatchling[],
  x: number,
  y: number,
  radius: number,
): Hatchling | null {
  let best: Hatchling | null = null;
  let bestD = radius;
  for (const h of hatchlings) {
    if (h.state !== "crawling") continue;
    const d = dist(x, y, h.x, h.y);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/** Move toward a point; returns true when arrived (within epsilon). */
function moveToward(p: Predator, tx: number, ty: number, speed: number, dt: number): boolean {
  const d = dist(p.x, p.y, tx, ty);
  if (d <= ARRIVE_EPSILON) {
    p.x = tx;
    p.y = ty;
    return true;
  }
  const step = Math.min(d, speed * dt);
  p.x += ((tx - p.x) / d) * step;
  p.y += ((ty - p.y) / d) * step;
  return d - step <= ARRIVE_EPSILON;
}

function catchHatchling(p: Predator, h: Hatchling, events: SimEvent[]): void {
  h.state = "caught";
  p.catches++;
  p.targetId = null;
  events.push({ type: "hatchling-caught", id: h.id, predatorId: p.id });
}

/** Build one predator from its level definition. */
export function makePredator(id: string, def: PredatorDef): Predator {
  const home =
    def.kind === "ghostCrab" ? def.burrow : def.kind === "frigatebird" ? def.perch : def.rock;
  return {
    id,
    kind: def.kind,
    x: home.x,
    y: home.y,
    state: "idle",
    cooldown: 0,
    catches: 0,
    home: { x: home.x, y: home.y },
    tunables: def,
    targetId: null,
    lockX: home.x,
    lockY: home.y,
  };
}

/**
 * Whether a point-scare can affect this predator right now: crabs are only
 * scareable while out on the sand (hunting/digesting); bird and heron are
 * scareable while perched (idle) or winding up. Scared predators are immune.
 */
export function isScareable(p: Predator): boolean {
  if (p.state === "scared") return false;
  if (p.kind === "ghostCrab") return p.state === "hunting" || p.state === "digesting";
  return p.state === "idle" || p.state === "windup";
}

/** Transition a predator into the scared retreat state (cancels any windup). */
export function scare(p: Predator): void {
  p.state = "scared";
  p.cooldown = 0;
}

function stepGhostCrab(p: Predator, hatchlings: Hatchling[], dt: number, events: SimEvent[]): void {
  const def = p.tunables as GhostCrabDef;
  switch (p.state) {
    case "idle": {
      // Hidden in the burrow until something crawls within sense radius.
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.cooldown > 0) return;
      if (nearestCrawling(hatchlings, p.home.x, p.home.y, def.senseRadius)) {
        p.state = "hunting";
      }
      return;
    }
    case "hunting": {
      const target = nearestCrawling(hatchlings, p.x, p.y, def.senseRadius);
      if (!target) {
        // Nothing in reach: walk back to the burrow.
        if (moveToward(p, p.home.x, p.home.y, def.speed, dt)) {
          p.state = "idle";
          p.cooldown = 0;
        }
        return;
      }
      p.targetId = target.id;
      if (dist(p.x, p.y, target.x, target.y) <= def.catchRadius) {
        catchHatchling(p, target, events);
        p.state = "digesting";
        p.cooldown = def.digestSec;
        return;
      }
      moveToward(p, target.x, target.y, def.speed, dt);
      return;
    }
    case "digesting": {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.cooldown <= 0) p.state = "hunting";
      return;
    }
    case "scared": {
      if (moveToward(p, p.home.x, p.home.y, def.speed * SCARED_SPEED_MULT, dt)) {
        p.state = "idle";
        p.cooldown = def.scaredCooldownSec;
        p.targetId = null;
      }
      return;
    }
  }
}

function stepFrigatebird(
  p: Predator,
  hatchlings: Hatchling[],
  dt: number,
  events: SimEvent[],
): void {
  const def = p.tunables as FrigatebirdDef;
  switch (p.state) {
    case "idle": {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.cooldown > 0) return;
      const target = nearestCrawling(hatchlings, p.x, p.y, Infinity);
      if (!target) return;
      p.state = "windup";
      p.targetId = target.id;
      p.lockX = target.x;
      p.lockY = target.y;
      p.cooldown = def.windupSec;
      events.push({
        type: "dive-warning",
        predatorId: p.id,
        targetId: target.id,
        x: p.lockX,
        y: p.lockY,
        windupSec: def.windupSec,
      });
      return;
    }
    case "windup": {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.cooldown > 0) return;
      const target = hatchlings.find((h) => h.id === p.targetId) ?? null;
      if (
        target &&
        target.state === "crawling" &&
        dist(p.lockX, p.lockY, target.x, target.y) <= def.diveRadius
      ) {
        catchHatchling(p, target, events);
      }
      p.targetId = null;
      p.state = "idle";
      p.cooldown = def.pickIntervalSec;
      return;
    }
    case "scared": {
      if (moveToward(p, p.home.x, p.home.y, 120 * SCARED_SPEED_MULT, dt)) {
        p.state = "idle";
        p.cooldown = def.scaredCooldownSec;
        p.targetId = null;
      }
      return;
    }
  }
}

function stepLavaHeron(
  p: Predator,
  hatchlings: Hatchling[],
  dt: number,
  events: SimEvent[],
): void {
  const def = p.tunables as LavaHeronDef;
  switch (p.state) {
    case "idle": {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.cooldown > 0) return;
      const target = nearestCrawling(hatchlings, p.x, p.y, def.triggerRadius);
      if (!target) return;
      p.state = "windup";
      p.targetId = target.id;
      p.cooldown = def.windupSec;
      return;
    }
    case "windup": {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.cooldown > 0) return;
      // The lunge strikes any crawling hatchling within reach, not just the trigger.
      const victim = nearestCrawling(hatchlings, p.x, p.y, def.reachRadius);
      if (victim) catchHatchling(p, victim, events);
      p.targetId = null;
      p.state = "idle";
      p.cooldown = def.strikeCooldownSec;
      return;
    }
    case "scared": {
      if (moveToward(p, p.home.x, p.home.y, 120 * SCARED_SPEED_MULT, dt)) {
        p.state = "idle";
        p.cooldown = def.scaredCooldownSec;
        p.targetId = null;
      }
      return;
    }
  }
}

/** Advance one predator for dt seconds. Mutates predator and hatchlings; appends events. */
export function stepPredator(
  p: Predator,
  hatchlings: Hatchling[],
  dt: number,
  events: SimEvent[],
): void {
  switch (p.kind) {
    case "ghostCrab":
      stepGhostCrab(p, hatchlings, dt, events);
      return;
    case "frigatebird":
      stepFrigatebird(p, hatchlings, dt, events);
      return;
    case "lavaHeron":
      stepLavaHeron(p, hatchlings, dt, events);
      return;
  }
}
