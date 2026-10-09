import { describe, expect, it } from "vitest";
import { hatchlingPose, strokeFrequency, volumeScaleXZ } from "./hatchlingPose";

const PERIOD_TOLERANCE = 1e-6;

describe("strokeFrequency", () => {
  it("increases with crawl speed", () => {
    const slow = strokeFrequency(20);
    const fast = strokeFrequency(32);
    expect(fast).toBeGreaterThan(slow);
  });

  it("stays positive even for a resting hatchling", () => {
    expect(strokeFrequency(0)).toBeGreaterThan(0);
  });
});

describe("hatchlingPose", () => {
  it("front flippers row in anti-phase (alternating strokes)", () => {
    for (let i = 0; i < 40; i++) {
      const pose = hatchlingPose(26, 1.1, i * 0.037);
      expect(pose.flipperL).toBeCloseTo(-pose.flipperR, 9);
    }
  });

  it("is periodic with the stroke period", () => {
    const speed = 26;
    const period = 1 / strokeFrequency(speed);
    const a = hatchlingPose(speed, 0.7, 1.234);
    const b = hatchlingPose(speed, 0.7, 1.234 + period);
    expect(a.flipperL).toBeCloseTo(b.flipperL, 6);
    expect(a.flipperR).toBeCloseTo(b.flipperR, 6);
    expect(a.bob).toBeCloseTo(b.bob, 6);
    expect(a.roll).toBeCloseTo(b.roll, 6);
    expect(a.squash).toBeCloseTo(b.squash, 6);
  });

  it("keeps flipper angles bounded and non-trivial", () => {
    let maxAbs = 0;
    for (let i = 0; i < 100; i++) {
      const pose = hatchlingPose(26, 0.3, i * 0.05);
      expect(Math.abs(pose.flipperL)).toBeLessThanOrEqual(Math.PI / 2 + PERIOD_TOLERANCE);
      maxAbs = Math.max(maxAbs, Math.abs(pose.flipperL));
    }
    expect(maxAbs).toBeGreaterThan(0.3);
  });

  it("wobbles the body (roll) while crawling", () => {
    let maxRoll = 0;
    for (let i = 0; i < 100; i++) maxRoll = Math.max(maxRoll, Math.abs(hatchlingPose(26, 0, i * 0.05).roll));
    expect(maxRoll).toBeGreaterThan(0.02);
  });

  it("squash stays near 1 and keeps volume constant via volumeScaleXZ", () => {
    for (let i = 0; i < 100; i++) {
      const squash = hatchlingPose(26, 0.9, i * 0.061).squash;
      expect(squash).toBeGreaterThan(0.85);
      expect(squash).toBeLessThan(1.15);
      const scaleXZ = volumeScaleXZ(squash);
      expect(squash * scaleXZ * scaleXZ).toBeCloseTo(1, 9);
    }
  });

  it("paddles slower when the hatchling is slower (smaller amplitude)", () => {
    let maxSlow = 0;
    let maxFast = 0;
    for (let i = 0; i < 100; i++) {
      maxSlow = Math.max(maxSlow, Math.abs(hatchlingPose(8, 0, i * 0.03).flipperL));
      maxFast = Math.max(maxFast, Math.abs(hatchlingPose(32, 0, i * 0.03).flipperL));
    }
    expect(maxFast).toBeGreaterThan(maxSlow);
  });
});
