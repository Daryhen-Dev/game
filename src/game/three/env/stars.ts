/**
 * Pure star field placement for the night sky. No Three.js, no DOM.
 *
 * Stars are deterministic unit direction vectors (seeded via the sim's
 * mulberry32 RNG) spread over the sky above the horizon; the renderer scales
 * them onto the sky dome radius.
 */

import { createRng } from "../../sim/rng";

/** Minimum normalized height above the horizon for any star. */
export const STAR_MIN_Y = 0.04;

/** One star: a unit direction vector on the sky dome. */
export interface StarDirection {
  x: number;
  y: number;
  z: number;
}

/**
 * Place `count` stars deterministically: elevation biased toward the upper
 * sky, azimuth uniform around the horizon.
 */
export function starDirections(seed: number, count: number): StarDirection[] {
  const rng = createRng(seed);
  const stars: StarDirection[] = [];
  for (let i = 0; i < count; i++) {
    // sqrt bias spreads stars evenly over elevation bands.
    const y = STAR_MIN_Y + (1 - STAR_MIN_Y) * Math.sqrt(rng.next());
    const azimuth = rng.next() * 2 * Math.PI;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    stars.push({
      x: Math.cos(azimuth) * radius,
      y,
      z: Math.sin(azimuth) * radius,
    });
  }
  return stars;
}
