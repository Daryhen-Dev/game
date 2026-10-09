/**
 * Night ocean layer: one large transparent plane from the shoreline to the
 * horizon, driven by a MeshStandardMaterial patched via onBeforeCompile so it
 * keeps three.js lighting, fog and tone mapping:
 *
 * - vertex: swell displacement + analytic wave normals (mirror of waves.ts),
 * - fragment: depth-based color (deep navy -> turquoise near the shore),
 *   moon glitter path (bright streak toward the moon azimuth), shoreline
 *   foam bands (mirror of foam.ts), and an alpha fade at the moving swash
 *   edge so the water appears to advance and retreat over the sand.
 */
import * as THREE from "three";
import { type EnvLayer, DisposableBag } from "./env";
import { FOAM_GLSL, NOISE_GLSL, WAVE_GLSL } from "./shaderChunks";

export interface OceanOptions {
  seaLineZ: number;
  /** Direction from the scene toward the moon (normalized). */
  moonDir: THREE.Vector3;
}

export function createOcean(options: OceanOptions): EnvLayer {
  const bag = new DisposableBag();
  const group = new THREE.Group();

  // Sea plane: long enough to reach the fog at the horizon for every
  // supported aspect; vertex grid resolves the >= 7.5 m swell waves.
  const LENGTH_M = 340;
  const geometry = bag.add(new THREE.PlaneGeometry(640, LENGTH_M, 200, 160));
  const uniforms = {
    uTime: { value: 0 },
    uSeaLineZ: { value: options.seaLineZ },
    uColorDeep: { value: new THREE.Color(0x0a1c33) }, // deep navy offshore
    uColorShallow: { value: new THREE.Color(0x1c5a60) }, // turquoise near the shore
    uColorFoam: { value: new THREE.Color(0xdfe8ee) },
    uMoonDirW: { value: options.moonDir.clone().normalize() },
  };

  const material = bag.add(
    new THREE.MeshStandardMaterial({
      color: 0xffffff, // fully driven per-fragment below
      roughness: 0.3,
      metalness: 0,
      transparent: true,
    }),
  );
  material.customProgramCacheKey = () => "ocean-night-v2";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader =
      /* glsl */ `
      uniform float uTime;
      uniform float uSeaLineZ;
      varying float vWaveH;
      varying vec3 vWorldPos;
      varying vec3 vWaveNormalW;
      ${WAVE_GLSL}
      ` +
      shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          /* glsl */ `
          #include <beginnormal_vertex>
          vec3 oceanWpos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 oceanWave = waveHeightDx(oceanWpos.xz, uTime, uSeaLineZ);
          vWaveH = oceanWave.x;
          // Analytic wave normal (world space), rotated into this plane's
          // local frame (the mesh is rotated -PI/2 around X: local +Z -> +Y).
          vec3 oceanNWorld = normalize(vec3(-oceanWave.y, 1.0, -oceanWave.z));
          vWaveNormalW = oceanNWorld;
          objectNormal = normalize(vec3(oceanNWorld.x, -oceanNWorld.z, oceanNWorld.y));
          `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `
          #include <begin_vertex>
          transformed.z += oceanWave.x; // local +Z is world +Y
          vWorldPos = oceanWpos + vec3(0.0, oceanWave.x, 0.0);
          `,
        );

    shader.fragmentShader =
      /* glsl */ `
      uniform float uTime;
      uniform float uSeaLineZ;
      uniform vec3 uColorDeep;
      uniform vec3 uColorShallow;
      uniform vec3 uColorFoam;
      uniform vec3 uMoonDirW;
      varying float vWaveH;
      varying vec3 vWorldPos;
      varying vec3 vWaveNormalW;
      ${FOAM_GLSL}
      ${NOISE_GLSL}
      ` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          /* glsl */ `
          #include <color_fragment>
          float oceanShoreT = clamp((uSeaLineZ - vWorldPos.z) / 45.0, 0.0, 1.0);
          float oceanFoam = foamStrength(vWorldPos.z, vWorldPos.x, uTime, uSeaLineZ);
          // Depth-based color: turquoise at the shore, deep navy offshore.
          diffuseColor.rgb = mix(uColorShallow, uColorDeep, smoothstep(0.06, 0.65, oceanShoreT));
          // Moonlit sky reflection toward the horizon (fresnel).
          vec3 oceanV = normalize(cameraPosition - vWorldPos);
          float oceanFres = pow(1.0 - max(dot(normalize(vWaveNormalW), oceanV), 0.0), 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.33), oceanFres * 0.5);
          // Foam: swash edge + trailing lines + gentle crest foam.
          float oceanCrest = smoothstep(0.09, 0.14, vWaveH);
          oceanFoam = clamp(oceanFoam + oceanCrest * 0.3, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uColorFoam, oceanFoam);
          // Feathery alpha fade across the moving swash edge: the film thins
          // out with lateral noise instead of ending on a straight ruler line.
          float oceanEdge = waterEdgeZ(vWorldPos.x, uTime, uSeaLineZ);
          float oceanFeather = 0.55 + 0.6 * vnoise(vec2(vWorldPos.x * 0.9, uTime * 0.4));
          diffuseColor.a = 1.0 - smoothstep(oceanEdge - 0.35, oceanEdge + oceanFeather, vWorldPos.z);
          `,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          /* glsl */ `
          #include <roughnessmap_fragment>
          roughnessFactor = mix(0.55, 0.16, oceanShoreT);
          roughnessFactor = mix(roughnessFactor, 0.9, oceanFoam);
          `,
        )
        .replace(
          "#include <emissivemap_fragment>",
          /* glsl */ `
          #include <emissivemap_fragment>
          {
            // Moon glitter path: specular alignment plus a narrow streak under
            // the moon's azimuth (x ~ 0), sparkling with surface noise.
            vec3 oceanR = reflect(-oceanV, normalize(vWaveNormalW));
            // The real moon sits ~2.5 deg above the horizon; the glitter uses
            // the typical wave-facet reflection elevation so the streak shows.
            float oceanAlign = max(dot(oceanR, normalize(vec3(0.0, 0.23, -0.973))), 0.0);
            float oceanStreak = exp(-pow(vWorldPos.x / 4.0, 2.0));
            float oceanSparkle = 0.45 + 1.7 * pow(vnoise(vWorldPos.xz * 2.6 + vec2(0.0, uTime * 1.7)), 2.0);
            float oceanGlint =
              pow(oceanAlign, 60.0) * (0.25 + 1.8 * oceanStreak) * oceanSparkle +
              pow(oceanAlign, 18.0) * 0.15 * oceanStreak;
            totalEmissiveRadiance += vec3(0.85, 0.9, 1.0) * oceanGlint;
            // Foam reads bright at night (moonlit sea froth glows faintly).
            totalEmissiveRadiance += vec3(0.55, 0.6, 0.62) * oceanFoam * 0.45;
          }
          `,
        );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  // Overlap ~1.5 m onto the sand; the alpha fade + foam hide the junction.
  mesh.position.set(0, 0.06, options.seaLineZ + 1.5 - LENGTH_M / 2);
  mesh.renderOrder = 1;
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
