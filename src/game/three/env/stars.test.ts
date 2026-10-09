import { describe, expect, it } from "vitest";
import { starDirections } from "./stars";

describe("starDirections", () => {
  it("returns the requested count of unit vectors above the horizon", () => {
    const stars = starDirections(7, 300);
    expect(stars).toHaveLength(300);
    for (const s of stars) {
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
      expect(s.y).toBeGreaterThanOrEqual(0.04); // never below the horizon
    }
  });

  it("is deterministic for the same seed", () => {
    expect(starDirections(42, 120)).toEqual(starDirections(42, 120));
  });

  it("differs between seeds and spreads stars around the sky", () => {
    const a = starDirections(1, 50);
    const b = starDirections(2, 50);
    expect(a).not.toEqual(b);
    const xs = a.map((s) => s.x);
    expect(Math.min(...xs)).toBeLessThan(-0.2);
    expect(Math.max(...xs)).toBeGreaterThan(0.2);
  });
});
