import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "./config";

describe("LEVEL_1 config", () => {
  it("has a valid healthy band (0 < min < max < 1)", () => {
    const { healthyBand } = LEVEL_1;
    expect(healthyBand.min).toBeGreaterThan(0);
    expect(healthyBand.min).toBeLessThan(healthyBand.max);
    expect(healthyBand.max).toBeLessThan(1);
  });

  it("has a positive number of hatchlings", () => {
    expect(LEVEL_1.hatchlings).toBeGreaterThan(0);
  });

  it("has a 360x640 portrait world with the sea at the top", () => {
    const { world } = LEVEL_1;
    expect(world.width).toBe(360);
    expect(world.height).toBe(640);
    expect(world.seaLineY).toBeGreaterThan(0);
    expect(world.seaLineY).toBeLessThan(world.height);
  });

  it("has a nest on the sand below the sea line", () => {
    const { nest } = LEVEL_1.world;
    expect(nest.x).toBeGreaterThan(0);
    expect(nest.x).toBeLessThan(LEVEL_1.world.width);
    expect(nest.y).toBeGreaterThan(LEVEL_1.world.seaLineY);
    expect(nest.y).toBeLessThan(LEVEL_1.world.height);
    expect(nest.spreadX).toBeGreaterThan(0);
  });

  it("has sane hatchling movement tunables", () => {
    const { speedMin, speedMax, wobble, spawnIntervalSec } = LEVEL_1.hatchling;
    expect(speedMin).toBeGreaterThan(0);
    expect(speedMax).toBeGreaterThanOrEqual(speedMin);
    expect(wobble).toBeGreaterThanOrEqual(0);
    expect(spawnIntervalSec).toBeGreaterThan(0);
  });

  it("has sane energy tunables", () => {
    const { max, regenPerSec, scareCost, scareRadius } = LEVEL_1.energy;
    expect(max).toBeGreaterThan(0);
    expect(regenPerSec).toBeGreaterThan(0);
    expect(scareCost).toBeGreaterThan(0);
    expect(scareCost).toBeLessThanOrEqual(max);
    expect(scareRadius).toBeGreaterThan(0);
  });

  it("defines at least one predator of each native kind", () => {
    const kinds = new Set(LEVEL_1.predators.map((p) => p.kind));
    expect(kinds).toContain("ghostCrab");
    expect(kinds).toContain("frigatebird");
    expect(kinds).toContain("lavaHeron");
    for (const def of LEVEL_1.predators) {
      expect(def.count).toBeGreaterThanOrEqual(1);
    }
  });

  it("places predators inside the world on the sand", () => {
    for (const def of LEVEL_1.predators) {
      const home =
        def.kind === "ghostCrab"
          ? def.burrow
          : def.kind === "frigatebird"
            ? def.perch
            : def.rock;
      expect(home.x).toBeGreaterThan(0);
      expect(home.x).toBeLessThan(LEVEL_1.world.width);
      expect(home.y).toBeGreaterThan(LEVEL_1.world.seaLineY);
      expect(home.y).toBeLessThan(LEVEL_1.world.height);
    }
  });

  it("has a positive level duration cap", () => {
    expect(LEVEL_1.maxDurationSec).toBeGreaterThan(0);
  });
});
