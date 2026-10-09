import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../../sim";
import { SCALE_M_PER_PX, seaLineZ, simToWorld } from "../../three/worldMap";
import { type DuneConfig, duneHeight } from "./dunes";

const world = LEVEL_1.world;
const seaZ = seaLineZ(world);
// Ground extents of the sim playfield (x -9..9 m, sea line to bottom edge).
const playfieldHalfWidthM = (world.width / 2) * SCALE_M_PER_PX;
const playfieldFarZ = simToWorld(0, world.height, world).z;

const cfg: DuneConfig = {
  seaLineZ: seaZ,
  playfieldHalfWidthM,
  playfieldFarZ,
};

describe("duneHeight", () => {
  it("is exactly 0 across the whole playfield (ground picking stays exact)", () => {
    for (let x = -playfieldHalfWidthM; x <= playfieldHalfWidthM; x += 0.5) {
      for (let z = seaZ; z <= playfieldFarZ; z += 0.5) {
        expect(duneHeight(x, z, cfg)).toBe(0);
      }
    }
  });

  it("stays continuous (no cliffs between neighboring samples)", () => {
    for (let x = -20; x <= 20; x += 0.37) {
      for (let z = seaZ - 4; z <= playfieldFarZ + 12; z += 0.41) {
        const a = duneHeight(x, z, cfg);
        const b = duneHeight(x + 0.01, z + 0.01, cfg);
        expect(Math.abs(a - b)).toBeLessThan(0.05);
      }
    }
  });

  it("rises into dunes away from the play lane on both sides", () => {
    const meanAbsHeight = (x: number): number => {
      let sum = 0;
      let n = 0;
      for (let z = seaZ + 1; z <= playfieldFarZ; z += 1) {
        sum += Math.abs(duneHeight(x, z, cfg));
        n++;
      }
      return sum / n;
    };
    expect(meanAbsHeight(15)).toBeGreaterThan(meanAbsHeight(10.5));
    expect(meanAbsHeight(-15)).toBeGreaterThan(meanAbsHeight(-10.5));
    expect(meanAbsHeight(15)).toBeGreaterThan(0.2);
  });

  it("rises gently behind the nest (z beyond the playfield bottom edge)", () => {
    expect(duneHeight(0, playfieldFarZ + 10, cfg)).toBeGreaterThan(
      duneHeight(0, playfieldFarZ + 1, cfg),
    );
  });

  it("dips below the waterline offshore (shallow shore profile) without touching the playfield", () => {
    expect(duneHeight(0, seaZ - 0.79, cfg)).toBeCloseTo(0, 9);
    expect(duneHeight(0, seaZ - 3.5, cfg)).toBeLessThan(-0.15);
    expect(duneHeight(0, seaZ - 3.5, cfg)).toBeGreaterThan(-0.6);
  });

  it("is bounded everywhere on the visible sand", () => {
    for (let x = -30; x <= 30; x += 0.53) {
      for (let z = seaZ - 4; z <= playfieldFarZ + 14; z += 0.59) {
        const h = duneHeight(x, z, cfg);
        expect(h).toBeLessThanOrEqual(2 + 1e-9);
        expect(h).toBeGreaterThanOrEqual(-0.6 - 1e-9);
      }
    }
  });

  it("is deterministic", () => {
    expect(duneHeight(12.3, -5.1, cfg)).toBe(duneHeight(12.3, -5.1, cfg));
  });
});
