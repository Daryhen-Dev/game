import { describe, expect, it } from "vitest";
import { rayToGround } from "./picking";

describe("rayToGround", () => {
  it("hits the ground straight below the origin", () => {
    expect(rayToGround({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 })).toEqual({ x: 0, z: 0 });
  });

  it("intercepts the plane along a slanted ray", () => {
    // Origin (1,5,2), direction (0.6,-0.8,0): t = 5/0.8 = 6.25 -> x = 4.75.
    const hit = rayToGround({ x: 1, y: 5, z: 2 }, { x: 0.6, y: -0.8, z: 0 });
    expect(hit).not.toBeNull();
    expect(hit?.x).toBeCloseTo(4.75, 9);
    expect(hit?.z).toBeCloseTo(2, 9);
  });

  it("respects a custom ground height", () => {
    const hit = rayToGround({ x: 0, y: 4, z: 3 }, { x: 0, y: -1, z: 0 }, 2);
    expect(hit).toEqual({ x: 0, z: 3 });
  });

  it("returns null for a ray parallel to the ground", () => {
    expect(rayToGround({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });

  it("returns null for a numerically parallel ray (tiny dir.y)", () => {
    expect(rayToGround({ x: 0, y: 5, z: 0 }, { x: 1, y: 1e-12, z: 0 })).toBeNull();
  });

  it("returns null when the ray points away from the ground", () => {
    expect(rayToGround({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });

  it("returns null when the origin is below the ground and the ray points down", () => {
    // Intersection lies behind the ray start (t < 0).
    expect(rayToGround({ x: 0, y: -1, z: 0 }, { x: 0, y: -1, z: 0 })).toBeNull();
  });

  it("accepts non-unit directions (scales the hit distance)", () => {
    const hit = rayToGround({ x: 0, y: 2, z: 0 }, { x: 4, y: -2, z: 6 });
    expect(hit).toEqual({ x: 4, z: 6 });
  });
});
