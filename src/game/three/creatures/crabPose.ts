/**
 * Pure pose function for the ghost crab (no Three.js).
 *
 * Sideways scuttle: the two leg sets alternate, the body sways, the big claw
 * waves while moving, and a scared crab does an exaggerated cartoon hop.
 */

export interface CrabPose {
  /** Left/right leg-set swing angle (radians, anti-phase). */
  legsL: number;
  legsR: number;
  /** Body sway roll (radians). */
  sway: number;
  /** Vertical hop offset (meters; 0 unless scared). */
  hop: number;
  /** Big-claw wave angle (radians). */
  claw: number;
}

/** Max leg-set swing amplitude (radians). */
export const LEG_MAX_SWING = Math.PI / 5;

/** Step frequency (Hz) for a scuttle speed in sim px/s. */
export function crabStepFrequency(speedPxPerSec: number): number {
  return 2 + speedPxPerSec * 0.14;
}

/** Compute the ghost crab pose for one render frame. */
export function crabPose(
  timeSec: number,
  speedPxPerSec: number,
  scared: boolean,
): CrabPose {
  const omega = 2 * Math.PI * crabStepFrequency(speedPxPerSec);
  // Standing crabs settle: swing/sway scale to zero with speed.
  const motion = Math.min(1, speedPxPerSec / 13);
  if (motion === 0 && !scared) {
    return { legsL: 0, legsR: 0, sway: 0, hop: 0, claw: 0.45 };
  }
  const swing = LEG_MAX_SWING * motion * Math.sin(omega * timeSec);
  // Scared crabs scuttle faster: the sim already multiplies retreat speed, so
  // the caller passes the higher speed; the hop is pose-only cartoon sugar.
  const hop = scared ? 0.09 * Math.abs(Math.sin(omega * timeSec * 0.5)) : 0;
  return {
    legsL: swing,
    legsR: swing === 0 ? 0 : -swing,
    sway: 0.06 * motion * Math.sin(omega * timeSec + Math.PI / 2),
    hop,
    claw: 0.45 + 0.3 * motion * Math.sin(2 * omega * timeSec),
  };
}
