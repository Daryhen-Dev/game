/**
 * Frigatebird — cartoon model (predator view).
 *
 * Dark brown body with a faint blue rim emissive (never pure black at night),
 * long angular W-shaped wings, forked tail, hooked grey beak and the
 * oversized RED gular pouch (the identifier, own emissive material). Wings
 * flap/glide in a loop, tuck and pitch nose-down during the dive windup, and
 * flap hard while climbing away when scared.
 */
import * as THREE from "three";
import { mergeParts, withColor } from "./parts";
import { birdPose, type BirdMode } from "./birdPose";
import { headingFromVelocity } from "./heading";
import { simToWorldInto } from "../worldMap";

import { addOutline } from "../toon/outline";

import { type PredatorView, type PredatorViewOptions } from "./types";

const COLOR_BODY = 0x584538;
const COLOR_BEAK = 0x8d939e;
const COLOR_POUCH = 0xff3b28;

const BIRD_HOVER_M = 4;
const BIRD_WINDUP_DROP_M = 3.2;

/** Yaw turn-rate for smooth heading changes (1/s). */
const YAW_LERP_RATE = 10;

function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

/** Build the merged bird body (body + head + hooked beak + forked tail + eyes). */
function buildBirdBodyGeometry(): THREE.BufferGeometry {
  const bodyColor = new THREE.Color(COLOR_BODY);
  const beakColor = new THREE.Color(COLOR_BEAK);
  const eyeWhite = new THREE.Color(0xf2efe6);
  const eyeBlack = new THREE.Color(0x11131a);
  const parts: THREE.BufferGeometry[] = [];

  // Body: long, slim, slightly keeled.
  const body = withColor(new THREE.SphereGeometry(0.16, 12, 9), bodyColor);
  body.scale(0.8, 0.85, 1.7);
  body.translate(0, 0, 0.02);
  parts.push(body);

  // Head + hooked beak.
  const head = withColor(new THREE.SphereGeometry(0.095, 10, 8), bodyColor);
  head.translate(0, 0.1, -0.26);
  parts.push(head);
  const beak = withColor(new THREE.ConeGeometry(0.03, 0.18, 6), beakColor);
  beak.rotateX(-Math.PI / 2 - 0.5); // point forward and hooked down
  beak.translate(0, 0.085, -0.4);
  parts.push(beak);

  // Forked tail: two thin spikes spread apart.
  for (const side of [-1, 1]) {
    const tail = withColor(new THREE.ConeGeometry(0.035, 0.26, 5), bodyColor);
    tail.rotateX(Math.PI / 2 + 0.25);
    tail.rotateZ(side * 0.16);
    tail.translate(side * 0.055, 0.0, 0.32);
    parts.push(tail);
  }

  // Small beady eyes.
  for (const side of [-1, 1]) {
    const eye = withColor(new THREE.SphereGeometry(0.022, 6, 5), eyeWhite);
    eye.translate(side * 0.055, 0.14, -0.3);
    parts.push(eye);
    const pupil = withColor(new THREE.SphereGeometry(0.011, 5, 4), eyeBlack);
    pupil.translate(side * 0.05, 0.142, -0.318);
    parts.push(pupil);
  }

  return mergeParts(parts, "frigatebird body");
}

/** Build one wing geometry: two angled segments forming a W (pivot at shoulder). */
function buildBirdWingGeometry(): THREE.BufferGeometry {
  const bodyColor = new THREE.Color(COLOR_BODY);
  const parts: THREE.BufferGeometry[] = [];

  // Inner segment: long, flat, angled slightly up.
  const inner = withColor(new THREE.SphereGeometry(0.09, 8, 5), bodyColor);
  inner.scale(2.1, 0.28, 1.0);
  inner.rotateZ(0.12);
  inner.translate(0.19, 0.02, -0.02);
  parts.push(inner);

  // Outer segment: angled back and down (the W bend).
  const outer = withColor(new THREE.SphereGeometry(0.075, 8, 5), new THREE.Color(0x6a5747));
  outer.scale(1.9, 0.24, 0.8);
  outer.rotateZ(-0.28);
  outer.rotateY(0.55);
  outer.translate(0.5, -0.02, 0.1);
  parts.push(outer);

  return mergeParts(parts, "frigatebird wing");
}

/** Build the inflated red gular pouch (separate mesh: own emissive). */
function buildBirdPouchGeometry(): THREE.BufferGeometry {
  const pouch = withColor(new THREE.SphereGeometry(0.15, 12, 9), new THREE.Color(COLOR_POUCH));
  pouch.scale(0.95, 1.25, 0.9);
  pouch.translate(0, -0.07, -0.28);
  return pouch;
}

/** Create one frigatebird view (owned by the level renderer). */
export function createFrigatebird(options: PredatorViewOptions): PredatorView {
  const group = new THREE.Group();
  const bodyMat = options.factory.get({ vertexColors: true, emissive: 0x1c2129 });
  const pouchMat = options.factory.get({
    color: COLOR_POUCH,
    emissive: 0xc01808,
    emissiveIntensity: 1.3,
  });
  // Light blue-white outline: the dark shared outline vanishes against the
  // moon glitter; the bird needs a rim that reads on the bright sea.
  const birdOutline = new THREE.MeshBasicMaterial({ color: 0xd9e6f4, side: THREE.BackSide });

  const bodyGeometry = buildBirdBodyGeometry();
  const wingGeometry = buildBirdWingGeometry();
  const pouchGeometry = buildBirdPouchGeometry();

  const body = new THREE.Mesh(bodyGeometry, bodyMat);
  const pouch = new THREE.Mesh(pouchGeometry, pouchMat);
  const wingL = new THREE.Mesh(wingGeometry, bodyMat);
  const wingR = new THREE.Mesh(wingGeometry, bodyMat);
  wingR.scale.x = -1; // mirrored right wing
  for (const mesh of [body, pouch, wingL, wingR]) {
    mesh.castShadow = true;
    addOutline(mesh, birdOutline, 1.07);
    group.add(mesh);
  }
  // Wings pivot at the shoulders.
  wingL.position.set(0.05, 0.06, -0.02);
  wingR.position.set(-0.05, 0.06, -0.02);
  group.scale.setScalar(1.7);

  const ground = { x: 0, z: 0 };
  let prevPx = NaN;
  let prevPz = NaN;
  let yaw = 0;

  return {
    object3D: group,
    update(p, simTimeSec, dtSec) {
      simToWorldInto(p.x, p.y, options.world, ground);

      // Altitude: hover, descend through the windup, climb while scared.
      let hover = BIRD_HOVER_M;
      if (p.state === "windup" && p.tunables.kind === "frigatebird") {
        const progress = Math.min(1, Math.max(0, 1 - p.cooldown / p.tunables.windupSec));
        hover = BIRD_HOVER_M - BIRD_WINDUP_DROP_M * progress;
      } else if (p.state === "scared") {
        hover = BIRD_HOVER_M + 1.2;
      }

      // Facing: keep last yaw; track travel when moving; aim at the locked
      // dive point during the windup.
      if (p.state === "windup") {
        yaw = lerpAngle(yaw, headingFromVelocity(p.lockX - p.x, p.lockY - p.y), Math.min(1, YAW_LERP_RATE * dtSec));
      } else if (!Number.isNaN(prevPx)) {
        const dx = p.x - prevPx;
        const dz = p.y - prevPz;
        if (Math.hypot(dx, dz) > 0.02) {
          yaw = lerpAngle(yaw, headingFromVelocity(dx, dz), Math.min(1, YAW_LERP_RATE * dtSec));
        }
      }
      prevPx = p.x;
      prevPz = p.y;

      const mode: BirdMode =
        p.state === "windup" ? "windup" : p.state === "scared" ? "scared" : "fly";
      const progress =
        p.state === "windup" && p.tunables.kind === "frigatebird"
          ? 1 - p.cooldown / p.tunables.windupSec
          : 0;
      const pose = birdPose(mode, progress, simTimeSec);

      group.position.set(ground.x, hover, ground.z);
      group.rotation.set(-pose.pitch, yaw, pose.bank, "YXZ");

      // Wings: flap about Z ("tip-up positive"), sweep back while tucking.
      wingL.rotation.set(0, -pose.tuck * 1.05, pose.wingL);
      wingR.rotation.set(0, pose.tuck * 1.05, -pose.wingR);
    },
    dispose() {
      bodyGeometry.dispose();
      wingGeometry.dispose();
      pouchGeometry.dispose();
      birdOutline.dispose();
      group.clear();
    },
  };
}
