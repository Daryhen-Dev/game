import { describe, expect, it } from "vitest";
import { clamp01, easeOutBack, lifetime, pulse } from "./curves";

describe("clamp01", () => {
  it("clamps below 0 and above 1, and keeps in-range values", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.37)).toBe(0.37);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(2)).toBe(1);
  });
});

describe("easeOutBack", () => {
  it("passes through the exact endpoints", () => {
    expect(easeOutBack(0)).toBe(0);
    expect(easeOutBack(1)).toBeCloseTo(1, 9);
  });

  it("clamps out-of-range inputs to the endpoints", () => {
    expect(easeOutBack(-1)).toBe(0);
    expect(easeOutBack(2)).toBeCloseTo(1, 9);
  });

  it("overshoots above 1 near the end (cartoon pop)", () => {
    let max = 0;
    for (let i = 0; i <= 100; i++) max = Math.max(max, easeOutBack(i / 100));
    expect(max).toBeGreaterThan(1.05);
    expect(max).toBeLessThan(1.3);
  });

  it("is non-decreasing through the rise, then settles back to 1 (overshoot shape)", () => {
    // The overshoot means the curve rises past 1, peaks, and returns to 1:
    // monotone over the first half of the curve, then a smooth settle.
    for (let i = 1; i <= 50; i++) {
      expect(easeOutBack(i / 100)).toBeGreaterThanOrEqual(easeOutBack((i - 1) / 100));
    }
    expect(easeOutBack(0.58)).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBeCloseTo(1, 9);
  });
});

describe("pulse", () => {
  it("is periodic with the given period", () => {
    expect(pulse(1.3, 0.5)).toBeCloseTo(pulse(1.3 + 0.5, 0.5), 9);
    expect(pulse(0, 0.5)).toBeCloseTo(pulse(2.5, 0.5), 9);
  });

  it("is bounded in [-1, 1] and reaches both extremes", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 1000; i++) {
      const value = pulse(i * 0.001, 0.4);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThan(0.99);
    expect(min).toBeLessThan(-0.99);
  });

  it("starts at 0 heading positive (sin phase)", () => {
    expect(pulse(0, 0.5)).toBeCloseTo(0, 9);
    expect(pulse(0.125, 0.5)).toBeCloseTo(1, 9);
  });
});

describe("lifetime", () => {
  it("is linear between 0 and the lifetime", () => {
    expect(lifetime(0, 1)).toBe(0);
    expect(lifetime(0.25, 1)).toBeCloseTo(0.25, 9);
    expect(lifetime(0.5, 1)).toBeCloseTo(0.5, 9);
  });

  it("clamps to 1 once the lifetime is over", () => {
    expect(lifetime(1, 1)).toBe(1);
    expect(lifetime(5, 1)).toBe(1);
  });

  it("clamps negative ages to 0", () => {
    expect(lifetime(-0.1, 1)).toBe(0);
  });
});
