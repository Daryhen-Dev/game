import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../sim";
import { SCALE_M_PER_PX, seaLineZ, simToWorld, worldToSim } from "./worldMap";

const world = LEVEL_1.world;

describe("simToWorld", () => {
  it("maps the sim center to the ground origin", () => {
    expect(simToWorld(world.width / 2, world.height / 2, world)).toEqual({ x: 0, z: 0 });
  });

  it("uses the documented scale (1 sim px = 0.05 m)", () => {
    expect(SCALE_M_PER_PX).toBe(0.05);
    // 360 x 640 px -> 18 m x 32 m, centered on the sim center.
    expect(simToWorld(0, 0, world)).toEqual({ x: -9, z: -16 });
    expect(simToWorld(world.width, world.height, world)).toEqual({ x: 9, z: 16 });
  });

  it("places the nest centered on X, toward +Z", () => {
    const nest = simToWorld(world.nest.x, world.nest.y, world);
    expect(nest.x).toBe(0);
    expect(nest.z).toBeCloseTo((world.nest.y - world.height / 2) * SCALE_M_PER_PX, 9);
    expect(nest.z).toBeGreaterThan(0);
  });

  it("reports the sea line Z (negative: sea toward -Z)", () => {
    expect(seaLineZ(world)).toBeCloseTo((world.seaLineY - world.height / 2) * SCALE_M_PER_PX, 9);
    expect(seaLineZ(world)).toBeLessThan(0);
  });

  it("keeps orientation: smaller sim y is closer to the sea (more negative Z)", () => {
    expect(simToWorld(180, 90, world).z).toBeLessThan(simToWorld(180, 110, world).z);
    expect(simToWorld(180, world.seaLineY - 1, world).z).toBeLessThan(seaLineZ(world));
  });
});

describe("worldToSim", () => {
  it("is the exact inverse of simToWorld (round-trip)", () => {
    const samples: Array<readonly [number, number]> = [
      [0, 0],
      [180, 96],
      [360, 640],
      [110, 330],
      [300, 140],
      [world.nest.x, world.nest.y],
    ];
    for (const [x, y] of samples) {
      const ground = simToWorld(x, y, world);
      const back = worldToSim(ground.x, ground.z, world);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
  });
});
