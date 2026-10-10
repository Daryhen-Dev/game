/**
 * Ghost crab — cartoon model (predator view).
 *
 * Pale sand-yellow carapace, tall eye stalks with big black eyes (the
 * identifier), one oversized claw and two merged leg sets. Travels sideways:
 * the model's local +X points along the travel direction (headingFromVelocitySideX),
 * so the big claw leads the scuttle. Idle crabs hide in the burrow.
 */
import * as THREE from "three";
import { mergeParts, withColor } from "./parts";
import { crabPose } from "./crabPose";
import { headingFromVelocitySideX } from "./heading";
import { simToWorldInto } from "../worldMap";

import { addOutline } from "../toon/outline";

import { type PredatorView, type PredatorViewOptions } from "./types";

const COLOR_BODY = 0xd08a2e;
const COLOR_LIMB = 0x96601f;
const COLOR_EYE = 0x14161f;

/** Yaw turn-rate for smooth heading changes (1/s). */
const YAW_LERP_RATE = 12;

/** Shortest-arc angle interpolation. */
function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

/** Build the merged crab body (carapace + eye stalks + eyes + small claw). */
function buildCrabBodyGeometry(): THREE.BufferGeometry {
  const bodyColor = new THREE.Color(COLOR_BODY);
  const limbColor = new THREE.Color(COLOR_LIMB);
  const eyeColor = new THREE.Color(COLOR_EYE);
  const parts: THREE.BufferGeometry[] = [];

  // Carapace: wide along the sideways travel axis (+X).
  const carapace = withColor(new THREE.SphereGeometry(0.17, 12, 9), bodyColor);
  carapace.scale(1.2, 0.55, 0.95);
  carapace.translate(0, 0.15, 0);
  parts.push(carapace);

  // Tall eye stalks with big white-ringed black eyes (the identifier).
  for (const side of [-1, 1]) {
    const stalk = withColor(new THREE.CylinderGeometry(0.03, 0.038, 0.26, 6), limbColor);
    stalk.translate(side * 0.065, 0.33, -0.09);
    parts.push(stalk);
    const eyeWhite = withColor(new THREE.SphereGeometry(0.09, 8, 6), new THREE.Color(0xf2efe6));
    eyeWhite.translate(side * 0.065, 0.46, -0.09);
    parts.push(eyeWhite);
    const pupil = withColor(new THREE.SphereGeometry(0.048, 8, 6), eyeColor);
    pupil.translate(side * 0.078, 0.47, -0.093);
    parts.push(pupil);
  }

  // Small claw on the trailing side (-X).
  const smallArm = withColor(new THREE.SphereGeometry(0.045, 6, 5), limbColor);
  smallArm.scale(1.6, 0.8, 0.8);
  smallArm.translate(-0.19, 0.14, -0.03);
  parts.push(smallArm);
  const smallPincer = withColor(new THREE.ConeGeometry(0.035, 0.12, 5), bodyColor);
  smallPincer.rotateZ(Math.PI / 2);
  smallPincer.translate(-0.3, 0.14, -0.03);
  parts.push(smallPincer);

  return mergeParts(parts, "crab body");
}

/** Build one leg-set geometry (4 legs, extends +X from the body center). */
function buildCrabLegGeometry(): THREE.BufferGeometry {
  const limbColor = new THREE.Color(COLOR_LIMB);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const z = -0.12 + i * 0.08;
    const leg = withColor(new THREE.CylinderGeometry(0.02, 0.012, 0.2, 5), limbColor);
    leg.rotateZ(-1.05); // reach out (+X) and down
    leg.translate(0.17, 0.07, z);
    parts.push(leg);
    const tip = withColor(new THREE.SphereGeometry(0.022, 5, 4), limbColor);
    tip.translate(0.26, -0.01, z);
    parts.push(tip);
  }
  return mergeParts(parts, "crab legs");
}

/** Build the big claw geometry (pivot at the shoulder, extends +X). */
function buildCrabClawGeometry(): THREE.BufferGeometry {
  const limbColor = new THREE.Color(COLOR_LIMB);
  const bodyColor = new THREE.Color(COLOR_BODY);
  const parts: THREE.BufferGeometry[] = [];
  const arm = withColor(new THREE.SphereGeometry(0.05, 6, 5), limbColor);
  arm.scale(1.7, 0.9, 0.9);
  arm.translate(0.1, 0, 0);
  parts.push(arm);
  const upper = withColor(new THREE.ConeGeometry(0.05, 0.18, 6), bodyColor);
  upper.rotateZ(-Math.PI / 2);
  upper.translate(0.24, 0.02, 0);
  parts.push(upper);
  const lower = withColor(new THREE.ConeGeometry(0.038, 0.13, 6), bodyColor);
  lower.rotateZ(-Math.PI / 2);
  lower.rotateX(0.45);
  lower.translate(0.23, -0.03, 0);
  parts.push(lower);
  return mergeParts(parts, "crab claw");
}

/** Create one ghost crab view (owned by the level renderer). */
export function createGhostCrab(options: PredatorViewOptions): PredatorView {
  const group = new THREE.Group();
  const bodyMat = options.factory.get({ vertexColors: true, emissive: 0x1c1812 });

  const bodyGeometry = buildCrabBodyGeometry();
  const legGeometry = buildCrabLegGeometry();
  const clawGeometry = buildCrabClawGeometry();

  const body = new THREE.Mesh(bodyGeometry, bodyMat);
  const legsNear = new THREE.Mesh(legGeometry, bodyMat);
  const legsFar = new THREE.Mesh(legGeometry, bodyMat);
  legsFar.scale.x = -1; // mirrored far-side leg set
  const claw = new THREE.Mesh(clawGeometry, bodyMat);
  for (const mesh of [body, legsNear, legsFar, claw]) {
    mesh.castShadow = true;
    addOutline(mesh, options.outlineMaterial, mesh === body ? 1.05 : 1.09);
    group.add(mesh);
  }
  // The claw pivots at its shoulder so it can wave and raise.
  claw.position.set(0.14, 0.14, -0.03);
  group.scale.setScalar(1.5);

  // Scratch state (no THREE objects allocated per frame).
  const ground = { x: 0, z: 0 };
  let prevPx = NaN;
  let prevPz = NaN;
  let yaw = 0;
  let settled = false;

  return {
    object3D: group,
    update(p, simTimeSec, dtSec) {
      // Idle crabs hide inside the burrow.
      group.visible = p.state !== "idle";
      if (!group.visible) {
        prevPx = NaN;
        return;
      }

      simToWorldInto(p.x, p.y, options.world, ground);

      // Face the travel direction sideways (local +X along velocity).
      let speedPxPerSec = 0;
      if (!Number.isNaN(prevPx)) {
        const dx = p.x - prevPx;
        const dz = p.y - prevPz;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.02) {
          speedPxPerSec = dist / Math.max(dtSec, 1e-4);
          yaw = lerpAngle(yaw, headingFromVelocitySideX(dx, dz), Math.min(1, YAW_LERP_RATE * dtSec));
          settled = false;
        } else if (!settled) {
          settled = true;
        }
      }
      prevPx = p.x;
      prevPz = p.y;

      const scared = p.state === "scared";
      // Digesting crabs settle; hunting/scared crabs scuttle.
      const poseSpeed = p.state === "digesting" ? 0 : scared ? Math.max(speedPxPerSec, 26 * 1.6) : Math.max(speedPxPerSec, 26);
      const pose = crabPose(simTimeSec, poseSpeed, scared);

      group.position.set(ground.x, 0.02 + pose.hop, ground.z);
      group.rotation.y = yaw;

      body.rotation.z = pose.sway;
      legsNear.rotation.z = pose.legsL;
      legsFar.rotation.z = -pose.legsR; // mirrored set: same seesaw as the near legs
      claw.rotation.z = pose.claw * 0.55;
      claw.rotation.y = -pose.claw * 0.3;
    },
    dispose() {
      bodyGeometry.dispose();
      legGeometry.dispose();
      clawGeometry.dispose();
      group.clear();
    },
  };
}
