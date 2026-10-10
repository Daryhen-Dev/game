/**
 * Pure heading math shared by creature models. No Three.js, no DOM.
 *
 * Three.js convention used throughout the creature builders: a mesh's forward
 * direction is local -Z, and `rotation.y = heading` rotates that forward
 * vector to (-sin(heading), 0, -cos(heading)).
 */

/**
 * Y-rotation (radians) so a model whose forward is -Z faces the velocity
 * (vx, vz). Returns 0 for a zero vector.
 */
export function headingFromVelocity(vx: number, vz: number): number {
  if (vx === 0 && vz === 0) return 0;
  // Normalize -0 so atan2 returns +PI (not -PI) for the +Z half-turn.
  const nx = vx === 0 ? 0 : -vx;
  const nz = vz === 0 ? 0 : -vz;
  return Math.atan2(nx, nz);
}

/**
 * Y-rotation (radians) so a model whose "front side" is local +X moves along
 * the velocity (sideways scuttlers such as the ghost crab). Returns 0 for a
 * zero vector.
 */
export function headingFromVelocitySideX(vx: number, vz: number): number {
  if (vx === 0 && vz === 0) return 0;
  const nz = vz === 0 ? 0 : -vz;
  return Math.atan2(nz, vx);
}
