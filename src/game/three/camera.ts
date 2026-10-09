/**
 * Pure camera rig for the 3/4 beach view. No Three.js, no DOM.
 *
 * The camera sits behind the nest (+Z), elevated, looking toward the sea
 * (-Z), leveled (no sideways yaw). `cameraRig` fits the whole playfield
 * (sim sea line to bottom edge, x 0..width) inside NDC [-1, 1] with a
 * HUD-safe margin for portrait aspects (0.45-0.75) and landscape:
 *
 * - The rig distance is solved against the *narrowest* supported aspect
 *   (`ASPECT_MIN`), so wider aspects only ever gain horizontal headroom and
 *   their (smaller) fov is then derived from the actual aspect.
 * - Aspects narrower than `ASPECT_MIN` widen the camera distance instead of
 *   pushing the fov past its playable maximum.
 * - `FIT_MARGIN` shrinks the used frustum so the playfield never touches the
 *   screen edges (leaves room for the HUD and rounded corners).
 */
import type { Vec3 } from "./picking";
import { SCALE_M_PER_PX, seaLineZ, type WorldMapConfig } from "./worldMap";

/** Downward pitch of the 3/4 view, in degrees from horizontal. */
export const PITCH_DEG = 55;
/** Narrowest supported aspect; narrower views widen the distance instead. */
export const ASPECT_MIN = 0.45;
/** Fraction of the half-frustum the playfield may occupy (HUD-safe margin). */
export const FIT_MARGIN = 0.96;
export const MIN_FOV_DEG = 35;
export const MAX_FOV_DEG = 68;
/** Floor for the solved camera distance (meters). */
const MIN_DISTANCE_M = 15;

const DEG2RAD = Math.PI / 180;

/** Camera placement: position, look-at target and vertical fov (degrees). */
export interface CameraRig {
  position: Vec3;
  target: Vec3;
  fov: number;
}

interface Basis {
  fwd: Vec3;
  right: Vec3;
  up: Vec3;
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

function playfieldCorners(cfg: WorldMapConfig): Vec3[] {
  const halfWidth = (cfg.width / 2) * SCALE_M_PER_PX;
  const zMin = seaLineZ(cfg);
  const zMax = (cfg.height - cfg.height / 2) * SCALE_M_PER_PX;
  return [
    { x: -halfWidth, y: 0, z: zMin },
    { x: halfWidth, y: 0, z: zMin },
    { x: -halfWidth, y: 0, z: zMax },
    { x: halfWidth, y: 0, z: zMax },
  ];
}

/**
 * Build the rig for a container aspect (width / height) and sim world config.
 * Deterministic: the same aspect and config always produce the same camera.
 */
export function cameraRig(aspect: number, cfg: WorldMapConfig): CameraRig {
  const pitch = PITCH_DEG * DEG2RAD;
  const zMin = seaLineZ(cfg);
  const zMax = (cfg.height - cfg.height / 2) * SCALE_M_PER_PX;
  const target: Vec3 = { x: 0, y: 0, z: (zMin + zMax) / 2 };

  // Fixed viewing direction: from the target toward the camera (behind the
  // nest, elevated), leveled. Basis is analytic, so lateral offsets of the
  // playfield corners are independent of the camera distance.
  const back: Vec3 = { x: 0, y: Math.sin(pitch), z: Math.cos(pitch) };
  const basis: Basis = {
    fwd: { x: -back.x, y: -back.y, z: -back.z },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: Math.cos(pitch), z: -Math.sin(pitch) },
  };

  // Solve the distance D: every corner must satisfy
  //   max(|lateralY|, |lateralX| / bindingAspect) / (base + D) <= limitTan
  // where base is the corner's view-space depth at D = 0 and limitTan is the
  // half-frustum tangent allowed by the max fov and the fit margin.
  const limitTan = Math.tan((MAX_FOV_DEG / 2) * DEG2RAD) * FIT_MARGIN;
  const bindingAspect = Math.min(Math.max(aspect, 0.2), ASPECT_MIN);
  let distance = MIN_DISTANCE_M;
  for (const corner of playfieldCorners(cfg)) {
    const v: Vec3 = {
      x: corner.x - target.x,
      y: corner.y - target.y,
      z: corner.z - target.z,
    };
    const base = dot(v, basis.fwd);
    const lateralY = Math.abs(dot(v, basis.up));
    const lateralX = Math.abs(dot(v, basis.right)) / bindingAspect;
    distance = Math.max(distance, Math.max(lateralY, lateralX) / limitTan - base);
  }

  const position: Vec3 = {
    x: target.x + back.x * distance,
    y: target.y + back.y * distance,
    z: target.z + back.z * distance,
  };

  // fov for the actual aspect: widest angular requirement of the corners,
  // divided by the fit margin so the playfield lands at <= FIT_MARGIN NDC.
  let maxTan = 0;
  for (const corner of playfieldCorners(cfg)) {
    const v: Vec3 = {
      x: corner.x - position.x,
      y: corner.y - position.y,
      z: corner.z - position.z,
    };
    const depth = dot(v, basis.fwd);
    maxTan = Math.max(
      maxTan,
      Math.abs(dot(v, basis.up)) / depth,
      Math.abs(dot(v, basis.right)) / (depth * aspect),
    );
  }
  const fovDeg = (2 * Math.atan(maxTan / FIT_MARGIN)) / DEG2RAD;
  const fov = Math.min(Math.max(fovDeg, MIN_FOV_DEG), MAX_FOV_DEG);

  return { position, target, fov };
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
