/**
 * Pooled cartoon burst FX (no THREE objects allocated per frame): a small group of toon
 * spheres that pops outward with easeOutBack and fades. One pool serves
 * scare puffs (white/yellow), catch dust (tan) and safe splashes (white,
 * water-biased upward).
 */
import * as THREE from "three";
import { clamp01, easeOutBack, lifetime } from "./curves";

export interface BurstOptions {
  x: number;
  y: number;
  z: number;
  color: number;
  /** Upward bias of the sphere directions (0 = all sideways, 1 = fountain). */
  upBias?: number;
  /** Burst radius in meters. */
  radius?: number;
  /** Sphere size in meters. */
  size?: number;
  lifeSec?: number;
}

interface BurstSphere {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  dirX: number;
  dirY: number;
  dirZ: number;
}

interface Burst {
  spheres: BurstSphere[];
  originX: number;
  originY: number;
  originZ: number;
  radius: number;
  size: number;
  lifeSec: number;
  ageSec: number;
  active: boolean;
}

/** Deterministic golden-angle spread with a vertical bias (visual-only). */
function burstDirection(
  burstIndex: number,
  sphereIndex: number,
  count: number,
  upBias: number,
): { x: number; y: number; z: number } {
  const golden = 2.399963;
  const angle = burstIndex * 1.7 + sphereIndex * golden;
  const tilt = 0.35 + 0.65 * ((sphereIndex + 0.5) / count);
  return {
    x: Math.cos(angle) * (1 - upBias * 0.55),
    y: tilt * upBias,
    z: Math.sin(angle) * (1 - upBias * 0.55),
  };
}

export class BurstPool {
  readonly group = new THREE.Group();

  private readonly bursts: Burst[] = [];
  private readonly geometry: THREE.SphereGeometry;
  private nextBurst = 0;

  constructor(
    poolSize: number,
    spheresPerBurst: number,
  ) {
    this.geometry = new THREE.SphereGeometry(1, 8, 6);

    for (let b = 0; b < poolSize; b++) {
      const spheres: BurstSphere[] = [];
      for (let s = 0; s < spheresPerBurst; s++) {
        const material = new THREE.MeshBasicMaterial({ transparent: true });
        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.visible = false;
        this.group.add(mesh);
        const dir = burstDirection(b, s, spheresPerBurst, 0);
        spheres.push({ mesh, material, dirX: dir.x, dirY: dir.y, dirZ: dir.z });
      }
      this.bursts.push({
        spheres,
        originX: 0,
        originY: 0,
        originZ: 0,
        radius: 0.5,
        size: 0.09,
        lifeSec: 0.45,
        ageSec: 0,
        active: false,
      });
    }
  }

  /** Spawn a burst at the next pool slot (the oldest burst is reused when exhausted). */
  spawn(options: BurstOptions): void {
    const burst = this.bursts[this.nextBurst];
    this.nextBurst = (this.nextBurst + 1) % this.bursts.length;
    burst.active = true;
    burst.ageSec = 0;
    burst.originX = options.x;
    burst.originY = options.y;
    burst.originZ = options.z;
    burst.radius = options.radius ?? 0.5;
    burst.size = options.size ?? 0.09;
    burst.lifeSec = options.lifeSec ?? 0.45;
    const upBias = options.upBias ?? 0.6;
    const color = new THREE.Color(options.color);
    for (let s = 0; s < burst.spheres.length; s++) {
      const sphere = burst.spheres[s];
      const dir = burstDirection(this.nextBurst, s, burst.spheres.length, upBias);
      sphere.dirX = dir.x;
      sphere.dirY = dir.y;
      sphere.dirZ = dir.z;
      sphere.material.color.copy(color);
    }
  }

  update(dtSec: number): void {
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.ageSec += dtSec;
      const progress = lifetime(burst.ageSec, burst.lifeSec);
      if (progress >= 1) {
        burst.active = false;
        for (const sphere of burst.spheres) sphere.mesh.visible = false;
        continue;
      }
      // Spheres pop outward (easeOutBack overshoot) and shrink away.
      const spread = easeOutBack(Math.min(1, progress * 1.25)) * burst.radius;
      for (const sphere of burst.spheres) {
        sphere.mesh.visible = true;
        sphere.mesh.position.set(
          burst.originX + sphere.dirX * spread,
          burst.originY + sphere.dirY * spread,
          burst.originZ + sphere.dirZ * spread,
        );
        const scale = burst.size * (0.5 + 0.7 * easeOutBack(progress)) * (1 - 0.6 * progress);
        sphere.mesh.scale.setScalar(Math.max(0.001, scale));
        sphere.material.opacity = clamp01(1.4 - 1.4 * progress);
      }
    }
  }

  dispose(): void {
    for (const burst of this.bursts) {
      for (const sphere of burst.spheres) sphere.material.dispose();
    }
    this.geometry.dispose();
    this.group.clear();
  }
}
