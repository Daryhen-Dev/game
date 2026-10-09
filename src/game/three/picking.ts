/**
 * Pure ground-plane ray picking: where does a ray cross the ground plane?
 *
 * Used by the renderer to turn a pointer ray into a ground point (and then a
 * simulation point via `worldToSim`). No Three.js, no DOM.
 */
import type { GroundPoint } from "./worldMap";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Rays flatter than this are treated as parallel to the ground. */
const PARALLEL_EPSILON = 1e-9;

/**
 * Intersect a ray with the ground plane y = `groundY`.
 * Returns null when the ray is parallel to the plane or the intersection
 * lies behind the ray origin (pointing away from / below the ground).
 */
export function rayToGround(origin: Vec3, dir: Vec3, groundY = 0): GroundPoint | null {
  if (Math.abs(dir.y) < PARALLEL_EPSILON) return null;
  const t = (groundY - origin.y) / dir.y;
  if (t <= 0) return null;
  return { x: origin.x + dir.x * t, z: origin.z + dir.z * t };
}
