import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "./config";
import { createRng } from "./rng";
import { Simulation } from "./simulation";

function runToCompletion(sim: Simulation, dt = 1 / 60, onStep?: (sim: Simulation) => void) {
  let guard = 0;
  while (!sim.finished && guard < 60 * 200) {
    sim.update(dt);
    onStep?.(sim);
    guard++;
  }
  return guard;
}

describe("Simulation construction", () => {
  it("starts with no hatchlings, full energy, and no predators scared", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    expect(sim.hatchlings).toHaveLength(0);
    expect(sim.predators.length).toBeGreaterThan(0);
    expect(sim.energy).toBe(LEVEL_1.energy.max);
    expect(sim.elapsed).toBe(0);
    expect(sim.finished).toBe(false);
    expect(sim.outcome).toBeNull();
  });

  it("snapshot getters return defensive copies", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(1);
    sim.hatchlings.pop();
    sim.predators.pop();
    sim.drainEvents().pop();
    expect(sim.hatchlings.length).toBeGreaterThan(0);
    expect(sim.predators.length).toBeGreaterThan(0);
  });
});

describe("Simulation spawning", () => {
  it("spawns hatchlings staggered one per spawnIntervalSec", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    const interval = LEVEL_1.hatchling.spawnIntervalSec;
    // dt is clamped to 0.1 per update, so advance with small steps.
    while (sim.elapsed < interval - 0.01) sim.update(0.1);
    expect(sim.hatchlings).toHaveLength(1);
    while (sim.elapsed < interval + 0.05) sim.update(0.1);
    expect(sim.hatchlings).toHaveLength(2);
  });

  it("stops spawning at the configured count and emits spawn events", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    const interval = LEVEL_1.hatchling.spawnIntervalSec;
    while (sim.elapsed < interval * (LEVEL_1.hatchlings + 5)) sim.update(0.1);
    expect(sim.hatchlings).toHaveLength(LEVEL_1.hatchlings);
    const events = sim.drainEvents();
    const spawned = events.filter((e) => e.type === "hatchling-spawned");
    expect(spawned).toHaveLength(LEVEL_1.hatchlings);
  });
});

describe("Simulation scare and energy", () => {
  it("returns no-energy without deducting when energy is below the cost", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(0); // flush first spawn
    // Force energy below the cost (white-box: TS-private field is runtime-writable).
    (sim as unknown as { energyValue: number }).energyValue = LEVEL_1.energy.scareCost - 1;
    const result = sim.scare(180, 300);
    expect(result).toEqual({ ok: false, scared: [], reason: "no-energy" });
    expect(sim.energy).toBe(LEVEL_1.energy.scareCost - 1);
  });

  it("returns miss without deducting energy when nothing is hit", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(0);
    const result = sim.scare(0, 0); // far from every predator
    expect(result).toEqual({ ok: false, scared: [], reason: "miss" });
    expect(sim.energy).toBe(LEVEL_1.energy.max);
  });

  it("scares every scareable predator in radius, deducts cost, emits events", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(0);
    // Force a predator into a scareable state next to a known point.
    const bird = sim.predators.find((p) => p.kind === "frigatebird")!;
    bird.state = "windup";
    const heron = sim.predators.find((p) => p.kind === "lavaHeron")!;
    heron.state = "windup";
    const result = sim.scare(bird.x, bird.y);
    expect(result.ok).toBe(true);
    expect(result.scared).toEqual([bird.id]);
    expect(sim.energy).toBe(LEVEL_1.energy.max - LEVEL_1.energy.scareCost);
    const result2 = sim.scare(heron.x, heron.y);
    expect(result2.ok).toBe(true);
    expect(result2.scared).toEqual([heron.id]);
    expect(sim.energy).toBe(LEVEL_1.energy.max - 2 * LEVEL_1.energy.scareCost);
    const events = sim.drainEvents();
    const scared = events.filter((e) => e.type === "predator-scared");
    expect(scared).toHaveLength(result.scared.length + result2.scared.length);
  });

  it("does not scare a burrowed ghost crab", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(0);
    const crab = sim.predators.find((p) => p.kind === "ghostCrab")!;
    expect(crab.state).toBe("idle"); // burrowed
    const result = sim.scare(crab.x, crab.y);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("miss");
  });

  it("regenerates energy up to the max", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    (sim as unknown as { energyValue: number }).energyValue = 50;
    for (let i = 0; i < 10; i++) sim.update(0.1);
    expect(sim.energy).toBeCloseTo(50 + LEVEL_1.energy.regenPerSec, 3);
    while (sim.energy < LEVEL_1.energy.max) sim.update(0.1);
    expect(sim.energy).toBe(LEVEL_1.energy.max);
  });
});

describe("Simulation lifecycle", () => {
  it("runs to completion and reports a level-ended event with outcome, rate and score", () => {
    const sim = new Simulation(LEVEL_1, createRng(3));
    runToCompletion(sim);
    expect(sim.finished).toBe(true);
    expect(sim.outcome).not.toBeNull();
    expect(sim.elapsed).toBeLessThan(LEVEL_1.maxDurationSec);

    const events = sim.drainEvents();
    const ended = events.filter((e) => e.type === "level-ended");
    expect(ended).toHaveLength(1);
    const end = ended[0];
    if (end.type !== "level-ended") throw new Error("unreachable");
    const safe = sim.hatchlings.filter((h) => h.state === "safe").length;
    expect(end.rate).toBeCloseTo(safe / LEVEL_1.hatchlings, 6);
    expect(end.outcome).toBe(sim.outcome);
  });

  it("emits exactly one level-ended event even if update keeps running", () => {
    const sim = new Simulation(LEVEL_1, createRng(3));
    runToCompletion(sim);
    sim.drainEvents();
    sim.update(1);
    expect(sim.drainEvents().filter((e) => e.type === "level-ended")).toHaveLength(0);
  });

  it("is deterministic for the same seed", () => {
    const a = new Simulation(LEVEL_1, createRng(11));
    const b = new Simulation(LEVEL_1, createRng(11));
    runToCompletion(a);
    runToCompletion(b);
    expect(a.hatchlings.map((h) => h.state)).toEqual(b.hatchlings.map((h) => h.state));
    expect(a.predators.map((p) => p.catches)).toEqual(b.predators.map((p) => p.catches));
    expect(a.outcome).toBe(b.outcome);
  });

  it("tracks caught hatchlings with the catching predator id", () => {
    const sim = new Simulation(LEVEL_1, createRng(5));
    runToCompletion(sim);
    const events = sim.drainEvents();
    const caught = events.filter((e) => e.type === "hatchling-caught");
    for (const e of caught) {
      if (e.type !== "hatchling-caught") throw new Error("unreachable");
      expect(sim.predators.find((p) => p.id === e.predatorId)).toBeDefined();
    }
    expect(caught.length).toBeGreaterThan(0);
  });

  it("clamps large dt steps for stability", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(5);
    // Elapsed advances, but no more than the clamp per call.
    expect(sim.elapsed).toBeLessThanOrEqual(0.1001);
  });
});
