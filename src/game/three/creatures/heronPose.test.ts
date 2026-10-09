import { describe, expect, it } from "vitest";
import { heronPose } from "./heronPose";

describe("heronPose — windup", () => {
  it("neck extension increases monotonically over windup progress", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const extension = heronPose("windup", i / 20, 1.3).neckExtension;
      expect(extension).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = extension;
    }
  });

  it("starts folded and fully extends at the strike", () => {
    expect(heronPose("windup", 0, 1.3).neckExtension).toBeLessThan(0.2);
    expect(heronPose("windup", 1, 1.3).neckExtension).toBeCloseTo(1, 9);
  });

  it("crouches during the windup and releases by the strike", () => {
    expect(heronPose("windup", 0, 1.3).crouch).toBeCloseTo(0, 9);
    let maxCrouch = 0;
    for (let i = 0; i <= 20; i++) {
      const crouch = heronPose("windup", i / 20, 1.3).crouch;
      expect(crouch).toBeGreaterThanOrEqual(0);
      expect(crouch).toBeLessThanOrEqual(1);
      maxCrouch = Math.max(maxCrouch, crouch);
    }
    expect(maxCrouch).toBeGreaterThan(0.3);
    expect(heronPose("windup", 1, 1.3).crouch).toBeLessThan(maxCrouch);
  });
});

describe("heronPose — stand", () => {
  it("does not flap while standing", () => {
    for (let i = 0; i < 40; i++) expect(heronPose("stand", 0, i * 0.07).wingFlap).toBe(0);
  });

  it("breathes with a small bounded sway", () => {
    let maxSway = 0;
    for (let i = 0; i < 100; i++) {
      const pose = heronPose("stand", 0, i * 0.11);
      expect(pose.neckExtension).toBeGreaterThan(0);
      expect(pose.neckExtension).toBeLessThan(0.6);
      maxSway = Math.max(maxSway, Math.abs(pose.neckSway));
    }
    expect(maxSway).toBeGreaterThan(0.01);
    expect(maxSway).toBeLessThan(0.4);
  });

  it("keeps the neck below the lunge extension", () => {
    for (let i = 0; i < 40; i++) {
      expect(heronPose("stand", 0, i * 0.07).neckExtension).toBeLessThan(
        heronPose("windup", 1, i * 0.07).neckExtension,
      );
    }
  });
});

describe("heronPose — scared", () => {
  it("flaps periodically with visible amplitude", () => {
    const period = 1 / 9; // scared flap rate is bounded and periodic
    let maxFlap = 0;
    for (let i = 0; i <= 40; i++) {
      const flap = heronPose("scared", 0, (i / 40) * period).wingFlap;
      expect(Math.abs(flap)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
      maxFlap = Math.max(maxFlap, Math.abs(flap));
    }
    expect(maxFlap).toBeGreaterThan(0.3);
  });

  it("does not crouch while flying away", () => {
    for (let i = 0; i < 40; i++) expect(heronPose("scared", 0, i * 0.07).crouch).toBe(0);
  });
});
