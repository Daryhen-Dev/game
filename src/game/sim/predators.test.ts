import { describe, expect, it } from "vitest";
import { makePredator, scare, stepPredator } from "./predators";
import type { GhostCrabDef, FrigatebirdDef, LavaHeronDef } from "./config";
import type { Hatchling, SimEvent } from "./types";

const crabDef: GhostCrabDef = {
  kind: "ghostCrab",
  count: 1,
  burrow: { x: 100, y: 300 },
  senseRadius: 90,
  catchRadius: 9,
  speed: 30,
  digestSec: 2,
  scaredCooldownSec: 10,
};

const birdDef: FrigatebirdDef = {
  kind: "frigatebird",
  count: 1,
  perch: { x: 60, y: 200 },
  pickIntervalSec: 0.2,
  windupSec: 0.5,
  diveRadius: 26,
  scaredCooldownSec: 9,
};

const heronDef: LavaHeronDef = {
  kind: "lavaHeron",
  count: 1,
  rock: { x: 300, y: 140 },
  triggerRadius: 110,
  windupSec: 0.5,
  reachRadius: 60,
  strikeCooldownSec: 3,
  scaredCooldownSec: 10,
};

function crawlingHatchling(id: number, x: number, y: number): Hatchling {
  return { id, x, y, state: "crawling", speed: 24, wobblePhase: 0 };
}

function run(predator: ReturnType<typeof makePredator>, hatchlings: Hatchling[], seconds: number, dt = 0.05) {
  const events: SimEvent[] = [];
  let steps = Math.ceil(seconds / dt);
  while (steps-- > 0) {
    stepPredator(predator, hatchlings, dt, events);
  }
  return events;
}

describe("makePredator", () => {
  it("starts idle at its home point with tunables copied", () => {
    const crab = makePredator("crab-0", crabDef);
    expect(crab.state).toBe("idle");
    expect(crab.x).toBe(crabDef.burrow.x);
    expect(crab.y).toBe(crabDef.burrow.y);
    expect(crab.home).toEqual(crabDef.burrow);
    expect(crab.tunables).toEqual(crabDef);
    expect(crab.catches).toBe(0);
  });
});

describe("ghost crab", () => {
  it("stays idle while no crawling hatchling is within sense radius", () => {
    const crab = makePredator("crab-0", crabDef);
    const far = crawlingHatchling(0, 300, 500);
    run(crab, [far], 1);
    expect(crab.state).toBe("idle");
  });

  it("emerges and catches a hatchling on contact", () => {
    const crab = makePredator("crab-0", crabDef);
    const h = crawlingHatchling(0, 100, 250); // 50px away, within sense
    const events = run(crab, [h], 2.5);
    expect(h.state).toBe("caught");
    expect(crab.catches).toBe(1);
    expect(events).toContainEqual({ type: "hatchling-caught", id: 0, predatorId: "crab-0" });
  });

  it("digests after a catch before hunting again", () => {
    const crab = makePredator("crab-0", crabDef);
    const h1 = crawlingHatchling(0, 100, 250);
    run(crab, [h1], 2.5);
    expect(crab.state).toBe("digesting");
    const h2 = crawlingHatchling(1, crab.x, crab.y); // right on top of the crab
    run(crab, [h2], 0.5);
    expect(h2.state).toBe("crawling"); // digestion pauses hunting
    run(crab, [h2], 2.5);
    expect(h2.state).toBe("caught");
    expect(crab.catches).toBe(2);
  });

  it("returns to the burrow when scared and cools down there", () => {
    const crab = makePredator("crab-0", crabDef);
    const h = crawlingHatchling(0, 100, 250);
    run(crab, [h], 1); // out on the sand
    expect(crab.state).toBe("hunting");
    scare(crab);
    expect(crab.state).toBe("scared");
    run(crab, [h], 1.5);
    expect(crab.state).toBe("idle");
    expect(crab.x).toBe(crabDef.burrow.x);
    expect(crab.y).toBe(crabDef.burrow.y);
    expect(crab.cooldown).toBeGreaterThan(0);
    expect(crab.cooldown).toBeLessThanOrEqual(crabDef.scaredCooldownSec);
    // Burrowed crab ignores nearby hatchlings until the cooldown elapses.
    const events = run(crab, [h], 1);
    expect(events).toHaveLength(0);
  });
});

describe("frigatebird", () => {
  it("enters a telegraphed windup and emits a dive-warning with the locked point", () => {
    const bird = makePredator("bird-0", birdDef);
    const h = crawlingHatchling(0, 100, 220);
    const events = run(bird, [h], 0.3);
    expect(bird.state).toBe("windup");
    expect(bird.targetId).toBe(0);
    const warning = events.find((e) => e.type === "dive-warning");
    expect(warning).toEqual({
      type: "dive-warning",
      predatorId: "bird-0",
      targetId: 0,
      x: 100,
      y: 220,
      windupSec: birdDef.windupSec,
    });
    expect(bird.lockX).toBe(100);
    expect(bird.lockY).toBe(220);
  });

  it("catches the target at windup end if still within dive radius of the lock", () => {
    const bird = makePredator("bird-0", birdDef);
    const h = crawlingHatchling(0, 100, 220);
    const events = run(bird, [h], 1);
    expect(h.state).toBe("caught");
    expect(bird.catches).toBe(1);
    expect(events).toContainEqual({ type: "hatchling-caught", id: 0, predatorId: "bird-0" });
    expect(bird.state).toBe("idle");
  });

  it("misses and cools down when the target leaves the dive radius during windup", () => {
    const patientBird = makePredator("bird-0", { ...birdDef, pickIntervalSec: 2 });
    const h = crawlingHatchling(0, 100, 220);
    run(patientBird, [h], 0.3); // windup starts
    h.y -= 200; // target escapes far from the locked point
    run(patientBird, [h], 0.3); // windup ends -> miss
    expect(h.state).toBe("crawling");
    expect(patientBird.catches).toBe(0);
    expect(patientBird.state).toBe("idle");
    expect(patientBird.cooldown).toBeGreaterThan(1); // waits before the next attempt
  });

  it("cancels the dive when scared during windup", () => {
    const bird = makePredator("bird-0", birdDef);
    const h = crawlingHatchling(0, 100, 220);
    run(bird, [h], 0.3); // windup starts
    scare(bird);
    run(bird, [h], 1.5);
    expect(h.state).toBe("crawling");
    expect(bird.catches).toBe(0);
    expect(bird.state).toBe("idle");
    expect(bird.x).toBe(birdDef.perch.x);
    expect(bird.y).toBe(birdDef.perch.y);
  });
});

describe("lava heron", () => {
  it("winds up when a crawling hatchling enters trigger radius and lunges", () => {
    const heron = makePredator("heron-0", heronDef);
    const h = crawlingHatchling(0, 300, 200); // 60px from the rock
    run(heron, [h], 0.3);
    expect(heron.state).toBe("windup");
    const events = run(heron, [h], 0.5);
    expect(h.state).toBe("caught");
    expect(heron.catches).toBe(1);
    expect(events).toContainEqual({ type: "hatchling-caught", id: 0, predatorId: "heron-0" });
    expect(heron.state).toBe("idle");
    expect(heron.cooldown).toBeGreaterThan(0);
    expect(heron.cooldown).toBeLessThanOrEqual(heronDef.strikeCooldownSec);
  });

  it("lunges at any crawling hatchling within reach, not only the trigger target", () => {
    const heron = makePredator("heron-0", heronDef);
    const trigger = crawlingHatchling(0, 300, 200);
    const bystander = crawlingHatchling(1, 310, 190);
    run(heron, [trigger, bystander], 0.3); // targets nearest: trigger
    trigger.y -= 200; // trigger escapes
    run(heron, [trigger, bystander], 0.5);
    expect(bystander.state).toBe("caught");
    expect(trigger.state).toBe("crawling");
  });

  it("flies off when scared and only hunts again after the cooldown", () => {
    const heron = makePredator("heron-0", heronDef);
    const h = crawlingHatchling(0, 300, 200);
    run(heron, [h], 0.3);
    scare(heron);
    run(heron, [h], 1.5);
    expect(h.state).toBe("crawling");
    expect(heron.state).toBe("idle");
    expect(heron.x).toBe(heronDef.rock.x);
    expect(heron.cooldown).toBeGreaterThan(0);
    expect(heron.cooldown).toBeLessThanOrEqual(heronDef.scaredCooldownSec);
    const events = run(heron, [h], 1); // still cooling down, h is in range
    expect(events).toHaveLength(0);
  });
});
