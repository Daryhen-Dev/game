/**
 * Static beach props for the night scene (built once, deterministic):
 * - dark basalt lava rocks (jittered dodecahedra; the heron rock at the sim
 *   rock position), instanced in three jittered variants,
 * - mangrove clumps at the beach edges outside the playfield (merged into
 *   one vertex-colored mesh),
 * - the nest mound with small eggshell fragments at the sim nest,
 * - ghost-crab burrow holes (dark disc + sand rim) at each burrow,
 * - scattered shells and driftwood.
 *
 * Draw calls: 10 total. Props sit at their `duneHeight` ground level; the
 * play lane stays untouched (height 0, flat).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type EnvLayer, DisposableBag } from "./env";
import { type DuneConfig, duneHeight } from "./dunes";
import { SCALE_M_PER_PX, seaLineZ, simToWorld } from "../worldMap";
import type { PredatorDef, WorldConfig } from "../../sim";

export interface PropsOptions {
  world: WorldConfig;
  predators: PredatorDef[];
  /** Seed for deterministic prop placement (independent from the sim seed). */
  seed: number;
}

const DUNE_CFG = (world: WorldConfig): DuneConfig => ({
  seaLineZ: seaLineZ(world),
  playfieldHalfWidthM: (world.width / 2) * SCALE_M_PER_PX,
  playfieldFarZ: (world.height - world.height / 2) * SCALE_M_PER_PX,
});

/** Ground Y at a world point (0 inside the flat play lane). */
function groundY(x: number, z: number, cfg: DuneConfig): number {
  return duneHeight(x, z, cfg);
}

/** Jitter a rock geometry deterministically for a craggy basalt look. */
function jitterRockGeometry(
  base: THREE.BufferGeometry,
  rng: () => number,
  amount: number,
): THREE.BufferGeometry {
  const geometry = base.clone();
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + (rng() - 0.5) * amount,
      position.getY(i) + (rng() - 0.5) * amount,
      position.getZ(i) + (rng() - 0.5) * amount,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Merge parts, failing loudly (with part indices) if shapes are incompatible. */
function mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) {
    for (const part of parts) part.dispose();
    throw new Error(
      `props: could not merge ${label} geometries (${parts.length} parts); ` +
        "attribute sets or indexedness differ",
    );
  }
  return merged;
}

/** Fill a geometry's vertex-color attribute with one color. */
function withColor(source: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  // Normalize to non-indexed so parts from indexed (cylinder, circle, ring) and
  // non-indexed (polyhedron) primitives can be merged by mergeGeometries.
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function createProps(options: PropsOptions): EnvLayer {
  const bag = new DisposableBag();
  const group = new THREE.Group();
  const cfg = DUNE_CFG(options.world);
  const seaZ = seaLineZ(options.world);
  let state = options.seed >>> 0;
  const rng = (): number => {
    // mulberry32 inline (independent stream from the simulation RNG).
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // --- lava rocks -----------------------------------------------------------
  const rockMaterial = bag.add(
    new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.95 }),
  );
  const rockGeometries = [
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.35),
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.35),
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.35),
  ].map((g) => bag.add(g));

  // Three instanced variants scattered along both dune sides + the shoreline.
  const ROCKS_PER_VARIANT = 12;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleVec = new THREE.Vector3();
  const positionVec = new THREE.Vector3();
  for (const geometry of rockGeometries) {
    const instanced = bag.add(
      new THREE.InstancedMesh(geometry, rockMaterial, ROCKS_PER_VARIANT),
    );
    instanced.castShadow = true;
    for (let i = 0; i < ROCKS_PER_VARIANT; i++) {
      // Half along the dune sides, half near the waterline edges.
      const nearShore = i % 2 === 0;
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (nearShore ? 9.7 + rng() * 2.5 : 11 + rng() * 6);
      const z = nearShore ? seaZ - 2 + rng() * 4 : seaZ + 2 + rng() * 26;
      const scale = 0.25 + rng() * 0.55;
      euler.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
      quaternion.setFromEuler(euler);
      scaleVec.set(scale, scale * (0.55 + rng() * 0.25), scale * (0.7 + rng() * 0.4));
      positionVec.set(x, groundY(x, z, cfg) + scale * 0.3, z);
      matrix.compose(positionVec, quaternion, scaleVec);
      instanced.setMatrixAt(i, matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  // Heron rock at the sim rock position (flat-topped perch).
  const heronPos = simToWorld(
    options.predators.find((p) => p.kind === "lavaHeron")?.rock.x ?? 300,
    options.predators.find((p) => p.kind === "lavaHeron")?.rock.y ?? 140,
    options.world,
  );
  const heronGeometry = bag.add(
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.28),
  );
  const heronRock = new THREE.Mesh(heronGeometry, rockMaterial);
  heronRock.position.set(heronPos.x, 0.28, heronPos.z);
  heronRock.scale.set(0.95, 0.5, 0.8);
  heronRock.rotation.y = rng() * Math.PI * 2;
  heronRock.castShadow = true;
  group.add(heronRock);

  // --- mangroves (merged, vertex-colored) ------------------------------------
  const mangroveParts: THREE.BufferGeometry[] = [];
  const trunkColor = new THREE.Color(0x3a2b1e);
  const foliageDark = new THREE.Color(0x16321f);
  const foliageLight = new THREE.Color(0x1d4028);
  const clumpCenters: Array<[number, number]> = [
    [-13, -2],
    [14, 2],
    [-15, 10],
    [15, 14],
    [-12, 18],
    [-14, 26],
  ];
  for (const [cx, cz] of clumpCenters) {
    const baseY = groundY(cx, cz, cfg);
    const trunk = withColor(new THREE.CylinderGeometry(0.16, 0.32, 2.4, 6), trunkColor);
    trunk.translate(cx, baseY + 1.2, cz);
    mangroveParts.push(trunk);
    for (let f = 0; f < 3; f++) {
      const foliage = withColor(
        new THREE.IcosahedronGeometry(0.9 + rng() * 0.7, 0),
        f % 2 === 0 ? foliageDark : foliageLight,
      );
      foliage.scale(1.2, 0.7, 1.2);
      foliage.translate(
        cx + (rng() - 0.5) * 1.6,
        baseY + 2.1 + rng() * 0.9,
        cz + (rng() - 0.5) * 1.6,
      );
      mangroveParts.push(foliage);
    }
  }
  const mangroveGeometry = bag.add(mergeParts(mangroveParts, "mangrove"));
  for (const part of mangroveParts) part.dispose();
  const mangroveMaterial = bag.add(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  const mangroves = new THREE.Mesh(mangroveGeometry, mangroveMaterial);
  mangroves.castShadow = true;
  group.add(mangroves);

  // --- nest mound + eggshell fragments ---------------------------------------
  const nestPos = simToWorld(options.world.nest.x, options.world.nest.y, options.world);
  const moundGeometry = bag.add(new THREE.SphereGeometry(0.5, 28, 18));
  const moundMaterial = bag.add(
    new THREE.MeshStandardMaterial({ color: 0xcabd9c, roughness: 1 }),
  );
  const mound = new THREE.Mesh(moundGeometry, moundMaterial);
  mound.scale.set(1, 0.3, 1);
  mound.position.set(nestPos.x, 0.005, nestPos.z + 0.1);
  mound.receiveShadow = true;
  group.add(mound);

  // Eggshell fragments: small curved shells (partial spheres), off-white.
  const fragmentGeometry = bag.add(
    new THREE.SphereGeometry(0.055, 8, 6, 0, Math.PI * 1.5, 0, Math.PI * 0.55),
  );
  const fragmentMaterial = bag.add(
    new THREE.MeshStandardMaterial({
      color: 0xf0ead9,
      roughness: 0.7,
      emissive: 0x2a2620, // keep them readable at night
    }),
  );
  const fragments = bag.add(new THREE.InstancedMesh(fragmentGeometry, fragmentMaterial, 6));
  const fragmentMatrix = new THREE.Matrix4();
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 0.22 + rng() * 0.4;
    const x = nestPos.x + Math.cos(angle) * radius;
    const z = nestPos.z + 0.1 + Math.sin(angle) * radius * 0.7;
    fragmentMatrix.identity();
    fragmentMatrix.makeRotationFromEuler(
      new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI),
    );
    fragmentMatrix.setPosition(x, 0.19, z);
    fragments.setMatrixAt(i, fragmentMatrix);
  }
  fragments.instanceMatrix.needsUpdate = true;
  group.add(fragments);

  // --- ghost-crab burrows ------------------------------------------------------
  const burrowParts: THREE.BufferGeometry[] = [];
  const holeColor = new THREE.Color(0x191410);
  const rimColor = new THREE.Color(0xbfae8c);
  for (const predator of options.predators) {
    if (predator.kind !== "ghostCrab") continue;
    const pos = simToWorld(predator.burrow.x, predator.burrow.y, options.world);
    const hole = withColor(new THREE.CircleGeometry(0.13, 12), holeColor);
    hole.rotateX(-Math.PI / 2);
    hole.translate(pos.x, 0.012, pos.z);
    burrowParts.push(hole);
    const rim = withColor(new THREE.RingGeometry(0.13, 0.24, 12), rimColor);
    rim.rotateX(-Math.PI / 2);
    rim.translate(pos.x, 0.011, pos.z);
    burrowParts.push(rim);
  }
  const burrowGeometry = bag.add(mergeParts(burrowParts, "burrow"));
  for (const part of burrowParts) part.dispose();
  const burrowMaterial = bag.add(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  group.add(new THREE.Mesh(burrowGeometry, burrowMaterial));

  // --- shells + driftwood ------------------------------------------------------
  const shellGeometry = bag.add(new THREE.ConeGeometry(0.09, 0.14, 5));
  const shellMaterial = bag.add(
    new THREE.MeshStandardMaterial({
      color: 0xe8e0d0,
      roughness: 0.8,
      emissive: 0x302c22, // off-white shells stay readable at night
    }),
  );
  const shells = bag.add(new THREE.InstancedMesh(shellGeometry, shellMaterial, 14));
  for (let i = 0; i < 14; i++) {
    const x = (rng() - 0.5) * 16;
    const z = seaZ + 1 + rng() * 13;
    fragmentMatrix.makeRotationY(rng() * Math.PI * 2);
    fragmentMatrix.setPosition(x, groundY(x, z, cfg) + 0.05, z);
    shells.setMatrixAt(i, fragmentMatrix);
  }
  shells.instanceMatrix.needsUpdate = true;
  group.add(shells);

  const woodGeometry = bag.add(new THREE.CylinderGeometry(0.13, 0.18, 1.6, 6));
  const woodMaterial = bag.add(
    new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1, emissive: 0x1a1610 }),
  );
  const driftwood = bag.add(new THREE.InstancedMesh(woodGeometry, woodMaterial, 3));
  for (let i = 0; i < 3; i++) {
    const x = (rng() - 0.5) * 12;
    const z = seaZ + 9 + rng() * 6;
    // Lying flat on the sand: axis along the ground, random yaw.
    fragmentMatrix.identity();
    fragmentMatrix.makeRotationFromEuler(
      new THREE.Euler(Math.PI / 2, 0, rng() * Math.PI),
    );
    fragmentMatrix.setPosition(x, groundY(x, z, cfg) + 0.16, z);
    driftwood.setMatrixAt(i, fragmentMatrix);
  }
  driftwood.instanceMatrix.needsUpdate = true;
  group.add(driftwood);

  return {
    group,
    update() {
      /* static props */
    },
    dispose() {
      bag.dispose();
    },
  };
}
