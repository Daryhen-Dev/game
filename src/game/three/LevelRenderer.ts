/**
 * Three.js level renderer for Level 1 "Bahía Las Bachas".
 *
 * Thin glue over the pure layers: drives the deterministic `Simulation` with
 * a fixed-step accumulator, renders placeholder low-poly meshes (pooled by
 * entity id, shared geometries/materials, no per-frame allocation), handles
 * ground-raycast scare input and feeds the HTML HUD overlay.
 *
 * V1 foundation + V2 environment: night beach scene (sky/ocean/sand/props
 * live in `./env/*`), placeholder shapes for creatures until V3.
 */
import * as THREE from "three";
import {
  Simulation,
  type LevelConfig,
  type Predator,
  type Rng,
  type SimEvent,
  type WorldConfig,
} from "../sim";
import {
  energyBar,
  ecosystemMeter,
  scareFeedback,
  type ScareFeedbackKind,
} from "../view/hud";
import { diveTelegraph } from "../view/presentation";
import { cameraRig } from "./camera";
import { type EnvLayer } from "./env/env";
import { createOcean } from "./env/ocean";
import { createProps } from "./env/props";
import { createSand } from "./env/sand";
import { createSky, HORIZON_COLOR } from "./env/sky";
import { HudOverlay } from "./hudOverlay";
import { rayToGround } from "./picking";
import { SCALE_M_PER_PX, seaLineZ, simToWorld, worldToSim } from "./worldMap";

/** Fixed simulation step (60 Hz) decoupled from the render frame rate. */
const FIXED_STEP_SEC = 1 / 60;
/** Cap accumulated time so tab switches don't cause a catch-up spiral. */
const MAX_FRAME_SEC = 0.25;
/** Frigatebird hover height (meters); descends during the windup. */
const BIRD_HOVER_M = 4;
const BIRD_WINDUP_DROP_M = 3.2;
/** Resting heights of ground placeholders (meters). */
const HATCHLING_Y_M = 0.14;
const CRAB_Y_M = 0.08;
const HERON_Y_M = 0.65;
/** Safe hatchlings sink into the sand/water at this speed. */
const SINK_SPEED_M = 0.25;
const SINK_HIDDEN_Y_M = -0.3;
/** Scare ring animation lifetime (seconds). */
const RING_LIFE_SEC = 0.28;
const RING_POOL_SIZE = 4;

const COLORS = {
  horizon: HORIZON_COLOR,
  hatchling: 0x3fae5c,
  crab: 0xd8cbb0,
  bird: 0x6b5b4a,
  birdThroat: 0xc4362c,
  heron: 0x828a96,
  telegraph: 0x4a2018,
  ringHit: 0x8fd07a,
  ringMiss: 0x9aa0a8,
  ringNoEnergy: 0xff6b5e,
} as const;

const RING_COLOR: Record<ScareFeedbackKind, number> = {
  hit: COLORS.ringHit,
  miss: COLORS.ringMiss,
  "no-energy": COLORS.ringNoEnergy,
};

export interface LevelRendererOptions {
  config: LevelConfig;
  seed: number;
  rng: Rng;
  /** Simulated seconds to fast-forward before the first render (?t= debug). */
  fastForwardSec?: number;
}

interface TelegraphEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface RingEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  ageSec: number;
  active: boolean;
}

export class LevelRenderer {
  private readonly container: HTMLElement;
  private readonly config: LevelConfig;
  private readonly world: WorldConfig;
  private readonly sim: Simulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hud: HudOverlay;
  private readonly envLayers: EnvLayer[];
  private readonly resizeObserver: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private accumulator = 0;

  // Shared geometry/material set (never allocated per frame).
  private readonly geometries = {
    hatchling: new THREE.SphereGeometry(0.2, 10, 8),
    crab: new THREE.BoxGeometry(0.42, 0.16, 0.3),
    bird: new THREE.ConeGeometry(0.4, 1.1, 4),
    birdThroat: new THREE.SphereGeometry(0.12, 8, 6),
    heron: new THREE.CylinderGeometry(0.12, 0.18, 1.3, 8),
    telegraph: new THREE.CircleGeometry(1, 24),
    ring: new THREE.RingGeometry(0.86, 1, 32),
  } as const;

  private readonly materials = {
    hatchling: new THREE.MeshStandardMaterial({ color: COLORS.hatchling, roughness: 0.8 }),
    crab: new THREE.MeshStandardMaterial({ color: COLORS.crab, roughness: 0.9 }),
    bird: new THREE.MeshStandardMaterial({ color: COLORS.bird, roughness: 0.7, emissive: 0x352b20 }),
    birdThroat: new THREE.MeshStandardMaterial({
      color: COLORS.birdThroat,
      roughness: 0.6,
      emissive: 0x501408,
    }),
    heron: new THREE.MeshStandardMaterial({ color: COLORS.heron, roughness: 0.85, emissive: 0x12161c }),
  } as const;

  // Entity pools keyed by sim ids.
  private readonly hatchlingMeshes = new Map<number, THREE.Mesh>();
  private readonly predatorMeshes = new Map<string, THREE.Mesh>();
  private readonly telegraphEntries = new Map<string, TelegraphEntry>();
  private readonly rings: RingEntry[] = [];
  private nextRingIndex = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly onPointerDown = (event: PointerEvent): void => this.handlePointerDown(event);

  constructor(container: HTMLElement, options: LevelRendererOptions) {
    this.container = container;
    this.config = options.config;
    this.world = options.config.world;
    this.sim = new Simulation(options.config, options.rng);

    // Debug viewport pin (?w=<px>&h=<px>): headless Chrome clamps the window
    // to 500px wide, so phone-sized screenshots crop a 500px layout. Pinning
    // the container gives a true 390px portrait layout for screenshots.
    const debugParams = new URLSearchParams(window.location.search);
    const debugW = Number(debugParams.get("w"));
    const debugH = Number(debugParams.get("h"));
    if (Number.isFinite(debugW) && debugW > 0) this.container.style.width = `${debugW}px`;
    if (Number.isFinite(debugH) && debugH > 0) this.container.style.height = `${debugH}px`;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // r186: PCFShadowMap performs the soft filtering (PCFSoftShadowMap is deprecated).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Fog matched to the sky horizon so the sea blends into the sky at distance.
    this.scene.background = new THREE.Color(COLORS.horizon);
    this.scene.fog = new THREE.Fog(COLORS.horizon, 60, 260);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

    this.buildLights();
    this.envLayers = this.buildEnvironment();
    for (const layer of this.envLayers) this.scene.add(layer.group);
    this.buildRings();

    this.hud = new HudOverlay(container);
    this.hud.setEnergySegments(options.config.energy.max, options.config.energy.scareCost);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    // ?t=<sec> debug fast-forward, before the first rendered frame.
    if (options.fastForwardSec !== undefined && options.fastForwardSec > 0) {
      while (this.sim.elapsed < options.fastForwardSec && !this.sim.finished) {
        this.sim.update(FIXED_STEP_SEC);
      }
    }

    this.renderer.setAnimationLoop(this.frame);
    this.timer.connect(document);
  }

  // --- static scene (built once) ---

  private buildLights(): void {
    // Cool moonlit sky over warm dark sand.
    const hemi = new THREE.HemisphereLight(0x33486b, 0x52452e, 2.2);
    this.scene.add(hemi);

    // Moon over the sea (azimuth 0, matching the sky disc and glitter path;
    // elevation raised above the disc for usable shadow angles).
    const moon = new THREE.DirectionalLight(0xbfcfe8, 6.5);
    moon.position.set(0, 68, -145);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -16;
    moon.shadow.camera.right = 16;
    moon.shadow.camera.top = 24;
    moon.shadow.camera.bottom = -24;
    moon.shadow.camera.near = 60;
    moon.shadow.camera.far = 320;
    moon.shadow.bias = -0.0004;
    this.scene.add(moon);
    this.scene.add(moon.target);
  }

  /** Build the static night environment (sky, ocean, sand, props). */
  private buildEnvironment(): EnvLayer[] {
    const seaZ = seaLineZ(this.world);
    return [
      createSky({ seed: this.configHashSeed() }),
      createOcean({
        seaLineZ: seaZ,
        moonDir: new THREE.Vector3(0, 0.38, -0.925).normalize(),
      }),
      createSand({ world: this.world }),
      createProps({
        world: this.world,
        predators: this.config.predators,
        seed: this.configHashSeed() ^ 0x9e3779b9,
      }),
    ];
  }

  /** Deterministic seed for visual-only randomness (stars, prop scatter). */
  private configHashSeed(): number {
    // Level id hash so screenshots stay deterministic per level.
    let hash = 2166136261;
    for (let i = 0; i < this.config.id.length; i++) {
      hash ^= this.config.id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private buildRings(): void {
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geometries.ring, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, material, ageSec: 0, active: false });
    }
  }

  // --- entity pools ---

  private hatchlingMesh(id: number): THREE.Mesh {
    let mesh = this.hatchlingMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(this.geometries.hatchling, this.materials.hatchling);
      mesh.scale.set(1, 0.65, 1); // dome
      mesh.castShadow = true;
      mesh.position.y = HATCHLING_Y_M;
      this.scene.add(mesh);
      this.hatchlingMeshes.set(id, mesh);
    }
    return mesh;
  }

  private predatorMesh(p: Predator): THREE.Mesh {
    let mesh = this.predatorMeshes.get(p.id);
    if (!mesh) {
      const geometry =
        p.kind === "ghostCrab"
          ? this.geometries.crab
          : p.kind === "frigatebird"
            ? this.geometries.bird
            : this.geometries.heron;
      const material =
        p.kind === "ghostCrab"
          ? this.materials.crab
          : p.kind === "frigatebird"
            ? this.materials.bird
            : this.materials.heron;
      mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      if (p.kind === "frigatebird") {
        // Cone tip points toward the sea (-Z); red throat pouch dot so the
        // silhouette reads as a frigatebird even before the V3 model.
        mesh.rotation.x = -Math.PI / 2;
        const throat = new THREE.Mesh(
          this.geometries.birdThroat,
          this.materials.birdThroat,
        );
        throat.position.set(0, 0.35, -0.16);
        mesh.add(throat);
      }
      this.scene.add(mesh);
      this.predatorMeshes.set(p.id, mesh);
    }
    return mesh;
  }

  private telegraphEntry(id: string): TelegraphEntry {
    let entry = this.telegraphEntries.get(id);
    if (!entry) {
      const material = new THREE.MeshBasicMaterial({
        color: COLORS.telegraph,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geometries.telegraph, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      entry = { mesh, material };
      this.telegraphEntries.set(id, entry);
    }
    return entry;
  }

  // --- per-frame sync ---

  private syncHatchlings(dt: number): void {
    for (const h of this.sim.hatchlings) {
      const mesh = this.hatchlingMesh(h.id);
      if (h.state === "caught") {
        mesh.visible = false;
        continue;
      }
      const ground = simToWorld(h.x, h.y, this.world);
      mesh.position.x = ground.x;
      mesh.position.z = ground.z;
      if (h.state === "safe") {
        // Sink into the water; hide once fully below the sea plane.
        mesh.position.y = Math.max(SINK_HIDDEN_Y_M, mesh.position.y - SINK_SPEED_M * dt);
        mesh.visible = mesh.position.y > SINK_HIDDEN_Y_M;
      } else {
        mesh.position.y = HATCHLING_Y_M;
        mesh.visible = true;
      }
    }
  }

  private syncPredators(): void {
    for (const p of this.sim.predators) {
      const mesh = this.predatorMesh(p);
      const ground = simToWorld(p.x, p.y, this.world);
      switch (p.kind) {
        case "ghostCrab":
          // Idle crabs are hidden inside the burrow.
          mesh.visible = p.state !== "idle";
          mesh.position.set(ground.x, CRAB_Y_M, ground.z);
          break;
        case "frigatebird": {
          let hover = BIRD_HOVER_M;
          if (p.state === "windup" && p.tunables.kind === "frigatebird") {
            const progress = Math.min(1, Math.max(0, 1 - p.cooldown / p.tunables.windupSec));
            hover = BIRD_HOVER_M - BIRD_WINDUP_DROP_M * progress;
          }
          mesh.position.set(ground.x, hover, ground.z);
          break;
        }
        case "lavaHeron":
          mesh.position.set(ground.x, HERON_Y_M, ground.z);
          break;
      }
      this.syncTelegraph(p);
    }
  }

  /** Dive/lunge telegraph: dark translucent ground disc growing over the windup. */
  private syncTelegraph(p: Predator): void {
    const tele = diveTelegraph(p);
    if (!tele) {
      const entry = this.telegraphEntries.get(p.id);
      if (entry) entry.mesh.visible = false;
      return;
    }
    const entry = this.telegraphEntry(p.id);
    const ground = simToWorld(tele.x, tele.y, this.world);
    entry.mesh.position.set(ground.x, 0.03, ground.z);
    entry.mesh.scale.setScalar(Math.max(0.05, tele.radius * SCALE_M_PER_PX));
    entry.material.opacity = tele.alpha;
    entry.mesh.visible = true;
  }

  private syncRings(dt: number): void {
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.ageSec += dt;
      if (ring.ageSec >= RING_LIFE_SEC) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      const progress = ring.ageSec / RING_LIFE_SEC;
      const eased = 1 - (1 - progress) * (1 - progress);
      ring.mesh.scale.setScalar(ring.mesh.scale.x * (1 + 0.45 * dt / RING_LIFE_SEC));
      ring.material.opacity = 0.9 * (1 - eased);
    }
  }

  // --- input ---

  private handlePointerDown(event: PointerEvent): void {
    if (this.sim.finished) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = rayToGround(this.raycaster.ray.origin, this.raycaster.ray.direction);
    if (!hit) return;
    const simPoint = worldToSim(hit.x, hit.z, this.world);
    const result = this.sim.scare(simPoint.x, simPoint.y);
    const feedback = scareFeedback(result);

    // Ground ring at the tapped point.
    const ring = this.rings[this.nextRingIndex];
    this.nextRingIndex = (this.nextRingIndex + 1) % this.rings.length;
    ring.ageSec = 0;
    ring.active = true;
    ring.mesh.position.set(hit.x, 0.04, hit.z);
    ring.mesh.scale.setScalar(this.config.energy.scareRadius * SCALE_M_PER_PX);
    ring.material.color.setHex(RING_COLOR[feedback.kind]);
    ring.material.opacity = 0.9;
    ring.mesh.visible = true;

    // Floating label in the HTML overlay.
    const localX = event.clientX - this.container.getBoundingClientRect().left;
    const localY = event.clientY - this.container.getBoundingClientRect().top;
    this.hud.showFloatingLabel(feedback.label, feedback.kind, localX, localY);
  }

  // --- events / loop / resize ---

  private handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === "level-ended") {
        this.hud.showOutcome(event.outcome, event.rate, event.score);
      }
    }
  }

  private readonly frame = (): void => {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME_SEC);
    if (!this.sim.finished) {
      this.accumulator = Math.min(this.accumulator + dt, MAX_FRAME_SEC);
      while (this.accumulator >= FIXED_STEP_SEC) {
        this.sim.update(FIXED_STEP_SEC);
        this.accumulator -= FIXED_STEP_SEC;
      }
    }
    this.handleEvents(this.sim.drainEvents());
    const timeSec = this.timer.getElapsed();
    for (const layer of this.envLayers) layer.update(timeSec);
    this.syncHatchlings(dt);
    this.syncPredators();
    this.syncRings(dt);
    // One defensive-copy read per frame (snapshot discipline from F2).
    const counts = this.sim.counts;
    this.hud.update(
      energyBar(this.sim.energy, this.config.energy),
      ecosystemMeter(counts, this.config.hatchlings, this.config.healthyBand),
      { safe: counts.safe, total: this.config.hatchlings },
    );
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.applyCamera(width / height);
  }

  private applyCamera(aspect: number): void {
    const rig = cameraRig(aspect, this.world);
    this.camera.aspect = aspect;
    this.camera.fov = rig.fov;
    this.camera.position.set(rig.position.x, rig.position.y, rig.position.z);
    this.camera.lookAt(rig.target.x, rig.target.y, rig.target.z);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.timer.disconnect();
    this.timer.dispose();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.hud.dispose();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    for (const layer of this.envLayers) layer.dispose();
    for (const entry of this.telegraphEntries.values()) entry.material.dispose();
    for (const ring of this.rings) ring.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
