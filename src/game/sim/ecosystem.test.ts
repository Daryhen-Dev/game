import { describe, expect, it } from "vitest";
import { evaluateOutcome, projectedRate, score, survivalRate } from "./ecosystem";

const BAND = { min: 0.5, max: 0.7 };

describe("survivalRate", () => {
  it("is safe / total", () => {
    expect(survivalRate(20, 40)).toBeCloseTo(0.5);
  });

  it("returns 0 for an empty level (no hatchlings)", () => {
    expect(survivalRate(0, 0)).toBe(0);
  });

  it("clamps to 1 when safe exceeds total (defensive)", () => {
    expect(survivalRate(41, 40)).toBe(1);
  });
});

describe("evaluateOutcome", () => {
  it("balanced strictly inside the band", () => {
    expect(evaluateOutcome(0.6, BAND)).toBe("balanced");
  });

  it("inclusive band edges count as balanced", () => {
    expect(evaluateOutcome(0.5, BAND)).toBe("balanced");
    expect(evaluateOutcome(0.7, BAND)).toBe("balanced");
  });

  it("below the band is turtle collapse", () => {
    expect(evaluateOutcome(0.49, BAND)).toBe("turtle-collapse");
    expect(evaluateOutcome(0, BAND)).toBe("turtle-collapse");
  });

  it("above the band is predators starving", () => {
    expect(evaluateOutcome(0.71, BAND)).toBe("predators-starve");
    expect(evaluateOutcome(1, BAND)).toBe("predators-starve");
  });
});

describe("score", () => {
  it("is 0 outside the band", () => {
    expect(score(0.2, BAND)).toBe(0);
    expect(score(0.9, BAND)).toBe(0);
  });

  it("peaks at 1000 at the band center", () => {
    expect(score(0.6, BAND)).toBe(1000);
  });

  it("falls off linearly toward the band edges and is 0 at the edges", () => {
    // Center 0.6, half-width 0.1: rate 0.55 is halfway to the edge -> 500.
    expect(score(0.55, BAND)).toBe(500);
    expect(score(0.5, BAND)).toBe(0);
    expect(score(0.7, BAND)).toBe(0);
  });

  it("is an integer in 0..1000 for in-band rates", () => {
    for (let r = 0.5; r <= 0.7; r += 0.001) {
      const s = score(r, BAND);
      expect(s).toBe(Math.round(s));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1000);
    }
  });
});

describe("projectedRate", () => {
  // Semantics: live HUD projection assuming every still-crawling hatchling
  // reaches the sea: (safe + crawling) / total.
  it("projects safe plus still-crawling over total", () => {
    expect(projectedRate(10, 5, 5, 40)).toBeCloseTo(15 / 40);
  });

  it("equals the final survival rate once nothing is crawling", () => {
    expect(projectedRate(24, 0, 16, 40)).toBeCloseTo(0.6);
  });

  it("returns 0 for an empty level", () => {
    expect(projectedRate(0, 0, 0, 0)).toBe(0);
  });
});
