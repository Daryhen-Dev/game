import { describe, expect, it } from "vitest";
import { LEG_MAX_SWING, crabPose, crabStepFrequency } from "./crabPose";

describe("crabStepFrequency", () => {
  it("increases with speed", () => {
    expect(crabStepFrequency(10)).toBeLessThan(crabStepFrequency(26));
  });

  it("is positive even at speed 0", () => {
    expect(crabStepFrequency(0)).toBeGreaterThan(0);
  });
});

describe("crabPose", () => {
  it("leg sets alternate in anti-phase", () => {
    for (let i = 0; i < 40; i++) {
      const pose = crabPose(i * 0.043, 26, false);
      expect(pose.legsL).toBeCloseTo(-pose.legsR, 9);
    }
  });

  it("is periodic with the step period", () => {
    const period = 1 / crabStepFrequency(26);
    const a = crabPose(2.71, 26, false);
    const b = crabPose(2.71 + period, 26, false);
    expect(a.legsL).toBeCloseTo(b.legsL, 6);
    expect(a.sway).toBeCloseTo(b.sway, 6);
    expect(a.claw).toBeCloseTo(b.claw, 6);
  });

  it("settles when standing still (speed 0)", () => {
    const pose = crabPose(1.234, 0, false);
    expect(pose.legsL).toBe(0);
    expect(pose.legsR).toBe(0);
    expect(pose.sway).toBe(0);
  });

  it("never hops unless scared", () => {
    for (let i = 0; i < 100; i++) {
      expect(crabPose(i * 0.031, 26, false).hop).toBe(0);
    }
  });

  it("hops while scared with a positive bounce", () => {
    let maxHop = 0;
    for (let i = 0; i < 100; i++) {
      const hop = crabPose(i * 0.031, 41.6, true).hop;
      expect(hop).toBeGreaterThanOrEqual(0);
      maxHop = Math.max(maxHop, hop);
    }
    expect(maxHop).toBeGreaterThan(0.03);
  });

  it("keeps leg swing and sway bounded", () => {
    for (let i = 0; i < 100; i++) {
      const pose = crabPose(i * 0.05, 40, true);
      expect(Math.abs(pose.legsL)).toBeLessThanOrEqual(LEG_MAX_SWING + 1e-9);
      expect(Math.abs(pose.sway)).toBeLessThanOrEqual(0.06 + 1e-9);
    }
  });

  it("waves the big claw while moving", () => {
    let maxDelta = 0;
    let prev = crabPose(0, 26, false).claw;
    for (let i = 1; i < 100; i++) {
      const claw = crabPose(i * 0.02, 26, false).claw;
      maxDelta = Math.max(maxDelta, Math.abs(claw - prev));
      prev = claw;
    }
    expect(maxDelta).toBeGreaterThan(0.01);
  });
});
