/**
 * GLSL chunks that mirror the pure env helpers exactly:
 * - `WAVE_GLSL` mirrors `waves.ts` (same constants, same phase offsets).
 * - `FOAM_GLSL` mirrors `foam.ts` (water edge swash + foam bands).
 * - `NOISE_GLSL` is a small value-noise used only for shading detail.
 *
 * These are glue (verified visually); the behavior contract lives in the
 * unit tests of the corresponding pure modules.
 */

export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export const WAVE_GLSL = /* glsl */ `
// Mirrors OCEAN_WAVES in waves.ts: amplitudes, 2*pi/wavelength, 2*pi/period,
// directions and phase offsets (i * 1.9).
const vec4 WAVE_A  = vec4(0.075, 0.045, 0.03, 0.0);
const vec4 WAVE_K  = vec4(0.57119866, 0.83775804, 0.66138894, 0.0);
const vec4 WAVE_W  = vec4(1.20830238, 1.61168719, 1.42799667, 0.0);
const vec4 WAVE_DX = vec4(0.05, -0.38, 0.55, 0.0);
const vec4 WAVE_DZ = vec4(0.998, 0.925, 0.835, 0.0);
const vec3 WAVE_PH = vec3(0.0, 1.9, 3.8);

// Mirrors shoreDamp: 1 offshore, 0.35 at the waterline.
float shoreDamp(float z, float seaLineZ) {
  float offshore = clamp((seaLineZ - z) / 8.0, 0.0, 1.0);
  return 0.35 + 0.65 * offshore;
}

// Wave number dot product: k * (dir . p).
float kDot(vec2 p, int i) {
  return WAVE_K[i] * (WAVE_DX[i] * p.x + WAVE_DZ[i] * p.y);
}

// Mirrors waveHeight. Returns (height, dH/dx, dH/dz) in meters.
vec3 waveHeightDx(vec2 p, float t, float seaLineZ) {
  float damp = shoreDamp(p.y, seaLineZ);
  float h = 0.0;
  float dx = 0.0;
  float dz = 0.0;
  for (int i = 0; i < 3; i++) {
    float phase = kDot(p, i) - WAVE_W[i] * t + WAVE_PH[i];
    float s = sin(phase);
    float c = cos(phase);
    h += WAVE_A[i] * s;
    dx += WAVE_A[i] * WAVE_K[i] * WAVE_DX[i] * c;
    dz += WAVE_A[i] * WAVE_K[i] * WAVE_DZ[i] * c;
  }
  return damp * vec3(h, dx, dz);
}
`;

export const FOAM_GLSL = /* glsl */ `
// Mirrors waterEdgeZ: two-sine swash (advance/retreat) + lateral wobble so the
// waterline is wavy, not ruler-straight.
float waterEdgeZ(float x, float t, float seaLineZ) {
  return seaLineZ
    + 1.6 * (0.6 * sin(0.69813170 * t) + 0.4 * sin(1.10165754 * t + 1.3))
    + 0.75 * (0.6 * sin(0.55 * x + 0.35 * t) + 0.4 * sin(1.3 * x - 0.22 * t + 2.1));
}
float foamBump(float d, float sigma) {
  float q = d / sigma;
  return exp(-q * q);
}
// Mirrors foamStrength: bright swash edge band + 3 trailing foam lines.
float foamStrength(float z, float x, float t, float seaLineZ) {
  float edge = waterEdgeZ(x, t, seaLineZ);
  float foam = 0.95 * foamBump(z - edge, 0.8);
  for (int k = 1; k <= 3; k++) {
    float lineZ = edge - 2.2 * float(k) + 0.6 * sin(0.69813170 * t + 1.9 * float(k));
    foam += (0.55 - 0.12 * float(k)) * foamBump(z - lineZ, 0.4);
  }
  return min(1.0, foam);
}
`;
