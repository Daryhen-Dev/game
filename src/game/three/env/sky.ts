/**
 * Night sky layer: gradient sky dome (deep blue zenith -> lighter horizon),
 * a low moon disc with an additive glow above the sea (its azimuth sets the
 * glitter path on the water), and a seeded static star field.
 */
import * as THREE from "three";
import { type EnvLayer, DisposableBag } from "./env";
import { starDirections } from "./stars";

export interface SkyOptions {
  seed: number;
  /** Star count (a few hundred). */
  starCount?: number;
}

/** Horizon color; also used as the scene fog/background so the sea blends. */
export const HORIZON_COLOR = 0x33486b;
/** Elevation of the moon disc above the horizon (radians) — a low moon. */
const MOON_ELEVATION_RAD = 2.5 * (Math.PI / 180);
const DOME_RADIUS_M = 420;
const MOON_DISTANCE_M = 380;

/** Radial-gradient glow texture (shared by the moon sprite). */
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(226, 232, 244, 0.9)");
  gradient.addColorStop(0.25, "rgba(210, 220, 238, 0.35)");
  gradient.addColorStop(0.6, "rgba(190, 205, 230, 0.08)");
  gradient.addColorStop(1, "rgba(190, 205, 230, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSky(options: SkyOptions): EnvLayer {
  const bag = new DisposableBag();
  const group = new THREE.Group();

  // Gradient dome.
  const domeGeometry = bag.add(new THREE.SphereGeometry(DOME_RADIUS_M, 32, 20));
  const domeMaterial = bag.add(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x0a1630) },
        uHorizon: { value: new THREE.Color(HORIZON_COLOR) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vSkyDir;
        void main() {
          vSkyDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying vec3 vSkyDir;
        void main() {
          float h = clamp(vSkyDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  const dome = new THREE.Mesh(domeGeometry, domeMaterial);
  dome.renderOrder = -10;
  group.add(dome);

  // Moon: low disc over the sea so its reflection path falls on the water.
  const moonDir = new THREE.Vector3(
    0,
    Math.sin(MOON_ELEVATION_RAD),
    -Math.cos(MOON_ELEVATION_RAD),
  );
  const moonPosition = moonDir.clone().multiplyScalar(MOON_DISTANCE_M);

  const moonGeometry = bag.add(new THREE.CircleGeometry(7, 28));
  const moonMaterial = bag.add(
    new THREE.MeshBasicMaterial({ color: 0xf2eeda, fog: false, toneMapped: false }),
  );
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.copy(moonPosition);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -8;
  group.add(moon);

  const glowTexture = bag.add(makeGlowTexture());
  const glowMaterial = bag.add(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      opacity: 0.9,
    }),
  );
  const glow = new THREE.Sprite(glowMaterial);
  glow.position.copy(moonPosition);
  glow.scale.setScalar(110);
  glow.renderOrder = -9;
  group.add(glow);

  // Stars: static, seeded, above the horizon.
  const starDirectionsList = starDirections(options.seed, options.starCount ?? 320);
  const starPositions = new Float32Array(starDirectionsList.length * 3);
  starDirectionsList.forEach((star, i) => {
    starPositions[i * 3] = star.x * 380;
    starPositions[i * 3 + 1] = star.y * 380;
    starPositions[i * 3 + 2] = star.z * 380;
  });
  const starGeometry = bag.add(new THREE.BufferGeometry());
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = bag.add(
    new THREE.PointsMaterial({
      color: 0xd8e0f0,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -9;
  group.add(stars);

  return {
    group,
    update() {
      /* static sky */
    },
    dispose() {
      bag.dispose();
    },
  };
}
