/**
 * Pure beach dune profile for the sand terrain, computed on the CPU at build
 * time (the sand mesh is static). No Three.js, no DOM.
 *
 * Hard constraint: the height is EXACTLY 0 inside the sim playfield rectangle
 * (x within +-halfWidth, sea line to the playfield bottom edge), so ground
 * picking on the y = 0 plane has zero error where gameplay happens. Dunes
 * rise away from the play lane, the ground rises gently behind the nest, and
 * the sand dips below the waterline offshore for a shallow shore profile.
 */

export interface DuneConfig {
  /** Ground Z of the sea line. */
  seaLineZ: number;
  /** Half width of the flat play lane in meters. */
  playfieldHalfWidthM: number;
  /** Ground Z of the playfield bottom edge (behind the nest). */
  playfieldFarZ: number;
}

/** Bounds asserted by tests: keep any future noise inside them. */
export const DUNE_MAX_HEIGHT_M = 2;
export const SHORE_DIP_MAX_M = 0.55;

/** Deterministic 2D value noise in ~[-0.5, 0.5] (hash-based, no state). */
function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const hash = (i: number, j: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s) - 0.5;
  };
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Sand height (meters) at ground (x, z). Exactly 0 inside the playfield. */
export function duneHeight(x: number, z: number, cfg: DuneConfig): number {
  const { seaLineZ, playfieldHalfWidthM, playfieldFarZ } = cfg;

  // Flat play lane: the whole sim rectangle keeps picking exact.
  if (Math.abs(x) <= playfieldHalfWidthM && z >= seaLineZ && z <= playfieldFarZ) {
    return 0;
  }

  // Shallow shore profile: dip below the waterline offshore of the sea line.
  // The smoothstep starts at the flat-lane boundary, so the dip (and its
  // slope) are exactly 0 where the playfield rectangle ends.
  const dip =
    -SHORE_DIP_MAX_M * smoothstep(seaLineZ - 0.8, seaLineZ - 3.5, z);

  // Side dunes: rise away from the play lane, shaped by value noise ridges.
  const side = smoothstep(playfieldHalfWidthM, playfieldHalfWidthM + 7, Math.abs(x));
  const sideDune =
    side * side * (1.1 + 0.55 * noise2(x * 0.35, z * 0.22)) +
    side * 0.25 * Math.sin(z * 0.9 + 2.5 * noise2(x * 0.15, z * 0.4));

  // Gentle rise behind the nest (the beach continues inland).
  const far = smoothstep(playfieldFarZ, playfieldFarZ + 10, z);
  const farRise = far * (0.9 + 0.4 * noise2(x * 0.3 + 40, z * 0.25));

  // Clamp to the documented bounds (keeps worst-case noise combinations sane).
  return Math.min(DUNE_MAX_HEIGHT_M, Math.max(-SHORE_DIP_MAX_M, dip + sideDune + farRise));
}
