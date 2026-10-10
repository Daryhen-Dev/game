/**
 * Pure pose function for the green sea turtle hatchling (no Three.js).
 *
 * Maps the crawl state to joint angles and body motion:
 * - front flippers row in anti-phase (alternating strokes),
 * - body bobs vertically and rolls with the lateral wobble,
 * - a slight squash on each stroke keeps cartoon volume (~1 via volumeScaleXZ).
 */

export interface HatchlingPose {
  /** Left/right front-flipper stroke angle (radians, anti-phase). */
  flipperL: number;
  flipperR: number;
  /** Vertical body bob offset (meters). */
  bob: number;
  /** Lateral wobble body roll (radians). */
  roll: number;
  /** Vertical squash scale (~1 +/- 0.1); horizontal scale is volumeScaleXZ. */
  squash: number;
}

/** Max front-flipper stroke amplitude (radians). */
export const FLIPPER_MAX_STROKE = Math.PI / 3;

/**
 * Flipper stroke frequency (Hz) for a crawl speed in sim px/s: the faster the
 * hatchling races, the harder it paddles.
 */
export function strokeFrequency(speedPxPerSec: number): number {
  return 1.4 + speedPxPerSec * 0.09;
}

/** Stroke amplitude shrinks with speed so resting hatchlings paddle weakly. */
function strokeAmplitude(speedPxPerSec: number): number {
  return Math.min(1, 0.3 + speedPxPerSec / 45);
}

/**
 * Horizontal scale that keeps the squash-and-stretch volume constant:
 * squash * volumeScaleXZ(squash)^2 ≈ 1.
 */
export function volumeScaleXZ(squash: number): number {
  return 1 / Math.sqrt(squash);
}

/** Compute the hatchling pose for one render frame. */
export function hatchlingPose(
  speedPxPerSec: number,
  wobblePhase: number,
  timeSec: number,
): HatchlingPose {
  const omega = 2 * Math.PI * strokeFrequency(speedPxPerSec);
  const amplitude = strokeAmplitude(speedPxPerSec);
  const stroke = Math.sin(omega * timeSec + wobblePhase);

  // Front flippers row alternately; the body bobs at double the stroke rate
  // (one bob per full stroke pair) and rolls with the wobble.
  const angle = FLIPPER_MAX_STROKE * amplitude * stroke;
  return {
    flipperL: angle,
    flipperR: -angle,
    bob: 0.018 * amplitude * Math.sin(2 * omega * timeSec + wobblePhase),
    roll: 0.1 * amplitude * Math.sin(omega * timeSec + wobblePhase + Math.PI / 2),
    squash: 1 + 0.09 * amplitude * Math.sin(2 * omega * timeSec + wobblePhase),
  };
}
