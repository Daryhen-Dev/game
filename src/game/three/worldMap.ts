/**
 * Pure mapping between simulation pixels and 3D ground coordinates (meters).
 *
 * Sim world: x 0..width, y 0..height (sea for y <= seaLineY, nest toward the
 * bottom edge). 3D ground: X centered on 0, the sea toward -Z and the nest
 * toward +Z, with the whole sim square centered on the ground origin.
 *
 * Scale: 1 sim px = 0.05 m, so the 360 x 640 px sim becomes an 18 m x 32 m
 * beach. No Three.js, no DOM.
 */

/** Meters per simulation pixel. */
export const SCALE_M_PER_PX = 0.05;

/** Subset of the sim WorldConfig needed by the mapping. */
export interface WorldMapConfig {
  width: number;
  height: number;
  seaLineY: number;
}

/** A point on the ground plane (y is always the ground height). */
export interface GroundPoint {
  x: number;
  z: number;
}

/** Map simulation pixel coordinates to ground meters. */
export function simToWorld(x: number, y: number, cfg: WorldMapConfig): GroundPoint {
  return {
    x: (x - cfg.width / 2) * SCALE_M_PER_PX,
    z: (y - cfg.height / 2) * SCALE_M_PER_PX,
  };
}

/** Inverse of `simToWorld`: ground meters back to simulation pixels. */
export function worldToSim(x: number, z: number, cfg: WorldMapConfig): { x: number; y: number } {
  return {
    x: x / SCALE_M_PER_PX + cfg.width / 2,
    y: z / SCALE_M_PER_PX + cfg.height / 2,
  };
}

/**
 * Allocation-free variant of `simToWorld` for per-frame loops: writes the
 * result into `out` and returns it (same reference).
 */
export function simToWorldInto(x: number, y: number, cfg: WorldMapConfig, out: GroundPoint): GroundPoint {
  out.x = (x - cfg.width / 2) * SCALE_M_PER_PX;
  out.z = (y - cfg.height / 2) * SCALE_M_PER_PX;
  return out;
}

/** Ground Z of the sea line: everything with a smaller Z is sea. */
export function seaLineZ(cfg: WorldMapConfig): number {
  return simToWorld(0, cfg.seaLineY, cfg).z;
}
