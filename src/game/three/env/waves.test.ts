import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../../sim";
import { seaLineZ } from "../../three/worldMap";
import { MAX_WAVE_AMPLITUDE_M, OCEAN_WAVES, shoreDamp, waveHeight } from "./waves";

const seaZ = seaLineZ(LEVEL_1.world);

describe("OCEAN_WAVES", () => {
  it("sums 2-4 gentle swell waves", () => {
    expect(OCEAN_WAVES.length).toBeGreaterThanOrEqual(2);
    expect(OCEAN_WAVES.length).toBeLessThanOrEqual(4);
    for (const wave of OCEAN_WAVES) {
      expect(wave.amplitudeM).toBeGreaterThan(0);
      expect(wave.wavelengthM).toBeGreaterThanOrEqual(6); // resolvable by the sea mesh grid
      expect(wave.periodSec).toBeGreaterThan(0);
    }
  });

  it("keeps the total amplitude gentle for a night shore", () => {
    expect(MAX_WAVE_AMPLITUDE_M).toBeLessThan(0.2);
  });
});

describe("waveHeight", () => {
  it("stays bounded by the sum of the wave amplitudes", () => {
    for (let t = 0; t <= 12; t += 0.7) {
      for (let x = -40; x <= 40; x += 3.7) {
        for (let z = -60; z <= -10; z += 2.3) {
          const h = waveHeight(x, z, t, seaZ);
          expect(Math.abs(h)).toBeLessThanOrEqual(MAX_WAVE_AMPLITUDE_M + 1e-9);
        }
      }
    }
  });

  it("is deterministic", () => {
    expect(waveHeight(3.3, -20.1, 4.2, seaZ)).toBe(waveHeight(3.3, -20.1, 4.2, seaZ));
  });

  it("is finite for negative times", () => {
    expect(Number.isFinite(waveHeight(0, -30, -5, seaZ))).toBe(true);
  });

  it("reaches at least 90% of the total amplitude offshore over time", () => {
    const z = seaZ - 20; // well offshore: full shoreDamp
    let max = 0;
    for (let t = 0; t <= 300; t += 0.25) {
      max = Math.max(max, Math.abs(waveHeight(1.1, z, t, seaZ)));
    }
    expect(max).toBeGreaterThanOrEqual(0.9 * MAX_WAVE_AMPLITUDE_M);
  });
});

describe("shoreDamp", () => {
  it("uses the full amplitude offshore and damps toward the waterline", () => {
    expect(shoreDamp(seaZ - 9, seaZ)).toBeCloseTo(1, 9);
    expect(shoreDamp(seaZ, seaZ)).toBeCloseTo(0.35, 9);
    expect(shoreDamp(seaZ + 2, seaZ)).toBeCloseTo(0.35, 9); // never amplifies on the sand
  });

  it("is monotonically non-increasing toward the shore and bounded", () => {
    let previous = 1;
    for (let z = seaZ - 12; z <= seaZ + 2; z += 0.5) {
      const damp = shoreDamp(z, seaZ);
      expect(damp).toBeLessThanOrEqual(previous + 1e-9);
      expect(damp).toBeGreaterThanOrEqual(0.35 - 1e-9);
      previous = damp;
    }
  });
});
