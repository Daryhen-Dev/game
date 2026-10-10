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
 * Draw calls: 17 total (3 rock variants + their outlines, heron rock +
 * outline, mangroves + outline, nest mound + outline, eggshell fragments,
 * burrows, shells, driftwood log + outline). Props sit at their `duneHeight`
 * ground level; the play lane stays untouched (height 0, flat).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type EnvLayer, DisposableBag } from "./env";
import { type DuneConfig, duneHeight } from "./dunes";
import { SCALE_M_PER_PX, seaLineZ, simToWorld } from "../worldMap";
import { type ToonMaterialFactory } from "../toon/toonMaterials";
import { addOutline } from "../toon/outline";
import { colorFacetsByNormal } from "../creatures/parts";
import type { PredatorDef, WorldConfig } from "../../sim";

export interface PropsOptions {
  world: WorldConfig;
  predators: PredatorDef[];
  /** Seed for deterministic prop placement (independent from the sim seed). */
  seed: number;
  /** Cartoon toon-material factory (V3 restyle). */
  toon: ToonMaterialFactory;
  /** Shared inverted-hull outline material. */
  outlineMaterial: THREE.MeshBasicMaterial;
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
  weld = false,
): THREE.BufferGeometry {
  const geometry = base.clone();
  base.dispose(); // only the jittered clone is used
  const position = geometry.attributes.position as THREE.BufferAttribute;
  if (weld) {
    // Position-hash jitter: duplicated (non-indexed) vertices move together,
    // so the rock keeps a crack-free silhouette with flat facets.
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i);
      const py = position.getY(i);
      const pz = position.getZ(i);
      const hash = (seed: number): number => {
        const s = Math.sin(px * 12.9898 + py * 78.233 + pz * 37.719 + seed) * 43758.5453;
        return (s - Math.floor(s)) - 0.5;
      };
      position.setXYZ(i, px + hash(0) * amount, py + hash(7) * amount, pz + hash(13) * amount);
    }
  } else {
    for (let i = 0; i < position.count; i++) {
      position.setXYZ(
        i,
        position.getX(i) + (rng() - 0.5) * amount,
        position.getY(i) + (rng() - 0.5) * amount,
        position.getZ(i) + (rng() - 0.5) * amount,
      );
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Merge parts, failing loudly (with part indices) if shapes are incompatible. */
function mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) {
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
  const rockMaterial = options.toon.get({ color: 0x2c3340, emissive: 0x0c1018 });
  const rockGeometries = [
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.35),
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.35),
    jitterRockGeometry(new THREE.DodecahedronGeometry(1, 0), rng, 0.35),
  ].map((g) => bag.add(g));

  // Three instanced variants scattered along both dune sides + the shoreline.
  const ROCKS_PER_VARIANT = 12;
  const matrix = new THREE.Matrix4();
  const scaleMatrixScratch = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleVec = new THREE.Vector3();
  const positionVec = new THREE.Vector3();
  for (const geometry of rockGeometries) {
    const instanced = bag.add(
      new THREE.InstancedMesh(geometry, rockMaterial, ROCKS_PER_VARIANT),
    );
    instanced.castShadow = true;
    const outline = bag.add(
      new THREE.InstancedMesh(geometry, options.outlineMaterial, ROCKS_PER_VARIANT),
    );
    for (let i = 0; i < ROCKS_PER_VARIANT; i++) {
      // Half along the dune sides, half as shore rocks standing in the
      // shallows (far enough out that they stay fully on screen).
      const nearShore = i % 2 === 0;
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (nearShore ? 9.7 + rng() * 2.5 : 11 + rng() * 6);
      const z = nearShore ? seaZ - 5 + rng() * 3.5 : seaZ + 2 + rng() * 26;
      const scale = 0.25 + rng() * 0.55;
      euler.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
      quaternion.setFromEuler(euler);
      scaleVec.set(scale, scale * (0.55 + rng() * 0.25), scale * (0.7 + rng() * 0.4));
      positionVec.set(x, groundY(x, z, cfg) + scale * 0.3, z);
      matrix.compose(positionVec, quaternion, scaleVec);
      instanced.setMatrixAt(i, matrix);
      // Inverted-hull outline: same instance grown ~5% around its origin.
      matrix.multiply(scaleMatrixScratch.makeScale(1.05, 1.05, 1.05));
      outline.setMatrixAt(i, matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    outline.instanceMatrix.needsUpdate = true;
    group.add(instanced);
    group.add(outline);
  }

  // Heron rock at the sim rock position (flat-topped perch).
  const heronPos = simToWorld(
    options.predators.find((p) => p.kind === "lavaHeron")?.rock.x ?? 300,
    options.predators.find((p) => p.kind === "lavaHeron")?.rock.y ?? 140,
    options.world,
  );
  // Chunky cartoon basalt boulder: dark grey-brown with lighter flat top
  // facets and a few dark pits; welded jitter keeps the silhouette crack-free.
  const heronGeometry = bag.add(
    jitterRockGeometry(new THREE.DodecahedronGeometry(0.55, 0), rng, 0.16, true),
  );
  const faceted = colorFacetsByNormal(
    heronGeometry,
    new THREE.Color(0x5a544c), // lighter flat top facets
    new THREE.Color(0x38342e), // dark grey-brown sides
    0.45,
  );
  const pitA = withColor(new THREE.SphereGeometry(0.06, 6, 5), new THREE.Color(0x201d19));
  pitA.translate(0.26, 0.1, 0.16);
  const pitB = withColor(new THREE.SphereGeometry(0.05, 6, 5), new THREE.Color(0x201d19));
  pitB.translate(-0.2, 0.03, 0.26);
  const pitC = withColor(new THREE.SphereGeometry(0.045, 6, 5), new THREE.Color(0x242019));
  pitC.translate(-0.05, 0.3, -0.1);
  const heronRockGeometry = bag.add(mergeParts([faceted, pitA, pitB, pitC], "heron rock"));
  const heronRockMaterial = options.toon.get({ vertexColors: true, emissive: 0x0e0c0a });
  const heronRock = new THREE.Mesh(heronRockGeometry, heronRockMaterial);
  heronRock.position.set(heronPos.x, 0.3, heronPos.z);
  heronRock.scale.set(1, 0.62, 0.85);
  heronRock.rotation.y = rng() * Math.PI * 2;
  heronRock.castShadow = true;
  addOutline(heronRock, options.outlineMaterial, 1.06);
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
  const mangroveMaterial = options.toon.get({ vertexColors: true, emissive: 0x0a140c });
  const mangroves = new THREE.Mesh(mangroveGeometry, mangroveMaterial);
  mangroves.castShadow = true;
  addOutline(mangroves, options.outlineMaterial, 1.04);
  group.add(mangroves);

  // --- nest mound + eggshell fragments ---------------------------------------
  // Dug-sand nest: a small low ring (r ~0.45 m) with a raised rim, a scooped
  // centre and vertex-colored rings (rim highlight, inner shadow) so it reads
  // as dug sand up close — no flat disc, no glow.
  const nestPos = simToWorld(options.world.nest.x, options.world.nest.y, options.world);
  const moundPoints: Array<{ p: THREE.Vector2; color: THREE.Color }> = [
    // Outer -> inner so LatheGeometry winds the faces outward (the reverse
    // order inverts the normals and the front faces get culled).
    { p: new THREE.Vector2(0.45, 0.0), color: new THREE.Color(0xa8905e) },
    { p: new THREE.Vector2(0.4, 0.06), color: new THREE.Color(0xb89c6e) }, // rim highlight
    { p: new THREE.Vector2(0.3, 0.085), color: new THREE.Color(0xbfa470) }, // rim crest
    { p: new THREE.Vector2(0.2, 0.05), color: new THREE.Color(0x7e6c4a) }, // inner shadow
    { p: new THREE.Vector2(0.1, 0.042), color: new THREE.Color(0x776648) }, // scoop
    { p: new THREE.Vector2(0.0, 0.048), color: new THREE.Color(0x7e6c4a) },
  ];
  const moundGeometry = bag.add(
    new THREE.LatheGeometry(
      moundPoints.map((entry) => entry.p),
      24,
    ),
  );
  // Per-ring vertex colors: LatheGeometry lays out vertices segment by
  // segment, each ring sharing the profile point order.
  {
    const ringCount = 25; // segments + 1
    const pointCount = moundPoints.length;
    const colors = new Float32Array(ringCount * pointCount * 3);
    for (let ring = 0; ring < ringCount; ring++) {
      for (let point = 0; point < pointCount; point++) {
        const color = moundPoints[point].color;
        const i = (ring * pointCount + point) * 3;
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
    }
    moundGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const moundMaterial = options.toon.get({ vertexColors: true, emissive: 0x0d0b08 });
  const mound = new THREE.Mesh(moundGeometry, moundMaterial);
  mound.position.set(nestPos.x, 0.005, nestPos.z + 0.1);
  mound.receiveShadow = true;
  mound.castShadow = true;
  addOutline(mound, options.outlineMaterial, 1.05);
  group.add(mound);

  // Eggshell halves: three on the rim, four around the nest.
  const fragmentGeometry = bag.add(
    new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 1.5, 0, Math.PI * 0.55),
  );
  const fragmentMaterial = options.toon.get({
    color: 0xf0ead9,
    emissive: 0x2a2620, // keep them readable at night
  });
  const fragments = bag.add(new THREE.InstancedMesh(fragmentGeometry, fragmentMaterial, 7));
  const fragmentMatrix = new THREE.Matrix4();
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + rng() * 0.5;
    const radius = i < 3 ? 0.28 + rng() * 0.1 : 0.46 + rng() * 0.16;
    const shellY = i < 3 ? 0.075 : 0.02;
    const x = nestPos.x + Math.cos(angle) * radius;
    const z = nestPos.z + 0.1 + Math.sin(angle) * radius * 0.7;
    fragmentMatrix.identity();
    fragmentMatrix.makeRotationFromEuler(
      new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI),
    );
    fragmentMatrix.setPosition(x, shellY, z);
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
  const burrowMaterial = options.toon.get({ vertexColors: true });
  group.add(new THREE.Mesh(burrowGeometry, burrowMaterial));

  // --- shells + driftwood ------------------------------------------------------
  const shellGeometry = bag.add(new THREE.ConeGeometry(0.09, 0.14, 5));
  const shellMaterial = options.toon.get({
    color: 0xe8e0d0,
    emissive: 0x302c22, // off-white shells stay readable at night
  });
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

  // --- driftwood: single curved two-tone logs ---------------------------------
  // One bent log geometry from alternating light/dark segments (two-tone
  // toon brown); two separate logs instead of crossed sticks.
  const logParts: THREE.BufferGeometry[] = [];
  const logLight = new THREE.Color(0x9a8262);
  const logDark = new THREE.Color(0x6e5a44);
  for (let i = 0; i < 5; i++) {
    const radius = 0.15 - i * 0.01;
    const seg = withColor(
      new THREE.CylinderGeometry(radius - 0.01, radius, 0.36, 7),
      i % 2 === 0 ? logLight : logDark,
    );
    seg.rotateZ(Math.PI / 2); // axis along +X
    seg.rotateZ(i * 0.09); // slight bend
    seg.translate(-0.68 + i * 0.345, Math.sin(i * 0.4) * 0.05, 0);
    logParts.push(seg);
  }
  const logGeometry = bag.add(mergeParts(logParts, "driftwood log"));
  const logMaterial = options.toon.get({ vertexColors: true, emissive: 0x18130e });
  const driftwood = bag.add(new THREE.InstancedMesh(logGeometry, logMaterial, 2));
  const driftwoodOutline = bag.add(
    new THREE.InstancedMesh(logGeometry, options.outlineMaterial, 2),
  );
  // Two single logs, clearly apart (>= 2 m), each lying roughly parallel to
  // the shoreline — never overlapping or crossing.
  for (let i = 0; i < 2; i++) {
    const x = (i === 0 ? -5.0 : 4.4) + (rng() - 0.5) * 0.6;
    const z = seaZ + (i === 0 ? 11.5 : 14) + (rng() - 0.5) * 0.8;
    const yaw = (i === 0 ? 0.35 : -0.25) + (rng() - 0.5) * 0.2;
    fragmentMatrix.identity();
    fragmentMatrix.makeRotationY(yaw);
    fragmentMatrix.setPosition(x, groundY(x, z, cfg) + 0.16, z);
    driftwood.setMatrixAt(i, fragmentMatrix);
    fragmentMatrix.multiply(scaleMatrixScratch.makeScale(1.06, 1.06, 1.06));
    driftwoodOutline.setMatrixAt(i, fragmentMatrix);
  }
  driftwood.instanceMatrix.needsUpdate = true;
  driftwoodOutline.instanceMatrix.needsUpdate = true;
  group.add(driftwood);
  group.add(driftwoodOutline);

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
