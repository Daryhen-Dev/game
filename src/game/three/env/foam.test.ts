import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../../sim";
import { seaLineZ } from "../../three/worldMap";
import {
  SWASH_AMPLITUDE_M,
  SWASH_LATERAL_WOBBLE_M,
  foamStrength,
  waterEdgeZ,
} from "./foam";

const seaZ = seaLineZ(LEVEL_1.world);

describe("waterEdgeZ", () => {
  it("advances and retreats within swash + lateral wobble of the sea line", () => {
    for (let t = 0; t <= 40; t += 0.13) {
      for (const x of [-20, -7, 0, 5, 18]) {
        const edge = waterEdgeZ(x, t, seaZ);
        expect(edge).toBeGreaterThanOrEqual(
          seaZ - SWASH_AMPLITUDE_M - SWASH_LATERAL_WOBBLE_M - 1e-9,
        );
        expect(edge).toBeLessThanOrEqual(
          seaZ + SWASH_AMPLITUDE_M + SWASH_LATERAL_WOBBLE_M + 1e-9,
        );
      }
    }
  });

  it("is wavy along the shore (no ruler-straight waterline)", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = -30; x <= 30; x += 0.25) {
      const edge = waterEdgeZ(x, 3.7, seaZ);
      min = Math.min(min, edge);
      max = Math.max(max, edge);
    }
    expect(max - min).toBeGreaterThan(0.8);
  });

  it("is deterministic", () => {
    expect(waterEdgeZ(7.7, 2.2, seaZ)).toBe(waterEdgeZ(7.7, 2.2, seaZ));
  });
});

describe("foamStrength", () => {
  it("is strong at the moving water edge for every phase of the swash", () => {
    for (let t = 0; t <= 40; t += 0.31) {
      for (const x of [-15, 0, 12]) {
        const edge = waterEdgeZ(x, t, seaZ);
        expect(foamStrength(edge, x, t, seaZ)).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it("vanishes inland of the swash reach", () => {
    for (let t = 0; t <= 40; t += 0.31) {
      for (const x of [-15, 0, 12]) {
        const edge = waterEdgeZ(x, t, seaZ);
        expect(foamStrength(edge + 4, x, t, seaZ)).toBeLessThan(1e-9);
      }
    }
  });

  it("fades out far offshore", () => {
    for (let t = 0; t <= 40; t += 0.31) {
      const edge = waterEdgeZ(0, t, seaZ);
      expect(foamStrength(edge - 50, 0, t, seaZ)).toBeLessThan(0.05);
    }
  });

  it("stays within 0..1 and is deterministic", () => {
    for (let t = 0; t <= 20; t += 0.47) {
      for (let z = seaZ - 30; z <= seaZ + 4; z += 0.61) {
        for (const x of [-9, 3]) {
          const foam = foamStrength(z, x, t, seaZ);
          expect(foam).toBeGreaterThanOrEqual(0);
          expect(foam).toBeLessThanOrEqual(1 + 1e-9);
          expect(foam).toBe(foamStrength(z, x, t, seaZ));
        }
      }
    }
  });
});
