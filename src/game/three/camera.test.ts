import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../sim";
import { MAX_FOV_DEG, MIN_FOV_DEG, cameraRig, projectPoint } from "./camera";
import { seaLineZ, simToWorld } from "./worldMap";

const world = LEVEL_1.world;

/** The 4 playfield corners (sim x 0..360, sea line to bottom edge) on the ground. */
function playfieldCorners(): Array<{ x: number; y: number; z: number }> {
  const simCorners: Array<readonly [number, number]> = [
    [0, world.seaLineY],
    [world.width, world.seaLineY],
    [0, world.height],
    [world.width, world.height],
  ];
  return simCorners.map(([x, y]) => {
    const ground = simToWorld(x, y, world);
    return { x: ground.x, y: 0, z: ground.z };
  });
}

describe.each([
  ["narrowest portrait 0.45", 0.45],
  ["portrait 9:19.5", 9 / 19.5],
  ["portrait 9:16", 9 / 16],
  ["landscape 16:9", 16 / 9],
])("cameraRig (%s)", (_name, aspect) => {
  it("fits the whole playfield inside NDC with a HUD-safe margin", () => {
    const rig = cameraRig(aspect, world);
    for (const corner of playfieldCorners()) {
      const ndc = projectPoint(rig, aspect, corner);
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.97);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(0.97);
    }
  });

  it("keeps the fov in a playable range", () => {
    const rig = cameraRig(aspect, world);
    expect(rig.fov).toBeGreaterThanOrEqual(MIN_FOV_DEG);
    expect(rig.fov).toBeLessThanOrEqual(MAX_FOV_DEG);
  });
});

it("aims the camera at the playfield center from behind and above the nest", () => {
  const aspect = 9 / 19.5;
  const rig = cameraRig(aspect, world);
  expect(rig.target.x).toBe(0);
  expect(rig.target.z).toBeGreaterThan(seaLineZ(world)); // beach side of the sea line
  expect(rig.position.z).toBeGreaterThan(rig.target.z); // behind the nest (+Z)
  expect(rig.position.y).toBeGreaterThan(5); // elevated 3/4 view
  const center = projectPoint(rig, aspect, rig.target);
  expect(Math.abs(center.x)).toBeLessThan(1e-9);
  expect(Math.abs(center.y)).toBeLessThan(1e-9);
});

it("keeps the camera level (no sideways yaw)", () => {
  const rig = cameraRig(9 / 19.5, world);
  expect(rig.position.x).toBe(0);
  expect(rig.target.x).toBe(0);
});

it("widens the camera distance instead of the fov for ultra-narrow aspects", () => {
  const narrow = cameraRig(0.4, world);
  for (const corner of playfieldCorners()) {
    const ndc = projectPoint(narrow, 0.4, corner);
    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(0.97);
    expect(Math.abs(ndc.y)).toBeLessThanOrEqual(0.97);
  }
  const narrowestSupported = cameraRig(0.45, world);
  expect(narrow.position.y).toBeGreaterThan(narrowestSupported.position.y);
});
