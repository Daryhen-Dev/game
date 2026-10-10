/**
 * Night beach layer: one subdivided sand plane displaced on the CPU by the
 * pure `duneHeight` profile (dunes away from the play lane, gentle rise
 * behind the nest, shallow dip below the waterline). A patched
 * MeshStandardMaterial adds moonlit shading: darker wet band near the moving
 * water edge, a foam film where the swash reaches, and subtle ripple noise.
 *
 * Picking note: ground picking uses the y = 0 plane; `duneHeight` is exactly
 * 0 inside the sim playfield, so picking error is 0 where gameplay happens.
 * (Outside the playfield, error is bounded by the dune profile itself.)
 */
import * as THREE from "three";
import { type EnvLayer, DisposableBag } from "./env";
import { type DuneConfig, duneHeight } from "./dunes";
import { FOAM_GLSL, NOISE_GLSL } from "./shaderChunks";
import { seaLineZ, type WorldMapConfig } from "../worldMap";

export interface SandOptions {
  world: WorldMapConfig;
}

export function createSand(options: SandOptions): EnvLayer {
  const bag = new DisposableBag();
  const group = new THREE.Group();
  const seaZ = seaLineZ(options.world);
  const duneCfg: DuneConfig = {
    seaLineZ: seaZ,
    playfieldHalfWidthM: (options.world.width / 2) * 0.05,
    playfieldFarZ: (options.world.height - options.world.height / 2) * 0.05,
  };

  // Sand spans from below the waterline to well behind the nest, with side
  // room for the dunes.
  const X_HALF_M = 34;
  const Z_NEAR_M = 5; // meters of sand below (seaward of) the sea line
  const Z_FAR_M = 13; // meters of sand behind the playfield bottom edge
  const lengthM = Z_NEAR_M + (duneCfg.playfieldFarZ - seaZ) + Z_FAR_M;
  const centerZ = seaZ - Z_NEAR_M + lengthM / 2;

  const geometry = bag.add(new THREE.PlaneGeometry(X_HALF_M * 2, lengthM, 130, 120));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, centerZ);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, duneHeight(x, z, duneCfg));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uSeaLineZ: { value: seaZ },
    uColorFoam: { value: new THREE.Color(0xd8e0e6) },
  };
  const material = bag.add(
    new THREE.MeshStandardMaterial({
      // Pale cool beige sand; lights + tone patches below keep it from reading
      // as a flat grey plate.
      color: 0xe6d4a6,
      roughness: 1,
      metalness: 0,
    }),
  );
  material.customProgramCacheKey = () => "sand-night-v2";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      /* glsl */ `
      varying vec3 vSandWorldPos;
      ` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vSandWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );
    shader.fragmentShader =
      /* glsl */ `
      uniform float uTime;
      uniform float uSeaLineZ;
      uniform vec3 uColorFoam;
      varying vec3 vSandWorldPos;
      ${FOAM_GLSL}
      ${NOISE_GLSL}
      ` +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        float gSandFoam = 0.0;
        {
          float sandEdge = waterEdgeZ(vSandWorldPos.x, uTime, uSeaLineZ);
          // Wet sand: darker where the water reaches (and recently reached).
          float sandWet = clamp((sandEdge + 0.2 - vSandWorldPos.z) / 2.2, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.55, sandWet);
          // Foam film left by the swash on the sand side of the edge.
          float sandFoam = foamStrength(vSandWorldPos.z, vSandWorldPos.x, uTime, uSeaLineZ)
            * (1.0 - smoothstep(sandEdge, sandEdge + 0.7, vSandWorldPos.z));
          diffuseColor.rgb = mix(diffuseColor.rgb, uColorFoam, sandFoam * 0.9);
          gSandFoam = sandFoam;
          // Subtle wave-formed ripples (elongated along the shore) plus
          // large-scale tone patches so the beach is not a uniform plate.
          float sandRipple = vnoise(vec2(vSandWorldPos.x * 0.9, vSandWorldPos.z * 3.4));
          float sandPatch = vnoise(vSandWorldPos.xz * 0.16 + 7.3);
          diffuseColor.rgb *= (0.93 + 0.14 * sandRipple) * (0.88 + 0.24 * sandPatch);
        }
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #include <emissivemap_fragment>
        // The foam film glows faintly so it reads as white froth at night.
        totalEmissiveRadiance += uColorFoam * gSandFoam * 0.22;
        `,
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);

  return {
    group,
    update(timeSec: number) {
      uniforms.uTime.value = timeSec;
    },
    dispose() {
      bag.dispose();
    },
  };
}
