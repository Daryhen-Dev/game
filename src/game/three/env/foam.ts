/**
 * Pure shoreline foam/swash model shared by the sea and sand shaders (GLSL
 * mirror in `shaderChunks.ts`) and the unit tests. No Three.js, no DOM.
 *
 * The water edge advances onto the beach and retreats ("olas que llegan a la
 * orilla") as a two-sine swash, plus a lateral wobble so the waterline is
 * wavy instead of a ruler-straight line. A bright foam band rides the edge
 * and 1-3 trailing foam lines drift behind it, seaward.
 */

/** Max swash advance/retreat from the sea line, in meters. */
export const SWASH_AMPLITUDE_M = 1.6;
/** Primary swash period in seconds. */
export const SWASH_PERIOD_SEC = 9;
/** Max sideways deviation of the waterline from a straight line, in meters. */
export const SWASH_LATERAL_WOBBLE_M = 0.75;

const SWASH_W1 = (2 * Math.PI) / SWASH_PERIOD_SEC;
const SWASH_W2 = (2 * Math.PI) / 5.7;

/** Gaussian bump: 1 at the center, ~0 beyond 3 sigma. */
function bump(distance: number, sigma: number): number {
  const q = distance / sigma;
  return Math.exp(-q * q);
}

/**
 * Current water edge ground Z at along-shore position x and time: the sea
 * line plus the swash offset plus the lateral wobble. Water covers up to
 * this Z (wet sand beyond it).
 */
export function waterEdgeZ(x: number, timeSec: number, seaLineZ: number): number {
  return (
    seaLineZ +
    SWASH_AMPLITUDE_M *
      (0.6 * Math.sin(SWASH_W1 * timeSec) + 0.4 * Math.sin(SWASH_W2 * timeSec + 1.3)) +
    SWASH_LATERAL_WOBBLE_M *
      (0.6 * Math.sin(0.55 * x + 0.35 * timeSec) +
        0.4 * Math.sin(1.3 * x - 0.22 * timeSec + 2.1))
  );
}

/**
 * Foam whiteness (0..1) at ground (z, x) and time: a bright band on the
 * moving water edge plus trailing foam lines drifting seaward. Mirrored in
 * GLSL.
 */
export function foamStrength(z: number, x: number, timeSec: number, seaLineZ: number): number {
  const edge = waterEdgeZ(x, timeSec, seaLineZ);

  // Bright swash edge band.
  let foam = 0.95 * bump(z - edge, 0.8);

  // Trailing foam lines, progressively fainter, drifting with the swash.
  for (let k = 1; k <= 3; k++) {
    const lineZ = edge - 2.2 * k + 0.6 * Math.sin(SWASH_W1 * timeSec + 1.9 * k);
    foam += (0.55 - 0.12 * k) * bump(z - lineZ, 0.4);
  }

  return Math.min(1, foam);
}
