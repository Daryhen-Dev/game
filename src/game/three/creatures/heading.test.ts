import { describe, expect, it } from "vitest";
import { headingFromVelocity, headingFromVelocitySideX } from "./heading";

describe("headingFromVelocity", () => {
  it("returns 0 for a model facing -Z (toward the sea)", () => {
    expect(headingFromVelocity(0, -1)).toBeCloseTo(0, 9);
  });

  it("turns toward +X (right) with a negative yaw", () => {
    expect(headingFromVelocity(1, 0)).toBeCloseTo(-Math.PI / 2, 9);
  });

  it("turns toward -X (left) with a positive yaw", () => {
    expect(headingFromVelocity(-1, 0)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("faces +Z (toward the nest) with a half-turn", () => {
    expect(headingFromVelocity(0, 1)).toBeCloseTo(Math.PI, 9);
  });

  it("is scale-invariant (direction only, not speed)", () => {
    expect(headingFromVelocity(2, -2)).toBeCloseTo(headingFromVelocity(0.01, -0.01), 9);
  });

  it("returns 0 for a zero velocity vector", () => {
    expect(headingFromVelocity(0, 0)).toBe(0);
  });
});

describe("headingFromVelocitySideX", () => {
  it("points the model's local +X along the velocity", () => {
    // Moving +Z: local +X must point +Z -> yaw rotates +X (1,0,0) to (0,0,1).
    expect(headingFromVelocitySideX(0, 1)).toBeCloseTo(-Math.PI / 2, 9);
    // Moving -Z: local +X points -Z.
    expect(headingFromVelocitySideX(0, -1)).toBeCloseTo(Math.PI / 2, 9);
    // Moving +X: no rotation needed.
    expect(headingFromVelocitySideX(1, 0)).toBeCloseTo(0, 9);
  });

  it("is the forward-heading shifted by a quarter turn", () => {
    expect(headingFromVelocitySideX(3, -4)).toBeCloseTo(headingFromVelocity(3, -4) + Math.PI / 2, 9);
  });

  it("returns 0 for a zero velocity vector", () => {
    expect(headingFromVelocitySideX(0, 0)).toBe(0);
  });
});
