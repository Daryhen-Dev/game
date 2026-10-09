/**
 * Pure pose function for the lava heron (no Three.js).
 *
 * Modes map 1:1 to sim predator states:
 * - "stand" (idle/digesting): breathing sway, folded S-neck,
 * - "windup": crouches, then the neck shoots forward monotonically
 *   (squash & stretch lunge),
 * - "scared": flaps away.
 */

export type HeronMode = "stand" | "windup" | "scared";

export interface HeronPose {
  /** 0 = folded S-neck, 1 = fully extended lunge. Monotonic during windup. */
  neckExtension: number;
  /** Body crouch 0..1 (lowers the body during the windup). */
  crouch: number;
  /** Standing body sway (radians). */
  sway: number;
  /** Neck S-curve side sway (radians). */
  neckSway: number;
  /** Flight flap angle (0 while grounded). */
  wingFlap: number;
}

const SCARED_FLAP_HZ = 6;
const STAND_EXTENSION = 0.3;

/** Compute the lava heron pose for one render frame. */
export function heronPose(
  mode: HeronMode,
  windupProgress: number,
  timeSec: number,
): HeronPose {
  if (mode === "windup") {
    const progress = Math.min(1, Math.max(0, windupProgress));
    // Crouch rises through the first half and releases as the lunge fires.
    const crouch = Math.sin(Math.PI * Math.min(1, progress * 1.25)) * 0.9;
    // Neck pulls in slightly, then shoots forward monotonically.
    const extension = 0.05 + 0.95 * Math.pow(progress, 1.6);
    return {
      neckExtension: extension,
      crouch,
      sway: 0,
      neckSway: 0,
      wingFlap: 0,
    };
  }

  if (mode === "scared") {
    return {
      neckExtension: 0.4,
      crouch: 0,
      sway: 0,
      neckSway: 0.15 * Math.sin(2 * Math.PI * SCARED_FLAP_HZ * timeSec),
      wingFlap: 0.85 * Math.sin(2 * Math.PI * SCARED_FLAP_HZ * timeSec),
    };
  }

  // stand: slow breathing sway with a folded neck.
  const breath = Math.sin(2 * Math.PI * 0.45 * timeSec);
  return {
    neckExtension: STAND_EXTENSION + 0.05 * breath,
    crouch: 0,
    sway: 0.03 * breath,
    neckSway: 0.1 * Math.sin(2 * Math.PI * 0.3 * timeSec + 1.1),
    wingFlap: 0,
  };
}
