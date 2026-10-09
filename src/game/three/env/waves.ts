/**
 * Pure ocean swell model shared by the sea shader (GLSL mirror in
 * `shaderChunks.ts`) and the unit tests. No Three.js, no DOM.
 *
 * The swell is a sum of gentle sine waves traveling toward the shore (+Z);
 * the amplitude is damped near the waterline so the swash stays calm while
 * the open sea keeps a visible moonlit motion.
 */

/** One sine wave component of the swell. */
export interface WaveDef {
  /** Normalized travel direction (x, z); waves travel toward +Z (the beach). */
  dirX: number;
  dirZ: number;
  /** Wave height amplitude in meters. */
  amplitudeM: number;
  /** Wavelength in meters (>= 6 m so the sea mesh resolves it). */
  wavelengthM: number;
  /** Period in seconds. */
  periodSec: number;
}

/** The 2-4 swell components; mirrored as constants in the ocean shader. */
export const OCEAN_WAVES: readonly WaveDef[] = [
  { dirX: 0.05, dirZ: 0.998, amplitudeM: 0.075, wavelengthM: 11, periodSec: 5.2 },
  { dirX: -0.38, dirZ: 0.925, amplitudeM: 0.045, wavelengthM: 7.5, periodSec: 3.9 },
  { dirX: 0.55, dirZ: 0.835, amplitudeM: 0.03, wavelengthM: 9.5, periodSec: 4.4 },
] as const;

/** Sum of all wave amplitudes (upper bound of the surface displacement). */
export const MAX_WAVE_AMPLITUDE_M = OCEAN_WAVES.reduce(
  (sum, wave) => sum + wave.amplitudeM,
  0,
);

/** Wave amplitude factor kept at the waterline (offshore reaches 1). */
export const SHORE_DAMP_MIN = 0.35;
/** Offshore distance (meters from the sea line) where the swell is undamped. */
export const SHORE_DAMP_RANGE_M = 8;

/**
 * Amplitude damping factor at ground Z: 1 offshore, easing to
 * `SHORE_DAMP_MIN` at the waterline (never amplifying onto the sand).
 */
export function shoreDamp(z: number, seaLineZ: number): number {
  const offshore = Math.min(1, Math.max(0, (seaLineZ - z) / SHORE_DAMP_RANGE_M));
  return SHORE_DAMP_MIN + (1 - SHORE_DAMP_MIN) * offshore;
}

/**
 * Surface height (meters) of the swell at world (x, z) and time. The phase
 * offsets match the GLSL mirror exactly so CPU tests describe the shader.
 */
export function waveHeight(
  x: number,
  z: number,
  timeSec: number,
  seaLineZ: number,
  waves: readonly WaveDef[] = OCEAN_WAVES,
): number {
  const damp = shoreDamp(z, seaLineZ);
  let height = 0;
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const k = (2 * Math.PI) / wave.wavelengthM;
    const omega = (2 * Math.PI) / wave.periodSec;
    const phase = i * 1.9;
    height +=
      wave.amplitudeM *
      Math.sin(k * (wave.dirX * x + wave.dirZ * z) - omega * timeSec + phase);
  }
  return damp * height;
}
