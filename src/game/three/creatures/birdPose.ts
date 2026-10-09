/**
 * Pure pose function for the frigatebird (no Three.js).
 *
 * Modes map 1:1 to sim predator states:
 * - "fly" (idle/digesting): slow flap-glide loop with a gentle bank,
 * - "windup": wings tuck in monotonically and the body pitches nose-down,
 * - "scared": fast, hard flapping while climbing away.
 */

export type BirdMode = "fly" | "windup" | "scared";

export interface BirdPose {
  /** Wing flap angle (radians, mirrored left/right). */
  wingL: number;
  wingR: number;
  /** 0 = wings spread, 1 = fully tucked for the dive. */
  tuck: number;
  /** Body pitch (radians; positive = nose-down dive). */
  pitch: number;
  /** Bank roll (radians). */
  bank: number;
}

const FLY_FLAP_HZ = 1.7;
const SCARED_FLAP_HZ = 4.2;
const FLY_AMPLITUDE = 0.55;
const SCARED_AMPLITUDE = 0.9;
const MAX_TUCK_ANGLE = 1.15;

/** Flap frequency (Hz) per mode. */
export function flapFrequency(mode: BirdMode): number {
  return mode === "scared" ? SCARED_FLAP_HZ : FLY_FLAP_HZ;
}

/** Compute the frigatebird pose for one render frame. */
export function birdPose(
  mode: BirdMode,
  windupProgress: number,
  timeSec: number,
): BirdPose {
  if (mode === "windup") {
    const progress = Math.min(1, Math.max(0, windupProgress));
    // The tuck ramps monotonically; flap amplitude shrinks as wings fold.
    const tuck = progress * progress * (3 - 2 * progress); // smoothstep
    const flap = FLY_AMPLITUDE * (1 - tuck) * Math.sin(2 * Math.PI * FLY_FLAP_HZ * timeSec);
    return {
      wingL: MAX_TUCK_ANGLE * tuck + flap,
      wingR: -(MAX_TUCK_ANGLE * tuck + flap),
      tuck,
      pitch: 0.75 * progress,
      bank: 0,
    };
  }

  if (mode === "scared") {
    const flap = SCARED_AMPLITUDE * Math.sin(2 * Math.PI * SCARED_FLAP_HZ * timeSec);
    return {
      wingL: flap,
      wingR: -flap,
      tuck: 0,
      pitch: -0.25,
      bank: 0.2 * Math.sin(2 * Math.PI * 0.8 * timeSec),
    };
  }

  // fly: flap-glide loop. The glide envelope and bank run at a quarter of
  // the flap rate, so the wing angle is periodic over a 4-stroke glide cycle.
  const glideHz = FLY_FLAP_HZ / 4;
  const envelope = 0.65 + 0.35 * Math.sin(2 * Math.PI * glideHz * timeSec);
  const flap = FLY_AMPLITUDE * envelope * Math.sin(2 * Math.PI * FLY_FLAP_HZ * timeSec);
  return {
    wingL: flap,
    wingR: -flap,
    tuck: 0,
    pitch: -0.04,
    bank: 0.22 * Math.sin(2 * Math.PI * glideHz * timeSec + Math.PI / 2),
  };
}
