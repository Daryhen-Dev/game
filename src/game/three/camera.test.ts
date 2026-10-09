import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../sim";
import {
  MAX_FOV_DEG,
  MIN_FOV_DEG,
  cameraRig,
  horizonNdcY,
  projectPoint,
  type CameraWorldConfig,
} from "./camera";
import { seaLineZ, simToWorld } from "./worldMap";

const world: CameraWorldConfig = LEVEL_1.world;

/** Ground point (meters) for a sim pixel pair. */
function ground(x: number, y: number): { x: number; z: number } {
  const p = simToWorld(x, y, world);
  return { x: p.x, z: p.z };
}

const nestCenter = ground(world.nest.x, world.nest.y);
const seaZ = seaLineZ(world);

const ASPECTS: Array<[string, number]> = [
  ["narrowest portrait 0.45", 0.45],
  ["portrait 9:19.5", 9 / 19.5],
  ["portrait 9:16", 9 / 16],
  ["landscape 16:9", 16 / 9],
];

describe.each(ASPECTS)("cameraRig night framing (%s)", (_name, aspect) => {
  it("places the nest center near the bottom of the screen (85-90% height)", () => {
    const rig = cameraRig(aspect, world);
    const ndc = projectPoint(rig, aspect, { x: nestCenter.x, y: 0, z: nestCenter.z });
    expect(ndc.y).toBeGreaterThanOrEqual(-0.85);
    expect(ndc.y).toBeLessThanOrEqual(-0.65);
  });

  it("places the sea line so the sea band covers 25-35% of the screen from the top", () => {
    const rig = cameraRig(aspect, world);
    const ndc = projectPoint(rig, aspect, { x: 0, y: 0, z: seaZ });
    expect(ndc.y).toBeGreaterThanOrEqual(0.2);
    expect(ndc.y).toBeLessThanOrEqual(0.55);
    const fractionFromTop = (1 - ndc.y) / 2;
    expect(fractionFromTop).toBeGreaterThanOrEqual(0.25);
    expect(fractionFromTop).toBeLessThanOrEqual(0.35);
  });

  it("keeps the horizon on screen with sky above the sea", () => {
    const rig = cameraRig(aspect, world);
    const horizon = horizonNdcY(rig);
    const seaNdc = projectPoint(rig, aspect, { x: 0, y: 0, z: seaZ }).y;
    expect(horizon).toBeLessThan(1);
    expect(horizon).toBeGreaterThan(seaNdc + 0.1);
  });

  it("fits the sea-line corners and the hatchling spawn spread inside NDC", () => {
    const rig = cameraRig(aspect, world);
    for (const [sx, sy] of [
      [0, world.seaLineY],
      [world.width, world.seaLineY],
    ] as const) {
      const p = ground(sx, sy);
      const ndc = projectPoint(rig, aspect, { x: p.x, y: 0, z: p.z });
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.97);
      expect(ndc.y).toBeGreaterThanOrEqual(0.2);
      expect(ndc.y).toBeLessThanOrEqual(0.55);
    }
    // Hatchlings spawn within nest.x +- spreadX / 2 and must stay on screen.
    for (const dx of [-world.nest.spreadX / 2, world.nest.spreadX / 2]) {
      const p = ground(world.nest.x + dx, world.nest.y);
      const ndc = projectPoint(rig, aspect, { x: p.x, y: 0, z: p.z });
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.97);
    }
  });

  it("keeps the fov in the playable range", () => {
    const rig = cameraRig(aspect, world);
    expect(rig.fov).toBeGreaterThanOrEqual(MIN_FOV_DEG);
    expect(rig.fov).toBeLessThanOrEqual(MAX_FOV_DEG);
  });
});

it("keeps the camera level behind the nest, aimed at a beach point between the sea line and the nest", () => {
  const aspect = 9 / 19.5;
  const rig = cameraRig(aspect, world);
  expect(rig.position.x).toBe(0);
  expect(rig.target.x).toBe(0);
  expect(rig.position.z).toBeGreaterThan(rig.target.z); // behind (+Z)
  expect(rig.position.y).toBeGreaterThan(5); // elevated 3/4 view
  expect(rig.target.z).toBeGreaterThan(seaZ); // beach side of the sea line
  expect(rig.target.z).toBeLessThan(nestCenter.z);
  const center = projectPoint(rig, aspect, rig.target);
  expect(Math.abs(center.x)).toBeLessThan(1e-9);
  expect(Math.abs(center.y)).toBeLessThan(1e-9);
});

it("is deterministic for the same aspect and world", () => {
  expect(cameraRig(9 / 19.5, world)).toEqual(cameraRig(9 / 19.5, world));
});
