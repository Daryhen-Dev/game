export interface Vec2 {
  x: number;
  y: number;
}

/** Survival-rate band considered healthy for the ecosystem, as fractions in (0, 1). */
export interface HealthyBand {
  /** Minimum healthy survival rate (inclusive lower bound of the range 0..1). */
  min: number;
  /** Maximum healthy survival rate (inclusive upper bound of the range 0..1). */
  max: number;
}

export interface WorldConfig {
  width: number;
  height: number;
  /** Everything with y <= seaLineY is sea; a hatchling crossing it is safe. */
  seaLineY: number;
  nest: { x: number; y: number; spreadX: number };
}

export interface HatchlingConfig {
  speedMin: number;
  speedMax: number;
  /** Max lateral speed amplitude in px/s (sine wobble). */
  wobble: number;
  spawnIntervalSec: number;
}

export interface EnergyConfig {
  max: number;
  regenPerSec: number;
  scareCost: number;
  scareRadius: number;
}

export interface GhostCrabDef {
  kind: "ghostCrab";
  count: number;
  burrow: Vec2;
  senseRadius: number;
  catchRadius: number;
  speed: number;
  digestSec: number;
  scaredCooldownSec: number;
}

export interface FrigatebirdDef {
  kind: "frigatebird";
  count: number;
  perch: Vec2;
  /** Seconds between dive attempts. */
  pickIntervalSec: number;
  /** Telegraphed dive duration; the target point is locked at windup start. */
  windupSec: number;
  /** Target is caught at windup end if still within this radius of the locked point. */
  diveRadius: number;
  scaredCooldownSec: number;
}

export interface LavaHeronDef {
  kind: "lavaHeron";
  count: number;
  rock: Vec2;
  /** A crawling hatchling within this radius triggers the windup. */
  triggerRadius: number;
  windupSec: number;
  reachRadius: number;
  /** Cooldown after a lunge before the heron can wind up again. */
  strikeCooldownSec: number;
  scaredCooldownSec: number;
}

export type PredatorDef = GhostCrabDef | FrigatebirdDef | LavaHeronDef;

export interface LevelConfig {
  id: string;
  name: string;
  hatchlings: number;
  healthyBand: HealthyBand;
  world: WorldConfig;
  hatchling: HatchlingConfig;
  energy: EnergyConfig;
  predators: PredatorDef[];
  /** Hard cap on simulated seconds; the level force-ends past it. */
  maxDurationSec: number;
}

export const LEVEL_1: LevelConfig = {
  id: "las-bachas",
  name: "Bahía Las Bachas",
  hatchlings: 40,
  healthyBand: { min: 0.5, max: 0.7 },
  world: {
    width: 360,
    height: 640,
    seaLineY: 96,
    nest: { x: 180, y: 560, spreadX: 60 },
  },
  hatchling: {
    speedMin: 20,
    speedMax: 32,
    wobble: 9,
    spawnIntervalSec: 0.8,
  },
  energy: {
    max: 100,
    regenPerSec: 9,
    scareCost: 25,
    scareRadius: 56,
  },
  predators: [
    {
      kind: "ghostCrab",
      count: 3,
      burrow: { x: 110, y: 330 },
      senseRadius: 70,
      catchRadius: 9,
      speed: 26,
      digestSec: 2.5,
      scaredCooldownSec: 10,
    },
    {
      kind: "ghostCrab",
      count: 1,
      burrow: { x: 260, y: 380 },
      senseRadius: 70,
      catchRadius: 9,
      speed: 26,
      digestSec: 2.5,
      scaredCooldownSec: 10,
    },
    {
      kind: "frigatebird",
      count: 1,
      perch: { x: 60, y: 200 },
      pickIntervalSec: 9,
      windupSec: 1.2,
      diveRadius: 26,
      scaredCooldownSec: 9,
    },
    {
      kind: "lavaHeron",
      count: 1,
      rock: { x: 300, y: 140 },
      triggerRadius: 90,
      windupSec: 0.5,
      reachRadius: 50,
      strikeCooldownSec: 4,
      scaredCooldownSec: 10,
    },
  ],
  maxDurationSec: 180,
};
