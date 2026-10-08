import type { LevelConfig } from "./config";
import { score as ecosystemScore, evaluateOutcome, survivalRate } from "./ecosystem";
import type { Outcome } from "./ecosystem";
import { makeHatchling, stepHatchling } from "./hatchling";
import { isScareable, makePredator, scare as scarePredator, stepPredator } from "./predators";
import type { Rng } from "./rng";
import type { Hatchling, Predator, ScareResult, SimEvent } from "./types";

const MAX_DT_SEC = 0.1;

/**
 * Pure-TS deterministic level simulation. No Phaser, no DOM: feed `update(dt)`
 * from a game loop or a test bot; read snapshots and drained events for
 * rendering and HUD.
 */
export class Simulation {
  readonly config: LevelConfig;
  private readonly hatchlingList: Hatchling[] = [];
  private readonly predatorList: Predator[] = [];
  private readonly eventQueue: SimEvent[] = [];
  private energyValue: number;
  private elapsedValue = 0;
  private spawnedCount = 0;
  private nextSpawnAt = 0;
  private finishedValue = false;
  private outcomeValue: Outcome | null = null;

  constructor(config: LevelConfig, private readonly rng: Rng) {
    this.config = config;
    this.energyValue = config.energy.max;
    config.predators.forEach((def, i) => {
      for (let n = 0; n < def.count; n++) {
        this.predatorList.push(makePredator(`${def.kind}-${i}-${n}`, def));
      }
    });
  }

  // --- snapshots (defensive copies) ---

  get hatchlings(): Hatchling[] {
    return this.hatchlingList.map((h) => ({ ...h }));
  }

  get predators(): Predator[] {
    return this.predatorList.map((p) => ({ ...p, home: { ...p.home } }));
  }

  get energy(): number {
    return this.energyValue;
  }

  get elapsed(): number {
    return this.elapsedValue;
  }

  get finished(): boolean {
    return this.finishedValue;
  }

  /** Final outcome, or null until the level ends. */
  get outcome(): "balanced" | "turtle-collapse" | "predators-starve" | null {
    return this.outcomeValue;
  }

  get counts(): { safe: number; caught: number; crawling: number; total: number } {
    let safe = 0;
    let caught = 0;
    let crawling = 0;
    for (const h of this.hatchlingList) {
      if (h.state === "safe") safe++;
      else if (h.state === "caught") caught++;
      else crawling++;
    }
    return { safe, caught, crawling, total: this.hatchlingList.length };
  }

  /** Return and clear pending events. */
  drainEvents(): SimEvent[] {
    return this.eventQueue.splice(0, this.eventQueue.length);
  }

  // --- simulation ---

  /** Advance the world by dt seconds (clamped to 0.1 per call for stability). */
  update(dtSec: number): void {
    if (this.finishedValue) return;
    const dt = Math.min(dtSec, MAX_DT_SEC);
    if (dt <= 0) return;
    this.elapsedValue += dt;

    const { world, hatchling: hCfg, energy } = this.config;

    this.energyValue = Math.min(energy.max, this.energyValue + energy.regenPerSec * dt);

    // Staggered spawning: one hatchling every spawnIntervalSec.
    while (
      this.spawnedCount < this.config.hatchlings &&
      this.elapsedValue >= this.nextSpawnAt
    ) {
      const h = makeHatchling(this.spawnedCount, hCfg, world, this.rng);
      this.hatchlingList.push(h);
      this.spawnedCount++;
      this.nextSpawnAt += hCfg.spawnIntervalSec;
      this.eventQueue.push({ type: "hatchling-spawned", id: h.id, x: h.x, y: h.y });
    }

    for (const h of this.hatchlingList) {
      const wasCrawling = h.state === "crawling";
      stepHatchling(h, dt, hCfg, world, this.elapsedValue);
      if (wasCrawling && h.state === "safe") {
        this.eventQueue.push({ type: "hatchling-safe", id: h.id });
      }
    }

    for (const p of this.predatorList) {
      stepPredator(p, this.hatchlingList, dt, this.eventQueue);
    }

    this.checkEnd();
  }

  /**
   * Scare attempt at a world point. Costs energy only when at least one
   * scareable predator is within scareRadius.
   */
  scare(x: number, y: number): ScareResult {
    const { energy } = this.config;
    if (this.energyValue < energy.scareCost) {
      return { ok: false, scared: [], reason: "no-energy" };
    }
    const scared: string[] = [];
    for (const p of this.predatorList) {
      if (!isScareable(p)) continue;
      if (Math.hypot(p.x - x, p.y - y) <= energy.scareRadius) {
        scarePredator(p);
        scared.push(p.id);
        this.eventQueue.push({ type: "predator-scared", predatorId: p.id });
      }
    }
    if (scared.length === 0) {
      return { ok: false, scared: [], reason: "miss" };
    }
    this.energyValue -= energy.scareCost;
    return { ok: true, scared };
  }

  private checkEnd(): void {
    const allSpawned = this.spawnedCount >= this.config.hatchlings;
    const noneCrawling = this.hatchlingList.every((h) => h.state !== "crawling");
    const timedOut = this.elapsedValue >= this.config.maxDurationSec;
    if (!this.finishedValue && ((allSpawned && noneCrawling) || timedOut)) {
      const { safe } = this.counts;
      const rate = survivalRate(safe, this.spawnedCount);
      const outcome = evaluateOutcome(rate, this.config.healthyBand);
      this.outcomeValue = outcome;
      this.finishedValue = true;
      this.eventQueue.push({
        type: "level-ended",
        outcome,
        rate,
        score: ecosystemScore(rate, this.config.healthyBand),
      });
    }
  }
}
