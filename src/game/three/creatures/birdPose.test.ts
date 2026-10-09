import { describe, expect, it } from "vitest";
import { birdPose, flapFrequency } from "./birdPose";

describe("flapFrequency", () => {
  it("flaps faster when scared than in normal flight", () => {
    expect(flapFrequency("scared")).toBeGreaterThan(flapFrequency("fly"));
  });

  it("keeps a positive flap rate in every mode", () => {
    expect(flapFrequency("fly")).toBeGreaterThan(0);
    expect(flapFrequency("windup")).toBeGreaterThan(0);
  });
});

describe("birdPose — fly", () => {
  it("flaps with mirrored wings, periodic over the glide cycle, and bounded", () => {
    // The glide envelope runs at a quarter of the flap rate: the wing angle
    // repeats every 4 strokes.
    const period = 4 / flapFrequency("fly");
    const a = birdPose("fly", 0, 3.7);
    const b = birdPose("fly", 0, 3.7 + period);
    expect(a.wingL).toBeCloseTo(b.wingL, 6);
    expect(a.wingL).toBeCloseTo(-a.wingR, 9);
    expect(Math.abs(a.wingL)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    expect(Math.abs(a.wingL)).toBeGreaterThan(0.1);
  });

  it("never tucks or dives in normal flight", () => {
    for (let i = 0; i < 40; i++) {
      const pose = birdPose("fly", 0, i * 0.07);
      expect(pose.tuck).toBe(0);
      expect(pose.pitch).toBeLessThanOrEqual(0);
    }
  });

  it("banks gently while circling", () => {
    let maxBank = 0;
    for (let i = 0; i < 100; i++) maxBank = Math.max(maxBank, Math.abs(birdPose("fly", 0, i * 0.11).bank));
    expect(maxBank).toBeGreaterThan(0.02);
    expect(maxBank).toBeLessThan(0.5);
  });
});

describe("birdPose — windup", () => {
  it("tuck grows monotonically with windup progress and completes at 1", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const tuck = birdPose("windup", i / 20, 2.0).tuck;
      expect(tuck).toBeGreaterThanOrEqual(prev);
      prev = tuck;
    }
    expect(birdPose("windup", 1, 2.0).tuck).toBeCloseTo(1, 9);
    expect(birdPose("windup", 0, 2.0).tuck).toBeCloseTo(0, 9);
  });

  it("wings fold in: folded wings barely move (motion amplitude shrinks)", () => {
    const dt = 0.02;
    const openMotion = Math.abs(
      birdPose("windup", 0, 1.234).wingL - birdPose("windup", 0, 1.234 + dt).wingL,
    );
    const foldedMotion = Math.abs(
      birdPose("windup", 1, 1.234).wingL - birdPose("windup", 1, 1.234 + dt).wingL,
    );
    expect(foldedMotion).toBeLessThan(openMotion);
  });

  it("pitches nose-down as the dive approaches", () => {
    const start = birdPose("windup", 0, 1.0).pitch;
    const end = birdPose("windup", 1, 1.0).pitch;
    expect(end).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(0.2);
  });
});

describe("birdPose — scared", () => {
  it("flaps faster and harder than normal flight", () => {
    let maxFly = 0;
    let maxScared = 0;
    for (let i = 0; i < 100; i++) {
      maxFly = Math.max(maxFly, Math.abs(birdPose("fly", 0, i * 0.02).wingL));
      maxScared = Math.max(maxScared, Math.abs(birdPose("scared", 0, i * 0.02).wingL));
    }
    expect(maxScared).toBeGreaterThan(maxFly);
  });

  it("climbs nose-up while fleeing", () => {
    expect(birdPose("scared", 0, 0.4).pitch).toBeLessThan(0);
  });
});
