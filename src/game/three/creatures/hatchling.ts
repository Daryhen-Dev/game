/**
 * Green sea turtle hatchling — cartoon model + instanced pool.
 *
 * The model is merged into ONE vertex-colored body geometry (domed shell with
 * lighter scutes, cream plastron edge, oversized head with big white eyes +
 * black pupils, tail, back flippers) plus ONE front-flipper geometry (pivot
 * at the shoulder; the right side uses a pre-mirrored clone). They render
 * through 6 InstancedMesh pools (body, both flipper sides and their
 * outlines), so any number of hatchlings costs 6 draw calls.
 *
 * Model space: forward = -Z (toward the sea), ground at y = 0, total length
 * ~0.55 m (cartoon-exaggerated vs the 9 px catch radius at 0.05 m/px).
 */
import * as THREE from "three";
import { mergeParts, mirrorGeometryX, withColor } from "./parts";
import { volumeScaleXZ } from "./hatchlingPose";
import { type ToonMaterialFactory } from "../toon/toonMaterials";

/* Cartoon palette (night-friendly, saturated). */
const COLOR_SHELL = 0x4e7a46;
const COLOR_SCUTE = 0x7aa558;
const COLOR_PLASTRON = 0xe9dcb8;
const COLOR_EYE_WHITE = 0xf7f5ec;
const COLOR_EYE_BLACK = 0x11131a;

/** One render-frame transform for a hatchling (all values precomputed). */
export interface HatchlingFrame {
  x: number;
  y: number;
  z: number;
  /** Yaw (radians; 0 = facing -Z, toward the sea). */
  heading: number;
  /** Body roll from the lateral wobble (radians). */
  roll: number;
  /** Vertical squash scale (~1); horizontal scale keeps volume constant. */
  squash: number;
  /** Front-flipper stroke angles (radians; "tip-up positive" per side). */
  flipperL: number;
  flipperR: number;
}

interface PoolSlots {
  idToSlot: Map<number, number>;
  freeSlots: number[];
}

/** Build the merged hatchling body geometry (ground at y = 0, forward -Z). */
export function buildHatchlingBodyGeometry(): THREE.BufferGeometry {
  const shellColor = new THREE.Color(COLOR_SHELL);
  const scuteColor = new THREE.Color(COLOR_SCUTE);
  const plastronColor = new THREE.Color(COLOR_PLASTRON);
  const eyeWhite = new THREE.Color(COLOR_EYE_WHITE);
  const eyeBlack = new THREE.Color(COLOR_EYE_BLACK);

  const parts: THREE.BufferGeometry[] = [];

  // Domed shell.
  const shell = withColor(new THREE.SphereGeometry(0.16, 14, 10), shellColor);
  shell.scale(1, 0.78, 1.15);
  shell.translate(0, 0.13, 0.01);
  parts.push(shell);

  // Lighter scute plates on top.
  const scuteOffsets: Array<[number, number, number]> = [
    [0, 0.245, -0.02],
    [-0.07, 0.225, 0.06],
    [0.07, 0.225, 0.06],
    [-0.05, 0.21, -0.1],
    [0.05, 0.21, -0.1],
  ];
  for (const [sx, sy, sz] of scuteOffsets) {
    const scute = withColor(new THREE.SphereGeometry(0.052, 8, 6), scuteColor);
    scute.scale(1, 0.45, 1.1);
    scute.translate(sx, sy, sz);
    parts.push(scute);
  }

  // Cream plastron rim peeking out under the shell.
  const plastron = withColor(new THREE.SphereGeometry(0.155, 14, 8), plastronColor);
  plastron.scale(1.02, 0.52, 1.16);
  plastron.translate(0, 0.1, 0.01);
  parts.push(plastron);

  // Oversized head with big eyes.
  const head = withColor(new THREE.SphereGeometry(0.095, 12, 9), scuteColor);
  head.translate(0, 0.13, -0.21);
  parts.push(head);
  for (const side of [-1, 1]) {
    const eye = withColor(new THREE.SphereGeometry(0.042, 8, 6), eyeWhite);
    eye.translate(side * 0.058, 0.165, -0.245);
    parts.push(eye);
    const pupil = withColor(new THREE.SphereGeometry(0.02, 6, 5), eyeBlack);
    pupil.translate(side * 0.05, 0.17, -0.283);
    parts.push(pupil);
  }

  // Stubby tail.
  const tail = withColor(new THREE.ConeGeometry(0.032, 0.11, 6), shellColor);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0.09, 0.24);
  parts.push(tail);

  // Rear flippers (small, merged — only the front pair strokes).
  for (const side of [-1, 1]) {
    const flipper = withColor(new THREE.SphereGeometry(0.05, 6, 5), shellColor);
    flipper.scale(1, 0.35, 1.9);
    flipper.rotateY(side * 0.7);
    flipper.translate(side * 0.12, 0.06, 0.17);
    parts.push(flipper);
  }

  return mergeParts(parts, "hatchling body");
}

/** Build the front-flipper geometry (pivot at the shoulder, extends +X). */
export function buildHatchlingFlipperGeometry(): THREE.BufferGeometry {
  const flipper = withColor(new THREE.SphereGeometry(0.075, 8, 6), new THREE.Color(COLOR_SCUTE));
  flipper.scale(2.2, 0.22, 0.85);
  flipper.translate(0.115, 0, 0);
  return flipper;
}

/** Ground Y of the hatchling origin (shell bottom sits just above the sand). */
export const HATCHLING_GROUND_Y = 0.02;

/**
 * Instanced hatchling pool: 4 draw calls total (body, flipper and their
 * outlines) regardless of how many hatchlings are alive. Slots are reused
 * via a free-list; released slots collapse to a zero-scale matrix.
 */
export class HatchlingPool {
  readonly group = new THREE.Group();

  private readonly capacity: number;
  private readonly body: THREE.InstancedMesh;
  private readonly bodyOutline: THREE.InstancedMesh;
  // Separate left/right flipper pools: the right side uses a PRE-MIRRORED
  // geometry (mirrorGeometryX) instead of a negative X instance scale —
  // InstancedMesh does not flip frontFace for negative-determinant instance
  // matrices, so a scaled-mirror instance renders inside-out (the outline
  // hull showed as a solid black flipper).
  private readonly flipperL: THREE.InstancedMesh;
  private readonly flipperR: THREE.InstancedMesh;
  private readonly flipperLOutline: THREE.InstancedMesh;
  private readonly flipperROutline: THREE.InstancedMesh;
  private readonly slots: PoolSlots = { idToSlot: new Map(), freeSlots: [] };

  // Scratch objects (no THREE objects allocated per frame; plain number
  // fields only).
  private readonly quatYaw = new THREE.Quaternion();
  private readonly quatPart = new THREE.Quaternion();
  private readonly quatBody = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(
    capacity: number,
    factory: ToonMaterialFactory,
    outlineMaterial: THREE.MeshBasicMaterial,
    bodyGeometry?: THREE.BufferGeometry,
    flipperGeometry?: THREE.BufferGeometry,
  ) {
    this.capacity = capacity;
    const bodyGeo = bodyGeometry ?? buildHatchlingBodyGeometry();
    const flipperGeoL = flipperGeometry ?? buildHatchlingFlipperGeometry();
    const flipperGeoR = mirrorGeometryX(flipperGeoL);
    const bodyMat = factory.get({ vertexColors: true, emissive: 0x0c140c });

    this.body = new THREE.InstancedMesh(bodyGeo, bodyMat, capacity);
    this.bodyOutline = new THREE.InstancedMesh(bodyGeo, outlineMaterial, capacity);
    this.flipperL = new THREE.InstancedMesh(flipperGeoL, bodyMat, capacity);
    this.flipperR = new THREE.InstancedMesh(flipperGeoR, bodyMat, capacity);
    this.flipperLOutline = new THREE.InstancedMesh(flipperGeoL, outlineMaterial, capacity);
    this.flipperROutline = new THREE.InstancedMesh(flipperGeoR, outlineMaterial, capacity);

    for (const mesh of [
      this.body,
      this.bodyOutline,
      this.flipperL,
      this.flipperR,
      this.flipperLOutline,
      this.flipperROutline,
    ]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.body.castShadow = true;
    this.flipperL.castShadow = true;
    this.flipperR.castShadow = true;
    this.body.receiveShadow = true;

    for (let i = capacity - 1; i >= 0; i--) this.slots.freeSlots.push(i);
    this.hideAll();
  }

  get activeCount(): number {
    return this.slots.idToSlot.size;
  }

  /** Reserve a slot for a hatchling id (reuses released slots). */
  acquire(id: number): void {
    if (this.slots.idToSlot.has(id)) return;
    const slot = this.slots.freeSlots.pop();
    if (slot === undefined) return; // pool exhausted: skip rendering this hatchling
    this.slots.idToSlot.set(id, slot);
  }

  /** Release a hatchling's slot (hides its instances). */
  release(id: number): void {
    const slot = this.slots.idToSlot.get(id);
    if (slot === undefined) return;
    this.slots.idToSlot.delete(id);
    this.slots.freeSlots.push(slot);
    this.hideSlot(slot);
  }

  has(id: number): boolean {
    return this.slots.idToSlot.has(id);
  }

  /** Write one hatchling's pose into its instance slots. */
  write(id: number, frame: HatchlingFrame): void {
    const slot = this.slots.idToSlot.get(id);
    if (slot === undefined) return;

    const volumeXZ = volumeScaleXZ(frame.squash);
    this.quatYaw.setFromAxisAngle(this.yAxis, frame.heading);
    this.quatPart.setFromAxisAngle(this.zAxis, frame.roll);
    this.quatYaw.multiply(this.quatPart);

    // Body: position + yaw/roll + squash (volume-preserving).
    this.position.set(frame.x, frame.y, frame.z);
    this.scale.set(volumeXZ, frame.squash, volumeXZ);
    this.matrix.compose(this.position, this.quatYaw, this.scale);
    this.body.setMatrixAt(slot, this.matrix);
    this.scale.multiplyScalar(1.05);
    this.matrix.compose(this.position, this.quatYaw, this.scale);
    this.bodyOutline.setMatrixAt(slot, this.matrix);

    // Front flippers: shoulders in body-local space, rotated by the body,
    // stroked about the local Z ("tip-up positive"). The right flipper uses
    // the pre-mirrored geometry; its stroke angle is negated so the motion
    // mirrors naturally (RotZ(-s) applied to the mirror of RotZ(s)·geo).
    for (let side = 0; side < 2; side++) {
      const stroke = side === 0 ? frame.flipperL : -frame.flipperR;
      this.quatPart.setFromAxisAngle(this.zAxis, stroke);
      this.quatBody.copy(this.quatYaw).multiply(this.quatPart);
      this.offset.set((side === 0 ? 1 : -1) * 0.15, 0.12, -0.08).applyQuaternion(this.quatYaw);
      this.position.set(frame.x + this.offset.x, frame.y + this.offset.y, frame.z + this.offset.z);
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.quatBody, this.scale);
      const flipper = side === 0 ? this.flipperL : this.flipperR;
      const outline = side === 0 ? this.flipperLOutline : this.flipperROutline;
      flipper.setMatrixAt(slot, this.matrix);
      this.scale.multiplyScalar(1.08);
      this.matrix.compose(this.position, this.quatBody, this.scale);
      outline.setMatrixAt(slot, this.matrix);
    }
  }

  /** Upload all instance matrices (call once per frame after writes). */
  commit(): void {
    this.body.instanceMatrix.needsUpdate = true;
    this.bodyOutline.instanceMatrix.needsUpdate = true;
    this.flipperL.instanceMatrix.needsUpdate = true;
    this.flipperR.instanceMatrix.needsUpdate = true;
    this.flipperLOutline.instanceMatrix.needsUpdate = true;
    this.flipperROutline.instanceMatrix.needsUpdate = true;
  }

  private hideSlot(slot: number): void {
    this.matrix.makeScale(0, 0, 0);
    this.body.setMatrixAt(slot, this.matrix);
    this.bodyOutline.setMatrixAt(slot, this.matrix);
    this.flipperL.setMatrixAt(slot, this.matrix);
    this.flipperR.setMatrixAt(slot, this.matrix);
    this.flipperLOutline.setMatrixAt(slot, this.matrix);
    this.flipperROutline.setMatrixAt(slot, this.matrix);
  }

  private hideAll(): void {
    for (let slot = 0; slot < this.capacity; slot++) this.hideSlot(slot);
    this.commit();
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.flipperL.geometry.dispose();
    this.flipperR.geometry.dispose();
    this.group.clear();
  }
}
