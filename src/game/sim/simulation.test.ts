import { describe, expect, it } from "vitest";
import { LEVEL_1, type FrigatebirdDef } from "./config";
import { createRng } from "./rng";
import { Simulation } from "./simulation";
import type { Predator } from "./types";

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

  it("drives the sim until a frigatebird genuinely winds up, then scares it mid-windup", () => {
    const sim = new Simulation(LEVEL_1, createRng(7));
    // Drive with fixed small steps and read fresh snapshots until the
    // frigatebird is really in "windup" (it winds up once a hatchling has
    // spawned and it is not on cooldown). Bounded loop guards a broken sim.
    let bird: Predator | undefined;
    for (let step = 0; step < 60 * 30; step++) {
      sim.update(1 / 60);
      const snap = sim.predators.find((p) => p.kind === "frigatebird");
      if (snap?.state === "windup") {
        bird = snap;
        break;
      }
    }
    expect(bird, "frigatebird never reached windup within 30 simulated seconds").toBeDefined();
    expect(bird!.state).toBe("windup");
    const targetId = bird!.targetId;
    expect(targetId).not.toBeNull();

    // Isolate the scare from the dive-warning emitted at windup start.
    sim.drainEvents();
    const energyBefore = sim.energy;
    const result = sim.scare(bird!.x, bird!.y);
    expect(result.ok).toBe(true);
    expect(result.scared).toEqual([bird!.id]);
    expect(sim.energy).toBe(energyBefore - LEVEL_1.energy.scareCost);

    // Fresh snapshot: the bird is scared and the windup is cancelled.
    expect(sim.predators.find((p) => p.id === bird!.id)!.state).toBe("scared");
    expect(
      sim.drainEvents().some((e) => e.type === "predator-scared" && e.predatorId === bird!.id),
    ).toBe(true);

    // The cancelled dive never lands: stepping through the would-be windup
    // window, the bird catches nothing and records no catches (its windup
    // branch never runs from the scared state).
    const windupSec = (bird!.tunables as FrigatebirdDef).windupSec;
    let caughtByBird = 0;
    for (let elapsed = 0; elapsed < windupSec; ) {
      sim.update(1 / 60);
      elapsed += 1 / 60;
      caughtByBird += sim
        .drainEvents()
        .filter((e) => e.type === "hatchling-caught" && e.predatorId === bird!.id).length;
    }
    expect(caughtByBird).toBe(0);
    expect(sim.predators.find((p) => p.id === bird!.id)!.catches).toBe(0);
    expect(targetId).not.toBeNull();
  });

  it("scares perched (idle) bird and heron — perched predators are scareable by design", () => {
    const sim = new Simulation(LEVEL_1, createRng(1));
    sim.update(0); // no time passes: bird and heron are still perched
    // Documented intent of isScareable(): frigatebirds and lava herons are
    // scareable while perched (idle) or winding up; crabs only on the sand
    // (hunting/digesting); scared predators are immune.
    const bird = sim.predators.find((p) => p.kind === "frigatebird")!;
    const heron = sim.predators.find((p) => p.kind === "lavaHeron")!;
    expect(bird.state).toBe("idle");
    expect(heron.state).toBe("idle");
    const result = sim.scare(bird.x, bird.y);
    expect(result.ok).toBe(true);
    expect(result.scared).toEqual([bird.id]);
    const result2 = sim.scare(heron.x, heron.y);
    expect(result2.ok).toBe(true);
    expect(result2.scared).toEqual([heron.id]);
    expect(sim.energy).toBe(LEVEL_1.energy.max - 2 * LEVEL_1.energy.scareCost);
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
