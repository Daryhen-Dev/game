/**
 * Pure camera rig for the night 3/4 beach view. No Three.js, no DOM.
 *
 * The camera sits behind the nest (+Z), elevated, looking toward the sea
 * (-Z), leveled (no sideways yaw). Instead of fitting the whole sim square
 * (which pushed the sea and the horizon off screen in V1), the rig is solved
 * against three framing targets projected in NDC:
 *
 * - the nest center lands near the bottom of the screen (`NEST_NDC_Y`),
 * - the sea line lands in the top third (`SEA_LINE_NDC_Y`), so the sea band
 *   covers ~25-35% of a portrait screen,
 * - the horizon stays on screen with sky above it (`HORIZON_NDC_Y`).
 *
 * For a vertical half-frustum tangent T = tan(fov / 2) these three targets
 * fix the pitch, the height and the distance analytically (the vertical
 * framing is exact for every aspect); the aspect only decides the smallest
 * fov whose horizontal frustum still fits the sea-line width (18 m) and the
 * hatchling spawn spread at the nest. Ultra-narrow aspects therefore raise
 * the fov instead of breaking the framing.
 *
 * Framing trade-off (documented): the bottom sim edge (empty sand ~4 m behind
 * the nest) may crop below the screen — no gameplay happens there; the nest
 * keeps a >= 1 m margin above the screen bottom.
 */
import type { Vec3 } from "./picking";
import { SCALE_M_PER_PX, seaLineZ, type WorldMapConfig } from "./worldMap";

/** World config needed by the rig: the mapping subset plus the full nest. */
export type CameraWorldConfig = WorldMapConfig & {
  nest: { x: number; y: number; spreadX: number };
};

/** Target NDC y of the nest center (~87.5% screen height from the top). */
export const NEST_NDC_Y = -0.75;
/** Target NDC y of the sea line (sea band = 25-35% of the screen from the top). */
export const SEA_LINE_NDC_Y = 0.35;
/** Target NDC y of the horizon (sky above, sea below). */
export const HORIZON_NDC_Y = 0.85;
/** Half-frustum NDC limit used by the horizontal fit checks. */
export const NDC_MARGIN = 0.97;
/** Half width that must stay visible at the nest row (spawn spread +-1.5 m + margin). */
export const NEST_VISIBLE_HALF_WIDTH_M = 2;
/** Half width of the playfield (18 m) that must fit at the sea line. */
export const PLAYFIELD_HALF_WIDTH_M = 9;
/** Fov search range (degrees). Wider aspects settle at the minimum. */
export const MIN_FOV_DEG = 68;
export const MAX_FOV_DEG = 85;
const FOV_STEP_DEG = 0.25;

const DEG2RAD = Math.PI / 180;

/** Camera placement: position, look-at target (on the ground) and vertical fov (degrees). */
export interface CameraRig {
  position: Vec3;
  target: Vec3;
  fov: number;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

interface Framing {
  position: Vec3;
  target: Vec3;
  tanHalfFov: number;
}

/**
 * Solve position/target for a vertical half-frustum tangent `tanHalfFov`.
 * The three NDC targets fix the geometry: pitch from the horizon target,
 * then the camera height/distance from the sea-line and nest targets.
 */
function framingForTanHalf(tanHalfFov: number, cfg: CameraWorldConfig): Framing {
  const nestZ = (cfg.nest.y - cfg.height / 2) * SCALE_M_PER_PX;
  const seaZ = seaLineZ(cfg);
  const spanM = nestZ - seaZ;

  const pitchRad = Math.atan(HORIZON_NDC_Y * tanHalfFov);
  const tanToNest = Math.tan(pitchRad + Math.atan(-NEST_NDC_Y * tanHalfFov));
  const tanToSea = Math.tan(pitchRad - Math.atan(SEA_LINE_NDC_Y * tanHalfFov));

  // Height/distance from tan(depression to nest) and tan(depression to sea line):
  //   H = tanToNest * (nestZ - cameraZ) = tanToSea * (seaZ... solved in closed form.
  const height = (spanM * tanToSea) / (1 - tanToSea / tanToNest);
  const cameraZ = nestZ + height / tanToNest;

  const position: Vec3 = { x: 0, y: height, z: cameraZ };
  // Look-at target: where the view center ray meets the ground.
  const target: Vec3 = { x: 0, y: 0, z: cameraZ - height / Math.tan(pitchRad) };
  return { position, target, tanHalfFov };
}

/** Largest horizontal NDC demand of the fit guarantees for this aspect. */
function horizontalNdcDemand(framing: Framing, aspect: number, cfg: CameraWorldConfig): number {
  const nestZ = (cfg.nest.y - cfg.height / 2) * SCALE_M_PER_PX;
  const seaZ = seaLineZ(cfg);
  const pitchRad = Math.asin(
    framing.position.y /
      Math.hypot(framing.position.y, framing.position.z - framing.target.z),
  );
  const sin = Math.sin(pitchRad);
  const cos = Math.cos(pitchRad);
  const depthAt = (z: number): number =>
    framing.position.y * sin + (framing.position.z - z) * cos;
  const tanHalfFov = framing.tanHalfFov;
  const seaDemand =
    PLAYFIELD_HALF_WIDTH_M / (depthAt(seaZ) * tanHalfFov * aspect);
  const nestDemand =
    NEST_VISIBLE_HALF_WIDTH_M / (depthAt(nestZ) * tanHalfFov * aspect);
  return Math.max(seaDemand, nestDemand);
}

/**
 * Build the rig for a container aspect (width / height) and sim world config.
 * Deterministic: the same aspect and config always produce the same camera.
 */
export function cameraRig(aspect: number, cfg: CameraWorldConfig): CameraRig {
  // Vertical framing is exact for any tanHalfFov; the aspect only picks the
  // smallest fov whose horizontal frustum satisfies the fit guarantees.
  let chosen = framingForTanHalf(Math.tan((MAX_FOV_DEG / 2) * DEG2RAD), cfg);
  for (let fov = MIN_FOV_DEG; fov <= MAX_FOV_DEG + 1e-9; fov += FOV_STEP_DEG) {
    const candidate = framingForTanHalf(Math.tan((fov / 2) * DEG2RAD), cfg);
    chosen = candidate;
    if (horizontalNdcDemand(candidate, aspect, cfg) <= NDC_MARGIN) break;
  }

  const fovDeg =
    (2 * Math.atan(chosen.tanHalfFov)) / DEG2RAD;
  return { position: chosen.position, target: chosen.target, fov: fovDeg };
}

/**
 * NDC y of the horizon (the level direction toward -Z), derived from the rig.
 * Pure test helper: the horizon must stay on screen with sky above the sea.
 */
export function horizonNdcY(rig: CameraRig): number {
  const fwd = normalize({
    x: rig.target.x - rig.position.x,
    y: rig.target.y - rig.position.y,
    z: rig.target.z - rig.position.z,
  });
  const right = normalize(cross(fwd, { x: 0, y: 1, z: 0 }));
  const up = cross(right, fwd);
  // Level direction toward the horizon = horizontal part of the view direction.
  const towardHorizon = normalize({ x: 0, y: 0, z: fwd.z });
  const depth = dot(towardHorizon, fwd);
  const tanHalf = Math.tan((rig.fov / 2) * DEG2RAD);
  return dot(towardHorizon, up) / (depth * tanHalf);
}

/**
 * Project a world point to NDC [-1, 1] with a simple pinhole camera matching
 * three.js conventions (vertical fov, perspective divide). Pure test helper.
 */
export function projectPoint(
  rig: CameraRig,
  aspect: number,
  point: Vec3,
): { x: number; y: number } {
  const fwd = normalize({ x: rig.target.x - rig.position.x, y: rig.target.y - rig.position.y, z: rig.target.z - rig.position.z });
  const right = normalize(cross(fwd, { x: 0, y: 1, z: 0 }));
  const up = cross(right, fwd);
  const v: Vec3 = { x: point.x - rig.position.x, y: point.y - rig.position.y, z: point.z - rig.position.z };
  const depth = dot(v, fwd);
  const tanHalf = Math.tan((rig.fov / 2) * DEG2RAD);
  return {
    x: dot(v, right) / (depth * tanHalf * aspect),
    y: dot(v, up) / (depth * tanHalf),
  };
}
