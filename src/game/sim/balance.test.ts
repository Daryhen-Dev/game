import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "./config";
import { evaluateOutcome, survivalRate } from "./ecosystem";
import { createRng } from "./rng";
import { Simulation } from "./simulation";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function runPassive(seed: number): number {
  const sim = new Simulation(LEVEL_1, createRng(seed));
  let guard = 60 * LEVEL_1.maxDurationSec + 1;
  while (!sim.finished && guard-- > 0) sim.update(1 / 60);
  expect(sim.finished).toBe(true);
  return survivalRate(sim.counts.safe, LEVEL_1.hatchlings);
}

/**
 * Perfect-protector bot: whenever energy allows, scares the most dangerous
 * predator in reach — imminent windup strikes first, then hunting crabs.
 */
function runProtector(seed: number): number {
  const sim = new Simulation(LEVEL_1, createRng(seed));
  const { scareCost } = LEVEL_1.energy;
  let guard = 60 * LEVEL_1.maxDurationSec + 1;
  while (!sim.finished && guard-- > 0) {
    sim.update(1 / 60);
    if (sim.energy < scareCost) continue;
    const preds = sim.predators;
    const windup = preds.find((p) => p.state === "windup");
    if (windup) {
      sim.scare(windup.x, windup.y);
      continue;
    }
    const hunting = preds
      .filter((p) => p.kind === "ghostCrab" && (p.state === "hunting" || p.state === "digesting"))
      .sort(
        (a, b) =>
          a.y - b.y, // closest to the sea = most imminent threat
      )[0];
    if (hunting) sim.scare(hunting.x, hunting.y);
  }
  expect(sim.finished).toBe(true);
  return survivalRate(sim.counts.safe, LEVEL_1.hatchlings);
}

describe("Level 1 ecosystem balance", () => {
  it("terminates within the level duration cap for every seed", () => {
    for (const seed of SEEDS) {
      const sim = new Simulation(LEVEL_1, createRng(seed));
      let guard = 60 * LEVEL_1.maxDurationSec + 1;
      while (!sim.finished && guard-- > 0) sim.update(1 / 60);
      expect(sim.finished).toBe(true);
      expect(sim.elapsed).toBeLessThan(LEVEL_1.maxDurationSec);
    }
  });

  it("passive play loses: mean survival rate is below the healthy band", () => {
    const rates = SEEDS.map(runPassive);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean).toBeLessThan(LEVEL_1.healthyBand.min);
  });

  it("perfect protection overshoots: mean survival rate is above the healthy band", () => {
    const rates = SEEDS.map(runProtector);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean).toBeGreaterThan(LEVEL_1.healthyBand.max);
  });

  it("outcomes follow the band edges", () => {
    for (const seed of SEEDS) {
      const sim = new Simulation(LEVEL_1, createRng(seed));
      let guard = 60 * LEVEL_1.maxDurationSec + 1;
      while (!sim.finished && guard-- > 0) sim.update(1 / 60);
      const rate = survivalRate(sim.counts.safe, LEVEL_1.hatchlings);
      expect(sim.outcome).toBe(evaluateOutcome(rate, LEVEL_1.healthyBand));
    }
  });
});
