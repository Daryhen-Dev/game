/**
 * Lava heron — cartoon model (predator view).
 *
 * Slate-grey body with an S-shaped neck built from two hinged segments plus
 * a head/bill/crest group, long yellow-orange legs and small wings. Standing
 * is a breathing sway; the windup crouches and then the neck shoots forward
 * monotonically (squash & stretch lunge); scared herons flap away.
 */
import * as THREE from "three";
import { mergeParts, withColor } from "./parts";
import { heronPose, type HeronMode } from "./heronPose";
import { headingFromVelocity } from "./heading";
import { simToWorldInto } from "../worldMap";
import { addOutline } from "../toon/outline";

import { type PredatorView, type PredatorViewOptions } from "./types";

const COLOR_BODY = 0x707a88;
const COLOR_DARK = 0x33363f;
const COLOR_LEGS = 0xf2ae43;

/** Rest pose of the two neck segments (folded S) and the extended lunge. */
const NECK_FOLDED_A = 0.85;
const NECK_FOLDED_B = -1.15;
const NECK_EXTENDED = -0.08;

/** Yaw turn-rate for smooth heading changes (1/s). */
const YAW_LERP_RATE = 10;

function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

function buildHeronBodyGeometry(): THREE.BufferGeometry {
  const bodyColor = new THREE.Color(COLOR_BODY);
  const parts: THREE.BufferGeometry[] = [];

  // Body: upright ellipsoid.
  const body = withColor(new THREE.SphereGeometry(0.15, 12, 9), bodyColor);
  body.scale(0.85, 1.2, 1.1);
  body.translate(0, 0.62, 0.02);
  parts.push(body);

  // Small folded wings hugging the flanks.
  for (const side of [-1, 1]) {
    const wing = withColor(new THREE.SphereGeometry(0.07, 8, 6), new THREE.Color(0x525a66));
    wing.scale(0.45, 1.1, 1.3);
    wing.translate(side * 0.115, 0.62, 0.03);
    parts.push(wing);
  }

  return mergeParts(parts, "heron body");
}

function buildHeronLegsGeometry(): THREE.BufferGeometry {
  const legColor = new THREE.Color(COLOR_LEGS);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = withColor(new THREE.CylinderGeometry(0.02, 0.018, 0.5, 6), legColor);
    leg.translate(side * 0.06, 0.25, 0);
    parts.push(leg);
    const foot = withColor(new THREE.SphereGeometry(0.035, 6, 5), legColor);
    foot.scale(1.6, 0.35, 1);
    foot.translate(side * 0.06, 0.01, -0.03);
    parts.push(foot);
  }
  return mergeParts(parts, "heron legs");
}

function buildHeronHeadGeometry(): THREE.BufferGeometry {
  const bodyColor = new THREE.Color(COLOR_BODY);
  const darkColor = new THREE.Color(COLOR_DARK);
  const parts: THREE.BufferGeometry[] = [];

  const head = withColor(new THREE.SphereGeometry(0.06, 8, 7), bodyColor);
  head.translate(0, 0, -0.02);
  parts.push(head);

  // Long dark bill.
  const bill = withColor(new THREE.ConeGeometry(0.024, 0.34, 6), darkColor);
  bill.rotateX(-Math.PI / 2 - 0.12);
  bill.translate(0, -0.01, -0.24);
  parts.push(bill);

  // Crest spike.
  const crest = withColor(new THREE.ConeGeometry(0.028, 0.14, 5), darkColor);
  crest.rotateX(0.5);
  crest.translate(0, 0.07, 0.03);
  parts.push(crest);

  // Beady eye dots.
  for (const side of [-1, 1]) {
    const eye = withColor(new THREE.SphereGeometry(0.014, 5, 4), new THREE.Color(0xf2efe6));
    eye.translate(side * 0.045, 0.02, -0.05);
    parts.push(eye);
  }

  return mergeParts(parts, "heron head");
}

/** One neck segment: a cylinder with its pivot at the bottom end. */
function buildNeckSegmentGeometry(): THREE.BufferGeometry {
  const segment = withColor(new THREE.CylinderGeometry(0.036, 0.042, 0.3, 7), new THREE.Color(COLOR_BODY));
  segment.translate(0, 0.15, 0);
  return segment;
}

/** Create one lava heron view (owned by the level renderer). */
export function createLavaHeron(options: PredatorViewOptions & { baseY: number }): PredatorView {
  const group = new THREE.Group();
  const bodyMat = options.factory.get({ vertexColors: true, emissive: 0x222836 });

  const bodyGeometry = buildHeronBodyGeometry();
  const legsGeometry = buildHeronLegsGeometry();
  const headGeometry = buildHeronHeadGeometry();
  const neckGeometry = buildNeckSegmentGeometry();

  const legs = new THREE.Mesh(legsGeometry, bodyMat);
  const body = new THREE.Mesh(bodyGeometry, bodyMat);

  const neckA = new THREE.Mesh(neckGeometry, bodyMat);
  const neckB = new THREE.Mesh(neckGeometry, bodyMat);
  const head = new THREE.Mesh(headGeometry, bodyMat);

  // Neck chain: A pivots at the body's front top; B pivots at A's top; head at B's top.
  neckA.position.set(0, 0.78, -0.06);
  neckB.position.set(0, 0.3, 0);
  head.position.set(0, 0.3, 0);
  neckA.add(neckB);
  neckB.add(head);
  group.scale.setScalar(1.5);

  for (const mesh of [legs, body, neckA, neckB, head]) {
    mesh.castShadow = true;
    addOutline(mesh, options.outlineMaterial, 1.06);
  }
  group.add(legs, body, neckA);
  // Outlines must not be double-added (addOutline children ride along).

  const ground = { x: 0, z: 0 };
  let yaw = -1.2; // start in profile (facing +X-ish) so the S-neck reads from the camera

  return {
    object3D: group,
    update(p, simTimeSec, dtSec, aimPx) {
      simToWorldInto(p.x, p.y, options.world, ground);

      // Scared herons fly home: climb with distance, land smoothly on the rock.
      let lift = 0;
      if (p.state === "scared") {
        const distHome = Math.hypot(p.x - p.home.x, p.y - p.home.y);
        lift = Math.min(1.7, distHome * 0.055);
      }

      // Facing: windup aims at the target point; scared faces retreat travel.
      if (p.state === "windup" && aimPx) {
        yaw = lerpAngle(yaw, headingFromVelocity(aimPx.x - p.x, aimPx.y - p.y), Math.min(1, YAW_LERP_RATE * dtSec));
      } else if (p.state === "scared") {
        yaw = lerpAngle(yaw, headingFromVelocity(p.home.x - p.x, p.home.y - p.y), Math.min(1, YAW_LERP_RATE * dtSec));
      }

      const mode: HeronMode =
        p.state === "windup" ? "windup" : p.state === "scared" ? "scared" : "stand";
      const progress =
        p.state === "windup" && p.tunables.kind === "lavaHeron"
          ? 1 - p.cooldown / p.tunables.windupSec
          : 0;
      const pose = heronPose(mode, progress, simTimeSec);

      group.position.set(ground.x, options.baseY + lift, ground.z);
      group.rotation.y = yaw;
      legs.scale.y = 1 - 0.3 * pose.crouch;
      body.position.y = -0.1 * pose.crouch;
      body.rotation.x = pose.sway;
      body.rotation.z = mode === "scared" ? pose.wingFlap * 0.15 : 0;

      // Neck: folded S -> extended lunge (monotonic extension), squash on strike.
      const extension = pose.neckExtension;
      neckA.rotation.x = NECK_FOLDED_A + (NECK_EXTENDED - NECK_FOLDED_A) * extension;
      neckB.rotation.x = NECK_FOLDED_B + (NECK_EXTENDED - NECK_FOLDED_B) * extension;
      head.rotation.x = 0.35 - 0.4 * extension;
      neckA.rotation.y = pose.neckSway;
      neckB.rotation.y = pose.neckSway * 0.5;
      // Squash & stretch: the neck thins as it shoots forward.
      const stretch = 1 + 0.35 * extension * (mode === "windup" ? 1 : 0);
      neckA.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      neckB.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    },
    dispose() {
      bodyGeometry.dispose();
      legsGeometry.dispose();
      headGeometry.dispose();
      neckGeometry.dispose();
      group.clear();
    },
  };
}
